import { Loader2, X } from 'lucide-react'
import {
  createContext, useCallback, useContext, useEffect, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { cn, miles } from '../lib/utils'

/* ------------------------------ Botones -------------------------------- */

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-tinta-700 text-white hover:bg-tinta-800 active:bg-tinta-900 disabled:bg-grafito-300',
  secundario: 'bg-white text-tinta-700 ring-1 ring-inset ring-grafito-200 hover:bg-tinta-50 disabled:text-grafito-300',
  fantasma: 'text-tinta-700 hover:bg-tinta-50 disabled:text-grafito-300',
  peligro: 'bg-ausente text-white hover:brightness-95 disabled:bg-grafito-300',
}

export function Boton({
  variante = 'primario', cargando, className, children, grande, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean; grande?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || cargando}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-control font-bold transition-colors disabled:cursor-not-allowed',
        grande ? 'h-13 px-6 text-lg' : 'h-11 px-4 text-[15px]',
        VARIANTES[variante],
        className,
      )}
    >
      {cargando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function BotonIcono({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cn('grid size-10 place-items-center rounded-full text-grafito-600 hover:bg-grafito-100 active:bg-grafito-200', className)}
    />
  )
}

/* ------------------------------ Formularios ---------------------------- */

const CONTROL =
  'w-full rounded-control border border-grafito-200 bg-white px-3 text-[16px] text-grafito placeholder:text-grafito-300 focus:border-tinta-500 focus:outline-none focus:ring-2 focus:ring-tinta-100 disabled:bg-grafito-100'

export function Campo({ label, ayuda, error, children, className }: {
  label: string; ayuda?: string; error?: string; children: ReactNode; className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-bold text-grafito-600">{label}</span>
      {children}
      {ayuda && !error && <span className="mt-1 block text-sm text-grafito-500">{ayuda}</span>}
      {error && <span className="mt-1 block text-sm text-ausente">{error}</span>}
    </label>
  )
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(CONTROL, 'h-11', className)} />
}

/** Monto en guaraníes con punto de miles mientras se escribe: 200000 -> "200.000". */
export function InputMonto({ valor, onChange, className, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  valor: number | string | null | undefined; onChange: (v: number | null) => void
}) {
  const vacio = valor === '' || valor == null || Number.isNaN(Number(valor))
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grafito-500">Gs.</span>
      <input {...p} type="text" inputMode="numeric" autoComplete="off" value={vacio ? '' : miles(valor)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').slice(0, 12)
          onChange(digitos ? Number(digitos) : null)
        }}
        className={cn(CONTROL, 'h-11 pl-11 text-right')} style={{ fontVariantNumeric: 'tabular-nums' }} />
    </div>
  )
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={cn(CONTROL, 'py-2.5 leading-relaxed', className)} />
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cn(CONTROL, 'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%235b6573%22%3E%3Cpath%20d%3D%22M5.3%207.3a1%201%200%20011.4%200L10%2010.6l3.3-3.3a1%201%200%20111.4%201.4l-4%204a1%201%200%2001-1.4%200l-4-4a1%201%200%20010-1.4z%22/%3E%3C/svg%3E")] bg-[length:1.25rem] bg-[right_0.6rem_center] bg-no-repeat pr-9', className)}>
      {children}
    </select>
  )
}

export function Casilla({ checked, onChange, children, className }: {
  checked: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 py-2', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-tinta-700"
      />
      <span className="leading-snug">{children}</span>
    </label>
  )
}

/* ------------------------------ Contenedores --------------------------- */

export function Tarjeta({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cn('rounded-xl border border-grafito-200 bg-white', className)}>
      {children}
    </div>
  )
}

export function Encabezado({ titulo, detalle, acciones }: { titulo: ReactNode; detalle?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight text-grafito lg:text-[1.75rem]">{titulo}</h1>
        {detalle && <p className="mt-1 text-grafito-500">{detalle}</p>}
      </div>
      {acciones && <div className="flex gap-2">{acciones}</div>}
    </div>
  )
}

