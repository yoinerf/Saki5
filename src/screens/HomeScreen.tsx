import { useState, useEffect } from 'react'
import ScreenShell from '../components/ScreenShell'
import { supabase } from '../lib/supabase'
import { fetchRatingStats } from '../lib/ratings'
import { isAdvertisementActive } from '../lib/dateColombia'
import AutoCarousel from '../components/AutoCarousel'
import bannerPrincipal from '../assets/banner-principal.webp'
import type { Tab, UserRole } from '../lib/types'
import { PLACEHOLDER_IMG, primaryImageUrl } from '../lib/catalog'
import { fetchSellerSales } from '../lib/orders'


interface Props {
  onNavigate: (tab: Tab) => void
  activeNav?: Tab
  onProfileClick?: () => void
  userRole?: UserRole | null
  onSelectProduct?: (productId: string) => void
}

interface FeaturedProduct {
  id: string
  title: string
  producer: string
  // Promedio de reseñas reales; 0 = sin reseñas
  rating: number
  reviews: number
  price: number
  img: string
}

interface TourismPreview {
  id: string
  title: string
  host: string
  price: number
  img: string
  tags: string[]
}

interface ActivityItem {
  id: string
  icon: string
  text: string
  color: string
  created_at: string
}

const getActivityTypeMeta = (type: string) => {
  switch (type) {
    case 'product_created':
      return { icon: '📦', color: '#E5AE30', label: 'Producto publicado' }
    case 'experience_created':
      return { icon: '🏞️', color: '#6BAA3D', label: 'Experiencia publicada' }
    case 'purchase':
      return { icon: '🛒', color: '#9B4728', label: 'Compra registrada' }
    case 'reservation':
      return { icon: '✅', color: '#6BAA3D', label: 'Reserva creada' }
    case 'message':
      return { icon: '💬', color: '#5A7BCA', label: 'Mensaje nuevo' }
    default:
      return { icon: '✨', color: '#6BAA3D', label: 'Actividad' }
  }
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `Hace ${days}d`
}

function getColombianGreeting(): { text: string; icon: string } {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
  )

  if (hour < 12) return { text: 'Buenos días', icon: '☀️' }
  if (hour < 19) return { text: 'Buenas tardes', icon: '🌤️' }
  return { text: 'Buenas noches', icon: '🌙' }
}


