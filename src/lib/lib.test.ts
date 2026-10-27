import { describe, expect, it, vi } from 'vitest'

// Los módulos de lib importan el cliente de Supabase; en pruebas no se conecta a nada
vi.mock('./supabase', () => ({ supabase: {} }))

import { onlyPhoneDigits } from './phone'
import { fromColombiaInputToISO, isAdvertisementActive, isDateRangeActiveInColombia, toColombiaInputString } from './dateColombia'
import { getNextStatuses, summarizeStatusesByItem, type OrderItemRow, type OrderStatus, type OrderStatusTransition } from './orders'
import { validationState, validateDocFile, type ProducerDocument } from './producerDocuments'
import { MAX_IMAGE_BYTES, validateImage } from './imageUpload'
import { TABS, isTab } from './types'
import { isKnownPath, pathForTab, routeFromPath } from './routes'
import { documentColumns, normalizeDocumentNumber, validateDocument, validateOptionalDocument } from './identity'
import { DEPARTMENTS, findDepartment, findMunicipality, municipalitiesOf } from './geo'
import { cartItemKey, cartItemPrice, type Product } from './catalog'
import { orderItemName } from './orders'
import {
  autoSelect,
  availableStock,
  duplicateAttributeNames,
  isMeasureAttribute,
  cartLineKey,
  cartesian,
  draftAttributes,
  draftFromVariants,
  findVariant,
  normalizeVariants,
  offeredOptions,
  optionStates,
  parseCartLineKey,
  priceRange,
  selectOption,
  validateVariantDraft,
  variantDraftPayload,
  variantLabel,
  type ProductVariant,
  type VariantAttribute,
} from './variants'
import { DEFAULT_UNIT, UNITS, formatMeasure, isMeasureAmount, normalizeUnit, parseOptionInput } from './units'
import { findOrphans, uniquePaths, type StoredFile } from './storageCleanup'
import {
  cleanLine,
  cleanMultiline,
  cleanShipping,
  integerError,
  isValidEmail,
  orgNameError,
  parseTags,
  personNameError,
  phoneError,
  priceError,
  profileFieldsError,
  shippingError,
  tagsError,
  textError,
} from './validation'
import { addableRoles, resolveActiveRole, resolveRoles, roleRequirementsError, rolesForUserType, sellerRole } from './roles'

const fakeFile = (type: string, size: number, name = 'archivo') => ({ type, size, name }) as File

describe('phone', () => {
  it('deja solo dígitos y máximo 10', () => {
    expect(onlyPhoneDigits('+57 (300) 123-4567')).toBe('5730012345')
    expect(onlyPhoneDigits('300 123 4567')).toBe('3001234567')
    expect(onlyPhoneDigits('abc')).toBe('')
  })
})

describe('dateColombia', () => {
  it('convierte UTC a hora de Colombia (UTC-5) para datetime-local', () => {
    expect(toColombiaInputString('2026-10-18T15:30:00Z')).toBe('2026-10-18T10:30')
    expect(toColombiaInputString('2026-10-18T03:00:00Z')).toBe('2026-10-17T22:00')
    expect(toColombiaInputString(null)).toBe('')
    expect(toColombiaInputString('no es fecha')).toBe('')
  })

  it('agrega el offset de Colombia al guardar', () => {
    expect(fromColombiaInputToISO('2026-10-18T10:30')).toBe('2026-10-18T10:30:00-05:00')
  })

  it('evalúa la vigencia de un rango', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(isDateRangeActiveInColombia(past, future)).toBe(true)
    expect(isDateRangeActiveInColombia(future, null)).toBe(false)
    expect(isDateRangeActiveInColombia(null, past)).toBe(false)
    expect(isAdvertisementActive({ active: false, starts_at: past, ends_at: future })).toBe(false)
    expect(isAdvertisementActive({ active: true, starts_at: past, ends_at: future })).toBe(true)
  })
})

describe('orders', () => {
  const statuses: OrderStatus[] = [
    { id: 1, code: 'PendingPayment', name: 'Pendiente de pago' },
    { id: 2, code: 'Paid', name: 'Pagado' },
    { id: 3, code: 'Processing', name: 'En preparación' },
    { id: 4, code: 'Cancelled', name: 'Cancelado' },
  ] as OrderStatus[]

  const transitions: OrderStatusTransition[] = [
    { store: 'campo', from_status_id: 1, to_status_id: 4, sort_order: 1, suggested_for: [] },
    { store: 'campo', from_status_id: 1, to_status_id: 2, sort_order: 2, suggested_for: ['BankTransfer'] },
    { store: 'campo', from_status_id: 1, to_status_id: 3, sort_order: 3, suggested_for: ['CashOnDelivery'] },
    { store: 'amazonica', from_status_id: 1, to_status_id: 2, sort_order: 1, suggested_for: [] },
  ]

  it('ordena los siguientes estados con el sugerido primero y filtra por tienda', () => {
    const next = getNextStatuses(1, 'BankTransfer', transitions, statuses, 'campo')
    expect(next.map((n) => n.status.code)).toEqual(['Paid', 'Cancelled', 'Processing'])
    expect(next[0].suggested).toBe(true)
    expect(getNextStatuses(1, undefined, transitions, statuses, 'amazonica')).toHaveLength(1)
  })

  it('resume cantidades por producto y estado', () => {
    const items = [
      { product_id: 'p1', experience_id: null, status_id: 1, quantity: 2 },
      { product_id: 'p1', experience_id: null, status_id: 1, quantity: 3 },
      { product_id: null, experience_id: 'e1', status_id: 2, quantity: 1 },
      { product_id: null, experience_id: null, status_id: 2, quantity: 9 },
    ] as OrderItemRow[]
    const summary = summarizeStatusesByItem(items, statuses)
    expect(summary.p1).toEqual([{ status: statuses[0], count: 5 }])
    expect(summary.e1[0].count).toBe(1)
    expect(Object.keys(summary)).toHaveLength(2)
  })
})

