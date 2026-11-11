import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, tokens } from './api'

export type Rol = 'DIRECTOR' | 'COORDINADOR' | 'SECRETARIA' | 'DOCENTE' | 'TUTOR' | 'ACES'
export type Usuario = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  rol: Rol
  is_superuser?: boolean
  docente_id: number | null
}

type Ctx = {
  usuario: Usuario | null
  cargando: boolean
  esGestion: boolean
  esDocente: boolean
  /** Comisión de la ACES (o gestión): administra los aportes de padres. */
  veAportes: boolean
  entrar: (username: string, password: string) => Promise<void>
  salir: () => void
}

const AuthCtx = createContext<Ctx>(null!)

export const ROL_NOMBRE: Record<Rol, string> = {
  DIRECTOR: 'Dirección',
  COORDINADOR: 'Coordinación',
  SECRETARIA: 'Secretaría',
  DOCENTE: 'Docente',
  TUTOR: 'Familia',
  ACES: 'ACES',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const u = localStorage.getItem('sr_usuario')
    return u ? JSON.parse(u) : null
  })
  const [cargando, setCargando] = useState(!!tokens.access)

  const salir = useCallback(() => {
    tokens.borrar()
    localStorage.removeItem('sr_usuario')
    setUsuario(null)
  }, [])

  const cargarYo = useCallback(async () => {
    try {
      const yo = await api<Usuario>('/yo/', { cache: true })
      localStorage.setItem('sr_usuario', JSON.stringify(yo))
      setUsuario(yo)
    } catch (e: any) {
      if (e?.status === 401) salir()
    } finally {
      setCargando(false)
    }
  }, [salir])

  useEffect(() => {
    if (tokens.access) void cargarYo()
    const fin = () => salir()
    window.addEventListener('sesion-expirada', fin)
    return () => window.removeEventListener('sesion-expirada', fin)
  }, [cargarYo, salir])

  const entrar = async (username: string, password: string) => {
    const r = await api('/auth/token/', { method: 'POST', body: { username, password } })
    tokens.guardar(r.access, r.refresh)
    await cargarYo()
  }

  const rol = usuario?.rol
  const esGestion = !!usuario?.is_superuser || rol === 'DIRECTOR' || rol === 'COORDINADOR' || rol === 'SECRETARIA'
  const esDocente = !!usuario?.docente_id
  const veAportes = esGestion || rol === 'ACES'

  return (
    <AuthCtx.Provider value={{ usuario, cargando, esGestion, esDocente, veAportes, entrar, salir }}>{children}</AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
