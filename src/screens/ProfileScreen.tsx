import { useState, useEffect } from 'react'
import ScreenShell from '../components/ScreenShell'
import { supabase } from '../lib/supabase'
import { signOutUser } from '../lib/session'
import { fetchSellerSales } from '../lib/orders'
import type { Tab, UserRole } from '../lib/types'

const certifications = [
  { label: 'Productor Orgánico', icon: '🌱', active: true },
  { label: 'Comercio Justo', icon: '🤝', active: true },
  { label: 'Artesano Certificado', icon: '🎨', active: false },
]

interface ProfileScreenProps {
  userRole?: UserRole | null
  onNavigate?: (tab: Tab) => void
  activeNav?: Tab
  onProfileClick?: () => void
}

export default function ProfileScreen({ userRole: propRole, onNavigate, activeNav, onProfileClick }: ProfileScreenProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole | null>(propRole ?? null)
  const [productCount, setProductCount] = useState(0)
  const [experienceCount, setExperienceCount] = useState(0)
  const [orderCount, setOrderCount] = useState(0)
  const [recentOrders, setRecentOrders] = useState<Array<{ id: string; description: string; title: string; created_at: string }>>([])
  const [stats, setStats] = useState({ sales: 0, income: 0, active: 0 })
  const [activeSection, setActiveSection] = useState<'overview' | 'orders' | 'messages' | 'stats'>('overview')
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showAllMessages, setShowAllMessages] = useState(false)
  const isBuyer = userRole === 'comprador'

  const messageThreads = [
    { id: 'm1', sender: 'Coop. La Esperanza', preview: 'Gracias por tu compra, el envío se programó para mañana.', time: 'Hace 2h' },
    { id: 'm2', sender: 'Finca El Roble', preview: 'Tu pedido está listo para recoger en la cooperativa.', time: 'Hoy' },
    { id: 'm3', sender: 'Ruta de Turismo', preview: 'Confirmamos tu reserva para sábado en la mañana.', time: 'Ayer' },
    { id: 'm4', sender: 'Mercado Campesino', preview: 'Te enviamos la factura y la guía de entrega.', time: 'Hace 3 días' },
    { id: 'm5', sender: 'Asociación Agricultores', preview: 'Hemos actualizado la disponibilidad del producto.', time: 'Hace 5 días' },
    { id: 'm6', sender: 'Comunidad del Valle', preview: 'Ya se confirmó la visita guiada y el punto de encuentro.', time: 'Hace 6 días' },
  ]

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

      const [{ count: productsCount }, { count: experiencesCount }, { count: activityOrdersCount }, { data: recentActivities }] = await Promise.all([
        supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('producer_id', user.id),
        supabase
          .from('experiences')
          .select('*', { count: 'exact', head: true })
          .eq('host_id', user.id),
        supabase
          .from('activities')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('type', ['purchase', 'reservation']),
        supabase
          .from('activities')
          .select('id, title, description, created_at')
          .eq('user_id', user.id)
          .in('type', ['purchase', 'reservation'])
          .order('created_at', { ascending: false }),
      ])

      setProductCount(productsCount ?? 0)
      setExperienceCount(experiencesCount ?? 0)
      setOrderCount(activityOrdersCount ?? 0)
      setRecentOrders((recentActivities ?? []).map((item) => ({
        id: item.id,
        description: item.description || item.title,
        title: item.title,
        created_at: item.created_at,
      })))

      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, org_name, department, municipality, user_type')
        .eq('id', user.id)
        .single()

      if (data) {
        const role = (data.user_type as UserRole) ?? null
        setUserRole(role)
        setName(`${data.first_name} ${data.last_name}`)
        setOrg(data.org_name || 'Sin organización')
        setLocation(`${data.municipality}, ${data.department}`)

        if (role === 'asociacion' || role === 'turismo') {
          // Ventas = ítems de pedidos donde el usuario es el vendedor.
          // Antes se leía reservations, que solo ve quien reserva y no tiene columna total.
          const [{ count: activeCount }, sales] = await Promise.all([
            role === 'asociacion'
              ? supabase.from('products').select('id', { count: 'exact', head: true }).eq('producer_id', user.id)
              : supabase.from('experiences').select('id', { count: 'exact', head: true }).eq('host_id', user.id),
            fetchSellerSales(user.id, role === 'asociacion' ? 'producto' : 'experiencia'),
          ])
          setStats({ sales: sales.count, income: sales.income, active: activeCount ?? 0 })
        }
      }
      setLoading(false)
    }

    loadProfile()
  }, [])

  const menuItems = [
    {
      icon: '📦',
      label: 'Mis Productos',
      sublabel: `${productCount} ${productCount === 1 ? 'publicado' : 'publicados'}`,
      color: '#205134',
      allowedFor: ['asociacion'] as UserRole[],
    },
    {
      icon: '🏞️',
      label: 'Mis Experiencias',
      sublabel: `${experienceCount} ${experienceCount === 1 ? 'activa' : 'activas'}`,
      color: '#E5AE30',
      allowedFor: ['turismo'] as UserRole[],
    },
    { icon: '💬', label: 'Mensajes', sublabel: 'Próximamente', color: '#6BAA3D', allowedFor: ['asociacion', 'turismo', 'comprador'] as UserRole[] },
    { icon: '📊', label: 'Estadísticas', sublabel: 'Ver ventas e ingresos', color: '#9B4728', allowedFor: ['asociacion', 'turismo'] as UserRole[] },
    { icon: '⭐', label: 'Reseñas', sublabel: '4.8 promedio', color: '#9B4728', allowedFor: ['asociacion', 'turismo'] as UserRole[] },
    { icon: '📋', label: 'Mis Pedidos', sublabel: `${orderCount} ${orderCount === 1 ? 'activo' : 'activos'}`, color: '#2A6340', allowedFor: ['comprador'] as UserRole[] },
  ]

  const visibleMenuItems = userRole
    ? menuItems.filter((item) => item.allowedFor.includes(userRole))
    : menuItems.filter((item) => item.allowedFor.includes('comprador'))

  return (
    <ScreenShell
      activeNav={activeNav ?? 'profile'}
      onNavigate={onNavigate}
      onProfileClick={onProfileClick}
      userRole={userRole}
      contentStyle={{ paddingBottom: 20 }}
    >
      {loading ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 24,
            padding: '20px',
            marginBottom: 20,
            boxShadow: '0 4px 24px rgba(42,92,26,0.12)',
            border: '1px solid #E8DED0',
          }}
        >
            <div className="flex items-center gap-4 mb-4">
              <div className="animate-pulse" style={{ width: 72, height: 72, borderRadius: '50%', background: '#E9E2D9' }} />
              <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                <div className="animate-pulse" style={{ height: 18, borderRadius: 8, background: '#E9E2D9' }} />
                <div className="animate-pulse" style={{ height: 12, width: '70%', borderRadius: 8, background: '#E9E2D9' }} />
                <div className="animate-pulse" style={{ height: 12, width: '55%', borderRadius: 8, background: '#E9E2D9' }} />
              </div>
            </div>
            <div className="animate-pulse" style={{ height: 50, borderRadius: 14, background: '#F1EAE0' }} />
          </div>
        ) : (
          <div
            style={{
              background: '#fff',
              borderRadius: 24,
              padding: '20px',
              marginBottom: 20,
              boxShadow: '0 4px 24px rgba(42,92,26,0.12)',
              border: '1px solid #E8DED0',
            }}
          >
            <div className="flex items-center gap-4 mb-4">
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid #205134',
                  flexShrink: 0,
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#EAF3EC',
                    color: '#205134',
                    fontSize: 28,
                    fontWeight: 700,
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  {name.trim().charAt(0).toUpperCase() || '?'}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {editing ? (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      fontFamily: "'Poppins', sans-serif",
                      color: '#1C3F10',
                      border: '1.5px solid #205134',
                      borderRadius: 8,
                      padding: '4px 8px',
                      width: '100%',
                      outline: 'none',
                      marginBottom: 4,
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Poppins', sans-serif", color: '#1C3F10', marginBottom: 3 }}>
                    {name}
                  </div>
                )}
                {editing ? (
                  <input
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    style={{
                      fontSize: 12,
                      fontFamily: "'Nunito Sans', sans-serif",
                      color: '#666666',
                      border: '1.5px solid #E8DED0',
                      borderRadius: 8,
                      padding: '4px 8px',
                      width: '100%',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 12, color: '#666666', fontFamily: "'Nunito Sans', sans-serif" }}>
                    🏢 {org}
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#6BAA3D', fontFamily: "'Nunito Sans', sans-serif", marginTop: 3, fontWeight: 600 }}>
                  📍 {location}
                </div>
              </div>
            </div>

            {!isBuyer && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 0,
                  background: '#F5F2EA',
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                {[
                  { value: String(productCount), label: productCount === 1 ? 'Producto' : 'Productos', icon: '📦' },
                  { value: String(experienceCount), label: experienceCount === 1 ? 'Experiencia' : 'Experiencias', icon: '🏞️' },
                  { value: '4.8⭐', label: 'Calificación', icon: '' },
                ].map((s, i) => (
                  <div
                    key={s.label}
                    style={{
                      padding: '12px 8px',
                      textAlign: 'center',
                      borderRight: i < 2 ? '1px solid #E8DED0' : 'none',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#205134',
                        fontFamily: "'Poppins', sans-serif",
                      }}
                    >
                      {s.value}
                    </div>
                    <div style={{ fontSize: 10, color: '#666666', fontFamily: "'Nunito Sans', sans-serif" }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Menu items */}
        <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#1C3F10', margin: '0 0 12px', fontWeight: 700 }}>
          Mi cuenta
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {visibleMenuItems.map((item) => (
            <div
              key={item.label}
              onClick={() => {
                if (item.label === 'Mis Pedidos' && isBuyer) {
                  setActiveSection('orders')
                  setShowAllOrders(false)
                  return
                }

                if (item.label === 'Mensajes') {
                  return
                }

                if (item.label === 'Estadísticas') {
                  setActiveSection('stats')
                  return
                }

                setActiveSection('overview')
              }}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                border: '1px solid #E8DED0',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: item.color + '18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1C3F10', fontFamily: "'Nunito Sans', sans-serif" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12, color: '#666666', fontFamily: "'Nunito Sans', sans-serif" }}>
                  {item.sublabel}
                </div>
              </div>
              <span style={{ fontSize: 18, color: '#C8BFA8' }}>›</span>
            </div>
          ))}
        </div>

        {isBuyer && activeSection === 'orders' && (
          <div
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: '16px',
              marginBottom: 20,
              border: '1px solid #E8DED0',
              boxShadow: '0 4px 18px rgba(42,92,26,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#1C3F10' }}>
                Mis pedidos
              </h3>
              <button
                onClick={() => setActiveSection('overview')}
                style={{
                  border: 'none',
                  background: '#F5F2EA',
                  color: '#205134',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
            {recentOrders.length === 0 ? (
              <div style={{ fontSize: 13, color: '#666666', fontFamily: "'Nunito Sans', sans-serif" }}>
                Todavía no has comprado ni reservado nada.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(showAllOrders ? recentOrders : recentOrders.slice(0, 5)).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: '1px solid #E8DED0',
                        borderRadius: 12,
                        padding: '10px 12px',
                        background: '#F5EEE6',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1C3F10', fontFamily: "'Nunito Sans', sans-serif" }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B5F50', fontFamily: "'Nunito Sans', sans-serif", marginTop: 4 }}>
                        {item.description}
                      </div>
                    </div>
                  ))}
                </div>

                {recentOrders.length > 5 && (
                  <button
                    onClick={() => setShowAllOrders((prev) => !prev)}
                    style={{
                      marginTop: 12,
                      width: '100%',
                      border: '1px solid #D8E7D4',
                      borderRadius: 12,
                      background: '#F5FAF2',
                      color: '#205134',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "'Nunito Sans', sans-serif",
                      padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    {showAllOrders ? 'Ver menos' : 'Ver más'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {activeSection === 'messages' && (
          <div
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: '16px',
              marginBottom: 20,
              border: '1px solid #E8DED0',
              boxShadow: '0 4px 18px rgba(42,92,26,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#1C3F10' }}>
                Mensajes
              </h3>
              <button
                onClick={() => setActiveSection('overview')}
                style={{
                  border: 'none',
                  background: '#F5F2EA',
                  color: '#205134',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(showAllMessages ? messageThreads : messageThreads.slice(0, 5)).map((message) => (
                <div
                  key={message.id}
                  style={{
                    border: '1px solid #E8DED0',
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: '#F5EEE6',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1C3F10', fontFamily: "'Nunito Sans', sans-serif" }}>
                      {message.sender}
                    </div>
                    <div style={{ fontSize: 11, color: '#666666', fontFamily: "'Nunito Sans', sans-serif" }}>
                      {message.time}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B5F50', fontFamily: "'Nunito Sans', sans-serif", marginTop: 4 }}>
                    {message.preview}
                  </div>
                </div>
              ))}
            </div>

            {messageThreads.length > 5 && (
              <button
                onClick={() => setShowAllMessages((prev) => !prev)}
                style={{
                  marginTop: 12,
                  width: '100%',
                  border: '1px solid #D8E7D4',
                  borderRadius: 12,
                  background: '#F5FAF2',
                  color: '#205134',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                {showAllMessages ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}

        {(userRole === 'asociacion' || userRole === 'turismo') && activeSection === 'stats' && (
          <div
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: '16px',
              marginBottom: 20,
              border: '1px solid #E8DED0',
              boxShadow: '0 4px 18px rgba(42,92,26,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#1C3F10' }}>
                Estadísticas
              </h3>
              <button
                onClick={() => setActiveSection('overview')}
                style={{
                  border: 'none',
                  background: '#F5F2EA',
                  color: '#205134',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#F5F2EA', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#666666', fontFamily: "'Nunito Sans', sans-serif", marginBottom: 4 }}>Ventas</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1C3F10', fontFamily: "'Poppins', sans-serif" }}>{stats.sales}</div>
              </div>
              <div style={{ background: '#F5F2EA', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#666666', fontFamily: "'Nunito Sans', sans-serif", marginBottom: 4 }}>Ingresos</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1C3F10', fontFamily: "'Poppins', sans-serif" }}>${stats.income.toLocaleString('es-CO')}</div>
              </div>
            </div>

            <div style={{ marginTop: 14, background: '#F5FAF2', borderRadius: 14, padding: '12px 14px', border: '1px solid #D8E7D4' }}>
              <div style={{ fontSize: 12, color: '#5F6F57', fontFamily: "'Nunito Sans', sans-serif" }}>
                {userRole === 'asociacion' ? 'Productos activos' : 'Experiencias activas'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#205134', fontFamily: "'Poppins', sans-serif", marginTop: 4 }}>{stats.active}</div>
            </div>
          </div>
        )}

        {!isBuyer && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, color: '#1C3F10', margin: '0 0 12px', fontWeight: 700 }}>
              Certificaciones
            </h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {certifications.map((cert) => (
                <div
                  key={cert.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 20,
                    background: cert.active ? '#205134' : '#F5F2EA',
                    border: cert.active ? 'none' : '1.5px dashed #C8BFA8',
                    opacity: cert.active ? 1 : 0.6,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{cert.icon}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: cert.active ? '#F5EEE6' : '#666666',
                      fontFamily: "'Nunito Sans', sans-serif",
                    }}
                  >
                    {cert.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help section */}
        <div
          style={{
            background: 'linear-gradient(135deg, #EEE9DC, #F5EEE6)',
            borderRadius: 20,
            padding: '18px 20px',
            marginBottom: 20,
            border: '1px solid #E8DED0',
            display: 'flex',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 32 }}>🤝</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1C3F10', fontFamily: "'Poppins', sans-serif", marginBottom: 4 }}>
              ¿Necesitas ayuda?
            </div>
            <div style={{ fontSize: 12, color: '#666666', fontFamily: "'Nunito Sans', sans-serif" }}>
              Nuestro equipo de soporte está disponible de lunes a sábado
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={async () => {
            await signOutUser('/')
          }}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: 14,
            border: '1.5px solid #E8DED0',
            background: 'transparent',
            color: '#9B4728',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "'Nunito Sans', sans-serif",
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          Cerrar sesión
        </button>
    </ScreenShell>
  )
}