export default function HomeScreen({ onNavigate, activeNav, onProfileClick, userRole: propUserRole, onSelectProduct }: Props) {
  const [firstName, setFirstName] = useState('')
  const [featured, setFeatured] = useState<FeaturedProduct[]>([])
  const [tourism, setTourism] = useState<TourismPreview[]>([])
  const [notifications, setNotifications] = useState<ActivityItem[]>([])
  const [stats, setStats] = useState({ productos: 0, pedidos: 0, ingresos: 0 })
  const [userRole, setUserRole] = useState<'asociacion' | 'turismo' | 'comprador' | null>(null)
  const [loading, setLoading] = useState(true)
  const isBuyer = userRole === 'comprador'

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, user_type')
          .eq('id', user.id)
          .single()
        // Rol activo (una Asociación o Turismo que entra como Comprador ve el inicio del comprador)
        const activeRole = (propUserRole ?? profile?.user_type) as 'asociacion' | 'turismo' | 'comprador' | undefined
        if (profile) {
          setFirstName(profile.first_name)
          setUserRole(activeRole ?? null)
        }

        if (profile) {
          const role = activeRole

          if (role !== 'comprador') {
            // Publicados y ventas del vendedor (antes se leían sus propias reservas como si fueran ventas)
            const [{ count: productosCount }, sales] = await Promise.all([
              role === 'turismo'
                ? supabase.from('experiences').select('id', { count: 'exact', head: true }).eq('host_id', user.id)
                : supabase.from('products').select('id', { count: 'exact', head: true }).eq('producer_id', user.id),
              fetchSellerSales(user.id),
            ])

            setStats({
              productos: productosCount ?? 0,
              pedidos: sales.count,
              ingresos: sales.income,
            })
          } else {
            const { count: pedidosCount } = await supabase
              .from('activities')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .in('type', ['purchase', 'reservation'])

            setStats({
              productos: 0,
              pedidos: pedidosCount ?? 0,
              ingresos: 0,
            })
          }
        }

        const { data: activities, error: activitiesError } = await supabase
          .from('activities')
          .select('id, type, title, description, created_at, user_role')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5)

        if (!activitiesError && activities) {
          setNotifications(
            activities.map((item) => {
              const meta = getActivityTypeMeta(item.type ?? 'activity')
              const text = item.description || item.title || meta.label
              return {
                id: item.id,
                icon: meta.icon,
                text,
                color: meta.color,
                created_at: item.created_at,
              }
            })
          )
        }
      }

      // ══════ PRODUCTOS PATROCINADOS (via advertisements) ══════
      try {
        const [{ data: products }, ratingStats, { data: adsData }] = await Promise.all([
          // Solo productos de El Campo Nos Une (los de las tiendas aliadas no salen aquí)
          supabase.from('products').select('id, title, producer, rating, price, outstanding, images(*), profiles:public_profiles(org_name, first_name, last_name)').eq('store', 'campo').order('created_at', { ascending: false }).limit(30),
          fetchRatingStats(),
          supabase.from('advertisements').select('*').order('created_at', { ascending: false }),
        ])


        // Filtrar anuncios activos según la hora oficial de Colombia
        const activeProductAds = (adsData || []).filter(ad => ad.type === 'product' && isAdvertisementActive(ad))

        const processed = (products ?? []).map((p) => {
          const stats = ratingStats.get(p.id)
          // Sin reseñas no se muestra calificación (antes se mostraba un 5 que nadie dio)
          const avg = stats?.rating ?? 0
          const primaryImg = primaryImageUrl(p.images)

          const matchingAd = activeProductAds.find((ad) => ad.product_id === p.id)
          const isAdFeatured = !!matchingAd

          const existingAd = (adsData || []).find((ad) => ad.product_id === p.id)
          const isAdExpiredOrInactive = existingAd ? !isAdvertisementActive(existingAd) : false

          const isOutstandingValid = p.outstanding === true && !isAdExpiredOrInactive

          const profile = p.profiles
          const producerName = profile
            ? (profile.org_name?.trim() || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || p.producer || 'Productor')
            : (p.producer || 'Productor')

          return {
            ...p,
            producer: producerName,
            title: matchingAd?.title || p.title,
            img: matchingAd?.image_url || primaryImg,
            rating: avg,
            reviews: stats?.reviews ?? 0,
            isAdFeatured,
            isOutstandingValid,
          }
        })

        const existingIds = new Set(processed.map((p) => p.id))
        for (const ad of activeProductAds) {
          if (ad.product_id && !existingIds.has(ad.product_id)) {
            const { data: missingProd } = await supabase
              .from('products')
              .select('id, title, producer, rating, price, outstanding, images(*), profiles:public_profiles(org_name, first_name, last_name)')
              .eq('id', ad.product_id)
              .eq('store', 'campo')
              .maybeSingle()
            if (missingProd) {
              const primaryImg = primaryImageUrl(missingProd.images)
              const profile = missingProd.profiles
              const producerName = profile
                ? (profile.org_name?.trim() || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || missingProd.producer || 'Productor')
                : (missingProd.producer || 'Productor')

              processed.unshift({
                ...missingProd,
                producer: producerName,
                title: ad.title || missingProd.title,
                img: ad.image_url || primaryImg,
                rating: ratingStats.get(missingProd.id)?.rating ?? 0,
                reviews: ratingStats.get(missingProd.id)?.reviews ?? 0,
                isAdFeatured: true,
                isOutstandingValid: true,
              })
              existingIds.add(missingProd.id)
            }
          }
        }

        processed.sort((a, b) => {
          if (a.isAdFeatured && !b.isAdFeatured) return -1
          if (!a.isAdFeatured && b.isAdFeatured) return 1
          if (a.isOutstandingValid && !b.isOutstandingValid) return -1
          if (!a.isOutstandingValid && b.isOutstandingValid) return 1
          return b.rating - a.rating
        })

        setFeatured(processed.slice(0, 9))
      } catch (e) {
        console.error('Error cargando productos patrocinados en HomeScreen:', e)
      }

      // ══════ EXPERIENCIAS PATROCINADAS (via advertisements) ══════
      try {
        const { data: experienceAds } = await supabase
          .from('advertisements')
          .select('id, experiences (id, title, host, price, tags, images (image_url, is_primary))')
          .eq('type', 'experience')
          .eq('active', true)
          .lte('starts_at', new Date().toISOString())
          .gte('ends_at', new Date().toISOString())
          .order('starts_at', { ascending: false })
          .limit(6)

        const featuredExperiences: TourismPreview[] = (experienceAds || []).flatMap((ad) => {
          const experience = ad.experiences
          if (!experience) return []
          const primaryImage = experience.images?.find((img) => img.is_primary) || experience.images?.[0]
          return [{
            id: experience.id,
            title: experience.title,
            host: experience.host ?? '',
            price: experience.price,
            tags: experience.tags ?? [],
            img: primaryImage?.image_url || PLACEHOLDER_IMG,
          }]
        })

        setTourism(featuredExperiences)
      } catch (e) {
        console.error('Error cargando experiencias patrocinadas en HomeScreen:', e)
      }

      setLoading(false)
    }

    loadData()
  }, [propUserRole])

  const greeting = getColombianGreeting()

  const formatPrice = (n: number) => `$${n.toLocaleString('es-CO')}`
  const formatCompact = (n: number) => {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `$${Math.round(n / 1000)}K`
    return `$${n}`
  }

  return (
    <ScreenShell
      activeNav={activeNav ?? 'home'}
      onNavigate={onNavigate}
      onProfileClick={onProfileClick}
      userRole={userRole || propUserRole}
      contentStyle={{ paddingBottom: 32 }}
    >
           {/* ══════ BANNER PRINCIPAL + BOTONES ══════ */}
      <style>{`
        .hero-banner { position: relative; margin: 0 -18px; background: #E2E9E2; animation: fadeInBanner 0.8s ease-out; }
        .hero-banner img { display: block; width: 100%; height: auto; }
        .hero-banner__btns { display: flex; gap: 12px; flex-wrap: wrap; padding: 14px 18px 18px; }

        @media (min-width: 720px) {
          .hero-banner__btns { position: absolute; left: 3%; bottom: 32%; padding: 0; }
        }
        @media (min-width: 1200px) {
          .hero-banner__btns { gap: 14px; }
        }

        .brand-btn {
          position: relative; overflow: hidden; border: none; cursor: pointer; font-family: inherit; font-weight: 700; font-size: 15px;
          padding: 13px 22px; border-radius: 999px; display: inline-flex; align-items: center; gap: 8px;
          transition: transform .18s ease, box-shadow .18s ease;
        }
        .brand-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
        .brand-btn:hover { transform: translateY(-3px); }
        .brand-btn:active { transform: translateY(0) scale(.98); }
        .brand-btn__arrow { transition: transform .2s ease; }
        .brand-btn:hover .brand-btn__arrow { transform: translateX(4px); }

        .brand-btn--green { background: linear-gradient(135deg, #205134 0%, #2E6B42 100%); color: #fff; box-shadow: 0 6px 16px rgba(32,81,52,.35); }
        .brand-btn--green:hover { box-shadow: 0 10px 22px rgba(32,81,52,.45); }
        .brand-btn--gold { background: linear-gradient(135deg, #E5AE30 0%, #F3C95A 100%); color: #205134; box-shadow: 0 6px 16px rgba(200,134,10,.32); }
        .brand-btn--gold:hover { box-shadow: 0 10px 22px rgba(200,134,10,.42); }

        .brand-btn--green::after {
          content: ''; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent);
          transform: skewX(-20deg); animation: brandShine 4.5s ease-in-out infinite;
        }
        @keyframes brandShine { 0%, 60% { left: -60%; } 100% { left: 130%; } }

        @media (max-width: 719px) { .brand-btn { flex: 1 1 150px; justify-content: center; } }
        @media (prefers-reduced-motion: reduce) { .brand-btn--green::after { animation: none; } }
      `}</style>

      <div className="hero-banner">
        <img
          src={bannerPrincipal}
          alt="SAKI — Plataforma Territorial Amazónica. Lo mejor del campo está más cerca de ti"
        />
        <div className="hero-banner__btns">
          <button className="brand-btn brand-btn--green" onClick={() => onNavigate('market')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21 7H6" /></svg>
            Explorar productos <span className="brand-btn__arrow">→</span>
          </button>
          <button className="brand-btn brand-btn--gold" onClick={() => onNavigate('tourism')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20l6-10 4 6 2-3 6 7z" /><circle cx="17" cy="6" r="2" /></svg>
            Descubrir experiencias <span className="brand-btn__arrow">→</span>
          </button>
        </div>
      </div>

      {/* ══════ HERO — saludo si está logueado ══════ */}
      {firstName && (
        <div
          style={{
            background: 'linear-gradient(135deg, #205134 0%, #2E6B42 100%)',
            borderRadius: '0 0 28px 28px',
            padding: '28px 20px 32px',
            margin: '0 -18px 24px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(107,170,61,0.15)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -20, right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(229,174,48,0.12)', pointerEvents: 'none' }} />
          <p style={{ margin: 0, color: '#6BAA3D', fontSize: 13, fontFamily: "'Nunito Sans', sans-serif", fontWeight: 700, letterSpacing: 0.3 }}>
            {greeting.icon} {greeting.text}
          </p>
          <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 26, color: '#F5EEE6', margin: '4px 0 6px', fontWeight: 700, lineHeight: 1.2 }}>
            Hola, {firstName}
          </h1>
          <p style={{ margin: 0, color: 'rgba(245,238,230,0.75)', fontSize: 13, fontFamily: "'Nunito Sans', sans-serif" }}>
            Conecta con productos, experiencias y comunidades del territorio.
          </p>
        </div>
      )}

      {/* Espaciado cuando no hay saludo */}
      {!firstName && <div style={{ height: 24 }} />}

      {/* ══════ STATS (solo productores) ══════ */}
      {!isBuyer && firstName && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 20,
            boxShadow: '0 4px 24px rgba(32,81,52,0.09)',
            padding: '14px 16px',
            display: 'flex',
            gap: 0,
            marginBottom: 24,
            border: '1px solid #EDE4D8',
          }}
        >
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse" style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid #E8DED0' : 'none', padding: '10px 8px 6px' }}>
                  <div style={{ width: 24, height: 24, margin: '0 auto 8px', borderRadius: 8, background: '#E9E2D9' }} />
                  <div style={{ height: 18, margin: '0 auto 6px', width: '60%', borderRadius: 8, background: '#E9E2D9' }} />
                  <div style={{ height: 11, width: '68%', margin: '0 auto', borderRadius: 8, background: '#F0E9E0' }} />
                </div>
              ))
            : [
                { label: 'Productos', value: String(stats.productos), icon: '📦' },
                { label: 'Pedidos', value: String(stats.pedidos), icon: '🛒' },
                { label: 'Ingresos', value: formatCompact(stats.ingresos), icon: '💰' },
              ].map((s, i) => (
                <div key={s.label} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid #E8DED0' : 'none', padding: '8px 6px' }}>
                  <div style={{ fontSize: 20 }}>{s.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#205134', fontFamily: "'Poppins', sans-serif", lineHeight: 1.2 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif" }}>
                    {s.label}
                  </div>
                </div>
              ))}
        </div>
      )}

        

      {/* ══════ PRODUCTOS DESTACADOS ══════ */}
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 18, color: '#205134', margin: 0, fontWeight: 700 }}>
          Productos destacados
        </h2>
        <span
          style={{ fontSize: 12, color: '#C8860A', fontWeight: 700, fontFamily: "'Nunito Sans', sans-serif", cursor: 'pointer' }}
          onClick={() => onNavigate('market')}
        >
          Ver todos →
        </span>
      </div>
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse" style={{ background: '#f2eae0', borderRadius: 18, height: 200, border: '1px solid #E8E0CF', overflow: 'hidden' }}>
              <div style={{ height: 120, background: '#E9E2D9' }} />
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ height: 13, width: '75%', borderRadius: 8, background: '#E9E2D9', marginBottom: 8 }} />
                <div style={{ height: 10, width: '55%', borderRadius: 8, background: '#F0E9E0' }} />
              </div>
            </div>
          ))}
        </div>
      ) : featured.length === 0 ? (
        <p style={{ fontSize: 13, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif", marginBottom: 28 }}>
          Aún no hay productos destacados.
        </p>
      ) : (
        <div style={{ marginBottom: 28 }}>
          <AutoCarousel perView={3}>
            {featured.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectProduct ? onSelectProduct(item.id) : onNavigate('market')}
                style={{
                  background: '#fff',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1px solid #E8E0CF',
                  borderRadius: 20,
                  boxShadow: '0 4px 20px rgba(42,92,26,0.10)',
                  transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = '0 8px 28px rgba(42,92,26,0.18)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(42,92,26,0.10)'
                }}
              >
                <div style={{ position: 'relative', height: 280 }}>
                  <img src={item.img} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0) 45%, rgba(20,45,25,0.4) 100%)',
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      background: '#E5AE30',
                      color: '#1C2700',
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: "'Nunito Sans', sans-serif",
                      padding: '3px 10px',
                      borderRadius: 20,
                      letterSpacing: 0.3,
                    }}
                  >
                    PATROCINADO
                  </div>
                </div>
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#205134', fontFamily: "'Poppins', sans-serif", marginBottom: 4 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif", marginBottom: 8 }}>
                    {item.producer}
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#C8860A', fontFamily: "'Nunito Sans', sans-serif" }}>
                      {formatPrice(item.price)}
                    </span>
                    <span style={{ fontSize: 12, color: '#3D7A28', fontFamily: "'Nunito Sans', sans-serif" }}>
                      {item.reviews > 0 ? `⭐ ${item.rating}` : 'Nuevo'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </AutoCarousel>
        </div>
      )}

      {/* ══════ BANNER EXPERIENCIAS ══════ */}
      <div
        style={{ borderRadius: 20, overflow: 'hidden', position: 'relative', height: 130, marginBottom: 28, cursor: 'pointer' }}
        onClick={() => onNavigate('tourism')}
      >
        <img
          src={bannerPrincipal}
          alt="Turismo comunitario"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(28,63,16,0.88) 0%, rgba(28,63,16,0.25) 100%)',
            padding: '18px 22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: '#6BAA3D', fontSize: 11, margin: 0, fontFamily: "'Nunito Sans', sans-serif", fontWeight: 800, letterSpacing: 0.5 }}>
            TURISMO COMUNITARIO
          </p>
          <h3 style={{ color: '#F5EEE6', fontSize: 17, margin: '5px 0 0', fontFamily: "'Poppins', sans-serif", fontWeight: 700, lineHeight: 1.3 }}>
            Descubre experiencias únicas en el campo →
          </h3>
        </div>
      </div>

      {/* ══════ EXPERIENCIAS DESTACADAS ══════ */}
      {tourism.length > 0 && (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 18, color: '#205134', margin: 0, fontWeight: 700 }}>
              Experiencias
            </h2>
            <span
              style={{ fontSize: 12, color: '#205134', fontWeight: 700, fontFamily: "'Nunito Sans', sans-serif", cursor: 'pointer' }}
              onClick={() => onNavigate('tourism')}
            >
              Ver todas →
            </span>
          </div>
          <div style={{ marginBottom: 28 }}>
            <AutoCarousel>
              {tourism.map((exp) => (
                <div
                  key={exp.id}
                  onClick={() => onNavigate('tourism')}
                  style={{ background: '#fff', overflow: 'hidden', cursor: 'pointer', border: '1px solid #E8E0CF', borderRadius: 20, boxShadow: '0 4px 20px rgba(42,92,26,0.10)' }}
                >
                  <div style={{ position: 'relative', height: 220 }}>
                    <img src={exp.img} alt={exp.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0) 45%, rgba(20,45,25,0.4) 100%)',
                        pointerEvents: 'none',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        background: '#E5AE30',
                        color: '#1C2700',
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: "'Nunito Sans', sans-serif",
                        padding: '3px 10px',
                        borderRadius: 20,
                        letterSpacing: 0.3,
                      }}
                    >
                      PATROCINADO
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px 14px' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#205134', fontFamily: "'Poppins', sans-serif", marginBottom: 4 }}>
                      {exp.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif", marginBottom: 8 }}>
                      {exp.host}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#205134', fontFamily: "'Nunito Sans', sans-serif" }}>
                      {formatPrice(exp.price)}
                    </span>
                  </div>
                </div>
              ))}
            </AutoCarousel>
          </div>
        </>
      )}

      {/* ══════ ACTIVIDAD RECIENTE ══════ */}
      <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 18, color: '#205134', margin: '0 0 14px', fontWeight: 700 }}>
        Actividad reciente
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse" style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #E8E0CF', height: 68 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#E9E2D9' }} />
              <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                <div style={{ height: 12, width: '75%', borderRadius: 8, background: '#E9E2D9' }} />
                <div style={{ height: 10, width: '35%', borderRadius: 8, background: '#F0E9E0' }} />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <p style={{ fontSize: 13, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif" }}>
            No tienes actividad reciente.
          </p>
        ) : (
          notifications.map((a) => (
            <div key={a.id} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #E8E0CF' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: a.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {a.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#205134', fontFamily: "'Nunito Sans', sans-serif" }}>
                  {a.text}
                </div>
                <div style={{ fontSize: 11, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif", marginTop: 2 }}>
                  {timeAgo(a.created_at)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </ScreenShell>
  )
}