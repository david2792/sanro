import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Boton, Campo, Cargando, Casilla, Confirmar, ErrorCaja, Hoja, Input, Select, Textarea, useAviso, Vacio } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cn, fechaCorta } from '../../lib/utils'
import { useEtapas } from './Clase'
import { ExportarPlanAnual } from './PlanAnualExportar'
import { BotonSugerir, ListaSugerencias } from './SugerenciasDireccion'

type Edicion =
  | { tipo: 'unidad'; registro?: any }
  | { tipo: 'capacidad'; unidad: number; registro?: any }
  | { tipo: 'indicador'; capacidad: number; registro?: any }

const RUTA = { unidad: '/unidades/', capacidad: '/capacidades/', indicador: '/indicadores/' }

export default function Unidades({ asignacion, seccion }: { asignacion: number; seccion: number }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const unidades = useQuery({ queryKey: ['unidades', asignacion], queryFn: () => lista(`/unidades/?asignacion=${asignacion}`, true) })
  const etapas = useEtapas(seccion)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [borrar, setBorrar] = useState<{ tipo: keyof typeof RUTA; id: number } | null>(null)
  const [copiar, setCopiar] = useState(false)

  const refrescar = () => {
    return qc.invalidateQueries({ queryKey: ['unidades', asignacion] })
  }

  const eliminar = async () => {
    if (!borrar) return
    try {
      await api(`${RUTA[borrar.tipo]}${borrar.id}/`, { method: 'DELETE' })
      avisar('Eliminado')
      await refrescar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo eliminar.', 'error')
    }
    setBorrar(null)
  }

  if (unidades.isLoading) return <Cargando />
  const siguiente = (unidades.data?.length ?? 0) + 1

  return (
    <div>
      <ListaSugerencias asignacion={asignacion} sobre="PLAN_ANUAL" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-grafito-500">Unidades del plan: fechas, competencia, capacidades, indicadores, contenidos y evaluación.</p>
        <div className="flex flex-wrap gap-2">
          <ExportarPlanAnual asignacion={asignacion} unidades={unidades.data ?? []} />
          <BotonSugerir asignacion={asignacion} sobre="PLAN_ANUAL" unidades={unidades.data ?? []} />
          <Boton variante="secundario" onClick={() => setCopiar(true)}><Copy className="size-5" /> Copiar</Boton>
          <Boton onClick={() => setEdicion({ tipo: 'unidad' })}><Plus className="size-5" /> Unidad</Boton>
        </div>
      </div>

      {!unidades.data?.length && (
        <Vacio titulo="Sin unidades cargadas"
          texto="Cargá la primera unidad con sus capacidades e indicadores en un solo paso, o copiala de otra sección o del año pasado."
          accion={<Boton variante="secundario" onClick={() => setCopiar(true)}><Copy className="size-5" /> Copiar de otra clase</Boton>} />
      )}

      <div className="space-y-3">
        {unidades.data?.map((u: any) => {
          const open = abierta === u.id
          return (
            <section key={u.id} className="overflow-hidden rounded-xl border border-grafito-200 bg-white">
              <button onClick={() => setAbierta(open ? null : u.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-tinta-100 font-bold text-tinta-700">{u.numero}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug">{u.titulo}</span>
                  <span className="text-sm text-grafito-500">
                    {u.fecha_inicio && <>{fechaCorta(u.fecha_inicio)}{u.fecha_fin && ` al ${fechaCorta(u.fecha_fin)}`} · </>}
                    {u.capacidades.length} capacidades · {u.capacidades.reduce((s: number, c: any) => s + c.indicadores.length, 0)} indicadores
                  </span>
                </span>
                <ChevronDown className={cn('size-5 text-grafito-500 transition-transform', open && 'rotate-180')} />
              </button>

              {open && (
                <div className="border-t border-grafito-100 px-4 pb-4 pt-3">
                  {u.competencia && <p className="mb-3 text-grafito-600"><b className="text-tinta-700">Competencia: </b>{u.competencia}</p>}
                  {(u.contenidos || u.estrategias || u.recursos || u.evaluacion) && (
                    <dl className="mb-3 grid gap-2 text-[15px] sm:grid-cols-2">
                      {[['Contenidos', u.contenidos], ['Estrategias metodológicas', u.estrategias], ['Recursos', u.recursos], ['Evaluación', u.evaluacion]]
                        .filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className="rounded-lg border border-grafito-100 px-3 py-2">
                            <dt className="text-sm font-bold text-tinta-700">{k}</dt>
                            <dd className="whitespace-pre-line text-grafito-600">{v}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                  <ol className="space-y-3">
                    {u.capacidades.map((c: any, ci: number) => (
                      <li key={c.id} className="rounded-lg bg-grafito-100/60 p-3">
                        <div className="flex items-start gap-2">
                          <p className="flex-1 font-bold"><span className="text-grafito-500">{ci + 1}.</span> {c.descripcion}</p>
                          <Mini onClick={() => setEdicion({ tipo: 'capacidad', unidad: u.id, registro: c })} etiqueta="Editar capacidad"><Pencil className="size-4" /></Mini>
                          <Mini onClick={() => setBorrar({ tipo: 'capacidad', id: c.id })} etiqueta="Eliminar capacidad"><Trash2 className="size-4" /></Mini>
                        </div>
                        <ul className="ml-5 mt-1 space-y-1">
                          {c.indicadores.map((i: any) => (
                            <li key={i.id} className="flex items-start gap-2 text-grafito-600">
                              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-tinta-500" />
                              <span className="flex-1">{i.descripcion}</span>
                              <Mini onClick={() => setEdicion({ tipo: 'indicador', capacidad: c.id, registro: i })} etiqueta="Editar indicador"><Pencil className="size-3.5" /></Mini>
                              <Mini onClick={() => setBorrar({ tipo: 'indicador', id: i.id })} etiqueta="Eliminar indicador"><X className="size-4" /></Mini>
                            </li>
                          ))}
                        </ul>
                        <button onClick={() => setEdicion({ tipo: 'indicador', capacidad: c.id })} className="ml-5 mt-1 text-sm font-bold text-tinta-600">+ Indicador</button>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Boton variante="secundario" onClick={() => setEdicion({ tipo: 'capacidad', unidad: u.id })}><Plus className="size-4" /> Capacidad</Boton>
                    <Boton variante="fantasma" onClick={() => setEdicion({ tipo: 'unidad', registro: u })}><Pencil className="size-4" /> Editar unidad</Boton>
                    <Boton variante="fantasma" className="text-ausente" onClick={() => setBorrar({ tipo: 'unidad', id: u.id })}><Trash2 className="size-4" /> Eliminar</Boton>
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>

      {edicion?.tipo === 'unidad' && !edicion.registro && (
        <NuevaUnidad asignacion={asignacion} numero={siguiente} etapas={etapas.data?.etapas ?? []} etapaActual={etapas.data?.actual?.id}
          onCerrar={() => setEdicion(null)} onGuardada={(id) => { void refrescar(); setAbierta(id) }} />
      )}
      {edicion && (edicion.tipo !== 'unidad' || edicion.registro) && (
        <EditarSimple edicion={edicion} etapas={etapas.data?.etapas ?? []} asignacion={asignacion}
          onCerrar={() => setEdicion(null)} onGuardado={() => void refrescar()} />
      )}
      {copiar && <CopiarUnidades asignacion={asignacion} onCerrar={() => setCopiar(false)} onCopiadas={() => void refrescar()} />}
      <Confirmar abierta={!!borrar} titulo="Eliminar" onCerrar={() => setBorrar(null)} onConfirmar={eliminar}
        texto={borrar?.tipo === 'unidad' ? 'Se eliminará la unidad con todas sus capacidades e indicadores.' : 'Esta acción no se puede deshacer.'} />
    </div>
  )
}

function Mini({ onClick, etiqueta, children }: { onClick: () => void; etiqueta: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={etiqueta} className="grid size-8 shrink-0 place-items-center rounded-full text-grafito-500 hover:bg-white">
      {children}
    </button>
  )
}

type Origen = {
  asignacion: number; materia: string; seccion: string; docente: string; anio: number
  misma_materia: boolean; mismo_curso: boolean
  unidades: { id: number; numero: number; titulo: string; capacidades: number; indicadores: number }[]
}

/** Copia unidades de otra clase (otra sección o un año anterior) con sus capacidades e indicadores. */
function CopiarUnidades({ asignacion, onCerrar, onCopiadas }: { asignacion: number; onCerrar: () => void; onCopiadas: () => void }) {
  const avisar = useAviso()
  const { esGestion } = useAuth()
  const origenes = useQuery({
    queryKey: ['unidades-origenes', asignacion],
    queryFn: () => api<Origen[]>(`/unidades/origenes/?asignacion=${asignacion}`),
  })
  const [origen, setOrigen] = useState<number | null>(null)
  // null = todas las unidades de la clase elegida
  const [elegidas, setElegidas] = useState<number[] | null>(null)
  const [copiando, setCopiando] = useState(false)

  const grupos = origenes.data ?? []
  const grupo = grupos.find((g) => g.asignacion === origen) ?? grupos[0]
  const marcadas = elegidas ?? grupo?.unidades.map((u) => u.id) ?? []
  const nombre = (g: Origen) => `${g.materia} · ${g.seccion}${esGestion ? ` · ${g.docente}` : ''}`

  const copiar = async () => {
    setCopiando(true)
    try {
      const r = await api<any[]>('/unidades/copiar/', { method: 'POST', body: { asignacion, unidades: marcadas } })
      avisar(r.length === 1 ? 'Se copió 1 unidad' : `Se copiaron ${r.length} unidades`)
      onCopiadas()
      onCerrar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo copiar.', 'error')
    } finally {
      setCopiando(false)
    }
  }

  return (
    <Hoja abierta titulo="Copiar planificación" onCerrar={onCerrar}
      pie={grupo && (
        <Boton className="flex-1" onClick={copiar} cargando={copiando} disabled={!marcadas.length}>
          <Copy className="size-4" /> Copiar {marcadas.length === 1 ? '1 unidad' : `${marcadas.length} unidades`}
        </Boton>
      )}>
      {origenes.isLoading && <Cargando />}
      <ErrorCaja error={origenes.error} />
      {origenes.data && !grupo && (
        <Vacio titulo="No hay planificaciones para copiar"
          texto="Cuando cargues unidades en otra sección o en otro año, vas a poder copiarlas desde acá." />
      )}
      {grupo && (
        <div className="space-y-4">
          <p className="text-grafito-600">
            Se copian la competencia, las capacidades y los indicadores. Después podés ajustarlos sin cambiar la clase original.
          </p>
          <Campo label="Copiar desde">
            <Select value={grupo.asignacion} onChange={(e) => { setOrigen(Number(e.target.value)); setElegidas(null) }}>
              {[{ titulo: 'Misma materia', misma: true }, { titulo: 'Otras materias', misma: false }].map(({ titulo, misma }) => {
                const clases = grupos.filter((g) => g.misma_materia === misma)
                return clases.length > 0 && (
                  <optgroup key={titulo} label={titulo}>
                    {clases.map((g) => <option key={g.asignacion} value={g.asignacion}>{nombre(g)}</option>)}
                  </optgroup>
                )
              })}
            </Select>
          </Campo>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-bold text-grafito-600">Unidades</p>
              <button type="button" className="text-sm font-bold text-tinta-600"
                onClick={() => setElegidas(marcadas.length === grupo.unidades.length ? [] : null)}>
                {marcadas.length === grupo.unidades.length ? 'Ninguna' : 'Todas'}
              </button>
            </div>
            <div className="divide-y divide-grafito-100 rounded-xl border border-grafito-200 px-3">
              {grupo.unidades.map((u) => (
                <Casilla key={u.id} checked={marcadas.includes(u.id)}
                  onChange={(on) => setElegidas(on ? [...marcadas, u.id] : marcadas.filter((x) => x !== u.id))}>
                  <b>{u.numero}. {u.titulo}</b>
                  <span className="block text-sm text-grafito-500">{u.capacidades} capacidades · {u.indicadores} indicadores</span>
                </Casilla>
              ))}
            </div>
          </div>
        </div>
      )}
    </Hoja>
  )
}


/** Campos del plan anual de la unidad: fechas, contenidos, estrategias, recursos y evaluación. */
function CamposPlan({ v, set }: { v: any; set: (cambios: any) => void }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-grafito-200 p-3">
      <legend className="px-1 font-bold text-tinta-700">Plan anual</legend>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Desde"><Input type="date" value={v.fecha_inicio ?? ''} onChange={(e) => set({ fecha_inicio: e.target.value || null })} /></Campo>
        <Campo label="Hasta"><Input type="date" value={v.fecha_fin ?? ''} onChange={(e) => set({ fecha_fin: e.target.value || null })} /></Campo>
      </div>
      <Campo label="Contenidos"><Textarea value={v.contenidos ?? ''} onChange={(e) => set({ contenidos: e.target.value })} /></Campo>
      <Campo label="Estrategias metodológicas"><Textarea value={v.estrategias ?? ''} onChange={(e) => set({ estrategias: e.target.value })} /></Campo>
      <Campo label="Recursos"><Textarea rows={2} value={v.recursos ?? ''} onChange={(e) => set({ recursos: e.target.value })} /></Campo>
      <Campo label="Procedimientos e instrumentos de evaluación"><Textarea rows={2} value={v.evaluacion ?? ''} onChange={(e) => set({ evaluacion: e.target.value })} /></Campo>
    </fieldset>
  )
}

/** Alta de unidad completa: competencia + capacidades + indicadores en un paso. */
function NuevaUnidad({ asignacion, numero, etapas, etapaActual, onCerrar, onGuardada }: {
  asignacion: number; numero: number; etapas: any[]; etapaActual?: number; onCerrar: () => void; onGuardada: (id: number) => void
}) {
  const avisar = useAviso()
  const [u, setU] = useState<any>({ numero, titulo: '', competencia: '', etapa: etapaActual ?? null,
    fecha_inicio: null, fecha_fin: null, contenidos: '', estrategias: '', recursos: '', evaluacion: '' })
  const [caps, setCaps] = useState<{ descripcion: string; indicadores: string[] }[]>([{ descripcion: '', indicadores: [''] }])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const setCap = (i: number, c: Partial<{ descripcion: string; indicadores: string[] }>) =>
    setCaps((cs) => cs.map((x, j) => (j === i ? { ...x, ...c } : x)))

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const r = await api('/unidades/', {
        method: 'POST',
        body: {
          ...u, asignacion,
          capacidades: caps.filter((c) => c.descripcion.trim()).map((c) => ({
            descripcion: c.descripcion.trim(),
            indicadores: c.indicadores.filter((i) => i.trim()).map((i) => ({ descripcion: i.trim() })),
          })),
        },
      })
      avisar('Unidad guardada')
      onGuardada(r.id)
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta titulo="Nueva unidad" onCerrar={onCerrar}
      pie={<Boton type="submit" form="form-unidad" className="flex-1" cargando={guardando}>Guardar unidad</Boton>}>
      <form id="form-unidad" onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <Campo label="N°"><Input type="number" inputMode="numeric" value={u.numero} onChange={(e) => setU({ ...u, numero: Number(e.target.value) })} required /></Campo>
          <Campo label="Título de la unidad"><Input value={u.titulo} onChange={(e) => setU({ ...u, titulo: e.target.value })} required /></Campo>
        </div>
        {etapas.length > 0 && (
          <Campo label="Etapa">
            <Select value={u.etapa ?? ''} onChange={(e) => setU({ ...u, etapa: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.numero}ª {e.nombre}</option>)}
            </Select>
          </Campo>
        )}
        <Campo label="Competencia"><Textarea value={u.competencia} onChange={(e) => setU({ ...u, competencia: e.target.value })} /></Campo>
        <CamposPlan v={u} set={(c) => setU({ ...u, ...c })} />

        {caps.map((c, i) => (
          <fieldset key={i} className="rounded-xl border border-grafito-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <legend className="font-bold text-tinta-700">Capacidad {i + 1}</legend>
              {caps.length > 1 && <button type="button" onClick={() => setCaps(caps.filter((_, j) => j !== i))} className="text-sm font-bold text-ausente">Quitar</button>}
            </div>
            <Textarea rows={2} placeholder="Descripción de la capacidad" value={c.descripcion} onChange={(e) => setCap(i, { descripcion: e.target.value })} />
            <p className="mb-1 mt-3 text-sm font-bold text-grafito-600">Indicadores</p>
            <div className="space-y-2">
              {c.indicadores.map((ind, k) => (
                <div key={k} className="flex gap-2">
                  <Input placeholder={`Indicador ${k + 1}`} value={ind}
                    onChange={(e) => setCap(i, { indicadores: c.indicadores.map((x, j) => (j === k ? e.target.value : x)) })} />
                  {c.indicadores.length > 1 && (
                    <button type="button" aria-label="Quitar indicador" onClick={() => setCap(i, { indicadores: c.indicadores.filter((_, j) => j !== k) })}
                      className="grid size-11 shrink-0 place-items-center rounded-control text-grafito-500 hover:bg-grafito-100"><X className="size-4" /></button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setCap(i, { indicadores: [...c.indicadores, ''] })} className="mt-2 text-sm font-bold text-tinta-600">+ Indicador</button>
          </fieldset>
        ))}
        <Boton type="button" variante="secundario" className="w-full" onClick={() => setCaps([...caps, { descripcion: '', indicadores: [''] }])}>
          <Plus className="size-4" /> Otra capacidad
        </Boton>
        {error && <p className="rounded-control bg-ausente-50 px-4 py-3 text-ausente">{error}</p>}
      </form>
    </Hoja>
  )
}

/** Edición de unidad (sus datos), capacidad o indicador. */
function EditarSimple({ edicion, etapas, asignacion, onCerrar, onGuardado }: {
  edicion: Edicion; etapas: any[]; asignacion: number; onCerrar: () => void; onGuardado: () => void
}) {
  const avisar = useAviso()
  const r = edicion.registro
  const [v, setV] = useState<any>(r ? { ...r } : { descripcion: '' })
  const [guardando, setGuardando] = useState(false)
  const titulo = { unidad: 'Editar unidad', capacidad: r ? 'Editar capacidad' : 'Nueva capacidad', indicador: r ? 'Editar indicador' : 'Nuevo indicador' }[edicion.tipo]

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      let body: any
      if (edicion.tipo === 'unidad') body = { numero: v.numero, titulo: v.titulo, competencia: v.competencia, etapa: v.etapa, asignacion,
        fecha_inicio: v.fecha_inicio || null, fecha_fin: v.fecha_fin || null, contenidos: v.contenidos ?? '',
        estrategias: v.estrategias ?? '', recursos: v.recursos ?? '', evaluacion: v.evaluacion ?? '' }
      else if (edicion.tipo === 'capacidad') body = { descripcion: v.descripcion, unidad: edicion.unidad }
      else body = { descripcion: v.descripcion, capacidad: edicion.capacidad }
      await api(r ? `${RUTA[edicion.tipo]}${r.id}/` : RUTA[edicion.tipo], { method: r ? 'PATCH' : 'POST', body })
      avisar('Guardado')
      onGuardado()
      onCerrar()
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta titulo={titulo} onCerrar={onCerrar}
      pie={<Boton type="submit" form="form-simple" className="flex-1" cargando={guardando}>Guardar</Boton>}>
      <form id="form-simple" onSubmit={guardar} className="space-y-4">
        {edicion.tipo === 'unidad' ? (
          <>
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <Campo label="N°"><Input type="number" value={v.numero} onChange={(e) => setV({ ...v, numero: Number(e.target.value) })} required /></Campo>
              <Campo label="Título"><Input value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} required /></Campo>
            </div>
            {etapas.length > 0 && (
              <Campo label="Etapa">
                <Select value={v.etapa ?? ''} onChange={(e) => setV({ ...v, etapa: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>
                  {etapas.map((e) => <option key={e.id} value={e.id}>{e.numero}ª {e.nombre}</option>)}
                </Select>
              </Campo>
            )}
            <Campo label="Competencia"><Textarea value={v.competencia} onChange={(e) => setV({ ...v, competencia: e.target.value })} /></Campo>
            <CamposPlan v={v} set={(c) => setV({ ...v, ...c })} />
          </>
        ) : (
          <Campo label="Descripción"><Textarea value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} required autoFocus /></Campo>
        )}
      </form>
    </Hoja>
  )
}
