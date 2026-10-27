import { useEffect, useState, type ReactNode } from 'react'
import { StatusBadge } from '../components/OrdersTable'
import NotificationBell from '../components/NotificationBell'
import AccountRolesCard from '../components/AccountRolesCard'
import logoSrc from '../assets/logo-nofond.png'
import { signOutUser } from '../lib/session'
import { useAuth } from '../lib/auth'
import { ROLE_LABELS, roleRequirementsError, sellerRole } from '../lib/roles'
import ChangePasswordCard from '../components/ChangePasswordCard'
import DeleteAccountCard from '../components/DeleteAccountCard'
import { supabase } from '../lib/supabase'
import { fetchOrderStatuses, fetchStatusHistory, type OrderStatus, type StatusHistoryRow } from '../lib/orders'
import { usePanelSectionRequest } from '../lib/notifications'
import { confirmDialog } from '../components/ConfirmDialog'
import { onlyPhoneDigits, phoneInputProps } from '../lib/phone'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_STATUS,
  createTicket,
  deleteMyTicket,
  updateMyTicket,
  fetchFavorites,
  fetchMyOrders,
  fetchMyTickets,
  primaryImage,
  removeFavoriteById,
  type BuyerOrder,
  type BuyerOrderItem,
  type FavoriteRow,
  type SupportTicket,
  type TicketType,
} from '../lib/buyer'
import { MAIN_STORE, isMainStore, type StoreId } from '../lib/stores'
import { useStores } from '../lib/storesContext'
import { useAppNavigation } from '../lib/navigation'
import { isTab, type Tab, type UserRole } from '../lib/types'
import LocationFields from '../components/LocationFields'
import DocumentFields from '../components/DocumentFields'
import { normalizeDocumentNumber, validateDocument } from '../lib/identity'
import { LIMITS, cleanLine, cleanMultiline, profileFieldsError, textError } from '../lib/validation'

type BuyerSection = 'overview' | 'orders' | 'payments' | 'reviews' | 'favorites' | 'tickets' | 'profile' | 'roles'

interface BuyerPanelScreenProps {
  onNavigate: (tab: Tab) => void
  activeNav?: Tab
  onProfileClick?: () => void
  userRole?: UserRole | null
  onViewProduct?: (productId: string, store?: StoreId) => void
  /** Tienda desde la que se abrió el panel: define la marca del header */
  store?: StoreId
}

interface ReviewRow {
  id: string
  product_id: string
  rating: number
  comment: string | null
  created_at: string
  product: { title: string; images: { image_url: string; is_primary: boolean }[] } | null
}

interface ProfileForm {
  first_name: string
  last_name: string
  phone: string
  department: string
  municipality: string
  address: string
  document_type: string
  document_number: string
}

// Pasos del seguimiento del pedido (línea de progreso)
const TRACK_STEPS = [
  { label: 'Recibido', codes: ['PendingConfirmation', 'Reserved', 'PendingPayment', 'Paid'] },
  { label: 'En preparación', codes: ['Processing'] },
  { label: 'Enviado', codes: ['Shipped'] },
  { label: 'En camino', codes: ['InTransit', 'DeliveryFailed'] },
  { label: 'Entregado', codes: ['Delivered'] },
]
const ACTIVE_CODES = ['PendingConfirmation', 'Reserved', 'PendingPayment', 'Paid', 'Processing', 'Shipped', 'InTransit', 'DeliveryFailed']

const C = {
  green: '#205134',
  greenSoft: '#EAF3EC',
  dark: '#1C3A14',
  muted: '#8A8070',
  text: '#5A5248',
  border: '#EDE4D8',
  bg: '#FDFAF6',
  terra: '#9B4728',
  orange: '#C4622D',
  display: "'Poppins', sans-serif",
  body: "'Nunito Sans', sans-serif",
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(32,81,52,0.05)', padding: 20 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: C.body, background: C.bg, color: C.dark }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 5 }
const btnPrimary: React.CSSProperties = { background: C.green, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: C.body }
const btnGhost: React.CSSProperties = { background: '#fff', color: C.green, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: C.body }
const iconBtn: React.CSSProperties = { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: C.green, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', padding: 0 }

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0)
}

function formatDate(iso: string, withTime = false) {
  return new Date(iso).toLocaleString('es-CO', withTime ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' } : { dateStyle: 'medium', timeZone: 'America/Bogota' })
}

function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: C.display, fontSize: 20, fontWeight: 700, color: C.dark }}>{title}</h2>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function EmptyState({ emoji, text, action }: { emoji: string; text: string; action?: React.ReactNode }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '36px 20px' }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>{emoji}</div>
      <p style={{ margin: '0 0 14px', color: C.muted, fontSize: 14 }}>{text}</p>
      {action}
    </div>
  )
}

// ─── Menú lateral (mismo patrón que el panel de Asociación / Turismo) ─────────
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const ICONS: Record<string, ReactNode> = {
  overview: <Icon><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></Icon>,
  orders: <Icon><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></Icon>,
  payments: <Icon><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></Icon>,
  reviews: <Icon><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Icon>,
  favorites: <Icon><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" /></Icon>,
  tickets: <Icon><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>,
  profile: <Icon><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>,
  roles: <Icon><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></Icon>,
  seller: <Icon><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></Icon>,
  market: <Icon><circle cx="9" cy="20.5" r="1.3" /><circle cx="18" cy="20.5" r="1.3" /><path d="M2 3h2.6l2.4 11.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L21.4 7H5.6" /></Icon>,
}

