import React, { useRef, useState, useEffect } from 'react'
import ScreenShell from '../components/ScreenShell'
import ProductModal, { type ProductFormData } from '../components/ProductModal'
import { supabase } from '../lib/supabase'
import { fetchRatingStats } from '../lib/ratings'
import { hasSeenPromoInSession, markPromoAsSeenInSession } from '../lib/promoSession'
import { isAdvertisementActive } from '../lib/dateColombia'
import { MAIN_STORE, cartKey, isMainStore, type StoreId } from '../lib/stores'
import { useStores } from '../lib/storesContext'
import { canCurrentUserPublish, confirmGoToDocuments } from '../lib/producerDocuments'
import { requestPanelSection } from '../lib/notifications'
import { alertDialog } from '../components/ConfirmDialog'
import type { Tab, UserRole } from '../lib/types'
import type { Json } from '../lib/database.types'
import ProductDetail from '../components/ProductDetail'
import { hasVariants, primaryImageUrl, type AdvertisementRow, type CartItem, type Product } from '../lib/catalog'
import { availableStock, normalizeVariants, parseCartLineKey, persistProductVariants, priceRange } from '../lib/variants'

interface MarketplaceScreenProps {
  onOpenCheckout?: (items: CartItem[]) => void
  onNavigate?: (tab: Tab) => void
  activeNav?: Tab
  onProfileClick?: () => void
  initialSelectedProduct?: string | null
  onClearInitialProduct?: () => void
  userRole?: UserRole | null
  /** Tienda que se muestra: cada una tiene sus productos, su carrito y su marca */
  store?: StoreId
}

