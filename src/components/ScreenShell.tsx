import { Fragment, useState, useEffect, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { signOutUser } from '../lib/session'
import { MAIN_STORE, isMainStore, type StoreId } from '../lib/stores'
import { useStores } from '../lib/storesContext'
import { useAppNavigation } from '../lib/navigation'
import { useAuth } from '../lib/auth'
import { ROLE_LABELS, sellerRole } from '../lib/roles'
import NotificationBell from './NotificationBell'
import logoSrc from '../assets/logo-nofond.png'
import { isTab, type Tab, type UserRole } from '../lib/types'
import type { User } from '@supabase/supabase-js'

type NavTab = Tab

interface NavItem {
  id: NavTab
  label: string
  /** Vitrina de una tienda aliada (id 'store') */
  store?: StoreId
}

interface ScreenShellProps {
  activeNav?: NavTab
  onNavigate?: (tab: NavTab) => void
  onProfileClick?: () => void
  userRole?: UserRole | null
  children: ReactNode
  contentStyle?: CSSProperties
  contentClassName?: string
  cartCount?: number
  onCartClick?: () => void
  /** Tienda que se muestra. En una tienda aliada no aparece la marca El Campo Nos Une. */
  store?: StoreId
  /** @deprecated ya no se usa — el header nuevo no incluye búsqueda */
  searchPlaceholder?: string
  /** @deprecated */
  searchValue?: string
  /** @deprecated */
  onSearchChange?: (value: string) => void
  /** @deprecated */
  topNavigation?: ReactNode
  /** @deprecated */
  title?: string
  /** @deprecated */
  subtitle?: string
  /** @deprecated */
  action?: ReactNode
  /** @deprecated */
  headerContent?: ReactNode
}

export default function ScreenShell({
  activeNav = 'home',
  onNavigate,
  onProfileClick,
  userRole,
  children,
  contentStyle,
  contentClassName,
  cartCount,
  onCartClick,
  store = MAIN_STORE,
}: ScreenShellProps) {
  const { alliedStores, getStore } = useStores()
  const { openStore, switchRole } = useAppNavigation()
  // Cuenta con varios roles: acceso al panel del otro rol
  const { roles } = useAuth()
  const otherSellerRole = userRole === 'comprador' ? sellerRole(roles) : undefined
  const canSwitchToBuyer = (userRole === 'asociacion' || userRole === 'turismo') && roles.includes('comprador')
  const isAllied = !isMainStore(store)
  const storeConfig = getStore(store)
  const isSeller = userRole === 'asociacion' || userRole === 'turismo'
  const isStoreAdmin = userRole === 'admin_tienda'
  // Vendedores y administradores de tienda trabajan desde su panel: sin menú de la tienda
  const isPanelUser = isSeller || isStoreAdmin
  const homeTab: NavTab = isStoreAdmin ? 'storeadmin' : isSeller ? 'admin' : isAllied ? 'store' : 'home'
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [sessionUser, setSessionUser] = useState<User | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessionUser(data.session?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSessionUser(sess?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Menú de la tienda principal. Las tiendas aliadas activas (store_settings) van dentro del
  // desplegable fijo "Aliados", que se muestra después de Experiencias.
  const showMainNav = !isPanelUser && !isAllied
  const navItems: NavItem[] = showMainNav ? [
    { id: 'home', label: 'Inicio' },
    { id: 'market', label: 'Productos' },
    { id: 'tourism', label: 'Experiencias' },
    { id: 'about', label: 'Nosotros' },
  ] : []
  const alliesIndex = navItems.findIndex((item) => item.id === 'about')
  const [isAlliesOpen, setIsAlliesOpen] = useState(false)
  const isActiveItem = (item: NavItem) => activeNav === item.id && (!item.store || item.store === store)
  const goTo = (item: NavItem) => (item.store ? openStore(item.store) : onNavigate?.(item.id))
  const goToAlly = (allyStore: StoreId) => {
    setIsAlliesOpen(false)
    setIsMenuOpen(false)
    openStore(allyStore)
  }
  const handleProfileClick = () => {
    if (onProfileClick) {
      onProfileClick()
    } else {
      onNavigate?.('profile')
    }
    setIsMenuOpen(false)
  }
  return (
    <div className="h-full flex flex-col" style={{ background: '#F5EEE6' }}>
      {/* ═══════════ HEADER STICKY ═══════════ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#FAF7F0',
          borderBottom: '1px solid #EDE4D8',
          boxShadow: '0 2px 14px rgba(32,81,52,0.06)',
        }}
      >
        <div
          style={{
            width: '100%',
            padding: isAllied ? '0 12px' : '0 24px',
            height: 76,
            display: 'flex',
            alignItems: 'center',
            gap: isAllied ? 8 : 16,
            boxSizing: 'border-box',
          }}
        >
          {/* Logo (oculto en la página de inicio). Las tiendas aliadas muestran su nombre */}
          {activeNav !== 'home' && (
          <div
            style={{
              flexShrink: 0,
              cursor: onNavigate ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
            }}
            onClick={() => onNavigate?.(homeTab)}
            role={onNavigate ? 'button' : undefined}
            tabIndex={onNavigate ? 0 : undefined}
            onKeyDown={(e) => e.key === 'Enter' && onNavigate?.(homeTab)}
            aria-label="Ir al inicio"
          >
            {isAllied ? (
              <span className="text-base w-[100px] md:w-auto md:text-2xl md:whitespace-nowrap" style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, color: '#205134', lineHeight: 1.1, display: 'block' }}>
                {storeConfig.name}
              </span>
            ) : (
              <img
                src={logoSrc}
                alt="El Campo Nos Une"
                style={{
                  height: 52,
                  width: 'auto',
                  display: 'block',
                }}
              />
            )}
          </div>
          )}
          {/* Nav central (Desktop) */}
          <nav
            className="hidden md:flex"
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {navItems.map((item, index) => {
              const isActive = isActiveItem(item)
              return (
                <Fragment key={item.store ?? item.id}>
                {index === alliesIndex && (
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isAlliesOpen}
                      onClick={() => setIsAlliesOpen(!isAlliesOpen)}
                      style={{
                        position: 'relative',
                        background: isAlliesOpen ? '#EAF3EC' : 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '8px 16px',
                        fontSize: 15,
                        fontFamily: "'Nunito Sans', sans-serif",
                        fontWeight: activeNav === 'store' ? 700 : 600,
                        color: activeNav === 'store' || isAlliesOpen ? '#205134' : '#5A5248',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 180ms ease',
                      }}
                    >
                      Aliados
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isAlliesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      {activeNav === 'store' && (
                        <span style={{ position: 'absolute', bottom: -2, left: 16, right: 16, height: 3, borderRadius: 3, background: '#9B4728' }} />
                      )}
                    </button>
                    {isAlliesOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setIsAlliesOpen(false)} />
                        <div
                          role="menu"
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            marginTop: 10,
                            background: '#fff',
                            borderRadius: 16,
                            boxShadow: '0 8px 30px rgba(32,81,52,0.12)',
                            border: '1px solid #EDE4D8',
                            padding: 8,
                            minWidth: 260,
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                          }}
                        >
                          {alliedStores.length === 0 ? (
                            <div style={{ padding: '10px 14px', fontSize: 13, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif" }}>Pronto tendremos nuevos aliados.</div>
                          ) : alliedStores.map((s) => (
                            <button
                              key={s.store}
                              type="button"
                              role="menuitem"
                              onClick={() => goToAlly(s.store)}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 10, fontFamily: "'Nunito Sans', sans-serif" }}
                              className="hover:bg-[#F5EEE6]"
                            >
                              {s.ally_name && <div style={{ fontSize: 12, fontWeight: 700, color: '#8A8070' }}>{s.ally_name}</div>}
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#205134' }}>{s.name}</div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => goTo(item)}
                  style={{
                    position: 'relative',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px 16px',
                    fontSize: 15,
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? '#205134' : '#5A5248',
                    borderRadius: 10,
                    transition: 'all 180ms ease',
                  }}
                >
                  {item.label}
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        left: 16,
                        right: 16,
                        height: 3,
                        borderRadius: 3,
                        background: '#9B4728',
                      }}
                    />
                  )}
                </button>
                </Fragment>
              )
            })}
          </nav>

          {/* Spacer para Mobile (para mantener centrado/distribuido) */}
          <div className="md:hidden" style={{ flex: 1 }} />

          {/* Iconos derecha */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: isAllied ? 6 : 10 }}>
            {/* Volver a El Campo Nos Une (solo en tiendas aliadas, no para sus productores) */}
            {isAllied && !isPanelUser && (
              <button
                type="button"
                onClick={() => onNavigate?.('home')}
                style={{
                  background: 'transparent',
                  color: '#205134',
                  border: '1.5px solid #205134',
                  borderRadius: 10,
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s',
                }}
                className="hover:bg-[#EAF3EC]"
              >
                <span className="hidden sm:inline">← Volver al campo</span>
                <span className="sm:hidden">← Campo</span>
              </button>
            )}
            {/* Perfil o Login */}
            {!sessionUser ? (
              <button
                type="button"
                onClick={handleProfileClick}
                style={{
                  background: '#205134',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                className="hover:bg-[#2A6542]"
              >
                Ingresar
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {userRole === 'admin' && (
                  <button
                    type="button"
                    onClick={() => onNavigate?.('superadmin')}
                    style={{
                      background: 'linear-gradient(135deg, #205134 0%, #173E26 100%)',
                      color: '#fff',
                      border: '1px solid rgba(229,174,48,0.5)',
                      borderRadius: 10,
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "'Nunito Sans', sans-serif",
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 10px rgba(32,81,52,0.25)',
                      transition: 'all 0.2s ease',
                    }}
                    className="hover:scale-105 active:scale-95"
                    title="Volver al panel Super Admin"
                  >
                    <span style={{ fontSize: 13 }}>⚡</span>
                    <span>Super Admin</span>
                  </button>
                )}
                {(userRole === 'asociacion' || userRole === 'turismo') && (
                  <button
                    type="button"
                    onClick={() => onNavigate?.('admin')}
                    style={{
                      background: '#1C3A14',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '8px 20px',
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "'Nunito Sans', sans-serif",
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    className="hover:bg-[#2A6542]"
                  >
                    Admin
                  </button>
                )}
                {otherSellerRole && (
                  <button
                    type="button"
                    onClick={() => switchRole(otherSellerRole)}
                    title={`Ir a tu panel de ${ROLE_LABELS[otherSellerRole]}`}
                    style={{
                      background: '#1C3A14',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "'Nunito Sans', sans-serif",
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'background 0.2s',
                    }}
                    className="hidden sm:block hover:bg-[#2A6542]"
                  >
                    Panel {ROLE_LABELS[otherSellerRole]}
                  </button>
                )}
                <NotificationBell onOpen={(tab) => (tab === 'profile' ? handleProfileClick() : isTab(tab) && onNavigate?.(tab))} />
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    aria-label="Mi perfil"
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      border: 'none',
                      background: activeNav === 'profile' || isProfileMenuOpen ? '#EAF3EC' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: activeNav === 'profile' || isProfileMenuOpen ? '#205134' : '#4A5248',
                      transition: 'all 180ms ease',
                    }}
                    className="hover:bg-[#20513410]"
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </button>

                  {isProfileMenuOpen && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setIsProfileMenuOpen(false)} />
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          marginTop: 8,
                          background: '#fff',
                          borderRadius: 16,
                          boxShadow: '0 8px 30px rgba(32,81,52,0.12)',
                          border: '1px solid #EDE4D8',
                          padding: 8,
                          minWidth: 180,
                          zIndex: 100,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        {userRole === 'admin' && (
                          <button
                            onClick={() => { setIsProfileMenuOpen(false); onNavigate?.('superadmin'); }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '10px 14px',
                              background: '#EAF4ED',
                              border: '1px solid rgba(32,81,52,0.2)',
                              cursor: 'pointer',
                              borderRadius: 8,
                              fontSize: 14,
                              fontWeight: 700,
                              fontFamily: "'Nunito Sans', sans-serif",
                              color: '#205134',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                            className="hover:bg-[#DCEDE0]"
                          >
                            <span>⚡</span>
                            <span>Panel Super Admin</span>
                          </button>
                        )}
                        <button
                          onClick={() => { setIsProfileMenuOpen(false); handleProfileClick(); }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 14px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "'Nunito Sans', sans-serif",
                            color: '#205134',
                          }}
                          className="hover:bg-[#F5EEE6]"
                        >
                          {userRole === 'comprador' ? 'Mi panel' : 'Mi Perfil'}
                        </button>
                        {(otherSellerRole || canSwitchToBuyer) && (
                          <button
                            onClick={() => { setIsProfileMenuOpen(false); switchRole(otherSellerRole ?? 'comprador'); }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              borderRadius: 8,
                              fontSize: 14,
                              fontWeight: 600,
                              fontFamily: "'Nunito Sans', sans-serif",
                              color: '#205134',
                            }}
                            className="hover:bg-[#F5EEE6]"
                          >
                            {otherSellerRole ? `Panel de ${ROLE_LABELS[otherSellerRole]}` : 'Usar como comprador'}
                          </button>
                        )}
                        <div style={{ height: 1, background: '#EDE4D8', margin: '4px 0' }} />
                        <button
                          onClick={async () => {
                            await signOutUser(isAllied && storeConfig.slug ? `/${storeConfig.slug}` : '/')
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 14px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: "'Nunito Sans', sans-serif",
                            color: '#D06050',
                          }}
                          className="hover:bg-[#FFF5F3]"
                        >
                          Cerrar sesión
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Botón Carrito - Oculto en Inicio, en Experiencias, en Mi panel y para rol Asociacion */}
            {activeNav !== 'home' && activeNav !== 'tourism' && activeNav !== 'profile' && userRole !== 'asociacion' && !isStoreAdmin && (
              <button
                type="button"
                onClick={onCartClick}
                aria-label="Ver carrito"
                style={{
                  position: 'relative',
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4A5248',
                  transition: 'all 180ms ease',
                }}
                className="hover:bg-[#20513410]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="20.5" r="1.3" />
                  <circle cx="18" cy="20.5" r="1.3" />
                  <path d="M2 3h2.6l2.4 11.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L21.4 7H5.6" />
                </svg>
                {cartCount !== undefined && cartCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 0,
                      background: '#D06050',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 800,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {cartCount}
                  </span>
                )}
              </button>
            )}

            {/* Menu Hamburger (Mobile) */}
            {(!isAllied || userRole === 'admin') && (
            <button
              className="flex md:hidden items-center justify-center"
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Abrir menú"
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#205134',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isMenuOpen ? (
                  <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                ) : (
                  <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>
                )}
              </svg>
            </button>
            )}
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMenuOpen && (
          <div className="md:hidden" style={{ background: '#FAF7F0', borderTop: '1px solid #EDE4D8', padding: '8px 24px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {userRole === 'admin' && (
              <button
                type="button"
                onClick={() => { onNavigate?.('superadmin'); setIsMenuOpen(false); }}
                style={{
                  background: 'linear-gradient(135deg, #205134 0%, #173E26 100%)',
                  color: '#fff',
                  border: '1px solid rgba(229,174,48,0.5)',
                  textAlign: 'left',
                  padding: '12px 16px',
                  fontSize: 15,
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontWeight: 700,
                  borderRadius: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span>⚡</span>
                <span>Panel Super Admin</span>
              </button>
            )}
            {navItems.map((item, index) => {
              const isActive = isActiveItem(item)
              return (
                <Fragment key={item.store ?? item.id}>
                {index === alliesIndex && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0' }}>
                    <div style={{ padding: '8px 16px 4px', fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif" }}>Aliados</div>
                    {alliedStores.length === 0 ? (
                      <div style={{ padding: '6px 24px', fontSize: 13, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif" }}>Pronto tendremos nuevos aliados.</div>
                    ) : alliedStores.map((s) => (
                      <button
                        key={s.store}
                        type="button"
                        onClick={() => goToAlly(s.store)}
                        style={{ background: activeNav === 'store' && store === s.store ? '#EAF3EC' : 'transparent', border: 'none', textAlign: 'left', padding: '10px 16px 10px 28px', borderRadius: 12, cursor: 'pointer', fontFamily: "'Nunito Sans', sans-serif" }}
                      >
                        {s.ally_name && <div style={{ fontSize: 12, fontWeight: 700, color: '#8A8070' }}>{s.ally_name}</div>}
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#205134' }}>{s.name}</div>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { goTo(item); setIsMenuOpen(false); }}
                  style={{
                    background: isActive ? '#EAF3EC' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontSize: 15,
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? '#205134' : '#5A5248',
                    borderRadius: 12,
                    cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
                </Fragment>
              )
            })}
          </div>
        )}
      </header>

      {/* Botón Volver Arriba */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Volver arriba"
        style={{
          position: 'fixed',
          top: 90,
          left: '50%',
          transform: `translateX(-50%) translateY(${showScrollTop ? '0' : '-20px'})`,
          opacity: showScrollTop ? 1 : 0,
          pointerEvents: showScrollTop ? 'auto' : 'none',
          zIndex: 40,
          background: 'rgba(32, 81, 52, 0.85)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "'Nunito Sans', sans-serif",
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 12px rgba(32,81,52,0.15)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className="hover:bg-[#1a422a]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        Inicio
      </button>

      {/* ═══════════ CONTENIDO ═══════════ */}
      <div
        className="flex-1"
        style={{ width: '100%' }}
      >
        <div
          className={contentClassName}
          style={{
            padding: '0 18px',
            ...contentStyle,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
