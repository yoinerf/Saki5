// Edge Function: delete-account
// El usuario elimina su propia cuenta desde "Mi cuenta" (Ley 1581 de 2012: derecho de supresión).
//
// POST { confirm: 'ELIMINAR' } con la sesión del usuario.
//   1. No aplica a administradores (superadmin y admin de tienda): su cuenta la retira otro superadmin.
//   2. Si tiene pedidos en curso (como comprador o como vendedor) se rechaza: primero deben terminar
//      o cancelarse, para no dejar a la otra parte sin con quién hablar.
//   3. Se borran sus publicaciones (productos y experiencias, con sus fotos), favoritos, reseñas,
//      notificaciones, actividad, solicitudes de soporte y documentos de productor.
//   4. Se borra la cuenta de Auth (y el perfil en cascada). Si tiene pedidos terminados, que se deben
//      conservar por obligaciones contables, el perfil se anonimiza y la cuenta de Auth se borra en
//      modo "soft delete" (deja de poder iniciar sesión y Supabase quita sus datos personales).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkRateLimits, clientIp, tooManyRequests, type AdminClient } from '../_shared/rateLimit.ts'
import { corsHeaders } from '../_shared/cors.ts'

const IP_LIMIT = { max: 20, windowSeconds: 3600 }
const USER_LIMIT = { max: 5, windowSeconds: 3600 }

const IMAGE_BUCKETS = { product: 'product-images', experience: 'experience-images' }
const DOCUMENTS_BUCKET = 'producer-documents'

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const ipLimit = await checkRateLimits(admin, [{ key: `delete-account:ip:${clientIp(req)}`, ...IP_LIMIT }])
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfter, cors)

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'Sesión inválida. Vuelve a iniciar sesión.' }, 401)

  const userLimit = await checkRateLimits(admin, [{ key: `delete-account:user:${user.id}`, ...USER_LIMIT }])
  if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfter, cors)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400)
  }
  if (body.confirm !== 'ELIMINAR') return json({ error: 'Escribe ELIMINAR para confirmar.' }, 400)

  try {
    const userId = user.id
    const { data: profile } = await admin.from('profiles').select('user_type').eq('id', userId).maybeSingle()
    if (profile?.user_type === 'admin' || profile?.user_type === 'admin_tienda') {
      return json({ error: 'Las cuentas de administrador las retira un superadministrador.' }, 403)
    }

    // 2. Pedidos en curso (ítems en un estado que no es final)
    const { data: openStatuses } = await admin.from('order_statuses').select('id').eq('is_final', false)
    const openIds = (openStatuses ?? []).map((s) => s.id)
    if (openIds.length > 0) {
      const [{ count: openSales }, { data: myOrders }] = await Promise.all([
        admin.from('order_items').select('id', { count: 'exact', head: true }).eq('seller_id', userId).in('status_id', openIds),
        admin.from('orders').select('id').eq('customer_id', userId),
      ])
      const orderIds = (myOrders ?? []).map((o) => o.id)
      const { count: openPurchases } = orderIds.length
        ? await admin.from('order_items').select('id', { count: 'exact', head: true }).in('order_id', orderIds).in('status_id', openIds)
        : { count: 0 }
      if ((openSales ?? 0) > 0 || (openPurchases ?? 0) > 0) {
        return json({ error: 'Tienes pedidos en curso. Cuando terminen o se cancelen podrás eliminar tu cuenta.' }, 400)
      }
    }

    // 3. Archivos y datos propios
    const [{ data: products }, { data: experiences }, { data: documents }] = await Promise.all([
      admin.from('products').select('id').eq('producer_id', userId),
      admin.from('experiences').select('id').eq('host_id', userId),
      admin.from('producer_documents').select('file_path').eq('producer_id', userId),
    ])
    const productIds = (products ?? []).map((p) => p.id)
    const experienceIds = (experiences ?? []).map((e) => e.id)
    const [{ data: productImages }, { data: variantImages }, { data: experienceImages }] = await Promise.all([
      productIds.length ? admin.from('images').select('storage_path').in('product_id', productIds) : { data: [] },
      productIds.length ? admin.from('product_variants').select('image_storage_path').in('product_id', productIds) : { data: [] },
      experienceIds.length ? admin.from('images').select('storage_path').in('experience_id', experienceIds) : { data: [] },
    ])

    // Las fotos, variantes, reseñas, favoritos y anuncios de las publicaciones van en cascada
    if (productIds.length) await mustSucceed(admin.from('products').delete().in('id', productIds), 'productos')
    if (experienceIds.length) await mustSucceed(admin.from('experiences').delete().in('id', experienceIds), 'experiencias')
    await Promise.all([
      mustSucceed(admin.from('favorites').delete().eq('user_id', userId), 'favoritos'),
      mustSucceed(admin.from('product_reviews').delete().eq('user_id', userId), 'reseñas'),
      mustSucceed(admin.from('user_notifications').delete().eq('user_id', userId), 'notificaciones'),
      mustSucceed(admin.from('activities').delete().eq('user_id', userId), 'actividad'),
      mustSucceed(admin.from('support_tickets').delete().eq('user_id', userId), 'solicitudes'),
      mustSucceed(admin.from('producer_documents').delete().eq('producer_id', userId), 'documentos'),
    ])

    // Storage: si falla, quedan archivos huérfanos que limpia Superadmin → Mantenimiento
    await Promise.all([
      removeFiles(admin, IMAGE_BUCKETS.product, [
        ...(productImages ?? []).map((i) => i.storage_path),
        ...(variantImages ?? []).map((v) => v.image_storage_path),
      ]),
      removeFiles(admin, IMAGE_BUCKETS.experience, (experienceImages ?? []).map((i) => i.storage_path)),
      removeFiles(admin, DOCUMENTS_BUCKET, (documents ?? []).map((d) => d.file_path)),
    ])

    // 4. Cuenta
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (!deleteError) return json({ ok: true, mode: 'deleted' })

    // Pedidos terminados que se conservan: anonimizar el perfil y desactivar la cuenta
    await mustSucceed(admin.from('profiles').update({
      first_name: 'Usuario',
      last_name: 'eliminado',
      org_name: null,
      phone: null,
      email: `eliminado-${userId}@invalid.saki5.com`,
      address: null,
      document_type: null,
      document_number: null,
      department: null,
      municipality: null,
      avatar_path: null,
      user_type: 'comprador',
      manually_verified_at: null,
      manually_verified_by: null,
    }).eq('id', userId), 'perfil')
    // Datos de entrega en los pedidos ya terminados
    await mustSucceed(admin.from('orders').update({ customer_name: 'Usuario eliminado', customer_phone: null, shipping_address: {} }).eq('customer_id', userId), 'pedidos')

    const { error: softError } = await admin.auth.admin.deleteUser(userId, true)
    if (softError) throw new Error(`auth soft delete: ${softError.message}`)
    return json({ ok: true, mode: 'anonymized' })
  } catch (err) {
    console.error('delete-account:', err)
    return json({ error: 'No se pudo eliminar la cuenta. Escríbenos a contacto@saki5.com.' }, 500)
  }
})

async function mustSucceed(query: PromiseLike<{ error: { message: string } | null }>, what: string) {
  const { error } = await query
  if (error) throw new Error(`${what}: ${error.message}`)
}

async function removeFiles(admin: AdminClient, bucket: string, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(unique.slice(i, i + 100))
    if (error) console.error('delete-account storage:', bucket, error.message)
  }
}
