import { useState, useEffect } from 'react'
import { cartItemKey, cartItemPrice, type CartItem } from '../lib/catalog'
import { availableStock, variantLabel } from '../lib/variants'
import { supabase } from '../lib/supabase'
import AuthRequiredModal from '../components/AuthRequiredModal'
import { MAIN_STORE, isMainStore, type StoreId, type StorePaymentMethod } from '../lib/stores'
import { useStores } from '../lib/storesContext'
import { LIMITS, cleanShipping, shippingError } from '../lib/validation'

interface CheckoutScreenProps {
  items: CartItem[]
  onItemsChange: (items: CartItem[]) => void
  onBack: () => void
  onRequireAuth?: (mode: 'login' | 'auth') => void
  onViewProduct?: (productId: string) => void
  /** Tienda del carrito: sus métodos de pago y su envío salen de store_settings. */
  store?: StoreId
}

export type PaymentMethodType = 'contraentrega' | 'wompi' | 'transferencia' | 'efectivo'

// orders.payment_method que acepta create_store_order. Wompi aún no está habilitado.
const PAYMENT_METHODS: Record<PaymentMethodType, StorePaymentMethod | null> = {
  contraentrega: 'CashOnDelivery',
  efectivo: 'Cash',
  transferencia: 'BankTransfer',
  wompi: null,
}

// Opciones que se muestran según store_settings.payment_methods de la tienda
const PAYMENT_OPTIONS: { value: PaymentMethodType; code: StorePaymentMethod; title: string; text: string }[] = [
  {
    value: 'contraentrega',
    code: 'CashOnDelivery',
    title: '💵 Pago Contraentrega (Efectivo)',
    text: 'Le pagas en efectivo directamente al transportista o productor al momento de recibir tu pedido en la dirección especificada. Sin recargo por procesamiento.',
  },
  {
    value: 'transferencia',
    code: 'BankTransfer',
    title: '🏦 Transferencia bancaria / Nequi',
    text: 'Transfiere el valor del pedido. Cuando se confirme el pago, el productor prepara y envía tu pedido.',
  },
  {
    value: 'efectivo',
    code: 'Cash',
    title: '💵 Efectivo',
    text: 'Coordina el pago en efectivo con el productor. Tu pedido se envía cuando el productor recibe el pago.',
  },
]

// type (no interface) para que sea asignable a Json en p_shipping
export type ShippingAddressForm = {
  fullName: string
  phone: string
  department: string
  municipality: string
  address: string
  deliveryNotes: string
}

