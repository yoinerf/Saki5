// Tipos del catálogo (productos y carrito) compartidos por marketplace, checkout y App
import type { Database } from './database.types'
import sinImagen from '../assets/sin-imagen.webp'
import { cartLineKey, variantPrice, type ProductVariant, type VariantAttribute } from './variants'

/** Fila de public.images (embebida en products/experiences con images(*)) */
export type ImageRow = Database['public']['Tables']['images']['Row']

/** Fila de public.advertisements */
export type AdvertisementRow = Database['public']['Tables']['advertisements']['Row']

/** orders.shipping_address (jsonb): lo que envía el checkout en p_shipping */
export interface ShippingAddress {
  fullName?: string
  phone?: string
  department?: string
  municipality?: string
  address?: string
  deliveryNotes?: string
}

export interface Product {
  id: string
  title: string
  producer: string
  rating: number
  reviews: number
  price: number
  unit: string
  category: string
  description?: string
  type: 'producto' | 'experiencia'
  certified: boolean
  img: string
  images?: ImageRow[]
  stock: string
  outstanding?: boolean
  /** Atributos y combinaciones (vacíos si el producto no tiene variantes) */
  variantAttributes?: VariantAttribute[]
  variants?: ProductVariant[]
}

export interface CartItem {
  product: Product
  quantity: number
  /** Combinación elegida (productos con variantes) */
  variant?: ProductVariant | null
}

/** Clave de la línea en el carrito guardado */
export function cartItemKey(item: CartItem) {
  return cartLineKey(item.product.id, item.variant?.id)
}

/** Precio unitario de la línea: el de la combinación o el del producto */
export function cartItemPrice(item: CartItem) {
  return variantPrice(item.product.price, item.variant)
}

/** Productos con variantes: hay que elegir combinación antes de comprar */
export function hasVariants(product: Pick<Product, 'variants'>) {
  return (product.variants?.length ?? 0) > 0
}

/** Imagen genérica para productos y experiencias que aún no tienen foto */
export const PLACEHOLDER_IMG = sinImagen

/** Imagen principal de un producto/experiencia, o la de respaldo */
export function primaryImageUrl(images: ImageRow[] | null | undefined, fallback: string = PLACEHOLDER_IMG) {
  return images?.find((i) => i.is_primary)?.image_url || images?.[0]?.image_url || fallback
}
