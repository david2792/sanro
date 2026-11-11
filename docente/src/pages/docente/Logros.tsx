import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCheck, ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useImpresion } from '../../components/Reporte'
import { Boton, BotonIcono, Cargando, ErrorCaja, Segmentado, Select, useAviso, Vacio } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { cn, descargarCSV } from '../../lib/utils'

type Marca = 'L' | 'NL' | null
type Indicador = { id: number; descripcion: string; numero: number; capacidad: number }

/** Al tocar una celda: vacío → L → NL → vacío. */
const SIGUIENTE: Record<string, Marca> = { '': 'L', L: 'NL', NL: null }

const ESTILO_MARCA: Record<string, string> = {
  L: 'bg-presente-50 text-presente',
  NL: 'bg-ausente-50 text-ausente',
}

/**
 * Planilla de control de logro de indicadores.
 * El docente marca L (logrado) o NL (no logrado) por alumno e indicador de una unidad.
 */
export default function Logros({ asignacion, irAUnidades }: { asignacion: number; irAUnidades: () => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const unidades = useQuery({ queryKey: ['unidades', asignacion], queryFn: () => lista(`/unidades/?asignacion=${asignacion}`, true) })
  const [unidadId, setUnidadId] = useState<number | null>(null)
  const unidadSel = unidadId ?? unidades.data?.[unidades.data.length - 1]?.id ?? null
  const [capacidadId, setCapacidadId] = useState<number | 'todas'>('todas')
  const [modo, setModo] = useState<'indicador' | 'alumno' | 'planilla'>(() => (window.innerWidth >= 1024 ? 'planilla' : 'indicador'))
  const [indicadorActivo, setIndicadorActivo] = useState<number | null>(null)
  const [cambios, setCambios] = useState<Record<string, Marca>>({})
  const [guardando, setGuardando] = useState(false)
  const [imprimir, zona] = useImpresion()

  const planilla = useQuery({
    queryKey: ['logro', unidadSel],
    enabled: unidadSel != null,
    queryFn: () => api(`/unidades/${unidadSel}/logro/`, { cache: true }),
  })
  const d = planilla.data

  // Indicadores numerados en orden dentro de la unidad (Ind. 1, Ind. 2…), filtrados por capacidad.
  const todos: Indicador[] = useMemo(() => {
    let n = 0
    return (d?.capacidades ?? []).flatMap((c: any) => c.indicadores.map((i: any) => ({ ...i, numero: ++n, capacidad: c.id })))
  }, [d])
  const visibles = capacidadId === 'todas' ? todos : todos.filter((i) => i.capacidad === capacidadId)
  const capacidadesVisibles = (d?.capacidades ?? []).filter((c: any) => capacidadId === 'todas' || c.id === capacidadId)
  const activo = visibles.find((i) => i.id === indicadorActivo) ?? visibles[0]

  const clave = (m: number, i: number) => `${m}-${i}`
  const valor = (a: any, i: number): Marca => {
    const k = clave(a.matricula, i)
    return k in cambios ? cambios[k] : (a.logros[String(i)] ?? null)
  }
  const marcar = (a: any, i: number, v: Marca) => {
    const original = a.logros[String(i)] ?? null
    setCambios((c) => {
      const n = { ...c }
      if (v === original) delete n[clave(a.matricula, i)]
      else n[clave(a.matricula, i)] = v
      return n
    })
  }
  // Cada indicador vale 1 punto si es L y 0 si es NL (o si todavía no se marcó).
  const puntaje = (a: any) => visibles.filter((i) => valor(a, i.id) === 'L').length
  const sinMarcar = (a: any) => visibles.filter((i) => !valor(a, i.id)).length
  const porcentaje = (a: any) => {
    if (!visibles.length || sinMarcar(a) === visibles.length) return null
    return Math.round((puntaje(a) * 1000) / visibles.length) / 10
  }
  const logroIndicador = (i: number) => {
    const marcas = (d?.alumnos ?? []).map((a: any) => valor(a, i)).filter(Boolean)
    return { l: marcas.filter((m: Marca) => m === 'L').length, ev: marcas.length }
  }

  const pendientes = Object.keys(cambios).length
  const vacias = (d?.alumnos ?? []).reduce((s: number, a: any) => s + sinMarcar(a), 0)
  const cambiarUnidad = (id: number) => {
    if (pendientes && !confirm('Hay marcas sin guardar. ¿Descartarlas?')) return
    setCambios({})
    setUnidadId(id)
    setCapacidadId('todas')
    setIndicadorActivo(null)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const logros = Object.entries(cambios).map(([k, estado]) => {
        const [matricula, indicador] = k.split('-').map(Number)
        return { matricula, indicador, estado }
      })
      const r = await api(`/unidades/${unidadSel}/logro/`, { method: 'POST', body: { logros } })
      qc.setQueryData(['logro', unidadSel], r)
      setCambios({})
      avisar('Logros guardados')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const exportar = () => {
    const e = d.encabezado
    descargarCSV(`logro-indicadores-${e.area}-${e.seccion}`.replace(/\s+/g, '-'), [
      ['PLANILLA DE CONTROL DE LOGRO DE INDICADORES'],
      ['Institución', e.institucion, 'Área', e.area],
      ['Curso / Sección', e.seccion, 'Docente', e.docente],
      ['Competencia', e.competencia],
      ['Capacidad', capacidadesVisibles.map((c: any) => c.descripcion).join(' / ')],
      ['Unidad temática', e.unidad],
      [],
      ['N°', 'Apellido y nombre', ...visibles.map((i) => `Ind. ${i.numero}`), `Puntaje (sobre ${visibles.length})`, '% Logro'],
      ['', 'Indicador', ...visibles.map((i) => i.descripcion), '', ''],
      ...d.alumnos.map((a: any, k: number) => [a.numero_lista ?? k + 1, a.alumno, ...visibles.map((i) => valor(a, i.id) ?? ''),
        porcentaje(a) == null ? '' : puntaje(a), porcentaje(a) == null ? '' : `${porcentaje(a)}%`]),
    ])
  }

  if (unidades.isLoading) return <Cargando />
  if (!unidades.data?.length) {
    return <Vacio titulo="Todavía no cargaste unidades" texto="Para armar la planilla, cargá la unidad con su competencia, capacidades e indicadores."
      accion={<Boton onClick={irAUnidades}>Cargar unidades</Boton>} />
  }

  return (
    <div>
      <div className="no-imprimir mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-56">
          <span className="mb-1 block text-sm font-bold text-grafito-600">Unidad temática</span>
          <Select value={unidadSel ?? ''} onChange={(e) => cambiarUnidad(Number(e.target.value))}>
            {unidades.data.map((u: any) => <option key={u.id} value={u.id}>Unidad {u.numero}: {u.titulo}</option>)}
          </Select>
        </label>
        {(d?.capacidades.length ?? 0) > 1 && (
          <label className="min-w-0 flex-1 basis-56">
            <span className="mb-1 block text-sm font-bold text-grafito-600">Capacidad</span>
            <Select value={capacidadId} onChange={(e) => { setCapacidadId(e.target.value === 'todas' ? 'todas' : Number(e.target.value)); setIndicadorActivo(null) }}>
              <option value="todas">Todas las capacidades</option>
              {d.capacidades.map((c: any, k: number) => <option key={c.id} value={c.id}>{k + 1}. {c.descripcion}</option>)}
            </Select>
          </label>
        )}
      </div>

      {planilla.isLoading && <Cargando />}
      <ErrorCaja error={planilla.error} />

      {d && !todos.length && (
        <Vacio titulo="Esta unidad no tiene indicadores" texto="Agregá capacidades e indicadores a la unidad para poder evaluarlos."
          accion={<Boton variante="secundario" onClick={irAUnidades}>Ir a Unidades</Boton>} />
      )}

      {d && todos.length > 0 && (
        <>
          {/* Competencia y capacidad, como en la planilla de papel */}
          <div className="mb-4 space-y-2 rounded-xl border border-grafito-200 bg-white p-4 text-[15px]">
            {d.encabezado.competencia && <p><b className="text-tinta-700">Competencia: </b>{d.encabezado.competencia}</p>}
            {capacidadesVisibles.map((c: any, k: number) => (
              <p key={c.id}><b className="text-tinta-700">Capacidad{capacidadesVisibles.length > 1 ? ` ${k + 1}` : ''}: </b>{c.descripcion}</p>
            ))}
          </div>

          <div className="no-imprimir mb-4 flex flex-wrap items-center justify-between gap-2">
            <Segmentado valor={modo} onChange={setModo} opciones={[
              { valor: 'indicador', label: 'Por indicador' },
              { valor: 'alumno', label: 'Por alumno' },
              { valor: 'planilla', label: 'Planilla' },
            ]} />
            <div className="flex flex-wrap gap-2">
              <Boton variante="fantasma" disabled={!vacias}
                title="Marca L en todo lo que está sin marcar; después corregí solo los NL."
                onClick={() => d.alumnos.forEach((a: any) => visibles.forEach((i) => !valor(a, i.id) && marcar(a, i.id, 'L')))}>
                <CheckCheck className="size-4" /> Todo L en lo vacío
              </Boton>
              <Boton variante="secundario" onClick={exportar}><Download className="size-4" /> Excel</Boton>
              <Boton variante="secundario" onClick={imprimir} disabled={pendientes > 0} title={pendientes ? 'Guardá antes de imprimir' : undefined}>
                <Printer className="size-4" /> Imprimir
              </Boton>
            </div>
          </div>

          {modo === 'indicador' && activo && (
            <PorIndicador indicadores={visibles} activo={activo} onElegir={setIndicadorActivo}
              alumnos={d.alumnos} valor={valor} marcar={marcar} logroIndicador={logroIndicador} />
          )}

          {modo === 'alumno' && d.alumnos.length > 0 && (
            <PorAlumno indicadores={visibles} alumnos={d.alumnos} valor={valor} marcar={marcar} />
          )}

          {modo === 'planilla' && (
            <div className="overflow-x-auto rounded-xl border border-grafito-200 bg-white">
              <table className="w-full min-w-max border-collapse text-left" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="text-sm">
                  <tr className="border-b border-grafito-200 bg-grafito-100/60">
                    <th className="sticky left-0 z-10 bg-grafito-100 px-3 py-2 font-bold">Alumno</th>
                    {visibles.map((i) => (
                      <th key={i.id} className="w-16 px-1 py-2 text-center font-bold" title={i.descripcion}>Ind. {i.numero}</th>
                    ))}
                    <th className="px-3 py-2 text-center font-bold">Puntaje<span className="block font-normal text-grafito-500">de {visibles.length}</span></th>
                    <th className="px-3 py-2 text-center font-bold">% Logro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-grafito-100">
                  {d.alumnos.map((a: any, k: number) => {
                    const p = porcentaje(a)
                    return (
                      <tr key={a.matricula}>
                        <td className="sticky left-0 z-10 max-w-52 truncate bg-white px-3 py-1.5 font-bold">
                          <span className="mr-2 inline-block w-5 text-right text-sm text-grafito-500">{a.numero_lista ?? k + 1}</span>{a.alumno}
                        </td>
                        {visibles.map((i) => {
                          const v = valor(a, i.id)
                          const cambiado = clave(a.matricula, i.id) in cambios
                          return (
                            <td key={i.id} className="p-0.5 text-center">
                              <button onClick={() => marcar(a, i.id, SIGUIENTE[v ?? ''])}
                                aria-label={`${a.alumno}, indicador ${i.numero}: ${v === 'L' ? 'logrado' : v === 'NL' ? 'no logrado' : 'sin marcar'}`}
                                className={cn('h-10 w-full rounded-md text-sm font-bold', v ? ESTILO_MARCA[v] : 'text-grafito-300 hover:bg-grafito-100',
                                  cambiado && 'ring-2 ring-inset ring-tinta-500')}>
                                {v ?? '·'}
                              </button>
                            </td>
                          )
                        })}
                        <td className="px-3 text-center text-lg font-bold text-tinta-700">
                          {p == null ? '—' : puntaje(a)}
                          {p != null && sinMarcar(a) > 0 && <span className="block text-xs font-normal text-tarde">{sinMarcar(a)} sin marcar</span>}
                        </td>
                        <td className="px-3 text-center font-bold">{p == null ? '—' : `${p}%`}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-2 border-grafito-200 text-sm">
                  <tr>
                    <td className="sticky left-0 bg-white px-3 py-2 font-bold text-grafito-600">Lograron</td>
                    {visibles.map((i) => {
                      const { l, ev } = logroIndicador(i.id)
                      return <td key={i.id} className="px-1 text-center text-grafito-600">{ev ? `${Math.round((l * 100) / ev)}%` : '—'}</td>
                    })}
                    <td /><td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {modo === 'planilla' && (
            <details className="mt-3 rounded-xl border border-grafito-200 bg-white px-4 py-2 text-[15px]">
              <summary className="cursor-pointer py-1 font-bold text-tinta-600">Qué evalúa cada indicador</summary>
              <ol className="mt-2 space-y-1">
                {visibles.map((i) => <li key={i.id}><b>Ind. {i.numero}:</b> {i.descripcion}</li>)}
              </ol>
            </details>
          )}
          <p className="no-imprimir mt-2 text-sm text-grafito-500">
            Cada indicador vale 1 punto si es L y 0 si es NL o queda sin marcar. El puntaje de la unidad se suma al total de la etapa en Trabajos › Planilla.{modo === 'planilla' ? ' Tocá una celda para cambiar entre L, NL y vacío.' : ''}
          </p>

          {pendientes > 0 && (
            <div className="sticky bottom-[5.25rem] z-20 mt-4 lg:bottom-4">
              <div className="flex items-center gap-3 rounded-2xl bg-grafito px-4 py-3 text-white shadow-xl">
                <p className="flex-1 text-sm font-bold">{pendientes} {pendientes === 1 ? 'marca' : 'marcas'} sin guardar</p>
                <button onClick={() => setCambios({})} className="text-sm font-bold text-grafito-300">Descartar</button>
                <Boton variante="secundario" className="ring-0" onClick={guardar} cargando={guardando}>Guardar</Boton>
              </div>
            </div>
          )}

          {zona(<PlanillaImpresa d={d} indicadores={visibles} capacidades={capacidadesVisibles} porcentaje={porcentaje} puntaje={puntaje} valor={valor} />)}
        </>
      )}
    </div>
  )
}

/* ---------------------- Modo "por indicador" (celular) ---------------------- */

function PorIndicador({ indicadores, activo, onElegir, alumnos, valor, marcar, logroIndicador }: {
  indicadores: Indicador[]; activo: Indicador; onElegir: (id: number) => void; alumnos: any[]
  valor: (a: any, i: number) => Marca; marcar: (a: any, i: number, v: Marca) => void
  logroIndicador: (i: number) => { l: number; ev: number }
}) {
  const completo = (i: number) => logroIndicador(i).ev === alumnos.length && alumnos.length > 0
  const { l, ev } = logroIndicador(activo.id)
  return (
    <div>
      <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          {indicadores.map((i) => (
            <button key={i.id} onClick={() => onElegir(i.id)}
              className={cn('flex shrink-0 items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm font-bold',
                i.id === activo.id ? 'border-tinta-700 bg-tinta-700 text-white' : 'border-grafito-200 bg-white text-grafito-600')}>
              {completo(i.id) && <Check className="size-3.5" />} Ind. {i.numero}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 rounded-xl border-l-4 border-tinta-500 bg-tinta-50 px-4 py-3">
        <p className="text-sm font-bold text-tinta-700">Indicador {activo.numero}</p>
        <p className="text-[17px] leading-snug">{activo.descripcion}</p>
        <p className="mt-1 text-sm text-grafito-500">{ev} de {alumnos.length} evaluados · {l} lograron</p>
      </div>

      <div className="mb-2 flex justify-end gap-4">
        <button className="text-sm font-bold text-tinta-600" onClick={() => alumnos.forEach((a) => !valor(a, activo.id) && marcar(a, activo.id, 'L'))}>
          Marcar L a los que faltan
        </button>
        <button className="text-sm font-bold text-grafito-500" onClick={() => alumnos.forEach((a) => marcar(a, activo.id, null))}>Limpiar</button>
      </div>

      <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
        {alumnos.map((a, k) => {
          const v = valor(a, activo.id)
          return (
            <li key={a.matricula} className="flex items-center gap-3 px-3 py-2">
              <span className="w-6 shrink-0 text-right text-sm font-bold text-grafito-500">{a.numero_lista ?? k + 1}</span>
              <span className="min-w-0 flex-1 truncate font-bold">{a.alumno}</span>
              <div className="flex shrink-0 gap-1.5">
                {(['L', 'NL'] as const).map((m) => (
                  <button key={m} onClick={() => marcar(a, activo.id, v === m ? null : m)} aria-pressed={v === m}
                    className={cn('h-11 w-14 rounded-control border text-base font-bold',
                      v === m ? (m === 'L' ? 'border-presente bg-presente text-white' : 'border-ausente bg-ausente text-white')
                        : 'border-grafito-200 bg-white text-grafito-500')}>
                    {m}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ---------------------- Modo "por alumno" (corregir en el aula) ---------------------- */

function PorAlumno({ indicadores, alumnos, valor, marcar }: {
  indicadores: Indicador[]; alumnos: any[]
  valor: (a: any, i: number) => Marca; marcar: (a: any, i: number, v: Marca) => void
}) {
  const inicio = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(0)
  const actual = Math.min(pos, alumnos.length - 1)
  const a = alumnos[actual]
  const completo = (al: any) => indicadores.every((i) => valor(al, i.id))
  const marcados = indicadores.filter((i) => valor(a, i.id)).length
  const ir = (n: number) => {
    setPos(Math.max(0, Math.min(alumnos.length - 1, n)))
    inicio.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div ref={inicio} className="scroll-mt-20">
      <div className="mb-3 flex items-center gap-2">
        <BotonIcono onClick={() => ir(actual - 1)} disabled={actual === 0} aria-label="Alumno anterior"><ChevronLeft className="size-6" /></BotonIcono>
        <Select value={actual} onChange={(e) => ir(Number(e.target.value))} aria-label="Elegir alumno">
          {alumnos.map((al, k) => <option key={al.matricula} value={k}>{completo(al) ? '✓ ' : ''}{al.numero_lista ?? k + 1}. {al.alumno}</option>)}
        </Select>
        <BotonIcono onClick={() => ir(actual + 1)} disabled={actual === alumnos.length - 1} aria-label="Alumno siguiente"><ChevronRight className="size-6" /></BotonIcono>
      </div>

      <div className="mb-3 rounded-xl border-l-4 border-tinta-500 bg-tinta-50 px-4 py-3">
        <p className="text-sm font-bold text-tinta-700">Alumno {actual + 1} de {alumnos.length}</p>
        <p className="text-xl font-bold leading-snug">{a.alumno}</p>
        <p className="text-sm text-grafito-500">{marcados} de {indicadores.length} indicadores marcados</p>
      </div>

      <div className="mb-2 flex justify-end gap-4">
        <button className="text-sm font-bold text-tinta-600" onClick={() => indicadores.forEach((i) => !valor(a, i.id) && marcar(a, i.id, 'L'))}>
          Todo L
        </button>
        <button className="text-sm font-bold text-grafito-500" onClick={() => indicadores.forEach((i) => marcar(a, i.id, null))}>Limpiar</button>
      </div>

      <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
        {indicadores.map((i) => {
          const v = valor(a, i.id)
          return (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-tinta-700">Ind. {i.numero}</span>
                <span className="line-clamp-2 leading-snug">{i.descripcion}</span>
              </span>
              <div className="flex shrink-0 gap-1.5">
                {(['L', 'NL'] as const).map((m) => (
                  <button key={m} onClick={() => marcar(a, i.id, v === m ? null : m)} aria-pressed={v === m}
                    className={cn('h-12 w-15 rounded-control border text-lg font-bold',
                      v === m ? (m === 'L' ? 'border-presente bg-presente text-white' : 'border-ausente bg-ausente text-white')
                        : 'border-grafito-200 bg-white text-grafito-500')}>
                    {m}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      <Boton grande className="mt-4 w-full" onClick={() => ir(actual + 1)} disabled={actual === alumnos.length - 1}>
        {actual === alumnos.length - 1 ? 'Es el último alumno' : <>Siguiente alumno <ChevronRight className="size-5" /></>}
      </Boton>
    </div>
  )
}

/* ---------------------- Versión impresa (formato de la planilla) ---------------------- */

function PlanillaImpresa({ d, indicadores, capacidades, porcentaje, puntaje, valor }: {
  d: any; indicadores: Indicador[]; capacidades: any[]; porcentaje: (a: any) => number | null; puntaje: (a: any) => number
  valor: (a: any, i: number) => Marca
}) {
  const e = d.encabezado
  const celda = 'border border-black px-1.5 py-1'
  const etiqueta = `${celda} bg-[#c6d9ef] text-right font-bold`
  return (
    <div className="text-[10.5px] text-black" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <style>{'@page { size: A4 landscape; margin: 9mm; }'}</style>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td colSpan={4} className={`${celda} bg-[#1f4e79] py-1.5 text-white`}>
              <div className="flex items-center justify-center gap-3">
                <img src="/logo-san-roque.png" alt="" className="h-11 w-auto rounded-sm bg-white p-0.5" />
                <span className="text-[15px] font-bold">PLANILLA DE CONTROL DE LOGRO DE INDICADORES</span>
              </div>
            </td>
          </tr>
          <tr><td className={`${etiqueta} w-36`}>Institución:</td><td className={celda}>{e.institucion}</td><td className={`${etiqueta} w-24`}>Área:</td><td className={celda}>{e.area}</td></tr>
          <tr><td className={etiqueta}>Curso / Sección:</td><td className={celda}>{e.seccion}</td><td className={etiqueta}>Docente:</td><td className={celda}>{e.docente}</td></tr>
          <tr><td className={etiqueta}>Competencia:</td><td colSpan={3} className={celda}>{e.competencia}</td></tr>
          {capacidades.map((c: any, k: number) => (
            <tr key={c.id}><td className={etiqueta}>Capacidad{capacidades.length > 1 ? ` ${k + 1}` : ''}:</td><td colSpan={3} className={celda}>{c.descripcion}</td></tr>
          ))}
          <tr><td className={etiqueta}>Unidad temática:</td><td colSpan={3} className={`${celda} bg-[#fff2cc] font-bold`}>{e.unidad}{e.etapa ? ` · ${e.etapa}` : ''}</td></tr>
        </tbody>
      </table>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr>
            <th rowSpan={2} className={`${celda} w-7 bg-[#1f4e79] text-white`}>N°</th>
            <th rowSpan={2} className={`${celda} w-48 bg-[#1f4e79] text-white`}>APELLIDO Y NOMBRE</th>
            {indicadores.map((i) => (
              <th key={i.id} className={`${celda} bg-[#fff2cc] align-top text-[9px] font-normal leading-tight`}>{i.descripcion}</th>
            ))}
            <th rowSpan={2} className={`${celda} w-14 bg-[#1f4e79] text-white`}>Puntaje (de {indicadores.length})</th>
            <th rowSpan={2} className={`${celda} w-14 bg-[#1f4e79] text-white`}>% Logro Alumno</th>
          </tr>
          <tr>
            {indicadores.map((i) => <th key={i.id} className={`${celda} bg-[#c6d9ef]`}>Ind. {i.numero}</th>)}
          </tr>
        </thead>
        <tbody>
          {d.alumnos.map((a: any, k: number) => {
            const p = porcentaje(a)
            return (
              <tr key={a.matricula}>
                <td className={`${celda} text-center`}>{a.numero_lista ?? k + 1}</td>
                <td className={celda}>{a.alumno}</td>
                {indicadores.map((i) => {
                  const v = valor(a, i.id)
                  return (
                    <td key={i.id} className={cn(celda, 'text-center font-bold', v === 'L' && 'bg-[#c6efce] text-[#006100]', v === 'NL' && 'bg-[#ffc7ce] text-[#9c0006]')}>
                      {v ?? ''}
                    </td>
                  )
                })}
                <td className={`${celda} bg-[#e2efda] text-center font-bold`}>{p == null ? '' : puntaje(a)}</td>
                <td className={`${celda} bg-[#e2efda] text-center font-bold`}>{p == null ? '' : `${p.toFixed(1).replace('.', ',')}%`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[9px]">L = Logrado (1 punto) · NL = No logrado (0 puntos). Puntaje = cantidad de indicadores logrados.</p>
      <div className="mt-12 flex justify-around">
        <div className="w-56 border-t border-black pt-1 text-center">Firma del docente</div>
        <div className="w-56 border-t border-black pt-1 text-center">Coordinación pedagógica</div>
      </div>
    </div>
  )
}