describe('producerDocuments', () => {
  const doc = (doc_type: ProducerDocument['doc_type'], status: ProducerDocument['status']) => ({ doc_type, status }) as ProducerDocument

  it('solo exige el RUT aprobado; la Cámara de Comercio es opcional', () => {
    expect(validationState([doc('rut', 'aprobado')])).toBe('validado')
    expect(validationState([doc('rut', 'aprobado'), doc('camara_comercio', 'rechazado')])).toBe('validado')
    expect(validationState([doc('rut', 'aprobado'), doc('camara_comercio', 'pendiente')])).toBe('validado')
    expect(validationState([doc('camara_comercio', 'aprobado')])).toBe('incompleto')
    expect(validationState([doc('rut', 'rechazado'), doc('camara_comercio', 'aprobado')])).toBe('rechazado')
    expect(validationState([doc('rut', 'pendiente'), doc('camara_comercio', 'aprobado')])).toBe('pendiente')
  })

  it('valida tipo y tamaño del archivo', () => {
    expect(validateDocFile(fakeFile('application/pdf', 1000))).toBeNull()
    expect(validateDocFile(fakeFile('application/zip', 1000))).not.toBeNull()
    expect(validateDocFile(fakeFile('application/pdf', 6 * 1024 * 1024))).not.toBeNull()
  })
})

describe('imageUpload', () => {
  it('acepta JPG/PNG dentro del límite del bucket', () => {
    expect(validateImage(fakeFile('image/png', 1000))).toBeNull()
    expect(validateImage(fakeFile('image/webp', 1000))).toBe('Solo se permiten JPG y PNG')
    expect(validateImage(fakeFile('image/jpeg', MAX_IMAGE_BYTES + 1, 'foto.jpg'))).toContain('foto.jpg')
  })
})

describe('routes', () => {
  // Tiendas como vienen de store_settings (una aliada nueva no necesita código)
  const stores = [
    { store: 'campo', slug: null },
    { store: 'amazonica', slug: 'tienda-amazonica' },
    { store: 'licores', slug: 'tienda-licores' },
  ]

  it('ida y vuelta entre pestaña y ruta en la tienda principal', () => {
    for (const tab of TABS.filter((t) => t !== 'store')) {
      expect(routeFromPath(pathForTab(tab, 'campo', stores), stores)).toEqual({ tab, store: 'campo' })
    }
  })

  it('cada tienda aliada tiene su vitrina y sus páginas bajo /<slug>', () => {
    expect(pathForTab('store', 'licores', stores)).toBe('/tienda-licores')
    expect(pathForTab('home', 'amazonica', stores)).toBe('/tienda-amazonica')
    expect(pathForTab('profile', 'licores', stores)).toBe('/tienda-licores/mi-cuenta')
    expect(routeFromPath('/tienda-licores', stores)).toEqual({ tab: 'store', store: 'licores' })
    expect(routeFromPath('/tienda-licores/mi-cuenta', stores)).toEqual({ tab: 'profile', store: 'licores' })
    expect(routeFromPath('/tienda-amazonica/panel', stores)).toEqual({ tab: 'admin', store: 'amazonica' })
  })

  it('rutas desconocidas o con barra final', () => {
    expect(routeFromPath('/no-existe', stores)).toEqual({ tab: 'home', store: 'campo' })
    expect(routeFromPath('/productos/', stores)).toEqual({ tab: 'market', store: 'campo' })
    expect(routeFromPath('/tienda-amazonica/no-existe', stores)).toEqual({ tab: 'store', store: 'amazonica' })
    // Tienda que no existe (o se desactivó): inicio de la principal
    expect(routeFromPath('/tienda-cerrada', stores)).toEqual({ tab: 'home', store: 'campo' })
  })
})

