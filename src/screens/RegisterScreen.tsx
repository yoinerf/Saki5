import { useState } from 'react'
import { supabase } from '../lib/supabase'
import logoSrc from '../assets/logo-nofond.png'
import LocationFields from '../components/LocationFields'
import DocumentFields from '../components/DocumentFields'
import GoogleSignInButton, { AuthDivider } from '../components/GoogleSignInButton'
import LegalNotice from '../components/LegalNotice'
import { LEGAL_PATHS } from '../lib/legal'
import { normalizeDocumentNumber, validateDocument } from '../lib/identity'

// Estilos de los campos del formulario (los selects de ubicación y documento usan los mismos)
const FIELD_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 800,
  fontFamily: "'Nunito Sans', sans-serif",
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#205134',
  marginBottom: 5,
}
const FIELD_INPUT: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 8,
  border: '1.5px solid #D1D5DB',
  background: '#FFFFFF',
  fontSize: 14,
  fontFamily: "'Nunito Sans', sans-serif",
  color: '#1F2937',
  outline: 'none',
  boxSizing: 'border-box',
}

interface Props {
  onComplete: () => void
  onLogin: () => void
  onBackToStore?: () => void
  onBackToHome?: () => void
}

type UserType = 'comprador' | 'asociacion' | 'turismo'

