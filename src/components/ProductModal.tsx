import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { MAX_IMAGE_MB, uploadPublicImage, validateImage, type SavedImage } from '../lib/imageUpload'
import { cleanAttributes, draftFromVariants, fetchProductVariants, validateVariantDraft, type VariantAttribute, type VariantDraft, type VariantDraftRow } from '../lib/variants'
import VariantEditor from './VariantEditor'
import { confirmDialog } from './ConfirmDialog'
import { deleteProductImage, removeStoredFiles, uniquePaths } from '../lib/storageCleanup'
import { DEFAULT_UNIT, UNITS, UNIT_GROUPS, normalizeUnit } from '../lib/units'
import { LIMITS, cleanLine, cleanMultiline, integerError, priceError, textError } from '../lib/validation'

/** Producto existente con el que se precarga el formulario (filas de products o vistas de las pantallas) */
export interface ProductInitialData {
  title?: string
  producer?: string
  producer_id?: string | null
  category_id?: string | null
  category?: string
  price?: number | string
  stockNum?: number | string
  stock?: number | string | null
  unit?: string | null
  description?: string | null
  certified?: boolean | null
  img?: string
}

/** Lo que entrega el formulario al guardar */
export interface ProductFormData {
  title: string
  producer: string
  producer_id: string
  category_id: string
  price: string
  stockNum: string
  unit: string
  description: string
  certified: boolean
  img: string
  uploadedImages: SavedImage[]
  /** Atributos y combinaciones; null = producto sin variantes */
  variants: VariantDraft | null
  /** El producto tenía variantes al abrir el formulario (si se quitan, se borran) */
  hadVariants: boolean
  /** Fotos de variantes que ya no se usan: se borran del Storage después de guardar */
  variantImagesToDelete: string[]
}

export interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ProductFormData) => Promise<void>
  initialData?: ProductInitialData
  title?: string
  categories?: { id: string; name: string }[]
  producers?: { id: string; name: string; org_name?: string }[]
  /** Producto que se edita: sus imágenes guardadas cuentan para el límite de 3 */
  productId?: string
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

// Máximo de imágenes por producto (la BD también lo valida)
const MAX_IMAGES = 3

// Imagen ya guardada en public.images
interface SavedImageRow {
  id: string
  storage_path: string
  image_url: string
  is_primary: boolean
  product_id: string | null
  sort_order: number
}

interface UploadedImage {
  file: File
  preview: string
  uploading: boolean
  storagePath?: string
  publicUrl?: string
  error?: string
}