// ─── MarketplaceScreen ────────────────────────────────────────────────────────
export default function MarketplaceScreen({
  onOpenCheckout,
  onNavigate,
  activeNav,
  onProfileClick,
  initialSelectedProduct,
  onClearInitialProduct,
  userRole,
  store = MAIN_STORE,
}: MarketplaceScreenProps) {
  // Tienda aliada: vitrina con su propia marca (store_settings)
  const isAllied = !isMainStore(store)
  const storeConfig = useStores().getStore(store)
  const payFirst = !storeConfig.payment_methods.includes('CashOnDelivery')
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [searchVal, setSearchVal] = useState('')
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(cartKey(store))
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed === 'object' && parsed !== null) {
          const cleaned: Record<string, number> = {}
          for (const [key, val] of Object.entries(parsed)) {
            if (typeof val === 'number' && val > 0) {
              cleaned[key] = val
            }
          }
          return cleaned
        }
      }
    } catch (e) {
      console.error('Error cargando carrito desde localStorage', e)
    }
    return {}
  })

  useEffect(() => {
    try {
      localStorage.setItem(cartKey(store), JSON.stringify(cart))
    } catch (e) {
      console.error('Error guardando el carrito en localStorage', e)
    }
  }, [cart])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<string | null>(initialSelectedProduct || null)

  const handleSelectProduct = (productId: string) => {
    window.history.pushState({ modal: 'product', id: productId }, '', window.location.href)
    setSelectedProduct(productId)
  }

  const handleBackFromProduct = () => {
    // Only go back in history; the popstate listener will clear selectedProduct
    window.history.back()
  }

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // If the new state has a product modal, show it; otherwise close detail view
      if (e.state?.modal === 'product' && e.state.id) {
        setSelectedProduct(e.state.id)
      } else {
        setSelectedProduct(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (initialSelectedProduct) {
      handleSelectProduct(initialSelectedProduct)
      onClearInitialProduct?.()
    }
  }, [initialSelectedProduct, onClearInitialProduct])
  const [addingProduct, setAddingProduct] = useState<{ id: string; phase: 'plusOne' | 'check' } | null>(null)
  const animationTimer = useRef<number | null>(null)
  const loadProducts = async () => {
    try {
      const [{ data: productsData, error: prodErr }, ratingStats, { data: categoriesData }] = await Promise.all([
        supabase.from('products').select('*, images(*), profiles:public_profiles(org_name, first_name, last_name), product_variant_attributes(name, options, position), product_variants(id, options, stock, price, image_url, active, position)').eq('store', store).order('created_at', { ascending: false }),
        fetchRatingStats(),
        supabase.from('categories').select('id, name')
      ])

      if (prodErr) {
        console.error('Error cargando productos:', prodErr)
        setLoading(false)
        return
      }


      const processed: Product[] = (productsData || []).map((p) => {
        // Sin reseñas no hay calificación que mostrar
        const stats = ratingStats.get(p.id)
        const count = stats?.reviews ?? 0
        const avgRating = stats?.rating ?? 0

        const catName = categoriesData?.find((c) => c.id === p.category_id)?.name || 'Sin categoría'
        const { attributes: variantAttributes, variants } = normalizeVariants(p.product_variant_attributes, p.product_variants)
        const primaryImg = primaryImageUrl(p.images)

        // Usar el nombre actual del perfil si está disponible (para reflejar cambios de organización)
        const profile = p.profiles
        const producerName = profile
          ? (profile.org_name?.trim() || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || p.producer || 'Productor')
          : (p.producer || 'Productor')

        return {
          ...p,
          type: 'producto' as const,
          producer: producerName,
          img: primaryImg,
          images: p.images || [],
          description: p.description || '',
          rating: avgRating,
          reviews: count,
          category: catName,
          unit: p.unit ?? '',
          stock: p.stock ?? '',
          certified: p.certified ?? false,
          outstanding: p.outstanding ?? false,
          variantAttributes,
          variants,
        }
      })

      if (categoriesData && categoriesData.length > 0) {
        setCategories(categoriesData as { id: string; name: string }[])
      }

      setProducts(processed)
    } catch (e) {
      console.error('Error en loadProducts:', e)
    } finally {
      setLoading(false)
    }
  }


  const [allAds, setAllAds] = useState<AdvertisementRow[]>([])
  const [activeAds, setActiveAds] = useState<AdvertisementRow[]>([])

  useEffect(() => {
    loadProducts()


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
        console.error('Error loading ads:', err)
      }
    }

    loadAds()
  }, [])

  const [dismissedCategories, setDismissedCategories] = useState<Record<string, boolean>>({})
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const [featuredSlideDir, setFeaturedSlideDir] = useState<'left' | 'right' | null>(null)
  const [featuredAnimating, setFeaturedAnimating] = useState(false)



  // Obtener TODOS los destacados de la categoría actual (o Todos)
  // La ventana flotante promocional SOLO debe aparecer si existe un anuncio activo y vigente en la tabla advertisements
  // Valida que no se haya visto en la sesión y valida estrictamente fechas de activación con hora Colombia
  const categoryFeaturedList = (() => {
    if (loading || selectedProduct || dismissedCategories[activeFilter]) return []

    const validAds = activeAds.filter((ad) => {
      if (ad.type !== 'product' || !ad.product_id) return false
      if (!isAdvertisementActive(ad)) return false
      const p = products.find((prod) => prod.id === ad.product_id)
      if (!p) return false
      if (hasSeenPromoInSession(ad.id)) return false
      return activeFilter === 'Todos' || p.category === activeFilter
    })

    return validAds.flatMap((ad) => {
      const p = products.find((prod) => prod.id === ad.product_id)
      if (!p) return []
      return [{ adId: ad.id, product: p, title: ad.title || p.title, img: ad.image_url || p.img }]
    })
  })()

  const categoryFeatured = categoryFeaturedList.length > 0 ? categoryFeaturedList[Math.min(featuredIndex, categoryFeaturedList.length - 1)] : null

  const categoryFeaturedListRef = useRef<typeof categoryFeaturedList>([])
  categoryFeaturedListRef.current = categoryFeaturedList

  // Auto-avance cada 5 segundos — dependencias estables, sin riesgo de bucle
  useEffect(() => {
    const interval = setInterval(() => {
      const list = categoryFeaturedListRef.current
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
    if (featuredAnimating || categoryFeaturedListRef.current.length <= 1) return
    setFeaturedSlideDir(dir === 'next' ? 'left' : 'right')
    setFeaturedAnimating(true)
    setTimeout(() => {
      const len = categoryFeaturedListRef.current.length
      setFeaturedIndex((prev) => {
        if (dir === 'next') return (prev + 1) % len
        return (prev - 1 + len) % len
      })
      setFeaturedSlideDir(null)
      setFeaturedAnimating(false)
    }, 320)
  }




  const isAdmin = userRole === 'admin'
  const isProducer = userRole === 'asociacion'
  const canCreateProduct = isProducer
  const filters = ['Todos', ...Array.from(new Set(products.map((product) => product.category?.trim()).filter(Boolean)))]
  // Líneas del carrito: "<productId>" o "<productId>::<variantId>" (productos con variantes)
  const cartItems: CartItem[] = Object.entries(cart).flatMap(([key, quantity]) => {
    const { productId, variantId } = parseCartLineKey(key)
    const product = products.find((p) => p.id === productId)
    if (!product || quantity <= 0) return []
    // Línea guardada antes de que el producto tuviera (o dejara de tener) variantes
    if (hasVariants(product) !== !!variantId) return []
    const variant = variantId ? product.variants?.find((v) => v.id === variantId && v.active) : null
    if (variantId && !variant) return []
    return [{ product, quantity, variant }]
  })
  const cartCount = isProducer
    ? 0
    : (loading ? Object.values(cart) : cartItems.map((item) => item.quantity)).reduce((sum, quantity) => sum + quantity, 0)

  // Unidades que se pueden agregar de una línea (null = sin límite)
  const lineLimit = (key: string) => {
    const { productId, variantId } = parseCartLineKey(key)
    const product = products.find((p) => p.id === productId)
    if (!product) return null
    const variant = variantId ? product.variants?.find((v) => v.id === variantId) ?? null : null
    if (variantId && !variant) return 0
    return availableStock(product.stock, variant)
  }

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

  const filtered = products.filter((p) => {
    // Ocultar productos/experiencias sin stock (stock = 0)
    if (p.stock !== undefined && p.stock !== null && p.stock !== '') {
      const stockNum = parseInt(String(p.stock).replace(/\D/g, ''), 10)
      if (!isNaN(stockNum) && stockNum <= 0) return false
    }
    const matchesFilter = activeFilter === 'Todos' || p.category === activeFilter
    const q = searchVal.trim().toLowerCase()
    const matchesSearch = !q || p.title.toLowerCase().includes(q) || p.producer.toLowerCase().includes(q)
    return matchesFilter && matchesSearch
  })

  // key: id del producto o línea de una combinación (cartLineKey). No pasa del stock disponible.
  const addToCart = (key: string) => {
    const limit = lineLimit(key)
    setCart((current) => {
      const next = (current[key] ?? 0) + 1
      if (limit !== null && next > limit) return current
      return { ...current, [key]: next }
    })
  }

  const addFromCard = (id: string) => {
    addToCart(id)
    if (animationTimer.current) window.clearTimeout(animationTimer.current)
    setAddingProduct({ id, phase: 'plusOne' })
    animationTimer.current = window.setTimeout(() => {
      setAddingProduct({ id, phase: 'check' })
      animationTimer.current = window.setTimeout(() => setAddingProduct(null), 650)
    }, 350)
  }

  const removeFromCart = (id: string) => {
    setCart((current) => {
      const next = { ...current }
      if ((next[id] ?? 0) <= 1) delete next[id]
      else next[id] -= 1
      return next
    })
  }

  // Validación documental antes de abrir el formulario (la BD también lo bloquea al guardar)
  const togglePublishForm = async () => {
    if (showForm) {
      setShowForm(false)
      return
    }
    if (!(await canCurrentUserPublish())) {
      if (await confirmGoToDocuments()) {
        requestPanelSection('settings')
        onNavigate?.('admin')
      }
      return
    }
    setShowForm(true)
  }

  const handleCheckoutCart = () => {
    onOpenCheckout?.(cartItems)
  }

  const formatPrice = (n: number) => `$${n.toLocaleString('es-CO')}`

  const handleCreateProduct = async (formData: ProductFormData) => {
    if (!canCreateProduct) {
      setSubmitMessage('Tu perfil no permite publicar productos')
      return
    }

    setSaving(true)
    setSubmitMessage('')

    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user

    if (!user) {
      setSubmitMessage('Debes iniciar sesión para publicar un producto')
      setSaving(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, org_name')
      .eq('id', user.id)
      .single()

    const payload = {
      producer_id: user.id,
      title: formData.title.trim(),
      producer: profile?.org_name || `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Productor',
      price: Number(formData.price),
      unit: formData.unit || 'und',
      category_id: formData.category_id || null,
      certified: formData.certified,
      stock: formData.stockNum ? `${formData.stockNum}` : '0',
      description: formData.description ? formData.description.trim() : null,
    }

    const { data: insertedProduct, error } = await supabase.from('products').insert([payload]).select()

    if (error) {
      setSubmitMessage(error.message)
      setSaving(false)
      await alertDialog({ title: 'No se pudo crear el producto', message: error.message, tone: 'danger' })
      return
    }

    if (insertedProduct?.[0]?.id && formData.uploadedImages && formData.uploadedImages.length > 0) {
      const imageRows = formData.uploadedImages.map((img) => ({
        product_id: insertedProduct[0].id,
        experience_id: null,
        storage_path: img.storagePath,
        image_url: img.imageUrl,
        is_primary: img.isPrimary,
        sort_order: img.sortOrder,
      }))
      const { error: imgErr } = await supabase.from('images').insert(imageRows)
      if (imgErr) await alertDialog({ title: 'El producto se creó, pero sus imágenes no', message: imgErr.message, tone: 'warning' })
    }

    if (insertedProduct?.[0]?.id) {
      const variantsError = await persistProductVariants(insertedProduct[0].id, formData.variants, false, formData.stockNum, formData.variantImagesToDelete)
      if (variantsError) await alertDialog({ title: 'El producto se creó, pero sus variantes no', message: variantsError, tone: 'warning' })
    }

    const activitySaved = await recordActivity({
      userId: user.id,
      userRoleValue: 'asociacion',
      type: 'product_created',
      title: 'Producto publicado',
      description: `${payload.title} quedó disponible en el marketplace`,
      entityType: 'products',
      entityId: insertedProduct?.[0]?.id ?? null,
      metadata: { product_title: payload.title, price: payload.price },
    })

    setShowForm(false)
    setSaving(false)
    setSubmitMessage(
      activitySaved
        ? 'Producto publicado correctamente'
        : 'Producto guardado, pero la actividad no se pudo registrar en el feed.'
    )
    loadProducts()
  }

  const renderProductCard = (product: Product) => {
    const isOutOfStock = (() => {
      if (product.stock === undefined || product.stock === null || product.stock === '') return false
      const p = parseInt(String(product.stock).replace(/\D/g, ''), 10)
      return !isNaN(p) && p <= 0
    })()

    // Con variantes se elige la combinación en el detalle
    const withVariants = hasVariants(product)
    const range = priceRange(product.price, product.variants ?? [])

    return (
      <div
        key={product.id}
        className="marketplace-card group"
        onClick={() => handleSelectProduct(product.id)}
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
            src={product.img}
            alt={product.title}
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
          <span style={{ position: 'absolute', top: 8, left: 8, background: product.type === 'experiencia' ? '#EAF3EC' : '#FFF6E5', color: product.type === 'experiencia' ? '#205134' : '#A86B05', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, letterSpacing: 0.5 }}>
            {product.type === 'experiencia' ? '🏞️ EXPERIENCIA' : product.category ? `🌽 ${product.category.toUpperCase()}` : '🌾 PRODUCTO'}
          </span>
          {isOutOfStock ? (
            <span style={{ position: 'absolute', top: 8, right: 8, background: '#FFF3EB', color: '#9B4728', border: '1px solid #F3D2C4', fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 20 }}>
              {product.type === 'experiencia' ? 'SIN CUPOS' : 'AGOTADO'}
            </span>
          ) : product.reviews > 0 ? (
            <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.92)', color: '#205134', fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 20 }}>
              ⭐ {product.rating} <span style={{ fontWeight: 500, color: '#666' }}>({product.reviews})</span>
            </span>
          ) : (
            <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.85)', color: '#888', fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 20 }}>
              NUEVO
            </span>
          )}
        </div>
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#205134', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              {product.producer}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#1C3A14',
                fontFamily: "'Poppins', sans-serif",
                lineHeight: 1.3,
                marginBottom: 6,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {product.title}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: product.type === 'experiencia' ? '#205134' : '#C8860A', marginBottom: 14 }}>
              {withVariants && range.min !== range.max && <span style={{ fontSize: 11, color: '#888', fontWeight: 600, marginRight: 4 }}>Desde</span>}
              {formatPrice(withVariants ? range.min : product.price)}
              {!withVariants && <span style={{ fontSize: 11, color: '#888', fontWeight: 500, marginLeft: 4 }}>/ {product.unit}</span>}
            </div>
          </div>

          {!isProducer && (
            isOutOfStock ? (
              <div
                style={{
                  width: '100%',
                  height: 36,
                  background: '#FFF3EB',
                  color: '#9B4728',
                  border: '1px solid #F3D2C4',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span>{product.type === 'experiencia' ? 'Sin cupos' : 'Agotado'}</span>
              </div>
            ) : withVariants ? (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); handleSelectProduct(product.id) }}
                style={{
                  width: '100%',
                  height: 36,
                  background: '#F5EEE6',
                  color: '#205134',
                  border: '1px solid #E8DED0',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  transition: 'all 0.2s ease',
                }}
                className="hover:bg-[#205134] hover:text-white"
              >
                Elegir opciones
              </button>
            ) : (cart[product.id] ?? 0) > 0 && addingProduct?.id !== product.id ? (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); addFromCard(product.id) }}
                aria-label="Producto agregado al carrito. Clic para agregar otra unidad"
                title="Clic para agregar otra unidad"
                style={{
                  width: '100%',
                  height: 36,
                  background: '#EAF6E3',
                  color: '#205134',
                  border: '1px solid #B8E2AE',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  transition: 'all 0.2s ease',
                }}
                className="hover:bg-[#DCF0D4]"
              >
                <span>✓ Agregado</span>
                {cart[product.id] > 1 && (
                  <span
                    style={{
                      background: '#205134',
                      color: '#fff',
                      fontSize: 10,
                      borderRadius: 999,
                      padding: '1px 6px',
                      fontWeight: 800,
                    }}
                  >
                    {cart[product.id]}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); addFromCard(product.id) }}
                aria-label={addingProduct?.id === product.id ? 'Producto agregado' : 'Agregar al carrito'}
                style={{
                  width: '100%',
                  height: 36,
                  background: addingProduct?.id === product.id ? '#205134' : '#F5EEE6',
                  color: addingProduct?.id === product.id ? '#fff' : '#205134',
                  border: '1px solid #E8DED0',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  transition: 'all 0.2s ease',
                }}
                className="hover:bg-[#205134] hover:text-white"
              >
                {addingProduct?.id === product.id
                  ? addingProduct.phase === 'plusOne' ? '+1' : '✓ Agregado'
                  : '+ Agregar al carrito'}
              </button>
            )
          )}
        </div>
      </div>
    )
  }

  const outstandingProducts = products.filter((p) => {
    const ad = allAds.find((a) => a.product_id === p.id)
    return ad ? isAdvertisementActive(ad) : false
  })

  return (
    <ScreenShell
      activeNav={activeNav ?? 'market'}
      onNavigate={onNavigate}
      onProfileClick={onProfileClick}
      userRole={userRole}
      contentStyle={{ paddingBottom: 20 }}
      cartCount={cartCount}
      onCartClick={handleCheckoutCart}
      store={store}
    >
      {selectedProduct && products.find((product) => product.id === selectedProduct) ? (() => {
        const product = products.find((item) => item.id === selectedProduct) as Product
        const sameCategory = products.filter((p) => p.id !== product.id && p.category === product.category)
        const otherProducts = products.filter((p) => p.id !== product.id && p.category !== product.category)
        const allRelated = [...sameCategory, ...otherProducts].slice(0, 10)
        return (
          <ProductDetail
            product={product}
            cart={cart}
            formatPrice={formatPrice}
            onBack={handleBackFromProduct}
            onAddToCart={addToCart}
            onRemoveFromCart={removeFromCart}
            onCheckout={handleCheckoutCart}
            related={allRelated}
            onSelectRelated={handleSelectProduct}
            addFromCard={addFromCard}
            addingProduct={addingProduct}
            onReloadProducts={loadProducts}
            isProducer={isProducer}
            store={store}
          />
        )
      })() : (
        <>
          {/* ══ VENTANA FLOTANTE CENTRADA: CARRUSEL DE PRODUCTOS DESTACADOS ══ */}
          {categoryFeatured && (
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
                categoryFeaturedList.forEach((f) => markPromoAsSeenInSession(f.adId))
                setDismissedCategories((prev) => ({ ...prev, [activeFilter]: true }))
              }}
            >
              {/* ── Flecha Izquierda ── */}
              {categoryFeaturedList.length > 1 && (
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
                  aria-label="Producto anterior"
                >
                  ‹
                </button>
              )}

              {/* ── Tarjeta del producto ── */}
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
                  markPromoAsSeenInSession(categoryFeatured.adId)
                  handleSelectProduct(categoryFeatured.product.id)
                }}
              >
                {/* Imagen de fondo con transición de deslizamiento */}
                <img
                  key={categoryFeatured.adId}
                  src={categoryFeatured.img}
                  alt={categoryFeatured.title}
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
                    background: 'linear-gradient(135deg, #E5AE30 0%, #BA5A30 100%)',
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
                  <span>Patrocinado</span>
                </div>

                {/* Contador de anuncios (ej: 2 / 3) — solo si hay más de uno */}
                {categoryFeaturedList.length > 1 && (
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
                    {Math.min(featuredIndex, categoryFeaturedList.length - 1) + 1} / {categoryFeaturedList.length}
                  </div>
                )}

                {/* Botón cerrar */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    categoryFeaturedList.forEach((f) => markPromoAsSeenInSession(f.adId))
                    setDismissedCategories((prev) => ({ ...prev, [activeFilter]: true }))
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
                  aria-label="Cerrar producto destacado"
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
                      {categoryFeatured.product.category}
                    </span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, fontWeight: 600 }}>
                      {categoryFeatured.product.producer}
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
                    {categoryFeatured.title}
                  </h2>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: '#E5AE30', fontSize: 20, fontWeight: 800, fontFamily: "'Poppins', sans-serif" }}>
                      {hasVariants(categoryFeatured.product) ? (
                        <>
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginRight: 4 }}>Desde</span>
                          {formatPrice(priceRange(categoryFeatured.product.price, categoryFeatured.product.variants ?? []).min)}
                        </>
                      ) : (
                        <>
                          {formatPrice(categoryFeatured.product.price)}
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginLeft: 4 }}>
                            / {categoryFeatured.product.unit || 'ud'}
                          </span>
                        </>
                      )}
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
                      Ver producto →
                    </span>
                  </div>

                  {/* Puntos indicadores */}
                  {categoryFeaturedList.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                      {categoryFeaturedList.map((_, i) => (
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
              {categoryFeaturedList.length > 1 && (
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
                  aria-label="Producto siguiente"
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
                  <span style={{ opacity: 0.85, fontSize: 12, marginLeft: 8, display: 'inline-block' }}>Vista previa de la tienda</span>
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

          {/* ══ BANNER TIENDA ══ */}
          <div
            style={{
              // Tiendas aliadas: verde; El Campo Nos Une: naranja
              background: isAllied
                ? 'linear-gradient(135deg, #173E26 0%, #205134 55%, #3D7A28 100%)'
                : 'linear-gradient(135deg, #A86B05 0%, #D4870A 60%, #E5AE30 100%)',
              borderRadius: '0 0 28px 28px',
              padding: '22px 20px 28px',
              margin: '0 -18px 20px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -20, left: 20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />
            <p style={{ margin: 0, color: '#FFF8EE', fontSize: 11, fontFamily: "'Nunito Sans', sans-serif", fontWeight: 800, letterSpacing: 0.5 }}>{isAllied ? storeConfig.name.toUpperCase() : '🌽 MERCADOS CAMPESINOS'}</p>
            <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, color: '#FFFFFF', margin: '4px 0 4px', fontWeight: 700, lineHeight: 1.2 }}>{isAllied ? storeConfig.tagline || `Productos de ${storeConfig.name}` : 'Productos del campo'}</h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: "'Nunito Sans', sans-serif" }}>{isAllied ? storeConfig.description || (payFirst ? 'Tu pedido se envía cuando se confirma el pago' : 'Directo de quienes los producen') : 'Frescos y directos de productores colombianos'}</p>
          </div>

          {/* ══ ANUNCIOS DESTACADOS ACTIVOS (Valida fechas de activación y tipo producto) ══ */}
          {activeAds.filter(isAdvertisementActive).filter((a) => a.type === 'product' && a.product_id && products.some((p) => p.id === a.product_id)).length > 0 && (
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeAds.filter(isAdvertisementActive).filter((a) => a.type === 'product' && a.product_id && products.some((p) => p.id === a.product_id)).map((ad) => (
                <div
                  key={ad.id}
                  onClick={() => {
                    if (ad.product_id) {
                      handleSelectProduct(ad.product_id)
                    }
                  }}
                  style={{
                    cursor: ad.product_id ? 'pointer' : 'default',
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
                      <span style={{ fontSize: 11, color: '#8C827A', fontWeight: 600 }}>{storeConfig.name}</span>
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
                    {ad.product_id && (
                      <p style={{ margin: 0, fontSize: 12, color: '#BA5A30', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>Ver producto en catálogo</span>
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
              placeholder="Buscar productos y productores..."
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
                boxShadow: '0 2px 10px rgba(32,81,52,0.03)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '22px 0 14px' }}>
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  flexShrink: 0,
                  padding: '7px 16px',
                  borderRadius: 18,
                  border: activeFilter === f ? 'none' : '1.5px solid #E8DED0',
                  background: activeFilter === f ? '#205134' : '#F5EEE6',
                  color: activeFilter === f ? '#F5EEE6' : '#205134',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  cursor: 'pointer',
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ borderBottom: '1px solid #E8DED0', marginBottom: 14 }} />

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!loading && outstandingProducts.length > 0 && activeFilter === 'Todos' && searchVal === '' && (
              <div style={{ marginBottom: 32 }}>
                <p style={{ margin: 0, color: '#C8860A', fontSize: 11, fontFamily: "'Poppins', sans-serif", fontWeight: 800, letterSpacing: 0.2 }}>
                  PRODUCTOS GENUINOS.
                </p>

              </div>
            )}

            <p style={{ fontSize: 13, color: '#666666', fontFamily: "'Nunito Sans', sans-serif", margin: '0 0 14px 0' }}>
              {filtered.length} productos disponibles
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

            {!loading && filtered.length === 0 && (
              <p style={{ textAlign: 'center', color: '#666666', fontFamily: "'Nunito Sans', sans-serif", margin: '0 0 14px 5px' }}>
                Aún no hay productos publicados.
              </p>
            )}

            {showForm && (
              <ProductModal
                isOpen={showForm}
                onClose={() => setShowForm(false)}
                onSave={handleCreateProduct}
                categories={categories}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
              {filtered.map(renderProductCard)}
            </div>
          </div>

          {canCreateProduct && (
            <div style={{ padding: '24px 20px', background: 'linear-gradient(180deg, #F5EEE6 0%, #E8DED0 100%)', borderTop: '1px solid #E8DED0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#205134', fontFamily: "'Nunito Sans', sans-serif", fontWeight: 700, textAlign: 'center' }}>{isAllied ? '¿Tienes un nuevo producto?' : '¿Tienes un nuevo producto del campo?'}</p>
              <button
                onClick={togglePublishForm}
                className="hover:scale-105 transition-transform"
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: 16,
                  border: 'none',
                  background: 'linear-gradient(135deg, #205134 0%, #2A6542 100%)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: "'Nunito Sans', sans-serif",
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  boxShadow: '0 8px 24px rgba(32,81,52,0.25)',
                }}
              >
                <div style={{ background: 'rgba(255,255,255,0.2)', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 16 }}>＋</span>
                </div>
                Publicar mi producto
              </button>
            </div>
          )}
        </>
      )}
    </ScreenShell>
  )
}


