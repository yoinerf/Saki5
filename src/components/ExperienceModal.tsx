import React, { useState, useEffect, useRef } from 'react'
import { MAX_IMAGE_MB, uploadPublicImage, validateImage, type SavedImage } from '../lib/imageUpload'
import { LIMITS, cleanLine, cleanMultiline, integerError, parseTags, priceError, tagsError, textError } from '../lib/validation'

/** Experiencia existente con la que se precarga el formulario */
export interface ExperienceInitialData {
  title?: string
  host?: string
  host_id?: string | null
  category_id?: string | null
  price?: number | string
  capacity?: number | string | null
  stockNum?: string
  duration?: string | null
  description?: string | null
  tags?: string[] | string | null
  featured?: boolean | null
  img?: string
}

/** Lo que entrega el formulario al guardar */
export interface ExperienceFormData {
  title: string
  host: string
  host_id: string
  category_id: string
  price: string
  capacity: string
  duration: string
  description: string
  tags: string
  featured: boolean
  img: string
  uploadedImages: SavedImage[]
}

export interface ExperienceModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ExperienceFormData) => Promise<void>
  initialData?: ExperienceInitialData
  title?: string
  categories?: { id: string; name: string }[]
  hosts?: { id: string; name: string; org_name?: string }[]
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1.5px solid #EDE4D8',
  fontSize: 14,
  fontFamily: "'Nunito Sans', sans-serif",
  boxSizing: 'border-box',
  background: '#fff',
  color: '#3D2B1A',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: '#205134',
  marginBottom: 5,
  fontFamily: "'Nunito Sans', sans-serif",
}


interface UploadedImage {
  file: File
  preview: string
  uploading: boolean
  storagePath?: string
  publicUrl?: string
  error?: string
}

