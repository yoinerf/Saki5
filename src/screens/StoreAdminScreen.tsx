import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import NotificationBell from '../components/NotificationBell'
import CertifiedBadge from '../components/CertifiedBadge'
import { confirmDialog } from '../components/ConfirmDialog'
import { onlyPhoneDigits, phoneInputProps } from '../lib/phone'
import { MIN_PASSWORD_LENGTH } from '../components/PasswordFields'
import { generateTempPassword } from '../components/TempPasswordModal'
import { supabase } from '../lib/supabase'
import { signOutUser } from '../lib/session'
import { cleanLine, isValidEmail, profileFieldsError } from '../lib/validation'
import { adminCreateUser, adminDeleteUser } from '../lib/adminUsers'
import { usePanelSectionRequest } from '../lib/notifications'
import { isMainStore } from '../lib/stores'
import { useStores } from '../lib/storesContext'
import {
  DOC_LABELS,
  DOC_STATUS,
  PRODUCER_DOCS,
  VALIDATION_STATE,
  fetchDocuments,
  getDocumentUrl,
  reviewDocument,
  validationState,
  type ProducerDocument,
} from '../lib/producerDocuments'
import logoSrc from '../assets/logo-nofond.png'
import type { Tab, UserRole } from '../lib/types'
import LocationFields from '../components/LocationFields'
import DocumentFields from '../components/DocumentFields'
import { documentColumns, normalizeDocumentNumber, validateDocument, validateOptionalDocument } from '../lib/identity'
import MyAccountCard from '../components/MyAccountCard'
import ChangePasswordCard from '../components/ChangePasswordCard'

// Panel del administrador de tienda: gestiona SOLO los productores de su tienda.
// Misma distribución que el panel del productor (menú lateral + barra superior).
// Los permisos reales los aplica la BD (RLS, funciones) y la edge function admin-users.

type Section = 'dashboard' | 'producers' | 'review' | 'account'

interface Props {
  onNavigate: (tab: Tab) => void
  activeNav?: Tab
  onProfileClick?: () => void
  userRole?: UserRole | null
  /** Tienda del administrador (profiles.store) */
  store: string
}

interface Producer {
  id: string
  first_name: string
  last_name: string
  org_name: string | null
  email: string | null
  phone: string | null
  department: string | null
  municipality: string | null
  document_type: string | null
  document_number: string | null
  user_type: string
  manually_verified_at: string | null
  created_at: string
}

const C = {
  green: '#205134',
  greenSoft: '#EAF3EC',
  dark: '#1C3A14',
  text: '#5A5248',
  muted: '#8A8070',
  border: '#EDE4D8',
  bg: '#FDFAF6',
  red: '#D06050',
  display: "'Poppins', sans-serif",
  body: "'Nunito Sans', sans-serif",
}

// Menú lateral verde profundo institucional (el superadmin usa el azul)
const SIDEBAR = {
  bg: 'linear-gradient(180deg, #153823 0%, #0F2819 100%)',
  text: 'rgba(255,255,255,0.78)',
  active: 'rgba(255,255,255,0.16)',
  border: 'rgba(255,255,255,0.14)',
}

const card: CSSProperties = { background: '#fff', borderRadius: 22, padding: '22px 24px', border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(32,81,52,0.04)' }
const btnPrimary: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: C.green, color: '#fff', border: 'none', borderRadius: 12, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: C.body, boxShadow: '0 4px 14px rgba(32,81,52,0.25)' }
const btnGhost: CSSProperties = { background: '#fff', color: C.green, border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: C.body }
const inputStyle: CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: C.body, background: C.bg, color: C.dark }
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: C.green, fontFamily: C.body, marginBottom: 5 }
const th: CSSProperties = { padding: '14px 16px', fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: C.display, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.4 }
const td: CSSProperties = { padding: '12px 16px', fontSize: 13, color: C.text, verticalAlign: 'middle' }

const DashIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
const UsersIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
const AccountIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const DocIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15l2 2 4-4" /></svg>

