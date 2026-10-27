import { MAIN_STORE, type StoreId } from './stores'
import type { Tab } from './types'

// Rutas de cada pestaña: la pantalla actual queda en la URL (se puede recargar,
// compartir y usar el botón atrás). Cada tienda aliada tiene su vitrina en /<slug>
// (store_settings.slug) y las páginas vistas desde ella cuelgan de esa ruta para
// conservar la marca al recargar.

const TAB_PATHS: Record<Exclude<Tab, 'store'>, string> = {
  home: '/',
  market: '/productos',
  tourism: '/experiencias',
  about: '/nosotros',
  profile: '/mi-cuenta',
  admin: '/panel',
  superadmin: '/superadmin',
  storeadmin: '/admin-tienda',
}

const PATH_TABS = new Map(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab]))

/** Tienda con su ruta (lo mínimo que necesitan las rutas de store_settings) */
export interface StoreRoute {
  store: StoreId
  slug: string | null
}

export function pathForTab(tab: Tab, store: StoreId, stores: StoreRoute[]): string {
  const slug = store === MAIN_STORE ? null : stores.find((s) => s.store === store)?.slug
  if (!slug) return tab === 'store' ? '/' : TAB_PATHS[tab]
  // Dentro de una tienda aliada su inicio es la propia vitrina
  if (tab === 'store' || tab === 'home' || tab === 'market') return `/${slug}`
  return `/${slug}${TAB_PATHS[tab]}`
}

/** Pestaña y tienda a partir de la ruta. Rutas desconocidas → inicio de la tienda principal. */
export function routeFromPath(pathname: string, stores: StoreRoute[]): { tab: Tab; store: StoreId } {
  const clean = pathname.replace(/\/+$/, '') || '/'
  const [, first = '', ...rest] = clean.split('/')
  const allied = stores.find((s) => s.store !== MAIN_STORE && s.slug === first)
  if (allied) {
    const tab = rest.length ? PATH_TABS.get(`/${rest.join('/')}`) : undefined
    return { tab: tab && tab !== 'home' && tab !== 'market' ? tab : 'store', store: allied.store }
  }
  return { tab: PATH_TABS.get(clean) ?? 'home', store: MAIN_STORE }
}

/**
 * La ruta corresponde a una pantalla de la app (o a una tienda aliada). Las demás muestran la
 * página 404: antes cualquier dirección mal escrita abría el inicio sin avisar.
 */
export function isKnownPath(pathname: string, stores: StoreRoute[]): boolean {
  const clean = pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '') || '/'
  if (PATH_TABS.has(clean)) return true
  const [, first = '', ...rest] = clean.split('/')
  const allied = stores.some((s) => s.store !== MAIN_STORE && s.slug === first)
  return allied && (rest.length === 0 || PATH_TABS.has(`/${rest.join('/')}`))
}
