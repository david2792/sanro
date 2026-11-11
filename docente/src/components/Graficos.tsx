import { AlertTriangle, ArrowUpDown } from 'lucide-react'
import { useEffect, useRef, useState, useMemo } from 'react'
import { cn, fechaCorta } from '../lib/utils'

/** Ancho del contenedor, para dibujar el SVG a escala real y nítido */
export function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho] as const
}

export type PuntoAsistencia = { fecha: string; porcentaje: number | null; registros: number }

/** Calcula curva suave cúbica Bezier para la serie de tiempo */
function calcularCurvaSuave(puntos: { x: number; y: number }[]): string {
  if (puntos.length === 0) return ''
  if (puntos.length === 1) return `M ${puntos[0].x} ${puntos[0].y}`
  let d = `M ${puntos[0].x.toFixed(1)} ${puntos[0].y.toFixed(1)}`
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i === 0 ? i : i - 1]
    const p1 = puntos[i]
    const p2 = puntos[i + 1]
    const p3 = puntos[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

/* ========================================================================== */
/* 1. LÍNEA DE ASISTENCIA EJECUTIVA (Curva Suave, Filtros, Estadísticas)      */
/* ========================================================================== */

export function LineaAsistencia({
  datos,
  minimo,
  alto = 240,
}: {
  datos: PuntoAsistencia[]
  minimo: number
  alto?: number
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const [filtroDias, setFiltroDias] = useState<7 | 14 | 30>(30)

  // Filtrar según el rango seleccionado
  const datosFiltrados = useMemo(() => {
    const validos = datos.filter((d) => d.porcentaje != null)
    if (filtroDias === 30) return validos.slice(-30)
    if (filtroDias === 14) return validos.slice(-14)
    return validos.slice(-7)
  }, [datos, filtroDias])

  const pts = datosFiltrados

  // Estadísticas clave para el Director
  const metricas = useMemo(() => {
    if (pts.length === 0) return null
    const valores = pts.map((p) => p.porcentaje!)
    const suma = valores.reduce((a, b) => a + b, 0)
    const promedio = Math.round(suma / valores.length)
    const maximo = Math.max(...valores)
    const diaMax = pts.find((p) => p.porcentaje === maximo)
    const bajoMinimo = pts.filter((p) => p.porcentaje! < minimo).length
    const ultimo = pts[pts.length - 1].porcentaje!
    const primero = pts[0].porcentaje!
    const tendencia = ultimo - primero
    return { promedio, maximo, diaMax, bajoMinimo, tendencia, ultimo }
  }, [pts, minimo])

  if (pts.length < 2) {
    return (
      <div className="py-12 text-center text-grafito-500">
        <p className="font-bold">Hacen falta al menos dos días con listas para ver la evolución gráfica.</p>
        <p className="text-sm mt-1">Los datos aparecerán automáticamente conforme los docentes llamen lista.</p>
      </div>
    )
  }

  const m = { izq: 38, der: 16, arr: 20, aba: 28 }
  const w = Math.max(ancho - m.izq - m.der, 10)
  const h = alto - m.arr - m.aba

  const minY = Math.max(0, Math.floor(Math.min(minimo, ...pts.map((p) => p.porcentaje!)) / 10) * 10 - 10)
  const maxY = 100
  const y = (v: number) => m.arr + h - ((v - minY) / (maxY - minY)) * h
  const x = (i: number) => m.izq + (pts.length === 1 ? w / 2 : (i * w) / (pts.length - 1))

  const puntosCoordenadas = pts.map((p, i) => ({ x: x(i), y: y(p.porcentaje!) }))
  const lineaPath = calcularCurvaSuave(puntosCoordenadas)
  const areaPath = `${lineaPath} L ${x(pts.length - 1).toFixed(1)} ${(m.arr + h).toFixed(1)} L ${x(0).toFixed(1)} ${(m.arr + h).toFixed(1)} Z`

  const ticks = [minY, Math.round(minY + (100 - minY) / 2), 100]
  const sel = activo != null ? pts[activo] : null

  const mover = (clientX: number) => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const rel = clientX - r.left - m.izq
    const indice = Math.max(0, Math.min(pts.length - 1, Math.round((rel / w) * (pts.length - 1))))
    setActivo(indice)
  }

  return (
    <div className="space-y-3">
      {/* Selector de período y resumen rápido superior */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-grafito-100 pb-2">
        <div className="flex items-center gap-2">
          {metricas && (
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span className="text-grafito-500">Promedio:</span>
              <span className={cn('rounded px-1.5 py-0.5 text-white', metricas.promedio >= minimo ? 'bg-tinta-700' : 'bg-ausente')}>
                {metricas.promedio}%
              </span>
              <span className="text-grafito-300">·</span>
              <span className="text-grafito-500">Pico:</span>
              <span className="text-presente font-bold">{metricas.maximo}%</span>
            </div>
          )}
        </div>

        <div className="inline-flex rounded-lg bg-grafito-100 p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setFiltroDias(7)}
            className={cn('rounded-md px-2 py-0.5 transition-colors', filtroDias === 7 ? 'bg-white text-tinta-700 shadow-xs' : 'text-grafito-500')}
          >
            7 días
          </button>
          <button
            type="button"
            onClick={() => setFiltroDias(14)}
            className={cn('rounded-md px-2 py-0.5 transition-colors', filtroDias === 14 ? 'bg-white text-tinta-700 shadow-xs' : 'text-grafito-500')}
          >
            14 días
          </button>
          <button
            type="button"
            onClick={() => setFiltroDias(30)}
            className={cn('rounded-md px-2 py-0.5 transition-colors', filtroDias === 30 ? 'bg-white text-tinta-700 shadow-xs' : 'text-grafito-500')}
          >
            30 días
          </button>
        </div>
      </div>

      {/* Gráfico SVG interactivo */}
      <div ref={ref} className="relative select-none" onPointerLeave={() => setActivo(null)}>
        {ancho > 0 && (
          <svg
            width={ancho}
            height={alto}
            role="img"
            aria-label="Gráfico de asistencia diaria del colegio"
            onPointerMove={(e) => mover(e.clientX)}
            onPointerDown={(e) => mover(e.clientX)}
            className="touch-pan-y overflow-visible"
          >
            <defs>
              <linearGradient id="gradAsistencia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a4fb0" stopOpacity="0.32" />
                <stop offset="70%" stopColor="#3b5fc4" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#3b5fc4" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="gradLinea" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1d3b8b" />
                <stop offset="100%" stopColor="#3b5fc4" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1d3b8b" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* Guías horizontales */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.izq} x2={m.izq + w} y1={y(t)} y2={y(t)} stroke="var(--color-grafito-100)" strokeWidth={1} strokeDasharray="3 3" />
                <text x={m.izq - 6} y={y(t) + 4} textAnchor="end" className="fill-grafito-400 text-[11px] font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {t}%
                </text>
              </g>
            ))}

            {/* Línea de umbral mínimo institucional */}
            <g>
              <line x1={m.izq} x2={m.izq + w} y1={y(minimo)} y2={y(minimo)} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" />
              <rect x={m.izq + 4} y={y(minimo) - 10} width={76} height={18} rx={4} fill="#fee2e2" />
              <text x={m.izq + 42} y={y(minimo) + 3} textAnchor="middle" className="fill-ausente text-[10px] font-bold">
                Meta {minimo}%
              </text>
            </g>

            {/* Relleno con degradado */}
            <path d={areaPath} fill="url(#gradAsistencia)" />

            {/* Línea curva principal con sombra suave */}
            <path d={lineaPath} fill="none" stroke="url(#gradLinea)" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />

            {/* Fechas inicio y fin */}
            <text x={m.izq} y={alto - 6} className="fill-grafito-500 text-[11px] font-bold">
              {fechaCorta(pts[0].fecha)}
            </text>
            <text x={m.izq + w} y={alto - 6} textAnchor="end" className="fill-grafito-500 text-[11px] font-bold">
              {fechaCorta(pts[pts.length - 1].fecha)}
            </text>

            {/* Puntos destacados en la línea */}
            {pts.map((p, i) => {
              const cx = x(i)
              const cy = y(p.porcentaje!)
              const esActivo = activo === i
              const esBajo = p.porcentaje! < minimo
              return (
                <circle
                  key={p.fecha}
                  cx={cx}
                  cy={cy}
                  r={esActivo ? 6.5 : i === pts.length - 1 ? 5 : 3.5}
                  fill={esBajo ? '#ef4444' : '#1d3b8b'}
                  stroke="#ffffff"
                  strokeWidth={esActivo ? 2.5 : 1.5}
                  className="transition-all duration-150"
                />
              )
            })}

            {/* Cursor vertical al interactuar */}
            {sel && activo != null && (
              <line
                x1={x(activo)}
                x2={x(activo)}
                y1={m.arr}
                y2={m.arr + h}
                stroke="var(--color-tinta-500)"
                strokeWidth={1.5}
                strokeDasharray="2 2"
              />
            )}
          </svg>
        )}

        {/* Tooltip flotante con información directiva */}
        {sel && (
          <div
            className="pointer-events-none absolute -top-2 rounded-xl bg-grafito/95 p-3 text-xs text-white shadow-xl backdrop-blur-md anim-aparecer z-10"
            style={{
              left: Math.min(Math.max(x(activo!) - 80, 0), ancho - 160),
            }}
          >
            <p className="font-bold text-sm text-tinta-100">{fechaCorta(sel.fecha)}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={cn('text-lg font-bold', sel.porcentaje! >= minimo ? 'text-emerald-400' : 'text-rose-400')}>
                {sel.porcentaje}%
              </span>
              <span className="text-grafito-300">asistencia</span>
            </div>
            <p className="mt-0.5 text-grafito-300">{sel.registros} alumnos registrados</p>
            {sel.porcentaje! < minimo && (
              <p className="mt-1 font-bold text-rose-300 flex items-center gap-1">
                <AlertTriangle className="size-3" /> Debajo del mínimo
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ========================================================================== */
/* 2. MEDIDOR CIRCULAR / DONUT DE ASISTENCIA DEL DÍA                         */
/* ========================================================================== */

export function DonutAsistenciaHoy({
  porcentaje,
  presentes,
  totalRegistros,
  minimo = 75,
}: {
  porcentaje: number | null
  presentes: number
  totalRegistros: number
  minimo?: number
}) {
  const radio = 42
  const perimetro = 2 * Math.PI * radio
  const pct = Math.min(Math.max(porcentaje ?? 0, 0), 100)
  const offset = perimetro - (pct / 100) * perimetro

  const estado =
    porcentaje == null
      ? 'sin-datos'
      : pct >= 85
      ? 'optimo'
      : pct >= minimo
      ? 'regular'
      : 'critico'

  const colorCirculo = {
    'sin-datos': '#94a3b8',
    optimo: '#10b981',
    regular: '#3b82f6',
    critico: '#ef4444',
  }[estado]

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative size-36">
        <svg className="size-full -rotate-90 transform" viewBox="0 0 100 100">
          {/* Fondo gris claro */}
          <circle
            cx="50"
            cy="50"
            r={radio}
            fill="transparent"
            stroke="var(--color-grafito-100)"
            strokeWidth="10"
          />
          {/* Anillo de asistencia coloreado */}
          <circle
            cx="50"
            cy="50"
            r={radio}
            fill="transparent"
            stroke={colorCirculo}
            strokeWidth="10"
            strokeDasharray={perimetro}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Contenido central */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {porcentaje == null ? (
            <span className="text-xs font-bold text-grafito-400">Sin listas</span>
          ) : (
            <>
              <span className="text-3xl font-extrabold leading-none text-grafito">
                {porcentaje}
                <span className="text-sm font-bold text-grafito-500">%</span>
              </span>
              <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-grafito-500">
                Presentismo
              </span>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 text-center">
        <p className="text-xs font-bold text-grafito-600">
          {presentes} de {totalRegistros} presentes
        </p>
        <span
          className={cn(
            'mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
            estado === 'optimo' && 'bg-emerald-50 text-emerald-700',
            estado === 'regular' && 'bg-blue-50 text-blue-700',
            estado === 'critico' && 'bg-rose-50 text-rose-700',
            estado === 'sin-datos' && 'bg-gray-100 text-gray-600'
          )}
        >
          {estado === 'optimo' && '⭐ Asistencia Óptima'}
          {estado === 'regular' && '👍 Nivel Normal'}
          {estado === 'critico' && '⚠️ Requiere Atención'}
          {estado === 'sin-datos' && 'Esperando listas'}
        </span>
      </div>
    </div>
  )
}

/* ========================================================================== */
/* 3. BARRAS COMPARATIVAS DE SECCIONES CON SEMÁFORO Y ORDENAMIENTO            */
/* ========================================================================== */

export function BarrasPorcentaje({
  filas,
  minimo,
  etiquetaMinimo = 'Mínimo institucional',
  onTocar,
}: {
  filas: {
    id: number | string
    nombre: string
    detalle?: string
    valor: number | null
  }[]
  minimo: number
  etiquetaMinimo?: string
  onTocar?: (id: any) => void
}) {
  const [orden, setOrden] = useState<'asc' | 'desc'>('asc')

  const ordenadas = useMemo(() => {
    return [...filas].sort((a, b) => {
      const vA = a.valor ?? -1
      const vB = b.valor ?? -1
      return orden === 'asc' ? vA - vB : vB - vA
    })
  }, [filas, orden])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2 text-xs font-bold text-grafito-500">
        <span>Ranking de Secciones ({filas.length})</span>
        <button
          type="button"
          onClick={() => setOrden(orden === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1 text-tinta-600 hover:text-tinta-800"
        >
          <ArrowUpDown className="size-3.5" />
          {orden === 'asc' ? 'En riesgo primero' : 'Mayor asistencia'}
        </button>
      </div>

      <ul className="space-y-1.5">
        {ordenadas.map((f) => {
          const bajo = f.valor != null && f.valor < minimo
          const excelente = f.valor != null && f.valor >= 88

          const barraColor =
            f.valor == null
              ? 'bg-grafito-200'
              : bajo
              ? 'bg-rose-500'
              : excelente
              ? 'bg-emerald-500'
              : 'bg-tinta-600'

          return (
            <li key={f.id}>
              <button
                onClick={() => onTocar?.(f.id)}
                disabled={!onTocar}
                className={cn(
                  'group w-full rounded-xl p-2.5 text-left transition-all',
                  onTocar && 'hover:bg-tinta-50/70 active:bg-tinta-50 hover:shadow-xs'
                )}
              >
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-bold text-sm text-grafito">{f.nombre}</span>
                    {bajo && (
                      <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                        Alerta
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-bold',
                      bajo ? 'text-rose-600' : excelente ? 'text-emerald-600' : 'text-grafito'
                    )}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {f.valor == null ? (
                      <span className="font-normal text-grafito-400">Sin datos</span>
                    ) : (
                      `${f.valor}%`
                    )}
                  </span>
                </div>

                <div className="relative h-3 w-full rounded-full bg-grafito-100 overflow-hidden">
                  {f.valor != null && (
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', barraColor)}
                      style={{ width: `${Math.max(f.valor, 2)}%` }}
                    />
                  )}
                  {/* Marcador del mínimo */}
                  <div
                    className="absolute inset-y-0 w-0.5 bg-grafito/60 z-10"
                    style={{ left: `${minimo}%` }}
                    title={`${etiquetaMinimo} (${minimo}%)`}
                  />
                </div>

                {f.detalle && (
                  <p className="mt-1 text-xs text-grafito-500 truncate">
                    {f.detalle}
                  </p>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between px-2 pt-2 border-t border-grafito-100 text-[11px] text-grafito-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-rose-500" /> Bajo meta (&lt;{minimo}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-tinta-600" /> Normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-emerald-500" /> Óptimo (&gt;88%)
        </span>
      </div>
    </div>
  )
}