describe('identity', () => {
  it('normaliza y valida según el tipo de documento', () => {
    expect(normalizeDocumentNumber(' 1.023.456 789 ')).toBe('1023456789')
    expect(validateDocument('CC', '1.023.456.789')).toBeNull()
    expect(validateDocument('CC', '12AB')).not.toBeNull()
    expect(validateDocument('NIT', '900123456-7')).toBeNull()
    expect(validateDocument('PAS', 'ab12345')).toBeNull()
    expect(validateDocument('', '123456')).toBe('Selecciona el tipo de documento.')
    expect(validateDocument('CC', '')).toBe('Ingresa el número de documento.')
  })

  it('al editar a otro usuario el documento puede quedar vacío', () => {
    expect(validateOptionalDocument('', '')).toBeNull()
    expect(validateOptionalDocument('CC', '')).not.toBeNull()
    expect(documentColumns('', '')).toEqual({ document_type: null, document_number: null })
    expect(documentColumns('CE', 'x-12 34')).toEqual({ document_type: 'CE', document_number: 'X-1234' })
  })
})

describe('geo', () => {
  it('lista los 33 departamentos y sus municipios', () => {
    expect(DEPARTMENTS).toHaveLength(33)
    expect(municipalitiesOf('Antioquia').some((m) => m.name === 'Medellín')).toBe(true)
    expect(municipalitiesOf('No existe')).toEqual([])
  })

  it('Bogotá D.C. usa su capital como único municipio', () => {
    expect(municipalitiesOf('Bogotá D.C.')).toEqual([{ code: '11001', name: 'Bogotá' }])
  })

  it('reconoce nombres guardados con otra escritura', () => {
    expect(findDepartment('bogota, d.c.')?.name).toBe('Bogotá D.C.')
    expect(findDepartment('CAQUETA')?.name).toBe('Caquetá')
    expect(findMunicipality('Caquetá', 'florencia')?.name).toBe('Florencia')
  })
})

describe('types', () => {
  it('reconoce pestañas válidas que llegan como texto', () => {
    expect(isTab('market')).toBe(true)
    expect(isTab('javascript:alert(1)')).toBe(false)
    expect(isTab(null)).toBe(false)
  })
})

describe('roles', () => {
  it('Asociación y Turismo incluyen siempre el rol Comprador', () => {
    expect(rolesForUserType('asociacion')).toEqual(['asociacion', 'comprador'])
    expect(rolesForUserType('turismo')).toEqual(['turismo', 'comprador'])
    expect(rolesForUserType('comprador')).toEqual(['comprador'])
    expect(rolesForUserType('admin')).toEqual(['admin'])
    expect(rolesForUserType(undefined)).toEqual([])
  })

  it('une los roles de la base con los del rol principal, sin duplicados ni valores inválidos', () => {
    expect(resolveRoles('asociacion', [{ role: 'comprador' }, { role: 'asociacion' }])).toEqual(['asociacion', 'comprador'])
    // Sin la tabla profile_roles (migración pendiente) se derivan del rol principal
    expect(resolveRoles('turismo', null)).toEqual(['turismo', 'comprador'])
    expect(resolveRoles('comprador', [{ role: 'superusuario' }])).toEqual(['comprador'])
  })

  it('solo una cuenta que es únicamente Comprador puede agregar Asociación o Turismo', () => {
    expect(addableRoles(['comprador'])).toEqual(['asociacion', 'turismo'])
    expect(addableRoles(['asociacion', 'comprador'])).toEqual([])
    expect(addableRoles(['turismo', 'comprador'])).toEqual([])
    expect(addableRoles(['admin'])).toEqual([])
    expect(addableRoles([])).toEqual([])
  })

  it('identifica el rol de vendedor de la cuenta', () => {
    expect(sellerRole(['asociacion', 'comprador'])).toBe('asociacion')
    expect(sellerRole(['turismo', 'comprador'])).toBe('turismo')
    expect(sellerRole(['comprador'])).toBeUndefined()
  })

  it('el rol activo guardado solo se usa si la cuenta aún lo tiene', () => {
    expect(resolveActiveRole('asociacion', ['asociacion', 'comprador'], 'comprador')).toBe('comprador')
    expect(resolveActiveRole('asociacion', ['asociacion', 'comprador'], null)).toBe('asociacion')
    // Un rol que la cuenta no tiene (o un valor manipulado) no da acceso
    expect(resolveActiveRole('comprador', ['comprador'], 'admin')).toBe('comprador')
    expect(resolveActiveRole('comprador', ['comprador'], 'asociacion')).toBe('comprador')
  })

  it('exige nombre, documento y ubicación para agregar un rol', () => {
    const complete = { first_name: 'Ana', document_type: 'CC', document_number: '1234567890', department: 'Caquetá', municipality: 'Florencia' }
    expect(roleRequirementsError(complete)).toBeNull()
    expect(roleRequirementsError({ ...complete, first_name: ' ' })).not.toBeNull()
    expect(roleRequirementsError({ ...complete, document_number: null })).not.toBeNull()
    expect(roleRequirementsError({ ...complete, municipality: '' })).not.toBeNull()
  })
})

