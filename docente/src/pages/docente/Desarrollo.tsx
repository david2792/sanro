import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck } from 'lucide-react'
import { useState } from 'react'
import { Sugerencias } from '../../components/Sugerencias'
import { Boton, Campo, Cargando, Casilla, Select, Tarjeta, Textarea, useAviso, Vacio } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { cn } from '../../lib/utils'
import { ListaSugerencias } from './SugerenciasDireccion'

/** Lo que el docente desarrolló en la clase: unidad, capacidades e indicadores. */
export default function Desarrollo({ asignacion, fecha, irALista, irAUnidades }: {
  asignacion: number; fecha: string; irALista: () => void; irAUnidades: () => void
}) {
  const qc = useQueryClient()
  const avisar = useAviso()

  const sesion = useQuery({
    queryKey: ['sesion', asignacion, fecha],
    queryFn: async () => (await api(`/sesiones/?asignacion=${asignacion}&fecha=${fecha}`)).results[0] ?? null,
  })
  const registro = useQuery({
    queryKey: ['registro-clase', sesion.data?.id],
    enabled: !!sesion.data?.id,
    queryFn: async () => (await api(`/registros-clase/?sesion=${sesion.data.id}`)).results[0] ?? null,
  })
  const plan = useQuery({
    queryKey: ['plan-clase', asignacion, fecha],
    queryFn: async () => (await api(`/planes-clase/?asignacion=${asignacion}&fecha=${fecha}`)).results[0] ?? null,
  })
  const unidades = useQuery({ queryKey: ['unidades', asignacion], queryFn: () => lista(`/unidades/?asignacion=${asignacion}`, true) })

  const [form, setForm] = useState<any>(null)
  const [cargadoPara, setCargadoPara] = useState<string>('')
  const [guardando, setGuardando] = useState(false)

  const clave = `${sesion.data?.id}-${registro.data?.id ?? 'nuevo'}`
  if (sesion.data && !registro.isLoading && !plan.isLoading && unidades.data && cargadoPara !== clave) {
    // Si todavía no se registró la clase, se parte de lo planificado para ese día.
    const r = registro.data ?? (plan.data && {
      unidad: plan.data.unidad, capacidades: plan.data.capacidades, indicadores_evaluados: plan.data.indicadores,
      contenido: plan.data.contenido, actividades: plan.data.actividades,
    })
    setForm({
      unidad: r ? r.unidad : unidades.data?.[unidades.data.length - 1]?.id ?? null,
      capacidades: r?.capacidades ?? [],
      indicadores_evaluados: r?.indicadores_evaluados ?? [],
      contenido: r?.contenido ?? '',
      actividades: r?.actividades ?? '',
      observaciones: r?.observaciones ?? '',
    })
    setCargadoPara(clave)
  }

  if (sesion.isLoading || unidades.isLoading) return <Cargando />
  if (!sesion.data)
    return <Vacio titulo="Primero guardá la lista de este día" texto="El desarrollo de la clase se registra sobre la clase en la que llamaste lista."
      accion={<Boton onClick={irALista}>Ir a la lista</Boton>} />
  if (!form) return <Cargando />

  const unidad = unidades.data?.find((u: any) => u.id === form.unidad)

  const guardar = async () => {
    setGuardando(true)
    try {
      const body = { ...form, sesion: sesion.data.id }
      const r = registro.data
        ? await api(`/registros-clase/${registro.data.id}/`, { method: 'PATCH', body })
        : await api('/registros-clase/', { method: 'POST', body })
      qc.setQueryData(['registro-clase', sesion.data.id], r)
      void qc.invalidateQueries({ queryKey: ['frases'] })
      void qc.invalidateQueries({ queryKey: ['calendario', asignacion] })
      avisar('Desarrollo de la clase guardado')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-5">
      {registro.data && <ListaSugerencias asignacion={asignacion} sobre="CLASE" registro={registro.data.id} />}
      {!registro.data && plan.data && (
        <p className="flex items-start gap-2 rounded-control bg-presente-50 px-4 py-3 text-[15px] text-grafito-700">
          <CalendarCheck className="mt-0.5 size-5 shrink-0 text-presente" />
          <span>Completamos el formulario con lo que planificaste para este día. Ajustá lo que haya cambiado y guardá.</span>
        </p>
      )}

      {!unidades.data?.length ? (
        <Vacio titulo="Todavía no cargaste unidades" texto="Cargá tus unidades con capacidades e indicadores para marcarlos acá."
          accion={<Boton variante="secundario" onClick={irAUnidades}>Cargar unidades</Boton>} />
      ) : (
        <>
          <Campo label="Unidad desarrollada">
            <Select value={form.unidad ?? ''} onChange={(e) => setForm({ ...form, unidad: e.target.value ? Number(e.target.value) : null, capacidades: [], indicadores_evaluados: [] })}>
              <option value="">Sin unidad</option>
              {unidades.data.map((u: any) => <option key={u.id} value={u.id}>Unidad {u.numero}: {u.titulo}</option>)}
            </Select>
          </Campo>

          {unidad?.competencia && (
            <p className="rounded-control border-l-4 border-tinta-200 bg-tinta-50 px-4 py-3 text-grafito-600">
              <b className="text-tinta-700">Competencia: </b>{unidad.competencia}
            </p>
          )}

          {unidad && (
            <MarcarCapacidades unidad={unidad} titulo="Capacidades trabajadas e indicadores evaluados"
              ayudaIndicadores="Indicadores evaluados hoy (si evaluaste)"
              capacidades={form.capacidades} indicadores={form.indicadores_evaluados}
              onChange={(capacidades, indicadores_evaluados) => setForm({ ...form, capacidades, indicadores_evaluados })} />
          )}
        </>
      )}

      <Campo label="Contenido o tema desarrollado">
        <Textarea value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })} />
      </Campo>
      <div>
        <Campo label="Actividades y estrategias">
          <Textarea value={form.actividades} onChange={(e) => setForm({ ...form, actividades: e.target.value })} />
        </Campo>
        <Sugerencias campo="actividades" valor={form.actividades} onChange={(actividades) => setForm({ ...form, actividades })} />
      </div>
      <div>
        <Campo label="Observaciones">
          <Textarea rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </Campo>
        <Sugerencias campo="observaciones" valor={form.observaciones} onChange={(observaciones) => setForm({ ...form, observaciones })} />
      </div>

      <Boton grande className="w-full" onClick={guardar} cargando={guardando}>Guardar desarrollo</Boton>
    </div>
  )
}