// Registro único en El Campo Nos Une. Los productores de otras tiendas (p. ej. la Tienda
// Amazónica) se registran aquí y el superadmin les asigna la tienda.
export default function RegisterScreen({ onComplete, onLogin, onBackToStore, onBackToHome }: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [location, setLocation] = useState({ department: '', municipality: '' })
  const [doc, setDoc] = useState({ documentType: '', documentNumber: '' })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [userType, setUserType] = useState<UserType>('comprador')
  const [acceptTerms, setAcceptTerms] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleBack = onBackToHome || onBackToStore

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError('')

    // Validaciones
    if (!fullName.trim()) {
      setError('Por favor ingresa tu nombre completo')
      return
    }
    const docError = validateDocument(doc.documentType, doc.documentNumber)
    if (docError) {
      setError(docError)
      return
    }
    if (!location.department || !location.municipality) {
      setError('Por favor selecciona tu departamento y municipio')
      return
    }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Por favor ingresa un correo electrónico válido')
      return
    }
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (!acceptTerms) {
      setError('Debes aceptar los Términos de servicio y la Política de privacidad')
      return
    }

    setLoading(true)

    // Separar nombre y apellido
    const nameParts = fullName.trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // 1. Registro en Supabase Auth
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          user_type: userType,
          department: location.department,
          municipality: location.municipality,
          document_type: doc.documentType,
          document_number: normalizeDocumentNumber(doc.documentNumber),
        },
      },
    })

    if (authError) {
      setError(authError.message || 'Ocurrió un error al registrar tu cuenta.')
      setLoading(false)
      return
    }

    // El perfil lo crea el trigger handle_new_user con los datos de options.data
    // (solo acepta roles públicos), así el navegador no escribe el rol directamente.

    setLoading(false)
    setSuccess(true)
  }

  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100vh',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'row',
        background: '#FAF7F0',
        fontFamily: "'Nunito Sans', sans-serif",
        overflowX: 'hidden',
      }}
    >
      {/* ===================== COLUMNA IZQUIERDA: FORMULARIO WARM CREAM ===================== */}
      <div
        style={{
          flex: '1 1 50%',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '36px 24px',
          boxSizing: 'border-box',
          backgroundColor: '#FAF7F0',
          position: 'relative',
        }}
      >
        {/* Botón Volver visible en móviles */}
        {handleBack && (
          <div className="lg:hidden" style={{ width: '100%', maxWidth: 430, marginBottom: 16 }}>
            <button
              type="button"
              onClick={handleBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#EAE3D6',
                border: 'none',
                borderRadius: 16,
                padding: '6px 14px',
                color: '#205134',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ← Volver al inicio
            </button>
          </div>
        )}

        {/* Tarjeta de Formulario centrada */}
        <div
          style={{
            width: '100%',
            maxWidth: 430,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Logo Central de El Campo Nos Une */}
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <img
              src={logoSrc}
              alt="El Campo Nos Une"
              style={{
                height: 120,
                width: 'auto',
                display: 'block',
                margin: '0 auto',
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.06))',
              }}
            />
          </div>

          {/* Título y Subtítulo idénticos al manual de identidad */}
          <h1
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: 30,
              fontWeight: 700,
              color: '#205134',
              margin: '0 0 6px',
              textAlign: 'center',
              letterSpacing: '-0.03em',
            }}
          >
            Crear cuenta
          </h1>
          <p
            style={{
              fontFamily: "'Nunito Sans', sans-serif",
              fontSize: 14,
              color: '#666666',
              margin: '0 0 24px',
              textAlign: 'center',
              lineHeight: 1.45,
            }}
          >
            Únete a la mayor unión de productores y agrónomos del país
          </p>

          {/* Modal / Alerta de Éxito */}
          {success ? (
            <div
              style={{
                width: '100%',
                background: '#ECFDF5',
                border: '1.5px solid #A7F3D0',
                borderRadius: 12,
                padding: '28px 24px',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 12 }}>🌱</div>
              <h2
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#205134',
                  margin: '0 0 8px',
                }}
              >
                ¡Bienvenido al Campo!
              </h2>
              <p
                style={{
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontSize: 14,
                  color: '#2E6B47',
                  margin: '0 0 20px',
                  lineHeight: 1.5,
                }}
              >
                Tu cuenta ha sido creada exitosamente. Ya puedes iniciar sesión y comenzar a explorar.
              </p>
              <button
                type="button"
                onClick={onLogin}
                style={{
                  background: '#205134',
                  color: '#FFFFFF',
                  padding: '12px 28px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontSize: 14,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(32,81,52,0.22)',
                }}
              >
                Iniciar sesión ahora
              </button>
            </div>
          ) : (
            <>
              {/* Mensaje de Error */}
              {error && (
                <div
                  style={{
                    width: '100%',
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    padding: '11px 14px',
                    color: '#991B1B',
                    fontSize: 13,
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontWeight: 600,
                    marginBottom: 18,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxSizing: 'border-box',
                  }}
                >
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Formulario */}
              <form onSubmit={handleRegister} style={{ width: '100%' }}>
                {/* Campo: Nombre Completo */}
                <div style={{ marginBottom: 15 }}>
                  <label
                    htmlFor="register-fullname"
                    style={{
                      display: 'block',
                      fontSize: 11.5,
                      fontWeight: 800,
                      fontFamily: "'Nunito Sans', sans-serif",
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#205134',
                      marginBottom: 5,
                    }}
                  >
                    NOMBRE COMPLETO
                  </label>
                  <input
                    id="register-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Juan Pérez Gómez"
                    autoComplete="name"
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: 8,
                      border: '1.5px solid #D1D5DB',
                      background: '#FFFFFF',
                      fontSize: 14,
                      fontFamily: "'Nunito Sans', sans-serif",
                      color: '#1F2937',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#205134'
                      e.target.style.boxShadow = '0 0 0 3px rgba(32, 81, 52, 0.12)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#D1D5DB'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>

                {/* Documento de identidad y ubicación (obligatorios) */}
                <DocumentFields
                  {...doc}
                  onChange={setDoc}
                  labelStyle={FIELD_LABEL}
                  inputStyle={FIELD_INPUT}
                  fieldStyle={{ marginBottom: 15 }}
                />
                <LocationFields
                  {...location}
                  onChange={setLocation}
                  labelStyle={FIELD_LABEL}
                  inputStyle={FIELD_INPUT}
                  fieldStyle={{ marginBottom: 15 }}
                />

                {/* Campo: Correo Electrónico */}
                <div style={{ marginBottom: 15 }}>
                  <label
                    htmlFor="register-email"
                    style={{
                      display: 'block',
                      fontSize: 11.5,
                      fontWeight: 800,
                      fontFamily: "'Nunito Sans', sans-serif",
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#205134',
                      marginBottom: 5,
                    }}
                  >
                    CORREO ELECTRÓNICO
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    autoComplete="email"
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: 8,
                      border: '1.5px solid #D1D5DB',
                      background: '#FFFFFF',
                      fontSize: 14,
                      fontFamily: "'Nunito Sans', sans-serif",
                      color: '#1F2937',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#205134'
                      e.target.style.boxShadow = '0 0 0 3px rgba(32, 81, 52, 0.12)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#D1D5DB'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>

                {/* Selector sutil de Tipo de Cuenta */}
                <div style={{ marginBottom: 15 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 11.5,
                      fontWeight: 800,
                      fontFamily: "'Nunito Sans', sans-serif",
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#205134',
                      marginBottom: 6,
                    }}
                  >
                    TIPO DE PERFIL
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 6,
                      background: '#EAE3D6',
                      padding: 4,
                      borderRadius: 10,
                    }}
                  >
                    {[
                      { id: 'comprador' as UserType, label: 'Comprador', icon: '🛒' },
                      { id: 'asociacion' as UserType, label: 'Productor', icon: '🌽' },
                      { id: 'turismo' as UserType, label: 'Turismo', icon: '🏞️' },
                    ].map((item) => {
                      const isSelected = userType === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setUserType(item.id)}
                          style={{
                            padding: '8px 6px',
                            borderRadius: 8,
                            border: 'none',
                            background: isSelected ? '#FFFFFF' : 'transparent',
                            color: isSelected ? '#205134' : '#6B7280',
                            fontWeight: isSelected ? 700 : 600,
                            fontFamily: "'Nunito Sans', sans-serif",
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            boxShadow: isSelected ? '0 2px 5px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.18s ease',
                          }}
                        >
                          <span style={{ fontSize: 13 }}>{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  {userType !== 'comprador' && (
                    <p style={{ margin: '8px 2px 0', fontSize: 12, lineHeight: 1.45, color: '#6B7280', fontFamily: "'Nunito Sans', sans-serif" }}>
                      ¿Vendes en la Tienda Amazónica u otra tienda aliada? Regístrate aquí y pide al administrador que te asigne a tu tienda. Al ingresar verás solo la tienda que te corresponde.
                    </p>
                  )}
                </div>

                {/* Campo: Contraseña */}
                <div style={{ marginBottom: 15 }}>
                  <label
                    htmlFor="register-password"
                    style={{
                      display: 'block',
                      fontSize: 11.5,
                      fontWeight: 800,
                      fontFamily: "'Nunito Sans', sans-serif",
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#205134',
                      marginBottom: 5,
                    }}
                  >
                    CONTRASEÑA
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      style={{
                        width: '100%',
                        padding: '11px 40px 11px 14px',
                        borderRadius: 8,
                        border: '1.5px solid #D1D5DB',
                        background: '#FFFFFF',
                        fontSize: 14,
                        fontFamily: "'Nunito Sans', sans-serif",
                        color: '#1F2937',
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#205134'
                        e.target.style.boxShadow = '0 0 0 3px rgba(32, 81, 52, 0.12)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#D1D5DB'
                        e.target.style.boxShadow = 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9CA3AF',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-label="Ver u ocultar contraseña"
                    >
                      {showPassword ? (
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Campo: Confirmar Contraseña */}
                <div style={{ marginBottom: 18 }}>
                  <label
                    htmlFor="register-confirm-password"
                    style={{
                      display: 'block',
                      fontSize: 11.5,
                      fontWeight: 800,
                      fontFamily: "'Nunito Sans', sans-serif",
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#205134',
                      marginBottom: 5,
                    }}
                  >
                    CONFIRMAR CONTRASEÑA
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="register-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      style={{
                        width: '100%',
                        padding: '11px 40px 11px 14px',
                        borderRadius: 8,
                        border: '1.5px solid #D1D5DB',
                        background: '#FFFFFF',
                        fontSize: 14,
                        fontFamily: "'Nunito Sans', sans-serif",
                        color: '#1F2937',
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#205134'
                        e.target.style.boxShadow = '0 0 0 3px rgba(32, 81, 52, 0.12)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#D1D5DB'
                        e.target.style.boxShadow = 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9CA3AF',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-label="Ver u ocultar confirmación de contraseña"
                    >
                      {showConfirmPassword ? (
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Checkbox: Términos y Condiciones */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
                  <input
                    id="register-terms"
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    style={{
                      marginTop: 3,
                      width: 16,
                      height: 16,
                      accentColor: '#205134',
                      cursor: 'pointer',
                    }}
                  />
                  <label
                    htmlFor="register-terms"
                    style={{
                      fontSize: 12.5,
                      fontFamily: "'Nunito Sans', sans-serif",
                      color: '#4B5563',
                      lineHeight: 1.4,
                      cursor: 'pointer',
                    }}
                  >
                    {/* Enlaces reales (en otra pestaña, para no perder el formulario): se acepta lo que se puede leer */}
                    Acepto los{' '}
                    <a href={LEGAL_PATHS.terms} target="_blank" rel="noopener" style={{ color: '#9B4728', fontWeight: 700, textDecoration: 'underline' }}>términos de servicio</a> y la{' '}
                    <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener" style={{ color: '#9B4728', fontWeight: 700, textDecoration: 'underline' }}>Política de privacidad</a>
                  </label>
                </div>

                {/* Botón Principal: Registrarse (#205134 Verde Profundo) */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: loading ? '#3A6F4E' : '#205134',
                    color: '#FFFFFF',
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: "'Nunito Sans', sans-serif",
                    cursor: loading ? 'wait' : 'pointer',
                    boxShadow: '0 4px 14px rgba(32, 81, 52, 0.22)',
                    transition: 'all 0.18s ease',
                    marginBottom: 20,
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) e.currentTarget.style.background = '#174028'
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) e.currentTarget.style.background = '#205134'
                  }}
                >
                  {loading ? 'Creando cuenta...' : 'Registrarse'}
                </button>

                {/* Con Google los datos obligatorios se piden al volver (CompleteProfileScreen) */}
                <div style={{ height: 16 }} />
                <AuthDivider />
                <GoogleSignInButton mode="signup" onError={setError} />

                <div style={{ height: 20 }} />

                {/* Switcher a Iniciar Sesión */}
                <p
                  style={{
                    textAlign: 'center',
                    fontSize: 13.5,
                    fontFamily: "'Nunito Sans', sans-serif",
                    color: '#666666',
                    margin: 0,
                  }}
                >
                  ¿Ya tienes cuenta?{' '}
                  <button
                    type="button"
                    onClick={onLogin}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#9B4728',
                      fontWeight: 700,
                      fontFamily: "'Nunito Sans', sans-serif",
                      cursor: 'pointer',
                      fontSize: 13.5,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    Inicia sesión
                  </button>
                </p>
                <LegalNotice action="registrarte" />
              </form>
            </>
          )}
        </div>
      </div>

      {/* ===================== COLUMNA DERECHA: HERO FOTOGRÁFICO CON CITA ===================== */}
      <div
        className="hidden lg:flex"
        style={{
          flex: '1 1 50%',
          minHeight: '100vh',
          position: 'relative',
          backgroundImage: 'url("https://images.unsplash.com/photo-1592417817098-8f3d69102a5e?q=80&w=1600&auto=format&fit=crop")',
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          backgroundRepeat: 'no-repeat',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px 64px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Overlay verde oscuro característico del diseño (#1A3B22 a 40% - 60%) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(26, 59, 34, 0.35) 0%, rgba(20, 45, 26, 0.55) 50%, rgba(13, 31, 18, 0.82) 100%)',
            zIndex: 1,
          }}
        />

        {/* Botón Volver al inicio (sobre hero) */}
        {handleBack && (
          <div style={{ position: 'relative', zIndex: 10, alignSelf: 'flex-end' }}>
            <button
              type="button"
              onClick={handleBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: 20,
                padding: '8px 18px',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'Nunito Sans', sans-serif",
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.28)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
              }}
            >
              <span>←</span> Volver al inicio
            </button>
          </div>
        )}

        {/* Sección inferior con línea dorada, cita y subtítulo idénticos al manual */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 540, marginTop: 'auto' }}>
          {/* Línea dorada (#CF9D35 / #E5AE30) de 80px x 3.5px */}
          <div
            style={{
              width: 80,
              height: 3.5,
              backgroundColor: '#CF9D35',
              borderRadius: 2,
              marginBottom: 24,
            }}
          />

          {/* Cita con tipografía del proyecto */}
          <blockquote
            style={{
              margin: 0,
              padding: 0,
              fontFamily: "'Poppins', sans-serif",
              fontStyle: 'italic',
              fontWeight: 600,
              fontSize: 'clamp(26px, 3vw, 36px)',
              lineHeight: 1.3,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              textShadow: '0 2px 14px rgba(0, 0, 0, 0.45)',
              marginBottom: 20,
            }}
          >
            "Sembrando hoy la cooperación del mañana."
          </blockquote>

          {/* Subtítulo institucional según manual */}
          <p
            style={{
              margin: 0,
              fontFamily: "'Poppins', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.88)',
            }}
          >
            CULTIVO INTELIGENTE & INTEGRADO • EL CAMPO NOS UNE
          </p>
        </div>
      </div>
    </div>
  )
}
