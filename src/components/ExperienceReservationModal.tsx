import React, { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { LIMITS, cleanShipping, personNameError, phoneError, textError } from '../lib/validation'

export interface ExperienceReservationModalProps {
  open: boolean
  experience: {
    id: string
    title: string
    host: string
    price: number
    duration?: string
    capacity?: string | number
    img?: string
    host_id?: string
  } | null
  initialGuests?: number
  initialDate?: string
  onClose: () => void
  onRequireAuth: (mode: 'login' | 'auth') => void
  onSuccess?: () => void
}

export default function ExperienceReservationModal({
  open,
  experience,
  initialGuests = 1,
  initialDate,
  onClose,
  onRequireAuth,
  onSuccess,
}: ExperienceReservationModalProps) {
  const [step, setStep] = useState<'details' | 'payment' | 'success'>('details')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // Formulario de reserva
  // Fecha local (en-CA = AAAA-MM-DD): con toISOString, después de las 7 p. m. en Colombia ya sería mañana
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [reservationDate, setReservationDate] = useState(initialDate || todayStr)
  const [guests, setGuests] = useState(initialGuests)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')

  // Métodos de pago
  const [paymentMethod, setPaymentMethod] = useState<'wompi' | 'transferencia'>('transferencia')
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Datos de respuesta de confirmación
  const [confirmationData, setConfirmationData] = useState<{
    reference: string
    grandTotal: number
    paymentMethod: 'wompi' | 'transferencia'
  } | null>(null)

  // Parsear capacidad máxima
  const maxCapacity = (() => {
    if (!experience?.capacity) return 20
    if (typeof experience.capacity === 'number') return experience.capacity
    const parsed = parseInt(String(experience.capacity).replace(/\D/g, ''), 10)
    return isNaN(parsed) || parsed <= 0 ? 20 : parsed
  })()

  // Cargar usuario autenticado y su perfil
  useEffect(() => {
    if (!open) {
      setStep('details')
      setErrorMessage('')
      setConfirmationData(null)
      return
    }

    setGuests(initialGuests)
    if (initialDate) setReservationDate(initialDate)

    const checkUser = async () => {
      setLoadingUser(true)
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user ?? null)

      if (user) {
        setEmail(user.email || '')
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, phone')
          .eq('id', user.id)
          .single()

        if (profile) {
          const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
          if (name) setFullName(name)
          if (profile.phone) setPhone(profile.phone)
        }
      }
      setLoadingUser(false)
    }

    checkUser()
  }, [open, experience, initialGuests, initialDate])

  if (!open || !experience) return null

  // Cálculos de costos
  const unitPrice = Number(experience.price) || 0
  const subtotal = unitPrice * guests
  const wompiFee = paymentMethod === 'wompi' ? Math.round(subtotal * 0.029) : 0
  const grandTotal = subtotal + wompiFee

  const formatPrice = (val: number) => `$${val.toLocaleString('es-CO')} COP`

  // Validación de paso 1
  const handleProceedToPayment = () => {
    setErrorMessage('')
    if (!fullName.trim()) {
      setErrorMessage('Por favor ingresa el nombre del titular de la reserva.')
      return
    }
    if (!phone.trim()) {
      setErrorMessage('Por favor ingresa un número de teléfono o WhatsApp para coordinar la visita.')
      return
    }
    if (!reservationDate) {
      setErrorMessage('Por favor selecciona la fecha prevista para la experiencia.')
      return
    }
    // El campo de fecha tiene min, pero se puede escribir a mano: la fecha debe ser de hoy en adelante y de este año o el próximo
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate) || reservationDate < todayStr || Number(reservationDate.slice(0, 4)) > new Date().getFullYear() + 1) {
      setErrorMessage('Selecciona una fecha válida, de hoy en adelante.')
      return
    }
    if (!Number.isInteger(guests) || guests < 1 || guests > maxCapacity) {
      setErrorMessage(`El número de personas debe estar entre 1 y ${maxCapacity}.`)
      return
    }
    const contact = cleanShipping({ fullName, phone, department: 'Presencial', municipality: experience.host, address: 'Reserva', deliveryNotes: notes })
    const invalid = personNameError('Nombre del titular', contact.fullName) ?? phoneError(contact.phone, true, 'Teléfono') ?? textError('Notas', contact.deliveryNotes, { max: LIMITS.deliveryNotes })
    if (invalid) {
      setErrorMessage(invalid)
      return
    }
    setFullName(contact.fullName)
    setPhone(contact.phone)
    setNotes(contact.deliveryNotes)
    setStep('payment')
  }

  // Registro de la reserva: create_store_order (Supabase) toma el precio y descuenta los
  // cupos en la base. Queda pendiente de pago hasta que el anfitrión/admin confirme la transferencia.
  const handleFinalizeReservation = async () => {
    if (!currentUser) {
      setErrorMessage('Debes iniciar sesión para finalizar la reserva.')
      return
    }
    if (paymentMethod === 'wompi') {
      setErrorMessage('El pago con Wompi estará disponible próximamente. Elige transferencia.')
      return
    }

    setLoadingPayment(true)
    setErrorMessage('')

    const { data: order, error } = await supabase.rpc('create_store_order', {
      p_store: 'campo',
      p_payment_method: 'BankTransfer',
      p_items: [{ id: experience.id, type: 'experiencia', quantity: guests }],
      p_shipping: {
        fullName,
        phone,
        department: 'Presencial',
        municipality: experience.host,
        address: `Reserva para el ${reservationDate}. Cupos: ${guests}.`,
        deliveryNotes: notes || 'Sin notas adicionales',
      },
      p_shipping_fee: 0,
    })
    setLoadingPayment(false)

    if (error) {
      console.error('Error al registrar la reserva:', error)
      setErrorMessage(`❌ No fue posible registrar la reserva: ${error.message}`)
      return
    }

    const result = order as { order_id?: string; total?: number } | null
    setConfirmationData({
      reference: String(result?.order_id ?? '').slice(0, 8).toUpperCase(),
      grandTotal: Number(result?.total ?? grandTotal),
      paymentMethod,
    })
    setStep('success')
    onSuccess?.()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(28, 39, 20, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 24,
          width: '100%',
          maxWidth: 580,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(32, 81, 52, 0.25)',
          border: '1px solid #EDE4D8',
        }}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            padding: '18px 24px',
            background: '#FAF7F0',
            borderBottom: '1px solid #EDE4D8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🌿</span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "'Poppins', sans-serif",
                  fontSize: 17,
                  color: '#205134',
                  fontWeight: 700,
                }}
              >
                {step === 'success'
                  ? '¡Reserva Registrada!'
                  : step === 'payment'
                    ? 'Confirmación y Pago'
                    : 'Reserva tu Experiencia'}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif" }}>
                {experience.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: 'none',
              background: '#EAE2D5',
              color: '#205134',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Contenido desplazable */}
        <div style={{ padding: '22px 24px', overflowY: 'auto', flex: 1 }}>
          {loadingUser ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#205134', fontFamily: "'Nunito Sans', sans-serif" }}>
              <p>Verificando cuenta...</p>
            </div>
          ) : !currentUser ? (
            /* USUARIO NO AUTENTICADO */
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: '#EAF3EC',
                  color: '#205134',
                  fontSize: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                🔒
              </div>
              <h4
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontSize: 19,
                  color: '#205134',
                  margin: '0 0 8px',
                  fontWeight: 700,
                }}
              >
                Inicia sesión para reservar tu cupo
              </h4>
              <p
                style={{
                  fontSize: 14,
                  color: '#666',
                  fontFamily: "'Nunito Sans', sans-serif",
                  lineHeight: 1.5,
                  maxWidth: 420,
                  margin: '0 auto 24px',
                }}
              >
                Para garantizar la seguridad de tu reserva y facilitar la comunicación directa con la comunidad de{' '}
                <strong>{experience.host}</strong>, inicia sesión con tu cuenta.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onRequireAuth('login')
                  }}
                  style={{
                    padding: '13px',
                    borderRadius: 14,
                    border: 'none',
                    background: '#205134',
                    color: '#fff',
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onRequireAuth('auth')
                  }}
                  style={{
                    padding: '13px',
                    borderRadius: 14,
                    border: '1.5px solid #205134',
                    background: 'transparent',
                    color: '#205134',
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Crear cuenta nueva
                </button>
              </div>
            </div>
          ) : step === 'details' ? (
            /* PASO 1: DETALLES DE LA RESERVA */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Tarjeta resumen rápida */}
              <div
                style={{
                  background: '#F9F6F0',
                  border: '1px solid #EDE4D8',
                  borderRadius: 16,
                  padding: 14,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                {experience.img && (
                  <img
                    src={experience.img}
                    alt=""
                    style={{ width: 68, height: 68, borderRadius: 12, objectFit: 'cover' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6BAA3D', textTransform: 'uppercase' }}>
                    📍 {experience.host}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Poppins', sans-serif",
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#205134',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {experience.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                    Precio por persona: <strong style={{ color: '#205134' }}>{formatPrice(unitPrice)}</strong>
                  </div>
                </div>
              </div>

              {/* Selector de personas y fecha */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Personas */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#205134',
                      marginBottom: 6,
                      fontFamily: "'Nunito Sans', sans-serif",
                    }}
                  >
                    👥 Cantidad de personas
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      border: '1.5px solid #EDE4D8',
                      borderRadius: 12,
                      background: '#fff',
                      height: 44,
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setGuests(Math.max(1, guests - 1))}
                      disabled={guests <= 1}
                      style={{
                        width: 44,
                        height: '100%',
                        border: 'none',
                        background: '#FAF7F0',
                        fontSize: 18,
                        fontWeight: 800,
                        color: guests <= 1 ? '#CCC' : '#205134',
                        cursor: guests <= 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#205134',
                        fontFamily: "'Poppins', sans-serif",
                      }}
                    >
                      {guests} {guests === 1 ? 'persona' : 'personas'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setGuests(Math.min(maxCapacity, guests + 1))}
                      disabled={guests >= maxCapacity}
                      style={{
                        width: 44,
                        height: '100%',
                        border: 'none',
                        background: '#FAF7F0',
                        fontSize: 18,
                        fontWeight: 800,
                        color: guests >= maxCapacity ? '#CCC' : '#205134',
                        cursor: guests >= maxCapacity ? 'not-allowed' : 'pointer',
                      }}
                    >
                      +
                    </button>
                  </div>
                  <span style={{ fontSize: 11, color: '#8A8070', marginTop: 4, display: 'block' }}>
                    Máximo disponible: {maxCapacity} cupos
                  </span>
                </div>

                {/* Fecha */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#205134',
                      marginBottom: 6,
                      fontFamily: "'Nunito Sans', sans-serif",
                    }}
                  >
                    📅 Fecha prevista
                  </label>
                  <input
                    type="date"
                    min={todayStr}
                    value={reservationDate}
                    onChange={(e) => setReservationDate(e.target.value)}
                    style={{
                      width: '100%',
                      height: 44,
                      borderRadius: 12,
                      border: '1.5px solid #EDE4D8',
                      padding: '0 12px',
                      fontSize: 13,
                      fontFamily: "'Nunito Sans', sans-serif",
                      color: '#1C3A14',
                      background: '#fff',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#8A8070', marginTop: 4, display: 'block' }}>
                    Coordinable con el anfitrión
                  </span>
                </div>
              </div>

              {/* Datos del titular */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#205134',
                      marginBottom: 4,
                      fontFamily: "'Nunito Sans', sans-serif",
                    }}
                  >
                    👤 Nombre completo del titular
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Laura Gómez"
                    value={fullName}
                    maxLength={LIMITS.personName * 2}
                    onChange={(e) => setFullName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: '1.5px solid #EDE4D8',
                      fontSize: 13,
                      fontFamily: "'Nunito Sans', sans-serif",
                      color: '#1C3A14',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#205134',
                        marginBottom: 4,
                        fontFamily: "'Nunito Sans', sans-serif",
                      }}
                    >
                      📱 Teléfono / WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="Ej: 310 123 4567"
                      value={phone}
                    maxLength={10}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: '1.5px solid #EDE4D8',
                        fontSize: 13,
                        fontFamily: "'Nunito Sans', sans-serif",
                        color: '#1C3A14',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#205134',
                        marginBottom: 4,
                        fontFamily: "'Nunito Sans', sans-serif",
                      }}
                    >
                      ✉️ Correo electrónico
                    </label>
                    <input
                      type="email"
                      placeholder="correo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: '1.5px solid #EDE4D8',
                        fontSize: 13,
                        fontFamily: "'Nunito Sans', sans-serif",
                        color: '#1C3A14',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#205134',
                      marginBottom: 4,
                      fontFamily: "'Nunito Sans', sans-serif",
                    }}
                  >
                    📝 Requerimientos o notas para el anfitrión (opcional)
                  </label>
                  <textarea
                    placeholder="Alergias alimentarias, niños, adultos mayores, requerimientos de transporte..."
                    value={notes}
                    maxLength={LIMITS.deliveryNotes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: '1.5px solid #EDE4D8',
                      fontSize: 13,
                      fontFamily: "'Nunito Sans', sans-serif",
                      color: '#1C3A14',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              {/* Resumen subtotal */}
              <div
                style={{
                  background: '#FAF7F0',
                  borderRadius: 16,
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontSize: 12, color: '#8A8070', fontFamily: "'Nunito Sans', sans-serif" }}>
                    Total estimado ({guests} {guests === 1 ? 'persona' : 'personas'}):
                  </span>
                  <div
                    style={{
                      fontFamily: "'Poppins', sans-serif",
                      fontSize: 20,
                      fontWeight: 800,
                      color: '#205134',
                    }}
                  >
                    {formatPrice(subtotal)}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#6BAA3D', fontWeight: 700 }}>
                  ✓ Sin costo de envío
                </span>
              </div>

              {errorMessage && (
                <div
                  style={{
                    background: '#FEE9E1',
                    color: '#9B4728',
                    padding: '10px 14px',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "'Nunito Sans', sans-serif",
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="button"
                onClick={handleProceedToPayment}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 14,
                  border: 'none',
                  background: 'linear-gradient(135deg, #205134 0%, #2E6B42 100%)',
                  color: '#fff',
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(32,81,52,0.25)',
                }}
              >
                Continuar al pago ({formatPrice(subtotal)}) →
              </button>
            </div>
          ) : step === 'payment' ? (
            /* PASO 2: SELECCIÓN DE MÉTODO DE PAGO Y FINALIZAR */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Resumen de visita */}
              <div
                style={{
                  background: '#FAF7F0',
                  borderRadius: 16,
                  border: '1px solid #EDE4D8',
                  padding: 14,
                  fontSize: 13,
                  fontFamily: "'Nunito Sans', sans-serif",
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#8A8070' }}>Experiencia:</span>
                  <span style={{ fontWeight: 700, color: '#205134' }}>{experience.title}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#8A8070' }}>Fecha de visita:</span>
                  <span style={{ fontWeight: 700, color: '#205134' }}>{reservationDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#8A8070' }}>Personas:</span>
                  <span style={{ fontWeight: 700, color: '#205134' }}>{guests} cupos</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8A8070' }}>Titular:</span>
                  <span style={{ fontWeight: 700, color: '#205134' }}>{fullName} ({phone})</span>
                </div>
              </div>

              {/* Selector de métodos de pago */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#205134',
                    marginBottom: 10,
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  Elige tu método de pago
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Wompi */}
                  <div
                    aria-disabled="true"
                    style={{
                      border: '1.5px solid #EDE4D8',
                      background: '#fff',
                      borderRadius: 16,
                      padding: 14,
                      cursor: 'not-allowed',
                      opacity: 0.6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="radio"
                          name="experiencePayment"
                          checked={false}
                          disabled
                          style={{ accentColor: '#205134', width: 16, height: 16, cursor: 'not-allowed' }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#1C3A14' }}>
                          💳 Wompi (Bancolombia, PSE, Tarjeta, Nequi)
                        </span>
                      </div>
                      <span
                        style={{
                          background: '#205134',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 6,
                        }}
                      >
                        PRÓXIMAMENTE
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0 24px', fontSize: 12, color: '#666', lineHeight: 1.4 }}>
                      Pago en línea seguro. Confirmación inmediata y protección al viajero. Tarifa pasarela (+2.9%).
                    </p>
                  </div>

                  {/* Transferencia */}
                  <div
                    onClick={() => setPaymentMethod('transferencia')}
                    style={{
                      border: paymentMethod === 'transferencia' ? '2px solid #205134' : '1.5px solid #EDE4D8',
                      background: paymentMethod === 'transferencia' ? '#F2F7F4' : '#fff',
                      borderRadius: 16,
                      padding: 14,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="radio"
                          name="experiencePayment"
                          checked={paymentMethod === 'transferencia'}
                          onChange={() => setPaymentMethod('transferencia')}
                          style={{ accentColor: '#205134', width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#1C3A14' }}>
                          🏦 Transferencia Bancaria Directa / Nequi
                        </span>
                      </div>
                      <span
                        style={{
                          background: '#6BAA3D',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 6,
                        }}
                      >
                        0% RECARGO
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0 24px', fontSize: 12, color: '#666', lineHeight: 1.4 }}>
                      Transfiere directamente a la cuenta comunitaria por Bancolombia, Nequi o Daviplata sin costo extra.
                    </p>
                  </div>
                </div>
              </div>

              {/* Desglose de costos */}
              <div
                style={{
                  borderTop: '1px solid #EDE4D8',
                  paddingTop: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 13,
                  fontFamily: "'Nunito Sans', sans-serif",
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                  <span>Subtotal cupos ({guests} pers.)</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                  <span>Transporte / Envío</span>
                  <span style={{ color: '#205134', fontWeight: 700 }}>$0 COP (Presencial)</span>
                </div>
                {paymentMethod === 'wompi' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                    <span>Tarifa procesamiento Wompi (2.9%)</span>
                    <span style={{ color: '#9B4728', fontWeight: 700 }}>+{formatPrice(wompiFee)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: '1px dashed #EDE4D8',
                  }}
                >
                  <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 700, color: '#1C3A14' }}>
                    Total a pagar
                  </span>
                  <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, fontWeight: 800, color: '#205134' }}>
                    {formatPrice(grandTotal)}
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div
                  style={{
                    background: '#FEE9E1',
                    color: '#9B4728',
                    padding: '10px 14px',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "'Nunito Sans', sans-serif",
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  disabled={loadingPayment}
                  style={{
                    padding: '13px 18px',
                    borderRadius: 14,
                    border: '1px solid #EDE4D8',
                    background: '#FAF7F0',
                    color: '#5A5248',
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ← Volver
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeReservation}
                  disabled={loadingPayment}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 14,
                    border: 'none',
                    background: 'linear-gradient(135deg, #205134 0%, #2E6B42 100%)',
                    color: '#fff',
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: loadingPayment ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(32,81,52,0.25)',
                    opacity: loadingPayment ? 0.7 : 1,
                  }}
                >
                  {loadingPayment
                    ? 'Procesando reserva...'
                    : paymentMethod === 'wompi'
                      ? `Pagar con Wompi (${formatPrice(grandTotal)})`
                      : `Confirmar Reserva (${formatPrice(grandTotal)})`}
                </button>
              </div>
            </div>
          ) : (
            /* PASO 3: ÉXITO / VOUCHER DE CONFIRMACIÓN */
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: '#EAF3EC',
                  color: '#205134',
                  fontSize: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                }}
              >
                🎉
              </div>

              <div>
                <h4
                  style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: 20,
                    color: '#205134',
                    margin: '0 0 4px',
                    fontWeight: 700,
                  }}
                >
                  {confirmationData?.paymentMethod === 'wompi'
                    ? '¡Reserva confirmada con éxito!'
                    : '¡Reserva registrada!'}
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: '#666', fontFamily: "'Nunito Sans', sans-serif" }}>
                  Código de referencia:{' '}
                  <strong style={{ color: '#205134', fontFamily: "'Poppins', sans-serif" }}>
                    {confirmationData?.reference}
                  </strong>
                </p>
              </div>

              {/* Voucher de detalles */}
              <div
                style={{
                  background: '#F9F6F0',
                  border: '1.5px solid #EDE4D8',
                  borderRadius: 18,
                  padding: 18,
                  textAlign: 'left',
                  fontSize: 13,
                  fontFamily: "'Nunito Sans', sans-serif",
                }}
              >
                <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #EDE4D8' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6BAA3D' }}>EXPERIENCIA SELECCIONADA</div>
                  <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 15, fontWeight: 700, color: '#1C3A14' }}>
                    {experience.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>Anfitrión: {experience.host}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#8A8070' }}>Fecha de visita:</span>
                    <div style={{ fontWeight: 700, color: '#205134' }}>{reservationDate}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#8A8070' }}>Cupos reservados:</span>
                    <div style={{ fontWeight: 700, color: '#205134' }}>{guests} personas</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#8A8070' }}>Titular:</span>
                    <div style={{ fontWeight: 700, color: '#205134' }}>{fullName}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#8A8070' }}>Total:</span>
                    <div style={{ fontWeight: 800, color: '#205134' }}>
                      {formatPrice(confirmationData?.grandTotal || grandTotal)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: '#FFF7E8',
                    border: '1px solid #F0D099',
                    borderRadius: 14,
                    padding: '12px 14px',
                    marginTop: 10,
                    fontSize: 13,
                    color: '#9B4728',
                    fontWeight: 600,
                    lineHeight: 1.5,
                  }}
                >
                  El anfitrión se pondrá en contacto contigo para continuar con el pago y confirmar los detalles de tu visita.
                </div>
              </div>

              {/* Botón de acción final */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 14,
                    border: 'none',
                    background: '#205134',
                    color: '#fff',
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Entendido, volver a experiencias
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