function SidebarItem({ icon, label, active = false, badge, onClick }: { icon: ReactNode; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
        border: 'none', background: active ? C.greenSoft : 'transparent', cursor: 'pointer',
        width: '100%', textAlign: 'left', color: active ? C.green : C.text,
        fontFamily: C.body, fontSize: 14, fontWeight: active ? 700 : 600,
        transition: 'all 180ms ease',
      }}
      className={active ? undefined : 'hover:bg-[#F5EEE6]'}
    >
      <span style={{ opacity: active ? 1 : 0.6, display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {!!badge && <span style={{ background: active ? '#fff' : C.greenSoft, color: C.green, borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 800 }}>{badge}</span>}
    </button>
  )
}

function SidebarGroup({ title }: { title: string }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, padding: '14px 14px 4px' }}>{title}</div>
}

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', display: 'inline-block' }}>{label}</span>
}

function Stars({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} estrellas`}
          style={{ background: 'none', border: 'none', padding: 0, cursor: onChange ? 'pointer' : 'default', fontSize: size, lineHeight: 1, color: n <= value ? '#E8A317' : '#DDD3C4' }}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// Línea de progreso del pedido según el estado actual
function OrderTracker({ status }: { status?: OrderStatus }) {
  if (!status) return null
  const stepIndex = TRACK_STEPS.findIndex((s) => s.codes.includes(status.code))
  if (stepIndex < 0) {
    // Cancelado / Devuelto / Reembolsado
    return (
      <div style={{ background: '#FEE9E1', color: '#C53030', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>
        Este pedido está {status.name.toLowerCase()}.
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {TRACK_STEPS.map((step, i) => {
          const done = i <= stepIndex
          return (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: i < TRACK_STEPS.length - 1 ? 1 : '0 0 auto' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: done ? C.green : '#E8DED0', color: done ? '#fff' : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0, boxShadow: i === stepIndex ? '0 0 0 4px rgba(32,81,52,0.15)' : 'none' }}>
                {done ? '✓' : i + 1}
              </div>
              {i < TRACK_STEPS.length - 1 && <div style={{ flex: 1, height: 3, background: i < stepIndex ? C.green : '#E8DED0', margin: '0 4px', borderRadius: 2 }} />}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, gap: 4 }}>
        {TRACK_STEPS.map((step, i) => (
          <span key={step.label} style={{ fontSize: 11, fontWeight: i === stepIndex ? 800 : 600, color: i <= stepIndex ? C.green : C.muted, textAlign: i === 0 ? 'left' : i === TRACK_STEPS.length - 1 ? 'right' : 'center', flex: 1 }}>
            {step.label}
          </span>
        ))}
      </div>
      {status.code === 'DeliveryFailed' && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#C53030', fontWeight: 700 }}>⚠️ Hubo un problema con la entrega. Te contactaremos para reintentarla.</div>
      )}
    </div>
  )
}

export default function BuyerPanelScreen({ onNavigate, onViewProduct, store = 'campo' }: BuyerPanelScreenProps) {
  const isAllied = !isMainStore(store)
  const { storeName, getStore } = useStores()
  const { openStore, switchRole } = useAppNavigation()
  const { roles } = useAuth()
  const seller = sellerRole(roles)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Datos obligatorios guardados (para agregar un rol); se recalcula al cargar y al guardar "Mis datos"
  const [savedRequirementsError, setSavedRequirementsError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  // Volver a comprar en la tienda desde la que se abrió el panel
  const goShopping = () => openStore(store)
  const [section, setSection] = useState<BuyerSection>('overview')
  // Las notificaciones abren la sección de pedidos o de solicitudes (con datos frescos)
  usePanelSectionRequest<BuyerSection>((s) => { setSection(s); loadAll(true) }, ['orders', 'tickets'])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [statuses, setStatuses] = useState<OrderStatus[]>([])
  const [orders, setOrders] = useState<BuyerOrder[]>([])
  const [favorites, setFavorites] = useState<FavoriteRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [profile, setProfile] = useState<ProfileForm>({ first_name: '', last_name: '', phone: '', department: '', municipality: '', address: '', document_type: '', document_number: '' })
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const statusById = new Map(statuses.map((s) => [s.id, s]))

  const showToast = (type: 'ok' | 'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const loadReviews = async (uid: string) => {
    const { data } = await supabase
      .from('product_reviews')
      .select('id, product_id, rating, comment, created_at, product:products(title, images(image_url, is_primary))')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    setReviews((data ?? []) as unknown as ReviewRow[])
  }

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    setEmail(user.email ?? '')

    const [statusesData, ordersData, favsData, ticketsData, { data: profileData }] = await Promise.all([
      fetchOrderStatuses(),
      fetchMyOrders(user.id),
      fetchFavorites(user.id),
      fetchMyTickets(user.id),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      loadReviews(user.id),
    ])
    setStatuses(statusesData)
    setOrders(ordersData)
    setFavorites(favsData)
    setTickets(ticketsData)
    if (profileData) {
      setProfile({
        first_name: profileData.first_name ?? '',
        last_name: profileData.last_name ?? '',
        phone: profileData.phone ?? '',
        department: profileData.department ?? '',
        municipality: profileData.municipality ?? '',
        address: profileData.address ?? '',
        document_type: profileData.document_type ?? '',
        document_number: profileData.document_number ?? '',
      })
      setOrgName(profileData.org_name ?? '')
      setSavedRequirementsError(roleRequirementsError(profileData))
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // ─── Derivados ────────────────────────────────────────────────────────────
  const activeOrders = orders.filter((o) => ACTIVE_CODES.includes(statusById.get(o.status_id)?.code ?? ''))
  const deliveredOrders = orders.filter((o) => statusById.get(o.status_id)?.code === 'Delivered')
  const totalPaid = orders.filter((o) => o.payment_status === 'Paid').reduce((s, o) => s + Number(o.total), 0)
  const totalPending = orders
    .filter((o) => o.payment_status === 'Pending' && ACTIVE_CODES.includes(statusById.get(o.status_id)?.code ?? ''))
    .reduce((s, o) => s + Number(o.total), 0)
  const reviewedProductIds = new Set(reviews.map((r) => r.product_id))
  // Productos entregados aún sin reseña (uno por producto)
  const pendingReviews: BuyerOrderItem[] = []
  for (const o of orders) {
    for (const it of o.items ?? []) {
      if (!it.product_id || reviewedProductIds.has(it.product_id)) continue
      if (statusById.get(it.status_id)?.code !== 'Delivered') continue
      if (pendingReviews.some((p) => p.product_id === it.product_id)) continue
      pendingReviews.push(it)
    }
  }
  const openTickets = tickets.filter((t) => t.status === 'abierto' || t.status === 'en_revision')

  // ─── Solicitudes ──────────────────────────────────────────────────────────
  // editingId: solicitud que se está editando (null = nueva)
  const [ticketForm, setTicketForm] = useState<{ open: boolean; editingId: string | null; type: TicketType; order_id: string; category: string; subject: string; description: string }>({ open: false, editingId: null, type: 'problema', order_id: '', category: TICKET_CATEGORIES.problema[0], subject: '', description: '' })
  const [savingTicket, setSavingTicket] = useState(false)

  const openTicketForm = (type: TicketType, orderId = '') => {
    setTicketForm({ open: true, editingId: null, type, order_id: orderId, category: TICKET_CATEGORIES[type][0], subject: '', description: '' })
    setSection('tickets')
  }

  // Solo las solicitudes en estado 'abierto' se pueden editar o eliminar
  const editTicket = (t: SupportTicket) => {
    setTicketForm({ open: true, editingId: t.id, type: t.type, order_id: t.order_id ?? '', category: t.category, subject: t.subject, description: t.description })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const removeTicket = async (t: SupportTicket) => {
    if (!(await confirmDialog({
      title: t.type === 'problema' ? '¿Eliminar este reporte?' : '¿Eliminar esta solicitud?',
      message: `"${t.subject}" se eliminará y no se puede deshacer.`,
      confirmText: 'Eliminar',
      tone: 'danger',
    }))) return
    const { error } = await deleteMyTicket(t.id)
    if (error) {
      showToast('error', `No se pudo eliminar: ${error.message}`)
      return
    }
    if (ticketForm.editingId === t.id) setTicketForm((f) => ({ ...f, open: false, editingId: null }))
    setTickets(await fetchMyTickets(userId))
    showToast('ok', 'Solicitud eliminada.')
  }

  const submitTicket = async () => {
    const subject = cleanLine(ticketForm.subject)
    const description = cleanMultiline(ticketForm.description)
    const ticketError =
      textError('Asunto', subject, { max: LIMITS.ticketSubject, required: true }) ??
      textError('Descripción', description, { max: LIMITS.ticketDescription, required: true })
    if (ticketError) {
      showToast('error', ticketError)
      return
    }
    setSavingTicket(true)
    const data = {
      order_id: ticketForm.order_id || null,
      type: ticketForm.type,
      category: ticketForm.category,
      subject,
      description,
    }
    const editing = ticketForm.editingId
    const { error } = editing
      ? await updateMyTicket(editing, data)
      : await createTicket({ user_id: userId, ...data })
    setSavingTicket(false)
    if (error) {
      showToast('error', `No se pudo ${editing ? 'guardar' : 'enviar'}: ${error.message}`)
      return
    }
    setTicketForm((f) => ({ ...f, open: false, editingId: null }))
    setTickets(await fetchMyTickets(userId))
    showToast('ok', editing ? 'Solicitud actualizada.' : `Recibimos tu solicitud. El equipo de ${storeName(store)} la revisará pronto.`)
  }

  // ─── Historial por ítem ───────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, StatusHistoryRow[]>>({})
  const toggleHistory = async (itemId: string) => {
    if (historyOpen === itemId) { setHistoryOpen(null); return }
    setHistoryOpen(itemId)
    const rows = await fetchStatusHistory(itemId)
    setHistory((h) => ({ ...h, [itemId]: rows }))
  }

  // ─── Reseñas ──────────────────────────────────────────────────────────────
  const [reviewDraft, setReviewDraft] = useState<{ productId: string; rating: number; comment: string } | null>(null)
  const [savingReview, setSavingReview] = useState(false)

  const saveReview = async () => {
    if (!reviewDraft) return
    // Las estrellas empiezan vacías: la calificación la elige el comprador, no viene marcada
    if (reviewDraft.rating < 1) { showToast('error', 'Elige de 1 a 5 estrellas.'); return }
    const comment = cleanMultiline(reviewDraft.comment)
    const commentError = textError('Comentario', comment, { max: LIMITS.review })
    if (commentError) { showToast('error', commentError); return }
    setSavingReview(true)
    const { error } = await supabase.from('product_reviews').upsert(
      { product_id: reviewDraft.productId, user_id: userId, rating: reviewDraft.rating, comment: comment || null, updated_at: new Date().toISOString() },
      { onConflict: 'product_id,user_id' }
    )
    setSavingReview(false)
    if (error) { showToast('error', `No se pudo guardar la reseña: ${error.message}`); return }
    setReviewDraft(null)
    await loadReviews(userId)
    showToast('ok', '¡Gracias por tu reseña!')
  }

  const deleteReview = async (id: string) => {
    if (!(await confirmDialog({ title: '¿Eliminar esta reseña?', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', tone: 'danger' }))) return
    const { error } = await supabase.from('product_reviews').delete().eq('id', id)
    if (error) { showToast('error', error.message); return }
    await loadReviews(userId)
  }

  // ─── Favoritos ────────────────────────────────────────────────────────────
  const removeFav = async (id: string) => {
    const { error } = await removeFavoriteById(id)
    if (error) { showToast('error', error.message); return }
    setFavorites((f) => f.filter((x) => x.id !== id))
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────
  const [savingProfile, setSavingProfile] = useState(false)
  const saveProfile = async () => {
    const cleaned = {
      first_name: cleanLine(profile.first_name),
      last_name: cleanLine(profile.last_name),
      phone: onlyPhoneDigits(profile.phone),
      address: cleanLine(profile.address),
    }
    const fieldsError = profileFieldsError(cleaned, { requireLastName: true })
    if (fieldsError) {
      showToast('error', fieldsError)
      return
    }
    const docError = validateDocument(profile.document_type, profile.document_number)
    if (docError) {
      showToast('error', docError)
      return
    }
    if (!profile.department || !profile.municipality) {
      showToast('error', 'Selecciona tu departamento y municipio.')
      return
    }
    setSavingProfile(true)
    const { error } = await supabase.from('profiles').update({
      first_name: cleaned.first_name,
      last_name: cleaned.last_name,
      phone: cleaned.phone || null,
      department: profile.department || null,
      municipality: profile.municipality || null,
      address: cleaned.address || null,
      document_type: profile.document_type,
      document_number: normalizeDocumentNumber(profile.document_number),
    }).eq('id', userId)
    setSavingProfile(false)
    if (error) { showToast('error', `No se pudieron guardar tus datos: ${error.message}`); return }
    setSavedRequirementsError(roleRequirementsError(profile))
    showToast('ok', 'Tus datos se actualizaron correctamente.')
  }

  // ─── Navegación del panel ─────────────────────────────────────────────────
  const sections: { id: BuyerSection; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Resumen' },
    { id: 'orders', label: 'Mis pedidos', badge: activeOrders.length },
    { id: 'payments', label: 'Pagos' },
    { id: 'reviews', label: 'Reseñas', badge: pendingReviews.length },
    { id: 'favorites', label: 'Favoritos', badge: favorites.length },
    { id: 'tickets', label: 'Solicitudes', badge: openTickets.length },
    { id: 'profile', label: 'Mis datos' },
    { id: 'roles', label: 'Mis roles' },
  ]
  const sectionLabel = sections.find((s) => s.id === section)?.label ?? 'Mi panel'

  const goToSection = (s: BuyerSection) => {
    setSection(s)
    setSidebarOpen(false)
    window.scrollTo({ top: 0 })
  }

  const signOut = async () => {
    const slug = getStore(store).slug
    await signOutUser(isAllied && slug ? `/${slug}` : '/')
  }

  const renderOrderCard = (o: BuyerOrder) => {
    const status = statusById.get(o.status_id)
    const pay = PAYMENT_STATUS_LABELS[o.payment_status] ?? PAYMENT_STATUS_LABELS.Pending
    const addr = o.shipping_address || {}
    return (
      <div key={o.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, color: C.dark, fontSize: 15 }}>Pedido {shortId(o.id)}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{formatDate(o.created_at, true)}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!isMainStore(o.store) && <Pill label={storeName(o.store)} bg="#E3F2FD" color="#1B4D82" />}
            <StatusBadge status={status} />
            <Pill label={`Pago: ${pay.label}`} bg={pay.bg} color={pay.color} />
          </div>
        </div>

        <OrderTracker status={status} />

        {o.payment_method !== 'CashOnDelivery' && o.payment_status !== 'Paid' && status?.code === 'PendingPayment' && (
          <div style={{ background: '#FFF7E8', border: '1px solid #F0D099', color: '#9B4728', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>
            {o.payment_method === 'BankTransfer'
              ? `Realiza la transferencia con la referencia ${shortId(o.id)}. El productor enviará tu pedido cuando se confirme el pago.`
              : 'Coordina el pago en efectivo con el productor. Enviará tu pedido cuando reciba el pago.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(o.items ?? []).map((it) => (
            <div key={it.id} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {it.img && <img src={it.img} alt={it.title} style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.dark, fontSize: 14 }}>{it.title}</div>
                  {it.variant_label && <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{it.variant_label}</div>}
                  <div style={{ fontSize: 12, color: C.muted }}>{it.quantity} × {formatPrice(it.unit_price)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusBadge status={statusById.get(it.status_id)} />
                  <span style={{ fontWeight: 700, color: C.terra, fontSize: 14 }}>{formatPrice(it.total)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => toggleHistory(it.id)} style={{ background: 'none', border: 'none', padding: 0, color: C.green, fontSize: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>
                  {historyOpen === it.id ? 'Ocultar historial' : 'Ver historial'}
                </button>
                {it.product_id && statusById.get(it.status_id)?.code === 'Delivered' && !reviewedProductIds.has(it.product_id) && (
                  <button type="button" onClick={() => { setSection('reviews'); setReviewDraft({ productId: it.product_id!, rating: 0, comment: '' }) }} style={{ background: 'none', border: 'none', padding: 0, color: '#B8860B', fontSize: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>
                    ⭐ Calificar producto
                  </button>
                )}
              </div>
              {historyOpen === it.id && (
                <div style={{ background: C.bg, borderRadius: 12, padding: '10px 14px', marginTop: 8 }}>
                  {!history[it.id] ? (
                    <span style={{ fontSize: 12, color: C.muted }}>Cargando...</span>
                  ) : history[it.id].length === 0 ? (
                    <span style={{ fontSize: 12, color: C.muted }}>Sin cambios registrados.</span>
                  ) : (
                    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {history[it.id].map((h) => (
                        <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                          <StatusBadge status={statusById.get(h.to_status_id)} />
                          <span style={{ color: C.muted }}>{formatDate(h.created_at, true)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, background: C.bg, borderRadius: 14, padding: 14, fontSize: 13, color: C.text }}>
          <div>
            <div style={{ fontWeight: 800, color: C.green, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Entrega</div>
            <div>{o.customer_name}{o.customer_phone ? ` · ${o.customer_phone}` : ''}</div>
            <div>{addr.address}{addr.municipality ? `, ${addr.municipality}` : ''}{addr.department ? ` (${addr.department})` : ''}</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: C.green, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Pago</div>
            <div>{PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method}</div>
            <div>Subtotal {formatPrice(o.subtotal)} · Envío {formatPrice(o.shipping_fee)}</div>
            <div style={{ fontWeight: 800, color: C.dark }}>Total {formatPrice(o.total)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={() => openTicketForm('solicitud', o.id)}>📝 Crear solicitud</button>
          <button type="button" style={{ ...btnGhost, color: C.orange }} onClick={() => openTicketForm('problema', o.id)}>⚠️ Reportar un problema</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F5EEE6', fontFamily: C.body }}>

      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside
        className={sidebarOpen ? '!flex' : 'hidden md:flex'}
        aria-label="Menú del comprador"
        style={{ width: 240, flexShrink: 0, background: C.bg, borderRight: `1px solid ${C.border}`, flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40, boxShadow: '2px 0 16px rgba(32,81,52,0.06)' }}
      >
        <button
          type="button"
          onClick={() => (isAllied ? openStore(store) : onNavigate('home'))}
          aria-label="Ir al inicio"
          style={{ padding: '24px 20px 16px', display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {isAllied ? (
            <span style={{ fontFamily: C.display, fontSize: 22, fontWeight: 800, color: C.green, textAlign: 'center', lineHeight: 1.2, padding: '20px 0' }}>{storeName(store)}</span>
          ) : (
            <img src={logoSrc} alt="El Campo Nos Une" style={{ height: 90, width: 'auto', display: 'block' }} />
          )}
        </button>

        <nav style={{ flex: 1, padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          <SidebarGroup title="Mi cuenta" />
          {sections.map((s) => (
            <SidebarItem key={s.id} icon={ICONS[s.id]} label={s.label} badge={s.badge} active={section === s.id} onClick={() => goToSection(s.id)} />
          ))}

          {seller && (
            <>
              <SidebarGroup title="Mis roles" />
              <SidebarItem icon={ICONS.seller} label={`Panel de ${ROLE_LABELS[seller]}`} onClick={() => { setSidebarOpen(false); switchRole(seller) }} />
            </>
          )}
        </nav>

        <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.greenSoft, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, fontFamily: C.display }}>
              {(profile.first_name[0] || '?').toUpperCase()}{(profile.last_name[0] || '').toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {`${profile.first_name} ${profile.last_name}`.trim() || 'Comprador'}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{roles.length ? roles.map((r) => ROLE_LABELS[r]).join(' · ') : ROLE_LABELS.comprador}</div>
            </div>
            <button type="button" onClick={signOut} title="Cerrar sesión" aria-label="Cerrar sesión" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.orange, padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0 }} className="md:ml-[240px]">
        <header className="px-4 md:px-6" style={{ position: 'sticky', top: 0, zIndex: 20, background: C.bg, borderBottom: `1px solid ${C.border}`, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, boxShadow: '0 2px 10px rgba(32,81,52,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <button className="flex md:hidden items-center justify-center" type="button" aria-label="Abrir menú" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)} style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: 'none', background: C.greenSoft, cursor: 'pointer', color: C.green }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontFamily: C.display, fontSize: 20, fontWeight: 700, color: C.dark, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sectionLabel}</h1>
              <p className="hidden sm:block" style={{ margin: 0, fontSize: 12, color: C.muted, fontWeight: 600 }}>Mi panel de comprador</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={goShopping} style={{ height: 38, minWidth: 38, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.dark, fontWeight: 700, fontSize: 14 }} className="hover:bg-[#F5EEE6]" title="Seguir comprando">
              {ICONS.market}
              <span className="hidden sm:inline">Seguir comprando</span>
            </button>
            <NotificationBell
              onOpen={(tab) => { if (tab !== 'profile' && isTab(tab)) onNavigate(tab) }}
              buttonStyle={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff' }}
            />
          </div>
        </header>

        <main className="p-4 md:p-6" style={{ flex: 1, boxSizing: 'border-box', minWidth: 0, paddingBottom: 32 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {/* Encabezado */}
        {section === 'overview' && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenSoft, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, fontFamily: C.display, flexShrink: 0 }}>
            {(profile.first_name[0] || '?').toUpperCase()}{(profile.last_name[0] || '').toUpperCase()}
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontFamily: C.display, fontSize: 20, fontWeight: 700, color: C.dark }}>
              {loading ? 'Cargando...' : `Hola, ${profile.first_name || 'comprador'} 👋`}
            </div>
            <div style={{ fontSize: 13, color: C.muted }}>{email}{profile.municipality ? ` · 📍 ${profile.municipality}` : ''}</div>
          </div>
        </div>
        )}

        {toast && (
          <div style={{ background: toast.type === 'ok' ? C.greenSoft : '#FDEDED', color: toast.type === 'ok' ? C.green : '#C53030', border: `1px solid ${toast.type === 'ok' ? '#C8E6C9' : '#F5C2C2'}`, padding: '10px 14px', borderRadius: 12, marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
            {toast.text}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse" style={{ ...card, height: 100 }} />)}
          </div>
        ) : (
          <>
            {/* ═══ RESUMEN ═══ */}
            {section === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                  {[
                    { emoji: '🚚', value: activeOrders.length, label: 'Pedidos en curso', to: 'orders' as BuyerSection },
                    { emoji: '✅', value: deliveredOrders.length, label: 'Pedidos entregados', to: 'orders' as BuyerSection },
                    { emoji: '💳', value: formatPrice(totalPending), label: 'Por pagar', to: 'payments' as BuyerSection },
                    { emoji: '❤️', value: favorites.length, label: 'Favoritos', to: 'favorites' as BuyerSection },
                  ].map((s) => (
                    <button key={s.label} type="button" onClick={() => setSection(s.to)} style={{ ...card, textAlign: 'left', cursor: 'pointer', fontFamily: C.body }} className="hover:shadow-lg">
                      <div style={{ fontSize: 22, marginBottom: 8 }}>{s.emoji}</div>
                      <div style={{ fontFamily: C.display, fontSize: 22, fontWeight: 700, color: C.green }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{s.label}</div>
                    </button>
                  ))}
                </div>

                {pendingReviews.length > 0 && (
                  <div style={{ ...card, background: '#FFF8E7', borderColor: '#F3D98B', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, color: '#8A6100', fontWeight: 700 }}>⭐ Tienes {pendingReviews.length} producto(s) entregado(s) por calificar.</span>
                    <button type="button" style={{ ...btnGhost, color: '#8A6100' }} onClick={() => setSection('reviews')}>Calificar ahora</button>
                  </div>
                )}

                <div>
                  <SectionTitle title="Tu pedido más reciente" action={orders.length > 1 ? <button type="button" style={btnGhost} onClick={() => setSection('orders')}>Ver todos</button> : undefined} />
                  {orders.length === 0
                    ? <EmptyState emoji="🧺" text={isAllied ? 'Aún no has hecho pedidos. ¡Descubre los productos de la tienda!' : 'Aún no has hecho pedidos. ¡Descubre los productos del campo!'} action={<button type="button" style={btnPrimary} onClick={goShopping}>Explorar productos</button>} />
                    : renderOrderCard(orders[0])}
                </div>
              </div>
            )}

            {/* ═══ MIS PEDIDOS ═══ */}
            {section === 'orders' && (
              <div>
                <SectionTitle title="Mis pedidos" subtitle="Sigue el estado de cada pedido y de cada producto." />
                {orders.length === 0
                  ? <EmptyState emoji="📦" text="Todavía no tienes pedidos." action={<button type="button" style={btnPrimary} onClick={goShopping}>Ir a la tienda</button>} />
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{orders.map(renderOrderCard)}</div>}
              </div>
            )}

            {/* ═══ PAGOS ═══ */}
            {section === 'payments' && (
              <div>
                <SectionTitle title="Información de pagos" subtitle="Resumen de los pagos de tus pedidos." />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <div style={card}><div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>TOTAL PAGADO</div><div style={{ fontFamily: C.display, fontSize: 24, fontWeight: 700, color: C.green }}>{formatPrice(totalPaid)}</div></div>
                  <div style={card}><div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>PENDIENTE POR PAGAR</div><div style={{ fontFamily: C.display, fontSize: 24, fontWeight: 700, color: C.orange }}>{formatPrice(totalPending)}</div></div>
                </div>
                {orders.some((o) => (o.payment_method === 'Cash' || o.payment_method === 'BankTransfer') && o.payment_status === 'Pending') && (
                  <div style={{ ...card, background: '#FFF7E8', borderColor: '#F0D099', fontSize: 13, color: '#9B4728', fontWeight: 600, marginBottom: 16 }}>
                    🏦 En los pedidos pagados por transferencia o en efectivo, el productor envía tu pedido cuando se confirma el pago.
                  </div>
                )}
                {orders.some((o) => o.payment_method === 'CashOnDelivery' && o.payment_status === 'Pending') && (
                  <div style={{ ...card, background: C.greenSoft, borderColor: '#C8E6C9', fontSize: 13, color: C.green, fontWeight: 600, marginBottom: 16 }}>
                    💵 En los pedidos contraentrega pagas al recibir. Ten el valor exacto listo para el repartidor.
                  </div>
                )}
                {orders.length === 0 ? (
                  <EmptyState emoji="💳" text="No hay pagos registrados todavía." />
                ) : (
                  <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                            {['Pedido', 'Fecha', 'Método', 'Estado del pago', 'Subtotal', 'Envío', 'Total'].map((h) => (
                              <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((o) => {
                            const pay = PAYMENT_STATUS_LABELS[o.payment_status] ?? PAYMENT_STATUS_LABELS.Pending
                            return (
                              <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                                <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 800, color: C.dark }}>{shortId(o.id)}</td>
                                <td style={{ padding: '12px 14px', color: C.text, whiteSpace: 'nowrap' }}>{formatDate(o.created_at)}</td>
                                <td style={{ padding: '12px 14px', color: C.text }}>{PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method}</td>
                                <td style={{ padding: '12px 14px' }}><Pill label={pay.label} bg={pay.bg} color={pay.color} /></td>
                                <td style={{ padding: '12px 14px', color: C.text, whiteSpace: 'nowrap' }}>{formatPrice(o.subtotal)}</td>
                                <td style={{ padding: '12px 14px', color: C.text, whiteSpace: 'nowrap' }}>{formatPrice(o.shipping_fee)}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, color: C.terra, whiteSpace: 'nowrap' }}>{formatPrice(o.total)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ RESEÑAS ═══ */}
            {section === 'reviews' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {reviewDraft && (
                  <div style={{ ...card, borderColor: C.green }}>
                    <SectionTitle title="Calificar producto" subtitle={orders.flatMap((o) => o.items ?? []).find((i) => i.product_id === reviewDraft.productId)?.title ?? reviews.find((r) => r.product_id === reviewDraft.productId)?.product?.title} />
                    <Stars value={reviewDraft.rating} onChange={(v) => setReviewDraft({ ...reviewDraft, rating: v })} size={30} />
                    <textarea
                      value={reviewDraft.comment}
                      maxLength={LIMITS.review}
                      onChange={(e) => setReviewDraft({ ...reviewDraft, comment: e.target.value })}
                      placeholder="Cuéntanos cómo te pareció el producto (opcional)"
                      rows={3}
                      style={{ ...inputStyle, marginTop: 12, resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                      <button type="button" style={btnGhost} onClick={() => setReviewDraft(null)}>Cancelar</button>
                      <button type="button" style={{ ...btnPrimary, opacity: savingReview ? 0.6 : 1 }} disabled={savingReview} onClick={saveReview}>{savingReview ? 'Guardando...' : 'Publicar reseña'}</button>
                    </div>
                  </div>
                )}

                <div>
                  <SectionTitle title="Pendientes por calificar" subtitle="Productos que ya recibiste." />
                  {pendingReviews.length === 0 ? (
                    <EmptyState emoji="⭐" text="No tienes productos pendientes por calificar." />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                      {pendingReviews.map((it) => (
                        <div key={it.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
                          {it.img && <img src={it.img} alt={it.title} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover' }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: C.dark, fontSize: 14 }}>{it.title}</div>
                            <button type="button" style={{ ...btnGhost, marginTop: 6, padding: '6px 12px' }} onClick={() => setReviewDraft({ productId: it.product_id!, rating: 0, comment: '' })}>⭐ Calificar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <SectionTitle title="Mis reseñas" />
                  {reviews.length === 0 ? (
                    <EmptyState emoji="📝" text="Aún no has publicado reseñas." />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {reviews.map((r) => (
                        <div key={r.id} style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <img src={primaryImage(r.product?.images)} alt={r.product?.title ?? ''} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover' }} />
                          <div style={{ flex: '1 1 220px' }}>
                            <div style={{ fontWeight: 700, color: C.dark }}>{r.product?.title ?? 'Producto'}</div>
                            <Stars value={r.rating} size={16} />
                            {r.comment && <p style={{ margin: '6px 0 0', fontSize: 13, color: C.text }}>{r.comment}</p>}
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{formatDate(r.created_at)}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" style={btnGhost} onClick={() => setReviewDraft({ productId: r.product_id, rating: r.rating, comment: r.comment ?? '' })}>Editar</button>
                            <button type="button" style={{ ...btnGhost, color: '#C53030' }} onClick={() => deleteReview(r.id)}>Eliminar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ FAVORITOS ═══ */}
            {section === 'favorites' && (
              <div>
                <SectionTitle title="Mis favoritos" subtitle="Guarda productos con el ❤️ en la tienda." />
                {favorites.length === 0 ? (
                  <EmptyState emoji="❤️" text="Aún no tienes favoritos." action={<button type="button" style={btnPrimary} onClick={goShopping}>Explorar productos</button>} />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                    {favorites.map((f) => {
                      const item = f.product ?? f.experience
                      if (!item) return null
                      const owner = f.product ? f.product.producer : f.experience?.host
                      return (
                        <div key={f.id} style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          <img src={primaryImage(item.images)} alt={item.title} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                            <div style={{ fontWeight: 700, color: C.dark, fontSize: 14 }}>{item.title}</div>
                            {owner && <div style={{ fontSize: 12, color: C.muted }}>{owner}</div>}
                            <div style={{ fontWeight: 800, color: C.terra, fontFamily: C.display }}>{formatPrice(item.price)}</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 8 }}>
                              {f.product_id ? (
                                <button type="button" style={{ ...btnPrimary, flex: 1, padding: '8px 10px', fontSize: 13 }} onClick={() => onViewProduct?.(f.product_id!, f.product?.store ?? MAIN_STORE)}>Ver producto</button>
                              ) : (
                                <button type="button" style={{ ...btnPrimary, flex: 1, padding: '8px 10px', fontSize: 13 }} onClick={() => onNavigate('tourism')}>Ver experiencias</button>
                              )}
                              <button type="button" title="Quitar de favoritos" style={{ ...btnGhost, color: '#C53030', padding: '8px 10px' }} onClick={() => removeFav(f.id)}>✕</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ═══ SOLICITUDES Y REPORTES ═══ */}
            {section === 'tickets' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <SectionTitle
                  title="Solicitudes y reportes"
                  subtitle={`Solo el equipo de administración de ${storeName(store)} puede ver tus solicitudes.`}
                  action={!ticketForm.open ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" style={btnGhost} onClick={() => openTicketForm('solicitud')}>📝 Nueva solicitud</button>
                      <button type="button" style={{ ...btnPrimary, background: C.orange }} onClick={() => openTicketForm('problema')}>⚠️ Reportar problema</button>
                    </div>
                  ) : undefined}
                />

                {ticketForm.open && (
                  <div style={{ ...card, borderColor: ticketForm.type === 'problema' ? '#F3C38B' : C.green }}>
                    {ticketForm.editingId && (
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.green, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>✏️ Editando solicitud</div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                      {(['problema', 'solicitud'] as TicketType[]).map((t) => (
                        <button key={t} type="button" onClick={() => setTicketForm({ ...ticketForm, type: t, category: TICKET_CATEGORIES[t][0] })} style={{ ...btnGhost, background: ticketForm.type === t ? C.green : '#fff', color: ticketForm.type === t ? '#fff' : C.green }}>
                          {t === 'problema' ? '⚠️ Reportar problema' : '📝 Solicitud'}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Pedido relacionado</label>
                        <select value={ticketForm.order_id} onChange={(e) => setTicketForm({ ...ticketForm, order_id: e.target.value })} style={inputStyle}>
                          <option value="">Ninguno / consulta general</option>
                          {orders.map((o) => <option key={o.id} value={o.id}>{shortId(o.id)} · {formatDate(o.created_at)} · {formatPrice(o.total)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Motivo</label>
                        <select value={ticketForm.category} onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })} style={inputStyle}>
                          {TICKET_CATEGORIES[ticketForm.type].map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={labelStyle}>Asunto *</label>
                      <input value={ticketForm.subject} onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })} maxLength={120} placeholder="Ej: Las fresas llegaron golpeadas" style={inputStyle} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={labelStyle}>Descripción *</label>
                      <textarea value={ticketForm.description} maxLength={LIMITS.ticketDescription} onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })} rows={4} placeholder="Cuéntanos con detalle qué pasó o qué necesitas." style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                      <button type="button" style={btnGhost} onClick={() => setTicketForm({ ...ticketForm, open: false, editingId: null })}>Cancelar</button>
                      <button type="button" style={{ ...btnPrimary, opacity: savingTicket ? 0.6 : 1 }} disabled={savingTicket} onClick={submitTicket}>
                        {savingTicket ? (ticketForm.editingId ? 'Guardando...' : 'Enviando...') : (ticketForm.editingId ? 'Guardar cambios' : 'Enviar')}
                      </button>
                    </div>
                  </div>
                )}

                {tickets.length === 0 ? (
                  !ticketForm.open && <EmptyState emoji="🛟" text="No has creado solicitudes ni reportes." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {tickets.map((t) => {
                      const st = TICKET_STATUS[t.status]
                      return (
                        <div key={t.id} style={card}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 800, color: t.type === 'problema' ? C.orange : C.green, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                {t.type === 'problema' ? '⚠️ Problema' : '📝 Solicitud'} · {t.category}
                              </div>
                              <div style={{ fontWeight: 700, color: C.dark, fontSize: 15, marginTop: 2 }}>{t.subject}</div>
                              <div style={{ fontSize: 12, color: C.muted }}>
                                {formatDate(t.created_at, true)}{t.order_id ? ` · Pedido ${shortId(t.order_id)}` : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Pill label={st.label} bg={st.bg} color={st.color} />
                              {t.status === 'abierto' && (
                                <>
                                  <button type="button" onClick={() => editTicket(t)} title="Editar" aria-label="Editar solicitud" style={iconBtn}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                                  </button>
                                  <button type="button" onClick={() => removeTicket(t)} title="Eliminar" aria-label="Eliminar solicitud" style={{ ...iconBtn, color: '#D06050' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <p style={{ margin: '10px 0 0', fontSize: 13, color: C.text, whiteSpace: 'pre-wrap' }}>{t.description}</p>
                          {t.admin_response && (
                            <div style={{ marginTop: 12, background: C.greenSoft, borderRadius: 12, padding: '10px 14px' }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: C.green, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Respuesta del equipo</div>
                              <div style={{ fontSize: 13, color: C.dark, whiteSpace: 'pre-wrap' }}>{t.admin_response}</div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ═══ MIS DATOS ═══ */}
            {section === 'profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
              <div style={card}>
                <SectionTitle title="Mis datos" subtitle="Tu dirección se usará para precargar tus próximos pedidos." />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Nombre *</label>
                    <input value={profile.first_name} maxLength={LIMITS.personName} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Apellido *</label>
                    <input value={profile.last_name} maxLength={LIMITS.personName} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Correo electrónico</label>
                    <input value={email} disabled style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Teléfono / WhatsApp</label>
                    <input value={onlyPhoneDigits(profile.phone)} onChange={(e) => setProfile({ ...profile, phone: onlyPhoneDigits(e.target.value) })} {...phoneInputProps} style={inputStyle} />
                  </div>
                  <DocumentFields
                    documentType={profile.document_type}
                    documentNumber={profile.document_number}
                    onChange={({ documentType, documentNumber }) => setProfile((p) => ({ ...p, document_type: documentType, document_number: documentNumber }))}
                    labelStyle={labelStyle}
                    inputStyle={inputStyle}
                  />
                  <LocationFields
                    department={profile.department}
                    municipality={profile.municipality}
                    onChange={(loc) => setProfile((p) => ({ ...p, ...loc }))}
                    labelStyle={labelStyle}
                    inputStyle={inputStyle}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <label style={labelStyle}>Dirección de entrega</label>
                  <input value={profile.address} maxLength={LIMITS.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Calle, número, barrio, apto..." style={inputStyle} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                  <button type="button" style={{ ...btnPrimary, opacity: savingProfile ? 0.6 : 1 }} disabled={savingProfile} onClick={saveProfile}>{savingProfile ? 'Guardando...' : 'Guardar cambios'}</button>
                </div>
              </div>
              <ChangePasswordCard />
              <DeleteAccountCard />
              </div>
            )}

            {/* ═══ MIS ROLES ═══ */}
            {section === 'roles' && (
              <AccountRolesCard
                requirementsError={savedRequirementsError}
                onCompleteData={() => goToSection('profile')}
                initialOrgName={orgName}
              />
            )}
          </>
        )}
      </div>
        </main>
      </div>
    </div>
  )
}