/** Capacidades de la unidad con sus indicadores, para marcar (en el desarrollo y en la planificación). */
export function MarcarCapacidades({ unidad, titulo, ayudaIndicadores, capacidades, indicadores, onChange }: {
  unidad: any; titulo: string; ayudaIndicadores: string
  capacidades: number[]; indicadores: number[]; onChange: (capacidades: number[], indicadores: number[]) => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-grafito-600">{titulo}</p>
      {!unidad.capacidades.length && <p className="text-grafito-500">Esta unidad no tiene capacidades cargadas.</p>}
      <div className="space-y-3">
        {unidad.capacidades.map((c: any) => {
          const marcada = capacidades.includes(c.id)
          return (
            <Tarjeta key={c.id} className={cn('px-4 py-2', marcada && 'border-tinta-500 ring-1 ring-tinta-500')}>
              <Casilla checked={marcada} onChange={(on) => on
                ? onChange([...capacidades, c.id], indicadores)
                : onChange(capacidades.filter((x) => x !== c.id), indicadores.filter((x) => !c.indicadores.some((i: any) => i.id === x)))}>
                <span className="font-bold">{c.descripcion}</span>
              </Casilla>
              {marcada && c.indicadores.length > 0 && (
                <div className="mb-1 ml-8 border-l-2 border-grafito-200 pl-3">
                  <p className="pt-1 text-xs font-bold text-grafito-500">{ayudaIndicadores}</p>
                  {c.indicadores.map((i: any) => (
                    <Casilla key={i.id} checked={indicadores.includes(i.id)}
                      onChange={(on) => onChange(capacidades, on ? [...indicadores, i.id] : indicadores.filter((x) => x !== i.id))}>
                      {i.descripcion}
                    </Casilla>
                  ))}
                </div>
              )}
            </Tarjeta>
          )
        })}
      </div>
    </div>
  )
}
