import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AccionesReporte, Dato, EncabezadoImpresion } from '../../components/Reporte'
import { BotonIcono, Cargando, Encabezado, ErrorCaja, Etiqueta, Input, Segmentado, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { cn, descargarCSV, fechaCorta, fechaHora, hoyISO, nombreMes, sumarMes } from '../../lib/utils'

type Estado = 'COMPLETA' | 'PARCIAL' | 'SIN_PLANIFICAR' | 'SIN_HORARIO' | 'SIN_CLASES'
type Filtro = 'TODAS' | 'ATRASADAS' | 'COMPLETA' | 'SIN_HORARIO'

const ESTADO: Record<Estado, { texto: string; tono: 'gris' | 'verde' | 'rojo' | 'ambar' | 'azul' }> = {
  COMPLETA: { texto: 'Mes completo', tono: 'verde' },
  PARCIAL: { texto: 'Incompleta', tono: 'ambar' },
  SIN_PLANIFICAR: { texto: 'Sin planificar', tono: 'rojo' },
  SIN_HORARIO: { texto: 'Sin días de clase', tono: 'gris' },
  SIN_CLASES: { texto: 'Sin clases este mes', tono: 'gris' },
}

const porcentaje = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0)

/** El mes elegido queda en la dirección (?mes=), así se conserva al volver de una materia. */
function useMes() {
  const [params, setParams] = useSearchParams()
  const mes = params.get('mes') || hoyISO().slice(0, 7)
  const setMes = (m: string) => setParams((p) => { p.set('mes', m); return p }, { replace: true })
  return [mes, setMes] as const
}

