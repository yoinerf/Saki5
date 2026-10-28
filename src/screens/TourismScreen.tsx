import React, { useState, useEffect, useRef } from 'react'
import ScreenShell from '../components/ScreenShell'
import ExperienceReservationModal from '../components/ExperienceReservationModal'
import AuthRequiredModal from '../components/AuthRequiredModal'
import ExperienceModal, { type ExperienceFormData } from '../components/ExperienceModal'
import { supabase } from '../lib/supabase'
import { hasSeenPromoInSession, markPromoAsSeenInSession } from '../lib/promoSession'
import { isAdvertisementActive } from '../lib/dateColombia'
import { canCurrentUserPublish, confirmGoToDocuments } from '../lib/producerDocuments'
import { requestPanelSection } from '../lib/notifications'
import { alertDialog } from '../components/ConfirmDialog'
import type { Tab, UserRole } from '../lib/types'
import type { Json } from '../lib/database.types'
import { primaryImageUrl } from '../lib/catalog'
import type { AdvertisementRow } from '../lib/catalog'

const tagColors: Record<string, string> = {
  Naturaleza: '#3D7A28',
  Gastronomía: '#C4622D',
  Cultura: '#6B4C2A',
  Senderismo: '#205134',
  Comunidad: '#6BAA3D',
  Alojamiento: '#7FB069',
}

interface Experience {
  id: string
  title: string
  host: string
  duration: string
  price: number
  rating: number
  reviews: number
  capacity: string
  description?: string
  img: string
  tags: string[]
  featured: boolean
}


interface TourismScreenProps {
  onRequireAuth?: (mode: 'auth' | 'login') => void
  onNavigate: (tab: Tab) => void
  activeNav?: Tab
  onProfileClick?: () => void
  userRole?: UserRole | null
}

