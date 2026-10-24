import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import logoSrc from '../assets/logo-nofond.png'
import ExperienceModal, { type ExperienceFormData } from '../components/ExperienceModal'
import ProductModal, { type ProductFormData } from '../components/ProductModal'
import { persistProductVariants } from '../lib/variants'
import { deleteExperienceWithFiles, deleteProductWithFiles } from '../lib/storageCleanup'
import OrdersTable, { OrderStatusSummary } from '../components/OrdersTable'
import ChangePasswordCard from '../components/ChangePasswordCard'
import NotificationBell from '../components/NotificationBell'
import { usePanelSectionRequest } from '../lib/notifications'
import ProducerDocumentsCard from '../components/ProducerDocumentsCard'
import CertifiedBadge from '../components/CertifiedBadge'
import { onlyPhoneDigits, phoneInputProps } from '../lib/phone'
import { confirmGoToDocuments, fetchDocuments, fetchManualVerifications, validationState, VALIDATION_STATE, type ValidationState } from '../lib/producerDocuments'
import { alertDialog, confirmDialog } from '../components/ConfirmDialog'
import { fetchOrderItems, fetchOrderStatuses, summarizeStatusesByItem, type OrderItemRow, type OrderStatus } from '../lib/orders'
import { isMainStore, type StoreId } from '../lib/stores'
import { useStores } from '../lib/storesContext'
import { useAuth } from '../lib/auth'
import { useAppNavigation } from '../lib/navigation'
import type { Tab, UserRole } from '../lib/types'
import LocationFields from '../components/LocationFields'
import DocumentFields from '../components/DocumentFields'
import { DEPARTMENTS } from '../lib/geo'
import { normalizeDocumentNumber, validateDocument } from '../lib/identity'
import { primaryImageUrl } from '../lib/catalog'

type AdminSection = 'dashboard' | 'products' | 'experiences' | 'orders' | 'inventory' | 'reports' | 'settings'

interface ProductItem {
  id: string
  title: string
  producer: string  // products: producer, experiences: host
  price: number
  stock: string     // products: stock, experiences: capacity (numeric part)
  unit: string
  category: string
  category_id: string
  origin: string
  description: string
  img: string
  type?: string
  // Campos extra de experiences
  duration?: string
  capacity?: string
  tags?: string[]
  certified?: boolean
  /** Inventario por combinación: stock es la suma de las combinaciones */
  hasVariants?: boolean
}

interface ActivityItem {
  id: string
  type: string
  title: string
  description: string
  created_at: string
}

interface ProfileData {
  id: string
  first_name: string
  last_name: string
  org_name: string
  department: string
  municipality: string
  user_type: string
}

interface Props {
  onNavigate: (tab: Tab) => void
  activeNav?: Tab
  onProfileClick?: () => void
  userRole?: UserRole | null
  /** Tienda del productor (profiles.store): define la marca del panel y a qué tienda lleva "Ver Tienda" */
  store?: StoreId
}

const PAGE_SIZE = 10

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Hace un momento'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  return `Hace ${Math.floor(diff / 86400)} días`
}

interface SidebarItemProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}

function SidebarItem({ icon, label, active, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
        border: 'none', background: active ? '#EAF3EC' : 'transparent', cursor: 'pointer',
        width: '100%', textAlign: 'left', color: active ? '#205134' : '#5A5248',
        fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: active ? 700 : 600,
        transition: 'all 180ms ease',
      }}
    >
      <span style={{ opacity: active ? 1 : 0.6 }}>{icon}</span>
      {label}
    </button>
  )
}