export function Etiqueta({ tono = 'gris', children }: { tono?: 'gris' | 'verde' | 'rojo' | 'ambar' | 'azul'; children: ReactNode }) {
  const t = {
    gris: 'bg-grafito-100 text-grafito-600',
    verde: 'bg-presente-50 text-presente',
    rojo: 'bg-ausente-50 text-ausente',
    ambar: 'bg-tarde-50 text-tarde',
    azul: 'bg-justificado-50 text-justificado',
  }[tono]
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold', t)}>{children}</span>
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-grafito-500">
      <Loader2 className="size-5 animate-spin" /> {texto}
    </div>
  )
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-grafito-300 px-6 py-12 text-center">
      <p className="text-lg font-bold">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-sm text-grafito-500">{texto}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  )
}

export function ErrorCaja({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return <div className="rounded-control bg-ausente-50 px-4 py-3 text-ausente">{msg}</div>
}

/* ------------------------------ Hoja (modal) --------------------------- */

/** En el celular sube desde abajo; en pantallas grandes es un diálogo centrado. */
export function Hoja({ abierta, onCerrar, titulo, children, pie }: {
  abierta: boolean; onCerrar: () => void; titulo: string; children: ReactNode; pie?: ReactNode
}) {
  useEffect(() => {
    if (!abierta) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [abierta, onCerrar])
  if (!abierta) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="anim-aparecer absolute inset-0 bg-grafito/40" onClick={onCerrar} />
      <div className="anim-subir relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-grafito-100 py-2 pl-5 pr-2">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <BotonIcono onClick={onCerrar} aria-label="Cerrar"><X className="size-5" /></BotonIcono>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {pie && <div className="pb-safe flex gap-3 border-t border-grafito-100 px-5 pt-3">{pie}</div>}
      </div>
    </div>
  )
}

export function Confirmar({ abierta, titulo, texto, accion = 'Eliminar', onConfirmar, onCerrar, cargando }: {
  abierta: boolean; titulo: string; texto: string; accion?: string
  onConfirmar: () => void; onCerrar: () => void; cargando?: boolean
}) {
  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo={titulo}
      pie={<>
        <Boton variante="secundario" className="flex-1" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="peligro" className="flex-1" cargando={cargando} onClick={onConfirmar}>{accion}</Boton>
      </>}>
      <p className="text-grafito-600">{texto}</p>
    </Hoja>
  )
}

/* ------------------------------ Avisos (toast) ------------------------- */

type Aviso = { id: number; texto: string; tono: 'ok' | 'error' | 'info' }
const AvisoCtx = createContext<(texto: string, tono?: Aviso['tono']) => void>(() => {})

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const avisar = useCallback((texto: string, tono: Aviso['tono'] = 'ok') => {
    const id = Date.now() + Math.random()
    setAvisos((a) => [...a, { id, texto, tono }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:top-auto" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={cn(
            'anim-aparecer max-w-md rounded-xl px-4 py-3 font-bold text-white shadow-lg',
            a.tono === 'ok' && 'bg-grafito',
            a.tono === 'error' && 'bg-ausente',
            a.tono === 'info' && 'bg-tarde',
          )}>{a.texto}</div>
        ))}
      </div>
    </AvisoCtx.Provider>
  )
}

export const useAviso = () => useContext(AvisoCtx)

/* ------------------------------ Pestañas -------------------------------- */

export function Segmentado<T extends string>({ valor, opciones, onChange }: {
  valor: T; opciones: { valor: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-control bg-grafito-100 p-1">
      {opciones.map((o) => (
        <button key={o.valor} type="button" onClick={() => onChange(o.valor)}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-bold', valor === o.valor ? 'bg-white text-tinta-700 shadow-sm' : 'text-grafito-500')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
