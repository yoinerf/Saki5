import { useState } from 'react'
import { supabase, authRedirectInfo, authRedirectUrl } from '../lib/supabase'
import { isValidEmail } from '../lib/validation'
import logoSrc from '../assets/logo-nofond.png'
import GoogleSignInButton, { AuthDivider } from '../components/GoogleSignInButton'
import LegalNotice from '../components/LegalNotice'

interface Props {
  onLogin: () => void
  onRegister: () => void
  onBackToStore?: () => void
  onBackToHome?: () => void
}

// Un solo inicio de sesión (El Campo Nos Une) para todas las tiendas: al entrar,
// cada usuario ve la tienda de su perfil (profiles.store).
export default function LoginScreen({ onLogin, onRegister, onBackToStore, onBackToHome }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  // Si el usuario llega desde un enlace de recuperación vencido, se lo indicamos
  const [error, setError] = useState(
    authRedirectInfo.error ? `El enlace para restablecer la contraseña no es válido o expiró. Solicita uno nuevo.` : ''
  )
  const [loading, setLoading] = useState(false)

  // Recuperación de contraseña por correo
  const [forgotOpen, setForgotOpen] = useState(!!authRedirectInfo.error)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState('')

  const handleForgotPassword = async () => {
    const target = (forgotEmail || email).trim().toLowerCase()
    if (!isValidEmail(target)) {
      setForgotMsg('')
      setError('Ingresa un correo electrónico válido para enviarte el enlace.')
      return
    }
    setError('')
    setForgotLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(target, { redirectTo: authRedirectUrl })
    setForgotLoading(false)
    if (resetError) {
      setError(
        resetError.status === 429
          ? 'Ya se enviaron varios correos. Espera unos minutos antes de intentarlo de nuevo.'
          : `No se pudo enviar el correo: ${resetError.message}`
      )
      return
    }
    // Mensaje neutro: no revelamos si el correo está registrado o no
    setForgotMsg(`Si ${target} está registrado, te enviamos un enlace para crear una nueva contraseña. Revisa tu bandeja de entrada y la carpeta de spam.`)
  }

  const handleBack = onBackToHome || onBackToStore

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) {
      setError('Ingresa tu correo electrónico y contraseña')
      return
    }
    if (!isValidEmail(cleanEmail)) {
      setError('Ingresa un correo electrónico válido')
      return
    }
    setError('')
    setLoading(true)

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    setLoading(false)

    if (loginError) {
      // Mensaje neutro: no se revela si el correo existe
      setError(
        loginError.status === 429
          ? 'Demasiados intentos. Espera unos minutos antes de intentarlo de nuevo.'
          : 'Correo o contraseña incorrectos. Por favor verifica tus datos.'
      )
      return
    }

    onLogin()
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
      {/* ===================== COLUMNA IZQUIERDA: HERO FOTOGRÁFICO CON CITA ===================== */}
      <div
        className="hidden lg:flex"
        style={{
          flex: '1 1 50%',
          minHeight: '100vh',
          position: 'relative',
          backgroundImage: 'url("https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop")',
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%',
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
          <div style={{ position: 'relative', zIndex: 10 }}>
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
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 540 }}>
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
            "La tierra que nos alimenta es el lazo que nos une de raíz."
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
            SAKI5
          </p>
        </div>
      </div>

      {/* ===================== COLUMNA DERECHA: FORMULARIO WARM CREAM ===================== */}
      <div
        style={{
          flex: '1 1 50%',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          boxSizing: 'border-box',
          backgroundColor: '#FAF7F0',
          position: 'relative',
        }}
      >
        {/* Botón Volver visible en móviles */}
        {handleBack && (
          <div className="lg:hidden" style={{ width: '100%', maxWidth: 410, marginBottom: 20 }}>
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
                fontFamily: "'Nunito Sans', sans-serif",
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
            maxWidth: 410,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Logo Central de El Campo Nos Une */}
          <div style={{ marginBottom: 18, textAlign: 'center' }}>
            <img
              src={logoSrc}
              alt="SAKI5"
              style={{
                height: 120,
                width: 'auto',
                display: 'block',
                margin: '0 auto',
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.06))',
              }}
            />
          </div>

          {/* Título (Poppins Bold según manual de identidad) */}
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
            Iniciar sesión
          </h1>
          <p
            style={{
              fontFamily: "'Nunito Sans', sans-serif",
              fontSize: 14,
              color: '#666666',
              margin: '0 0 28px',
              textAlign: 'center',
              lineHeight: 1.45,
            }}
          >
            ¡Qué bueno tenerte de vuelta!
          </p>

          {/* Mensaje de Error si existe */}
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
                marginBottom: 20,
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
          <form onSubmit={handleLogin} style={{ width: '100%' }}>
            {/* Campo: Correo Electrónico */}
            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="login-email"
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
                CORREO ELECTRÓNICO
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: '12px 14px',
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

            {/* Campo: Contraseña */}
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="login-password"
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
                CONTRASEÑA
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 14px',
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
                  onClick={() => setShowPw(!showPw)}
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
                  aria-label={showPw ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPw ? (
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

            {/* Olvidaste tu contraseña - color #9B4728 (Terracota interfaz de marca) */}
            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => { setForgotOpen(!forgotOpen); setForgotMsg(''); setForgotEmail(email) }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 12.5,
                  fontWeight: 700,
                  fontFamily: "'Nunito Sans', sans-serif",
                  color: '#9B4728',
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {forgotOpen && (
              <div style={{ background: '#FDFAF6', border: '1px solid #EDE4D8', borderRadius: 12, padding: 14, marginBottom: 20, fontFamily: "'Nunito Sans', sans-serif" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#205134', marginBottom: 4 }}>Restablecer contraseña</div>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#5A5248' }}>
                  Te enviaremos un enlace a tu correo para crear una nueva contraseña.
                </p>
                {forgotMsg ? (
                  <div style={{ background: '#EAF3EC', color: '#205134', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, fontWeight: 600 }}>✉️ {forgotMsg}</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleForgotPassword() } }}
                      placeholder="tu@correo.com"
                      autoComplete="email"
                      style={{ flex: '1 1 180px', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E8DED0', fontSize: 14, outline: 'none', background: '#fff', color: '#1C3A14', boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotLoading}
                      style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#9B4728', color: '#fff', fontSize: 13, fontWeight: 700, cursor: forgotLoading ? 'default' : 'pointer', opacity: forgotLoading ? 0.6 : 1 }}
                    >
                      {forgotLoading ? 'Enviando...' : 'Enviar enlace'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Botón Principal "Entrar" (#205134 Verde Profundo) */}
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
              {loading ? 'Ingresando...' : 'Entrar'}
            </button>

            <AuthDivider />
            <div style={{ marginBottom: 26 }}>
              <GoogleSignInButton onError={setError} />
            </div>


            {/* Footer switcher */}
            <p
              style={{
                textAlign: 'center',
                fontSize: 13.5,
                fontFamily: "'Nunito Sans', sans-serif",
                color: '#666666',
                margin: 0,
              }}
            >
              ¿Aún no eres miembro?{' '}
              <button
                type="button"
                onClick={onRegister}
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
                Crear cuenta
              </button>
            </p>
            <LegalNotice />
          </form>
        </div>
      </div>
    </div>
  )
}



