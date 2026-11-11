import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Clock, MessageSquareText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Cargando, ErrorCaja, Segmentado, Vacio } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePendientes } from '../../lib/offline'
import {
  aMinutos, type Bloque, bloquesDelDia, cn, DIAS_SEMANA, diaSemana, duracion, fechaCorta, fechaLarga, horaActual, horarioTexto,
  hoyISO, tieneClase,
} from '../../lib/utils'

import type { Sugerencia } from './SugerenciasDireccion'

type Turno = { clase: any; bloque: Bloque }

/** Hora actual "HH:MM", al día cada 30 segundos. */
function useHora() {
  const [hora, setHora] = useState(horaActual())
  useEffect(() => {
    const t = setInterval(() => setHora(horaActual()), 30_000)
    return () => clearInterval(t)
  }, [])
  return hora
}

export default function MisClases() {
  const { usuario } = useAuth()
  const hoy = hoyISO()
  const hora = useHora()
  const [vista, setVista] = useState<'hoy' | 'semana'>('hoy')
  const clases = useQuery({ queryKey: ['mias'], queryFn: () => api('/asignaciones/mias/', { cache: true }) })
  const hechas = useQuery({
    queryKey: ['sesiones-hoy', hoy],
    queryFn: () => lista(`/sesiones/?fecha=${hoy}`),
    retry: false,
  })
  const planes = useQuery({
    queryKey: ['planes-hoy', hoy],
    queryFn: () => lista(`/planes-clase/?fecha=${hoy}`, true),
    retry: false,
  })
  const tema = (asig: number): string => planes.data?.find((p: any) => p.asignacion === asig)?.contenido ?? ''
  const pendientes = usePendientes()
  const listaHecha = (asig: number) =>
    hechas.data?.some((s: any) => s.asignacion === asig) || pendientes.some((p) => p.body.asignacion === asig && p.body.fecha === hoy)

  const todas: any[] = clases.data ?? []
  // Bloques de hoy de todas las materias, en orden: de acá salen "ahora" y "después".
  const turnos: Turno[] = todas
    .flatMap((c) => bloquesDelDia(c.horario, hoy).map((bloque) => ({ clase: c, bloque })))
    .sort((a, b) => a.bloque.inicio.localeCompare(b.bloque.inicio))
  const ahora = turnos.find((t) => t.bloque.inicio <= hora && hora < t.bloque.fin)
  const siguiente = turnos.find((t) => t.bloque.inicio > hora)

  // Hoy: las materias que tienen clase hoy (o ya tienen lista hoy), por hora. El resto, aparte.
  const primeraHora = (c: any) => bloquesDelDia(c.horario, hoy)[0]?.inicio ?? '99:99'
  const deHoy = todas.filter((c) => tieneClase(c.dias_clase, hoy) || listaHecha(c.id))
    .sort((a, b) => primeraHora(a).localeCompare(primeraHora(b)))
  const otras = todas.filter((c) => !deHoy.includes(c))
  const sinDias = todas.some((c) => !c.dias_clase?.length)
  const sinHora = todas.some((c) => !c.horario?.length)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-grafito-500 first-letter:uppercase">{fechaLarga(hoy)}</p>
          <h1 className="text-2xl font-bold">Hola, {usuario?.first_name || usuario?.username}</h1>
        </div>
        {todas.length > 0 && (
          <Segmentado valor={vista} onChange={setVista} opciones={[{ valor: 'hoy', label: 'Hoy' }, { valor: 'semana', label: 'Mi horario' }]} />
        )}
      </div>

      {clases.isLoading && <Cargando />}
      <ErrorCaja error={clases.error} />
      {clases.data && !clases.data.length && (
        <Vacio titulo="No tenés clases asignadas este año" texto="Pedí a coordinación que te asigne tus materias y secciones." />
      )}

      {vista === 'semana' && todas.length > 0 && <Semana clases={todas} hoy={hoy} />}

      {vista === 'hoy' && todas.length > 0 && (
        <>
          <AhoraTengo ahora={ahora} siguiente={siguiente} hora={hora} listaHecha={listaHecha} tema={tema}
            faltan={turnos.length > 0 ? deHoy.filter((c) => !listaHecha(c.id)).length : 0} />

          <SugerenciasNuevas />

          <section className="mb-8">
            <h2 className="mb-2 text-lg font-bold">Clases de hoy</h2>
            {deHoy.length ? (
              <ListaClases clases={deHoy} listaHecha={listaHecha} hoy={hoy} actual={ahora?.clase.id} tema={tema} conEstado />
            ) : (
              <p className="rounded-xl border border-dashed border-grafito-300 px-4 py-6 text-center text-grafito-500">
                Hoy no tenés clases según tu horario.
              </p>
            )}
          </section>

          {otras.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-bold">Otras materias</h2>
              <ListaClases clases={otras} listaHecha={listaHecha} hoy={hoy} />
            </section>
          )}
        </>
      )}

      {todas.length > 0 && (sinDias || sinHora) && (
        <p className="mt-6 text-sm text-grafito-500">
          {sinDias && 'Las materias sin días de clase cargados aparecen todos los días. '}
          {sinHora && 'Cargá la hora de cada materia para ver qué clase tenés ahora. '}
          Entrá a la materia y tocá el horario, debajo del nombre.
        </p>
      )}
    </div>
  )
}