describe('verificación del productor', () => {
  const doc = (doc_type: 'rut' | 'camara_comercio', status: 'pendiente' | 'aprobado' | 'rechazado') =>
    ({ id: doc_type, producer_id: 'p1', doc_type, status }) as ProducerDocument

  it('la verificación manual del superadmin valida aunque no haya documentos', () => {
    expect(validationState([], true)).toBe('validado')
    expect(validationState([doc('rut', 'rechazado')], true)).toBe('validado')
  })

  it('sin verificación manual sigue siendo obligatorio el RUT', () => {
    expect(validationState([])).toBe('incompleto')
    expect(validationState([doc('rut', 'aprobado')])).toBe('validado')
  })
})

// ─── Variantes de producto ───────────────────────────────────────────────────
// Ejemplo: yogur con 4 sabores y 3 presentaciones, cada combinación con su stock
const yogurAttrs: VariantAttribute[] = [
  { name: 'Sabor', options: ['Fresa', 'Mora', 'Vainilla', 'Natural'] },
  { name: 'Presentación', options: ['250 ml', '500 ml', '1 L'] },
]
const variant = (id: string, sabor: string, pres: string, stock: number, extra: Partial<ProductVariant> = {}): ProductVariant => ({
  id,
  options: { Sabor: sabor, Presentación: pres },
  stock,
  price: null,
  image_url: null,
  active: true,
  ...extra,
})
const yogurVariants: ProductVariant[] = [
  variant('f250', 'Fresa', '250 ml', 5),
  variant('f500', 'Fresa', '500 ml', 3),
  variant('f1', 'Fresa', '1 L', 0, { price: 12000 }),
  variant('m250', 'Mora', '250 ml', 0),
  variant('m500', 'Mora', '500 ml', 0),
  variant('v1', 'Vainilla', '1 L', 4, { image_url: 'vainilla.jpg' }),
  // Natural no se ofrece (inactiva)
  variant('n250', 'Natural', '250 ml', 9, { active: false }),
]

describe('variantes: selección en el detalle', () => {
  it('cartesian genera todas las combinaciones en orden', () => {
    const combos = cartesian(yogurAttrs)
    expect(combos).toHaveLength(12)
    expect(combos[0]).toEqual({ Sabor: 'Fresa', Presentación: '250 ml' })
    expect(combos[11]).toEqual({ Sabor: 'Natural', Presentación: '1 L' })
    expect(cartesian([])).toEqual([{}])
  })

  it('optionStates: oculta lo no ofrecido y marca agotado lo que no tiene stock', () => {
    const sabores = optionStates(yogurAttrs, yogurVariants, {}, 'Sabor')
    expect(sabores).toEqual({ Fresa: 'available', Mora: 'soldout', Vainilla: 'available', Natural: 'unavailable' })
    // Con Fresa elegida, 1 L existe pero está agotada y no afecta a las demás
    const pres = optionStates(yogurAttrs, yogurVariants, { Sabor: 'Fresa' }, 'Presentación')
    expect(pres).toEqual({ '250 ml': 'available', '500 ml': 'available', '1 L': 'soldout' })
    // Con 1 L elegido, solo Fresa (agotada) y Vainilla se ofrecen
    const conLitro = optionStates(yogurAttrs, yogurVariants, { Presentación: '1 L' }, 'Sabor')
    expect(conLitro).toEqual({ Fresa: 'soldout', Mora: 'unavailable', Vainilla: 'available', Natural: 'unavailable' })
  })

  it('findVariant exige todos los atributos y solo devuelve combinaciones ofrecidas', () => {
    expect(findVariant(yogurAttrs, yogurVariants, { Sabor: 'Fresa' })).toBeNull()
    expect(findVariant(yogurAttrs, yogurVariants, { Sabor: 'Fresa', Presentación: '1 L' })?.id).toBe('f1')
    expect(findVariant(yogurAttrs, yogurVariants, { Sabor: 'Natural', Presentación: '250 ml' })).toBeNull()
  })

  it('selectOption no completa solo, permite quitar y descarta lo que deja de existir', () => {
    // Vainilla solo existe en 1 L, pero no se elige sola
    expect(selectOption(yogurAttrs, yogurVariants, {}, 'Sabor', 'Vainilla')).toEqual({ Sabor: 'Vainilla' })
    // Tocar de nuevo la opción elegida la quita
    expect(selectOption(yogurAttrs, yogurVariants, { Sabor: 'Fresa', Presentación: '250 ml' }, 'Sabor', 'Fresa')).toEqual({
      Presentación: '250 ml',
    })
    // Fresa 250 ml → Vainilla: 250 ml no existe para Vainilla y se descarta
    expect(selectOption(yogurAttrs, yogurVariants, { Sabor: 'Fresa', Presentación: '250 ml' }, 'Sabor', 'Vainilla')).toEqual({
      Sabor: 'Vainilla',
    })
    // Mora 500 ml → 1 L (no existe para Mora): se descarta el sabor
    expect(selectOption(yogurAttrs, yogurVariants, { Sabor: 'Mora', Presentación: '500 ml' }, 'Presentación', '1 L')).toEqual({
      Presentación: '1 L',
    })
  })

  it('autoSelect elige los atributos con una sola opción ofrecida', () => {
    const attrs: VariantAttribute[] = [
      { name: 'Talla', options: ['S', 'M'] },
      { name: 'Color', options: ['Rojo'] },
    ]
    const vars: ProductVariant[] = [
      { id: 'a', options: { Talla: 'S', Color: 'Rojo' }, stock: 1, price: null, image_url: null, active: true },
      { id: 'b', options: { Talla: 'M', Color: 'Rojo' }, stock: 0, price: null, image_url: null, active: true },
    ]
    expect(autoSelect(attrs, vars, {})).toEqual({ Color: 'Rojo' })
  })

  it('precio y etiqueta de la combinación', () => {
    expect(priceRange(8000, yogurVariants)).toEqual({ min: 8000, max: 12000 })
    expect(priceRange(8000, [])).toEqual({ min: 8000, max: 8000 })
    expect(variantLabel({ Presentación: '1 L', Sabor: 'Fresa' }, yogurAttrs)).toBe('Sabor: Fresa · Presentación: 1 L')
  })

  it('normalizeVariants ordena por posición y lee las opciones de jsonb', () => {
    const { attributes, variants } = normalizeVariants(
      [
        { name: 'Presentación', options: ['1 L'], position: 1 },
        { name: 'Sabor', options: ['Fresa'], position: 0 },
      ],
      [
        { id: 'b', options: { Sabor: 'Fresa', Presentación: '1 L' }, stock: 2, price: 9000, image_url: null, active: true, position: 1 },
        { id: 'a', options: ['no es objeto'], stock: 1, price: null, image_url: null, active: true, position: 0 },
      ]
    )
    expect(attributes.map((a) => a.name)).toEqual(['Sabor', 'Presentación'])
    expect(variants.map((v) => v.id)).toEqual(['a', 'b'])
    expect(variants[0].options).toEqual({})
    expect(variants[1].price).toBe(9000)
  })
})