export default function AdminPanelScreen({ onNavigate, userRole, store = 'campo' }: Props) {
  // Productor de una tienda aliada: su panel lleva la marca de su tienda
  const isAllied = !isMainStore(store)
  const { storeName } = useStores()
  const { roles } = useAuth()
  const { switchRole } = useAppNavigation()
  const [section, setSection] = useState<AdminSection>('dashboard')
  // Una notificación de pedido nuevo abre la sección de pedidos
  // Notificaciones: pedido nuevo abre Pedidos; revisión de documentos abre Configuración
  usePanelSectionRequest<AdminSection>((s) => { setSection(s); loadData(true) }, ['orders', 'settings'])
  // Validación documental: sin RUT aprobado no se puede publicar (la BD lo bloquea)
  const [validation, setValidation] = useState<ValidationState | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [products, setProducts] = useState<ProductItem[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData>({ id: '', first_name: '', last_name: '', org_name: '', department: '', municipality: '', user_type: userRole ?? 'asociacion' })
  const [stats, setStats] = useState({ activeItems: 0, salesThisMonth: 0, totalIncome: 0, lowStockCount: 0 })

  const [searchVal, setSearchVal] = useState('')
  const [catFilter, setCatFilter] = useState('Todas')
  const [page, setPage] = useState(1)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', category_id: '', price: '', unit: 'uds', stockNum: '45', origin: '', description: '', img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&h=400&fit=crop&auto=format' })

  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '', org_name: '', phone: '', department: '', municipality: '', document_type: '', document_number: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  // Modal de edicion de stock
  const [stockModal, setStockModal] = useState<{ product: ProductItem; newStock: string } | null>(null)
  const [savingStock, setSavingStock] = useState(false)

  const handleSaveStock = async () => {
    if (!stockModal) return
    setSavingStock(true)
    const newVal = parseInt(stockModal.newStock) || 0
    let error
    if (isTurismo) {
      // Para turismo actualizamos capacity como texto en experiences
      ;({ error } = await supabase.from('experiences').update({ capacity: `${newVal} personas` }).eq('id', stockModal.product.id))
    } else {
      ;({ error } = await supabase.from('products').update({ stock: String(newVal) }).eq('id', stockModal.product.id))
    }
    if (!error) {
      setProducts(prev => prev.map(p => p.id === stockModal.product.id ? { ...p, stock: String(newVal) } : p))
      setStockModal(null)
    }
    setSavingStock(false)
  }

  // Datos dinámicos desde Supabase
  const [categories, setCategories] = useState<{ id: string; name: string; business_type: string }[]>([])
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([])
  const [orderStatuses, setOrderStatuses] = useState<OrderStatus[]>([])

  const isTurismo = userRole === 'turismo'

  // silent: recarga sin mostrar el esqueleto de carga (ej. tras cambiar el estado de un pedido)
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: profileData }, { data: actData }, { data: catsData }, statusesData, itemsData] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, org_name, phone, department, municipality, user_type, document_type, document_number').eq('id', user.id).single(),
      supabase.from('activities').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
      supabase.from('categories').select('id, name, business_type').eq('active', true).eq('business_type', userRole === 'turismo' ? 'turismo' : 'asociacion'),
      fetchOrderStatuses(),
      fetchOrderItems(user.id),
    ])

    setOrderStatuses(statusesData)
    setOrderItems(itemsData)
    const [myDocs, manual] = await Promise.all([fetchDocuments([user.id]), fetchManualVerifications([user.id])])
    setValidation(validationState(myDocs, manual.has(user.id)))

    if (profileData) {
      setProfile(profileData as ProfileData)
      setProfileForm({ first_name: profileData.first_name ?? '', last_name: profileData.last_name ?? '', org_name: profileData.org_name ?? '', phone: profileData.phone ?? '', department: profileData.department ?? '', municipality: profileData.municipality ?? '', document_type: profileData.document_type ?? '', document_number: profileData.document_number ?? '' })
    }

    if (catsData && catsData.length > 0) setCategories(catsData as { id: string; name: string; business_type: string }[])

    const currentOrg = profileData?.org_name?.trim()
      || `${profileData?.first_name ?? ''} ${profileData?.last_name ?? ''}`.trim()

    if (isTurismo) {
      // Cargar experiencias desde tabla experiences con sus imagenes
      const { data: expData } = await supabase.from('experiences').select('*, images(*)').eq('host_id', user.id).order('created_at', { ascending: false })
      const exps: ProductItem[] = (expData ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        producer: currentOrg || e.host || '',
        price: e.price || 0,
        stock: String(parseInt(e.capacity ?? '') || e.capacity || '0'),
        unit: 'pers',
        category: e.tags?.[0] || '',
        category_id: '',
        origin: '',
        description: e.description || '',
        img: primaryImageUrl(e.images, 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&h=700&fit=crop&auto=format'),
        duration: e.duration ?? undefined,
        capacity: e.capacity ?? undefined,
        tags: e.tags ?? undefined,
      }))
      setProducts(exps)
      setStats({ activeItems: exps.length, salesThisMonth: 0, totalIncome: 0, lowStockCount: exps.filter(e => (parseInt(e.stock) || 0) < 5).length })
    } else {
      // Cargar productos desde tabla products con sus imagenes
      const { data: userProducts } = await supabase.from('products').select('*, images(*)').eq('producer_id', user.id).order('created_at', { ascending: false })
      const prods: ProductItem[] = (userProducts ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        producer: currentOrg || p.producer || 'Productor',
        price: p.price,
        stock: p.stock ?? '0',
        unit: p.unit ?? 'kg',
        category: catsData?.find((c) => c.id === p.category_id)?.name ?? '',
        category_id: p.category_id ?? '',
        origin: '',
        description: p.description || '',
        img: primaryImageUrl(p.images, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&h=400&fit=crop&auto=format'),
        certified: p.certified ?? undefined,
        hasVariants: p.has_variants,
      }))
      setProducts(prods)
      const lowStock = prods.filter((p) => { const n = parseInt(p.stock) || 0; return n < 20 }).length
      setStats({ activeItems: prods.length, salesThisMonth: 0, totalIncome: 0, lowStockCount: lowStock })
    }

    if (actData && actData.length > 0) setActivities(actData as ActivityItem[])
    else setActivities([
      { id: '1', type: 'sale', title: 'Nueva venta', description: 'Productos', created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: '2', type: 'product', title: 'Producto actualizado', description: 'Stock actualizado', created_at: new Date(Date.now() - 86400000).toISOString() },
    ])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filtered = products.filter((p) => {
    const q = searchVal.trim().toLowerCase()
    const matchSearch = !q || p.title.toLowerCase().includes(q) || (p.producer || '').toLowerCase().includes(q)
    if (isTurismo) return matchSearch // para turismo ya filtramos por host_id en loadData
    // Para asociacion: filtrar por búsqueda y categoría
    const categoryName = categories.find(c => c.id === p.category_id)?.name || p.category || ''
    const matchCat = catFilter === 'Todas' || categoryName === catFilter
    return matchSearch && matchCat
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleOpenCreate = async () => {
    if (validation !== 'validado') {
      if (await confirmGoToDocuments()) setSection('settings')
      return
    }
    setEditingId(null)
    const defaultCatId = categories.length > 0 ? categories[0].id : ''
    const defaultDept = profile.department || DEPARTMENTS[0]?.name || ''
    setForm({ title: '', category_id: defaultCatId, price: '', unit: isTurismo ? 'pers' : 'uds', stockNum: '45', origin: defaultDept, description: '', img: '' })
    setShowModal(true)
  }

  const handleOpenEdit = (p: ProductItem) => {
    setEditingId(p.id)
    setForm({ title: p.title, category_id: p.category_id || '', price: String(p.price), unit: p.unit || 'uds', stockNum: String(parseInt(p.stock) || 0), origin: p.origin || '', description: p.description || '', img: p.img })
    setShowModal(true)
  }

  const handleSaveProduct = async (formData: ProductFormData) => {
    if (!formData.title.trim() || !formData.price) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const orgName = profile.org_name || `${profile.first_name} ${profile.last_name}`.trim() || 'Organizacion'

    const commonPayload = {
      title: formData.title.trim(),
      producer: orgName,
      price: Number(formData.price),
      unit: formData.unit || 'und',
      category_id: formData.category_id || null,
      certified: formData.certified ?? true,
      stock: `${formData.stockNum || '0'}`,
      description: formData.description ? formData.description.trim() : null,
    }
    
    let savedProductId = editingId
    // Si falla, se avisa y el formulario queda abierto para corregir
    const { data, error } = editingId
      ? await supabase.from('products').update(commonPayload).eq('id', editingId).select('id')
      : await supabase.from('products').insert([{ ...commonPayload, producer_id: user.id }]).select('id')
    if (error || !data?.length) {
      setSaving(false)
      await alertDialog({ title: editingId ? 'No se pudo guardar el producto' : 'No se pudo crear el producto', message: error?.message ?? 'No tienes permiso para modificar este producto.', tone: 'danger' })
      return
    }
    savedProductId = data[0].id

    if (savedProductId && formData.uploadedImages && formData.uploadedImages.length > 0) {
      if (formData.uploadedImages.some((i) => i.isPrimary)) {
        await supabase.from('images').update({ is_primary: false }).eq('product_id', savedProductId)
      }
      const imageRows = formData.uploadedImages.map((img) => ({
        product_id: savedProductId,
        experience_id: null,
        storage_path: img.storagePath,
        image_url: img.imageUrl,
        is_primary: img.isPrimary,
        sort_order: img.sortOrder,
      }))
      const { error: imgErr } = await supabase.from('images').insert(imageRows)
      if (imgErr) await alertDialog({ title: 'El producto se guardó, pero sus imágenes no', message: imgErr.message, tone: 'warning' })
    }

    const variantsError = await persistProductVariants(data[0].id, formData.variants, formData.hadVariants, formData.stockNum, formData.variantImagesToDelete)
    if (variantsError) await alertDialog({ title: 'El producto se guardó, pero sus variantes no', message: variantsError, tone: 'warning' })
    
    setSaving(false)
    setShowModal(false)
    loadData()
  }

  const handleSaveExperience = async (formData: ExperienceFormData) => {
    if (!formData.title.trim() || !formData.price) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    
    const orgName = profile.org_name || `${profile.first_name} ${profile.last_name}`.trim() || 'Comunidad local'
    const expPayload = {
      title: formData.title.trim(),
      host: orgName,
      price: Number(formData.price),
      capacity: `${formData.capacity || '10'} personas`,
      duration: formData.duration || '2 horas',
      description: formData.description ? formData.description.trim() : null,
      tags: formData.tags ? formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : (categories.find(c => c.id === formData.category_id)?.name ? [categories.find(c => c.id === formData.category_id)!.name] : ['Experiencia']),
      featured: formData.featured ?? true,
    }

    let savedExpId = editingId
    // Si falla, se avisa y el formulario queda abierto para corregir
    const { data, error } = editingId
      ? await supabase.from('experiences').update(expPayload).eq('id', editingId).select('id')
      : await supabase.from('experiences').insert([{ ...expPayload, host_id: user.id }]).select('id')
    if (error || !data?.length) {
      setSaving(false)
      await alertDialog({ title: editingId ? 'No se pudo guardar la experiencia' : 'No se pudo crear la experiencia', message: error?.message ?? 'No tienes permiso para modificar esta experiencia.', tone: 'danger' })
      return
    }
    savedExpId = data[0].id

    if (savedExpId && formData.uploadedImages && formData.uploadedImages.length > 0) {
      if (formData.uploadedImages.some((i) => i.isPrimary)) {
        await supabase.from('images').update({ is_primary: false }).eq('experience_id', savedExpId)
      }
      const imageRows = formData.uploadedImages.map((img) => ({
        product_id: null,
        experience_id: savedExpId,
        storage_path: img.storagePath,
        image_url: img.imageUrl,
        is_primary: img.isPrimary,
        sort_order: img.sortOrder,
      }))
      const { error: imgErr } = await supabase.from('images').insert(imageRows)
      if (imgErr) await alertDialog({ title: 'La experiencia se guardó, pero sus imágenes no', message: imgErr.message, tone: 'warning' })
    }

    setSaving(false)
    setShowModal(false)
    loadData()
  }


  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: '¿Eliminar este elemento?', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', tone: 'danger' }))) return
    // Se borra el registro y luego sus fotos del Storage
    const { error } = isTurismo ? await deleteExperienceWithFiles(id) : await deleteProductWithFiles(id)
    if (error) {
      await alertDialog({ title: 'No se pudo eliminar', message: error, tone: 'danger' })
      return
    }
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  const handleSaveProfile = async () => {
    const docError = validateDocument(profileForm.document_type, profileForm.document_number)
    if (docError) {
      setProfileMsg('Error: ' + docError)
      return
    }
    if (!profileForm.department || !profileForm.municipality) {
      setProfileMsg('Error: selecciona el departamento y el municipio.')
      return
    }
    setSavingProfile(true)
    setProfileMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingProfile(false); return }
    const { error } = await supabase.from('profiles').update({
      first_name: profileForm.first_name,
      last_name: profileForm.last_name,
      org_name: profileForm.org_name,
      phone: onlyPhoneDigits(profileForm.phone) || null,
      department: profileForm.department,
      municipality: profileForm.municipality,
      document_type: profileForm.document_type,
      document_number: normalizeDocumentNumber(profileForm.document_number),
    }).eq('id', user.id)
    if (error) {
      setSavingProfile(false)
      setProfileMsg('Error al guardar: ' + error.message)
      return
    }

    // Sincronizar el nombre visible en productos y experiencias ya publicados
    const displayName = profileForm.org_name?.trim()
      || `${profileForm.first_name ?? ''} ${profileForm.last_name ?? ''}`.trim()
      || 'Productor'

    await Promise.all([
      supabase.from('products').update({ producer: displayName }).eq('producer_id', user.id),
      supabase.from('experiences').update({ host: displayName }).eq('host_id', user.id),
    ])

    setSavingProfile(false)
    setProfileMsg('Perfil actualizado.')
    setProfile((prev) => ({ ...prev, ...profileForm }))
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #EDE4D8', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'Nunito Sans', sans-serif", background: '#FDFAF6', color: '#1C3A14' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#205134', fontFamily: "'Nunito Sans', sans-serif", marginBottom: 5 }

  const DashIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
  const ProdIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></svg>
  const ExpIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
  const InvIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>
  const RepIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
  const CartIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20.5" r="1.3" /><circle cx="18" cy="20.5" r="1.3" /><path d="M2 3h2.6l2.4 11.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L21.4 7H5.6" /></svg>
  const CogIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>

  const orgName = profile.org_name || `${profile.first_name} ${profile.last_name}`.trim() || 'Asociacion'
  const sidebarNav = [
    { id: 'dashboard' as AdminSection, label: 'Panel Principal', icon: <DashIcon /> },
    ...(!isTurismo ? [{ id: 'products' as AdminSection, label: 'Productos', icon: <ProdIcon /> }] : []),
    ...(isTurismo ? [{ id: 'experiences' as AdminSection, label: 'Experiencias', icon: <ExpIcon /> }] : []),
    // Inventario para todos los roles
    { id: 'orders' as AdminSection, label: isTurismo ? 'Reservas / Pedidos' : 'Pedidos', icon: <ProdIcon /> },
    { id: 'inventory' as AdminSection, label: isTurismo ? 'Cupos / Stock' : 'Inventario', icon: <InvIcon /> },
    { id: 'reports' as AdminSection, label: 'Reportes y Ventas', icon: <RepIcon /> },
    { id: 'settings' as AdminSection, label: 'Configuracion', icon: <CogIcon /> },
  ]
  const sectionLabel: Record<AdminSection, string> = { dashboard: 'Panel Principal', products: 'Productos', experiences: 'Experiencias', orders: 'Pedidos', inventory: 'Inventario', reports: 'Reportes y Ventas', settings: 'Configuracion de Perfil' }
  const isTableSection = section === 'products' || section === 'experiences'
  const orderSummary = summarizeStatusesByItem(orderItems, orderStatuses)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F5EEE6', fontFamily: "'Nunito Sans', sans-serif" }}>

      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside
        className={sidebarOpen ? '!flex' : 'hidden md:flex'}
        style={{ width: 240, flexShrink: 0, background: '#FDFAF6', borderRight: '1px solid #EDE4D8', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40, boxShadow: '2px 0 16px rgba(32,81,52,0.06)' }}
      >
        <div style={{ padding: '24px 20px 16px', display: 'flex', justifyContent: 'center' }}>
          {isAllied ? (
            <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, fontWeight: 800, color: '#205134', textAlign: 'center', lineHeight: 1.2, padding: '20px 0' }}>{storeName(store)}</span>
          ) : (
            <img src={logoSrc} alt="Logo" style={{ height: 90, width: 'auto', display: 'block' }} />
          )}
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {sidebarNav.map((item) => (
            <SidebarItem key={item.id} icon={item.icon} label={item.label} active={section === item.id} onClick={() => { setSection(item.id); setSidebarOpen(false); setPage(1); setSearchVal(''); setCatFilter('Todas') }} />
          ))}
          {/* La cuenta también es Comprador: pasar a su panel de compras */}
          {roles.includes('comprador') && (
            <>
              <div style={{ height: 1, background: '#EDE4D8', margin: '10px 6px' }} />
              <SidebarItem icon={<CartIcon />} label="Usar como comprador" active={false} onClick={() => { setSidebarOpen(false); switchRole('comprador') }} />
            </>
          )}
        </nav>

        <div style={{ padding: '14px 16px', borderTop: '1px solid #EDE4D8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EAF3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#205134" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1C3A14', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {`${profile.first_name} ${profile.last_name}`.trim() || 'Administrador'}
              </div>
              <div style={{ fontSize: 11, color: '#8A8070' }}>{isTurismo ? 'Turismo' : 'Asociacion'}</div>
            </div>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/'; }} title="Cerrar sesion" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C4622D', padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0 }} className="md:ml-[240px]">
        <header className="px-4 md:px-6" style={{ position: 'sticky', top: 0, zIndex: 20, background: '#FDFAF6', borderBottom: '1px solid #EDE4D8', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, boxShadow: '0 2px 10px rgba(32,81,52,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <button className="flex md:hidden items-center justify-center" type="button" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: 'none', background: '#EAF3EC', cursor: 'pointer', color: '#205134' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 20, fontWeight: 700, color: '#1C3A14', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sectionLabel[section]}</h1>
              <p className="hidden sm:block" style={{ margin: 0, fontSize: 12, color: '#8A8070', fontWeight: 600 }}>{isTurismo ? 'Gestiona tus experiencias' : 'Administra tu catalogo de productos'}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {validation === 'validado' && (
              <>
                <span className="hidden sm:inline-flex"><CertifiedBadge label="Verificado" size={24} /></span>
                <span className="inline-flex sm:hidden"><CertifiedBadge size={28} /></span>
              </>
            )}
            <button type="button" onClick={() => onNavigate(isTurismo ? 'tourism' : isAllied ? 'store' : 'market')} style={{ height: 38, minWidth: 38, padding: '0 12px', borderRadius: 10, border: '1px solid #EDE4D8', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#1C3A14', fontWeight: 700, fontSize: 14 }} className="hover:bg-[#F5EEE6]" title={isTurismo ? 'Ir a Experiencias' : 'Ir a la Tienda'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              <span className="hidden sm:inline">{isTurismo ? 'Ver Experiencias' : 'Ver Tienda'}</span>
            </button>
            <NotificationBell buttonStyle={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #EDE4D8', background: '#fff' }} />
            {isTableSection && (
              <button type="button" onClick={handleOpenCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, background: section === 'experiences' ? '#9B4728' : '#205134', color: '#fff', border: 'none', borderRadius: 12, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito Sans', sans-serif", boxShadow: '0 4px 14px rgba(32,81,52,0.25)' }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
                <span className="hidden sm:inline">{section === 'experiences' ? 'Nueva Experiencia' : 'Nuevo Producto'}</span>
              </button>
            )}
          </div>
        </header>

        <main className="p-4 md:p-6" style={{ flex: 1, boxSizing: 'border-box', minWidth: 0 }}>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse" style={{ background: '#fff', borderRadius: 20, height: 100, border: '1px solid #EDE4D8' }} />)}
            </div>
          ) : (
            <>
              {validation && validation !== 'validado' && (
                <div style={{ background: '#FFF7E8', border: '1px solid #F0D099', borderRadius: 16, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: '#9B4728', fontWeight: 700 }}>
                    {VALIDATION_STATE[validation].label}: aún no puedes publicar {isTurismo ? 'experiencias' : 'productos'}. Carga tu RUT y espera la aprobación del administrador de tu tienda.
                  </div>
                  {section !== 'settings' && (
                    <button type="button" onClick={() => setSection('settings')} style={{ background: '#205134', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Cargar documentos
                    </button>
                  )}
                </div>
              )}
              {/* DASHBOARD */}
              {section === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    {[
                      { emoji: '✅', value: stats.activeItems, label: 'Items activos', bg: '#EAF3EC', color: '#205134' },
                      { emoji: '📈', value: stats.salesThisMonth, label: isTurismo ? 'Reservas este mes' : 'Ventas este mes', bg: '#EAF3EC', color: '#205134' },
                      { emoji: '💰', value: formatPrice(stats.totalIncome), label: 'Ingresos totales', bg: '#FFF7E8', color: '#C8860A' },
                      ...(isTurismo
                        ? [{ emoji: '🌄', value: products.length, label: 'Experiencias activas', bg: '#EAF3EC', color: '#205134' }]
                        : [{ emoji: '⚠️', value: stats.lowStockCount, label: 'Stock bajo', bg: '#FEE9E1', color: '#C4622D' }]
                      ),
                    ].map((card) => (
                      <div key={card.label} style={{ background: '#fff', borderRadius: 20, padding: '20px 22px', border: '1px solid #EDE4D8', boxShadow: '0 4px 16px rgba(32,81,52,0.05)' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 14 }}>{card.emoji}</div>
                        <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 28, fontWeight: 700, color: card.color, lineHeight: 1.1 }}>{card.value}</div>
                        <div style={{ fontSize: 13, color: '#8A8070', marginTop: 4 }}>{card.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: '#fff', borderRadius: 22, padding: '22px 24px', border: '1px solid #EDE4D8', boxShadow: '0 4px 16px rgba(32,81,52,0.04)' }}>
                    <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#205134', margin: '0 0 18px', fontWeight: 700 }}>Actividad reciente</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {activities.map((act) => (
                        <div key={act.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #F3ECE2' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6BAA3D', display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#205134' }}>{act.title}</span>
                            <span style={{ fontSize: 13, color: '#5A5248' }}>· {act.description}</span>
                          </div>
                          <span style={{ fontSize: 12, color: '#8A8070', flexShrink: 0 }}>{timeAgo(act.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                    {[
                      isTurismo
                        ? { section: 'experiences' as AdminSection, label: 'Gestionar Experiencias', emoji: '🌄', desc: 'Edita tus paquetes y rutas', grad: 'linear-gradient(135deg, #EAF3EC, #D6E8D8)', text: '#205134' }
                        : { section: 'products' as AdminSection, label: 'Gestionar Productos', emoji: '📦', desc: 'Añade y edita tus productos', grad: 'linear-gradient(135deg, #FFF8E7, #FDE6B8)', text: '#A86B05' },
                      { section: 'reports' as AdminSection, label: 'Reportes y Ventas', emoji: '📈', desc: 'Consulta tus ingresos', grad: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)', text: '#1B4D82' },
                      ...(!isTurismo ? [{ section: 'inventory' as AdminSection, label: 'Ver Inventario', emoji: '📋', desc: 'Controla tu stock', grad: 'linear-gradient(135deg, #F1F8E9, #DCEDC8)', text: '#3D7A28' }] : []),
                    ].map((q) => (
                      <button key={q.section} type="button" onClick={() => setSection(q.section)} style={{ background: '#fff', border: '1px solid rgba(237,228,216,0.6)', borderRadius: 20, padding: 20, cursor: 'pointer', textAlign: 'left', transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.02)' }} className="hover:shadow-lg hover:-translate-y-1 hover:border-[#D1C7B7]">
                        <div style={{ background: q.grad, width: 60, height: 60, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>{q.emoji}</div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#1C3A14', fontFamily: "'Poppins', sans-serif", marginBottom: 2 }}>{q.label}</div>
                          <div style={{ fontSize: 13, color: '#6A7863', fontWeight: 500, fontFamily: "'Nunito Sans', sans-serif" }}>{q.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* TABLA PRODUCTOS / EXPERIENCIAS */}
              {isTableSection && (
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18, alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: '1 1 240px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#205134" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input type="text" placeholder="Buscar productos, tours..." value={searchVal} onChange={(e) => { setSearchVal(e.target.value); setPage(1) }} style={{ ...inputStyle, paddingLeft: 38, borderRadius: 12 }} />
                    </div>
                    <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1) }} style={{ ...inputStyle, width: 'auto', flex: '0 1 180px', borderRadius: 12 }}>
                      <option value="Todas">Todas las categorias</option>
                      {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>

                  <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #EDE4D8', boxShadow: '0 4px 20px rgba(32,81,52,0.05)', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#FDFAF6', borderBottom: '1px solid #EDE4D8' }}>
                            {['Miniatura', 'Nombre / Descripcion', 'Categoria', 'Precio', 'Stock / Cupos', 'Estado', 'Pedidos', 'Acciones'].map((h) => (
                              <th key={h} style={{ padding: '14px 18px', fontSize: 12, fontWeight: 700, color: '#8A8070', fontFamily: "'Poppins', sans-serif", whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif", fontSize: 14 }}>
                              {searchVal || catFilter !== 'Todas' ? 'Sin resultados para la busqueda.' : `Aun no tienes ${section === 'experiences' ? 'experiencias' : 'productos'} registrados.`}
                            </td></tr>
                          ) : paginated.map((p) => {
                            const stockNum = parseInt(p.stock) || 0
                            const isLow = stockNum < 10
                            const none = stockNum === 0
                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid #F3ECE2' }} className="hover:bg-[#FDFAF6]">
                                <td style={{ padding: '12px 18px' }}>
                                  <img src={p.img} alt={p.title} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover' }} />
                                </td>
                                <td style={{ padding: '12px 18px', maxWidth: 220 }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1C3A14', fontFamily: "'Nunito Sans', sans-serif" }}>{p.title}</div>
                                  <div style={{ fontSize: 12, color: '#8A8070', marginTop: 2 }}>{p.producer} · Colombia</div>
                                </td>
                                <td style={{ padding: '12px 18px' }}>
                                  <span style={{ background: '#EAF3EC', color: '#205134', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
                                    {categories.find(c => c.id === p.category_id)?.name || p.category || 'Sin categoría'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 18px', fontSize: 14, fontWeight: 700, color: '#9B4728', fontFamily: "'Poppins', sans-serif", whiteSpace: 'nowrap' }}>
                                  {formatPrice(p.price)}{p.unit && !['uds', 'und'].includes(p.unit) ? ` / ${p.unit}` : ''}
                                </td>
                                <td style={{ padding: '12px 18px', fontSize: 13, color: '#5A5248', whiteSpace: 'nowrap' }}>
                                  {stockNum} {isTurismo ? 'cupos libres' : 'unidades'}
                                  {p.hasVariants && <div style={{ fontSize: 11, color: '#8A8070' }}>en variantes</div>}
                                </td>
                                <td style={{ padding: '12px 18px' }}>
                                  <span style={{ background: none ? '#fac0aaff' : isLow ? '#ffcd2871' : '#EAF3EC', color: none ? '#C4622D' : isLow ? '#D06050' : '#205134', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                                    {none ? 'Agotado' : isLow ? 'Bajo stock' : 'Activo'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 18px' }}>
                                  <OrderStatusSummary entries={orderSummary[p.id]} />
                                </td>
                                <td style={{ padding: '12px 18px' }}>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button type="button" onClick={() => handleOpenEdit(p)} title="Editar" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#EAF3EC', color: '#205134', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    </button>
                                    <button type="button" onClick={() => handleDelete(p.id)} title="Eliminar" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#FEE9E1', color: '#C4622D', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #F3ECE2', flexWrap: 'wrap', gap: 10 }}>
                      <span style={{ fontSize: 13, color: '#8A8070' }}>Mostrando {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}-{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} elementos</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #EDE4D8', background: page === 1 ? '#F3ECE2' : '#fff', color: page === 1 ? '#C8BFA8' : '#205134', cursor: page === 1 ? 'default' : 'pointer', fontSize: 13, fontWeight: 700 }}>Anterior</button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((pg) => (
                          <button key={pg} onClick={() => setPage(pg)} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: page === pg ? '#205134' : '#fff', color: page === pg ? '#fff' : '#205134', cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: page === pg ? '0 2px 8px rgba(32,81,52,0.2)' : 'none' }}>{pg}</button>
                        ))}
                        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #EDE4D8', background: page === totalPages ? '#F3ECE2' : '#fff', color: page === totalPages ? '#C8BFA8' : '#205134', cursor: page === totalPages ? 'default' : 'pointer', fontSize: 13, fontWeight: 700 }}>Siguiente</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PEDIDOS - estados de los pedidos del productor */}
              {section === 'orders' && (
                <OrdersTable items={orderItems} statuses={orderStatuses} onItemsChange={setOrderItems} onStatusChanged={() => loadData(true)} />
              )}

              {/* INVENTARIO - para todos los roles */}
              {section === 'inventory' && (
                <div>
                  {!isTurismo && products.filter(p => (parseInt(p.stock) || 0) < 20).length > 0 && (
                    <div style={{ background: '#FDF1E6', border: '1px solid #F3C38B', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, color: '#C4622D', fontSize: 14 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                      <strong>Alerta:</strong> Hay productos por debajo del nivel de stock mínimo.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
                    <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #EDE4D8', boxShadow: '0 4px 16px rgba(32,81,52,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#8A8070', letterSpacing: 0.5, marginBottom: 4 }}>TOTAL {isTurismo ? 'EXPERIENCIAS' : 'PRODUCTOS'}</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#1C3A14', lineHeight: 1 }}>{products.length}</div>
                      </div>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F5EEE6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{isTurismo ? '🌄' : '📦'}</div>
                    </div>
                    {!isTurismo && (
                      <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #EDE4D8', boxShadow: '0 4px 16px rgba(32,81,52,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#8A8070', letterSpacing: 0.5, marginBottom: 4 }}>STOCK BAJO</div>
                          <div style={{ fontSize: 32, fontWeight: 800, color: '#1C3A14', lineHeight: 1 }}>{products.filter(p => (parseInt(p.stock) || 0) < 20 && (parseInt(p.stock) || 0) > 0).length}</div>
                        </div>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FDF1E6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⚠️</div>
                      </div>
                    )}
                    <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #EDE4D8', boxShadow: '0 4px 16px rgba(32,81,52,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#8A8070', letterSpacing: 0.5, marginBottom: 4 }}>{isTurismo ? 'SIN CUPOS' : 'AGOTADOS'}</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#1C3A14', lineHeight: 1 }}>{products.filter(p => (parseInt(p.stock) || 0) === 0).length}</div>
                      </div>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEE9E1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>❌</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {products.map((p) => {
                      const stockNum = parseInt(p.stock) || 0
                      const isLow = stockNum < 20
                      const none = stockNum === 0
                      const pct = Math.min(100, Math.max(5, (stockNum / 100) * 100))
                      return (
                        <div key={p.id} style={{ background: '#fff', borderRadius: 20, padding: 18, border: `1px solid ${none ? '#FFCDD2' : isLow ? '#FFE0B2' : '#EDE4D8'}`, boxShadow: '0 4px 16px rgba(32,81,52,0.05)', display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => (p.hasVariants ? handleOpenEdit(p) : setStockModal({ product: p, newStock: p.stock }))}
                            title={isTurismo ? 'Agregar cupos' : 'Editar stock'}
                            style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, border: 'none', background: '#EAF3EC', color: '#205134', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, lineHeight: 1, zIndex: 1 }}
                            className="hover:bg-[#C8E6C9]"
                          >
                            +
                          </button>
                          <img src={p.img} alt={p.title} style={{ width: 60, height: 60, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0, paddingRight: 28 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1C3A14', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                            <div style={{ height: 6, borderRadius: 4, background: '#F3ECE2', overflow: 'hidden', marginBottom: 6 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: none ? '#c42d2d' : isLow ? '#fcb721' : '#205134', borderRadius: 4, transition: 'width 300ms' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                              <span style={{ color: '#8A8070' }}>{stockNum} {isTurismo ? 'cupos libres' : 'disponibles'}</span>
                              <span style={{ color: none ? '#C4622D' : isLow ? '#f7b62c' : '#205134', fontWeight: 700 }}>
                                {none ? (isTurismo ? 'Sin cupos' : 'Agotado') : isLow ? 'Bajo' : 'OK'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* REPORTES */}
              {section === 'reports' && (
                <div style={{ background: '#fff', borderRadius: 20, padding: 32, border: '1px solid #EDE4D8', textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                  <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 20, color: '#205134', margin: '0 0 8px' }}>Reportes proximamente</h3>
                  <p style={{ color: '#8A8070', fontSize: 14 }}>Estamos construyendo los reportes de ventas e ingresos.</p>
                </div>
              )}

              {/* CONFIGURACION */}
              {section === 'settings' && (
                <div style={{ maxWidth: 700, margin: '0 auto' }}>
                  <div style={{ background: '#fff', borderRadius: 24, padding: 36, border: '1px solid rgba(237,228,216,0.5)', boxShadow: '0 8px 32px rgba(32,81,52,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid #F0E8DD' }}>
                      <div style={{ background: 'linear-gradient(135deg, #F5EEE6, #E8DED0)', width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: '#205134' }}>
                        👤
                      </div>
                      <div>
                        <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 26, color: '#1C3A14', margin: 0, fontWeight: 800 }}>Configuración de Perfil</h2>
                        <p style={{ margin: '6px 0 0', color: '#8A8070', fontSize: 15 }}>Actualiza tus datos personales y de organización.</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                      <div>
                        <label style={labelStyle}>Nombre</label>
                        <input value={profileForm.first_name} onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })} placeholder="Nombre" style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Apellido</label>
                        <input value={profileForm.last_name} onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })} placeholder="Apellido" style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>Nombre de organizacion / asociacion</label>
                      <input value={profileForm.org_name} onChange={(e) => setProfileForm({ ...profileForm, org_name: e.target.value })} placeholder="Ej: Cooperativa El Roble" style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>WhatsApp para notificaciones de pedidos</label>
                      <input value={onlyPhoneDigits(profileForm.phone)} onChange={(e) => setProfileForm({ ...profileForm, phone: onlyPhoneDigits(e.target.value) })} {...phoneInputProps} style={inputStyle} />
                      <div style={{ fontSize: 12, color: '#8A8070', marginTop: 4 }}>Te avisaremos por WhatsApp cuando recibas un pedido nuevo.</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                      <DocumentFields
                        documentType={profileForm.document_type}
                        documentNumber={profileForm.document_number}
                        onChange={({ documentType, documentNumber }) => setProfileForm((f) => ({ ...f, document_type: documentType, document_number: documentNumber }))}
                        labelStyle={labelStyle}
                        inputStyle={inputStyle}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                      <LocationFields
                        department={profileForm.department}
                        municipality={profileForm.municipality}
                        onChange={(loc) => setProfileForm((f) => ({ ...f, ...loc }))}
                        labelStyle={labelStyle}
                        inputStyle={inputStyle}
                      />
                    </div>
                    {profileMsg && (
                      <div style={{ background: profileMsg.includes('Error') ? '#FEE9E1' : '#EAF3EC', color: profileMsg.includes('Error') ? '#C4622D' : '#205134', borderRadius: 12, padding: '10px 16px', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{profileMsg}</div>
                    )}
                    <button
                      type="button"
                      disabled={savingProfile}
                      onClick={handleSaveProfile}
                      style={{ background: 'linear-gradient(90deg, #205134, #2A6542)', color: '#fff', border: 'none', padding: '16px', borderRadius: 14, width: '100%', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: savingProfile ? 0.7 : 1, transition: 'all 250ms ease', fontFamily: "'Poppins', sans-serif", marginTop: 24, boxShadow: '0 4px 12px rgba(32,81,52,0.2)' }}
                      className="hover:shadow-lg hover:-translate-y-0.5"
                    >
                      {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                  {profile.id && <ProducerDocumentsCard userId={profile.id} style={{ marginTop: 20 }} onValidationChange={setValidation} />}
                  <ChangePasswordCard style={{ marginTop: 20, borderRadius: 24, padding: 36 }} />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* MODAL CREAR / EDITAR EXPERIENCIA (Turismo) */}
      {isTurismo && showModal && (
        <ExperienceModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSave={handleSaveExperience}
          title={editingId ? 'Editar experiencia' : 'Nueva experiencia'}
          categories={categories}
          initialData={editingId ? {
            title: form.title,
            category_id: form.category_id,
            price: form.price,
            capacity: form.stockNum,
            duration: products.find(p => p.id === editingId)?.duration,
            img: form.img,
            description: form.description,
            tags: products.find(p => p.id === editingId)?.tags,
          } : undefined}
        />
      )}

      {/* MODAL CREAR / EDITAR PRODUCTO (Asociacion) */}
      {!isTurismo && showModal && (
        <ProductModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSave={handleSaveProduct}
          productId={editingId ?? undefined}
          title={editingId ? 'Editar producto' : 'Nuevo producto'}
          categories={categories}
          initialData={editingId ? {
            title: form.title,
            category_id: form.category_id,
            price: form.price,
            stockNum: form.stockNum,
            unit: form.unit,
            img: form.img,
            description: form.description,
            certified: products.find(p => p.id === editingId)?.certified ?? true,
          } : undefined}
        />
      )}

      {/* MODAL EDITAR STOCK */}
      {stockModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 w-full max-w-sm sm:max-w-md shadow-2xl box-border my-auto">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
              <img src={stockModal.product.img} alt={stockModal.product.title} className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover shrink-0" />
              <div className="min-w-0">
                <h3 className="m-0 font-['Poppins'] text-base sm:text-lg text-[#1C3A14] font-extrabold truncate">{isTurismo ? 'Agregar Cupos' : 'Editar Stock'}</h3>
                <p className="m-0 text-xs sm:text-sm text-[#8A8070] truncate">{stockModal.product.title}</p>
              </div>
            </div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3D5A34', marginBottom: 8, fontFamily: "'Nunito Sans', sans-serif" }}>{isTurismo ? 'Cupos disponibles' : 'Cantidad disponible'}</label>
            <input
              type="number"
              min="0"
              value={stockModal.newStock}
              onChange={e => setStockModal(s => s ? { ...s, newStock: e.target.value } : s)}
              className="w-full px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-[1.5px] border-[#EDE4D8] text-2xl sm:text-3xl font-extrabold font-['Poppins'] text-[#1C3A14] text-center outline-none box-border mb-5 sm:mb-6"
            />
            <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3">
              <button type="button" onClick={() => setStockModal(null)} className="w-full sm:flex-1 py-2.5 sm:py-3 rounded-xl border-0 bg-[#F3ECE2] text-[#205134] font-bold cursor-pointer font-['Nunito_Sans'] text-sm sm:text-base hover:bg-[#EADBCA] transition-colors">Cancelar</button>
              <button type="button" onClick={handleSaveStock} disabled={savingStock} className="w-full sm:flex-1 py-2.5 sm:py-3 rounded-xl border-0 bg-gradient-to-r from-[#205134] to-[#2A6542] text-white font-extrabold cursor-pointer font-['Nunito_Sans'] text-sm sm:text-base opacity-100 disabled:opacity-70 shadow-md shadow-[#205134]/20 transition-opacity">
                {savingStock ? 'Guardando...' : 'Guardar Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
