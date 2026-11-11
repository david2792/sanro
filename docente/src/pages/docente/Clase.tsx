import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { EditorHorario } from '../../components/EditorHorario'
import { Boton, Cargando, ErrorCaja, Hoja, Input, useAviso } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { type Bloque, cn, DIAS_SEMANA, diaSemana, horarioListo, horarioTexto, hoyISO, tieneClase } from '../../lib/utils'
import { Pestanias } from '../gestion/Detalles'
import Anecdotico from './Anecdotico'
import Desarrollo from './Desarrollo'
import LlamarLista from './LlamarLista'
import Logros from './Logros'
import Planificacion from './Planificacion'
import Trabajos from './Trabajos'
import Unidades from './Unidades'

type Tab = 'lista' | 'desarrollo' | 'plan' | 'unidades' | 'trabajos' | 'logros' | 'anecdotico'

/** Datos compartidos por las pestañas de una clase. */
export function useClase(id: number) {
  const asignacion = useQuery({ queryKey: ['asignacion', id], queryFn: () => api(`/asignaciones/${id}/`, { cache: true }) })
  const alumnos = useQuery({ queryKey: ['lista-alumnos', id], queryFn: () => api(`/asignaciones/${id}/lista/`, { cache: true }) })
  return { asignacion, alumnos }
}

/** Etapas del año de la sección, y la que corresponde a hoy. */
export function useEtapas(seccionId?: number) {
  return useQuery({
    queryKey: ['etapas-seccion', seccionId],
    enabled: !!seccionId,
    queryFn: async () => {
      const s = await api(`/secciones/${seccionId}/`, { cache: true })
      const etapas = await lista(`/etapas/?anio_lectivo=${s.anio_lectivo}`, true)
      const hoy = hoyISO()
      const actual = etapas.find((e: any) => e.fecha_inicio <= hoy && hoy <= e.fecha_fin) ?? etapas[etapas.length - 1]
      return { etapas, actual }
    },
  })
}

export default function Clase() {
  const id = Number(useParams().id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('t') as Tab) || 'lista'
  const fecha = params.get('fecha') || hoyISO()
  const { asignacion } = useClase(id)

  const ir = (t: Tab) => setParams((p) => { p.set('t', t); return p }, { replace: true })
  const cambiarFecha = (f: string) => setParams((p) => { p.set('fecha', f || hoyISO()); return p }, { replace: true })
  const irAClase = (f: string, t: Tab) => setParams((p) => { p.set('t', t); p.set('fecha', f); return p }, { replace: true })

  if (asignacion.isLoading) return <Cargando />
  if (asignacion.error) return <ErrorCaja error={asignacion.error} />
  const a = asignacion.data

  const moverDia = (delta: number) => {
    const d = new Date(fecha + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    const iso = d.toISOString().slice(0, 10)
    if (iso <= hoyISO()) cambiarFecha(iso)
  }

  const esHoy = fecha === hoyISO()

  return (
    <div>
      <div className="mb-4 flex items-start gap-2">
        <Link to="/clases" className="-ml-2 mt-0.5 grid size-10 shrink-0 place-items-center rounded-full hover:bg-grafito-100" aria-label="Volver">
          <ChevronLeft className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{a.materia_nombre}</h1>
          <p className="text-grafito-500">{a.seccion_descripcion}</p>
          <DiasClase asignacion={a} />
        </div>
      </div>

      <Pestanias valor={tab} onChange={ir} opciones={[
        { valor: 'lista', label: 'Lista' },
        { valor: 'desarrollo', label: 'Desarrollo' },
        { valor: 'plan', label: 'Planificación' },
        { valor: 'trabajos', label: 'Trabajos' },
        { valor: 'logros', label: 'Indicadores' },
        { valor: 'unidades', label: 'Plan anual' },
        { valor: 'anecdotico', label: 'Anecdótico' },
      ]} />

      {(tab === 'lista' || tab === 'desarrollo') && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-grafito-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-bold text-grafito-600">Fecha:</span>
            <Input
              id="fecha-clase"
              type="date"
              value={fecha}
              max={hoyISO()}
              onChange={(e) => cambiarFecha(e.target.value)}
              className="h-9 w-auto text-sm font-bold py-1 px-2.5"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moverDia(-1)}
              className="rounded-lg bg-grafito-100 px-2.5 py-1.5 text-xs font-bold text-grafito-700 hover:bg-grafito-200 active:scale-95"
            >
              ◀ Ayer
            </button>
            <button
              type="button"
              onClick={() => cambiarFecha(hoyISO())}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95',
                esHoy ? 'bg-tinta-700 text-white' : 'bg-grafito-100 text-grafito-700 hover:bg-grafito-200'
              )}
            >
              Hoy
            </button>
            <button
              type="button"
              disabled={esHoy}
              onClick={() => moverDia(1)}
              className="rounded-lg bg-grafito-100 px-2.5 py-1.5 text-xs font-bold text-grafito-700 hover:bg-grafito-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              Siguiente ▶
            </button>
          </div>
        </div>
      )}

      {(tab === 'lista' || tab === 'desarrollo') && !tieneClase(a.dias_clase, fecha) && (
        <p className="mb-4 rounded-control bg-grafito-100 px-4 py-3 text-grafito-600">
          Esta materia no tiene clase los {DIAS_SEMANA.find((d) => d.n === diaSemana(fecha))?.largo ?? 'domingos'}.
          Si igual hubo clase (por un cambio de horario), podés guardar la lista normalmente.
        </p>
      )}

      {tab === 'lista' && <LlamarLista asignacion={id} fecha={fecha} onContinuar={() => ir('desarrollo')} />}
      {tab === 'desarrollo' && <Desarrollo asignacion={id} fecha={fecha} irALista={() => ir('lista')} irAUnidades={() => ir('unidades')} />}
      {tab === 'plan' && <Planificacion asignacion={id} irAClase={irAClase} />}
      {tab === 'unidades' && <Unidades asignacion={id} seccion={a.seccion} />}
      {tab === 'trabajos' && <Trabajos asignacion={id} seccion={a.seccion} />}
      {tab === 'logros' && <Logros asignacion={id} irAUnidades={() => ir('unidades')} />}
      {tab === 'anecdotico' && <Anecdotico asignacion={id} />}
    </div>
  )
}

