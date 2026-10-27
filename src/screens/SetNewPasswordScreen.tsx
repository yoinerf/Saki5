import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { signOutUser } from '../lib/session'
import { useAuth } from '../lib/auth'
import logoSrc from '../assets/logo-nofond.png'
import PasswordFields, { validateNewPassword } from '../components/PasswordFields'

interface Props {
  // recovery: llegó desde el enlace del correo · forced: entró con una contraseña temporal
  mode: 'recovery' | 'forced'
  onDone: () => void
}

// Pantalla para crear una nueva contraseña (enlace de recuperación o contraseña temporal)
export default function SetNewPasswordScreen({ mode, onDone }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  // Un enlace de recuperación inicia sesión en la cuenta que lo pidió. Si alguien envía el enlace de
  // SU cuenta, la víctima quedaría usando la cuenta ajena: por eso se muestra a qué correo se aplica.
  const email = useAuth().session?.user.email

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validation = validateNewPassword(password, confirm)
    if (validation) {
      setError(validation)
      return
    }
    setError('')
    setSaving(true)
    // must_change_password se limpia para que no vuelva a pedirse al ingresar
    const { error: updateError } = await supabase.auth.updateUser({ password, data: { must_change_password: false } })
    setSaving(false)
    if (updateError) {
      setError(
        updateError.code === 'same_password'
          ? 'La nueva contraseña debe ser diferente a la anterior.'
          : updateError.code === 'weak_password'
            ? 'La contraseña es muy débil. Usa una más larga, con letras y números.'
            : `No se pudo actualizar la contraseña: ${updateError.message}`
      )
      return
    }
    setDone(true)
  }

  const signOut = async () => {
    await signOutUser(import.meta.env.BASE_URL)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#F5EEE6', fontFamily: "'Nunito Sans', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 24, border: '1px solid #EDE4D8', boxShadow: '0 8px 32px rgba(32,81,52,0.08)', padding: '32px 28px', boxSizing: 'border-box' }}>
        <img src={logoSrc} alt="El Campo Nos Une" style={{ height: 64, display: 'block', margin: '0 auto 16px' }} />

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, color: '#205134', margin: '0 0 8px' }}>Contraseña actualizada</h1>
            <p style={{ fontSize: 14, color: '#5A5248', margin: '0 0 20px' }}>Ya puedes usar tu nueva contraseña para ingresar.</p>
            <button type="button" onClick={onDone} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: '#205134', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Continuar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, color: '#1C3A14', margin: '0 0 6px', textAlign: 'center' }}>
              {mode === 'forced' ? 'Crea tu contraseña personal' : 'Crea una nueva contraseña'}
            </h1>
            <p style={{ fontSize: 13.5, color: '#5A5248', margin: '0 0 20px', textAlign: 'center' }}>
              {mode === 'forced'
                ? 'Ingresaste con una contraseña temporal. Por seguridad, debes cambiarla antes de continuar.'
                : 'Escribe la nueva contraseña para tu cuenta.'}
            </p>
            {email && (
              <p style={{ fontSize: 13, color: '#1C3A14', background: '#F5EEE6', borderRadius: 10, padding: '8px 12px', margin: '-8px 0 18px', textAlign: 'center', overflowWrap: 'anywhere' }}>
                Cuenta: <strong>{email}</strong>
                {mode === 'recovery' && <span style={{ display: 'block', fontSize: 12, color: '#5A5248', marginTop: 2 }}>¿No es tu correo? No continúes: cancela y cierra sesión.</span>}
              </p>
            )}

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', color: '#991B1B', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>⚠️ {error}</div>
            )}

            <PasswordFields password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} />

            <button type="submit" disabled={saving} style={{ width: '100%', marginTop: 18, padding: '12px', borderRadius: 12, border: 'none', background: '#205134', color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Guardando...' : 'Guardar contraseña'}
            </button>

            <button type="button" onClick={signOut} style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 12, border: '1px solid #EDE4D8', background: '#fff', color: '#D06050', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Cancelar y cerrar sesión
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
