import { BookOpen, CalendarDays, CloudOff, FileText, GraduationCap, HandCoins, LayoutDashboard, Library, LogOut, RefreshCw, UserRound, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { ROL_NOMBRE, useAuth } from '../lib/auth'
import { sincronizar, usePendientes } from '../lib/offline'
import { PwaBanner } from './PwaBanner'
import { cn, iniciales } from '../lib/utils'

/** `escritorio`: solo en la barra lateral (en el celular se llega desde el Panel). */
type Item = { a: string; label: string; icono: typeof BookOpen; escritorio?: boolean }

function useItems(): Item[] {
  const { esGestion, esDocente, veAportes } = useAuth()
  const items: Item[] = []
  if (esGestion || esDocente) items.push({ a: '/tablero', label: 'Panel', icono: LayoutDashboard })
  if (esGestion) items.push({ a: '/ausencias', label: 'Ausencias', icono: UserX, escritorio: true })
  if (esDocente) items.push({ a: '/clases', label: 'Mis clases', icono: BookOpen })
  if (esGestion) items.push({ a: '/alumnos', label: 'Alumnos', icono: GraduationCap })
  if (veAportes) items.push({ a: '/aportes', label: 'Aportes', icono: HandCoins })
  if (esGestion) items.push({ a: '/planes', label: 'Planes anuales', icono: FileText, escritorio: true })
  if (esGestion) items.push({ a: '/planificacion', label: 'Planificación', icono: CalendarDays, escritorio: true })
  if (esGestion) items.push({ a: '/ref', label: 'Gestión', icono: Library })
  items.push({ a: '/perfil', label: 'Perfil', icono: UserRound })
  return items
}

function useEnLinea() {
  const [en, setEn] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setEn(true)
    const off = () => setEn(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return en
}

/** Avisa si no hay señal o si quedan listas por enviar. */
function EstadoSync() {
  const pendientes = usePendientes()
  const enLinea = useEnLinea()
  if (enLinea && !pendientes.length) return null
  return (
    <button
      onClick={() => void sincronizar()}
      className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold',
        enLinea ? 'bg-tarde-50 text-tarde' : 'bg-grafito-100 text-grafito-600')}
    >
      {enLinea ? <RefreshCw className="size-4" /> : <CloudOff className="size-4" />}
      {pendientes.length ? `${pendientes.length} por enviar` : 'Sin señal'}
    </button>
  )
}

export default function Layout() {
  const { usuario, salir } = useAuth()
  const items = useItems()
  const nombre = usuario ? `${usuario.first_name} ${usuario.last_name}`.trim() || usuario.username : ''

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (computadora) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-tinta-900 text-tinta-100 lg:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-6">
          <img src="/logo-san-roque.png" alt="Escudo del Colegio Nacional E.M.D. San Roque González de Santacruz" className="h-14 w-auto shrink-0" />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight text-white">San Roque González</p>
            <p className="text-sm text-tinta-200">Gestión académica</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ a, label, icono: I }) => (
            <NavLink key={a} to={a}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold',
                isActive ? 'bg-white/12 text-white' : 'text-tinta-200 hover:bg-white/6 hover:text-white')}>
              <I className="size-5" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
          <span className="grid size-9 place-items-center rounded-full bg-tinta-600 text-sm font-bold text-white">{iniciales(nombre)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-white">{nombre}</p>
            <p className="text-sm text-tinta-200">{usuario && ROL_NOMBRE[usuario.rol]}</p>
          </div>
          <button onClick={salir} className="rounded-lg p-2 hover:bg-white/10" aria-label="Cerrar sesión"><LogOut className="size-5" /></button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 flex flex-col">
        <PwaBanner />
        <header className="pt-safe sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-grafito-200 bg-papel/95 px-4 pb-2 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo-san-roque.png" alt="" className="h-8 w-auto" />
            <p className="font-bold text-tinta-700 text-base">San Roque</p>
          </div>
          <EstadoSync />
        </header>
        <div className="hidden justify-end px-8 pt-4 lg:flex"><EstadoSync /></div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Navegación inferior (celular) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-grafito-200 bg-white pt-1 lg:hidden">
        {items.filter((i) => !i.escritorio).map(({ a, label, icono: I }) => (
          <NavLink key={a} to={a}
            className={({ isActive }) => cn('flex flex-1 flex-col items-center gap-0.5 py-1.5 text-xs font-bold',
              isActive ? 'text-tinta-700' : 'text-grafito-500')}>
            {({ isActive }) => (
              <>
                <span className={cn('grid h-8 w-14 place-items-center rounded-full', isActive && 'bg-tinta-100')}>
                  <I className="size-5" />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
