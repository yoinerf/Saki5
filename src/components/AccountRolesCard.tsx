import { useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useAppNavigation } from '../lib/navigation'
import { confirmDialog } from './ConfirmDialog'
import { ROLE_LABELS, addableRoles, sellerRole, storeActiveRole, type AddableRole } from '../lib/roles'

// Roles de la cuenta en el panel del comprador. Una cuenta que solo es Comprador puede agregar
// Asociación o Turismo sin crear otra cuenta: add_my_role valida en la base que no tenga ya
// un rol de vendedor y que sus datos obligatorios estén completos.

const C = {
  green: '#205134',
  greenSoft: '#EAF3EC',
  dark: '#1C3A14',
  muted: '#8A8070',
  text: '#5A5248',
  border: '#EDE4D8',
  bg: '#FDFAF6',
  terra: '#9B4728',
  display: "'Poppins', sans-serif",
  body: "'Nunito Sans', sans-serif",
}

const card: CSSProperties = { background: '#fff', borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(32,81,52,0.05)', padding: 20 }
const inputStyle: CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: C.body, background: C.bg, color: C.dark }
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 5 }
const btnPrimary: CSSProperties = { background: C.green, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: C.body }
const btnGhost: CSSProperties = { background: '#fff', color: C.green, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: C.body }

const ROLE_INFO: Record<AddableRole, { emoji: string; description: string; verification: string }> = {
  asociacion: {
    emoji: '🌾',
    description: 'Vende los productos de tu finca, asociación o emprendimiento en la tienda.',
    verification: 'Para publicar productos deberás cargar tu RUT y esperar su aprobación.',
  },
  turismo: {
    emoji: '🏞️',
    description: 'Publica experiencias de turismo rural y recibe reservas.',
    verification: 'Para publicar experiencias deberás cargar tu RUT y esperar su aprobación.',
  },
}

interface Props {
  /** Motivo por el que aún no se puede agregar un rol (datos obligatorios incompletos) */
  requirementsError: string | null
  /** Abre "Mis datos" para completar la información */
  onCompleteData: () => void
  initialOrgName?: string
}

export default function AccountRolesCard({ requirementsError, onCompleteData, initialOrgName = '' }: Props) {
  const { session, roles, refreshProfile } = useAuth()
  const { switchRole } = useAppNavigation()
  const seller = sellerRole(roles)
  const options = addableRoles(roles)
  const [selected, setSelected] = useState<AddableRole | null>(null)
  const [orgName, setOrgName] = useState(initialOrgName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addRole = async () => {
    if (!selected || !session) return
    setError('')
    if (requirementsError) {
      setError(requirementsError)
      return
    }
    const confirmed = await confirmDialog({
      title: `¿Agregar el rol ${ROLE_LABELS[selected]}?`,
      message: `Se agregará a tu cuenta actual: seguirás siendo Comprador, con los mismos datos, pedidos y favoritos. ${ROLE_INFO[selected].verification}`,
      confirmText: 'Agregar rol',
    })
    if (!confirmed) return

    setSaving(true)
    const { error: rpcError } = await supabase.rpc('add_my_role', { p_role: selected, p_org_name: orgName.trim() || undefined })
    if (rpcError) {
      setSaving(false)
      setError(rpcError.message || 'No se pudo agregar el rol.')
      return
    }
    // Abrir la app con el rol nuevo: al recargar el perfil App lleva a su panel
    storeActiveRole(session.user.id, selected)
    await refreshProfile()
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, fontFamily: C.body }}>
      <div style={card}>
        <h2 style={{ margin: 0, fontFamily: C.display, fontSize: 20, fontWeight: 700, color: C.dark }}>Mis roles</h2>
        <p style={{ margin: '4px 0 14px', fontSize: 13, color: C.muted }}>Una sola cuenta para comprar y vender.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {roles.map((r) => (
            <span key={r} style={{ background: C.greenSoft, color: C.green, fontSize: 12, fontWeight: 800, padding: '6px 12px', borderRadius: 20 }}>
              ✓ {ROLE_LABELS[r]}
            </span>
          ))}
        </div>
      </div>

      {seller && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: C.dark, fontSize: 15 }}>Panel de {ROLE_LABELS[seller]}</div>
            <div style={{ fontSize: 13, color: C.muted }}>
              {seller === 'turismo' ? 'Administra tus experiencias y reservas.' : 'Administra tus productos, pedidos e inventario.'}
            </div>
          </div>
          <button type="button" style={btnPrimary} onClick={() => switchRole(seller)}>Ir a mi panel →</button>
        </div>
      )}

      {options.length > 0 && (
        <div style={card}>
          <h3 style={{ margin: 0, fontFamily: C.display, fontSize: 17, fontWeight: 700, color: C.green }}>Agregar un rol</h3>
          <p style={{ margin: '4px 0 16px', fontSize: 13, color: C.muted }}>
            Elige el rol que quieres sumar a tu cuenta. No necesitas crear otra cuenta.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            {options.map((r) => {
              const active = selected === r
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setSelected(r); setError('') }}
                  style={{ textAlign: 'left', padding: 16, borderRadius: 16, cursor: 'pointer', fontFamily: C.body, border: `2px solid ${active ? C.green : C.border}`, background: active ? C.greenSoft : C.bg }}
                >
                  <div style={{ fontSize: 26, marginBottom: 6 }}>{ROLE_INFO[r].emoji}</div>
                  <div style={{ fontWeight: 800, color: C.dark, fontSize: 15 }}>{ROLE_LABELS[r]}</div>
                  <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{ROLE_INFO[r].description}</div>
                </button>
              )
            })}
          </div>

          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle} htmlFor="role-org-name">Organización / emprendimiento</label>
                <input
                  id="role-org-name"
                  value={orgName}
                  maxLength={200}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder={selected === 'turismo' ? 'Ej: Ruta Cafetera La Montaña' : 'Ej: Finca La Esperanza'}
                  style={inputStyle}
                />
                <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>Opcional. Es el nombre que verán los compradores; si lo dejas vacío se usa tu nombre.</p>
              </div>

              <div style={{ background: '#FFF7E8', border: '1px solid #F0D099', color: C.terra, borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>
                {ROLE_INFO[selected].verification}
              </div>

              {requirementsError && (
                <div style={{ background: '#FDEDED', border: '1px solid #F5C2C2', color: '#C53030', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span>Antes de agregar el rol completa tus datos: {requirementsError}</span>
                  <button type="button" style={btnGhost} onClick={onCompleteData}>Completar mis datos</button>
                </div>
              )}

              {error && (
                <div role="alert" style={{ background: '#FDEDED', border: '1px solid #F5C2C2', color: '#C53030', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" style={btnGhost} onClick={() => { setSelected(null); setError('') }}>Cancelar</button>
                <button type="button" style={{ ...btnPrimary, opacity: saving || !!requirementsError ? 0.6 : 1 }} disabled={saving || !!requirementsError} onClick={addRole}>
                  {saving ? 'Agregando...' : `Agregar rol ${ROLE_LABELS[selected]}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
