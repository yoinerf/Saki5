import { supabase } from './supabase'
import { confirmDialog } from '../components/ConfirmDialog'

// Documentos que el productor carga y valida el administrador de la tienda
// (ver Instructions/migration_admin_tienda.sql). Solo los marcados como obligatorios
// cuentan para verificar al productor y permitirle publicar.
export type DocType = 'rut' | 'camara_comercio'
export type DocStatus = 'pendiente' | 'aprobado' | 'rechazado'

export const PRODUCER_DOCS: { type: DocType; label: string; required: boolean }[] = [
  { type: 'rut', label: 'RUT', required: true },
  { type: 'camara_comercio', label: 'Cámara de Comercio', required: false },
]

// Debe coincidir con public.is_producer_validated en la BD
export const REQUIRED_DOCS = PRODUCER_DOCS.filter((d) => d.required)

export const DOC_LABELS: Record<DocType, string> = { rut: 'RUT', camara_comercio: 'Cámara de Comercio' }

export const DOC_STATUS: Record<DocStatus, { label: string; bg: string; color: string }> = {
  pendiente: { label: 'Pendiente de revisión', bg: '#FFF1E0', color: '#C4622D' },
  aprobado: { label: 'Aprobado', bg: '#EAF3EC', color: '#205134' },
  rechazado: { label: 'Rechazado', bg: '#FEE9E1', color: '#C53030' },
}

export const MAX_DOC_SIZE = 5 * 1024 * 1024
export const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const BUCKET = 'producer-documents'

export interface ProducerDocument {
  id: string
  producer_id: string
  doc_type: DocType
  file_path: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  status: DocStatus
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string
}

// Estado de validación del productor: solo puede publicar con los documentos obligatorios (RUT) aprobados
export type ValidationState = 'validado' | 'pendiente' | 'rechazado' | 'incompleto'

export const VALIDATION_STATE: Record<ValidationState, { label: string; bg: string; color: string }> = {
  validado: { label: 'Validado', bg: '#EAF3EC', color: '#205134' },
  pendiente: { label: 'En revisión', bg: '#FFF1E0', color: '#C4622D' },
  rechazado: { label: 'Con documentos rechazados', bg: '#FEE9E1', color: '#C53030' },
  incompleto: { label: 'Documentos incompletos', bg: '#F3ECE2', color: '#7A5C3A' },
}

/**
 * manuallyVerified: el superadmin verificó al productor sin exigir documentos
 * (profiles.manually_verified_at). La BD aplica la misma regla en is_producer_validated.
 */
export function validationState(docs: ProducerDocument[], manuallyVerified = false): ValidationState {
  if (manuallyVerified) return 'validado'
  const byType = REQUIRED_DOCS.map((d) => docs.find((doc) => doc.doc_type === d.type))
  if (byType.every((d) => d?.status === 'aprobado')) return 'validado'
  if (byType.some((d) => d?.status === 'rechazado')) return 'rechazado'
  if (byType.some((d) => !d)) return 'incompleto'
  return 'pendiente'
}

export const PUBLISH_BLOCKED_MESSAGE =
  'Para publicar necesitas el RUT aprobado por el administrador de tu tienda.'

// Aviso cuando un productor sin documentos aprobados intenta publicar. true = quiere ir a cargarlos
export function confirmGoToDocuments() {
  return confirmDialog({
    title: 'Aún no puedes publicar',
    message: `${PUBLISH_BLOCKED_MESSAGE}\nCárgalo en tu perfil para que lo revisen.`,
    confirmText: 'Cargar RUT',
    cancelText: 'Ahora no',
    tone: 'warning',
  })
}

// ¿El usuario actual puede publicar? Se consulta antes de abrir un formulario de publicación.
// Es solo una ayuda de interfaz: la BD bloquea la creación de todos modos.
export async function canCurrentUserPublish(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const [docs, manual] = await Promise.all([fetchDocuments([user.id]), fetchManualVerifications([user.id])])
  return validationState(docs, manual.has(user.id)) === 'validado'
}

/** Productores (de la lista) verificados manualmente por un superadmin */
export async function fetchManualVerifications(producerIds: string[]): Promise<Set<string>> {
  if (producerIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .in('id', producerIds)
    .not('manually_verified_at', 'is', null)
  if (error) console.error('Error cargando verificaciones manuales:', error.message)
  return new Set((data ?? []).map((p) => p.id))
}

/** Solo superadmin (lo valida la BD): verifica o quita la verificación manual de un productor */
export async function setManualVerification(producerId: string, verified: boolean) {
  return supabase.rpc('set_producer_manual_verification', { p_producer: producerId, p_verified: verified })
}

export async function fetchDocuments(producerIds: string[]): Promise<ProducerDocument[]> {
  if (producerIds.length === 0) return []
  const { data, error } = await supabase
    .from('producer_documents')
    .select('*')
    .in('producer_id', producerIds)
  if (error) console.error('Error cargando documentos:', error.message)
  return (data ?? []) as ProducerDocument[]
}

export function validateDocFile(file: File): string | null {
  if (file.size > MAX_DOC_SIZE) return 'El archivo no puede pesar más de 5 MB.'
  if (!ALLOWED_DOC_TYPES.includes(file.type)) return 'Solo se aceptan archivos PDF, JPG o PNG.'
  return null
}

// Sube el archivo a la carpeta del productor y registra la nueva versión (queda pendiente).
// Si reemplaza otra versión, borra el archivo anterior.
export async function uploadProducerDocument(userId: string, docType: DocType, file: File): Promise<{ error: string | null }> {
  const invalid = validateDocFile(file)
  if (invalid) return { error: invalid }

  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${userId}/${docType}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) return { error: `No se pudo subir el archivo: ${uploadError.message}` }

  const { data, error } = await supabase.rpc('submit_producer_document', {
    p_doc_type: docType,
    p_file_path: path,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_file_size: file.size,
  })
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    return { error: error.message }
  }

  const previous = (data as { previous_path?: string | null } | null)?.previous_path
  if (previous) await supabase.storage.from(BUCKET).remove([previous])
  return { error: null }
}

// Enlace temporal (5 min) para ver o descargar un documento privado
export async function getDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error) {
    console.error('Error generando enlace del documento:', error.message)
    return null
  }
  return data.signedUrl
}

export async function reviewDocument(documentId: string, approve: boolean, reason?: string) {
  return supabase.rpc('review_producer_document', {
    p_document_id: documentId,
    p_approve: approve,
    p_reason: reason,
  })
}
