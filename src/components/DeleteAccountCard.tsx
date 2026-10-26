import { useState, type CSSProperties } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearPromoSession } from '../lib/promoSession'

// "Eliminar mi cuenta" (derecho de supresión, Ley 1581 de 2012). Antes solo se podía pidiéndolo por
// correo. La Edge Function delete-account valida que no haya pedidos en curso y borra o anonimiza.

const CONFIRM_WORD = 'ELIMINAR'

export default function DeleteAccountCard({ style }: { style?: CSSProperties }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    if (confirm.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Escribe ${CONFIRM_WORD} para confirmar.`)
      return
    }
    setDeleting(true)
    setError('')
    const { error: fnError } = await supabase.functions.invoke('delete-account', { body: { confirm: CONFIRM_WORD } })
    if (fnError) {
      let message = `No se pudo eliminar la cuenta: ${fnError.message}`
      if (fnError instanceof FunctionsHttpError) {
        try {
          const payload = await fnError.context.json()
          if (payload?.error) message = payload.error
        } catch {
          // Respuesta sin JSON: se deja el mensaje genérico
        }
      }
      setDeleting(false)
      setError(message)
      return
    }
    clearPromoSession()
    await supabase.auth.signOut()
    window.location.href = import.meta.env.BASE_URL
  }

  return (
    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #F3C9C0', padding: 20, ...style }}>
      <h2 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 700, color: '#9B2C2C' }}>Eliminar mi cuenta</h2>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8070', lineHeight: 1.5 }}>
        Se borran tus datos, publicaciones, favoritos y reseñas. Los pedidos terminados se conservan sin tus datos personales,
        por obligaciones contables. No se puede deshacer.
      </p>

      {!open ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={() => setOpen(true)} style={{ background: 'none', color: '#C53030', border: '1.5px solid #C53030', borderRadius: 12, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Eliminar mi cuenta
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <label htmlFor="delete-account-confirm" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9B2C2C', marginBottom: 5 }}>
            Escribe {CONFIRM_WORD} para confirmar
          </label>
          <input
            id="delete-account-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid #F3C9C0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'Nunito Sans', sans-serif", background: '#FFFAF8', color: '#1C3A14' }}
          />
          {error && (
            <div style={{ marginTop: 10, background: '#FDEDED', color: '#C53030', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>{error}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => { setOpen(false); setConfirm(''); setError('') }} disabled={deleting} style={{ background: 'none', color: '#5A5248', border: '1px solid #EDE4D8', borderRadius: 12, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="button" onClick={handleDelete} disabled={deleting} style={{ background: '#C53030', color: '#fff', border: 'none', borderRadius: 12, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
              {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