function SidebarItem({ icon, label, active, badge, onClick }: { icon: ReactNode; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
        border: 'none', background: active ? SIDEBAR.active : 'transparent', cursor: 'pointer',
        width: '100%', textAlign: 'left', color: active ? '#fff' : SIDEBAR.text,
        fontFamily: C.body, fontSize: 14, fontWeight: active ? 700 : 600,
        transition: 'all 180ms ease',
      }}
    >
      <span style={{ opacity: active ? 1 : 0.75 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {!!badge && <span style={{ background: '#E5AE30', color: '#1C2700', fontSize: 11, fontWeight: 800, borderRadius: 10, padding: '1px 7px' }}>{badge}</span>}
    </button>
  )
}

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return <span style={{ background: bg, color, fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', display: 'inline-block' }}>{label}</span>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' })
}

const producerName = (p: Producer) => p.org_name?.trim() || `${p.first_name} ${p.last_name}`.trim() || 'Productor'

const EMPTY_FORM = { first_name: '', last_name: '', org_name: '', email: '', phone: '', department: '', municipality: '', document_type: '', document_number: '', password: '' }

const SECTION_LABEL: Record<Section, string> = { dashboard: 'Panel Principal', producers: 'Productores', review: 'Revisión de perfiles', account: 'Mi cuenta' }