/** Dirección y coordinación: quiénes van planificando sus clases en el mes. */
export default function ControlPlanificacion() {
  const [mes, setMes] = useMes()
  const [filtro, setFiltro] = useState<Filtro>('TODAS')
  const [q, setQ] = useState('')
  const control = useQuery({ queryKey: ['control-planificacion', mes], queryFn: () => api(`/planificacion/control/?mes=${mes}`) })
  const d = control.data

  const atrasada = (m: any) => m.estado === 'PARCIAL' || m.estado === 'SIN_PLANIFICAR'
  const docentes = useMemo(() => {
    const t = q.toLowerCase()
    const visibles = (d?.materias ?? []).filter((m: any) =>
      (filtro === 'TODAS' || (filtro === 'ATRASADAS' ? atrasada(m) : m.estado === filtro)) &&
      (!t || `${m.docente} ${m.materia} ${m.seccion}`.toLowerCase().includes(t)))
    const grupos = new Map<number, { docente: string; materias: any[] }>()
    for (const m of visibles) {
      if (!grupos.has(m.docente_id)) grupos.set(m.docente_id, { docente: m.docente, materias: [] })
      grupos.get(m.docente_id)!.materias.push(m)
    }
    return [...grupos.values()]
  }, [d, filtro, q])

  const csv = () => descargarCSV(`planificacion-${mes}`, [
    ['Docente', 'Materia', 'Sección', 'Estado', 'Clases del mes', 'Planificadas', '% planificado', 'Dadas', 'Con desarrollo', 'Planificado hasta', 'Última carga'],
    ...(d?.materias ?? []).map((m: any) => [
      m.docente, m.materia, m.seccion, ESTADO[m.estado as Estado].texto, m.clases, m.planificadas,
      porcentaje(m.planificadas, m.clases), m.dadas, m.con_desarrollo, fechaCorta(m.planificado_hasta), fechaHora(m.ultima_carga),
    ]),
  ])

  const r = d?.resumen
  return (
    <div>
      <div className="no-imprimir">
        <Encabezado titulo="Planificación de clases" detalle="Quiénes van planificando sus clases. Tocá una materia para ver su calendario."
          acciones={<AccionesReporte onCSV={d ? csv : undefined} />} />
      </div>
      {d && <EncabezadoImpresion institucion={d.institucion} titulo="Control de planificación de clases"
        detalle={<span className="capitalize">{nombreMes(mes)}</span>} generado={d.generado} />}

      <div className="no-imprimir mb-4 flex items-center gap-1">
        <BotonIcono onClick={() => setMes(sumarMes(mes, -1))} aria-label="Mes anterior"><ChevronLeft className="size-5" /></BotonIcono>
        <h2 className="min-w-40 text-center text-lg font-bold capitalize">{nombreMes(mes)}</h2>
        <BotonIcono onClick={() => setMes(sumarMes(mes, 1))} aria-label="Mes siguiente"><ChevronRight className="size-5" /></BotonIcono>
      </div>

      {control.isLoading && <Cargando />}
      <ErrorCaja error={control.error} />

      {d && r && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato texto="Mes completo" valor={r.COMPLETA} tono="verde" />
            <Dato texto="Incompletas" valor={r.PARCIAL} tono="ambar" />
            <Dato texto="Sin planificar" valor={r.SIN_PLANIFICAR} tono="rojo" />
            <Dato texto="Sin días de clase" valor={r.SIN_HORARIO} detalle="No se puede calendarizar" />
          </div>

          <div className="no-imprimir mb-4 flex flex-wrap items-center gap-3">
            <Segmentado valor={filtro} onChange={setFiltro} opciones={[
              { valor: 'TODAS', label: 'Todas' },
              { valor: 'ATRASADAS', label: `Atrasadas ${r.PARCIAL + r.SIN_PLANIFICAR}` },
              { valor: 'COMPLETA', label: `Completas ${r.COMPLETA}` },
              { valor: 'SIN_HORARIO', label: `Sin días ${r.SIN_HORARIO}` },
            ]} />
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-grafito-500" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar docente, materia o sección…" className="pl-10" />
            </div>
          </div>

          {!docentes.length ? <Vacio titulo="Nada en esta lista" /> : (
            <div className="space-y-5">
              {docentes.map((g) => {
                const clases = g.materias.reduce((s, m) => s + m.clases, 0)
                const planificadas = g.materias.reduce((s, m) => s + m.planificadas, 0)
                return (
                  <section key={g.docente} style={{ breakInside: 'avoid' }}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <h3 className="font-bold">{g.docente}</h3>
                      {clases > 0 && <span className="text-sm text-grafito-500">{planificadas} de {clases} clases · {porcentaje(planificadas, clases)}%</span>}
                    </div>
                    <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
                      {g.materias.map((m) => <FilaMateria key={m.asignacion} m={m} mes={mes} />)}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FilaMateria({ m, mes }: { m: any; mes: string }) {
  const e = ESTADO[m.estado as Estado]
  const pct = porcentaje(m.planificadas, m.clases)
  return (
    <li>
      <Link to={`/seguimiento/${m.asignacion}?t=planificacion&desde=planificacion&mes=${mes}`} className="flex items-center gap-3 px-4 py-3 hover:bg-tinta-50/60 active:bg-tinta-50">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{m.materia} <span className="font-normal text-grafito-500">· {m.seccion}</span></p>
          {m.clases > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2 max-w-60 flex-1 overflow-hidden rounded-full bg-grafito-100">
                <div className={cn('h-full rounded-full', pct === 100 ? 'bg-presente' : pct ? 'bg-tarde' : 'bg-ausente')} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-sm font-bold">{m.planificadas}/{m.clases}</span>
            </div>
          )}
          <p className="mt-1 text-sm text-grafito-500">
            {[
              m.dadas && `${m.dadas} dadas (${m.con_desarrollo} con desarrollo)`,
              m.planificado_hasta ? `planificado hasta el ${fechaCorta(m.planificado_hasta)}` : 'nunca planificó',
              m.ultima_carga && `última carga ${fechaHora(m.ultima_carga)}`,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
        <ChevronRight className="no-imprimir size-5 shrink-0 text-grafito-300" />
      </Link>
    </li>
  )
}