export default function ExperienceModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  title = 'Nueva experiencia',
  categories = [],
  hosts,
}: ExperienceModalProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    host: '',
    host_id: '',
    category_id: '',
    price: '',
    capacity: '10',
    duration: '2 horas',
    description: '',
    tags: '',
    featured: true,
  })
  const [images, setImages] = useState<UploadedImage[]>([])
  const [existingImg, setExistingImg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [formError, setFormError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const matchedHostId =
          initialData.host_id ||
          hosts?.find(
            (h) =>
              h.name === initialData.host ||
              (h.org_name && h.org_name === initialData.host)
          )?.id ||
          ''
        setForm({
          title: initialData.title || '',
          host: initialData.host || (hosts?.find((h) => h.id === matchedHostId)?.name ?? ''),
          host_id: matchedHostId,
          category_id: initialData.category_id || '',
          price: initialData.price ? String(initialData.price) : '',
          capacity: initialData.capacity ? String(initialData.capacity).replace(/\D/g, '') : (initialData.stockNum || '10'),
          duration: initialData.duration || '2 horas',
          description: initialData.description || '',
          tags: initialData.tags ? (Array.isArray(initialData.tags) ? initialData.tags.join(', ') : initialData.tags) : '',
          featured: initialData.featured ?? true,
        })
        setExistingImg(initialData.img || '')
      } else {
        const defaultCatId = categories.length > 0 ? categories[0].id : ''
        setForm({
          title: '',
          host: '',
          host_id: '',
          category_id: defaultCatId,
          price: '',
          capacity: '10',
          duration: '2 horas',
          description: '',
          tags: '',
          featured: true,
        })
        setExistingImg('')
      }
      setImages([])
      setUploadError('')
      setFormError('')
    }
  }, [isOpen, initialData, categories, hosts])

  if (!isOpen) return null

  const validateFile = validateImage

  const uploadFile = async (file: File, idx: number) => {
    setImages(prev => prev.map((img, i) => i === idx ? { ...img, uploading: true, error: undefined } : img))
    const result = await uploadPublicImage('experience-images', file)
    if (result.error !== undefined) {
      setImages(prev => prev.map((img, i) => i === idx ? { ...img, uploading: false, error: result.error } : img))
      return
    }
    const { storagePath, publicUrl } = result
    setImages(prev => prev.map((img, i) => i === idx ? { ...img, uploading: false, storagePath, publicUrl } : img))
  }

  const addFiles = (files: FileList | File[]) => {
    setUploadError('')
    const arr = Array.from(files)
    const valid: UploadedImage[] = []
    for (const file of arr) {
      const err = validateFile(file)
      if (err) { setUploadError(err); continue }
      valid.push({ file, preview: URL.createObjectURL(file), uploading: false })
    }
    if (valid.length === 0) return
    setImages(prev => {
      const baseIdx = prev.length
      valid.forEach((v, i) => { setTimeout(() => uploadFile(v.file, baseIdx + i), 0) })
      return [...prev, ...valid]
    })
  }

  const removeImage = (idx: number) => {
    setImages(prev => {
      const removed = prev[idx]
      if (removed.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSave = async () => {
    const title = cleanLine(form.title)
    const description = cleanMultiline(form.description)
    const duration = cleanLine(form.duration)
    const tags = parseTags(form.tags)
    const fieldsError =
      textError('Nombre de la experiencia', title, { max: LIMITS.title, required: true }) ??
      priceError(form.price) ??
      integerError(form.capacity, 'Cupos disponibles', 1, 10_000) ??
      textError('Duración', duration, { max: LIMITS.shortText }) ??
      tagsError(tags) ??
      textError('Descripción', description, { max: LIMITS.description })
    setFormError(fieldsError ?? '')
    if (fieldsError) return
    if (images.some(i => i.uploading)) { setUploadError('Espera a que terminen de subir las imágenes'); return }
    const primaryUploaded = images.find(i => i.publicUrl)
    const imgUrl = primaryUploaded?.publicUrl || existingImg || ''
    setSaving(true)
    await onSave({
      ...form,
      title,
      description,
      duration,
      capacity: form.capacity.trim(),
      tags: tags.join(', '),
      img: imgUrl,
      uploadedImages: images.filter(i => i.publicUrl).map((img, idx) => ({
        storagePath: img.storagePath!,
        imageUrl: img.publicUrl!,
        isPrimary: idx === 0,
        sortOrder: idx,
      })),
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6">
      <div className="w-full sm:max-w-[660px] bg-white rounded-2xl sm:rounded-3xl shadow-2xl box-border max-h-[96vh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        {/* ── Header fijo ── */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 sm:px-7 py-4 border-b border-[#F0EAE1] bg-white">
          <h3 className="font-['Poppins'] text-lg sm:text-xl text-[#205134] m-0 font-bold truncate pr-3">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#F3ECE2] text-[#9B4728] hover:bg-[#EADDCB] transition-colors flex items-center justify-center text-base sm:text-lg border-0 cursor-pointer shrink-0 font-bold"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* ── Cuerpo scrolleable ── */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-4 sm:py-5 space-y-4">
          <div>
            <label style={labelStyle}>Nombre de la experiencia</label>
            <input
              value={form.title}
              maxLength={LIMITS.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ej: Visita guiada a la finca cafetera"
              style={inputStyle}
            />
          </div>

          {hosts && hosts.length > 0 && (
            <div>
              <label style={labelStyle}>Anfitrión / Operador</label>
              <select
                value={form.host_id}
                onChange={(e) => {
                  const selId = e.target.value
                  const found = hosts.find((h) => h.id === selId)
                  setForm({
                    ...form,
                    host_id: selId,
                    host: found ? found.name : '',
                  })
                }}
                style={inputStyle}
              >
                <option value="">Seleccionar anfitrión u operador...</option>
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="modal-grid-2">
            {categories.length > 0 ? (
              <div className="min-w-0">
                <label style={labelStyle}>Categoría</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">Seleccionar...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="min-w-0">
              <label style={labelStyle}>Etiquetas (separadas por coma)</label>
              <input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="Naturaleza, Senderismo, Taller"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="modal-grid-3">
            <div className="min-w-0">
              <label style={labelStyle}>Precio ($ COP)</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="50000"
                style={inputStyle}
              />
            </div>
            <div className="min-w-0">
              <label style={labelStyle}>Cupos disponibles</label>
              <input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                placeholder="10"
                style={inputStyle}
              />
            </div>
            <div className="min-w-0">
              <label style={labelStyle}>Duración</label>
              <input
                value={form.duration}
                maxLength={LIMITS.shortText}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="2 horas"
                style={inputStyle}
              />
            </div>
          </div>

          {/* ── Subida de imágenes ── */}
          <div>
            <label style={labelStyle}>
              Imágenes de la experiencia{' '}
              <span className="text-[#9B7D5A] font-normal text-xs">(JPG / PNG · máx. {MAX_IMAGE_MB} MB c/u)</span>
            </label>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              className="w-full box-border rounded-xl p-3.5 sm:p-4 text-center cursor-pointer transition-all border-2 border-dashed"
              style={{
                borderColor: dragOver ? '#205134' : '#C8B9A8',
                background: dragOver ? '#EAF3EC' : '#FAF7F3',
              }}
            >
              <div className="text-2xl mb-1">🏕️</div>
              <p className="m-0 text-xs sm:text-[13px] text-[#7A6A5A] font-['Nunito_Sans']">
                Arrastra imágenes aquí o{' '}
                <span className="text-[#205134] font-bold">haz clic para seleccionar</span>
              </p>
              <p className="mt-0.5 mb-0 text-[11px] text-[#B0A090] font-['Nunito_Sans']">
                JPG, PNG · máx. {MAX_IMAGE_MB} MB por imagen
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />

            {uploadError && (
              <p className="text-[#C0392B] text-xs mt-1.5 mb-0 font-['Nunito_Sans']">{uploadError}</p>
            )}

            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mt-3">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-xl overflow-hidden border-2 h-20 sm:h-22"
                    style={{ borderColor: img.error ? '#E74C3C' : img.publicUrl ? '#205134' : '#EDE4D8' }}
                  >
                    <img src={img.preview} alt="" className="w-full h-full object-cover block" />
                    {idx === 0 && (
                      <span className="absolute top-1 left-1 bg-[#CF9D35] text-white text-[9px] sm:text-[10px] py-0.5 px-1.5 rounded font-bold font-['Nunito_Sans']">
                        Principal
                      </span>
                    )}
                    {img.uploading && (
                      <div className="absolute inset-0 bg-[#205134]/70 flex items-center justify-center">
                        <span className="text-white text-xs font-['Nunito_Sans']">Subiendo…</span>
                      </div>
                    )}
                    {img.error && (
                      <div className="absolute bottom-0 inset-x-0 bg-[#E74C3C]/90 p-1">
                        <span className="text-white text-[10px] font-['Nunito_Sans'] block truncate">{img.error}</span>
                      </div>
                    )}
                    {!img.uploading && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white border-0 cursor-pointer text-xs flex items-center justify-center hover:bg-black/80"
                        aria-label="Eliminar imagen"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {images.length === 0 && existingImg && (
              <div className="mt-2.5 flex items-center justify-between p-2.5 rounded-xl border border-[#EDE4D8] bg-[#FAF7F3]">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={existingImg}
                    alt="actual"
                    className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg border border-[#EDE4D8] flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#205134] m-0 font-['Nunito_Sans']">Imagen actual de la experiencia</p>
                    <p className="text-[11px] text-[#9B7D5A] m-0 font-['Nunito_Sans']">Sube imágenes arriba si deseas reemplazarla</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExistingImg('')}
                  className="px-2.5 py-1.5 text-[#9B4728] hover:bg-[#F3ECE2] rounded-lg border border-[#EDE4D8] cursor-pointer text-xs font-bold font-['Nunito_Sans'] flex-shrink-0 transition-colors"
                  title="Quitar imagen actual"
                >
                  ✕ Quitar
                </button>
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Descripción</label>
            <textarea
              value={form.description}
              maxLength={LIMITS.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descripción detallada de la experiencia, recorrido e itinerario..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <label className="flex items-center gap-2 text-[#3D2B1A] text-xs sm:text-sm font-['Nunito_Sans'] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              className="w-4 h-4 rounded text-[#205134] accent-[#205134] cursor-pointer"
            />
            Destacar experiencia
          </label>
        </div>

        {formError && (
          <p role="alert" className="flex-shrink-0 m-0 px-5 sm:px-7 py-2 text-[#C0392B] text-xs sm:text-sm font-bold font-['Nunito_Sans'] bg-[#FEF2F2] border-t border-[#FECACA]">
            {formError}
          </p>
        )}

        {/* ── Footer fijo ── */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-5 sm:px-7 py-3.5 border-t border-[#F0EAE1] bg-[#FAF7F2]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#F3ECE2] text-[#205134] font-bold text-sm sm:text-base border-0 cursor-pointer hover:bg-[#EADBCA] transition-colors font-['Nunito_Sans']"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || images.some(i => i.uploading)}
            className="px-6 py-2.5 rounded-xl bg-[#205134] text-white font-extrabold text-sm sm:text-base border-0 cursor-pointer hover:bg-[#183F28] transition-colors font-['Nunito_Sans'] disabled:opacity-60 shadow-md shadow-[#205134]/20"
          >
            {images.some(i => i.uploading) ? 'Subiendo imágenes…' : saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
