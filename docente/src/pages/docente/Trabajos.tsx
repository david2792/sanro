import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { Boton, BotonIcono, Campo, Cargando, Casilla, Confirmar, ErrorCaja, Etiqueta, Hoja, Input, Segmentado, Select, Textarea, useAviso, Vacio } from '../../components/ui'
import { usePaginacion } from '../../components/Crud'
import { api, lista } from '../../lib/api'
import { cn, fechaCorta, hoyISO } from '../../lib/utils'
import { useClase, useEtapas } from './Clase'
import { SemanaEvaluaciones } from './EvaluacionesCurso'
import { FichaAlumno } from './FichaAlumno'

export const TIPOS_TRABAJO = [
  { valor: 'PRACTICO', label: 'Trabajo práctico' },
  { valor: 'PRUEBA', label: 'Prueba escrita' },
  { valor: 'INVESTIGACION', label: 'Trabajo de investigación' },
  { valor: 'EXPOSICION', label: 'Exposición oral' },
  { valor: 'CARPETA', label: 'Carpeta / cuaderno' },
  { valor: 'PROYECTO', label: 'Proyecto' },
  { valor: 'LISTA_COTEJO', label: 'Lista de cotejo' },
  { valor: 'RUBRICA', label: 'Rúbrica' },
  { valor: 'OTRO', label: 'Otro' },
]
const tipoTexto = (t: string) => TIPOS_TRABAJO.find((x) => x.valor === t)?.label ?? t
const num = (v: any) => (v == null ? '' : String(Number(v)))

export default function Trabajos({ asignacion, seccion }: { asignacion: number; seccion: number }) {
  const etapas = useEtapas(seccion)
  const { alumnos } = useClase(asignacion)
  const [etapa, setEtapa] = useState<number | null>(null)
  const [vista, setVista] = useState<'trabajos' | 'planilla' | 'pendientes' | 'curso'>('trabajos')
  const [abierto, setAbierto] = useState<any | null>(null)
  const [editar, setEditar] = useState<any | null | undefined>(undefined)
  const etapaId = etapa ?? etapas.data?.actual?.id ?? null

  const trabajos = useQuery({
    queryKey: ['instrumentos', asignacion, etapaId],
    enabled: etapaId != null,
    queryFn: () => lista(`/instrumentos/?asignacion=${asignacion}&etapa=${etapaId}`, true),
  })
  const { visibles: trabajosVisibles, paginador } = usePaginacion(trabajos.data ?? [], 15)

  if (etapas.isLoading) return <Cargando />
  if (!etapas.data?.etapas.length) return <Vacio titulo="El año lectivo no tiene etapas" texto="Coordinación debe cargar las etapas para poder crear trabajos." />
  if (abierto) return <Puntajes instrumento={abierto} seccion={seccion} etapas={etapas.data.etapas} onVolver={() => setAbierto(null)} />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={etapaId ?? ''} onChange={(e) => setEtapa(Number(e.target.value))} className="w-auto">
          {etapas.data.etapas.map((e: any) => <option key={e.id} value={e.id}>{e.numero}ª {e.nombre}</option>)}
        </Select>
        <Segmentado valor={vista} onChange={setVista} opciones={[
          { valor: 'trabajos', label: 'Trabajos' }, { valor: 'planilla', label: 'Planilla' }, { valor: 'pendientes', label: 'Pendientes' },
          { valor: 'curso', label: 'Del curso' },
        ]} />
        <Boton className="ml-auto" onClick={() => setEditar(null)}><Plus className="size-5" /> Trabajo</Boton>
      </div>

      {vista === 'planilla' && <Planilla asignacion={asignacion} etapa={etapaId!} />}
      {vista === 'pendientes' && <Pendientes asignacion={asignacion} etapa={etapaId!} />}
      {vista === 'curso' && (
        <div className="space-y-2">
          <p className="text-grafito-600">Las pruebas y trabajos de todas las materias de esta sección. Tu materia aparece en azul.</p>
          <SemanaEvaluaciones seccion={seccion} fecha={hoyISO()} aviso={false} />
        </div>
      )}
      {vista === 'trabajos' && (
        <>
          {trabajos.isLoading && <Cargando />}
          {trabajos.data && !trabajos.data.length && (
            <Vacio titulo="Sin trabajos en esta etapa" texto="Creá un trabajo con su puntaje total y después cargá lo que logró cada alumno." />
          )}
          <ul className="space-y-3">
            {trabajosVisibles.map((t: any) => {
              // Pasada la fecha, el que no tiene puntaje lo debe.
              const deben = alumnos.data && t.fecha <= hoyISO() ? Math.max(0, alumnos.data.length - t.evaluados) : 0
              return (
              <li key={t.id}>
                <button onClick={() => setAbierto(t)} className="flex w-full items-center gap-4 rounded-xl border border-grafito-200 bg-white px-4 py-3.5 text-left active:bg-tinta-50">
                  <div className="grid w-14 shrink-0 place-items-center rounded-lg bg-tinta-50 py-1.5 text-tinta-700">
                    <span className="text-xl font-bold leading-none">{num(t.puntaje_total)}</span>
                    <span className="text-xs">puntos</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug">{t.titulo}</p>
                    <p className="text-sm text-grafito-500">{tipoTexto(t.tipo)} · {fechaCorta(t.fecha)}</p>
                    <p className="text-sm font-bold">
                      <span className={t.evaluados ? 'text-presente' : 'text-tarde'}>
                        {t.evaluados ? `${t.evaluados} con puntaje` : 'Sin puntajes cargados'}
                      </span>
                      {deben > 0 && t.evaluados > 0 && <span className="text-tarde"> · {deben} {deben === 1 ? 'debe' : 'deben'}</span>}
                    </p>
                  </div>
                  <ChevronRight className="size-5 text-grafito-300" />
                </button>
              </li>
              )
            })}
          </ul>
          {paginador}
        </>
      )}

      {editar !== undefined && (
        <FormTrabajo asignacion={asignacion} seccion={seccion} etapas={etapas.data.etapas} etapa={etapaId} registro={editar} onCerrar={() => setEditar(undefined)} />
      )}
    </div>
  )
}