export default function ProductModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  title = 'Nuevo producto',
  categories = [],
  producers,
  productId,
}: ProductModalProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    producer: '',
    producer_id: '',
    category_id: '',
    price: '',
    stockNum: '0',
    unit: DEFAULT_UNIT,
    description: '',
    certified: true,
  })
  const [images, setImages] = useState<UploadedImage[]>([])
  const [existingImg, setExistingImg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [formError, setFormError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Imágenes ya guardadas del producto (se pueden borrar: fila y archivo)
  const [savedImages, setSavedImages] = useState<SavedImageRow[]>([])
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null)
  const savedImagesCount = savedImages.length
  // Fotos de variantes: las guardadas al abrir y todas las subidas en esta edición, para borrar
  // del Storage las que se reemplazan o quitan (al guardar) o las que no se guardaron (al cancelar)
  const loadedVariantPaths = useRef<Set<string>>(new Set())
  const seenVariantPaths = useRef<Set<string>>(new Set())
  // Variantes (sabor, tamaño, talla...) con inventario por combinación
  const [variantsEnabled, setVariantsEnabled] = useState(false)
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([])
  const [variantRows, setVariantRows] = useState<VariantDraftRow[]>([])
  const [hadVariants, setHadVariants] = useState(false)
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [variantsBusy, setVariantsBusy] = useState(false)
  const [variantError, setVariantError] = useState('')

  // Al editar, cargar las variantes guardadas del producto
  useEffect(() => {
    setVariantsEnabled(false)
    setVariantAttributes([])
    setVariantRows([])
    setHadVariants(false)
    setVariantError('')
    setVariantsBusy(false)
    loadedVariantPaths.current = new Set()
    seenVariantPaths.current = new Set()
    if (!isOpen || !productId) return
    let cancelled = false
    setVariantsLoading(true)
    fetchProductVariants(productId).then(({ attributes, variants, storagePaths }) => {
      if (cancelled) return
      setVariantsLoading(false)
      loadedVariantPaths.current = new Set(uniquePaths(Object.values(storagePaths)))
      if (attributes.length === 0) return
      const draft = draftFromVariants(attributes, variants, storagePaths)
      setVariantsEnabled(true)
      setVariantAttributes(draft.attributes)
      setVariantRows(draft.rows)
      setHadVariants(true)
    })
    return () => { cancelled = true }
  }, [isOpen, productId])

  // Al editar, las imágenes que ya tiene guardadas el producto
  const loadSavedImages = (id: string) =>
    supabase
      .from('images')
      .select('id, storage_path, image_url, is_primary, product_id, sort_order')
      .eq('product_id', id)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .then(({ data }) => setSavedImages(data ?? []))

  useEffect(() => {
    if (!isOpen || !productId) {
      setSavedImages([])
      return
    }
    loadSavedImages(productId)
  }, [isOpen, productId])

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const matchedProducerId =
          initialData.producer_id ||
          producers?.find(
            (p) =>
              p.name === initialData.producer ||
              (p.org_name && p.org_name === initialData.producer)
          )?.id ||
          ''
        setForm({
          title: initialData.title || '',
          producer: initialData.producer || (producers?.find((p) => p.id === matchedProducerId)?.name ?? ''),
          producer_id: matchedProducerId,
          category_id: initialData.category_id || initialData.category || '',
          price: initialData.price ? String(initialData.price) : '',
          stockNum: initialData.stockNum ? String(initialData.stockNum).replace(/\D/g, '') : (initialData.stock ? String(initialData.stock).replace(/\D/g, '') : '0'),
          unit: normalizeUnit(initialData.unit),
          description: initialData.description || '',
          certified: initialData.certified ?? true,
        })
        setExistingImg(initialData.img || '')
      } else {
        const defaultCatId = categories.length > 0 ? categories[0].id : ''
        setForm({
          title: '',
          producer: '',
          producer_id: '',
          category_id: defaultCatId,
          price: '',
          stockNum: '10',
          unit: DEFAULT_UNIT,
          description: '',
          certified: true,
        })
        setExistingImg('')
      }
      setImages([])
      setUploadError('')
      setFormError('')
    }
  }, [isOpen, initialData, categories, producers])

  if (!isOpen) return null

  const validateFile = validateImage

  const uploadFile = async (file: File, idx: number) => {
    setImages(prev => prev.map((img, i) => i === idx ? { ...img, uploading: true, error: undefined } : img))
    const result = await uploadPublicImage('product-images', file)
    if (result.error !== undefined) {
      setImages(prev => prev.map((img, i) => i === idx ? { ...img, uploading: false, error: result.error } : img))
      return
    }
    const { storagePath, publicUrl } = result
    setImages(prev => prev.map((img, i) => i === idx ? { ...img, uploading: false, storagePath, publicUrl } : img))
  }

  const remainingSlots = Math.max(MAX_IMAGES - savedImagesCount - images.length, 0)

  const addFiles = (files: FileList | File[]) => {
    setUploadError('')
    // Copiar antes de limpiar el input: limpiarlo vacía la FileList que entrega el navegador
    const arr = Array.from(files)
    // Limpiar permite volver a elegir el mismo archivo después de quitarlo
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (remainingSlots === 0) {
      setUploadError(`Un producto puede tener máximo ${MAX_IMAGES} imágenes.`)
      return
    }
    const valid: UploadedImage[] = []
    for (const file of arr) {
      const err = validateFile(file)
      if (err) { setUploadError(err); continue }
      if (valid.length >= remainingSlots) {
        setUploadError(`Solo se agregaron ${remainingSlots} imagen(es): un producto puede tener máximo ${MAX_IMAGES}.`)
        break
      }
      valid.push({ file, preview: URL.createObjectURL(file), uploading: false })
    }
    if (valid.length === 0) return
    setImages(prev => {
      const baseIdx = prev.length
      valid.forEach((v, i) => { setTimeout(() => uploadFile(v.file, baseIdx + i), 0) })
      return [...prev, ...valid]
    })
  }

  // Imagen subida en esta edición (aún no guardada): se quita y se borra su archivo
  const removeImage = (idx: number) => {
    const removed = images[idx]
    if (removed?.preview) URL.revokeObjectURL(removed.preview)
    if (removed?.storagePath) removeStoredFiles('product-images', [removed.storagePath])
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  // Imagen ya guardada: se borra de la base y del Storage
  const deleteSavedImage = async (image: SavedImageRow) => {
    const confirmed = await confirmDialog({
      title: '¿Eliminar esta imagen?',
      message: 'Se borra del producto y del almacenamiento. No se puede deshacer.',
      confirmText: 'Eliminar',
      tone: 'danger',
    })
    if (!confirmed) return
    setDeletingImageId(image.id)
    const { error } = await deleteProductImage(image)
    setDeletingImageId(null)
    if (error) { setUploadError(error); return }
    if (image.image_url === existingImg) setExistingImg('')
    if (productId) await loadSavedImages(productId)
  }

  const currentVariantPaths = () => (variantsEnabled ? uniquePaths(variantRows.map((r) => r.image_storage_path)) : [])

  // Cancelar: se borran los archivos subidos en esta edición que no se guardaron
  const handleCancel = () => {
    removeStoredFiles('product-images', [
      ...images.map((i) => i.storagePath),
      ...[...seenVariantPaths.current].filter((p) => !loadedVariantPaths.current.has(p)),
    ])
    onClose()
  }

  const handleSave = async () => {
    // Con variantes el precio y el stock van en cada variante; sin ellas son obligatorios los generales
    const title = cleanLine(form.title)
    const description = cleanMultiline(form.description)
    const fieldsError =
      textError('Nombre del producto', title, { max: LIMITS.title, required: true }) ??
      (variantsEnabled ? null : priceError(form.price) ?? integerError(form.stockNum, 'Cantidad en stock')) ??
      textError('Descripción', description, { max: LIMITS.description })
    setFormError(fieldsError ?? '')
    if (fieldsError) return
    if (images.some(i => i.uploading)) { setUploadError('Espera a que terminen de subir las imágenes'); return }
    if (variantsLoading) return
    let variants: VariantDraft | null = null
    if (variantsEnabled) {
      const draft = { attributes: variantAttributes, rows: variantRows }
      const error = variantAttributes.length === 0 ? 'Agrega al menos un atributo o desactiva las variantes.' : validateVariantDraft(draft)
      if (error) { setVariantError(error); return }
      variants = { attributes: cleanAttributes(variantAttributes), rows: variantRows }
    }
    // products.price y products.unit siguen siendo obligatorios: con variantes se guarda el
    // precio más bajo (para «Desde $…») y la unidad por defecto (la medida va en cada variante)
    const price = variants ? String(Math.min(...variants.rows.map((r) => Number(r.price)))) : form.price
    const unit = variants ? DEFAULT_UNIT : form.unit
    // Fotos de variantes que ya no quedan en ninguna variante (reemplazadas o quitadas)
    const keep = new Set(currentVariantPaths())
    const variantImagesToDelete = uniquePaths([...loadedVariantPaths.current, ...seenVariantPaths.current]).filter((p) => !keep.has(p))
    setVariantError('')
    const primaryUploaded = images.find(i => i.publicUrl)
    const imgUrl = primaryUploaded?.publicUrl || existingImg || ''
    setSaving(true)
    await onSave({
      ...form,
      title,
      description,
      stockNum: form.stockNum.trim(),
      price,
      unit,
      img: imgUrl,
      variants,
      hadVariants,
      variantImagesToDelete,
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
            onClick={handleCancel}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#F3ECE2] text-[#9B4728] hover:bg-[#EADDCB] transition-colors flex items-center justify-center text-base sm:text-lg border-0 cursor-pointer shrink-0 font-bold"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* ── Cuerpo scrolleable ── */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-4 sm:py-5 space-y-4">
          <div>
            <label style={labelStyle}>Nombre del producto</label>
            <input
              value={form.title}
              maxLength={LIMITS.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ej: Café Especial Nariño"
              style={inputStyle}
            />
          </div>

          {producers && producers.length > 0 && (
            <div>
              <label style={labelStyle}>Productor / Asociación</label>
              <select
                value={form.producer_id}
                onChange={(e) => {
                  const selId = e.target.value
                  const found = producers.find((p) => p.id === selId)
                  setForm({
                    ...form,
                    producer_id: selId,
                    producer: found ? found.name : '',
                  })
                }}
                style={inputStyle}
              >
                <option value="">Seleccionar productor o asociación...</option>
                {producers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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
              <label style={labelStyle}>Precio ($ COP)</label>
              {variantsEnabled ? (
                <div style={{ ...inputStyle, background: '#FAF7F3', color: '#9B7D5A', fontSize: 12 }}>
                  Se define en cada variante
                </div>
              ) : (
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="28000"
                  style={inputStyle}
                />
              )}
            </div>
          </div>

          <div className="modal-grid-2">
            <div className="min-w-0">
              <label style={labelStyle}>Cantidad en Stock</label>
              {variantsEnabled ? (
                <div style={{ ...inputStyle, background: '#FAF7F3', color: '#9B7D5A', fontSize: 12 }}>
                  Se define en cada variante
                </div>
              ) : (
                <input
                  type="number"
                  value={form.stockNum}
                  onChange={(e) => setForm({ ...form, stockNum: e.target.value })}
                  placeholder="45"
                  style={inputStyle}
                />
              )}
            </div>
            <div className="min-w-0">
              <label style={labelStyle}>Unidad de medida</label>
              {variantsEnabled ? (
                <div style={{ ...inputStyle, background: '#FAF7F3', color: '#9B7D5A', fontSize: 12 }}>
                  Se define en cada variante
                </div>
              ) : (
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                style={inputStyle}
              >
                {UNIT_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {UNITS.filter((u) => u.group === group).map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </optgroup>
                ))}
                {/* Unidad guardada antes que no está en la lista: se conserva */}
                {!UNITS.some((u) => u.value === form.unit) && <option value={form.unit}>{form.unit}</option>}
              </select>
              )}
            </div>
          </div>

          {/* ── Variantes ── */}
          <div className="rounded-2xl border border-[#EDE4D8] p-3 sm:p-4">
            <label className="flex items-start gap-2 text-[#3D2B1A] text-xs sm:text-sm font-['Nunito_Sans'] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={variantsEnabled}
                disabled={variantsLoading}
                onChange={(e) => {
                  setVariantError('')
                  setVariantsEnabled(e.target.checked)
                  if (e.target.checked && variantAttributes.length === 0) setVariantAttributes([{ name: 'Sabor', options: [] }])
                }}
                className="w-4 h-4 mt-0.5 rounded accent-[#205134] cursor-pointer"
              />
              <span>
                <strong className="text-[#205134]">Este producto tiene variantes</strong>
                <span className="block text-[11px] text-[#9B7D5A]">
                  {variantsLoading
                    ? 'Cargando variantes…'
                    : 'Sabor, tamaño, peso, volumen, presentación, talla, color, material… Cada combinación tiene su propio inventario y, si quieres, su precio y su foto.'}
                </span>
              </span>
            </label>
            {variantsEnabled && (
              <div className="mt-3">
                <VariantEditor
                  attributes={variantAttributes}
                  rows={variantRows}
                  onBusyChange={setVariantsBusy}
                  onChange={(attributes, rows) => {
                    for (const r of rows) if (r.image_storage_path) seenVariantPaths.current.add(r.image_storage_path)
                    setVariantAttributes(attributes)
                    setVariantRows(rows)
                    setVariantError('')
                  }}
                />
              </div>
            )}
            {!variantsEnabled && hadVariants && (
              <p className="text-[11px] text-[#9B4728] mt-2 mb-0 font-['Nunito_Sans']">
                Al guardar se eliminarán las variantes y el producto usará la cantidad en stock de arriba.
              </p>
            )}
            {variantError && (
              <p className="text-[#C0392B] text-xs mt-2 mb-0 font-['Nunito_Sans']">{variantError}</p>
            )}
          </div>

          {/* ── Subida de imágenes ── */}
          <div>
            <label style={labelStyle}>
              Imágenes del producto{' '}
              <span className="text-[#9B7D5A] font-normal text-xs">(JPG / PNG · máx. {MAX_IMAGES} de {MAX_IMAGE_MB} MB c/u)</span>
            </label>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
              onClick={() => remainingSlots > 0 ? fileInputRef.current?.click() : setUploadError(`Un producto puede tener máximo ${MAX_IMAGES} imágenes.`)}
              className="w-full box-border rounded-xl p-3.5 sm:p-4 text-center cursor-pointer transition-all border-2 border-dashed"
              style={{
                borderColor: dragOver ? '#205134' : '#C8B9A8',
                background: dragOver ? '#EAF3EC' : '#FAF7F3',
              }}
            >
              <div className="text-2xl mb-1">📷</div>
              <p className="m-0 text-xs sm:text-[13px] text-[#7A6A5A] font-['Nunito_Sans']">
                Arrastra imágenes aquí o{' '}
                <span className="text-[#205134] font-bold">haz clic para seleccionar</span>
              </p>
              <p className="mt-0.5 mb-0 text-[11px] text-[#B0A090] font-['Nunito_Sans']">
                {remainingSlots > 0
                  ? `JPG, PNG · máx. ${MAX_IMAGE_MB} MB por imagen · puedes agregar ${remainingSlots} más`
                  : `Ya tiene el máximo de ${MAX_IMAGES} imágenes`}
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

            {/* Imágenes guardadas: se pueden eliminar (también del almacenamiento) */}
            {savedImages.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-bold text-[#205134] mb-1.5 mt-0 font-['Nunito_Sans']">Imágenes guardadas</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {savedImages.map((img) => (
                    <div key={img.id} className="relative rounded-xl overflow-hidden border-2 border-[#EDE4D8] h-20 sm:h-22">
                      <img src={img.image_url} alt="" className="w-full h-full object-cover block" />
                      {img.is_primary && (
                        <span className="absolute top-1 left-1 bg-[#CF9D35] text-white text-[9px] sm:text-[10px] py-0.5 px-1.5 rounded font-bold font-['Nunito_Sans']">
                          Principal
                        </span>
                      )}
                      {deletingImageId === img.id ? (
                        <div className="absolute inset-0 bg-[#9B4728]/70 flex items-center justify-center">
                          <span className="text-white text-xs font-['Nunito_Sans']">Eliminando…</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => deleteSavedImage(img)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white border-0 cursor-pointer text-xs flex items-center justify-center hover:bg-black/80"
                          aria-label="Eliminar imagen guardada"
                          title="Eliminar imagen"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {images.length === 0 && savedImages.length === 0 && existingImg && (
              <div className="mt-2.5 flex items-center justify-between p-2.5 rounded-xl border border-[#EDE4D8] bg-[#FAF7F3]">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={existingImg}
                    alt="actual"
                    className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg border border-[#EDE4D8] flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#205134] m-0 font-['Nunito_Sans']">Imagen actual del producto</p>
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
              placeholder="Descripción detallada del producto, origen y proceso..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <label className="flex items-center gap-2 text-[#3D2B1A] text-xs sm:text-sm font-['Nunito_Sans'] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.certified}
              onChange={(e) => setForm({ ...form, certified: e.target.checked })}
              className="w-4 h-4 rounded text-[#205134] accent-[#205134] cursor-pointer"
            />
            Producto certificado orgánico o de calidad
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
            onClick={handleCancel}
            className="px-5 py-2.5 rounded-xl bg-[#F3ECE2] text-[#205134] font-bold text-sm sm:text-base border-0 cursor-pointer hover:bg-[#EADBCA] transition-colors font-['Nunito_Sans']"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || images.some(i => i.uploading) || variantsBusy || variantsLoading}
            className="px-6 py-2.5 rounded-xl bg-[#205134] text-white font-extrabold text-sm sm:text-base border-0 cursor-pointer hover:bg-[#183F28] transition-colors font-['Nunito_Sans'] disabled:opacity-60 shadow-md shadow-[#205134]/20"
          >
            {images.some(i => i.uploading) || variantsBusy ? 'Subiendo imágenes…' : saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
