// Edge Function: admin-users
// Operaciones de usuarios que requieren la service role key. La llave vive SOLO
// aquí (Supabase la inyecta como variable de entorno); nunca llega al navegador.
//
// Acciones (POST con JSON { action, ... }):
//   - create_user        { email, password, first_name, last_name?, org_name?, phone?, user_type, store?, department?, municipality?, document_type, document_number, must_change_password? }
//   - delete_user        { user_id }
//   - set_temp_password  { user_id, password }
//
// Seguridad (el rol y la tienda de quien llama se leen de profiles, nunca del cuerpo):
//   - admin (superadmin): todas las acciones, sobre cualquier usuario.
//   - admin_tienda: create_user (siempre rol 'asociacion' y SU tienda, se ignora lo que
//     envíe el cliente) y delete_user (solo productores de su tienda, validado en la BD
//     con can_store_admin_manage). No puede asignar contraseñas temporales.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkRateLimits, clientIp, tooManyRequests, type AdminClient } from '../_shared/rateLimit.ts'
import { corsHeaders } from '../_shared/cors.ts'

const USER_TYPES = ['asociacion', 'turismo', 'comprador', 'admin', 'admin_tienda']
// Roles que pertenecen a una tienda (profiles.store); el resto queda en 'campo'
const STORE_ROLES = ['asociacion', 'admin_tienda']
const MIN_PASSWORD_LENGTH = 8
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Rate limit (solicitudes por ventana). Holgado para el uso normal de un panel de administración.
const IP_LIMIT = { max: 60, windowSeconds: 60 }
const CALLER_LIMIT = { max: 30, windowSeconds: 60 }
// Por acción y por administrador: frena la creación o el borrado masivo con una sesión robada
const ACTION_LIMITS: Record<string, { max: number; windowSeconds: number }> = {
  create_user: { max: 30, windowSeconds: 3600 },
  delete_user: { max: 30, windowSeconds: 3600 },
  set_temp_password: { max: 10, windowSeconds: 3600 },
}