export default function CheckoutScreen({ items, onItemsChange, onBack, onRequireAuth, onViewProduct, store = MAIN_STORE }: CheckoutScreenProps) {
  // Métodos de pago, envío y datos bancarios de la tienda (store_settings)
  const storeConfig = useStores().getStore(store)
  const isAllied = !isMainStore(store)
  const paymentOptions = PAYMENT_OPTIONS.filter((o) => storeConfig.payment_methods.includes(o.code))
  const payFirst = !storeConfig.payment_methods.includes('CashOnDelivery')
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [authOpen, setAuthOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [isLogged, setIsLogged] = useState<boolean | null>(null)

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(paymentOptions[0]?.value ?? 'wompi')
  const [addressForm, setAddressForm] = useState<ShippingAddressForm>({
    fullName: '',
    phone: '',
    department: 'Cundinamarca',
    municipality: 'Bogotá',
    address: '',
    deliveryNotes: '',
  })

  // Cargar usuario y perfil de Supabase si existe
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsLogged(true)

        // Cargar perfil para autodiligenciar formulario de envío
        supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()
          .then(({ data: profile }) => {
            if (profile) {
              setAddressForm((prev) => ({
                ...prev,
                fullName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
                phone: profile.phone || prev.phone,
                department: profile.department || prev.department,
                municipality: profile.municipality || prev.municipality,
                address: profile.address || prev.address,
              }))
            }
          })
      } else {
        setIsLogged(false)
      }
    })
  }, [])

  // Cálculos dinámicos
  const isExperienceOnly = items.length > 0 && items.every((item) => item.product.type === 'experiencia')
  const subtotal = items.reduce((sum, item) => sum + cartItemPrice(item) * item.quantity, 0)
  // Envío fijo de la tienda (store_settings.shipping_fee, lo cobra create_store_order).
  // En 0 el envío lo acuerda cada vendedor con el comprador y no se suma al total.
  const shippingFee = items.length > 0 && !isExperienceOnly ? storeConfig.shipping_fee : 0
  const wompiFee = paymentMethod === 'wompi' ? Math.round((subtotal + shippingFee) * 0.029) : 0
  const grandTotal = subtotal + shippingFee + wompiFee
  // Wompi aún no está habilitado: se puede seleccionar pero no pagar
  const wompiUnavailable = currentStep === 3 && paymentMethod === 'wompi' && isLogged !== false

  const formatPrice = (value: number) => `$${value.toLocaleString('es-CO')} COP`

  // key: línea del carrito (producto o producto + combinación). No pasa del stock disponible;
  // create_store_order lo vuelve a validar en la base.
  const updateQuantity = (key: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      onItemsChange(items.filter((item) => cartItemKey(item) !== key))
      return
    }
    onItemsChange(items.map((item) => {
      if (cartItemKey(item) !== key) return item
      const limit = availableStock(item.product.stock, item.variant)
      return { ...item, quantity: limit !== null ? Math.min(newQuantity, Math.max(limit, 1)) : newQuantity }
    }))
  }

  // Avanzar entre pasos o Finalizar
  const handleMainAction = async () => {
    if (isLogged === false) {
      onRequireAuth?.('login')
      return
    }

    setErrorMessage('')

    if (currentStep === 1) {
      // Paso 1 -> Avanzar a datos de entrega
      setCurrentStep(2)
    } else if (currentStep === 2) {
      // Paso 2 -> Validar campos de entrega antes de avanzar a método de pago
      if (!addressForm.fullName.trim() || !addressForm.phone.trim() || !addressForm.address.trim()) {
        setErrorMessage('Por favor completa los campos obligatorios: Nombre, Teléfono y Dirección de entrega.')
        return
      }
      const shipping = cleanShipping(addressForm)
      const invalid = shippingError(shipping)
      if (invalid) {
        setErrorMessage(invalid)
        return
      }
      setAddressForm({ ...addressForm, ...shipping })
      setCurrentStep(3)
    } else if (currentStep === 3) {
      // Paso 3 -> Finalizar pedido / Proceder al pago
      if (paymentMethod === 'wompi') return // Próximamente
      await executePaymentFlow()
    }
  }

  const executePaymentFlow = async () => {
    setLoadingPayment(true)
    setErrorMessage('')
    setMessage('')

    // Sin backend propio: el pedido lo crea create_store_order en Supabase, que toma precios
    // y stock de la base (nunca del navegador). Queda 'Pendiente de pago' hasta que el
    // productor/admin confirme el pago.
    const storeMethod = PAYMENT_METHODS[paymentMethod]
    if (!storeMethod || !storeConfig.payment_methods.includes(storeMethod)) {
      setErrorMessage('Este método de pago no está disponible en esta tienda.')
      setLoadingPayment(false)
      return
    }

    const { data: order, error } = await supabase.rpc('create_store_order', {
      p_store: store,
      p_payment_method: storeMethod,
      p_items: items.map(({ product, quantity, variant }) => ({
        id: product.id,
        type: isAllied ? 'producto' : product.type || 'producto',
        quantity,
        // Productos con variantes: la combinación elegida (su stock lo descuenta la base)
        ...(variant ? { variant_id: variant.id } : {}),
      })),
      // Limpios otra vez: la base también los valida y recorta
      p_shipping: cleanShipping(addressForm),
      p_shipping_fee: shippingFee,
    })

    if (error) {
      console.error('Error creando pedido:', error)
      setErrorMessage(`❌ No se pudo registrar el pedido: ${error.message}`)
      setLoadingPayment(false)
      return
    }

    // create_store_order devuelve jsonb: { order_id, store, status, items, subtotal, shipping_fee, total }
    const reference = String((order as { order_id?: string } | null)?.order_id ?? '').slice(0, 8).toUpperCase()
    // Por ahora no se muestran datos bancarios: el productor contacta al comprador para el pago
    setMessage(`🎉 ¡Pedido registrado! Referencia: ${reference}.\n\nEl productor se pondrá en contacto contigo para continuar con el pago y coordinar la entrega.\n\nPodrás seguir el estado de tu pedido en tu panel de usuario.`)
    onItemsChange([])
    setLoadingPayment(false)
  }


  return (
    <>
      <AuthRequiredModal open={authOpen} onClose={() => setAuthOpen(false)} onRequireAuth={(mode) => onRequireAuth?.(mode)} />


      <div className="h-full overflow-y-auto" style={{ background: '#F9F6F0', fontFamily: "'Nunito Sans', sans-serif", minHeight: 'calc(100vh - 77px)' }}>

        {/* Banner superior si no está logueado */}
        {isLogged === false && items.length > 0 && (
          <div style={{ background: '#D06050', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🛡️</span> Necesitas una cuenta para completar tu compra
            </div>
            <button type="button" onClick={() => onRequireAuth?.('login')} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer' }}>
              Ingresar a tu cuenta
            </button>
          </div>
        )}

        <main className="max-w-[1300px] mx-auto px-6 md:px-12 py-8">
          {items.length === 0 && !message ? (
            <div style={{ background: '#fff', border: '1px solid #E8DED0', borderRadius: 18, padding: '48px 24px', textAlign: 'center', maxWidth: 480, margin: '40px auto', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🛒</div>
              <h2 style={{ color: '#205134', fontFamily: "'Poppins', sans-serif", fontSize: 24, margin: '0 0 10px', fontWeight: 700 }}>Tu carrito está vacío</h2>
              <p style={{ color: '#666', fontSize: 15, margin: '0 0 28px', lineHeight: 1.5 }}>Agrega productos o experiencias desde el marketplace para continuar.</p>
              <button
                type="button"
                onClick={onBack}
                style={{
                  background: '#205134',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 28px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 15,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                ← Volver al marketplace
              </button>
            </div>
          ) : message ? (
            /* Pantalla de Éxito */
            <div style={{ background: '#fff', border: '1px solid #E8DED0', borderRadius: 18, padding: '48px 24px', textAlign: 'center', maxWidth: 540, margin: '40px auto', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: '#205134', fontFamily: "'Poppins', sans-serif", fontSize: 26, margin: '0 0 12px', fontWeight: 700 }}>¡Gracias por tu compra!</h2>
              <p style={{ color: '#444', fontSize: 16, margin: '0 0 20px', lineHeight: 1.6, whiteSpace: 'pre-line', }}>{message}</p>

              {/* Los costos de envío los fija cada vendedor */}
              <div style={{ background: '#FFF7E8', border: '1px solid #F0D099', borderRadius: 14, padding: '12px 16px', margin: '0 0 24px', fontSize: 13, color: '#9B4728', fontWeight: 600, lineHeight: 1.5 }}>
                🚚 Los costos de envío pueden ser distintos para cada vendedor. El productor te confirmará el valor final al contactarte.
              </div>

              <button
                type="button"
                onClick={onBack}
                style={{
                  background: '#205134',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px 32px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 15,
                }}
              >
                Seguir explorando la tienda
              </button>
            </div>
          ) : (
            <>
              {/* Botón superior de volver */}
              <button
                type="button"
                onClick={onBack}
                className="mb-6 flex items-center gap-2 text-[#205134] font-bold text-sm bg-transparent border-none cursor-pointer hover:opacity-80 p-0 transition-opacity"
              >
                {isAllied ? '← Seguir explorando la tienda' : '← Seguir explorando el campo'}
              </button>

              {/* Indicador de Pasos / Stepper */}
              <div className="bg-white rounded-2xl p-4 mb-8 border border-[#E8DED0] flex flex-wrap items-center justify-between gap-4">
                <div
                  onClick={() => setCurrentStep(1)}
                  className={`flex items-center gap-2 text-sm font-bold cursor-pointer ${currentStep === 1 ? 'text-[#205134]' : 'text-[#888]'}`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === 1 ? 'bg-[#205134] text-white' : 'bg-[#E8DED0] text-[#555]'}`}>1</span>
                  <span>1. Carrito de Compras</span>
                </div>

                <span className="text-[#CCC] hidden sm:inline">›</span>

                <div
                  onClick={() => currentStep > 1 && setCurrentStep(2)}
                  className={`flex items-center gap-2 text-sm font-bold ${currentStep >= 2 ? 'text-[#205134] cursor-pointer' : 'text-[#AAA] cursor-not-allowed'}`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === 2 ? 'bg-[#205134] text-white' : currentStep > 2 ? 'bg-[#205134] text-white' : 'bg-[#E8DED0] text-[#555]'}`}>2</span>
                  <span>2. Datos de Entrega</span>
                </div>

                <span className="text-[#CCC] hidden sm:inline">›</span>

                <div
                  onClick={() => currentStep > 2 && setCurrentStep(3)}
                  className={`flex items-center gap-2 text-sm font-bold ${currentStep === 3 ? 'text-[#205134] cursor-pointer' : 'text-[#AAA] cursor-not-allowed'}`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === 3 ? 'bg-[#205134] text-white' : 'bg-[#E8DED0] text-[#555]'}`}>3</span>
                  <span>3. Método de Pago</span>
                </div>
              </div>

              {/* Banner de mensaje de error si aplica */}
              {errorMessage && (
                <div className="bg-[#FDEDED] text-[#D06050] border border-[#F5C2C2] p-4 rounded-xl mb-6 text-sm font-bold flex items-center gap-2">
                  ⚠️ {errorMessage}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12 xl:gap-16">

                {/* Columna Izquierda: Contenido del paso actual */}
                <div>

                  {/* PASO 1: ÚNICAMENTE Carrito de productos */}
                  {currentStep === 1 && (
                    <div className="flex flex-col gap-6">
                      <div className="flex justify-between items-center mb-2">
                        <h2 className="font-['Poppins',sans-serif] text-2xl text-[#205134] m-0 font-bold">
                          1. Productos en tu carrito ({items.reduce((sum, item) => sum + item.quantity, 0)})
                        </h2>
                        <button
                          type="button"
                          onClick={() => onItemsChange([])}
                          className="bg-transparent border-none text-[#D06050] text-xs font-bold underline cursor-pointer"
                        >
                          Limpiar carrito
                        </button>
                      </div>

                      <div className="flex flex-col gap-4">
                        {items.map((item) => {
                          const key = cartItemKey(item)
                          const unitPrice = cartItemPrice(item)
                          const limit = availableStock(item.product.stock, item.variant)
                          const atLimit = limit !== null && item.quantity >= limit
                          return (
                          <article key={key} className="bg-white rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 border border-[#E8DED0]">
                            <img
                              src={item.variant?.image_url || item.product.img}
                              alt={item.product.title}
                              className="w-20 h-20 shrink-0 object-cover rounded-xl bg-[#F5EEE6] cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => onViewProduct?.(item.product.id)}
                            />

                            <div className="flex-1 min-w-0 text-center sm:text-left w-full sm:w-auto">
                              <div className="text-[10px] font-bold text-[#205134] uppercase tracking-wider mb-1">
                                {item.product.producer}
                              </div>
                              <h3
                                className="font-['Poppins'] font-bold text-[#1C3A14] text-base m-0 leading-tight truncate cursor-pointer hover:text-[#9B4728] transition-colors"
                                onClick={() => onViewProduct?.(item.product.id)}
                              >
                                {item.product.title}
                              </h3>
                              {item.variant && (
                                <div className="text-[#205134] text-xs font-bold mt-0.5">
                                  {variantLabel(item.variant.options, item.product.variantAttributes ?? [])}
                                </div>
                              )}
                              <div className="text-[#888] text-xs mt-1">
                                {formatPrice(unitPrice)}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end mt-4 sm:mt-0 shrink-0">
                              <div className="flex items-center bg-[#F5EEE6] rounded-full h-9 px-1 w-[104px] shrink-0 justify-between">
                                <button
                                  onClick={() => updateQuantity(key, item.quantity - 1)}
                                  className="w-7 h-7 flex items-center justify-center rounded-full bg-transparent border-none text-[#205134] font-bold text-base cursor-pointer hover:bg-[#E8DED0]"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center font-bold text-sm text-[#205134]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => updateQuantity(key, item.quantity + 1)}
                                  disabled={atLimit}
                                  title={atLimit ? 'No hay más unidades disponibles' : undefined}
                                  className="w-7 h-7 flex items-center justify-center rounded-full bg-transparent border-none text-[#205134] font-bold text-base cursor-pointer hover:bg-[#E8DED0] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  +
                                </button>
                              </div>

                              <div className="font-['Poppins'] font-bold text-[#C8860A] text-base w-[135px] shrink-0 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatPrice(unitPrice * item.quantity)}
                              </div>

                              <button
                                onClick={() => updateQuantity(key, 0)}
                                className="w-8 h-8 shrink-0 flex items-center justify-center border-none bg-transparent text-[#D06050] cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                                title="Eliminar"
                              >
                                ✕
                              </button>
                            </div>
                          </article>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* PASO 2: ÚNICAMENTE Formulario de Dirección de Entrega */}
                  {currentStep === 2 && (
                    <div className="bg-white rounded-2xl p-6 md:p-8 border border-[#E8DED0]">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="font-['Poppins',sans-serif] text-2xl text-[#205134] m-0 font-bold">
                          2. Datos de entrega y envío
                        </h2>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(1)}
                          className="bg-transparent border-none text-[#205134] text-xs font-bold underline cursor-pointer"
                        >
                          ← Volver al carrito
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-[#444] mb-1">Nombre completo *</label>
                          <input
                            type="text"
                            value={addressForm.fullName}
                            maxLength={LIMITS.orgName}
                            onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                            placeholder="Ej: Juan Pérez"
                            className="w-full bg-[#F9F6F0] border border-[#E8DED0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#205134]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#444] mb-1">Teléfono celular *</label>
                          <input
                            type="tel"
                            value={addressForm.phone}
                            maxLength={10}
                            onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                            placeholder="Ej: 3101234567"
                            className="w-full bg-[#F9F6F0] border border-[#E8DED0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#205134]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#444] mb-1">Departamento *</label>
                          <input
                            type="text"
                            value={addressForm.department}
                            maxLength={LIMITS.place}
                            onChange={(e) => setAddressForm({ ...addressForm, department: e.target.value })}
                            placeholder="Ej: Cundinamarca"
                            className="w-full bg-[#F9F6F0] border border-[#E8DED0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#205134]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#444] mb-1">Municipio / Ciudad *</label>
                          <input
                            type="text"
                            value={addressForm.municipality}
                            maxLength={LIMITS.place}
                            onChange={(e) => setAddressForm({ ...addressForm, municipality: e.target.value })}
                            placeholder="Ej: Fusagasugá"
                            className="w-full bg-[#F9F6F0] border border-[#E8DED0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#205134]"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-[#444] mb-1">Dirección de entrega *</label>
                          <input
                            type="text"
                            value={addressForm.address}
                            maxLength={LIMITS.address}
                            onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
                            placeholder="Ej: Calle 10 # 4-15 Finca La Esperanza"
                            className="w-full bg-[#F9F6F0] border border-[#E8DED0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#205134]"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-[#444] mb-1">Notas o instrucciones para el repartidor (Opcional)</label>
                          <textarea
                            rows={3}
                            value={addressForm.deliveryNotes}
                            maxLength={LIMITS.deliveryNotes}
                            onChange={(e) => setAddressForm({ ...addressForm, deliveryNotes: e.target.value })}
                            placeholder="Ej: Dejar en la portería o llamar al llegar."
                            className="w-full bg-[#F9F6F0] border border-[#E8DED0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#205134]"
                          ></textarea>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PASO 3: Método de Pago y Confirmación */}
                  {currentStep === 3 && (
                    <div className="flex flex-col gap-6">
                      <div className="bg-white rounded-2xl p-6 md:p-8 border border-[#E8DED0]">
                        <div className="flex justify-between items-center mb-6">
                          <h2 className="font-['Poppins',sans-serif] text-2xl text-[#205134] m-0 font-bold">
                            3. Método de pago y confirmación
                          </h2>
                          <button
                            type="button"
                            onClick={() => setCurrentStep(2)}
                            className="bg-transparent border-none text-[#205134] text-xs font-bold underline cursor-pointer"
                          >
                            ← Modificar dirección
                          </button>
                        </div>

                        {/* Opciones de Método de Pago */}
                        <div className="flex flex-col gap-4 mb-8">
                          {payFirst && (
                            <div className="bg-[#FFF7E8] border border-[#F0D099] text-[#9B4728] rounded-xl p-4 text-sm font-semibold">
                              En esta tienda el productor envía tu pedido cuando se confirma el pago.
                            </div>
                          )}
                          {paymentOptions.map((opt) => (
                            <div
                              key={opt.value}
                              onClick={() => setPaymentMethod(opt.value)}
                              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === opt.value ? 'border-[#205134] bg-[#F2F7F4]' : 'border-[#E8DED0] hover:border-[#CCC] bg-white'}`}
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <input
                                  type="radio"
                                  name="paymentMethod"
                                  checked={paymentMethod === opt.value}
                                  onChange={() => setPaymentMethod(opt.value)}
                                  className="accent-[#205134] w-5 h-5 cursor-pointer"
                                />
                                <div className="font-bold text-[#1C3A14] text-lg">{opt.title}</div>
                              </div>
                              <p className="text-sm text-[#555] ml-8 m-0 leading-relaxed">{opt.text}</p>
                            </div>
                          ))}

                          {/* Opción 2: Wompi */}
                          <div
                            onClick={() => setPaymentMethod('wompi')}
                            className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'wompi'
                              ? 'border-[#205134] bg-[#F2F7F4]'
                              : 'border-[#E8DED0] hover:border-[#CCC] bg-white'
                              }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name="paymentMethod"
                                  checked={paymentMethod === 'wompi'}
                                  onChange={() => setPaymentMethod('wompi')}
                                  className="accent-[#205134] w-5 h-5 cursor-pointer"
                                />
                                <div className="font-bold text-[#1C3A14] text-lg">💳 Tarjeta de Crédito / Débito / PSE / Nequi (Wompi)</div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="bg-[#205134] text-white text-[10px] uppercase tracking-wider px-2 py-1 rounded font-bold">Wompi</span>
                                <span className="bg-[#FFF1E0] text-[#C4622D] border border-[#F3C38B] text-[10px] uppercase tracking-wider px-2 py-1 rounded font-bold">Próximamente</span>
                              </div>
                            </div>
                            <p className="text-sm text-[#555] ml-8 m-0 leading-relaxed">
                              Pago en línea 100% seguro procesado por la pasarela oficial Wompi (Bancolombia). Incluye tarifa de procesamiento digital (+2.9%).
                            </p>
                          </div>

                        </div>

                        {/* Tarjeta Resumen de Entrega */}
                        <div className="bg-[#F9F6F0] p-4 rounded-xl border border-[#E8DED0]">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-xs uppercase text-[#205134] tracking-wider">Dirección de Entrega Confirmada</span>
                            <button onClick={() => setCurrentStep(2)} className="text-xs text-[#D06050] font-bold border-none bg-transparent cursor-pointer underline">Editar</button>
                          </div>
                          <div className="font-bold text-[#1C3A14]">{addressForm.fullName} ({addressForm.phone})</div>
                          <div className="text-sm text-[#555]">{addressForm.address}, {addressForm.municipality}, {addressForm.department}</div>
                          {addressForm.deliveryNotes && <div className="text-xs text-[#777] mt-1">Notas: {addressForm.deliveryNotes}</div>}
                        </div>

                      </div>
                    </div>
                  )}

                </div>

                {/* Columna Derecha: Resumen de Pedido y Botón Dinámico */}
                <div>
                  <div className="bg-white rounded-2xl p-6 md:p-8 border border-[#E8DED0] shadow-sm sticky top-[100px]">
                    <h2 className="font-['Poppins',sans-serif] text-2xl text-[#205134] m-0 mb-6 font-bold">Resumen del pedido</h2>

                    <div className="flex justify-between text-sm text-[#555] mb-4">
                      <span>Subtotal productos</span>
                      <span className="font-bold text-[#1C3A14]">{formatPrice(subtotal)}</span>
                    </div>

                    {!isExperienceOnly && (
                      <div className="flex justify-between gap-4 text-sm text-[#555] mb-4">
                        <span>Envío</span>
                        {shippingFee > 0
                          ? <span className="font-bold text-[#205134]">{formatPrice(shippingFee)}</span>
                          : <span className="font-bold text-[#205134] text-right">A convenir con el productor</span>}
                      </div>
                    )}

                    {paymentMethod === 'wompi' && currentStep === 3 && (
                      <div className="flex justify-between text-sm text-[#555] mb-4">
                        <span>Comisión procesamiento (Wompi)</span>
                        <span className="font-bold text-[#D06050]">{formatPrice(wompiFee)}</span>
                      </div>
                    )}

                    <div className="h-px bg-[#E8DED0] w-full mb-6"></div>

                    <div className="flex justify-between items-center mb-8">
                      <span className="font-['Poppins'] text-lg font-bold text-[#1C3A14]">{!isExperienceOnly && shippingFee === 0 ? 'Total (sin envío)' : 'Total estimado'}</span>
                      <span className="font-['Poppins'] text-2xl font-bold text-[#205134]">{formatPrice(grandTotal)}</span>
                    </div>

                    {/* BOTÓN PRINCIPAL: "Continuar" vs "Confirmar el pedido" (contraentrega) vs "Proceder al pago" */}
                    <button
                      type="button"
                      disabled={loadingPayment || wompiUnavailable}
                      onClick={handleMainAction}
                      className="w-full bg-[#205134] hover:bg-[#1a422a] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#205134] text-white font-bold py-3.5 rounded-xl border-none cursor-pointer transition-colors text-sm mb-4"
                    >
                      {loadingPayment
                        ? 'Procesando...'
                        : isLogged === false
                          ? 'Crear cuenta para comprar'
                          : currentStep === 3
                            ? paymentMethod !== 'wompi'
                              ? 'Confirmar el pedido'
                              : wompiUnavailable ? 'Proceder al pago (Próximamente)' : 'Proceder al pago'
                            : 'Continuar →'}
                    </button>

                    {wompiUnavailable && (
                      <p className="text-center text-xs text-[#C4622D] font-bold -mt-2 mb-4">
                        ¡Pronto estará disponible! Estamos trabajando para ti.
                      </p>
                    )}

                    {isLogged === false && (
                      <div className="text-center text-xs text-[#666] mb-8">
                        ¿Ya tienes cuenta? <button onClick={() => onRequireAuth?.('login')} className="bg-transparent border-none font-bold text-[#1C3A14] cursor-pointer underline">Iniciar sesión</button>
                      </div>
                    )}

                    <div className="h-px bg-[#E8DED0] w-full mb-6 mt-4"></div>

                    <div className="flex gap-3 text-xs text-[#666] leading-relaxed">
                      <span className="text-[#205134] text-lg">🔒</span>
                      <p className="m-0">{isAllied ? 'Compra directa con el productor.' : 'Compra respaldada por nuestra política de comercio justo y directo con el agricultor.'}</p>
                    </div>
                  </div>
                </div>

              </div>
            </>
          )}
        </main>
      </div>
    </>
  )
}
