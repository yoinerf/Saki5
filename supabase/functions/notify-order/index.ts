// Edge Function: notify-order
// Envía un WhatsApp (WhatsApp Cloud API de Meta) a cada vendedor de un pedido nuevo.
//
// Se dispara con un Database Webhook de Supabase en INSERT sobre public.orders
// (payload { type, table, record }). También acepta { order_id } para reenviar.
// Un mensaje por vendedor, con solo sus productos. Cada ítem queda marcado en
// order_items.whatsapp_notified_at (o whatsapp_notify_error si falló).
//
// Secrets (Edge Functions → Secrets):
//   WHATSAPP_TOKEN            Token permanente del System User de Meta
//   WHATSAPP_PHONE_NUMBER_ID  "Phone number ID" del número emisor
//   NOTIFY_WEBHOOK_SECRET     Clave compartida con el Database Webhook (header x-webhook-secret)
//   WHATSAPP_TEMPLATE_NAME    (opcional) por defecto "nuevo_pedido"
//   WHATSAPP_TEMPLATE_LANG    (opcional) por defecto "es"
//   WHATSAPP_API_VERSION      (opcional) por defecto "v22.0"
//   DEFAULT_COUNTRY_CODE      (opcional) por defecto "57" (Colombia)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkRateLimits, clientIp, tooManyRequests } from '../_shared/rateLimit.ts'

const PAYMENT_LABELS: Record<string, string> = {
  CashOnDelivery: 'Contraentrega',
  Online: 'Pago en línea',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Los parámetros de plantilla no admiten saltos de línea, tabs ni más de 4 espacios seguidos, ni texto vacío
function param(value: unknown, max = 300) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return { type: 'text', text: (text || '-').slice(0, max) }
}

function formatPrice(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('es-CO')} COP`
}

// "300 123 4567" → "573001234567" (formato internacional sin "+")
function normalizePhone(raw: string | null | undefined, countryCode: string) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10 && digits.startsWith('3')) return countryCode + digits
  if (digits.startsWith(countryCode) && digits.length > 10) return digits
  if (digits.length >= 11) return digits
  return null
}

// Rate limit: por IP antes de validar el secreto (frena la fuerza bruta) y por pedido (cada reenvío
// manda WhatsApp pagos a los vendedores)
const IP_LIMIT = { max: 60, windowSeconds: 60 }
const ORDER_LIMIT = { max: 5, windowSeconds: 3600 }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Comparación en tiempo constante: no filtra el secreto por tiempos de respuesta
function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const ipLimit = await checkRateLimits(admin, [{ key: `notify-order:ip:${clientIp(req)}`, ...IP_LIMIT }])
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfter)

  // Solo el Database Webhook (o quien tenga la clave) puede invocarla
  const expectedSecret = Deno.env.get('NOTIFY_WEBHOOK_SECRET')
  if (!expectedSecret || !safeEqual(req.headers.get('x-webhook-secret') ?? '', expectedSecret)) {
    return json({ error: 'No autorizado' }, 401)
  }

  const token = Deno.env.get('WHATSAPP_TOKEN')
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  if (!token || !phoneNumberId) return json({ error: 'Faltan los secrets de WhatsApp' }, 500)
  const templateName = Deno.env.get('WHATSAPP_TEMPLATE_NAME') ?? 'nuevo_pedido'
  const templateLang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'es'
  const apiVersion = Deno.env.get('WHATSAPP_API_VERSION') ?? 'v22.0'
  const countryCode = Deno.env.get('DEFAULT_COUNTRY_CODE') ?? '57'

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida' }, 400)
  }
  const orderId: string | undefined = body?.record?.id ?? body?.order_id
  if (!orderId || typeof orderId !== 'string' || !UUID_RE.test(orderId)) return json({ error: 'Falta el pedido' }, 400)

  const orderLimit = await checkRateLimits(admin, [{ key: `notify-order:order:${orderId}`, ...ORDER_LIMIT }])
  if (!orderLimit.allowed) return tooManyRequests(orderLimit.retryAfter)

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, customer_name, customer_phone, shipping_address, payment_method, created_at')
    .eq('id', orderId)
    .single()
  if (orderError || !order) return json({ error: 'Pedido no encontrado' }, 404)

  // Los ítems se guardan en la misma transacción; se reintenta por si llegan un instante después
  let items: any[] = []
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await admin
      .from('order_items')
      .select('id, seller_id, title, quantity, total, seller:profiles(first_name, org_name, phone)')
      .eq('order_id', orderId)
      .is('whatsapp_notified_at', null)
    items = data ?? []
    if (items.length > 0) break
    await sleep(1500)
  }
  if (items.length === 0) return json({ ok: true, sent: 0, message: 'Sin ítems pendientes por notificar' })

  // Agrupar por vendedor
  const bySeller = new Map<string, any[]>()
  for (const it of items) {
    if (!it.seller_id) continue
    const list = bySeller.get(it.seller_id) ?? []
    list.push(it)
    bySeller.set(it.seller_id, list)
  }

  const addr = order.shipping_address ?? {}
  const address = [addr.address, addr.municipality, addr.department ? `(${addr.department})` : null].filter(Boolean).join(', ')
  const customer = [order.customer_name, order.customer_phone ? `Tel ${order.customer_phone}` : null].filter(Boolean).join(' - ')
  const shortId = `#${String(order.id).slice(0, 8).toUpperCase()}`
  const results: { seller_id: string; ok: boolean; error?: string }[] = []

  for (const [sellerId, sellerItems] of bySeller) {
    const seller = sellerItems[0].seller
    const itemIds = sellerItems.map((i) => i.id)
    const to = normalizePhone(seller?.phone, countryCode)

    if (!to) {
      await admin.from('order_items').update({ whatsapp_notify_error: 'El vendedor no tiene un WhatsApp válido registrado' }).in('id', itemIds)
      results.push({ seller_id: sellerId, ok: false, error: 'Sin teléfono' })
      continue
    }

    const products = sellerItems.map((i) => `${i.quantity} x ${i.title}`).join(', ')
    const sellerTotal = sellerItems.reduce((s, i) => s + Number(i.total), 0)

    // Orden de variables = plantilla "nuevo_pedido" ({{1}}..{{7}})
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [{
          type: 'body',
          parameters: [
            param(seller?.org_name || seller?.first_name || 'productor', 60),
            param(shortId),
            param(products, 500),
            param(formatPrice(sellerTotal)),
            param(customer || 'Cliente', 120),
            param(address || 'Sin dirección', 200),
            param(PAYMENT_LABELS[order.payment_method] ?? order.payment_method),
          ],
        }],
      },
    }

    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const resBody = await res.json().catch(() => ({}))

    if (res.ok) {
      await admin.from('order_items').update({ whatsapp_notified_at: new Date().toISOString(), whatsapp_notify_error: null }).in('id', itemIds)
      results.push({ seller_id: sellerId, ok: true })
    } else {
      const error = resBody?.error?.message ?? `HTTP ${res.status}`
      console.error('WhatsApp error', sellerId, JSON.stringify(resBody))
      await admin.from('order_items').update({ whatsapp_notify_error: String(error).slice(0, 500) }).in('id', itemIds)
      results.push({ seller_id: sellerId, ok: false, error })
    }
  }

  return json({ ok: true, sent: results.filter((r) => r.ok).length, results })
})