describe('variantes: cervezas (el comprador cambia de opinión)', () => {
  const attrs: VariantAttribute[] = [
    { name: 'Color', options: ['Negra', 'Roja', 'Dorada'] },
    { name: 'Presentación', options: ['250 ml', '500 ml'] },
  ]
  const beer = (id: string, color: string, pres: string): ProductVariant => ({
    id,
    options: { Color: color, Presentación: pres },
    stock: 5,
    price: null,
    image_url: null,
    active: true,
  })
  const vars = [beer('n', 'Negra', '250 ml'), beer('r', 'Roja', '250 ml'), beer('d', 'Dorada', '250 ml'), beer('d5', 'Dorada', '500 ml')]

  it('elegir Negra no fija 250 ml y se puede pasar a Dorada', () => {
    let sel = selectOption(attrs, vars, {}, 'Color', 'Negra')
    expect(sel).toEqual({ Color: 'Negra' })
    sel = selectOption(attrs, vars, sel, 'Color', 'Dorada')
    expect(sel).toEqual({ Color: 'Dorada' })
  })

  it('con 500 ml las demás se muestran como no compatibles y al tocarlas se cambia la selección', () => {
    let sel = selectOption(attrs, vars, {}, 'Presentación', '500 ml')
    expect(sel).toEqual({ Presentación: '500 ml' })
    expect(optionStates(attrs, vars, sel, 'Color')).toEqual({ Negra: 'unavailable', Roja: 'unavailable', Dorada: 'available' })
    // Siguen ofreciéndose (no desaparecen)
    expect(offeredOptions(attrs, vars, 'Color')).toEqual(['Negra', 'Roja', 'Dorada'])
    sel = selectOption(attrs, vars, sel, 'Color', 'Negra')
    expect(sel).toEqual({ Color: 'Negra' })
    expect(optionStates(attrs, vars, sel, 'Presentación')).toEqual({ '250 ml': 'available', '500 ml': 'unavailable' })
  })
})

describe('variantes: carrito', () => {
  it('la línea del carrito es compatible con los carritos guardados sin variantes', () => {
    expect(cartLineKey('p1')).toBe('p1')
    expect(cartLineKey('p1', 'v1')).toBe('p1::v1')
    expect(parseCartLineKey('p1')).toEqual({ productId: 'p1', variantId: null })
    expect(parseCartLineKey('p1::v1')).toEqual({ productId: 'p1', variantId: 'v1' })
  })

  it('availableStock usa el stock de la combinación o el número del stock en texto', () => {
    expect(availableStock('45 unidades')).toBe(45)
    expect(availableStock('Disponible')).toBeNull()
    expect(availableStock('')).toBeNull()
    expect(availableStock('99', yogurVariants[0])).toBe(5)
    expect(availableStock('99', yogurVariants[6])).toBe(0) // inactiva
  })

  it('precio y clave de cada línea', () => {
    const product = { id: 'yogur', price: 8000 } as Product
    expect(cartItemPrice({ product, quantity: 1 })).toBe(8000)
    expect(cartItemPrice({ product, quantity: 1, variant: yogurVariants[2] })).toBe(12000)
    expect(cartItemKey({ product, quantity: 1, variant: yogurVariants[2] })).toBe('yogur::f1')
    expect(orderItemName({ title: 'Yogur', variant_label: 'Sabor: Fresa · Presentación: 1 L' })).toBe('Yogur (Sabor: Fresa · Presentación: 1 L)')
    expect(orderItemName({ title: 'Café', variant_label: null })).toBe('Café')
  })
})

