// Rate limiting para las Edge Functions.
// El contador vive en Postgres (public.check_rate_limit, migración 20261026120000_rate_limiting) porque
// cada invocación puede correr en una instancia distinta: un contador en memoria no serviría.
//
// Si la base no responde (o la migración aún no se aplicó) la solicitud se PERMITE y se registra el
// error: un fallo del limitador no debe dejar sin servicio a los administradores.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Cliente con la service role key, sin tipos de la base */
// deno-lint-ignore no-explicit-any
export type AdminClient = SupabaseClient<any, any, any, any, any>

export interface RateLimitRule {
  /** Identifica qué se limita, p. ej. "admin-users:ip:1.2.3.4" */
  key: string
  /** Solicitudes permitidas por ventana */
  max: number
  /** Duración de la ventana en segundos */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter: number
}

/** IP del cliente según el proxy de Supabase (primer valor de x-forwarded-for) */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'desconocida'
}

/** Cuenta la solicitud en cada regla; basta con que una se supere para rechazarla */
export async function checkRateLimits(admin: AdminClient, rules: RateLimitRule[]): Promise<RateLimitResult> {
  let retryAfter = 0
  for (const rule of rules) {
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: rule.key.slice(0, 200),
      p_max: rule.max,
      p_window_seconds: rule.windowSeconds,
    })
    if (error) {
      console.error('rate limit:', rule.key, error.message)
      continue
    }
    if (data && data.allowed === false) retryAfter = Math.max(retryAfter, Number(data.retry_after) || 1)
  }
  return { allowed: retryAfter === 0, retryAfter }
}

/** Respuesta 429 con Retry-After */
export function tooManyRequests(retryAfter: number, headers: Record<string, string> = {}) {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return new Response(
    JSON.stringify({ error: `Demasiadas solicitudes. Intenta de nuevo en ${minutes} minuto(s).` }),
    { status: 429, headers: { ...headers, 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) } },
  )
}
