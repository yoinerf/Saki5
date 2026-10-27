import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { onlyPhoneDigits, phoneInputProps } from '../lib/phone'
import { normalizeDocumentNumber, validateDocument } from '../lib/identity'
import { LIMITS, cleanLine, profileFieldsError } from '../lib/validation'
import DocumentFields from './DocumentFields'
import LocationFields from './LocationFields'

// Datos personales del usuario con sesión iniciada (admin de tienda, superadmin...).
// Solo toca columnas del propio perfil: rol y tienda los protege la BD.

const labelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#205134', marginBottom: 5 }
const inputStyle: CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 12,
  border: '1.5px solid #EDE4D8',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: "'Nunito Sans', sans-serif",
  background: '#FDFAF6',
  color: '#1C3A14',
}

const EMPTY = { first_name: '', last_name: '', phone: '', document_type: '', document_number: '', department: '', municipality: '' }

export default function MyAccountCard({ style, onSaved }: { style?: CSSProperties; onSaved?: () => void }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      setEmail(user.email ?? '')
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, document_type, document_number, department, municipality')
        .eq('id', user.id)
        .single()
      if (data) {
        setForm({
          first_name: data.first_name ?? '',
          last_name: data.last_name ?? '',
          phone: data.phone ?? '',
          document_type: data.document_type ?? '',
          document_number: data.document_number ?? '',
          department: data.department ?? '',
          municipality: data.municipality ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!userId) return
    const cleaned = { first_name: cleanLine(form.first_name), last_name: cleanLine(form.last_name), phone: onlyPhoneDigits(form.phone) }
    const fieldsError = profileFieldsError(cleaned)
    if (fieldsError) { setMsg({ ok: false, text: fieldsError }); return }
    const docError = validateDocument(form.document_type, form.document_number)
    if (docError) { setMsg({ ok: false, text: docError }); return }
    if (!form.department || !form.municipality) { setMsg({ ok: false, text: 'Selecciona el departamento y el municipio.' }); return }

    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('profiles').update({
      first_name: cleaned.first_name,
      last_name: cleaned.last_name,
      phone: cleaned.phone || null,
      document_type: form.document_type,
      document_number: normalizeDocumentNumber(form.document_number),
      department: form.department,
      municipality: form.municipality,
    }).eq('id', userId)
    setSaving(false)
    if (error) { setMsg({ ok: false, text: `No se pudieron guardar tus datos: ${error.message}` }); return }
    setMsg({ ok: true, text: 'Tus datos se actualizaron correctamente.' })
    onSaved?.()
  }

  return (
    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #EDE4D8', boxShadow: '0 4px 16px rgba(32,81,52,0.05)', padding: 20, ...style }}>
      <h2 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 700, color: '#1C3A14' }}>👤 Mis datos personales</h2>
      <p style={{ margin: '4px 0 16px', fontSize: 13, color: '#8A8070' }}>Tu información de contacto e identificación.</p>

      {loading ? (
        <p style={{ fontSize: 13, color: '#8A8070', margin: 0 }}>Cargando...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input value={form.first_name} maxLength={LIMITS.personName} onChange={(e) => setForm({ ...form, first_name: e.target.value })} autoComplete="given-name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Apellido</label>
              <input value={form.last_name} maxLength={LIMITS.personName} onChange={(e) => setForm({ ...form, last_name: e.target.value })} autoComplete="family-name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Correo electrónico</label>
              <input value={email} disabled title="El correo de acceso no se puede cambiar desde aquí" style={{ ...inputStyle, opacity: 0.65, cursor: 'not-allowed' }} />
            </div>
            <div>
              <label style={labelStyle}>WhatsApp</label>
              <input value={onlyPhoneDigits(form.phone)} onChange={(e) => setForm({ ...form, phone: onlyPhoneDigits(e.target.value) })} {...phoneInputProps} style={inputStyle} />
            </div>
            <DocumentFields
              documentType={form.document_type}
              documentNumber={form.document_number}
              onChange={({ documentType, documentNumber }) => setForm((f) => ({ ...f, document_type: documentType, document_number: documentNumber }))}
              labelStyle={labelStyle}
              inputStyle={inputStyle}
            />
            <LocationFields
              department={form.department}
              municipality={form.municipality}
              onChange={(loc) => setForm((f) => ({ ...f, ...loc }))}
              labelStyle={labelStyle}
              inputStyle={inputStyle}
            />
          </div>

          {msg && (
            <div style={{ marginTop: 12, background: msg.ok ? '#EAF3EC' : '#FDEDED', color: msg.ok ? '#205134' : '#C53030', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>{msg.text}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={handleSave} disabled={saving} style={{ background: '#205134', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Guardando...' : 'Guardar mis datos'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