describe('variantes: formulario del vendedor', () => {
  const draftRow = (sabor: string, stock = '1') => ({
    options: { Sabor: sabor },
    stock,
    price: '8000',
    image_url: null,
    image_storage_path: null,
    active: true,
  })

  it('valida atributos, opciones, stock y precio como la base', () => {
    const ok = { attributes: [{ name: 'Sabor', options: ['Fresa', 'Mora'] }], rows: [draftRow('Fresa'), draftRow('Mora', '0')] }
    expect(validateVariantDraft(ok)).toBeNull()
    expect(validateVariantDraft({ attributes: [], rows: [] })).toBeNull()
    expect(validateVariantDraft({ ...ok, attributes: [{ name: ' ', options: ['A'] }] })).toMatch(/nombre/)
    expect(validateVariantDraft({ ...ok, attributes: [{ name: 'Sabor', options: [] }] })).toMatch(/al menos una opción/)
    expect(validateVariantDraft({ ...ok, attributes: [{ name: 'Sabor', options: ['Fresa', 'fresa'] }] })).toMatch(/repetidas/)
    expect(
      validateVariantDraft({
        ...ok,
        attributes: [
          { name: 'Sabor', options: ['A'] },
          { name: 'sabor', options: ['B'] },
        ],
      })
    ).toMatch(/repetido/)
    expect(validateVariantDraft({ ...ok, rows: [draftRow('Fresa', '-1'), draftRow('Mora')] })).toMatch(/Inventario inválido/)
    expect(validateVariantDraft({ ...ok, rows: [draftRow('Fresa', '2.5'), draftRow('Mora')] })).toMatch(/Inventario inválido/)
    expect(validateVariantDraft({ ...ok, rows: [{ ...draftRow('Fresa'), price: '0' }, draftRow('Mora')] })).toMatch(/Precio inválido/)
    // Sin precio general: cada variante debe tener el suyo
    expect(validateVariantDraft({ ...ok, rows: [{ ...draftRow('Fresa'), price: '' }, draftRow('Mora')] })).toMatch(/Escribe el precio de Sabor: Fresa/)
    expect(validateVariantDraft({ ...ok, rows: [] })).toMatch(/al menos una variante/)
    expect(validateVariantDraft({ ...ok, rows: [draftRow('Fresa'), { ...draftRow('Mora'), options: {} }] })).toMatch(/Completa «Sabor»/)
  })

  it('draftAttributes arma los atributos con las variantes agregadas una a una', () => {
    const row = (options: Record<string, string>) => ({ ...draftRow(''), options })
    // Fresa solo en 250 ml; Mora en 250 ml y 500 ml
    const rows = [
      row({ Sabor: 'Fresa', Presentación: '250 ml' }),
      row({ Sabor: 'Mora', Presentación: '250 ml' }),
      row({ Sabor: 'Mora', Presentación: '500 ml' }),
    ]
    expect(draftAttributes(['Sabor'], rows)).toEqual([
      { name: 'Sabor', options: ['Fresa', 'Mora'] },
      { name: 'Presentación', options: ['250 ml', '500 ml'] },
    ])
    // Sin variantes se conserva el nombre del atributo; sin medida no hay «Presentación»
    expect(draftAttributes(['Sabor'], [])).toEqual([{ name: 'Sabor', options: [] }])
    expect(draftAttributes(['Color'], [row({ Color: 'Roja' })])).toEqual([{ name: 'Color', options: ['Roja'] }])
    // Solo medida (queso de 250 g y 500 g)
    expect(draftAttributes([], [row({ Presentación: '250 g' }), row({ Presentación: '500 g' })])).toEqual([
      { name: 'Presentación', options: ['250 g', '500 g'] },
    ])
  })

  it('draftFromVariants carga solo las variantes guardadas que se ofrecen', () => {
    const draft = draftFromVariants(yogurAttrs, yogurVariants, { f1: 'u/f1.jpg' })
    expect(draft.rows).toHaveLength(6) // 7 guardadas, Natural inactiva
    const f1 = draft.rows.find((r) => r.options.Sabor === 'Fresa' && r.options.Presentación === '1 L')
    expect(f1).toMatchObject({ stock: '0', price: '12000', active: true, image_storage_path: 'u/f1.jpg' })
    expect(draft.attributes).toEqual([
      { name: 'Sabor', options: ['Fresa', 'Mora', 'Vainilla'] },
      { name: 'Presentación', options: ['250 ml', '500 ml', '1 L'] },
    ])
  })

  it('variantDraftPayload arma los argumentos de save_product_variants', () => {
    expect(variantDraftPayload(null)).toEqual({ p_attributes: [], p_variants: [] })
    const payload = variantDraftPayload({
      attributes: [{ name: ' Sabor ', options: [' Fresa ', ''] }],
      rows: [{ ...draftRow('Fresa', ' 4 '), price: '9500' }],
    })
    expect(payload.p_attributes).toEqual([{ name: 'Sabor', options: ['Fresa'] }])
    expect(payload.p_variants).toEqual([
      { options: { Sabor: 'Fresa' }, stock: 4, price: 9500, image_url: null, image_storage_path: null, active: true },
    ])
  })
})