function FormTrabajo({ asignacion, seccion, etapas, etapa, registro, onCerrar, onEliminado }: {
  asignacion: number; seccion: number; etapas: any[]; etapa: number | null; registro: any | null; onCerrar: () => void; onEliminado?: () => void
}) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const unidades = useQuery({ queryKey: ['unidades', asignacion], queryFn: () => lista(`/unidades/?asignacion=${asignacion}`, true) })
  const [v, setV] = useState<any>(registro ? { ...registro, puntaje_total: num(registro.puntaje_total) } :
    { tipo: 'PRACTICO', titulo: '', descripcion: '', fecha: hoyISO(), puntaje_total: '', etapa, indicadores: [] })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [borrar, setBorrar] = useState(false)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const body = { asignacion, tipo: v.tipo, titulo: v.titulo, descripcion: v.descripcion, fecha: v.fecha, puntaje_total: v.puntaje_total, etapa: v.etapa, indicadores: v.indicadores }
      await api(registro ? `/instrumentos/${registro.id}/` : '/instrumentos/', { method: registro ? 'PATCH' : 'POST', body })
      await qc.invalidateQueries({ queryKey: ['instrumentos', asignacion] })
      await qc.invalidateQueries({ queryKey: ['planilla', asignacion] })
      void qc.invalidateQueries({ queryKey: ['evaluaciones', seccion] })
      void qc.invalidateQueries({ queryKey: ['calendario', asignacion] })
      avisar(registro ? 'Trabajo actualizado' : 'Trabajo creado')
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    try {
      await api(`/instrumentos/${registro.id}/`, { method: 'DELETE' })
      await qc.invalidateQueries({ queryKey: ['instrumentos', asignacion] })
      void qc.invalidateQueries({ queryKey: ['evaluaciones', seccion] })
      void qc.invalidateQueries({ queryKey: ['calendario', asignacion] })
      avisar('Trabajo eliminado')
      onEliminado?.()
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
      setBorrar(false)
    }
  }

  const indicadores = (unidades.data ?? []).flatMap((u: any) => u.capacidades.flatMap((c: any) => c.indicadores.map((i: any) => ({ ...i, unidad: u }))))

  return (
    <>
      <Hoja abierta titulo={registro ? 'Editar trabajo' : 'Nuevo trabajo'} onCerrar={onCerrar}
        pie={<>
          {registro && <Boton type="button" variante="secundario" className="text-ausente" onClick={() => setBorrar(true)}>Eliminar</Boton>}
          <Boton type="submit" form="form-trabajo" className="flex-1" cargando={guardando}>Guardar</Boton>
        </>}>
        <form id="form-trabajo" onSubmit={guardar} className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Campo label="Título" className="col-span-2"><Input value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} required placeholder="Ej.: Trabajo práctico 1" /></Campo>
          <Campo label="Tipo" className="col-span-2">
            <Select value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })}>
              {TIPOS_TRABAJO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </Select>
          </Campo>
          <Campo label="Puntaje total"><Input type="number" inputMode="decimal" step="0.5" min="0.5" value={v.puntaje_total} onChange={(e) => setV({ ...v, puntaje_total: e.target.value })} required /></Campo>
          <Campo label="Fecha"><Input type="date" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} required /></Campo>
          {v.fecha && (
            <div className="col-span-2">
              <SemanaEvaluaciones seccion={seccion} fecha={v.fecha} tipo={v.tipo} excluir={registro?.id}
                onElegir={(fecha) => setV({ ...v, fecha })} />
            </div>
          )}
          <Campo label="Etapa" className="col-span-2">
            <Select value={v.etapa ?? ''} onChange={(e) => setV({ ...v, etapa: Number(e.target.value) })} required>
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.numero}ª {e.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Consigna o descripción" className="col-span-2"><Textarea value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} /></Campo>
          {indicadores.length > 0 && (
            <div className="col-span-2">
              <p className="mb-1 text-sm font-bold text-grafito-600">Indicadores que evalúa</p>
              <div className="max-h-56 overflow-y-auto rounded-control border border-grafito-200 px-3">
                {indicadores.map((i: any) => (
                  <Casilla key={i.id} checked={v.indicadores.includes(i.id)}
                    onChange={(on) => setV({ ...v, indicadores: on ? [...v.indicadores, i.id] : v.indicadores.filter((x: number) => x !== i.id) })}>
                    {i.descripcion} <span className="text-sm text-grafito-500">· U{i.unidad.numero}</span>
                  </Casilla>
                ))}
              </div>
            </div>
          )}
          {error && <div className="col-span-2"><ErrorCaja error={error} /></div>}
        </form>
      </Hoja>
      <Confirmar abierta={borrar} titulo="Eliminar trabajo" texto="Se borran también los puntajes cargados." onConfirmar={eliminar} onCerrar={() => setBorrar(false)} />
    </>
  )
}

