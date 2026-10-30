import logoAmazonica from '../assets/logo-amazonica.webp'
import bannerAmazonica from '../assets/banner-amazonica.webp'

export interface StoreBranding {
  logo?: string
  banner?: string
}

// Identidad visual propia de tiendas aliadas, por slug (store_settings.slug).
// Las tiendas que no estén aquí usan el encabezado y el banner estándar.
const BRANDING_BY_SLUG: Record<string, StoreBranding> = {
  'tienda-amazonica': { logo: logoAmazonica, banner: bannerAmazonica },
}

export const getStoreBranding = (slug: string | null | undefined): StoreBranding =>
  (slug && BRANDING_BY_SLUG[slug]) || {}