import { supabase } from './supabase'
import { clearPromoSession } from './promoSession'

// Cierre de sesión en un solo lugar. Antes cada pantalla llamaba supabase.auth.signOut() por su
// cuenta y dejaba en el navegador datos del usuario anterior (carrito, rol activo...).

// Datos del navegador que pertenecen a quien tenía la sesión abierta
const USER_LOCAL_KEYS = [/^campoconecta_cart/, /^ecnu\.activeRole\./]
const USER_SESSION_KEYS = [/^campoconecta_panel_section$/]

function removeMatching(storage: Storage, patterns: RegExp[]) {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && patterns.some((p) => p.test(key))) keys.push(key)
  }
  keys.forEach((key) => storage.removeItem(key))
}

/** Borra del navegador los datos del usuario (carritos, rol activo, sección pendiente del panel, anuncios vistos) */
export function clearLocalUserData() {
  clearPromoSession()
  try {
    removeMatching(localStorage, USER_LOCAL_KEYS)
    removeMatching(sessionStorage, USER_SESSION_KEYS)
  } catch {
    // Almacenamiento bloqueado (modo incógnito estricto): no hay nada que borrar
  }
}

/**
 * Cierra la sesión en todos los dispositivos (scope global: Supabase revoca todos los refresh
 * tokens de la cuenta) y limpia los datos locales. Si Supabase no responde (sin conexión), la
 * sesión igual se borra de este navegador.
 *
 * redirectTo: a dónde ir después; recargar la página descarta el estado en memoria del usuario anterior.
 */
export async function signOutUser(redirectTo?: string) {
  const { error } = await supabase.auth.signOut({ scope: 'global' })
  if (error) {
    console.warn('No se pudo cerrar la sesión en el servidor; se cierra solo en este navegador.', error.message)
    await supabase.auth.signOut({ scope: 'local' })
  }
  clearLocalUserData()
  if (redirectTo !== undefined) window.location.href = redirectTo
}