/** Lo que se carga de cada alumno en un trabajo (los números como texto, tal cual se escriben). */
type Fila = { puntaje: string; recuperatorio: string; tardia: boolean; observacion: string }

/** Carga de puntajes de todo el curso: en lista o alumno por alumno. */
function Puntajes({ instrumento, seccion, etapas, onVolver }: { instrumento: any; seccion: number; etapas: any[]; onVolver: () => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const datos = useQuery({ queryKey: ['puntajes', instrumento.id], queryFn: () => api(`/instrumentos/${instrumento.id}/puntajes/`) })
  const [valores, setValores] = useState<Record<number, Fila>>({})
  const [cargado, setCargado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [editar, setEditar] = useState(false)
  const [modo, setModo] = useState<'lista' | 'uno'>('lista')
  const [detalle, setDetalle] = useState<any | null>(null)

  if (datos.data && !cargado) {
    setValores(Object.fromEntries(datos.data.alumnos.map((a: any) => [a.matricula, {
      puntaje: num(a.puntaje), recuperatorio: num(a.recuperatorio), tardia: !!a.entrega_tardia, observacion: a.observacion ?? '',
    }])))
    setCargado(true)
  }
  if (datos.isLoading || !cargado) return <Cargando />
  const t = datos.data.instrumento
  const alumnos: any[] = datos.data.alumnos
  const total = Number(t.puntaje_total)
  const fuera = (s: string) => s !== '' && (Number(s) < 0 || Number(s) > total || Number.isNaN(Number(s)))
  const hayError = Object.values(valores).some((f) => fuera(f.puntaje) || fuera(f.recuperatorio))
  const vacio = (m: number) => valores[m].puntaje === '' && valores[m].recuperatorio === ''
  const cargados = alumnos.filter((a) => !vacio(a.matricula)).length
  const vacios = alumnos.length - cargados
  const set = (m: number, cambios: Partial<Fila>) => setValores((v) => ({ ...v, [m]: { ...v[m], ...cambios } }))

  const guardar = async () => {
    setGuardando(true)
    try {
      const r = await api(`/instrumentos/${t.id}/puntajes/`, {
        method: 'POST',
        body: {
          puntajes: alumnos.map((a) => {
            const f = valores[a.matricula]
            return {
              matricula: a.matricula, puntaje: f.puntaje === '' ? null : f.puntaje,
              recuperatorio: f.recuperatorio === '' ? null : f.recuperatorio,
              entrega_tardia: f.tardia, observacion: f.observacion.trim().slice(0, 200),
            }
          }),
        },
      })
      qc.setQueryData(['puntajes', t.id], r)
      void qc.invalidateQueries({ queryKey: ['instrumentos'] })
      void qc.invalidateQueries({ queryKey: ['planilla'] })
      void qc.invalidateQueries({ queryKey: ['ficha'] })
      avisar('Puntajes guardados')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <button onClick={onVolver} className="mb-3 flex items-center gap-1 text-sm font-bold text-tinta-600"><ChevronLeft className="size-4" /> Trabajos</button>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold leading-tight">{t.titulo}</h2>
          <p className="text-grafito-500">{tipoTexto(t.tipo)} · {fechaCorta(t.fecha)} · total {num(t.puntaje_total)} puntos</p>
        </div>
        <Boton variante="fantasma" onClick={() => setEditar(true)}>Editar</Boton>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmentado valor={modo} onChange={setModo} opciones={[{ valor: 'lista', label: 'Lista' }, { valor: 'uno', label: 'Uno por uno' }]} />
        <Boton variante="fantasma" disabled={!vacios}
          title="Pone el puntaje total a quienes están vacíos; después corregí solo las excepciones."
          onClick={() => alumnos.forEach((a) => vacio(a.matricula) && set(a.matricula, { puntaje: num(total) }))}>
          Poner {num(total)} a los vacíos
        </Boton>
      </div>

      {modo === 'uno' ? (
        <UnoPorUno alumnos={alumnos} valores={valores} set={set} total={total} onDetalle={setDetalle} />
      ) : (
        <>
          <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
            {alumnos.map((a, i) => {
              const f = valores[a.matricula]
              const mal = fuera(f.puntaje)
              return (
                <li key={a.matricula} className="flex items-center gap-2 py-2 pl-4 pr-2">
                  <span className="w-6 shrink-0 text-right text-sm font-bold text-grafito-500">{a.numero_lista ?? i + 1}</span>
                  <label htmlFor={`p-${a.matricula}`} className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{a.alumno}</span>
                    <Marcas f={f} fuera={fuera(f.recuperatorio)} />
                  </label>
                  <input id={`p-${a.matricula}`} type="number" inputMode="decimal" step="0.5" min="0" max={total}
                    value={f.puntaje} onChange={(e) => set(a.matricula, { puntaje: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (document.getElementById(`p-${alumnos[i + 1]?.matricula}`) as HTMLInputElement | null)?.focus()
                    }}
                    enterKeyHint="next"
                    className={cn('h-11 w-18 shrink-0 rounded-control border text-center text-lg font-bold focus:outline-none focus:ring-2',
                      mal ? 'border-ausente bg-ausente-50 text-ausente focus:ring-ausente-50' : 'border-grafito-200 focus:border-tinta-500 focus:ring-tinta-100')} />
                  <span className="w-9 shrink-0 text-sm text-grafito-500">/ {num(t.puntaje_total)}</span>
                  <BotonIcono onClick={() => setDetalle(a)} aria-label={`Recuperatorio y más datos de ${a.alumno}`}><MoreHorizontal className="size-5" /></BotonIcono>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-sm text-grafito-500">
            Dejá vacío si el alumno todavía no entregó. Con Enter pasás al siguiente. En ⋯ cargás el recuperatorio o la entrega tardía.
          </p>
        </>
      )}

      <div className="sticky bottom-[5.25rem] z-20 mt-4 lg:bottom-4">
        <div className="flex items-center gap-3 rounded-2xl bg-grafito px-4 py-3 text-white shadow-xl">
          <p className="flex-1 text-sm font-bold">{hayError ? <span className="text-[#ff8f88]">Hay puntajes fuera de 0 a {num(t.puntaje_total)}</span> : `${cargados} de ${alumnos.length} cargados`}</p>
          <Boton variante="secundario" onClick={guardar} cargando={guardando} disabled={hayError} className="ring-0">Guardar puntajes</Boton>
        </div>
      </div>

      {detalle && <DetallePuntaje alumno={detalle} f={valores[detalle.matricula]} total={total} fuera={fuera}
        onChange={(c) => set(detalle.matricula, c)} onCerrar={() => setDetalle(null)} />}

      {editar && (
        <FormTrabajo asignacion={t.asignacion} seccion={seccion} etapas={etapas} etapa={t.etapa}
          registro={t} onCerrar={() => { setEditar(false); void datos.refetch(); setCargado(false) }} onEliminado={onVolver} />
      )}
    </div>
  )
}

/** Etiquetas chicas debajo del nombre: entrega tardía, recuperatorio, observación. */
function Marcas({ f, fuera }: { f: Fila; fuera?: boolean }) {
  if (!f.tardia && f.recuperatorio === '' && !f.observacion) return null
  return (
    <span className="flex flex-wrap gap-x-2 text-xs font-bold">
      {f.tardia && <span className="text-tarde">Entregó tarde</span>}
      {f.recuperatorio !== '' && <span className={fuera ? 'text-ausente' : 'text-justificado'}>Recup. {f.recuperatorio}</span>}
      {f.observacion && <span className="truncate font-normal text-grafito-500">{f.observacion}</span>}
    </span>
  )
}

/** Puntaje, recuperatorio, entrega tardía y observación de un alumno. Los cambios se guardan con "Guardar puntajes". */
function DetallePuntaje({ alumno, f, total, fuera, onChange, onCerrar }: {
  alumno: any; f: Fila; total: number; fuera: (s: string) => boolean; onChange: (c: Partial<Fila>) => void; onCerrar: () => void
}) {
  return (
    <Hoja abierta titulo={alumno.alumno} onCerrar={onCerrar} pie={<Boton className="flex-1" onClick={onCerrar}>Listo</Boton>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label={`Puntaje (de ${num(total)})`} error={fuera(f.puntaje) ? `Entre 0 y ${num(total)}` : undefined}>
            <Input type="number" inputMode="decimal" step="0.5" min="0" max={total} value={f.puntaje} onChange={(e) => onChange({ puntaje: e.target.value })} />
          </Campo>
          <Campo label="Recuperatorio" error={fuera(f.recuperatorio) ? `Entre 0 y ${num(total)}` : undefined}>
            <Input type="number" inputMode="decimal" step="0.5" min="0" max={total} value={f.recuperatorio} onChange={(e) => onChange({ recuperatorio: e.target.value })} />
          </Campo>
        </div>
        <p className="text-sm text-grafito-500">En la planilla cuenta el mayor entre el puntaje y el recuperatorio.</p>
        <Casilla checked={f.tardia} onChange={(tardia) => onChange({ tardia })}>Entregó fuera de término</Casilla>
        <Campo label="Observación">
          <Input value={f.observacion} maxLength={200} onChange={(e) => onChange({ observacion: e.target.value })} placeholder="Ej.: entregó incompleto" />
        </Campo>
      </div>
    </Hoja>
  )
}

/** Un alumno a la vez, con botones grandes: tocar un puntaje lo anota y pasa al siguiente. */
function UnoPorUno({ alumnos, valores, set, total, onDetalle }: {
  alumnos: any[]; valores: Record<number, Fila>; set: (m: number, c: Partial<Fila>) => void; total: number; onDetalle: (a: any) => void
}) {
  // Arranca en el primero que no tiene puntaje.
  const [pos, setPos] = useState(() => Math.max(0, alumnos.findIndex((a) => valores[a.matricula].puntaje === '')))
  const a = alumnos[pos]
  const f = valores[a.matricula]
  const ultimo = pos === alumnos.length - 1
  const ir = (n: number) => setPos(Math.max(0, Math.min(alumnos.length - 1, n)))
  const poner = (v: string) => {
    set(a.matricula, { puntaje: v })
    ir(pos + 1)
  }
  // Con hasta 20 puntos enteros, un botón por puntaje; si no, se escribe.
  const botones = Number.isInteger(total) && total <= 20 ? Array.from({ length: total + 1 }, (_, k) => k) : null
  const medio = () => {
    const v = Number(f.puntaje || 0) + 0.5
    if (v <= total) set(a.matricula, { puntaje: String(v) })
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <BotonIcono onClick={() => ir(pos - 1)} disabled={pos === 0} aria-label="Alumno anterior"><ChevronLeft className="size-6" /></BotonIcono>
        <Select value={pos} onChange={(e) => ir(Number(e.target.value))} aria-label="Elegir alumno">
          {alumnos.map((al, k) => (
            <option key={al.matricula} value={k}>{valores[al.matricula].puntaje !== '' ? '✓ ' : ''}{al.numero_lista ?? k + 1}. {al.alumno}</option>
          ))}
        </Select>
        <BotonIcono onClick={() => ir(pos + 1)} disabled={ultimo} aria-label="Alumno siguiente"><ChevronRight className="size-6" /></BotonIcono>
      </div>

      <div className="mb-3 flex items-center gap-3 rounded-xl border-l-4 border-tinta-500 bg-tinta-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-tinta-700">Alumno {pos + 1} de {alumnos.length}</p>
          <p className="text-xl font-bold leading-snug">{a.alumno}</p>
          <Marcas f={f} />
        </div>
        <p className="shrink-0 text-right">
          <span className="text-4xl font-bold tabular-nums text-tinta-700">{f.puntaje === '' ? '—' : f.puntaje}</span>
          <span className="block text-sm text-grafito-500">de {num(total)}</span>
        </p>
      </div>

      {botones ? (
        <div className="grid grid-cols-6 gap-2">
          {botones.map((n) => (
            <button key={n} type="button" onClick={() => poner(String(n))}
              className={cn('h-13 rounded-control border text-lg font-bold active:scale-95',
                f.puntaje !== '' && Number(f.puntaje) === n ? 'border-tinta-700 bg-tinta-700 text-white' : 'border-grafito-200 bg-white text-grafito')}>
              {n}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <Input type="number" inputMode="decimal" step="0.5" min="0" max={total} value={f.puntaje} autoFocus
            onChange={(e) => set(a.matricula, { puntaje: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && ir(pos + 1)} enterKeyHint="next"
            className="h-13 text-center text-2xl font-bold" aria-label={`Puntaje de ${a.alumno}`} />
          <Boton grande onClick={() => ir(pos + 1)} disabled={ultimo}>Siguiente</Boton>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {botones && <Boton variante="secundario" onClick={medio}>+ ½ punto</Boton>}
        <Boton variante="secundario" onClick={() => set(a.matricula, { tardia: !f.tardia })}
          className={cn(f.tardia && 'bg-tarde-50 text-tarde ring-tarde/40')}>
          {f.tardia ? '✓ Entregó tarde' : 'Entregó tarde'}
        </Boton>
        <Boton variante="secundario" onClick={() => { set(a.matricula, { puntaje: '' }); ir(pos + 1) }}>No entregó</Boton>
        <Boton variante="secundario" onClick={() => onDetalle(a)}>Recuperatorio…</Boton>
      </div>
      {ultimo && <p className="mt-3 text-center text-sm font-bold text-grafito-500">Es el último alumno. No te olvides de guardar.</p>}
    </div>
  )
}

/** Planilla de la etapa: alumnos × trabajos, total logrado y porcentaje. */
function Planilla({ asignacion, etapa }: { asignacion: number; etapa: number }) {
  const p = useQuery({ queryKey: ['planilla', asignacion, etapa], queryFn: () => api(`/planilla/?asignacion=${asignacion}&etapa=${etapa}`, { cache: true }) })
  if (p.isLoading) return <Cargando />
  if (p.error) return <ErrorCaja error={p.error} />
  const d = p.data
  const hoy = hoyISO()
  if (!d.trabajos.length) return <Vacio titulo="Sin trabajos en esta etapa" />
  return (
    <div className="overflow-x-auto rounded-xl border border-grafito-200 bg-white">
      <table className="w-full min-w-max text-left">
        <thead className="border-b border-grafito-200 bg-grafito-100/60 text-sm">
          <tr>
            <th className="sticky left-0 bg-grafito-100 px-3 py-2 font-bold">Alumno</th>
            {d.trabajos.map((t: any) => (
              <th key={t.id} className="max-w-28 px-2 py-2 text-center font-bold" title={t.titulo}>
                <span className="block truncate">{t.titulo}</span>
                <span className="font-normal text-grafito-500">{num(t.puntaje_total)} p</span>
              </th>
            ))}
            <th className="px-3 py-2 text-center font-bold">Total<span className="block font-normal text-grafito-500">{num(d.total_posible)} p</span></th>
            <th className="px-3 py-2 text-center font-bold">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-grafito-100">
          {d.alumnos.map((a: any) => (
            <tr key={a.matricula}>
              <td className="sticky left-0 bg-white px-3 py-2.5 font-bold"><span className="mr-2 text-sm text-grafito-500">{a.numero_lista}</span>{a.alumno}</td>
              {a.puntajes.map((v: any, i: number) => {
                const marca: string = a.marcas?.[i] ?? ''
                return (
                  <td key={i} className="px-2 text-center">
                    {v != null ? num(v) : debe(d.trabajos[i], hoy) ? <span className="text-xs font-bold text-tarde">Debe</span> : <span className="text-grafito-300">—</span>}
                    {marca.includes('R') && <sup className="ml-0.5 font-bold text-justificado" title="Cuenta el recuperatorio">R</sup>}
                    {marca.includes('T') && <sup className="ml-0.5 font-bold text-tarde" title="Entregó fuera de término">T</sup>}
                  </td>
                )
              })}
              <td className="px-3 text-center font-bold">{num(a.logrado)}</td>
              <td className="px-3 text-center font-bold text-tinta-700">{a.porcentaje ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-grafito-100 px-3 py-2 text-sm text-grafito-500">
        <b className="text-justificado">R</b> cuenta el recuperatorio · <b className="text-tarde">T</b> entregó fuera de término · <b className="text-tarde">Debe</b> ya pasó la fecha y no tiene puntaje
      </p>
    </div>
  )
}

/** Un trabajo (no una unidad de indicadores) cuya fecha ya pasó. */
const debe = (t: any, hoy: string) => typeof t.id === 'number' && t.fecha <= hoy

/** Quiénes deben cada trabajo de la etapa (ya pasó la fecha y no tienen puntaje). */
function Pendientes({ asignacion, etapa }: { asignacion: number; etapa: number }) {
  const p = useQuery({ queryKey: ['planilla', asignacion, etapa], queryFn: () => api(`/planilla/?asignacion=${asignacion}&etapa=${etapa}`, { cache: true }) })
  const [ficha, setFicha] = useState<number | null>(null)
  if (p.isLoading) return <Cargando />
  if (p.error) return <ErrorCaja error={p.error} />
  const d = p.data
  const hoy = hoyISO()
  const vencidos = d.trabajos.map((t: any, i: number) => ({ t, i })).filter(({ t }: any) => debe(t, hoy))
  const grupos = vencidos
    .map(({ t, i }: any) => ({ t, deben: d.alumnos.filter((a: any) => a.puntajes[i] == null) }))
    .filter((g: any) => g.deben.length)
  const variosTrabajos = d.alumnos
    .map((a: any) => ({ a, n: vencidos.filter(({ i }: any) => a.puntajes[i] == null).length }))
    .filter((x: any) => x.n > 1)
    .sort((x: any, y: any) => y.n - x.n)

  const nombre = (a: any) => (
    <button key={a.matricula} onClick={() => setFicha(a.matricula)}
      className="rounded-full border border-grafito-200 bg-white px-3 py-1 text-sm font-bold text-grafito hover:border-tinta-500 active:bg-tinta-50">
      {a.alumno}
    </button>
  )

  return (
    <div className="space-y-4">
      {!grupos.length && <Vacio titulo="Nadie debe trabajos en esta etapa" texto="Acá aparecen los alumnos sin puntaje en los trabajos cuya fecha ya pasó." />}
      {variosTrabajos.length > 0 && (
        <section className="rounded-xl border border-tarde/30 bg-tarde-50 p-4">
          <h3 className="mb-2 font-bold text-tarde">Deben más de un trabajo</h3>
          <div className="flex flex-wrap gap-1.5">
            {variosTrabajos.map(({ a, n }: any) => (
              <button key={a.matricula} onClick={() => setFicha(a.matricula)}
                className="rounded-full bg-white px-3 py-1 text-sm font-bold text-grafito ring-1 ring-tarde/30 active:bg-tarde-50">
                {a.alumno} <span className="text-tarde">· {n}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {grupos.map(({ t, deben }: any) => (
        <section key={t.id} className="rounded-xl border border-grafito-200 bg-white p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold leading-snug">{t.titulo}</h3>
              <p className="text-sm text-grafito-500">{t.tipo} · {fechaCorta(t.fecha)} · {num(t.puntaje_total)} puntos</p>
            </div>
            <Etiqueta tono="ambar">{deben.length} {deben.length === 1 ? 'debe' : 'deben'}</Etiqueta>
          </div>
          <div className="flex flex-wrap gap-1.5">{deben.map(nombre)}</div>
        </section>
      ))}
      {grupos.length > 0 && <p className="text-sm text-grafito-500">Tocá un nombre para ver su ficha y avisar a la familia.</p>}
      {ficha != null && <FichaAlumno asignacion={asignacion} matricula={ficha} onCerrar={() => setFicha(null)} />}
    </div>
  )
}