function validPassword(password: unknown): password is string {
  return typeof password === 'string'
    && password.length >= MIN_PASSWORD_LENGTH
    && /[A-Za-z]/.test(password)
    && /\d/.test(password)
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// Documento de identidad: mismas reglas que src/lib/identity.ts y el check de profiles
const DOCUMENT_TYPES = ['CC', 'CE', 'TI', 'PPT', 'PAS', 'NIT']

function parseDocument(type: unknown, rawNumber: unknown): { type: string; number: string } | { error: string } {
  const docType = typeof type === 'string' ? type.trim().toUpperCase() : ''
  if (!DOCUMENT_TYPES.includes(docType)) return { error: 'Tipo de documento inválido.' }
  const number = typeof rawNumber === 'string' ? rawNumber.replace(/[\s.]/g, '').toUpperCase() : ''
  const valid = docType === 'CC' || docType === 'TI'
    ? /^\d{5,12}$/.test(number)
    : docType === 'NIT'
      ? /^\d{8,12}(-\d)?$/.test(number)
      : /^[A-Z0-9]{4,20}$/.test(number)
  return valid ? { type: docType, number } : { error: 'Número de documento inválido.' }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // 0. Rate limit por IP, antes de consultar Auth
  const ipLimit = await checkRateLimits(admin, [{ key: `admin-users:ip:${clientIp(req)}`, ...IP_LIMIT }])
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfter, cors)

  // 1. Identificar a quien llama a partir de su sesión
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user: caller }, error: callerError } = await userClient.auth.getUser()
  if (callerError || !caller) return json({ error: 'Sesión inválida. Vuelve a iniciar sesión.' }, 401)

  // 2. Rol y tienda de quien llama (con la service key, sin depender de RLS)
  const { data: callerProfile } = await admin.from('profiles').select('user_type, store').eq('id', caller.id).single()
  const isSuperAdmin = callerProfile?.user_type === 'admin'
  const isStoreAdmin = callerProfile?.user_type === 'admin_tienda' && !!callerProfile?.store
  if (!isSuperAdmin && !isStoreAdmin) return json({ error: 'Solo un administrador puede realizar esta acción.' }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400)
  }

  // 3. Rate limit por administrador y por acción
  const action = typeof body.action === 'string' ? body.action : ''
  const callerLimit = await checkRateLimits(admin, [
    { key: `admin-users:user:${caller.id}`, ...CALLER_LIMIT },
    ...(ACTION_LIMITS[action] ? [{ key: `admin-users:${action}:${caller.id}`, ...ACTION_LIMITS[action] }] : []),
  ])
  if (!callerLimit.allowed) return tooManyRequests(callerLimit.retryAfter, cors)

  try {
    switch (action) {
      // ─── Crear usuario ────────────────────────────────────────────────────
      case 'create_user': {
        const email = clean(body.email)?.toLowerCase()
        const firstName = clean(body.first_name)
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Correo electrónico inválido.' }, 400)
        if (!firstName) return json({ error: 'El nombre es obligatorio.' }, 400)
        if (!clean(body.municipality)) return json({ error: 'La ciudad o municipio es obligatoria.' }, 400)
        if (!validPassword(body.password)) {
          return json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres, con letras y números.` }, 400)
        }

        // El admin de tienda siempre crea productores ('asociacion') de SU tienda
        let userType: string
        let store: string
        if (isStoreAdmin) {
          userType = 'asociacion'
          store = callerProfile!.store
        } else {
          userType = String(body.user_type ?? '')
          if (!USER_TYPES.includes(userType)) return json({ error: 'Rol inválido.' }, 400)
          store = STORE_ROLES.includes(userType) ? String(body.store ?? 'campo') : 'campo'
          const { data: storeRow } = await admin.from('store_settings').select('store').eq('store', store).maybeSingle()
          if (!storeRow) return json({ error: 'Tienda inválida.' }, 400)
        }

        // WhatsApp: solo números, máximo 10
        const phone = clean(body.phone)
        if (phone && !/^\d{1,10}$/.test(phone)) return json({ error: 'El WhatsApp debe tener solo números (máximo 10).' }, 400)

        const document = parseDocument(body.document_type, body.document_number)
        if ('error' in document) return json({ error: document.error }, 400)

        const profileData = {
          first_name: firstName,
          last_name: clean(body.last_name) ?? '',
          org_name: clean(body.org_name),
          phone,
          user_type: userType,
          department: clean(body.department),
          municipality: clean(body.municipality),
          document_type: document.type,
          document_number: document.number,
        }

        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: {
            ...profileData,
            // El usuario deberá crear su propia contraseña al primer ingreso
            must_change_password: body.must_change_password !== false,
          },
        })
        if (createError || !created.user) {
          const msg = createError?.message ?? ''
          if (/already been registered|already exists/i.test(msg)) return json({ error: 'Ya existe un usuario con ese correo.' }, 400)
          console.error('admin-users create_user:', msg)
          return json({ error: 'No se pudo crear el usuario.' }, 400)
        }

        // Rol y tienda van al perfil con la service key (handle_new_user solo acepta roles públicos)
        const { error: profileError } = await admin.from('profiles').upsert({ id: created.user.id, email, ...profileData, store })
        if (profileError) {
          // Revertir para no dejar un usuario de Auth sin perfil
          await admin.auth.admin.deleteUser(created.user.id)
          console.error('admin-users create_user profile:', profileError.message)
          return json({ error: 'No se pudo crear el perfil del usuario.' }, 400)
        }

        // La marca que hace cumplir el cambio vive en la base (user_metadata la puede editar el usuario)
        if (body.must_change_password !== false) await markPasswordChange(admin, created.user.id)

        return json({ ok: true, user_id: created.user.id })
      }

      // ─── Eliminar usuario ─────────────────────────────────────────────────
      case 'delete_user': {
        const userId = clean(body.user_id)
        if (!userId || !UUID_RE.test(userId)) return json({ error: 'Usuario inválido.' }, 400)
        if (userId === caller.id) return json({ error: 'No puedes eliminar tu propia cuenta.' }, 400)

        // El admin de tienda solo elimina productores de su tienda (lo decide la BD con su sesión)
        if (isStoreAdmin) {
          const { data: allowed, error: checkError } = await userClient.rpc('can_store_admin_manage', { p_user: userId })
          if (checkError || allowed !== true) return json({ error: 'Solo puedes eliminar productores de tu tienda.' }, 403)
        }

        // Borrar en Auth elimina también el perfil (profiles.id ... on delete cascade)
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error) {
          const blocked = /foreign key|violates|restrict/i.test(error.message)
          if (!blocked) console.error('admin-users delete_user:', error.message)
          return json({
            error: blocked
              ? 'No se puede eliminar: el usuario tiene pedidos u otros registros asociados.'
              : 'No se pudo eliminar el usuario.',
          }, 400)
        }
        return json({ ok: true })
      }

      // ─── Contraseña temporal (solo superadmin) ────────────────────────────
      case 'set_temp_password': {
        if (!isSuperAdmin) return json({ error: 'Solo un superadministrador puede asignar contraseñas.' }, 403)
        const userId = clean(body.user_id)
        if (!userId || !UUID_RE.test(userId)) return json({ error: 'Usuario inválido.' }, 400)
        if (!validPassword(body.password)) {
          return json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres, con letras y números.` }, 400)
        }

        const { error } = await admin.auth.admin.updateUserById(userId, {
          password: body.password,
          // App.tsx detecta esta marca al iniciar sesión y obliga a cambiarla
          user_metadata: { must_change_password: true },
        })
        if (error) {
          console.error('admin-users set_temp_password:', error.message)
          return json({ error: 'No se pudo asignar la contraseña.' }, 400)
        }
        await markPasswordChange(admin, userId)
        return json({ ok: true })
      }

      default:
        return json({ error: 'Acción no reconocida.' }, 400)
    }
  } catch (err) {
    console.error('admin-users error:', err)
    return json({ error: 'Error inesperado en el servidor.' }, 500)
  }
})

// Registra que la cuenta tiene una contraseña temporal (public.password_change_required).
// Si falla, la marca de user_metadata sigue funcionando como antes.
async function markPasswordChange(admin: AdminClient, userId: string) {
  const { error } = await admin.rpc('mark_password_change_required', { p_user: userId })
  if (error) console.error('admin-users mark_password_change_required:', error.message)
}