export default function TourismScreen({ onRequireAuth, onNavigate, activeNav, onProfileClick, userRole }: TourismScreenProps) {
  const [selected, setSelected] = useState<string | null>(null)

  const handleSelectExperience = (expId: string) => {
    window.history.pushState({ modal: 'experience', id: expId }, '', window.location.href)
    setSelected(expId)
  }

  const handleBackFromExperience = () => {
    // Only go back in history; the popstate listener will clear selected
    window.history.back()
  }

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // If the new state has an experience modal, show it; otherwise close detail view
      if (e.state?.modal === 'experience' && e.state.id) {
        setSelected(e.state.id)
      } else {
        setSelected(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  const [searchVal, setSearchVal] = useState('')
  const [experiences, setExperiences] = useState<Experience[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const [reservationModalOpen, setReservationModalOpen] = useState(false)
  const [detailGuests, setDetailGuests] = useState(1)
  const [detailDate, setDetailDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  })
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [pendingReservation, setPendingReservation] = useState<Experience | null>(null)
  const [allAds, setAllAds] = useState<AdvertisementRow[]>([])
  const [activeAds, setActiveAds] = useState<AdvertisementRow[]>([])
  const [dismissedPromo, setDismissedPromo] = useState(false)
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const [featuredSlideDir, setFeaturedSlideDir] = useState<'left' | 'right' | null>(null)
  const [featuredAnimating, setFeaturedAnimating] = useState(false)

  const loadExperiences = async () => {
    try {
      // Las experiencias aún no tienen tabla de reseñas propia: se usa experiences.rating
      const { data: experiencesData, error: expErr } = await supabase
        .from('experiences')
        .select('*, images(*), profiles:public_profiles(org_name, first_name, last_name)')
        .order('created_at', { ascending: false })

      if (expErr) {
        console.error('Error cargando experiencias:', expErr)
        setLoading(false)
        return
      }

      const processed: Experience[] = (experiencesData || []).map((exp) => {
        const avg = exp.rating ?? 5

        const primaryImg = primaryImageUrl(exp.images)

        const profile = exp.profiles
        const hostName = profile
          ? (profile.org_name?.trim() || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || exp.host || 'Comunidad local')
          : (exp.host || 'Comunidad local')

        return {
          ...exp,
          host: hostName,
          img: primaryImg,
          description: exp.description || '',
          rating: avg,
          reviews: exp.reviews ?? 0,
          duration: exp.duration ?? '',
          capacity: exp.capacity ?? '',
          tags: exp.tags ?? [],
          featured: exp.featured ?? false,
        }
      })

      setExperiences(processed)
    } catch (e) {
      console.error('Error en loadExperiences:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExperiences()


    const loadAds = async () => {
      try {
        const { data } = await supabase
          .from('advertisements')
          .select('*')
          .order('created_at', { ascending: false })
        if (data) {
          setAllAds(data)
          const validAds = data.filter(isAdvertisementActive)
          setActiveAds(validAds)
        }
      } catch (err) {
        console.error('Error loading ads in tourism:', err)
      }
    }

    loadAds()
  }, [])

  // Obtener anuncios destacados de experiencias activos y vigentes en Colombia
  // Valida que no se haya visto en la sesión y valida estrictamente fechas de activación con hora Colombia
  const experienceFeaturedList = (() => {
    if (loading || selected || dismissedPromo) return []

    const validAds = activeAds.filter((ad) => {
      if (ad.type !== 'experience' || !ad.experience_id) return false
      if (!isAdvertisementActive(ad)) return false
      const exp = experiences.find((e) => e.id === ad.experience_id)
      if (!exp) return false
      if (hasSeenPromoInSession(ad.id)) return false
      return true
    })

    return validAds.flatMap((ad) => {
      const exp = experiences.find((e) => e.id === ad.experience_id)
      if (!exp) return []
      return [{
        adId: ad.id,
        experience: exp,
        title: ad.title || exp.title,
        img: ad.image_url || exp.img,
      }]
    })
  })()

  const experienceFeatured = experienceFeaturedList.length > 0
    ? experienceFeaturedList[Math.min(featuredIndex, experienceFeaturedList.length - 1)]
    : null

  const experienceFeaturedListRef = useRef<typeof experienceFeaturedList>([])
  experienceFeaturedListRef.current = experienceFeaturedList

  // Auto-avance cada 5 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      const list = experienceFeaturedListRef.current
      if (list.length <= 1) return
      setFeaturedSlideDir('left')
      setFeaturedAnimating(true)
      setTimeout(() => {
        setFeaturedIndex((prev) => (prev + 1) % list.length)
        setFeaturedSlideDir(null)
        setFeaturedAnimating(false)
      }, 320)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const navigateFeatured = (dir: 'prev' | 'next') => {
    if (featuredAnimating || experienceFeaturedListRef.current.length <= 1) return
    setFeaturedSlideDir(dir === 'next' ? 'left' : 'right')
    setFeaturedAnimating(true)
    setTimeout(() => {
      const len = experienceFeaturedListRef.current.length
      setFeaturedIndex((prev) => {
        if (dir === 'next') return (prev + 1) % len
        return (prev - 1 + len) % len
      })
      setFeaturedSlideDir(null)
      setFeaturedAnimating(false)
    }, 320)
  }

  const isAdmin = userRole === 'admin'
  const isTurismo = userRole === 'turismo'
  const canCreateExperience = isTurismo
  const filteredExperiences = experiences.filter((experience) => {
    const query = searchVal.trim().toLowerCase()
    return !query || experience.title.toLowerCase().includes(query) || experience.host.toLowerCase().includes(query)
  })

  const recordActivity = async ({
    userId,
    userRoleValue,
    type,
    title,
    description,
    entityType,
    entityId,
    metadata,
  }: {
    userId: string
    userRoleValue: 'asociacion' | 'turismo' | 'comprador'
    type: string
    title: string
    description: string
    entityType?: string
    entityId?: string | null
    metadata?: Json
  }) => {
    try {
      const { error } = await supabase.from('activities').insert([
        {
          user_id: userId,
          user_role: userRoleValue,
          type,
          title,
          description,
          entity_type: entityType ?? null,
          entity_id: entityId ?? null,
          metadata: metadata ?? {},
        },
      ])

      if (error) {
        console.error('Error insertando en activities:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Excepción insertando en activities:', error)
      return false
    }
  }

  const formatPrice = (n: number) => `$${n.toLocaleString('es-CO')}`

  const openReserveModal = async (exp: Experience, guests: number = detailGuests, date: string = detailDate) => {
    if (isTurismo) return
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setPendingReservation(exp)
      setAuthModalOpen(true)
      return
    }
    setPendingReservation(exp)
    setDetailGuests(guests)
    setDetailDate(date)
    setReservationModalOpen(true)
  }

  // Validación documental antes de abrir el formulario (la BD también lo bloquea al guardar)
  const openPublishForm = async () => {
    if (!(await canCurrentUserPublish())) {
      if (await confirmGoToDocuments()) {
        requestPanelSection('settings')
        onNavigate?.('admin')
      }
      return
    }
    setShowForm(true)
  }

  const handleCreateExperience = async (formData: ExperienceFormData) => {
    if (!canCreateExperience) {
      setSubmitMessage('Tu perfil no permite registrar experiencias')
      return
    }
    setSaving(true)
    setSubmitMessage('')

    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    if (!user) {
      setSubmitMessage('Debes iniciar sesión para publicar una experiencia.')
      setSaving(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, org_name')
      .eq('id', user.id)
      .single()

    const payload = {
      host_id: user.id,
      title: formData.title.trim(),
      host: profile?.org_name || `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Comunidad local',
      duration: formData.duration || '2 horas',
      price: Number(formData.price),
      capacity: formData.capacity || '10 personas',
      description: formData.description ? formData.description.trim() : null,
      tags: formData.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean),
      featured: formData.featured,
    }

    const { data: insertedExperience, error } = await supabase.from('experiences').insert([payload]).select()

    if (error) {
      setSubmitMessage(error.message)
      setSaving(false)
      await alertDialog({ title: 'No se pudo crear la experiencia', message: error.message, tone: 'danger' })
      return
    }

    if (insertedExperience?.[0]?.id && formData.uploadedImages && formData.uploadedImages.length > 0) {
      const imageRows = formData.uploadedImages.map((img) => ({
        product_id: null,
        experience_id: insertedExperience[0].id,
        storage_path: img.storagePath,
        image_url: img.imageUrl,
        is_primary: img.isPrimary,
        sort_order: img.sortOrder,
      }))
      const { error: imgErr } = await supabase.from('images').insert(imageRows)
      if (imgErr) await alertDialog({ title: 'La experiencia se creó, pero sus imágenes no', message: imgErr.message, tone: 'warning' })
    }

    const activitySaved = await recordActivity({
      userId: user.id,
      userRoleValue: 'turismo',
      type: 'experience_created',
      title: 'Experiencia publicada',
      description: `${payload.title} ya está disponible para reservas`,
      entityType: 'experiences',
      entityId: insertedExperience?.[0]?.id ?? null,
      metadata: { experience_title: payload.title, price: payload.price },
    })

    setShowForm(false)
    setSubmitMessage(
      activitySaved
        ? '¡Experiencia guardada con éxito!'
        : 'Experiencia guardada, pero la actividad no se pudo registrar en el feed.'
    )
    setSaving(false)
    loadExperiences()
  }

  const selectedExperience = selected !== null ? experiences.find((e) => e.id === selected) : null

  return (
    <>
      <AuthRequiredModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} onRequireAuth={(mode) => onRequireAuth?.(mode)} />
      <ExperienceReservationModal
        open={reservationModalOpen}
        experience={pendingReservation || selectedExperience || null}
        initialGuests={detailGuests}
        initialDate={detailDate}
        onClose={() => {
          setReservationModalOpen(false)
          setPendingReservation(null)
        }}
        onRequireAuth={(mode) => onRequireAuth?.(mode)}
        onSuccess={() => {
          loadExperiences()
        }}
      />

      <ScreenShell
        activeNav={activeNav ?? 'tourism'}
        onNavigate={onNavigate}
        onProfileClick={onProfileClick}
        userRole={userRole}
        contentStyle={{ paddingBottom: 20 }}
      >
        {selectedExperience ? (
          <div style={{ margin: '0 -18px', background: '#F5EEE6' }}>
          <div style={{ position: 'relative', height: 240 }}>
            <img src={selectedExperience.img} alt={selectedExperience.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,63,16,0.7) 0%, transparent 50%)' }} />
            <button
              onClick={handleBackFromExperience}
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                width: 36,
                height: 36,
                borderRadius: 10,
                border: 'none',
                background: 'rgba(255,255,255,0.85)',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ←
            </button>
            {selectedExperience.reviews > 0 && (
              <span style={{ position: 'absolute', top: 16, right: 20, background: 'rgba(255,255,255,0.92)', color: '#205134', padding: '4px 9px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>⭐ {selectedExperience.rating}</span>
            )}
            <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {selectedExperience.tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      background: tagColors[t] || '#205134',
                      color: '#F5EEE6',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 20,
                      fontFamily: "'Nunito Sans', sans-serif",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: '20px 20px 100px' }}>
            <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, color: '#205134', margin: '0 0 6px', fontWeight: 700, lineHeight: 1.3 }}>
              {selectedExperience.title}
            </h2>
            <p style={{ fontSize: 13, color: '#666666', fontFamily: "'Nunito Sans', sans-serif", margin: '0 0 16px' }}>
              📍 {selectedExperience.host}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { icon: '⏱️', label: 'Duración', val: selectedExperience.duration },
                { icon: '👥', label: 'Capacidad', val: selectedExperience.capacity },
                // Sin reseñas no se muestra una calificación (experiences.rating nace en 5 sin que nadie califique)
                { icon: '⭐', label: 'Calificación', val: selectedExperience.reviews > 0 ? `${selectedExperience.rating} (${selectedExperience.reviews} reseñas)` : 'Sin reseñas aún' },
                { icon: '💰', label: 'Precio por persona', val: formatPrice(selectedExperience.price) },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    padding: '12px',
                    border: '1px solid #E8DED0',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{item.icon}</div>
                  <div style={{ fontSize: 10, color: '#666666', fontFamily: "'Nunito Sans', sans-serif", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#205134', fontFamily: "'Nunito Sans', sans-serif" }}>{item.val}</div>
                </div>
              ))}
            </div>

            <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#205134', margin: '0 0 10px', fontWeight: 700 }}>
              Descripción
            </h3>
            <p style={{ fontSize: 14, color: '#3D2B1A', fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.6, margin: '0 0 20px' }}>
              {selectedExperience.description || 'Vive una experiencia auténtica en el corazón del campo colombiano junto a la comunidad local.'}
            </p>

            <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#205134', margin: '0 0 10px', fontWeight: 700 }}>
              ¿Qué incluye?
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {['Guía local bilingüe', 'Alimentación tradicional', 'Actividades culturales', 'Transporte desde el pueblo'].map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#205134', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>
                  </div>
                  <span style={{ fontSize: 14, color: '#3D2B1A', fontFamily: "'Nunito Sans', sans-serif" }}>{item}</span>
                </div>
              ))}
            </div>

            {submitMessage && <div style={{ marginBottom: 12, color: '#205134', fontSize: 12, fontWeight: 700, fontFamily: "'Nunito Sans', sans-serif" }}>{submitMessage}</div>}

            {/* ══ MÓDULO INTERACTIVO DE RESERVA ══ */}
            {!isTurismo && selectedExperience && (() => {
              const maxCap = (() => {
                if (selectedExperience.capacity === undefined || selectedExperience.capacity === null || selectedExperience.capacity === '') return 20
                if (typeof selectedExperience.capacity === 'number') return selectedExperience.capacity
                const p = parseInt(String(selectedExperience.capacity).replace(/\D/g, ''), 10)
                return isNaN(p) ? 20 : p
              })()

              if (maxCap <= 0) {
                return (
                  <div
                    style={{
                      background: '#FFF3EB',
                      border: '1.5px solid #F3D2C4',
                      borderRadius: 20,
                      padding: '24px 22px',
                      marginBottom: 24,
                      textAlign: 'center',
                      boxShadow: '0 8px 24px rgba(155, 71, 40, 0.05)',
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🚫</div>
                    <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 18, color: '#9B4728', margin: '0 0 6px', fontWeight: 700 }}>
                      Sin cupos disponibles
                    </h3>
                    <p style={{ margin: 0, fontSize: 13, color: '#7A351D', fontFamily: "'Nunito Sans', sans-serif" }}>
                      Esta experiencia actualmente no cuenta con cupos disponibles para reservar.
                    </p>
                  </div>
                )
              }

              return (
                <div
                  style={{
                    background: '#fff',
                    border: '1.5px solid #EDE4D8',
                    borderRadius: 20,
                    padding: '20px 22px',
                    marginBottom: 24,
                    boxShadow: '0 8px 24px rgba(32, 81, 52, 0.07)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#6BAA3D', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        PLANIFICA TU VISITA
                      </span>
                      <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 18, color: '#205134', margin: '2px 0 0', fontWeight: 700 }}>
                        Reserva tus cupos
                      </h3>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#205134', fontFamily: "'Poppins', sans-serif" }}>
                        {formatPrice(selectedExperience.price)}
                      </div>
                      <span style={{ fontSize: 11, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif" }}>/ por persona</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
                    {/* Selector de personas */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#205134', marginBottom: 6, fontFamily: "'Nunito Sans', sans-serif" }}>
                        👥 Cantidad de personas
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #EDE4D8', borderRadius: 12, overflow: 'hidden', height: 44, background: '#FAF7F0' }}>
                        <button
                          type="button"
                          onClick={() => setDetailGuests(Math.max(1, detailGuests - 1))}
                          disabled={detailGuests <= 1}
                          style={{ width: 44, height: '100%', border: 'none', background: '#F0ECE1', fontSize: 18, fontWeight: 800, color: detailGuests <= 1 ? '#CCC' : '#205134', cursor: detailGuests <= 1 ? 'not-allowed' : 'pointer' }}
                        >
                          −
                        </button>
                        <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#205134', fontFamily: "'Poppins', sans-serif" }}>
                          {detailGuests} {detailGuests === 1 ? 'persona' : 'personas'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailGuests(Math.min(maxCap, detailGuests + 1))}
                          disabled={detailGuests >= maxCap}
                          style={{ width: 44, height: '100%', border: 'none', background: '#F0ECE1', fontSize: 18, fontWeight: 800, color: detailGuests >= maxCap ? '#CCC' : '#205134', cursor: detailGuests >= maxCap ? 'not-allowed' : 'pointer' }}
                        >
                          +
                        </button>
                      </div>
                      <span style={{ fontSize: 11, color: '#8A8070', marginTop: 4, display: 'block' }}>
                        Capacidad: {maxCap} cupos disponibles
                      </span>
                    </div>

                    {/* Selector de fecha */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#205134', marginBottom: 6, fontFamily: "'Nunito Sans', sans-serif" }}>
                        📅 Fecha de visita
                      </label>
                      <input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        value={detailDate}
                        onChange={(e) => setDetailDate(e.target.value)}
                        style={{
                          width: '100%',
                          height: 44,
                          borderRadius: 12,
                          border: '1.5px solid #EDE4D8',
                          padding: '0 12px',
                          fontSize: 13,
                          fontFamily: "'Nunito Sans', sans-serif",
                          color: '#1C3A14',
                          background: '#FAF7F0',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 11, color: '#8A8070', marginTop: 4, display: 'block' }}>
                        Coordinable con el anfitrión
                      </span>
                    </div>
                  </div>

                  {/* Subtotal en vivo */}
                  <div style={{ background: '#FAF7F0', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 13, color: '#5A5248', fontFamily: "'Nunito Sans', sans-serif" }}>
                      Total ({detailGuests} {detailGuests === 1 ? 'persona' : 'personas'}):
                    </span>
                    <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 800, color: '#205134' }}>
                      {formatPrice(selectedExperience.price * detailGuests)}
                    </span>
                  </div>

                  {/* Botón principal */}
                  <button
                    type="button"
                    onClick={() => openReserveModal(selectedExperience, detailGuests, detailDate)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: 14,
                      border: 'none',
                      background: 'linear-gradient(135deg, #205134 0%, #2E6B42 100%)',
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 800,
                      fontFamily: "'Nunito Sans', sans-serif",
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(32,81,52,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <span>🌿</span>
                    <span>Reservar {detailGuests} {detailGuests === 1 ? 'cupo' : 'cupos'} — {formatPrice(selectedExperience.price * detailGuests)}</span>
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      ) : (
        <>
          {/* ══ VENTANA FLOTANTE CENTRADA: CARRUSEL DE EXPERIENCIAS DESTACADAS ══ */}
          {experienceFeatured && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                background: 'rgba(21, 56, 35, 0.5)',
                backdropFilter: 'blur(8px)',
              }}
              onClick={() => {
                experienceFeaturedList.forEach((f) => markPromoAsSeenInSession(f.adId))
                setDismissedPromo(true)
              }}
            >
              {/* ── Flecha Izquierda ── */}
              {experienceFeaturedList.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigateFeatured('prev') }}
                  style={{
                    position: 'absolute',
                    left: 'max(12px, calc(50% - 222px))',
                    zIndex: 110,
                    width: 44,
                    height: 44,
                    background: 'none',
                    border: 'none',
                    color: '#FFF',
                    fontSize: 32,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                    transition: 'transform 0.15s',
                  }}
                  className="hover:scale-125"
                  aria-label="Experiencia anterior"
                >
                  ‹
                </button>
              )}

              {/* ── Tarjeta de la experiencia ── */}
              <div
                style={{
                  width: '100%',
                  maxWidth: 380,
                  height: 520,
                  maxHeight: '85vh',
                  borderRadius: 28,
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.45)',
                  cursor: 'pointer',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  animation: 'popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  markPromoAsSeenInSession(experienceFeatured.adId)
                  handleSelectExperience(experienceFeatured.experience.id)
                }}
              >
                {/* Imagen de fondo con transición de deslizamiento */}
                <img
                  key={experienceFeatured.adId}
                  src={experienceFeatured.img}
                  alt={experienceFeatured.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    position: 'absolute',
                    inset: 0,
                    animation: featuredSlideDir
                      ? `slideOut${featuredSlideDir === 'left' ? 'Left' : 'Right'} 0.32s cubic-bezier(0.4,0,0.2,1) forwards`
                      : 'slideInFade 0.32s cubic-bezier(0.4,0,0.2,1) forwards',
                  }}
                />

                {/* Gradiente */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.2) 55%, rgba(0,0,0,0.92) 100%)',
                    pointerEvents: 'none',
                  }}
                />

                {/* Tag destacado */}
                <div
                  style={{
                    position: 'absolute',
                    top: 20,
                    left: 20,
                    background: 'linear-gradient(135deg, #6BAA3D 0%, #205134 100%)',
                    color: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '7px 15px',
                    borderRadius: 20,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                    fontFamily: "'Nunito Sans', sans-serif",
                    zIndex: 5,
                  }}
                >
                  <span>📢</span>
                  <span>Experiencia patrocinada</span>
                </div>

                {/* Contador de anuncios (ej: 2 / 3) */}
                {experienceFeaturedList.length > 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 20,
                      right: 66,
                      background: 'rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(6px)',
                      color: '#FFF',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '5px 12px',
                      borderRadius: 20,
                      zIndex: 10,
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  >
                    {Math.min(featuredIndex, experienceFeaturedList.length - 1) + 1} / {experienceFeaturedList.length}
                  </div>
                )}

                {/* Botón cerrar */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    experienceFeaturedList.forEach((f) => markPromoAsSeenInSession(f.adId))
                    setDismissedPromo(true)
                  }}
                  style={{
                    position: 'absolute',
                    top: 18,
                    right: 18,
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: 'rgba(0, 0, 0, 0.55)',
                    color: '#FFFFFF',
                    border: '1.5px solid rgba(255, 255, 255, 0.3)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 800,
                    backdropFilter: 'blur(8px)',
                    zIndex: 10,
                    transition: 'all 0.2s ease',
                  }}
                  className="hover:scale-110"
                  aria-label="Cerrar experiencia destacada"
                >
                  ✕
                </button>

                {/* Contenido inferior */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '24px 22px 22px',
                    zIndex: 5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        background: 'rgba(255, 255, 255, 0.22)',
                        backdropFilter: 'blur(6px)',
                        color: '#FFF8EE',
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: 12,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      🌿 {experienceFeatured.experience.tags?.[0] || 'Experiencia'}
                    </span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, fontWeight: 600 }}>
                      {experienceFeatured.experience.host}
                    </span>
                  </div>

                  <h2
                    style={{
                      margin: 0,
                      fontFamily: "'Poppins', sans-serif",
                      fontSize: 24,
                      fontWeight: 800,
                      color: '#FFFFFF',
                      lineHeight: 1.25,
                      textShadow: '0 2px 10px rgba(0,0,0,0.6)',
                    }}
                  >
                    {experienceFeatured.title}
                  </h2>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: '#E5AE30', fontSize: 20, fontWeight: 800, fontFamily: "'Poppins', sans-serif" }}>
                      {formatPrice(experienceFeatured.experience.price)}
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginLeft: 4 }}>
                        / persona
                      </span>
                    </span>

                    <span
                      style={{
                        background: 'linear-gradient(135deg, #205134 0%, #2A6542 100%)',
                        color: '#FFFFFF',
                        padding: '8px 16px',
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      Ver experiencia →
                    </span>
                  </div>

                  {/* Puntos indicadores */}
                  {experienceFeaturedList.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                      {experienceFeaturedList.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!featuredAnimating) {
                              setFeaturedSlideDir(i > featuredIndex ? 'left' : 'right')
                              setFeaturedAnimating(true)
                              setTimeout(() => {
                                setFeaturedIndex(i)
                                setFeaturedSlideDir(null)
                                setFeaturedAnimating(false)
                              }, 320)
                            }
                          }}
                          style={{
                            width: i === featuredIndex ? 20 : 8,
                            height: 8,
                            borderRadius: 4,
                            background: i === featuredIndex ? '#E5AE30' : 'rgba(255,255,255,0.45)',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'width 0.3s ease, background 0.3s ease',
                          }}
                          aria-label={`Ir al anuncio ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Flecha Derecha ── */}
              {experienceFeaturedList.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigateFeatured('next') }}
                  style={{
                    position: 'absolute',
                    right: 'max(12px, calc(50% - 222px))',
                    zIndex: 110,
                    width: 44,
                    height: 44,
                    background: 'none',
                    border: 'none',
                    color: '#FFF',
                    fontSize: 32,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                    transition: 'transform 0.15s',
                  }}
                  className="hover:scale-125"
                  aria-label="Experiencia siguiente"
                >
                  ›
                </button>
              )}
            </div>
          )}

          {/* ══ BARRA SUPER ADMIN (Si el usuario es admin) ══ */}
          {isAdmin && (
            <div
              style={{
                background: 'linear-gradient(90deg, #183B27 0%, #205134 100%)',
                color: '#fff',
                padding: '10px 18px',
                margin: '0 -18px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 4px 12px rgba(32,81,52,0.2)',
                borderRadius: '0 0 14px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>⚡</span>
                <div>
                  <span style={{ fontWeight: 800, fontSize: 13, fontFamily: "'Poppins', sans-serif" }}>Modo Super Administrador</span>
                  <span style={{ opacity: 0.85, fontSize: 12, marginLeft: 8, display: 'inline-block' }}>Vista previa de experiencias</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate?.('superadmin')}
                style={{
                  background: '#E5AE30',
                  color: '#153823',
                  border: 'none',
                  borderRadius: 10,
                  padding: '7px 16px',
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: "'Nunito Sans', sans-serif",
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease',
                }}
                className="hover:scale-105"
              >
                <span>← Volver al Dashboard</span>
              </button>
            </div>
          )}

          {/* ══ BANNER TURISMO — Verde para Experiencias según manual ══ */}
          <div
            style={{
              background: 'linear-gradient(135deg, #205134 0%, #2E6B42 100%)',
              borderRadius: '0 0 28px 28px',
              padding: '22px 20px 28px',
              margin: '0 -18px 20px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(107,170,61,0.18)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -20, left: 20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(229,174,48,0.10)', pointerEvents: 'none' }} />
            <p style={{ margin: 0, color: '#A8D48A', fontSize: 11, fontFamily: "'Nunito Sans', sans-serif", fontWeight: 800, letterSpacing: 0.5 }}>🌿 TURISMO COMUNITARIO</p>
            <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, color: '#F5EEE6', margin: '4px 0 4px', fontWeight: 700, lineHeight: 1.2 }}>Experiencias del campo</h1>
            <p style={{ margin: 0, color: 'rgba(245,238,230,0.75)', fontSize: 12, fontFamily: "'Nunito Sans', sans-serif" }}>Vive el territorio con comunidades rurales colombianas</p>
          </div>

          {/* ══ ANUNCIOS DESTACADOS ACTIVOS (Valida fechas de activación) ══ */}
          {activeAds.filter(isAdvertisementActive).filter(a => a.type === 'experience' && a.experience_id).length > 0 && (
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeAds.filter(isAdvertisementActive).filter(a => a.type === 'experience' && a.experience_id).map((ad) => (
                <div
                  key={ad.id}
                  onClick={() => {
                    if (ad.experience_id) {
                      handleSelectExperience(ad.experience_id)
                    }
                  }}
                  style={{
                    cursor: ad.experience_id ? 'pointer' : 'default',
                    borderRadius: 18,
                    overflow: 'hidden',
                    background: '#FFFFFF',
                    border: '1.5px solid #EDE6DD',
                    boxShadow: '0 4px 18px rgba(32,81,52,0.06)',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 16,
                    padding: 14,
                    position: 'relative',
                    transition: 'all 0.2s ease',
                  }}
                  className="hover:border-[#205134] hover:shadow-md"
                >
                  {ad.image_url && (
                    <img
                      src={ad.image_url}
                      alt={ad.title ?? ''}
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: 14,
                        objectFit: 'cover',
                        flexShrink: 0,
                        border: '1px solid #E8DED0',
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span
                        style={{
                          background: '#EAF4ED',
                          color: '#205134',
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 20,
                          textTransform: 'uppercase',
                        }}
                      >
                        📢 Patrocinado
                      </span>
                      <span style={{ fontSize: 11, color: '#8C827A', fontWeight: 600 }}>El Campo Nos Une</span>
                    </div>
                    <h3
                      style={{
                        margin: '0 0 6px 0',
                        fontSize: 15,
                        fontWeight: 700,
                        color: '#205134',
                        fontFamily: "'Poppins', sans-serif",
                        lineHeight: 1.3,
                      }}
                    >
                      {ad.title}
                    </h3>
                    {ad.experience_id && (
                      <p style={{ margin: 0, fontSize: 12, color: '#6BAA3D', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>Explorar experiencia</span>
                        <span>→</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══ BARRA DE BÚSQUEDA ══ */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#205134" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar experiencias..."
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              style={{
                width: '100%',
                background: '#fff',
                border: '1px solid #E8DED0',
                borderRadius: 16,
                padding: '12px 16px 12px 42px',
                fontSize: 14,
                fontFamily: "'Nunito Sans', sans-serif",
                color: '#3D2B1A',
                boxShadow: '0 2px 10px rgba(155,71,40,0.03)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
          

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <p style={{ fontSize: 13, color: '#666666', fontFamily: "'Nunito Sans', sans-serif", margin: '22px 0 14px 5px', fontWeight: 600 }}>
              {filteredExperiences.length} experiencias disponibles
            </p>

            {loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="animate-pulse"
                    style={{
                      background: '#eee5d7',
                      borderRadius: 18,
                      height: 270,
                      border: '1px solid #E8DED0',
                    }}
                  />
                ))}
              </div>
            )}
            {!loading && filteredExperiences.length === 0 && (
              <p style={{ textAlign: 'center', color: '#666666', fontFamily: "'Nunito Sans', sans-serif" }}>
                Aún no hay experiencias publicadas.
              </p>
            )}

            <ExperienceModal
              isOpen={showForm}
              onClose={() => setShowForm(false)}
              onSave={handleCreateExperience}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
              {filteredExperiences.map((exp) => (
                <div
                  key={exp.id}
                  className="tourism-card group"
                  onClick={() => handleSelectExperience(exp.id)}
                  style={{
                    background: '#fff',
                    borderRadius: 18,
                    overflow: 'hidden',
                    border: '1px solid #E8DED0',
                    boxShadow: '0 2px 10px rgba(42,92,26,0.05)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                  }}
                >
                  <div style={{ position: 'relative', height: 165, width: '100%', background: '#F5EEE6', overflow: 'hidden' }}>
                    <img
                      src={exp.img}
                      alt={exp.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      className="transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0) 45%, rgba(20,45,25,0.42) 100%)',
                        pointerEvents: 'none',
                      }}
                    />
                    <span style={{ position: 'absolute', top: 8, left: 8, background: '#EAF3EC', color: '#205134', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, letterSpacing: 0.5 }}>
                      🏞️ EXPERIENCIA
                    </span>
                    {(() => {
                      const p = parseInt(String(exp.capacity ?? '').replace(/\D/g, ''), 10)
                      const isOutOfCap = !isNaN(p) && p <= 0
                      if (isOutOfCap) {
                        return (
                          <span style={{ position: 'absolute', top: 8, right: 8, background: '#FFF3EB', color: '#9B4728', border: '1px solid #F3D2C4', fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 20 }}>
                            SIN CUPOS
                          </span>
                        )
                      }
                      if ((exp.reviews ?? 0) > 0) {
                        return (
                          <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.92)', color: '#205134', fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 20 }}>
                            ⭐ {exp.rating} <span style={{ fontWeight: 500, color: '#666' }}>({exp.reviews})</span>
                          </span>
                        )
                      }
                      return (
                        <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.85)', color: '#888', fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 20 }}>
                          NUEVA
                        </span>
                      )
                    })()}
                  </div>
                  <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {exp.tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              background: (tagColors[t] || '#205134') + '18',
                              color: tagColors[t] || '#205134',
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 20,
                              fontFamily: "'Nunito Sans', sans-serif",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <h4
                        style={{
                          fontFamily: "'Poppins', sans-serif",
                          fontSize: 14,
                          color: '#1C3A14',
                          margin: '0 0 4px',
                          fontWeight: 700,
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {exp.title}
                      </h4>
                      <p style={{ fontSize: 12, color: '#666666', fontFamily: "'Nunito Sans', sans-serif", margin: '0 0 12px' }}>
                        📍 {exp.host}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#F5EEE6]">
                      <div>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#205134', fontFamily: "'Poppins', sans-serif" }}>
                          {formatPrice(exp.price)}
                        </span>
                        <span style={{ fontSize: 11, color: '#666666', fontFamily: "'Nunito Sans', sans-serif" }}> /pers.</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#666666', fontSize: 11, fontFamily: "'Nunito Sans', sans-serif" }}>
                        <span>⏱️ {exp.duration}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {canCreateExperience && (
              <div
                style={{
                  marginTop: 20,
                  borderRadius: 20,
                  background: 'linear-gradient(135deg, #205134, #3D7A28)',
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏡</div>
                <h4 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#F5EEE6', margin: '0 0 6px', fontWeight: 700 }}>
                  ¿Tienes una experiencia para ofrecer?
                </h4>
                <p style={{ fontSize: 13, color: '#A8D48A', fontFamily: "'Nunito Sans', sans-serif", margin: '0 0 14px' }}>
                  Registra tu servicio de turismo comunitario y conecta con viajeros
                </p>
                <button
                  onClick={openPublishForm}
                  style={{
                    padding: '11px 24px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#6BAA3D',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: "'Nunito Sans', sans-serif",
                    cursor: 'pointer',
                  }}
                >
                  Registrar mi servicio
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </ScreenShell>
  </>
)
}