/** Días y horas de clase de la materia; el docente los puede corregir. */
function DiasClase({ asignacion }: { asignacion: any }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const [abierta, setAbierta] = useState(false)
  const [dias, setDias] = useState<number[]>([])
  const [bloques, setBloques] = useState<Bloque[]>([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const texto = horarioTexto(asignacion.dias_clase, asignacion.horario)

  const abrir = () => {
    setDias(asignacion.dias_clase ?? [])
    setBloques(asignacion.horario ?? [])
    setError('')
    setAbierta(true)
  }

  const guardar = async () => {
    const { horario, error } = horarioListo(bloques)
    if (error) return setError(error)
    setError('')
    setGuardando(true)
    try {
      const r = await api(`/asignaciones/${asignacion.id}/dias/`, { method: 'POST', body: { dias_clase: dias, horario } })
      qc.setQueryData(['asignacion', asignacion.id], { ...asignacion, ...r })
      void qc.invalidateQueries({ queryKey: ['mias'] })
      void qc.invalidateQueries({ queryKey: ['panel'] })
      avisar('Horario guardado')
      setAbierta(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <button onClick={abrir} className={cn('mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold',
        texto ? 'bg-tinta-50 text-tinta-700' : 'bg-tarde-50 text-tarde')}>
        <CalendarDays className="size-4" /> {texto || 'Cargar horario'}
      </button>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo="Horario de la materia"
        pie={<Boton className="flex-1" onClick={guardar} cargando={guardando}>Guardar</Boton>}>
        <p className="mb-4 text-grafito-600">
          Marcá los días que tenés esta materia y, si querés, la hora. Con la hora, "Mis clases" te muestra qué clase tenés ahora.
        </p>
        <EditorHorario dias={dias} horario={bloques} onChange={(d, h) => { setDias(d); setBloques(h) }} />
        {error && <p className="mt-4 rounded-control bg-ausente-50 px-4 py-3 text-ausente">{error}</p>}
      </Hoja>
    </>
  )
}