describe('unidades de medida', () => {
  it('normalizeUnit lleva los valores guardados a la lista', () => {
    expect(normalizeUnit('kg')).toBe('kg')
    expect(normalizeUnit('uds')).toBe('und')
    expect(normalizeUnit('l')).toBe('L')
    expect(normalizeUnit('')).toBe(DEFAULT_UNIT)
    expect(normalizeUnit('tonelada')).toBe('tonelada') // se conserva si no está en la lista
    expect(UNITS.map((u) => u.value)).toEqual(expect.arrayContaining(['g', 'kg', 'lb', 'ml', 'L', 'und']))
  })

  it('formatMeasure y parseOptionInput agregan la unidad solo a cantidades', () => {
    expect(formatMeasure('250', 'ml')).toBe('250 ml')
    expect(formatMeasure('1,5', 'L')).toBe('1,5 L')
    expect(formatMeasure('Fresa', 'ml')).toBe('Fresa')
    expect(formatMeasure(' 500 ', '')).toBe('500')
    expect(parseOptionInput('250, 500; 1,5', 'ml')).toEqual(['250 ml', '500 ml', '1,5 ml'])
    expect(parseOptionInput('Fresa, Mora,', '')).toEqual(['Fresa', 'Mora'])
  })

  it('isMeasureAmount acepta solo cantidades positivas', () => {
    expect(isMeasureAmount('250')).toBe(true)
    expect(isMeasureAmount(' 1,5 ')).toBe(true)
    expect(isMeasureAmount('0.5')).toBe(true)
    expect(isMeasureAmount('0')).toBe(false)
    expect(isMeasureAmount('250ml')).toBe(false)
    expect(isMeasureAmount('')).toBe(false)
  })

  it('la medida es un atributo aparte y no se repiten nombres', () => {
    expect(isMeasureAttribute(' presentación ')).toBe(true)
    expect(isMeasureAttribute('Sabor')).toBe(false)
    const dups = duplicateAttributeNames([
      { name: 'Color', options: ['Roja'] },
      { name: 'color ', options: ['Negra'] },
      { name: 'Sabor', options: [] },
      { name: '', options: [] },
    ])
    expect([...dups]).toEqual(['color'])
  })
})

describe('limpieza del Storage', () => {
  it('uniquePaths quita vacíos y repetidos', () => {
    expect(uniquePaths(['a/1.jpg', null, '', ' a/1.jpg ', undefined, 'b/2.png'])).toEqual(['a/1.jpg', 'b/2.png'])
  })

  it('findOrphans deja los archivos en uso y los subidos hace poco', () => {
    const now = new Date('2026-10-20T12:00:00Z')
    const files: StoredFile[] = [
      { bucket: 'product-images', path: 'u1/en-uso.jpg', createdAt: '2026-10-01T00:00:00Z' },
      { bucket: 'product-images', path: 'u1/viejo.jpg', createdAt: '2026-10-01T00:00:00Z' },
      { bucket: 'product-images', path: 'u1/reciente.jpg', createdAt: '2026-10-20T06:00:00Z' },
      { bucket: 'experience-images', path: 'u2/sin-fecha.jpg', createdAt: null },
    ]
    const orphans = findOrphans(files, new Set(['u1/en-uso.jpg']), now, 24)
    expect(orphans.map((o) => o.path)).toEqual(['u1/viejo.jpg'])
  })
})

