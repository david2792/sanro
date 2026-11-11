import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Sugerencias } from '../../components/Sugerencias'
import { Boton, Campo, Cargando, Casilla, Confirmar, ErrorCaja, Hoja, Input, Textarea, useAviso, Vacio } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { cn, hoyISO } from '../../lib/utils'
import { ListaAnecdoticos } from '../gestion/Detalles'
import { useClase } from './Clase'

const TIPOS = [
  { valor: 'NEGATIVO', label: 'Negativo', on: 'bg-ausente text-white border-ausente' },
  { valor: 'NEUTRO', label: 'Informativo', on: 'bg-grafito text-white border-grafito' },
  { valor: 'POSITIVO', label: 'Positivo', on: 'bg-presente text-white border-presente' },
]

export default function Anecdotico({ asignacion }: { asignacion: number }) {
  const registros = useQuery({ queryKey: ['anecdoticos', asignacion], queryFn: () => lista(`/anecdoticos/?asignacion=${asignacion}`, true) })
  const [form, setForm] = useState<any | null | undefined>(undefined)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-grafito-500">Hechos ocurridos en el aula, con lo que se hizo al respecto.</p>
        <Boton onClick={() => setForm(null)} className="shrink-0"><Plus className="size-5" /> Registrar</Boton>
      </div>
      {registros.isLoading && <Cargando />}
      {registros.data && !registros.data.length && <Vacio titulo="Sin registros anecdóticos en esta clase" />}
      {!!registros.data?.length && <ListaAnecdoticos registros={registros.data} onTocar={(r) => setForm(r)} />}
      {form !== undefined && <FormAnecdotico asignacion={asignacion} registro={form} onCerrar={() => setForm(undefined)} />}
    </div>
  )
}

function FormAnecdotico({ asignacion, registro, onCerrar }: { asignacion: number; registro: any | null; onCerrar: () => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const { alumnos } = useClase(asignacion)
  const ahora = new Date()
  const [v, setV] = useState<any>(registro ? { ...registro, hora: registro.hora?.slice(0, 5) ?? '' } : {
    fecha: hoyISO(), hora: `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`,
    tipo: 'NEGATIVO', lugar: 'Aula', alumnos: [], hecho: '', interpretacion: '', acciones: '', informado_a_tutor: false,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [borrar, setBorrar] = useState(false)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!v.alumnos.length) return setError('Marcá al menos un alumno involucrado.')
    setGuardando(true)
    setError('')
    try {
      const body = { asignacion, fecha: v.fecha, hora: v.hora || null, tipo: v.tipo, lugar: v.lugar, alumnos: v.alumnos,
        hecho: v.hecho, interpretacion: v.interpretacion, acciones: v.acciones, informado_a_tutor: v.informado_a_tutor }
      await api(registro ? `/anecdoticos/${registro.id}/` : '/anecdoticos/', { method: registro ? 'PATCH' : 'POST', body })
      await qc.invalidateQueries({ queryKey: ['anecdoticos', asignacion] })
      void qc.invalidateQueries({ queryKey: ['frases'] })
      avisar('Registro anecdótico guardado')
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    await api(`/anecdoticos/${registro.id}/`, { method: 'DELETE' })
    await qc.invalidateQueries({ queryKey: ['anecdoticos', asignacion] })
    avisar('Registro eliminado')
    onCerrar()
  }

  return (
    <>
      <Hoja abierta titulo={registro ? 'Registro anecdótico' : 'Nuevo registro anecdótico'} onCerrar={onCerrar}
        pie={<>
          {registro && <Boton type="button" variante="secundario" className="text-ausente" onClick={() => setBorrar(true)}>Eliminar</Boton>}
          <Boton type="submit" form="form-anec" className="flex-1" cargando={guardando}>Guardar</Boton>
        </>}>
        <form id="form-anec" onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha"><Input type="date" value={v.fecha} max={hoyISO()} onChange={(e) => setV({ ...v, fecha: e.target.value })} required /></Campo>
            <Campo label="Hora"><Input type="time" value={v.hora} onChange={(e) => setV({ ...v, hora: e.target.value })} /></Campo>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-bold text-grafito-600">Tipo de hecho</p>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS.map((t) => (
                <button key={t.valor} type="button" onClick={() => setV({ ...v, tipo: t.valor })}
                  className={cn('h-11 rounded-control border font-bold', v.tipo === t.valor ? t.on : 'border-grafito-200 bg-white text-grafito-600')}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-bold text-grafito-600">Alumnos involucrados {v.alumnos.length > 0 && `(${v.alumnos.length})`}</p>
            {alumnos.isLoading ? <Cargando /> : (
              <div className="max-h-52 overflow-y-auto rounded-control border border-grafito-200 px-3">
                {alumnos.data?.map((a: any) => (
                  <Casilla key={a.matricula} checked={v.alumnos.includes(a.matricula)}
                    onChange={(on) => setV({ ...v, alumnos: on ? [...v.alumnos, a.matricula] : v.alumnos.filter((x: number) => x !== a.matricula) })}>
                    {a.alumno}
                  </Casilla>
                ))}
              </div>
            )}
          </div>
          <Campo label="¿Qué pasó?" ayuda="Describí el hecho tal como ocurrió, sin juicios.">
            <Textarea rows={4} value={v.hecho} onChange={(e) => setV({ ...v, hecho: e.target.value })} required />
          </Campo>
          <div>
            <Campo label="Interpretación o comentario"><Textarea value={v.interpretacion} onChange={(e) => setV({ ...v, interpretacion: e.target.value })} /></Campo>
            <Sugerencias campo="interpretacion" valor={v.interpretacion} onChange={(interpretacion) => setV({ ...v, interpretacion })} />
          </div>
          <div>
            <Campo label="Acciones tomadas"><Textarea value={v.acciones} onChange={(e) => setV({ ...v, acciones: e.target.value })} /></Campo>
            <Sugerencias campo="acciones" valor={v.acciones} onChange={(acciones) => setV({ ...v, acciones })} />
          </div>
          <Campo label="Lugar"><Input value={v.lugar} onChange={(e) => setV({ ...v, lugar: e.target.value })} /></Campo>
          <Casilla checked={v.informado_a_tutor} onChange={(on) => setV({ ...v, informado_a_tutor: on })}>Se informó al padre, madre o tutor</Casilla>
          <ErrorCaja error={error} />
        </form>
      </Hoja>
      <Confirmar abierta={borrar} titulo="Eliminar registro" texto="Esta acción no se puede deshacer." onConfirmar={eliminar} onCerrar={() => setBorrar(false)} />
    </>
  )
}
