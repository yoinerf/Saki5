import { useState, useEffect, useMemo, useRef, lazy, Suspense, type JSX } from 'react'
import HomeScreen from './screens/HomeScreen'
import ScreenShell from './components/ScreenShell'
import { cartItemKey, type CartItem } from './lib/catalog'
import { supabase, authRedirectInfo } from './lib/supabase'
import { MAIN_STORE, cartKey, isMainStore, type StoreId } from './lib/stores'
import { useStores } from './lib/storesContext'
import { pathForTab, routeFromPath } from './lib/routes'
import { legalPageFromPath } from './lib/legal'
import { AppNavigationContext } from './lib/navigation'
import type { Tab, UserRole } from './lib/types'
import { useAuth } from './lib/auth'
import logoImg from './assets/logo-nofond.png'

// Pantallas cargadas bajo demanda: no se descargan hasta que se necesitan
// (los paneles de admin, por ejemplo, no llegan al navegador de un comprador)
const MarketplaceScreen = lazy(() => import('./screens/MarketplaceScreen'))
const CheckoutScreen = lazy(() => import('./screens/CheckoutScreen'))
const TourismScreen = lazy(() => import('./screens/TourismScreen'))
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'))
const BuyerPanelScreen = lazy(() => import('./screens/BuyerPanelScreen'))
const RegisterScreen = lazy(() => import('./screens/RegisterScreen'))
const LoginScreen = lazy(() => import('./screens/LoginScreen'))
const AdminPanelScreen = lazy(() => import('./screens/AdminPanelScreen'))
const SuperAdminScreen = lazy(() => import('./screens/SuperAdminScreen'))
const SetNewPasswordScreen = lazy(() => import('./screens/SetNewPasswordScreen'))
const StoreAdminScreen = lazy(() => import('./screens/StoreAdminScreen'))
const AboutScreen = lazy(() => import('./screens/AboutScreen'))
const CompleteProfileScreen = lazy(() => import('./screens/CompleteProfileScreen'))
const LegalScreen = lazy(() => import('./screens/LegalScreen'))

function ScreenLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: '#F5EEE6', color: '#205134', fontFamily: "'Nunito Sans', sans-serif", fontSize: 15, fontWeight: 600 }}>
      Cargando...
    </div>
  )
}

type AppFlow = 'auth' | 'login' | 'app'

const getVisibleTabs = (role: UserRole | undefined, store: StoreId, hasAlliedStores: boolean): Tab[] => {
  const allied: Tab[] = hasAlliedStores ? ['store'] : []
  switch (role) {
    case 'admin':
      return ['superadmin', 'home', 'market', 'tourism', ...allied, 'profile', 'about']
    case 'asociacion':
      // El productor solo ve la tienda a la que pertenece (el de una tienda aliada no ve páginas de El Campo Nos Une)
      return isMainStore(store) ? ['admin', 'market', 'about'] : ['admin', 'store']
    case 'turismo':
      return ['admin', 'tourism', 'about']
    case 'admin_tienda':
      // Su panel (productores y revisión de perfiles) y la vitrina de su tienda
      return isMainStore(store) ? ['storeadmin', 'market'] : ['storeadmin', 'store']
    case 'comprador':
    default:
      return ['home', 'market', 'tourism', ...allied, 'profile', 'about']
  }
}

// Espera a conocer la sesión y las tiendas: la ruta inicial depende de ambas
export default function App() {
  const { loading: checkingSession } = useAuth()
  const { loading: loadingStores } = useStores()

  // Privacidad y condiciones: públicas, sin esperar sesión ni tiendas
  const legalPage = legalPageFromPath(window.location.pathname)
  if (legalPage) {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <LegalScreen page={legalPage} />
      </Suspense>
    )
  }

  if (checkingSession || loadingStores) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: '#F5EEE6', color: '#205134', fontFamily: "'Nunito Sans', sans-serif" }}
      >
        <div style={{ textAlign: 'center' }}>
          <img src={logoImg} alt="SAKI5" style={{ height: 60, margin: '0 auto 16px', display: 'block' }} />
          <p style={{ fontSize: 15, fontWeight: 600 }}>Cargando...</p>
        </div>
      </div>
    )
  }

  return <AppContent />
}