describe('validation', () => {
  it('cleanLine quita caracteres invisibles, de control y espacios repetidos', () => {
    expect(cleanLine('  Cooperativa‮  El​ Roble\u0007 ')).toBe('Cooperativa El Roble')
    expect(cleanLine('Línea 1\nLínea 2')).toBe('Línea 1 Línea 2')
    expect(cleanLine(null)).toBe('')
  })

  it('cleanMultiline conserva saltos de línea pero no más de una línea en blanco', () => {
    expect(cleanMultiline('Hola  \r\n\r\n\r\n\r\n  mundo\u0000 ')).toBe('Hola\n\nmundo')
  })

  it('textError valida obligatorio, largo y < >', () => {
    expect(textError('Asunto', '', { max: 10, required: true })).toContain('Completa')
    expect(textError('Asunto', '', { max: 10 })).toBeNull()
    expect(textError('Asunto', 'x'.repeat(11), { max: 10 })).toContain('máximo 10')
    expect(textError('Asunto', '<b>hola</b>', { max: 100 })).toContain('<')
    expect(textError('Asunto', 'Pedido #12 (fresas)', { max: 100 })).toBeNull()
  })

  it('personNameError acepta nombres reales y rechaza números o símbolos', () => {
    expect(personNameError('Nombre', 'María José')).toBeNull()
    expect(personNameError('Apellido', "O'Neil-Pérez")).toBeNull()
    expect(personNameError('Nombre', 'Admin123')).not.toBeNull()
    expect(personNameError('Nombre', '')).not.toBeNull()
    expect(personNameError('Apellido', '', false)).toBeNull()
  })

  it('orgNameError exige letras y largo máximo', () => {
    expect(orgNameError('Cooperativa El Roble S.A.S.')).toBeNull()
    expect(orgNameError('12345')).not.toBeNull()
    expect(orgNameError('a'.repeat(201))).not.toBeNull()
  })

  it('phoneError acepta celulares y fijos de Colombia de 10 dígitos', () => {
    expect(phoneError('3001234567')).toBeNull()
    expect(phoneError('6012345678')).toBeNull()
    expect(phoneError('')).toBeNull()
    expect(phoneError('', true)).not.toBeNull()
    expect(phoneError('12345')).not.toBeNull()
    expect(phoneError('9001234567')).not.toBeNull()
  })

  it('isValidEmail', () => {
    expect(isValidEmail('ana@campo.co')).toBe(true)
    expect(isValidEmail('ana@campo')).toBe(false)
    expect(isValidEmail('ana <x>@campo.co')).toBe(false)
    expect(isValidEmail(`${'a'.repeat(250)}@x.co`)).toBe(false)
  })

  it('priceError e integerError', () => {
    expect(priceError('28000')).toBeNull()
    expect(priceError('1500.50')).toBeNull()
    expect(priceError('0')).not.toBeNull()
    expect(priceError('-5')).not.toBeNull()
    expect(priceError('1e9')).not.toBeNull()
    expect(integerError('45', 'Stock')).toBeNull()
    expect(integerError('-1', 'Stock')).not.toBeNull()
    expect(integerError('2.5', 'Stock')).not.toBeNull()
    expect(integerError('0', 'Cupos', 1)).not.toBeNull()
  })

  it('parseTags limpia y quita repetidas; tagsError limita cantidad y largo', () => {
    expect(parseTags(' Naturaleza, senderismo ,, naturaleza ')).toEqual(['Naturaleza', 'senderismo'])
    expect(tagsError(Array.from({ length: 21 }, (_, i) => `t${i}`))).not.toBeNull()
    expect(tagsError(['x'.repeat(41)])).not.toBeNull()
    expect(tagsError(['Taller'])).toBeNull()
  })

  it('profileFieldsError revisa nombre, apellido, organización, teléfono y dirección', () => {
    const ok = { first_name: 'Ana', last_name: 'Gómez', org_name: '', phone: '3001234567', address: 'Calle 10 # 4-15' }
    expect(profileFieldsError(ok)).toBeNull()
    expect(profileFieldsError({ ...ok, last_name: '' }, { requireLastName: true })).not.toBeNull()
    expect(profileFieldsError({ ...ok, phone: '123' })).not.toBeNull()
    expect(profileFieldsError({ ...ok, address: 'x'.repeat(201) })).not.toBeNull()
  })

  it('cleanShipping y shippingError', () => {
    const s = cleanShipping({ fullName: ' Ana  Gómez ', phone: '300 123 4567', department: 'Cundinamarca', municipality: 'Bogotá', address: 'Calle 1', deliveryNotes: '' })
    expect(s.fullName).toBe('Ana Gómez')
    expect(s.phone).toBe('3001234567')
    expect(shippingError(s)).toBeNull()
    expect(shippingError({ ...s, address: '' })).not.toBeNull()
    expect(shippingError({ ...s, phone: '300' })).not.toBeNull()
  })
})

describe('isKnownPath (página 404)', () => {
  const stores = [{ store: 'campo', slug: null }, { store: 'amazonia', slug: 'tienda-amazonica' }]
  it('reconoce las pantallas y las tiendas aliadas', () => {
    for (const path of ['/', '/productos', '/experiencias/', '/mi-cuenta', '/index.html', '/tienda-amazonica', '/tienda-amazonica/mi-cuenta']) {
      expect(isKnownPath(path, stores)).toBe(true)
    }
  })
  it('las demás direcciones son 404', () => {
    for (const path of ['/productoss', '/tienda-inexistente', '/tienda-amazonica/otra', '/productos/123', '/wp-admin']) {
      expect(isKnownPath(path, stores)).toBe(false)
    }
  })
})
