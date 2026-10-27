// Validación de lo que escriben los usuarios en los formularios.
// La base aplica las mismas reglas (CHECK y triggers de 20261027120000_inputs_y_sesiones.sql):
// aquí solo se avisa antes de enviar, con un mensaje claro.

export const LIMITS = {
  personName: 100,
  orgName: 200,
  place: 100,
  address: 200,
  deliveryNotes: 500,
  title: 200,
  description: 5000,
  ticketSubject: 200,
  ticketDescription: 5000,
  review: 2000,
  shortText: 60,
  tags: 20,
  email: 254,
} as const

// Controles (salvo salto de línea y tabulador) y caracteres invisibles: marcas de dirección
// (permiten disfrazar un nombre invirtiendo el texto), espacios de ancho cero y BOM.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** Texto de una línea: sin caracteres invisibles ni de control y con los espacios colapsados */
export function cleanLine(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFC')
    .replace(INVISIBLE_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texto de varias líneas (descripciones, reseñas): igual que cleanLine pero conserva los saltos de línea */
export function cleanMultiline(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFC')
    .replace(INVISIBLE_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Texto ya limpio: obligatorio, largo máximo y sin < > (no son necesarios y evitan HTML en correos o mensajes) */
export function textError(label: string, value: string, opts: { max: number; required?: boolean }): string | null {
  if (!value) return opts.required ? `Completa el campo «${label}».` : null
  if (value.length > opts.max) return `«${label}» admite máximo ${opts.max} caracteres.`
  if (/[<>]/.test(value)) return `«${label}» no puede contener los caracteres < o >.`
  return null
}

// Letras (con tildes), espacios, punto, apóstrofo y guion: "María José", "O'Neil", "Ana-María"
const PERSON_NAME = /^\p{L}[\p{L}\p{M} .'’-]*$/u

/** Nombre o apellido de una persona (ya limpio) */
export function personNameError(label: string, value: string, required = true): string | null {
  const base = textError(label, value, { max: LIMITS.personName, required })
  if (base || !value) return base
  return PERSON_NAME.test(value) ? null : `«${label}» solo puede tener letras, espacios, puntos, apóstrofos o guiones.`
}

/** Nombre de una organización o asociación (ya limpio): admite números y signos comunes */
export function orgNameError(value: string, required = false): string | null {
  const base = textError('Organización', value, { max: LIMITS.orgName, required })
  if (base || !value) return base
  return /\p{L}/u.test(value) ? null : 'El nombre de la organización debe tener letras.'
}

/** Celular o fijo de Colombia: 10 dígitos que empiezan por 3 (celular) o 60 (fijo) */
export function phoneError(digits: string, required = false, label = 'WhatsApp'): string | null {
  if (!digits) return required ? `Completa el campo «${label}».` : null
  return /^(3\d{9}|60\d{8})$/.test(digits) ? null : `«${label}» debe tener 10 dígitos (ej: 3001234567).`
}

export function isValidEmail(value: string): boolean {
  return value.length <= LIMITS.email && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(value)
}

/** Precio en pesos: entero o con hasta 2 decimales, mayor que 0 y hasta 100 millones */
export function priceError(value: string, label = 'Precio'): string | null {
  const v = value.trim()
  if (!v) return `Completa el campo «${label}».`
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v) || Number(v) <= 0 || Number(v) > 100_000_000) {
    return `«${label}» debe ser un número mayor que 0 (máximo 100.000.000).`
  }
  return null
}

/** Cantidad entera (stock, cupos) entre min y max */
export function integerError(value: string, label: string, min = 0, max = 1_000_000): string | null {
  const v = value.trim()
  if (!/^\d{1,7}$/.test(v) || Number(v) < min || Number(v) > max) {
    return `«${label}» debe ser un número entero entre ${min} y ${max.toLocaleString('es-CO')}.`
  }
  return null
}

/** Etiquetas separadas por comas → lista limpia, sin repetidas */
export function parseTags(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(',')
    .map((t) => cleanLine(t))
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
}

export function tagsError(tags: string[]): string | null {
  if (tags.length > LIMITS.tags) return `Máximo ${LIMITS.tags} etiquetas.`
  const long = tags.find((t) => t.length > 40)
  if (long) return `La etiqueta «${long.slice(0, 20)}…» es muy larga (máximo 40 caracteres).`
  if (tags.some((t) => /[<>]/.test(t))) return 'Las etiquetas no pueden contener los caracteres < o >.'
  return null
}

/** Datos personales de un perfil (ya limpios). Devuelve el primer error o null. */
export function profileFieldsError(p: {
  first_name: string
  last_name: string
  org_name?: string | null
  phone?: string | null
  address?: string | null
}, opts: { requireLastName?: boolean } = {}): string | null {
  return (
    personNameError('Nombre', p.first_name) ??
    personNameError('Apellido', p.last_name, opts.requireLastName ?? false) ??
    (p.org_name != null ? orgNameError(p.org_name) : null) ??
    (p.phone != null ? phoneError(p.phone) : null) ??
    (p.address != null ? textError('Dirección', p.address, { max: LIMITS.address }) : null)
  )
}

/** Datos de entrega del checkout (create_store_order los guarda en orders.shipping_address) */
// type (no interface) para que sea asignable a Json en la llamada RPC
export type ShippingInput = {
  fullName: string
  phone: string
  department: string
  municipality: string
  address: string
  deliveryNotes: string
}

export function cleanShipping(s: ShippingInput): ShippingInput {
  return {
    fullName: cleanLine(s.fullName),
    phone: s.phone.replace(/\D/g, ''),
    department: cleanLine(s.department),
    municipality: cleanLine(s.municipality),
    address: cleanLine(s.address),
    deliveryNotes: cleanMultiline(s.deliveryNotes),
  }
}

/** Datos de entrega ya limpios (cleanShipping) */
export function shippingError(s: ShippingInput): string | null {
  return (
    textError('Nombre completo', s.fullName, { max: LIMITS.orgName, required: true }) ??
    phoneError(s.phone, true, 'Teléfono celular') ??
    textError('Departamento', s.department, { max: LIMITS.place, required: true }) ??
    textError('Municipio / Ciudad', s.municipality, { max: LIMITS.place, required: true }) ??
    textError('Dirección de entrega', s.address, { max: LIMITS.address, required: true }) ??
    textError('Notas', s.deliveryNotes, { max: LIMITS.deliveryNotes })
  )
}
