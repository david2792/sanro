import { useState } from 'react'
import { cn, miles } from '../lib/utils'
import { useAncho } from './Graficos'

/*
  Gráficos de los reportes (aportes y ausencias).
  Colores: los de estado del sistema, en un orden validado para daltonismo
  (ver COLORES). La identidad nunca depende solo del color: siempre hay
  leyenda y el desglose escrito debajo de cada barra.
*/

export const COLORES = {
  presente: 'var(--color-presente)',
  ausente: 'var(--color-ausente)',
  justificado: 'var(--color-justificado)',
  tarde: 'var(--color-tarde)',
  neutro: 'var(--color-grafito-300)',
  tinta: 'var(--color-tinta-600)',
}

export type Serie = { nombre: string; color: string }

export function Leyenda({ series }: { series: Serie[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-grafito-600">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: s.color }} /> {s.nombre}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------------ */
/* Barras horizontales apiladas: composición por fila (sección, mes, curso) */
/* ------------------------------------------------------------------------ */

export type FilaApilada = { id: number | string; nombre: string; valores: number[]; derecha?: string; detalle?: string }

export function Apiladas({ filas, series, maximo, formato = miles, onTocar, vacio = 'Sin datos todavía.' }: {
  filas: FilaApilada[]
  series: Serie[]
  /** Escala común (ej. el mayor %). Sin definir, cada barra es su propio 100%. */
  maximo?: number
  formato?: (n: number) => string
  onTocar?: (id: any) => void
  vacio?: string
}) {
  if (!filas.length) return <p className="py-8 text-center text-grafito-500">{vacio}</p>
  return (
    <div>
      <div className="mb-3"><Leyenda series={series} /></div>
      <ul className="space-y-1">
        {filas.map((f) => {
          const total = f.valores.reduce((a, b) => a + b, 0)
          const escala = maximo ?? total
          const desglose = f.detalle ?? series.map((s, i) => `${s.nombre} ${formato(f.valores[i])}`).join(' · ')
          return (
            <li key={f.id}>
              <button type="button" onClick={() => onTocar?.(f.id)} disabled={!onTocar}
                className={cn('w-full rounded-lg px-2 py-2 text-left', onTocar && 'hover:bg-tinta-50/70 active:bg-tinta-50')}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-bold">{f.nombre}</span>
                  {f.derecha && <span className="shrink-0 text-sm font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{f.derecha}</span>}
                </div>
                <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded bg-grafito-100" role="img" aria-label={`${f.nombre}: ${desglose}`}>
                  {escala > 0 && f.valores.map((v, i) => v > 0 && (
                    <div key={i} className="h-full first:rounded-l last:rounded-r" title={`${series[i].nombre}: ${formato(v)}`}
                      style={{ width: `${(v / escala) * 100}%`, background: series[i].color }} />
                  ))}
                </div>
                <p className="mt-1 truncate text-xs text-grafito-500">{desglose}</p>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Columnas: una serie en el tiempo (recaudación por mes, ausencia por mes) */
/* ------------------------------------------------------------------------ */

export type Columna = { clave: string; etiqueta: string; valor: number | null; detalle?: string }

export function Columnas({ datos, formato, formatoEje = formato, color = COLORES.tinta, alto = 220, titulo }: {
  datos: Columna[]
  formato: (n: number) => string
  formatoEje?: (n: number) => string
  color?: string
  alto?: number
  titulo: string
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  if (!datos.some((d) => d.valor)) return <p className="py-12 text-center text-grafito-500">Sin datos en este período.</p>

  const m = { izq: 52, der: 8, arr: 18, aba: 26 }
  const w = Math.max(ancho - m.izq - m.der, 10)
  const h = alto - m.arr - m.aba
  const maxV = Math.max(...datos.map((d) => d.valor ?? 0))
  const tope = escalaRedonda(maxV)
  const paso = w / datos.length
  const anchoBarra = Math.min(Math.max(paso - 6, 4), 44)
  const y = (v: number) => m.arr + h - (v / tope) * h
  const iMax = datos.findIndex((d) => d.valor === maxV)
  const sel = activo != null ? datos[activo] : null

  return (
    <div ref={ref} className="relative select-none" onPointerLeave={() => setActivo(null)}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="img" aria-label={titulo} className="overflow-visible">
          {[0, tope / 2, tope].map((t) => (
            <g key={t}>
              <line x1={m.izq} x2={m.izq + w} y1={y(t)} y2={y(t)} stroke="var(--color-grafito-200)" strokeDasharray={t ? '3 3' : undefined} />
              <text x={m.izq - 6} y={y(t) + 4} textAnchor="end" className="fill-grafito-500 text-[11px]">{formatoEje(t)}</text>
            </g>
          ))}
          {datos.map((d, i) => {
            const v = d.valor ?? 0
            const x = m.izq + i * paso + (paso - anchoBarra) / 2
            const alturaBarra = Math.max(y(0) - y(v), v ? 2 : 0)
            const r = Math.min(4, anchoBarra / 2, alturaBarra)
            const yTop = y(0) - alturaBarra
            return (
              <g key={d.clave} onPointerEnter={() => setActivo(i)} onPointerDown={() => setActivo(i)}>
                {/* zona de toque más grande que la barra */}
                <rect x={m.izq + i * paso} y={m.arr} width={paso} height={h} fill="transparent" />
                {alturaBarra > 0 && (
                  <path fill={color} opacity={activo == null || activo === i ? 1 : 0.55}
                    d={`M${x},${y(0)} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + anchoBarra - r} Q${x + anchoBarra},${yTop} ${x + anchoBarra},${yTop + r} V${y(0)} Z`} />
                )}
                {i === iMax && activo == null && (
                  <text x={x + anchoBarra / 2} y={yTop - 5} textAnchor="middle" className="fill-grafito text-[11px] font-bold">{formato(v)}</text>
                )}
                {(datos.length <= 12 || i % Math.ceil(datos.length / 12) === 0) && (
                  <text x={m.izq + i * paso + paso / 2} y={alto - 8} textAnchor="middle" className="fill-grafito-500 text-[11px]">{d.etiqueta}</text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {sel && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-lg bg-grafito px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.min(Math.max(m.izq + activo! * paso + paso / 2 - 70, 0), Math.max(ancho - 150, 0)) }}>
          <p className="font-bold">{sel.etiqueta}</p>
          <p className="text-sm font-bold">{sel.valor == null ? 'Sin datos' : formato(sel.valor)}</p>
          {sel.detalle && <p className="text-grafito-300">{sel.detalle}</p>}
        </div>
      )}
    </div>
  )
}

/** Redondea el máximo del eje a un número cómodo (1, 2, 2.5, 5 × 10^n). */
function escalaRedonda(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= v) return f * p
  return 10 * p
}
