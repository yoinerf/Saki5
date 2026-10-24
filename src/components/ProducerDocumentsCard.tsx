import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  DOC_STATUS,
  PRODUCER_DOCS,
  VALIDATION_STATE,
  fetchDocuments,
  fetchManualVerifications,
  getDocumentUrl,
  uploadProducerDocument,
  validationState,
  type DocType,
  type ProducerDocument,
  type ValidationState,
} from '../lib/producerDocuments'
import { confirmDialog } from './ConfirmDialog'

interface ProducerDocumentsCardProps {
  userId: string
  style?: CSSProperties
  /** Se llama al cargar y cada vez que cambian los documentos */
  onValidationChange?: (state: ValidationState) => void
}

// Carga del RUT (obligatorio) y la Cámara de Comercio (opcional) del productor. Cada carga queda "Pendiente"
// hasta que el administrador de su tienda la revise; reemplazar un documento
// aprobado invalida la aprobación (lo aplica la BD).
export default function ProducerDocumentsCard({ userId, style, onValidationChange }: ProducerDocumentsCardProps) {
  const [docs, setDocs] = useState<ProducerDocument[]>([])
  const [uploading, setUploading] = useState<DocType | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const inputs = useRef<Partial<Record<DocType, HTMLInputElement | null>>>({})

  // Verificado manualmente por un superadmin: no necesita los documentos
  const [manuallyVerified, setManuallyVerified] = useState(false)

  const load = async () => {
    const [list, manual] = await Promise.all([fetchDocuments([userId]), fetchManualVerifications([userId])])
    setDocs(list)
    setManuallyVerified(manual.has(userId))
    onValidationChange?.(validationState(list, manual.has(userId)))
  }

  useEffect(() => { if (userId) load() }, [userId])

  const handleFile = async (type: DocType, file?: File) => {
    if (!file) return
    const current = docs.find((d) => d.doc_type === type)
    if (current?.status === 'aprobado' && !(await confirmDialog({
      title: 'Reemplazar documento aprobado',
      message: 'Este documento ya está aprobado. Si lo reemplazas, deberá revisarse de nuevo y no podrás publicar hasta que se apruebe.',
      confirmText: 'Reemplazar',
      tone: 'warning',
    }))) {
      if (inputs.current[type]) inputs.current[type]!.value = ''
      return
    }
    setUploading(type)
    setMessage(null)
    const { error } = await uploadProducerDocument(userId, type, file)
    setUploading(null)
    if (inputs.current[type]) inputs.current[type]!.value = ''
    if (error) {
      setMessage({ type: 'error', text: error })
      return
    }
    setMessage({ type: 'ok', text: 'Documento cargado. Quedó pendiente de revisión por el administrador de tu tienda.' })
    load()
  }

  const openDoc = async (doc: ProducerDocument) => {
    const url = await getDocumentUrl(doc.file_path)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else setMessage({ type: 'error', text: 'No se pudo abrir el documento.' })
  }

  const state = validationState(docs, manuallyVerified)
  const vs = manuallyVerified ? { ...VALIDATION_STATE.validado, label: 'Verificado por el administrador' } : VALIDATION_STATE[state]

  return (
    <div style={{ background: '#fff', border: '1px solid #EDE4D8', borderRadius: 24, padding: 28, fontFamily: "'Nunito Sans', sans-serif", ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 700, color: '#1C3A14' }}>Documentos del productor</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8070' }}>
            Para publicar productos o experiencias necesitas el RUT aprobado. La Cámara de Comercio es opcional. PDF, JPG o PNG de máximo 5 MB.
          </p>
        </div>
        <span style={{ background: vs.bg, color: vs.color, fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>{vs.label}</span>
      </div>

      {message && (
        <div style={{ background: message.type === 'ok' ? '#EAF3EC' : '#FEE9E1', color: message.type === 'ok' ? '#205134' : '#C53030', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, margin: '12px 0' }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
        {PRODUCER_DOCS.map(({ type, label, required }) => {
          const doc = docs.find((d) => d.doc_type === type)
          const st = doc ? DOC_STATUS[doc.status] : null
          return (
            <div key={type} style={{ background: '#FDFAF6', border: '1px solid #EDE4D8', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, color: '#205134' }}>
                  {label}
                  {!required && <span style={{ fontWeight: 600, color: '#8A8070', fontSize: 12 }}> (opcional)</span>}
                </span>
                {st
                  ? <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{st.label}</span>
                  : <span style={{ background: '#F3ECE2', color: '#7A5C3A', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20 }}>Sin cargar</span>}
              </div>
              {doc && (
                <button type="button" onClick={() => openDoc(doc)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: '#205134', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all', textAlign: 'left' }}>
                  {doc.file_name}
                </button>
              )}
              {doc?.status === 'rechazado' && doc.rejection_reason && (
                <div style={{ fontSize: 12, color: '#C53030', marginTop: 6 }}>Motivo del rechazo: {doc.rejection_reason}</div>
              )}
              {/* Empuja el botón al fondo para que las dos tarjetas queden alineadas */}
              <div style={{ flex: 1, minHeight: 10 }} />
              <input
                ref={(el) => { inputs.current[type] = el }}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(type, e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploading !== null}
                onClick={() => inputs.current[type]?.click()}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 12, border: doc ? '1px solid #EDE4D8' : 'none', background: doc ? '#fff' : '#205134', color: doc ? '#205134' : '#fff', fontSize: 13, fontWeight: 700, cursor: uploading ? 'default' : 'pointer', opacity: uploading && uploading !== type ? 0.6 : 1 }}
              >
                {uploading === type ? 'Subiendo...' : doc ? 'Reemplazar documento' : `Cargar ${label}`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
