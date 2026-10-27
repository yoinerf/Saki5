import type { Tab } from './types'

// Título, descripción y URL canónica de cada pantalla. index.html trae los valores del inicio
// (los que leen WhatsApp, Facebook y otros que no ejecutan JavaScript); aquí se actualizan al
// navegar, para los buscadores que sí lo ejecutan (Google).

export const SITE_URL = 'https://www.saki5.com'
export const DEFAULT_DESCRIPTION =
  'Conectamos productores campesinos y turismo comunitario con quienes buscan lo nuestro. Compra productos del campo colombiano y reserva experiencias rurales.'

// Paneles y cuentas: no tienen contenido público, no se indexan
const PRIVATE_TABS: Tab[] = ['profile', 'admin', 'superadmin', 'storeadmin']

const TAB_META: Partial<Record<Tab, { title: string; description: string }>> = {
  market: {
    title: 'Productos del campo',
    description: 'Café, frutas, hortalizas, lácteos y más, directo de productores campesinos y asociaciones de Colombia.',
  },
  tourism: {
    title: 'Experiencias rurales',
    description: 'Reserva experiencias de turismo comunitario: recorridos, talleres y visitas con anfitriones del campo colombiano.',
  },
  about: {
    title: 'Nosotros',
    description: 'Quiénes somos: una red que une a productores campesinos, turismo comunitario y compradores en Colombia.',
  },
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

/** Aplica título, descripción, URL canónica e indexación de la página actual */
export function setPageMeta({ title, description, path, noindex = false }: {
  title: string
  description: string
  path: string
  noindex?: boolean
}) {
  document.title = title
  setMeta('name', 'description', description)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:url', SITE_URL + path)
  setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
  setCanonical(SITE_URL + path)
}

/** Metadatos de una pestaña de la app (storeName: tienda que se está viendo) */
export function metaForTab(tab: Tab, storeName: string, storeDescription: string | null, path: string) {
  const meta = TAB_META[tab]
  return {
    title: meta ? `${meta.title} · ${storeName}` : storeName,
    description: meta?.description ?? storeDescription?.trim() ?? DEFAULT_DESCRIPTION,
    path,
    noindex: PRIVATE_TABS.includes(tab),
  }
}
