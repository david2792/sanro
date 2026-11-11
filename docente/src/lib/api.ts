// Cliente de la API de Django con JWT y caché para trabajar sin conexión.

const BASE = import.meta.env.VITE_API_URL ?? '/api'
const K_ACCESS = 'sr_access'
const K_REFRESH = 'sr_refresh'

export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, data: any) {
    super(mensajeDeError(data) || `Error ${status}`)
    this.status = status
    this.data = data
  }
}

export class SinConexion extends Error {
  constructor() {
    super('Sin conexión con el servidor.')
  }
}

/** Convierte las respuestas de error de DRF en un texto legible. */
export function mensajeDeError(data: any): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return data.map(mensajeDeError).join(' ')
  if (data.detail) return String(data.detail)
  return Object.entries(data)
    .map(([k, v]) => {
      const txt = mensajeDeError(v)
      return k === 'non_field_errors' || /^\d+$/.test(k) ? txt : `${k}: ${txt}`
    })
    .join(' · ')
}

export const tokens = {
  get access() {
    return localStorage.getItem(K_ACCESS)
  },
  get refresh() {
    return localStorage.getItem(K_REFRESH)
  },
  guardar(access: string, refresh?: string) {
    localStorage.setItem(K_ACCESS, access)
    if (refresh) localStorage.setItem(K_REFRESH, refresh)
  },
  borrar() {
    localStorage.removeItem(K_ACCESS)
    localStorage.removeItem(K_REFRESH)
  },
}

let renovando: Promise<boolean> | null = null
async function renovarToken(): Promise<boolean> {
  if (!tokens.refresh) return false
  renovando ??= fetch(`${BASE}/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: tokens.refresh }),
  })
    .then(async (r) => {
      if (!r.ok) return false
      const d = await r.json()
      tokens.guardar(d.access, d.refresh)
      return true
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (renovando = null), 0))
  return renovando
}

type Opciones = {
  method?: string
  body?: any
  /** Guarda la respuesta para mostrarla sin señal. */
  cache?: boolean
}

export async function api<T = any>(ruta: string, { method = 'GET', body, cache }: Opciones = {}, reintento = true): Promise<T> {
  const headers: Record<string, string> = {}
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`
  let cuerpo: BodyInit | undefined
  if (body instanceof FormData) cuerpo = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    cuerpo = JSON.stringify(body)
  }

  let r: Response
  try {
    r = await fetch(BASE + ruta, { method, headers, body: cuerpo })
  } catch {
    if (method === 'GET' && cache) {
      const guardado = localStorage.getItem('cache:' + ruta)
      if (guardado) return JSON.parse(guardado)
    }
    throw new SinConexion()
  }

  if (r.status === 401 && reintento && (await renovarToken())) {
    return api(ruta, { method, body, cache }, false)
  }
  if (r.status === 401) {
    tokens.borrar()
    window.dispatchEvent(new Event('sesion-expirada'))
  }
  if (r.status === 204) return undefined as T

  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text()
  if (!r.ok) throw new ApiError(r.status, data)
  if (method === 'GET' && cache) {
    try {
      localStorage.setItem('cache:' + ruta, JSON.stringify(data))
    } catch {
      /* almacenamiento lleno: se ignora */
    }
  }
  return data as T
}

/** Devuelve siempre un arreglo, venga paginado o no. */
export async function lista<T = any>(ruta: string, cache = false): Promise<T[]> {
  const sep = ruta.includes('?') ? '&' : '?'
  const d = await api(`${ruta}${sep}page_size=2000`, { cache })
  return Array.isArray(d) ? d : d.results
}

/** Arma un FormData si hay archivos; si no, devuelve el objeto tal cual. */
export function cuerpoConArchivos(datos: Record<string, any>) {
  const hayArchivo = Object.values(datos).some((v) => v instanceof File)
  if (!hayArchivo) return datos
  const fd = new FormData()
  for (const [k, v] of Object.entries(datos)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, String(x)))
    else fd.append(k, v instanceof File ? v : String(v))
  }
  return fd
}