export default function StoreAdminScreen({ store, onNavigate }: Props) {
  const [section, setSection] = useState<Section>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [storeName, setStoreName] = useState(store)
  const [me, setMe] = useState({ first_name: '', last_name: '' })
  const [producers, setProducers] = useState<Producer[]>([])
  const [documents, setDocuments] = useState<ProducerDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  // Crear / editar productor
  const [form, setForm] = useState<{ open: boolean; editingId: string | null; data: typeof EMPTY_FORM }>({ open: false, editingId: null, data: EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null)

  // Revisión
  const [reviewFilter, setReviewFilter] = useState<'pending' | 'all'>('pending')
  const [rejecting, setRejecting] = useState<{ docId: string; reason: string } | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const { getStore } = useStores()
  const storeSlug = getStore(store).slug

  const showToast = (type: 'ok' | 'error', text: string) => {
    setToast({ type, text })
    window.setTimeout(() => setToast(null), 4500)
  }

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: storeData }, { data: meData }, { data: producersData, error }] = await Promise.all([
      supabase.from('store_settings').select('name').eq('store', store).maybeSingle(),
      supabase.from('profiles').select('first_name, last_name').eq('id', user?.id ?? '').maybeSingle(),
      supabase
        .from('profiles')
        .select('id, first_name, last_name, org_name, email, phone, department, municipality, document_type, document_number, user_type, created_at, manually_verified_at')
        .eq('store', store)
        .in('user_type', ['asociacion', 'turismo'])
        .order('created_at', { ascending: false }),
    ])
    if (error) console.error('Error cargando productores:', error.message)
    const list = (producersData ?? []) as Producer[]
    setStoreName(storeData?.name ?? store)
    if (meData) setMe({ first_name: meData.first_name ?? '', last_name: meData.last_name ?? '' })
    setProducers(list)
    setDocuments(await fetchDocuments(list.map((p) => p.id)))
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [store])

  // Una notificación de documento nuevo abre la revisión con datos frescos
  usePanelSectionRequest<Section>((s) => { setSection(s); loadAll() }, ['dashboard', 'producers', 'review'])

  const docsOf = (producerId: string) => documents.filter((d) => d.producer_id === producerId)
  // Verificado = RUT aprobado (la Cámara de Comercio es opcional)
  // Verificado manualmente por un superadmin: cuenta como validado aunque no tenga documentos
  const isManual = (producerId: string) => !!producers.find((p) => p.id === producerId)?.manually_verified_at
  const stateOf = (producerId: string) => validationState(docsOf(producerId), isManual(producerId))
  const isCertified = (producerId: string) => stateOf(producerId) === 'validado'
  const q = search.trim().toLowerCase()
  const matches = (p: Producer) => !q || [producerName(p), p.first_name, p.last_name, p.email, p.phone].some((v) => v?.toLowerCase().includes(q))

  const goTo = (s: Section) => {
    setSection(s)
    setSidebarOpen(false)
    setSearch('')
  }

  // ─── Productores ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setSection('producers')
    // La contraseña temporal se genera y se muestra en el popup (se puede cambiar o regenerar)
    setForm({ open: true, editingId: null, data: { ...EMPTY_FORM, password: generateTempPassword() } })
  }
  const openEdit = (p: Producer) => setForm({
    open: true,
    editingId: p.id,
    data: { first_name: p.first_name ?? '', last_name: p.last_name ?? '', org_name: p.org_name ?? '', email: p.email ?? '', phone: p.phone ?? '', department: p.department ?? '', municipality: p.municipality ?? '', document_type: p.document_type ?? '', document_number: p.document_number ?? '', password: '' },
  })
  const closeForm = () => setForm({ open: false, editingId: null, data: EMPTY_FORM })

  const saveProducer = async () => {
    const d = form.data
    const cleaned = {
      first_name: cleanLine(d.first_name),
      last_name: cleanLine(d.last_name),
      org_name: cleanLine(d.org_name),
      phone: onlyPhoneDigits(d.phone),
    }
    const fieldsError = profileFieldsError(cleaned)
    if (fieldsError) return showToast('error', fieldsError)
    // Al crear el documento es obligatorio; al editar productores antiguos puede faltar
    const docError = form.editingId ? validateOptionalDocument(d.document_type, d.document_number) : validateDocument(d.document_type, d.document_number)
    if (docError) return showToast('error', docError)
    if (!d.department || !d.municipality) return showToast('error', 'Selecciona el departamento y el municipio.')
    if (!form.editingId && (d.password.length < MIN_PASSWORD_LENGTH || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password))) {
      return showToast('error', `La contraseña temporal debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres, con letras y números.`)
    }
    setSaving(true)

    if (form.editingId) {
      // Solo datos básicos: el rol y la tienda los protege la BD
      const { data, error } = await supabase
        .from('profiles')
        .update({
          first_name: cleaned.first_name,
          last_name: cleaned.last_name,
          org_name: cleaned.org_name || null,
          phone: cleaned.phone || null,
          department: d.department || null,
          municipality: d.municipality || null,
          ...documentColumns(d.document_type, d.document_number),
        })
        .eq('id', form.editingId)
        .select('id')
      setSaving(false)
      if (error || !data?.length) return showToast('error', `No se pudo guardar: ${error?.message ?? 'no tienes permiso sobre este productor.'}`)
      showToast('ok', 'Productor actualizado.')
    } else {
      if (!isValidEmail(d.email.trim().toLowerCase())) {
        setSaving(false)
        return showToast('error', 'Ingresa un correo válido.')
      }
      // Rol 'asociacion' y tienda los asigna la edge function desde el perfil del administrador
      const password = d.password
      const result = await adminCreateUser({
        email: d.email.trim().toLowerCase(),
        password,
        ...cleaned,
        department: d.department,
        municipality: d.municipality,
        document_type: d.document_type,
        document_number: normalizeDocumentNumber(d.document_number),
        must_change_password: true,
      })
      setSaving(false)
      if (!result.ok) return showToast('error', result.error)
      setCreatedCredentials({ email: d.email.trim(), password })
    }

    closeForm()
    loadAll()
  }

  const deleteProducer = async (p: Producer) => {
    if (!(await confirmDialog({
      title: `¿Eliminar a ${producerName(p)}?`,
      message: 'Se borrará su cuenta y no se puede deshacer.',
      confirmText: 'Eliminar',
      tone: 'danger',
    }))) return
    const result = await adminDeleteUser(p.id)
    if (!result.ok) return showToast('error', result.error)
    showToast('ok', 'Productor eliminado.')
    loadAll()
  }

  // ─── Revisión ─────────────────────────────────────────────────────────────
  const openDocument = async (doc: ProducerDocument) => {
    const url = await getDocumentUrl(doc.file_path)
    if (!url) return showToast('error', 'No se pudo abrir el documento.')
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const review = async (doc: ProducerDocument, approve: boolean, reason?: string) => {
    if (!approve && !reason?.trim()) return showToast('error', 'Escribe el motivo del rechazo.')
    setReviewingId(doc.id)
    const { error } = await reviewDocument(doc.id, approve, reason?.trim())
    setReviewingId(null)
    if (error) return showToast('error', `No se pudo registrar la revisión: ${error.message}`)
    setRejecting(null)
    showToast('ok', approve ? `${DOC_LABELS[doc.doc_type]} aprobado.` : `${DOC_LABELS[doc.doc_type]} rechazado.`)
    setDocuments(await fetchDocuments(producers.map((p) => p.id)))
  }

  // ─── Resumen ──────────────────────────────────────────────────────────────
  const states = producers.map((p) => stateOf(p.id))
  const pendingProducers = producers.filter((p) => docsOf(p.id).some((d) => d.status === 'pendiente'))
  const stats = [
    { emoji: '👥', value: producers.length, label: 'Productores', bg: C.greenSoft, color: C.green },
    { emoji: '✅', value: states.filter((s) => s === 'validado').length, label: 'Validados', bg: C.greenSoft, color: C.green },
    { emoji: '📄', value: pendingProducers.length, label: 'Con documentos por revisar', bg: '#FFF7E8', color: '#C8860A' },
    { emoji: '⚠️', value: states.filter((s) => s === 'rechazado' || s === 'incompleto').length, label: 'Incompletos o rechazados', bg: '#FEE9E1', color: '#C4622D' },
  ]
  const reviewList = producers
    .filter(matches)
    .filter((p) => reviewFilter === 'all' || docsOf(p.id).some((d) => d.status === 'pendiente'))

  const sidebarNav: { id: Section; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Panel Principal', icon: <DashIcon /> },
    { id: 'producers', label: 'Productores', icon: <UsersIcon /> },
    { id: 'review', label: 'Revisión de perfiles', icon: <DocIcon />, badge: pendingProducers.length },
    { id: 'account', label: 'Mi cuenta', icon: <AccountIcon /> },
  ]

  const searchBox = (
    <input type="text" placeholder="Buscar productor por nombre, correo o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, background: '#fff', marginBottom: 18, maxWidth: 420 }} />
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F5EEE6', fontFamily: C.body }}>

      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside
        className={sidebarOpen ? '!flex' : 'hidden md:flex'}
        style={{ width: 240, flexShrink: 0, background: SIDEBAR.bg, flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40, boxShadow: '4px 0 24px rgba(21,56,35,0.18)' }}
      >
        <div style={{ padding: '24px 20px 16px', display: 'flex', justifyContent: 'center' }}>
          {!isMainStore(store) ? (
            <span style={{ fontFamily: C.display, fontSize: 22, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.2, padding: '20px 0' }}>{storeName}</span>
          ) : (
            // El logo va sobre fondo claro para conservar su contraste (manual de identidad)
            <div style={{ background: '#FAF7F0', borderRadius: 18, padding: '8px 14px' }}>
              <img src={logoSrc} alt="Logo" style={{ height: 74, width: 'auto', display: 'block' }} />
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {sidebarNav.map((item) => (
            <SidebarItem key={item.id} icon={item.icon} label={item.label} badge={item.badge} active={section === item.id} onClick={() => goTo(item.id)} />
          ))}
        </nav>

        <div style={{ padding: '14px 16px', borderTop: `1px solid ${SIDEBAR.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: SIDEBAR.active, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {`${me.first_name} ${me.last_name}`.trim() || 'Administrador'}
              </div>
              <div style={{ fontSize: 11, color: SIDEBAR.text }}>Admin de tienda</div>
            </div>
            <button type="button" onClick={() => signOutUser(!isMainStore(store) && storeSlug ? `/${storeSlug}` : '/')} title="Cerrar sesión" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFD3BF', padding: 4 }}>
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
            <button className="flex md:hidden items-center justify-center" type="button" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ width: 38, height: 38, borderRadius: 10, border: 'none', background: C.greenSoft, cursor: 'pointer', color: C.green, flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontFamily: C.display, fontSize: 20, fontWeight: 700, color: C.dark, lineHeight: 1.2 }}>{SECTION_LABEL[section]}</h1>
              <p style={{ margin: 0, fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Administración de {storeName}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <NotificationBell buttonStyle={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff' }} />
            {/* Vitrina de la tienda que administra (para volver: el logo lleva a su panel) */}
            <button type="button" onClick={() => onNavigate(isMainStore(store) ? 'market' : 'store')} title="Ver la tienda como la ven los compradores" style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
              <span aria-hidden="true">🛍️</span>
              <span className="hidden sm:inline">Ver tienda</span>
            </button>
            {section === 'producers' && (
              <button type="button" onClick={openCreate} style={btnPrimary}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
                <span className="hidden sm:inline">Nuevo Productor</span>
              </button>
            )}
          </div>
        </header>

        <main className="p-4 md:p-6" style={{ flex: 1, boxSizing: 'border-box', minWidth: 0 }}>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse" style={{ background: '#fff', borderRadius: 20, height: 100, border: `1px solid ${C.border}` }} />)}
            </div>
          ) : (
            <>
              {/* DASHBOARD */}
              {section === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    {stats.map((s) => (
                      <div key={s.label} style={{ background: '#fff', borderRadius: 20, padding: '20px 22px', border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(32,81,52,0.05)' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 14 }}>{s.emoji}</div>
                        <div style={{ fontFamily: C.display, fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                      <h3 style={{ fontFamily: C.display, fontSize: 17, color: C.green, margin: 0, fontWeight: 700 }}>Documentos por revisar</h3>
                      {pendingProducers.length > 0 && <button type="button" style={btnGhost} onClick={() => goTo('review')}>Ir a revisión →</button>}
                    </div>
                    {pendingProducers.length === 0 ? (
                      <div style={{ fontSize: 14, color: C.muted }}>No hay documentos pendientes de revisión. 🎉</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {pendingProducers.slice(0, 6).map((p) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 12, borderBottom: '1px solid #F3ECE2', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C8860A', flexShrink: 0 }} />
                              <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{producerName(p)}</span>
                              {isCertified(p.id) && <CertifiedBadge />}
                            </div>
                            <span style={{ fontSize: 12, color: C.muted }}>
                              {docsOf(p.id).filter((d) => d.status === 'pendiente').map((d) => DOC_LABELS[d.doc_type]).join(' · ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PRODUCTORES */}
              {section === 'producers' && (
                <>
                  {createdCredentials && (
                    <div style={{ ...card, marginBottom: 18, borderColor: '#C8E6C9', background: C.greenSoft }}>
                      <div style={{ fontWeight: 800, color: C.green, marginBottom: 6 }}>✅ Productor creado</div>
                      <div style={{ fontSize: 13, color: C.dark }}>
                        Entrégale estos datos de acceso. Al ingresar deberá crear su propia contraseña.
                        <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 14 }}>
                          Correo: <strong>{createdCredentials.email}</strong><br />
                          Contraseña temporal: <strong>{createdCredentials.password}</strong>
                        </div>
                      </div>
                      <button type="button" style={{ ...btnGhost, marginTop: 10 }} onClick={() => setCreatedCredentials(null)}>Entendido</button>
                    </div>
                  )}

                  {searchBox}

                  <div style={{ background: '#fff', borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: '0 4px 20px rgba(32,81,52,0.05)', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                            {['Productor', 'Contacto', 'Ubicación', 'Validación', 'Acciones'].map((h) => <th key={h} style={th}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {producers.filter(matches).length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: 36, textAlign: 'center', color: C.muted, fontSize: 14 }}>No hay productores en esta tienda.</td></tr>
                          ) : producers.filter(matches).map((p) => {
                            const vs = VALIDATION_STATE[stateOf(p.id)]
                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid #F3ECE2' }} className="hover:bg-[#FDFAF6]">
                                <td style={td}>
                                  <div style={{ fontWeight: 700, color: C.dark, display: 'flex', alignItems: 'center', gap: 6 }}>{producerName(p)}{isCertified(p.id) && <CertifiedBadge />}</div>
                                  <div style={{ fontSize: 12, color: C.muted }}>{p.first_name} {p.last_name} · desde {formatDate(p.created_at)}</div>
                                </td>
                                <td style={td}>
                                  <div>{p.email || '—'}</div>
                                  {p.phone && <div style={{ fontSize: 12 }}>📞 {p.phone}</div>}
                                </td>
                                <td style={td}>{[p.municipality, p.department].filter(Boolean).join(', ') || '—'}</td>
                                <td style={td}><Pill {...vs} /></td>
                                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button type="button" style={btnGhost} onClick={() => openEdit(p)}>✏️ Editar</button>
                                    <button type="button" style={{ ...btnGhost, color: C.red }} onClick={() => deleteProducer(p)}>🗑️ Eliminar</button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* REVISIÓN DE PERFILES */}
              {section === 'review' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setReviewFilter('pending')} style={{ ...btnGhost, background: reviewFilter === 'pending' ? C.green : '#fff', color: reviewFilter === 'pending' ? '#fff' : C.green }}>Con documentos pendientes</button>
                    <button type="button" onClick={() => setReviewFilter('all')} style={{ ...btnGhost, background: reviewFilter === 'all' ? C.green : '#fff', color: reviewFilter === 'all' ? '#fff' : C.green }}>Todos los productores</button>
                  </div>
                  {searchBox}

                  {reviewList.length === 0 ? (
                    <div style={{ ...card, textAlign: 'center', color: C.muted }}>
                      {reviewFilter === 'pending' ? 'No hay documentos pendientes de revisión. 🎉' : 'No hay productores en esta tienda.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {reviewList.map((p) => {
                        const docs = docsOf(p.id)
                        const vs = VALIDATION_STATE[stateOf(p.id)]
                        return (
                          <div key={p.id} style={card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                              <div>
                                <div style={{ fontFamily: C.display, fontWeight: 700, color: C.dark, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>{producerName(p)}{isCertified(p.id) && <CertifiedBadge size={22} />}</div>
                                <div style={{ fontSize: 12, color: C.muted }}>{p.email}{p.phone ? ` · ${p.phone}` : ''}</div>
                              </div>
                              <Pill {...vs} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                              {PRODUCER_DOCS.map(({ type, label, required }) => {
                                const doc = docs.find((d) => d.doc_type === type)
                                const st = doc ? DOC_STATUS[doc.status] : null
                                return (
                                  <div key={type} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                      <span style={{ fontWeight: 800, color: C.green, fontSize: 14 }}>
                                        {label}
                                        {!required && <span style={{ fontWeight: 600, color: C.muted, fontSize: 12 }}> (opcional)</span>}
                                      </span>
                                      {st ? <Pill {...st} /> : <Pill label="Sin cargar" bg="#F3ECE2" color="#7A5C3A" />}
                                    </div>
                                    {doc ? (
                                      <>
                                        <div style={{ fontSize: 12, color: C.text, wordBreak: 'break-all' }}>{doc.file_name}</div>
                                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Cargado el {formatDate(doc.submitted_at)}{doc.reviewed_at ? ` · Revisado el ${formatDate(doc.reviewed_at)}` : ''}</div>
                                        {doc.status === 'rechazado' && doc.rejection_reason && (
                                          <div style={{ fontSize: 12, color: '#C53030', marginTop: 6 }}>Motivo: {doc.rejection_reason}</div>
                                        )}

                                        {/* Empuja las acciones al fondo para alinear las tarjetas */}
                                        <div style={{ flex: 1, minHeight: 10 }} />
                                        {rejecting?.docId === doc.id ? (
                                          <div>
                                            <textarea rows={2} value={rejecting.reason} onChange={(e) => setRejecting({ docId: doc.id, reason: e.target.value })} placeholder="Motivo del rechazo (lo verá el productor)" style={{ ...inputStyle, resize: 'vertical', background: '#fff' }} />
                                            <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                                              <button type="button" style={btnGhost} onClick={() => setRejecting(null)}>Cancelar</button>
                                              <button type="button" disabled={reviewingId === doc.id} style={{ ...btnGhost, background: C.red, color: '#fff', borderColor: C.red }} onClick={() => review(doc, false, rejecting.reason)}>Confirmar rechazo</button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <button type="button" style={btnGhost} onClick={() => openDocument(doc)}>👁️ Ver / descargar</button>
                                            {doc.status !== 'aprobado' && (
                                              <button type="button" disabled={reviewingId === doc.id} style={{ ...btnGhost, background: C.green, color: '#fff', borderColor: C.green }} onClick={() => review(doc, true)}>✓ Aprobar</button>
                                            )}
                                            {doc.status !== 'rechazado' && (
                                              <button type="button" disabled={reviewingId === doc.id} style={{ ...btnGhost, color: C.red }} onClick={() => setRejecting({ docId: doc.id, reason: '' })}>✕ Rechazar</button>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div style={{ fontSize: 12, color: C.muted }}>El productor aún no ha cargado este documento.</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Datos personales y contraseña del propio administrador */}
              {section === 'account' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
                  <MyAccountCard onSaved={loadAll} />
                  <ChangePasswordCard />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── POPUP CREAR / EDITAR PRODUCTOR (mismo estilo que el superadmin) ── */}
      {form.open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(21,56,35,0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #D9CFBF', borderRadius: 24, padding: 'clamp(20px, 5vw, 32px)', width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontFamily: C.display, fontSize: 20, color: C.green, margin: 0, fontWeight: 700 }}>
                {form.editingId ? '✏️ Editar productor' : '👤 Nuevo productor'}
              </h3>
              <button type="button" onClick={closeForm} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 22, color: '#9E9384', cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: C.muted, margin: '0 0 18px' }}>
              Rol: <strong>Asociación</strong> · Tienda: <strong>{storeName}</strong>. Se asignan automáticamente; solo un superadministrador puede cambiarlos.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); saveProducer() }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nombre *</label>
                  <input style={inputStyle} placeholder="Ej: Carlos" required value={form.data.first_name} onChange={(e) => setForm({ ...form, data: { ...form.data, first_name: e.target.value } })} />
                </div>
                <div>
                  <label style={labelStyle}>Apellido</label>
                  <input style={inputStyle} placeholder="Ej: Pérez" value={form.data.last_name} onChange={(e) => setForm({ ...form, data: { ...form.data, last_name: e.target.value } })} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Organización / Asociación</label>
                <input style={inputStyle} placeholder="Ej: Finca La Esperanza" value={form.data.org_name} onChange={(e) => setForm({ ...form, data: { ...form.data, org_name: e.target.value } })} />
              </div>

              <div>
                <label style={labelStyle}>WhatsApp</label>
                <input style={inputStyle} {...phoneInputProps} value={onlyPhoneDigits(form.data.phone)} onChange={(e) => setForm({ ...form, data: { ...form.data, phone: onlyPhoneDigits(e.target.value) } })} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Correo electrónico {form.editingId ? '' : '*'}</label>
                  <input type="email" style={{ ...inputStyle, opacity: form.editingId ? 0.6 : 1 }} placeholder="usuario@ejemplo.com" required={!form.editingId} disabled={!!form.editingId} title={form.editingId ? 'El correo de acceso no se puede cambiar desde aquí' : undefined} value={form.data.email} onChange={(e) => setForm({ ...form, data: { ...form.data, email: e.target.value } })} />
                </div>
                {!form.editingId && (
                  <div>
                    <label style={labelStyle}>Contraseña temporal *</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: 0.5 }}
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        value={form.data.password}
                        onChange={(e) => setForm({ ...form, data: { ...form.data, password: e.target.value.trim() } })}
                      />
                      <button type="button" title="Generar otra" onClick={() => setForm({ ...form, data: { ...form.data, password: generateTempPassword() } })} style={{ ...btnGhost, padding: '0 12px', flexShrink: 0 }}>↻</button>
                    </div>
                  </div>
                )}
              </div>
              {!form.editingId && (
                <p style={{ fontSize: 12, color: C.muted, margin: '-4px 0 0' }}>Entrégale esta contraseña al productor: al ingresar deberá crear la suya.</p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <DocumentFields
                  documentType={form.data.document_type}
                  documentNumber={form.data.document_number}
                  onChange={({ documentType, documentNumber }) => setForm((f) => ({ ...f, data: { ...f.data, document_type: documentType, document_number: documentNumber } }))}
                  labelStyle={labelStyle}
                  inputStyle={inputStyle}
                  required={!form.editingId}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <LocationFields
                  department={form.data.department}
                  municipality={form.data.municipality}
                  onChange={(loc) => setForm((f) => ({ ...f, data: { ...f.data, ...loc } }))}
                  labelStyle={labelStyle}
                  inputStyle={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button type="button" onClick={closeForm} style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #D9CFBF', background: '#FFFFFF', color: C.text, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', padding: 12, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Guardando…' : form.editingId ? 'Guardar cambios' : '✨ Crear productor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: toast.type === 'ok' ? C.green : '#C53030', color: '#fff', padding: '12px 20px', borderRadius: 14, fontSize: 14, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxWidth: 'calc(100vw - 32px)' }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
