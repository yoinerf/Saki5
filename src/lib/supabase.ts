import { createClient } from '@supabase/supabase-js'
// Generado con: supabase gen types typescript --linked --schema public > src/lib/database.types.ts
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Se lee ANTES de crear el cliente: supabase-js limpia el hash de la URL al procesarlo.
// El enlace de "restablecer contraseña" llega como #access_token=...&type=recovery
// y, si expiró, como #error=access_denied&error_code=otp_expired&error_description=...
const initialHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
export const authRedirectInfo = {
  isRecovery: initialHash.get('type') === 'recovery',
  error: initialHash.get('error_description')?.replace(/\+/g, ' ') ?? null,
}

// URL a la que Supabase redirige desde los correos (debe estar en Auth → URL Configuration)
export const authRedirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`

// La base rechaza con 401 'session_revoked' los tokens de sesiones cerradas o revocadas (cerró sesión en
// otro dispositivo, cambió la contraseña, cuenta bloqueada o eliminada): se cierra también aquí.
const fetchWithSessionCheck: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (response.status === 401 && url.includes('/rest/v1/')) {
    response
      .clone()
      .json()
      .then((body: { code?: string } | null) => {
        if (body?.code === 'session_revoked') void supabase.auth.signOut({ scope: 'local' })
      })
      .catch(() => {})
  }
  return response
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, { global: { fetch: fetchWithSessionCheck } })
