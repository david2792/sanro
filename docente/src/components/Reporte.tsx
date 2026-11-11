import { Download, Printer } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/utils'
import { Boton, Tarjeta } from './ui'

/** Encabezado que solo aparece en papel: colegio, título, período y fecha de emisión. */
export function EncabezadoImpresion({ institucion, titulo, detalle, generado }: {
  institucion?: string; titulo: string; detalle?: ReactNode; generado?: string
}) {
  const emitido = generado ? new Date(generado) : new Date()
  return (
    <div className="solo-imprimir mb-4 border-b-2 border-grafito pb-3">
      <div className="flex items-center gap-4">
        <img src="/logo-san-roque.png" alt="" className="h-20 w-auto" />
        <div>
          <p className="text-sm font-bold uppercase tracking-wide">{institucion || 'Colegio'}</p>
          <h1 className="text-xl font-bold">{titulo}</h1>
          {detalle && <p className="text-sm">{detalle}</p>}
          <p className="text-xs text-grafito-500">Emitido el {emitido.toLocaleDateString('es-PY')} a las {emitido.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    </div>
  )
}

/** Líneas de firma al pie de un reporte impreso. */
export function Firmas({ cargos }: { cargos: string[] }) {
  return (
    <div className="solo-imprimir mt-16">
      <div className="flex justify-around gap-8">
        {cargos.map((c) => (
          <div key={c} className="w-56 border-t border-grafito pt-1 text-center text-sm">{c}</div>
        ))}
      </div>
    </div>
  )
}

export function AccionesReporte({ onCSV }: { onCSV?: () => void }) {
  return (
    <div className="no-imprimir flex gap-2">
      {onCSV && <Boton variante="secundario" onClick={onCSV}><Download className="size-4" /> Excel</Boton>}
      <Boton variante="secundario" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Boton>
    </div>
  )
}

/** Cifra destacada de un panel. */
export function Dato({ valor, texto, tono, detalle }: { valor: ReactNode; texto: string; tono?: 'rojo' | 'verde' | 'ambar'; detalle?: ReactNode }) {
  return (
    <Tarjeta className="flex h-full flex-col justify-between p-4">
      <p className="text-sm font-bold text-grafito-500">{texto}</p>
      <p className={cn('mt-1 text-2xl font-extrabold tracking-tight lg:text-[1.65rem]',
        tono === 'rojo' && 'text-ausente', tono === 'verde' && 'text-presente', tono === 'ambar' && 'text-tarde')}
        style={{ fontVariantNumeric: 'tabular-nums' }}>{valor}</p>
      {detalle && <p className="mt-1 text-sm text-grafito-500">{detalle}</p>}
    </Tarjeta>
  )
}

/**
 * Imprime solo su contenido (ej. un recibo) y no el resto de la página.
 * Uso: const [imprimir, zona] = useImpresion(); ... {zona(<Recibo/>)} ... imprimir()
 */
export function useImpresion() {
  const [activa, setActiva] = useState(false)
  useEffect(() => {
    if (!activa) return
    const fin = () => setActiva(false)
    window.addEventListener('afterprint', fin)
    const t = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', fin)
    }
  }, [activa])
  const zona = (contenido: ReactNode) => (activa ? createPortal(<div id="zona-impresion">{contenido}</div>, document.body) : null)
  return [() => setActiva(true), zona] as const
}
