import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isAuthApiError, type Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearLocalUserData } from './session'
import { MAIN_STORE, type StoreId } from './stores'
import type { UserRole } from './types'
import { readStoredActiveRole, resolveActiveRole, resolveRoles, storeActiveRole } from './roles'

// Sesión y perfil del usuario en un solo lugar: antes App y varias pantallas
// consultaban profiles por su cuenta para saber el rol.

export interface AuthState {
  session: Session | null
  /**
   * Rol activo: con el que el usuario está usando la app ahora (p. ej. una Asociación que
   * entra como Comprador). Es el que usan la navegación y las pantallas.
   */
  role?: UserRole
  /** Rol principal (profiles.user_type): el que validan las políticas de vendedor en la base */
  primaryRole?: UserRole
  /** Todos los roles de la cuenta (profile_roles) */
  roles: UserRole[]
  /** Tienda del usuario (profiles.store): la que gestiona un productor o un admin de tienda */
  store: StoreId
  /**
   * Cuenta creada con Google (u otro proveedor OAuth) que aún no completó su perfil:
   * sin formulario de registro no tiene documento, ubicación ni tipo de cuenta elegido.
   */
  needsProfileCompletion: boolean
  /**
   * Contraseña temporal asignada por un admin (public.password_change_required). La base la apaga
   * sola cuando la contraseña cambia; el usuario no la puede quitar editando sus metadatos.
   */
  mustChangePassword: boolean
  /** true hasta conocer la sesión inicial y su perfil */
  loading: boolean
  /** Aumenta cada vez que termina de cargarse un perfil (inicio de sesión, cambio de usuario...) */
  profileLoadId: number
}

interface AuthContextValue extends AuthState {
  /** Vuelve a leer el perfil (p. ej. después de completarlo) */
  refreshProfile: () => Promise<void>
  /** Cambia el rol activo (solo a uno de los roles de la cuenta) */
  setActiveRole: (role: UserRole) => void
}

const initialState: AuthState = { session: null, roles: [], store: MAIN_STORE, needsProfileCompletion: false, mustChangePassword: false, loading: true, profileLoadId: 0 }

/** Cada cuánto se confirma con Auth que la sesión sigue vigente */
const SESSION_CHECK_MS = 5 * 60 * 1000

const AuthContext = createContext<AuthContextValue>({ ...initialState, refreshProfile: async () => {}, setActiveRole: () => {} })

/** Inició sesión con un proveedor externo (Google...) en lugar de correo y contraseña */
const isOAuthUser = (session: Session) => {
  const providers = (session.user.app_metadata?.providers as string[] | undefined) ?? [session.user.app_metadata?.provider as string]
  return providers.some((p) => p && p !== 'email')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)
  // Solo se aplica la última carga: si la sesión cambia mientras se consulta el perfil
  // (p. ej. cerrar sesión), la respuesta anterior se descarta.
  const latestLoad = useRef(0)

  const load = useCallback(async (session: Session | null) => {
    const loadId = ++latestLoad.current
    if (!session) {
      setState((prev) => ({ ...initialState, loading: false, profileLoadId: prev.profileLoadId + 1 }))
      return
    }

    const [{ data }, { data: roleRows }, { data: mustChangePassword }] = await Promise.all([
      supabase.from('profiles').select('user_type, store, document_number').eq('id', session.user.id).single(),
      supabase.from('profile_roles').select('role').eq('profile_id', session.user.id),
      supabase.rpc('my_password_change_required'),
    ])
    if (loadId !== latestLoad.current) return

    const role = (data?.user_type as UserRole | undefined) ?? undefined
    const roles = resolveRoles(role, roleRows)
    setState((prev) => ({
      session,
      role: resolveActiveRole(role, roles, readStoredActiveRole(session.user.id)),
      primaryRole: role,
      roles,
      store: data?.store ?? MAIN_STORE,
      // Sin fila en profiles (no se creó al registrarse) también se completa: la RPC la crea
      needsProfileCompletion: !data || (isOAuthUser(session) && !data.document_number && role !== 'admin' && role !== 'admin_tienda'),
      mustChangePassword: mustChangePassword === true,
      loading: false,
      profileLoadId: prev.profileLoadId + 1,
    }))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => load(session))

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // La sesión inicial ya la carga getSession
      if (event === 'INITIAL_SESSION') return
      // Al refrescar el token el perfil no cambia: solo se actualiza la sesión
      if (event === 'TOKEN_REFRESHED') {
        setState((prev) => ({ ...prev, session }))
        return
      }
      // También cuando la sesión termina sin pasar por signOutUser (otra pestaña, token revocado...)
      if (event === 'SIGNED_OUT') clearLocalUserData()
      load(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [load])

  // Sesión revocada desde otro lado (cerró sesión en otro dispositivo, cambió la contraseña, un admin
  // eliminó o bloqueó la cuenta): el token guardado en el navegador parece válido hasta que vence,
  // así que se le pregunta a Auth al volver a la pestaña y cada 5 minutos. Si Auth ya no la reconoce,
  // se cierra aquí también.
  const userId = state.session?.user.id
  useEffect(() => {
    if (!userId) return
    let checking = false
    let lastCheck = Date.now()
    const verify = async () => {
      // focus y visibilitychange llegan juntos: como mucho una consulta cada 30 s
      if (checking || document.visibilityState !== 'visible' || Date.now() - lastCheck < 30_000) return
      checking = true
      lastCheck = Date.now()
      const { error } = await supabase.auth.getUser()
      checking = false
      if (error && isAuthApiError(error) && [401, 403, 404].includes(error.status)) {
        await supabase.auth.signOut({ scope: 'local' })
      }
    }
    const interval = window.setInterval(verify, SESSION_CHECK_MS)
    document.addEventListener('visibilitychange', verify)
    window.addEventListener('focus', verify)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', verify)
      window.removeEventListener('focus', verify)
    }
  }, [userId])

  const setActiveRole = useCallback((role: UserRole) => {
    setState((prev) => {
      if (!prev.session || !prev.roles.includes(role) || prev.role === role) return prev
      storeActiveRole(prev.session.user.id, role)
      return { ...prev, role }
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, refreshProfile: () => load(state.session), setActiveRole }),
    [state, load, setActiveRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
