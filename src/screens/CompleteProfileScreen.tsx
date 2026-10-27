import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { signOutUser } from '../lib/session'
import { cleanLine, personNameError } from '../lib/validation'
import { normalizeDocumentNumber, validateDocument } from '../lib/identity'
import DocumentFields from '../components/DocumentFields'
import LocationFields from '../components/LocationFields'
import LegalNotice from '../components/LegalNotice'
import logoSrc from '../assets/logo-nofond.png'

// Primera vez con Google (o cuenta sin perfil): no hubo formulario de registro, así que se piden los datos
// obligatorios y el tipo de cuenta. Lo guarda la RPC complete_my_profile (una sola vez).

type AccountType = 'comprador' | 'asociacion' | 'turismo'

const ACCOUNT_TYPES: { id: AccountType; label: string; icon: string }[] = [
  { id: 'comprador', label: 'Comprador', icon: '🛒' },
  { id: 'asociacion', label: 'Productor', icon: '🌽' },
  { id: 'turismo', label: 'Turismo', icon: '🏞️' },
]

const label: CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 800,
  fontFamily: "'Nunito Sans', sans-serif",
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#205134',
  marginBottom: 5,
}
const input: CSSProperties = {
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

export default function CompleteProfileScreen({ onDone }: { onDone: () => void }) {
  const [accountType, setAccountType] = useState<AccountType>('comprador')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [doc, setDoc] = useState({ documentType: '', documentNumber: '' })
  const [location, setLocation] = useState({ department: '', municipality: '' })
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Nombre que trajo Google (handle_new_user ya lo guardó en el perfil)
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
      // Si el perfil aún no existe, el nombre sale de la cuenta (Google envía full_name)
      const fullName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '').trim()
      setFirstName(data?.first_name || user.user_metadata?.first_name || fullName.split(' ')[0] || '')
      setLastName(data?.last_name || user.user_metadata?.last_name || fullName.split(' ').slice(1).join(' '))
    }
    load()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const first = cleanLine(firstName)
    const last = cleanLine(lastName)
    const nameError = personNameError('Nombre', first) ?? personNameError('Apellido', last, false)
    if (nameError) { setError(nameError); return }
    const docError = validateDocument(doc.documentType, doc.documentNumber)
    if (docError) { setError(docError); return }
    if (!location.department || !location.municipality) { setError('Selecciona tu departamento y municipio.'); return }

    setSaving(true)
    const { error: rpcError } = await supabase.rpc('complete_my_profile', {
      p_user_type: accountType,
      p_first_name: first,
      p_last_name: last,
      p_document_type: doc.documentType,
      p_document_number: normalizeDocumentNumber(doc.documentNumber),
      p_department: location.department,
      p_municipality: location.municipality,
    })
    setSaving(false)
    if (rpcError) { setError(`No pudimos guardar tus datos: ${rpcError.message}`); return }
    onDone()
  }

  const signOut = async () => {
    await signOutUser()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5EEE6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', boxSizing: 'border-box' }}>
      <form onSubmit={handleSave} style={{ width: '100%', maxWidth: 520, background: '#FFFFFF', borderRadius: 20, border: '1px solid #EDE4D8', boxShadow: '0 8px 30px rgba(32,81,52,0.08)', padding: '28px 24px', boxSizing: 'border-box' }}>
        <img src={logoSrc} alt="El Campo Nos Une" style={{ height: 72, display: 'block', margin: '0 auto 12px' }} />
        <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, fontWeight: 700, color: '#205134', textAlign: 'center', margin: '0 0 6px' }}>Completa tu perfil</h1>
        <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, color: '#6B7280', textAlign: 'center', margin: '0 0 22px' }}>
          {email ? `Cuenta: ${email}. ` : ''}Necesitamos estos datos una sola vez para terminar de crear tu cuenta.
        </p>

        <div style={{ marginBottom: 15 }}>
          <label style={label}>Tipo de perfil</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, background: '#EAE3D6', padding: 4, borderRadius: 10 }}>
            {ACCOUNT_TYPES.map((t) => {
              const selected = accountType === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAccountType(t.id)}
                  style={{ padding: '8px 6px', borderRadius: 8, border: 'none', background: selected ? '#FFFFFF' : 'transparent', color: selected ? '#205134' : '#6B7280', fontWeight: selected ? 700 : 600, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, cursor: 'pointer', boxShadow: selected ? '0 2px 5px rgba(0,0,0,0.08)' : 'none' }}
                >
                  {t.icon} {t.label}
                </button>
              )
            })}
          </div>
          {accountType !== 'comprador' && (
            <p style={{ margin: '8px 2px 0', fontSize: 12, lineHeight: 1.45, color: '#6B7280', fontFamily: "'Nunito Sans', sans-serif" }}>
              ¿Vendes en la Tienda Amazónica u otra tienda aliada? Pide al administrador que te asigne a tu tienda. Para publicar deberás cargar tu RUT.
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 12px' }}>
          <div style={{ marginBottom: 15 }}>
            <label style={label}>Nombre *</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" style={input} />
          </div>
          <div style={{ marginBottom: 15 }}>
            <label style={label}>Apellido</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" style={input} />
          </div>
          <DocumentFields {...doc} onChange={setDoc} labelStyle={label} inputStyle={input} fieldStyle={{ marginBottom: 15 }} />
          <LocationFields {...location} onChange={setLocation} labelStyle={label} inputStyle={input} fieldStyle={{ marginBottom: 15 }} />
        </div>

        {error && (
          <div style={{ background: '#FDEDED', color: '#C53030', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700, marginBottom: 14, fontFamily: "'Nunito Sans', sans-serif" }}>{error}</div>
        )}

        <button type="submit" disabled={saving} style={{ width: '100%', background: '#205134', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700, fontFamily: "'Nunito Sans', sans-serif", cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Guardando...' : 'Guardar y continuar'}
        </button>
        <button type="button" onClick={signOut} style={{ width: '100%', background: 'none', border: 'none', color: '#6B7280', fontSize: 13, fontWeight: 600, marginTop: 12, cursor: 'pointer', fontFamily: "'Nunito Sans', sans-serif", textDecoration: 'underline' }}>
          Cerrar sesión
        </button>
        <LegalNotice action="guardar tus datos" />
      </form>
    </div>
  )
}
