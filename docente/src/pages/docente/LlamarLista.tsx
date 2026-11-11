import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CloudOff, Info } from 'lucide-react'
import { useState } from 'react'
import { Boton, Cargando, ErrorCaja, useAviso, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { guardarSesion, usePendientes } from '../../lib/offline'
import { bloquesDelDia, cn, horaActual, uuid } from '../../lib/utils'
import { useClase } from './Clase'
import { FichaAlumno } from './FichaAlumno'

type Estado = 'P' | 'A' | 'T' | 'J'

const ESTILO: Record<Estado, { letra: string; nombre: string; circulo: string; texto: string }> = {
  P: { letra: 'P', nombre: 'Presente', circulo: 'bg-presente text-white', texto: 'text-grafito' },
  A: { letra: 'A', nombre: 'Ausente', circulo: 'bg-ausente text-white', texto: 'text-ausente' },
  T: { letra: 'T', nombre: 'Llegó tarde', circulo: 'bg-tarde text-white', texto: 'text-tarde' },
  J: { letra: 'J', nombre: 'Ausencia justificada', circulo: 'bg-justificado text-white', texto: 'text-justificado' },
}
// Un toque avanza al siguiente estado.
const SIGUIENTE: Record<Estado, Estado> = { P: 'A', A: 'T', T: 'J', J: 'P' }

/** Minutos entre dos horas "HH:MM" (o "HH:MM:SS"); null si falta alguna. */
function minutosEntre(desde?: string | null, hasta?: string | null) {
  if (!desde || !hasta) return null
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
  return Math.max(0, m(hasta) - m(desde))
}

export default function LlamarLista({ asignacion, fecha, onContinuar }: { asignacion: number; fecha: string; onContinuar: () => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const { alumnos, asignacion: clase } = useClase(asignacion)
  const pendientes = usePendientes()
  const pendiente = pendientes.find((p) => p.body.asignacion === asignacion && p.body.fecha === fecha)

  const existente = useQuery({
    queryKey: ['sesion', asignacion, fecha],
    queryFn: async () => (await api(`/sesiones/?asignacion=${asignacion}&fecha=${fecha}`)).results[0] ?? null,
    retry: false,
  })

  const clave = `${asignacion}-${fecha}-${existente.data?.id ?? 'nueva'}-${pendiente ? 'p' : ''}`
  const [cargadoPara, setCargadoPara] = useState('')
  const [estados, setEstados] = useState<Record<number, Estado>>({})
  // Hora en que llegó cada alumno marcado tarde (HH:MM).
  const [horas, setHoras] = useState<Record<number, string>>({})
  // Motivo de cada ausencia justificada (opcional).
  const [motivos, setMotivos] = useState<Record<number, string>>({})
  // Inicio de la clase: el guardado, el del horario o la hora en que se abrió la lista.
  const [inicio, setInicio] = useState(horaActual())
  const [id, setId] = useState(uuid())
  const [guardando, setGuardando] = useState(false)
  const [guardada, setGuardada] = useState(false)

  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'TODOS' | Estado>('TODOS')
  const [ficha, setFicha] = useState<number | null>(null)

  // Al cambiar de fecha o llegar datos, se carga lo guardado o todos presentes.
  const listo = alumnos.data && !existente.isLoading
  if (listo && cargadoPara !== clave) {
    const base: Record<number, Estado> = {}
    const llegadas: Record<number, string> = {}
    const razones: Record<number, string> = {}
    for (const a of alumnos.data) base[a.matricula] = 'P'
    const previo = pendiente?.body ?? existente.data
    for (const r of previo?.registros ?? []) {
      base[r.matricula] = r.estado
      if (r.estado === 'T' && r.hora_llegada) llegadas[r.matricula] = r.hora_llegada.slice(0, 5)
      if (r.estado === 'J' && r.observacion) razones[r.matricula] = r.observacion
    }
    setEstados(base)
    setHoras(llegadas)
    setMotivos(razones)
    // Si ese día tiene varios bloques, el que ya empezó más cerca de ahora (o el primero).
    const bloques = bloquesDelDia(clase.data?.horario, fecha)
    const bloque = bloques.filter((b) => b.inicio <= horaActual()).pop() ?? bloques[0]
    setInicio(previo?.hora_inicio?.slice(0, 5) ?? bloque?.inicio ?? horaActual())
    setId(previo?.uuid ?? uuid())
    setGuardada(!!previo)
    setCargadoPara(clave)
  }

  if (alumnos.isLoading || existente.isLoading) return <Cargando />
  if (alumnos.error) return <ErrorCaja error={alumnos.error} />
  if (!alumnos.data?.length) return <Vacio titulo="Esta sección no tiene alumnos matriculados" texto="Secretaría debe matricularlos para poder llamar lista." />


  const vibrar = (p: number | number[] = 14) => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(p)
      }
    } catch {}
  }

  const cuenta = (e: Estado) => Object.values(estados).filter((x) => x === e).length
  const cambiar = (m: number) => {
    vibrar(14)
    const nuevo = SIGUIENTE[estados[m] ?? 'P']
    setEstados((s) => ({ ...s, [m]: nuevo }))
    // Al marcarlo tarde se anota la hora de ese momento (se puede corregir).
    setHoras((h) => {
      const n = { ...h }
      if (nuevo === 'T') n[m] = h[m] ?? horaActual()
      else delete n[m]
      return n
    })
    if (nuevo !== 'J') {
      setMotivos((s) => {
        const n = { ...s }
        delete n[m]
        return n
      })
    }
    setGuardada(false)
  }
  const cambiarHora = (m: number, hora: string) => {
    setHoras((h) => ({ ...h, [m]: hora }))
    setGuardada(false)
  }
  const cambiarMotivo = (m: number, motivo: string) => {
    setMotivos((s) => ({ ...s, [m]: motivo }))
    setGuardada(false)
  }
  const todosPresentes = () => {
    vibrar([20, 40, 20])
    setEstados((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === 'J' ? 'J' : 'P'])))
    setHoras({})
    setGuardada(false)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      vibrar([25, 45, 25])
      const body = {
        uuid: id,
        asignacion,
        fecha,
        hora_inicio: inicio || null,
        registros: alumnos.data.map((a: any) => {
          const estado = estados[a.matricula] ?? 'P'
          return {
            matricula: a.matricula,
            estado,
            hora_llegada: estado === 'T' ? horas[a.matricula] || null : null,
            observacion: estado === 'J' ? (motivos[a.matricula] ?? '').trim().slice(0, 200) : '',
          }
        }),
      }
      const r = await guardarSesion(body)
      setGuardada(true)
      if (r.offline) avisar('Sin señal: la lista quedó guardada en el teléfono y se enviará sola.', 'info')
      else {
        avisar('Lista guardada')
        qc.setQueryData(['sesion', asignacion, fecha], r.data)
        void qc.invalidateQueries({ queryKey: ['sesiones-hoy'] })
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar la lista.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  // Filtrado de alumnos para verificación rápida
  const alumnosFiltrados = (alumnos.data || []).filter((a: any) => {
    const estado = estados[a.matricula] ?? 'P'
    const coincideFiltro = filtro === 'TODOS' || estado === filtro
    const coincideBusqueda = !busqueda.trim() || a.alumno.toLowerCase().includes(busqueda.toLowerCase())
    return coincideFiltro && coincideBusqueda
  })

  return (
    <div>
      {pendiente && (
        <p className="mb-3 flex items-center gap-2 rounded-control bg-tarde-50 px-4 py-2.5 text-sm font-bold text-tarde">
          <CloudOff className="size-4 shrink-0" />
          {pendiente.error ? `No se pudo enviar: ${pendiente.error}` : 'Esta lista está en el teléfono, esperando señal para enviarse.'}
        </p>
      )}

      {/* Barra de control superior con filtros y acción rápida */}
      <div className="mb-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs sm:text-sm text-grafito-500">Tocá a un alumno para alternar: <strong>P</strong>resente, <strong>A</strong>usente, <strong>T</strong>arde, <strong>J</strong>ustificada. En tarde se anota la hora; en justificada, el motivo.</p>
          <button onClick={todosPresentes} className="shrink-0 text-xs sm:text-sm font-bold text-tinta-600 hover:underline active:opacity-70">
            Todos presentes
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <label className="flex items-center gap-1.5 text-xs font-bold text-grafito-500 sm:text-sm">
            Inicio de clase
            <input
              type="time"
              value={inicio}
              onChange={(e) => { setInicio(e.target.value); setGuardada(false) }}
              aria-label="Hora de inicio de la clase"
              className="h-9 rounded-lg border border-grafito-200 bg-white px-1.5 text-sm text-grafito focus:border-tinta-500 focus:outline-none"
            />
          </label>
          <div className="flex-1 min-w-[140px]">
            <input
              type="search"
              placeholder="Buscar alumno..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-9 w-full rounded-lg border border-grafito-200 bg-white px-3 text-sm text-grafito placeholder:text-grafito-300 focus:border-tinta-500 focus:outline-none"
            />
          </div>
          <div className="inline-flex rounded-lg bg-grafito-100 p-0.5 text-xs font-bold">
            <button
              onClick={() => setFiltro('TODOS')}
              className={cn('rounded-md px-2 py-1 transition-colors', filtro === 'TODOS' ? 'bg-white text-tinta-700 shadow-xs' : 'text-grafito-500')}
            >
              Todos ({alumnos.data?.length || 0})
            </button>
            <button
              onClick={() => setFiltro('A')}
              className={cn('rounded-md px-2 py-1 transition-colors', filtro === 'A' ? 'bg-ausente text-white' : 'text-grafito-500')}
            >
              Ausentes ({cuenta('A')})
            </button>
            <button
              onClick={() => setFiltro('T')}
              className={cn('rounded-md px-2 py-1 transition-colors', filtro === 'T' ? 'bg-tarde text-white' : 'text-grafito-500')}
            >
              Tardes ({cuenta('T')})
            </button>
            <button
              onClick={() => setFiltro('J')}
              className={cn('rounded-md px-2 py-1 transition-colors', filtro === 'J' ? 'bg-justificado text-white' : 'text-grafito-500')}
            >
              Justif. ({cuenta('J')})
            </button>
          </div>
        </div>
      </div>

      {/* La hoja del cuaderno: cada renglón es un alumno */}
      <ol className="hoja-rayada overflow-hidden rounded-xl border border-grafito-200 select-none">
        {alumnosFiltrados.map((a: any, i: number) => {
          const e = estados[a.matricula] ?? 'P'
          const est = ESTILO[e]
          const llegada = e === 'T' ? horas[a.matricula] : undefined
          const atraso = minutosEntre(inicio, llegada)
          const motivo = e === 'J' ? motivos[a.matricula] ?? '' : ''
          const detalle = e === 'T' && llegada
            ? `Llegó ${llegada}${atraso ? ` · ${atraso} min tarde` : ''}`
            : e === 'J' ? 'Justificada' : est.nombre
          return (
            <li key={a.matricula} className="flex h-16 items-center">
              <button
                type="button"
                onClick={() => cambiar(a.matricula)}
                aria-label={`${a.alumno}: ${detalle}. Tocar para cambiar.`}
                className="flex h-full min-w-0 flex-1 items-center text-left active:bg-tinta-50/70 select-none"
              >
                <span className="w-11 shrink-0 pr-2 text-right text-sm font-bold text-grafito-500">{a.numero_lista ?? i + 1}</span>
                <span className="min-w-0 flex-1 pl-4">
                  <span className={cn('block truncate text-[17px] font-bold', est.texto, e === 'A' && 'line-through decoration-2')}>{a.alumno}</span>
                  {e !== 'P' && <span className={cn('block truncate text-sm', est.texto)}>{detalle}</span>}
                </span>
              </button>
              {e === 'T' && (
                <input
                  type="time"
                  value={llegada ?? ''}
                  onChange={(ev) => cambiarHora(a.matricula, ev.target.value)}
                  aria-label={`Hora de llegada de ${a.alumno}`}
                  className="mr-2 h-9 w-[6.25rem] shrink-0 rounded-lg border border-tarde/40 bg-tarde-50 px-1.5 text-sm font-bold text-tarde focus:outline-none focus:ring-2 focus:ring-tarde/30"
                />
              )}
              {e === 'J' && (
                <input
                  type="text"
                  value={motivo}
                  maxLength={200}
                  onChange={(ev) => cambiarMotivo(a.matricula, ev.target.value)}
                  placeholder="Motivo"
                  aria-label={`Motivo de la ausencia justificada de ${a.alumno} (opcional)`}
                  title={motivo || 'Motivo (opcional)'}
                  className="mr-2 h-9 w-[7.5rem] shrink-0 rounded-lg border border-justificado/40 bg-justificado-50 px-2 text-sm text-justificado placeholder:text-justificado/60 focus:outline-none focus:ring-2 focus:ring-justificado/30 sm:w-48"
                />
              )}
              <button
                type="button"
                onClick={() => setFicha(a.matricula)}
                aria-label={`Ficha de ${a.alumno}`}
                className="mr-1 grid size-10 shrink-0 place-items-center rounded-full text-grafito-400 hover:bg-grafito-100 hover:text-tinta-600"
              >
                <Info className="size-5" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => cambiar(a.matricula)}
                className={cn('mr-4 grid size-11 shrink-0 place-items-center rounded-full text-lg font-bold shadow-xs transition-colors', est.circulo)}
              >
                {est.letra}
              </button>
            </li>
          )
        })}
        {alumnosFiltrados.length === 0 && (
          <li className="p-8 text-center text-sm text-grafito-500">
            No hay alumnos que coincidan con el filtro actual.
          </li>
        )}
      </ol>

      {ficha != null && <FichaAlumno asignacion={asignacion} matricula={ficha} onCerrar={() => setFicha(null)} />}

      {/* Barra para guardar, siempre a mano con el pulgar */}
      <div className="sticky bottom-[5.25rem] z-20 mt-4 lg:bottom-4">
        <div className="flex items-center gap-3 rounded-2xl bg-grafito px-4 py-3 text-white shadow-xl">
          <div className="flex flex-1 gap-3 text-sm font-bold">
            <span><span className="text-lg">{cuenta('P')}</span> P</span>
            <span className="text-[#ff8f88]"><span className="text-lg">{cuenta('A')}</span> A</span>
            <span className="text-[#ffc861]"><span className="text-lg">{cuenta('T')}</span> T</span>
            {cuenta('J') > 0 && <span className="text-[#9cc8f2]"><span className="text-lg">{cuenta('J')}</span> J</span>}
          </div>
          {guardada ? (
            <Boton variante="secundario" onClick={onContinuar} className="ring-0">Registrar desarrollo</Boton>
          ) : (
            <Boton variante="secundario" onClick={guardar} cargando={guardando} className="ring-0">Guardar lista</Boton>
          )}
        </div>
      </div>
    </div>
  )
}
