import { supabase } from './supabase'
import { PAYMENT_METHOD_LABELS } from './stores'
import { PLACEHOLDER_IMG, type ShippingAddress } from './catalog'

export { PAYMENT_METHOD_LABELS }

// ─── Pedidos del comprador ──────────────────────────────────────────────────

export interface BuyerOrderItem {
  id: string
  title: string
  img: string | null
  /** Combinación comprada (productos con variantes) */
  variant_label?: string | null
  quantity: number
  unit_price: number
  total: number
  status_id: number
  product_id: string | null
  experience_id: string | null
  created_at: string
}

export interface BuyerOrder {
  id: string
  status_id: number
  payment_method: string
  payment_status: string
  // Tienda del pedido (store_settings.store). El comprador usa la misma cuenta en todas.
  store?: string
  customer_name: string | null
  customer_phone: string | null
  shipping_address: ShippingAddress | null
  subtotal: number
  shipping_fee: number
  total: number
  created_at: string
  updated_at: string
  items: BuyerOrderItem[]
}

export async function fetchMyOrders(userId: string): Promise<BuyerOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(id, title, img, variant_label, quantity, unit_price, total, status_id, product_id, experience_id, created_at)')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
  if (error) console.error('Error cargando pedidos:', error.message)
  return (data ?? []) as BuyerOrder[]
}

export const PAYMENT_STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  Pending: { label: 'Pendiente', bg: '#FFF1E0', color: '#C4622D' },
  Paid: { label: 'Pagado', bg: '#EAF3EC', color: '#205134' },
  Failed: { label: 'Fallido', bg: '#FEE9E1', color: '#C53030' },
  Refunded: { label: 'Reembolsado', bg: '#F3ECE2', color: '#7A5C3A' },
}

// ─── Favoritos ──────────────────────────────────────────────────────────────

export interface FavoriteRow {
  id: string
  product_id: string | null
  experience_id: string | null
  created_at: string
  product: { id: string; title: string; price: number; unit: string | null; producer: string | null; stock: string | null; store?: string; images: { image_url: string; is_primary: boolean }[] } | null
  experience: { id: string; title: string; price: number; host: string | null; images: { image_url: string; is_primary: boolean }[] } | null
}

export async function fetchFavorites(userId: string): Promise<FavoriteRow[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('id, product_id, experience_id, created_at, product:products(id, title, price, unit, producer, stock, store, images(image_url, is_primary)), experience:experiences(id, title, price, host, images(image_url, is_primary))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) console.error('Error cargando favoritos:', error.message)
  return (data ?? []) as unknown as FavoriteRow[]
}

export async function isFavorite(userId: string, productId: string) {
  const { data } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .maybeSingle()
  return !!data
}

export async function addFavorite(userId: string, productId: string) {
  return supabase.from('favorites').insert({ user_id: userId, product_id: productId })
}

export async function removeFavorite(userId: string, productId: string) {
  return supabase.from('favorites').delete().eq('user_id', userId).eq('product_id', productId)
}

export async function removeFavoriteById(id: string) {
  return supabase.from('favorites').delete().eq('id', id)
}

export function primaryImage(images?: { image_url: string; is_primary: boolean }[] | null) {
  return images?.find((i) => i.is_primary)?.image_url || images?.[0]?.image_url || PLACEHOLDER_IMG
}

// ─── Solicitudes y reportes ─────────────────────────────────────────────────

export type TicketType = 'problema' | 'solicitud'
export type TicketStatus = 'abierto' | 'en_revision' | 'resuelto' | 'cerrado'

export interface SupportTicket {
  id: string
  user_id: string
  order_id: string | null
  order_item_id: string | null
  type: TicketType
  category: string
  subject: string
  description: string
  status: TicketStatus
  admin_response: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  customer?: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null
}

export const TICKET_CATEGORIES: Record<TicketType, string[]> = {
  problema: [
    'El pedido no llegó',
    'Producto en mal estado',
    'Producto incorrecto o incompleto',
    'Demora en la entrega',
    'Problema con el pago',
    'Otro problema',
  ],
  solicitud: [
    'Cancelar pedido',
    'Cambiar dirección de entrega',
    'Devolución o reembolso',
    'Factura o comprobante',
    'Información de un producto',
    'Otra solicitud',
  ],
}

export const TICKET_STATUS: Record<TicketStatus, { label: string; bg: string; color: string }> = {
  abierto: { label: 'Abierto', bg: '#FFF1E0', color: '#C4622D' },
  en_revision: { label: 'En revisión', bg: '#E3F2FD', color: '#1B4D82' },
  resuelto: { label: 'Resuelto', bg: '#EAF3EC', color: '#205134' },
  cerrado: { label: 'Cerrado', bg: '#F3ECE2', color: '#7A5C3A' },
}

export async function fetchMyTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) console.error('Error cargando solicitudes:', error.message)
  return (data ?? []) as SupportTicket[]
}

export async function createTicket(ticket: {
  user_id: string
  order_id: string | null
  type: TicketType
  category: string
  subject: string
  description: string
}) {
  return supabase.from('support_tickets').insert(ticket)
}

// El comprador solo puede editar o eliminar sus solicitudes mientras estén 'abierto'
// (la BD lo valida: ver Instructions/migration_tickets_edit.sql)
export async function updateMyTicket(id: string, changes: {
  order_id: string | null
  type: TicketType
  category: string
  subject: string
  description: string
}) {
  const { data, error } = await supabase.from('support_tickets').update(changes).eq('id', id).eq('status', 'abierto').select('id')
  return { error: error ?? noRowsError(data) }
}

export async function deleteMyTicket(id: string) {
  const { data, error } = await supabase.from('support_tickets').delete().eq('id', id).eq('status', 'abierto').select('id')
  return { error: error ?? noRowsError(data) }
}

// Si RLS bloquea el cambio, Supabase no devuelve error: simplemente no afecta ninguna fila
function noRowsError(data: unknown[] | null) {
  if (data && data.length > 0) return null
  return { message: 'la solicitud ya no está abierta o no tienes permiso para modificarla.' }
}

// Admin: todas las solicitudes con datos del comprador
export async function fetchAllTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, customer:profiles(first_name, last_name, email, phone)')
    .order('created_at', { ascending: false })
  if (error) console.error('Error cargando solicitudes:', error.message)
  return (data ?? []) as SupportTicket[]
}

export async function updateTicket(id: string, changes: { status: TicketStatus; admin_response: string | null }) {
  const resolved = changes.status === 'resuelto' || changes.status === 'cerrado'
  return supabase
    .from('support_tickets')
    .update({ ...changes, resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', id)
}
