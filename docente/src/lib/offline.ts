// Cola de listas guardadas sin señal. Se envían solas cuando vuelve la conexión.
import { useSyncExternalStore } from 'react'
import { api, ApiError, SinConexion } from './api'

const K = 'sr_cola_sesiones'
type Pendiente = { body: any; guardado: string; error?: string }

const oyentes = new Set<() => void>()
let snapshot: Pendiente[] = leer()

function leer(): Pendiente[] {
  try {
    return JSON.parse(localStorage.getItem(K) || '[]')
  } catch {
    return []
  }
}
function escribir(cola: Pendiente[]) {
  localStorage.setItem(K, JSON.stringify(cola))
  snapshot = cola
  oyentes.forEach((f) => f())
}

export function usePendientes() {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => snapshot,
  )
}

/** Guarda la lista. Si no hay señal, la deja en cola y devuelve {offline: true}. */
export async function guardarSesion(body: any): Promise<{ offline: boolean; data?: any }> {
  try {
    const data = await api('/sesiones/', { method: 'POST', body })
    return { offline: false, data }
  } catch (e) {
    if (e instanceof SinConexion) {
      const cola = leer().filter((p) => p.body.uuid !== body.uuid)
      escribir([...cola, { body, guardado: new Date().toISOString() }])
      return { offline: true }
    }
    throw e
  }
}

let sincronizando = false
export async function sincronizar() {
  if (sincronizando) return
  sincronizando = true
  try {
    for (const p of leer()) {
      try {
        await api('/sesiones/', { method: 'POST', body: p.body })
        escribir(leer().filter((x) => x.body.uuid !== p.body.uuid))
      } catch (e) {
        if (e instanceof SinConexion) break
        if (e instanceof ApiError) {
          escribir(leer().map((x) => (x.body.uuid === p.body.uuid ? { ...x, error: e.message } : x)))
        }
      }
    }
  } finally {
    sincronizando = false
  }
}

export function descartarPendiente(uuid: string) {
  escribir(leer().filter((x) => x.body.uuid !== uuid))
}

/** Cantidad de listas que todavía no llegaron al servidor. */
export function cantidadPendientes() {
  return leer().length
}

/** Vacía la cola (solo al cerrar sesión a propósito, después de confirmar). */
export function descartarTodo() {
  escribir([])
}

window.addEventListener('online', () => void sincronizar())
setInterval(() => {
  if (leer().length) void sincronizar()
}, 60_000)
