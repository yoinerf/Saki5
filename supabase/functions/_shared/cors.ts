// CORS de las Edge Functions que llama el navegador.
// Orígenes permitidos: secret ALLOWED_ORIGINS (separados por coma). Sin el secret se usan los del sitio
// publicado (antes, sin el secret se respondía "*" a cualquier origen). Las vistas previas de Azure
// Static Web Apps y localhost se aceptan siempre para no romper los entornos de prueba.

const DEFAULT_ORIGINS = 'https://www.saki5.com,https://saki5.com'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || DEFAULT_ORIGINS)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function isPreviewOrigin(origin: string) {
  return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.azurestaticapps\.net$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = ALLOWED_ORIGINS.includes(origin) || isPreviewOrigin(origin)
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