function AppContent() {
  const { allStores, alliedStores, getStore } = useStores()
  // Sesión y perfil (rol y tienda del usuario) los carga AuthProvider
  // userRole es el rol activo: una cuenta con varios roles (p. ej. Comprador + Asociación) usa la app con uno a la vez
  const { session, role: userRole, store: userStore, profileLoadId, needsProfileCompletion, mustChangePassword: passwordFlag, refreshProfile, setActiveRole } = useAuth()
  // Pantalla y tienda de la URL con la que se abrió la app
  const [initialRoute] = useState(() => routeFromPath(window.location.pathname, allStores))

  // Enlace de recuperación vencido o inválido: mostrar el login con el aviso
  const [flow, setFlow] = useState<AppFlow>(() => (!session && authRedirectInfo.error ? 'login' : 'app'))
  const [activeTab, setActiveTab] = useState<Tab>(initialRoute.tab)
  // Tienda aliada cuya vitrina se está viendo (pestaña 'store')
  const [shopStore, setShopStore] = useState<StoreId | null>(isMainStore(initialRoute.store) ? null : initialRoute.store)
  // Redirecciones automáticas (rol, permisos, URL inicial) reemplazan la entrada del
  // historial en vez de agregar una: así el botón atrás no vuelve a una ruta que redirige.
  // Guarda la pestaña destino de la redirección ('initial' = normalizar la URL de entrada).
  const redirectTarget = useRef<Tab | 'initial' | null>('initial')
  const redirectTo = (tab: Tab) => {
    redirectTarget.current = tab
    setActiveTab(tab)
  }
  // Tienda desde la que el comprador abrió su panel (para mantener la marca)
  const [panelStore, setPanelStore] = useState<StoreId>(initialRoute.store)
  const [checkoutItems, setCheckoutItems] = useState<CartItem[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [initialProduct, setInitialProduct] = useState<string | null>(null)
  // recovery: llegó desde el enlace del correo · forced: entró con contraseña temporal del admin
  const [passwordMode, setPasswordMode] = useState<'recovery' | 'forced' | null>(authRedirectInfo.isRecovery ? 'recovery' : null)

  // Vitrina por defecto: la tienda del productor aliado, la que se estaba viendo o la primera
  const defaultShopStore = (): StoreId | null => {
    if ((userRole === 'asociacion' || userRole === 'admin_tienda') && !isMainStore(userStore)) return userStore
    return shopStore ?? alliedStores[0]?.store ?? null
  }

  /** Cambia de pestaña; 'store' abre la vitrina de la tienda aliada correspondiente */
  const navigate = (tab: Tab) => {
    if (tab === 'store') setShopStore(defaultShopStore())
    setActiveTab(tab)
  }

  const openStore = (store: StoreId) => {
    setFlow('app')
    setCheckoutOpen(false)
    if (isMainStore(store)) {
      setActiveTab('market')
      return
    }
    setShopStore(store)
    setActiveTab('store')
  }

  /** Cuenta con varios roles: pasa al otro rol y abre su pantalla principal (panel del comprador o del vendedor) */
  const switchRole = (role: UserRole) => {
    setFlow('app')
    setCheckoutOpen(false)
    setActiveRole(role)
    if (role === 'comprador') {
      setPanelStore(viewStore)
      setActiveTab('profile')
    } else if (role === 'asociacion' || role === 'turismo') {
      setActiveTab('admin')
    }
  }

  // Eventos de autenticación que solo afectan la interfaz (los datos los maneja AuthProvider)
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
      if (event === 'PASSWORD_RECOVERY') setPasswordMode('recovery')
      if (event === 'SIGNED_OUT') setPasswordMode(null)
      setFlow('app')
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Contraseña temporal asignada por el admin: obligar a cambiarla. La marca de la base no la puede
  // quitar el usuario; la de user_metadata se mantiene para cuentas marcadas antes de la migración.
  const mustChangePassword = passwordFlag || !!session?.user.user_metadata?.must_change_password
  useEffect(() => {
    if (mustChangePassword) setPasswordMode((prev) => prev ?? 'forced')
  }, [mustChangePassword])

  const visibleTabs = useMemo(() => getVisibleTabs(userRole, userStore, alliedStores.length > 0), [userRole, userStore, alliedStores.length])

  // Cada vez que se carga un perfil, llevar al usuario a la pestaña de su rol
  useEffect(() => {
    if (profileLoadId === 0) return
    // Primera carga: si la URL apunta a una pantalla permitida para el rol (y no es el
    // inicio genérico), se respeta el enlace directo
    if (profileLoadId === 1 && initialRoute.tab !== 'home' && visibleTabs.includes(initialRoute.tab)) {
      return
    }
    const prev = activeTab
    let next = prev
    if (userRole === 'admin') {
      next = prev === 'market' || prev === 'tourism' || prev === 'profile' || prev === 'store' ? prev : 'superadmin'
    } else if (userRole === 'admin_tienda') {
      next = 'storeadmin'
    } else if (userRole === 'asociacion' || userRole === 'turismo') {
      if (userRole === 'asociacion' && isMainStore(userStore) && prev === 'market') next = 'market'
      else if (userRole === 'asociacion' && !isMainStore(userStore) && prev === 'store') next = 'store'
      else if (userRole === 'turismo' && prev === 'tourism') next = 'tourism'
      else next = 'admin'
    }
    if ((userRole === 'asociacion' || userRole === 'admin_tienda') && !isMainStore(userStore)) setShopStore(userStore)
    if (next !== prev) redirectTo(next)
    // Solo cuando termina una carga de perfil, no en cada cambio de rol/tienda intermedio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoadId])

  // Tienda que se está viendo: define la marca de los paneles, el checkout y la URL.
  // Dentro de una tienda aliada no se muestra la marca El Campo Nos Une.
  const viewStore: StoreId =
    activeTab === 'store' ? shopStore ?? MAIN_STORE
    : activeTab === 'admin' || activeTab === 'storeadmin' ? userStore
    : activeTab === 'profile' ? panelStore
    : MAIN_STORE

  useEffect(() => {
    document.title = getStore(viewStore).name
  }, [viewStore, getStore])

  // La pestaña actual queda en la URL (ver lib/routes)
  useEffect(() => {
    if (flow !== 'app') return
    const path = pathForTab(activeTab, viewStore, allStores)
    const target = redirectTarget.current
    // Si hay una redirección hacia otra pestaña aún no aplicada, se conserva para cuando llegue
    const replace = target === 'initial' || target === activeTab
    if (replace) redirectTarget.current = null
    if (path === window.location.pathname) return
    const url = path + window.location.search + window.location.hash
    if (replace) window.history.replaceState(window.history.state, '', url)
    else window.history.pushState({ tab: activeTab }, '', url)
  }, [activeTab, viewStore, flow, allStores])

  useEffect(() => {
    if (flow !== 'app') return
    if (!visibleTabs.includes(activeTab)) redirectTo(visibleTabs[0] ?? 'home')
    else if (activeTab === 'store' && !shopStore) {
      // Vitrina sin tienda (p. ej. se desactivó): abrir la que corresponda
      const store = defaultShopStore()
      if (store) setShopStore(store)
      else redirectTo('home')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, visibleTabs, activeTab, shopStore])

  /** Verifica si el usuario está autenticado antes de mostrar el perfil */
  const handleProfileClick = () => {
    if (!session) {
      setFlow('login')
    } else if (userRole === 'admin_tienda') {
      setActiveTab('storeadmin')
    } else {
      if (activeTab !== 'profile') setPanelStore(viewStore)
      setActiveTab('profile')
    }
  }

  const returnToStore = () => {
    setFlow('app')
    if (userRole === 'admin_tienda') {
      setActiveTab('storeadmin')
    } else if (!isMainStore(viewStore) || (userRole === 'asociacion' && !isMainStore(userStore))) {
      navigate('store')
    } else if (userRole === 'turismo') {
      setActiveTab('tourism')
    } else {
      setActiveTab('market')
    }
  }

  const goToProduct = (productId: string) => {
    setInitialProduct(productId)
    setActiveTab('market')
  }

  const returnToHome = () => {
    setFlow('app')
    if (userRole === 'admin_tienda') {
      setActiveTab('storeadmin')
    } else if (!isMainStore(viewStore) && userRole !== 'admin' && userRole !== 'turismo') {
      if (userRole === 'asociacion') setActiveTab('admin')
      else navigate('store')
    } else if (userRole === 'admin') {
      setActiveTab('superadmin')
    } else if (userRole === 'asociacion' || userRole === 'turismo') {
      setActiveTab('admin')
    } else {
      setActiveTab('home')
    }
  }

  const handleOpenCheckout = (products: CartItem[]) => {
    window.history.pushState({ modal: 'checkout' }, '', window.location.href)
    setCheckoutItems(products)
    setCheckoutOpen(true)
  }

  const handleCloseCheckout = () => {
    // Solo se vuelve atrás en el historial: el listener de popstate cierra el checkout
    window.history.back()
  }

  useEffect(() => {
    const handlePopState = () => {
      // Atrás/adelante del navegador: primero cierra lo que esté abierto encima
      if (checkoutOpen) {
        setCheckoutOpen(false)
        return
      }
      if (flow !== 'app') setFlow('app')
      // Si no, vuelve a la pestaña de la URL
      const route = routeFromPath(window.location.pathname, allStores)
      if (route.tab === 'profile') setPanelStore(route.store)
      if (route.tab === 'store') setShopStore(route.store)
      setActiveTab(route.tab)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [checkoutOpen, flow, allStores])

  const mainScreens: Record<Exclude<Tab, 'market' | 'store'>, JSX.Element> = {
    home: (
      <HomeScreen onNavigate={navigate} activeNav={activeTab} onProfileClick={handleProfileClick} userRole={userRole} onSelectProduct={goToProduct} />
    ),
    admin: (
      <AdminPanelScreen onNavigate={navigate} activeNav={activeTab} onProfileClick={handleProfileClick} userRole={userRole} store={userStore} />
    ),
    storeadmin: (
      <StoreAdminScreen onNavigate={navigate} activeNav={activeTab} onProfileClick={handleProfileClick} userRole={userRole} store={userStore} />
    ),
    superadmin: (
      <SuperAdminScreen onNavigate={navigate} activeNav={activeTab} onProfileClick={handleProfileClick} userRole={userRole} />
    ),
    tourism: <TourismScreen onRequireAuth={(mode) => setFlow(mode)} onNavigate={navigate} activeNav={activeTab} onProfileClick={handleProfileClick} userRole={userRole} />,
    // El comprador tiene su propio panel (pedidos, pagos, reseñas, favoritos, solicitudes, datos)
    profile: userRole === 'comprador' ? (
      <BuyerPanelScreen
        userRole={userRole}
        onNavigate={navigate}
        activeNav={activeTab}
        onProfileClick={handleProfileClick}
        store={panelStore}
        onViewProduct={(productId, store) => {
          setInitialProduct(productId)
          openStore(store ?? MAIN_STORE)
        }}
      />
    ) : (
      <ProfileScreen userRole={userRole} onNavigate={navigate} activeNav={activeTab} onProfileClick={handleProfileClick} />
    ),
    about: (
      <AboutScreen onNavigate={navigate} activeNav={activeTab} onProfileClick={handleProfileClick} userRole={userRole} />
    ),
  }

  // Crear nueva contraseña (enlace de recuperación o contraseña temporal) antes de usar la app
  if (passwordMode) {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <SetNewPasswordScreen mode={passwordMode} onDone={() => setPasswordMode(null)} />
      </Suspense>
    )
  }

  // Cuenta nueva con Google: pedir los datos obligatorios antes de usar la app
  if (needsProfileCompletion) {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <CompleteProfileScreen onDone={refreshProfile} />
      </Suspense>
    )
  }

  return (
    <AppNavigationContext.Provider value={{ openStore, switchRole }}>
    <Suspense fallback={<ScreenLoader />}>
    <div className="min-h-screen w-full" style={{ background: '#F5EEE6' }}>
      <div className="min-h-screen w-full flex flex-col">
        <div className="flex-1">
          {flow === 'auth' && (
            <div key="register-flow" className="auth-screen-enter w-full min-h-screen">
              <RegisterScreen
                onComplete={() => setFlow('app')}
                onLogin={() => setFlow('login')}
                onBackToStore={returnToStore}
                onBackToHome={returnToHome}
              />
            </div>
          )}
          {flow === 'login' && (
            <div key="login-flow" className="auth-screen-enter w-full min-h-screen">
              <LoginScreen
                onLogin={() => setFlow('app')}
                onRegister={() => setFlow('auth')}
                onBackToStore={returnToStore}
                onBackToHome={returnToHome}
              />
            </div>
          )}
          {flow === 'app' && (checkoutOpen ? (
            // El carrito conserva el header: navegar desde él cierra el checkout
            <ScreenShell
              store={viewStore}
              activeNav={activeTab}
              userRole={userRole}
              onNavigate={(t) => {
                setCheckoutOpen(false)
                navigate(t)
              }}
              onProfileClick={() => {
                setCheckoutOpen(false)
                handleProfileClick()
              }}
              cartCount={checkoutItems.reduce((sum, item) => sum + item.quantity, 0)}
              contentStyle={{ padding: 0 }}
            >
            <CheckoutScreen
              store={viewStore}
              items={checkoutItems}
              onItemsChange={(newItems) => {
                setCheckoutItems(newItems)
                const newCart = newItems.reduce((acc, item) => {
                  acc[cartItemKey(item)] = item.quantity
                  return acc
                }, {} as Record<string, number>)
                localStorage.setItem(cartKey(viewStore), JSON.stringify(newCart))
              }}
              onBack={handleCloseCheckout}
              onRequireAuth={(mode) => setFlow(mode)}
              onViewProduct={(productId) => {
                setInitialProduct(productId)
                setCheckoutOpen(false)
              }}
            />
            </ScreenShell>
          ) : activeTab === 'market' || activeTab === 'store' ? (
            <MarketplaceScreen
              key={viewStore}
              store={viewStore}
              onOpenCheckout={handleOpenCheckout}
              onNavigate={navigate}
              activeNav={activeTab}
              onProfileClick={handleProfileClick}
              initialSelectedProduct={initialProduct}
              onClearInitialProduct={() => setInitialProduct(null)}
              userRole={userRole}
            />
          ) : mainScreens[activeTab])}
        </div>
      </div>
    </div>
    </Suspense>
    </AppNavigationContext.Provider>
  )
}