/** Sugerencias de dirección que el docente todavía no leyó, con enlace a donde corresponden. */
function SugerenciasNuevas() {
  const q = useQuery({
    queryKey: ['sugerencias-pendientes'],
    queryFn: () => lista('/sugerencias/?leida=false') as Promise<Sugerencia[]>,
    retry: false,
  })
  if (!q.data?.length) return null
  return (
    <section className="mb-6 rounded-2xl border border-tarde bg-tarde-50 p-4">
      <h2 className="flex items-center gap-1.5 font-bold">
        <MessageSquareText className="size-5 text-tarde" />
        Dirección te dejó {q.data.length === 1 ? 'una sugerencia' : `${q.data.length} sugerencias`}
      </h2>
      <ul className="mt-2 space-y-1.5">
        {q.data.map((s) => (
          <li key={s.id}>
            <Link to={s.sobre === 'CLASE' ? `/clases/${s.asignacion}?t=desarrollo&fecha=${s.fecha_clase}` : `/clases/${s.asignacion}?t=unidades`}
              className="block rounded-lg bg-white px-3 py-2 active:bg-tinta-50">
              <p className="text-sm font-bold text-tinta-700">
                {s.materia} · {s.sobre === 'CLASE' ? `clase del ${fechaCorta(s.fecha_clase)}` : s.unidad_titulo ?? 'plan anual'}
              </p>
              <p className="line-clamp-2 text-[15px]">{s.texto}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Tarjeta de arriba: la clase que se está dando ahora, o la próxima. */
function AhoraTengo({ ahora, siguiente, hora, listaHecha, tema, faltan }: {
  ahora?: Turno; siguiente?: Turno; hora: string; listaHecha: (id: number) => boolean; tema: (id: number) => string; faltan: number
}) {
  const min = aMinutos(hora)
  if (ahora) {
    const hecha = listaHecha(ahora.clase.id)
    return (
      <Link to={`/clases/${ahora.clase.id}`} className="mb-6 block rounded-2xl bg-tinta-700 p-5 text-white shadow-sm active:bg-tinta-800">
        <p className="flex items-center gap-1.5 text-sm font-bold text-tinta-100">
          <Clock className="size-4" /> Ahora · {ahora.bloque.inicio} a {ahora.bloque.fin} · quedan {duracion(aMinutos(ahora.bloque.fin) - min)}
        </p>
        <p className="mt-1 text-2xl font-bold leading-tight">{ahora.clase.materia_nombre}</p>
        <p className="text-tinta-100">{ahora.clase.seccion_descripcion}</p>
        {tema(ahora.clase.id) && <p className="mt-2 line-clamp-2"><b>Tema planificado:</b> {tema(ahora.clase.id)}</p>}
        <span className="mt-4 inline-flex h-11 items-center gap-2 rounded-control bg-white px-4 font-bold text-tinta-700">
          {hecha ? <><Check className="size-5" /> Lista guardada · ver</> : 'Llamar lista'}
        </span>
        {siguiente && (
          <p className="mt-3 truncate text-sm text-tinta-100">
            Después: <b className="text-white">{siguiente.clase.materia_nombre}</b> a las {siguiente.bloque.inicio} · {siguiente.clase.seccion_descripcion}
          </p>
        )}
      </Link>
    )
  }
  if (siguiente) {
    return (
      <Link to={`/clases/${siguiente.clase.id}`} className="mb-6 block rounded-2xl border border-tinta-200 bg-tinta-50 p-5 active:bg-tinta-100">
        <p className="flex items-center gap-1.5 text-sm font-bold text-tinta-700">
          <Clock className="size-4" /> Próxima clase · {siguiente.bloque.inicio} a {siguiente.bloque.fin} · en {duracion(aMinutos(siguiente.bloque.inicio) - min)}
        </p>
        <p className="mt-1 text-xl font-bold leading-tight">{siguiente.clase.materia_nombre}</p>
        <p className="text-grafito-500">{siguiente.clase.seccion_descripcion}</p>
        {tema(siguiente.clase.id) && <p className="mt-2 line-clamp-2"><b>Tema planificado:</b> {tema(siguiente.clase.id)}</p>}
      </Link>
    )
  }
  if (faltan > 0) {
    return (
      <p className="mb-6 rounded-xl bg-tarde-50 px-4 py-3 font-bold text-tarde">
        Terminaron tus clases de hoy. Te falta llamar lista en {faltan === 1 ? '1 clase' : `${faltan} clases`}.
      </p>
    )
  }
  return null
}

function ListaClases({ clases, listaHecha, hoy, actual, tema, conEstado }: {
  clases: any[]; listaHecha: (id: number) => boolean; hoy: string; actual?: number; tema?: (id: number) => string; conEstado?: boolean
}) {
  return (
    <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
      {clases.map((c) => {
        const hecha = listaHecha(c.id)
        const horas = bloquesDelDia(c.horario, hoy).map((b) => `${b.inicio} a ${b.fin}`).join(', ')
        const horario = horarioTexto(c.dias_clase, c.horario)
        const estado = hecha ? 'Lista de hoy guardada' : 'Falta llamar lista'
        return (
          <li key={c.id}>
            <Link to={`/clases/${c.id}`} className={cn('flex items-center gap-4 px-4 py-4 active:bg-tinta-50', c.id === actual && 'bg-tinta-50')}>
              <span className={cn('grid size-11 shrink-0 place-items-center rounded-full text-lg font-bold',
                hecha ? 'bg-presente text-white' : conEstado ? 'bg-tinta-100 text-tinta-700' : 'bg-grafito-100 text-grafito-500')}>
                {hecha ? <Check className="size-6" /> : c.materia_nombre[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight">{c.materia_nombre}</p>
                <p className="truncate text-sm text-grafito-500">{c.seccion_descripcion}</p>
                {conEstado ? (
                  <>
                    <p className="text-sm">
                      {horas && <span className="font-bold text-tinta-700">{horas} · </span>}
                      <span className={hecha ? 'text-grafito-500' : 'font-bold text-tarde'}>{estado}</span>
                    </p>
                    {tema?.(c.id) && <p className="truncate text-sm text-grafito-600">Tema: {tema(c.id)}</p>}
                  </>
                ) : (
                  <p className="text-sm text-grafito-500">{horario || 'Sin días de clase cargados'}</p>
                )}
              </div>
              <ChevronRight className="size-5 text-grafito-300" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Horario de la semana, día por día. */
function Semana({ clases, hoy }: { clases: any[]; hoy: string }) {
  const diaHoy = diaSemana(hoy)
  const sinDias = clases.filter((c) => !c.dias_clase?.length)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DIAS_SEMANA.map((d) => {
          const items = clases.filter((c) => c.dias_clase?.includes(d.n)).flatMap((c): { c: any; b: Bloque | null }[] => {
            const bloques: Bloque[] = (c.horario ?? []).filter((b: Bloque) => b.dia === d.n)
            return bloques.length ? bloques.map((b) => ({ c, b })) : [{ c, b: null }]
          }).sort((x, y) => (x.b?.inicio ?? '99:99').localeCompare(y.b?.inicio ?? '99:99'))
          if (!items.length && d.n === 6) return null // el sábado solo si hay clases
          return (
            <section key={d.n} className={cn('overflow-hidden rounded-xl border bg-white',
              d.n === diaHoy ? 'border-tinta-500 ring-2 ring-tinta-100' : 'border-grafito-200')}>
              <h3 className="flex items-center justify-between border-b border-grafito-100 px-4 py-2 font-bold capitalize">
                {d.largo} {d.n === diaHoy && <span className="text-sm normal-case text-tinta-600">hoy</span>}
              </h3>
              {items.length ? (
                <ul className="divide-y divide-grafito-100">
                  {items.map(({ c, b }) => (
                    <li key={`${c.id}-${b?.inicio}`}>
                      <Link to={`/clases/${c.id}`} className="flex gap-3 px-4 py-2.5 active:bg-tinta-50">
                        <span className={cn('w-24 shrink-0 text-sm font-bold tabular-nums', b ? 'text-tinta-700' : 'text-grafito-400')}>
                          {b ? `${b.inicio} – ${b.fin}` : 'Sin hora'}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-bold leading-tight">{c.materia_nombre}</span>
                          <span className="block truncate text-sm text-grafito-500">{c.seccion_descripcion}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-sm text-grafito-500">Sin clases</p>
              )}
            </section>
          )
        })}
      </div>
      {sinDias.length > 0 && (
        <p className="mt-4 text-sm text-grafito-500">
          Sin días cargados: {sinDias.map((c) => c.materia_nombre).join(', ')}.
        </p>
      )}
    </>
  )
}
