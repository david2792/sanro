import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { BotonIcono, Cargando, ErrorCaja } from '../../components/ui'
import { api } from '../../lib/api'
import { cn, DIAS_SEMANA, fechaCorta, fechaLarga, hoyISO, lunesDe, sumarDias } from '../../lib/utils'

type Evaluacion = {
  id: number; fecha: string; titulo: string; tipo: string; tipo_texto: string
  materia: string; docente: string; propia: boolean
  /** Si cuenta para el máximo por día (según lo que configuró el colegio). */
  cuenta: boolean
}
type Semana = { maximo_por_dia: number; cuentan: 'PRUEBAS' | 'TODAS'; bloquea: boolean; evaluaciones: Evaluacion[] }

/** Evaluaciones de todas las materias de la sección en la semana (lunes a sábado). */
function useSemana(seccion: number, lunes: string) {
  return useQuery({
    queryKey: ['evaluaciones', seccion, lunes],
    queryFn: () => api(`/evaluaciones/?seccion=${seccion}&desde=${lunes}&hasta=${sumarDias(lunes, 5)}`) as Promise<Semana>,
  })
}

const listaMaterias = (ev: Evaluacion[]) => ev.map((e) => `${e.materia} (${e.tipo_texto.toLowerCase()})`).join(', ')

/** "1 prueba", "2 evaluaciones"… según lo que cuenta el colegio. */
function cantidad(n: number, cuentan: Semana['cuentan']) {
  if (cuentan === 'PRUEBAS') return `${n} ${n === 1 ? 'prueba' : 'pruebas'}`
  return `${n} ${n === 1 ? 'evaluación' : 'evaluaciones'}`
}

/**
 * La semana de evaluaciones del curso.
 * - `fecha`: el día elegido (se resalta y se avisa si el curso ya llegó al máximo).
 * - `tipo`: el tipo del trabajo que se está cargando (un práctico puede no contar para el máximo).
 * - `excluir`: el trabajo que se está editando, para no contarlo dos veces.
 * - `onElegir`: si se pasa, tocar un día lo elige.
 */
export function SemanaEvaluaciones({ seccion, fecha, tipo, excluir, onElegir, aviso = true }: {
  seccion: number; fecha: string; tipo?: string; excluir?: number; onElegir?: (fecha: string) => void; aviso?: boolean
}) {
  const [lunes, setLunes] = useState(lunesDe(fecha))
  const [fechaVista, setFechaVista] = useState(fecha)
  if (fecha !== fechaVista) {
    // Cambió la fecha elegida: se muestra su semana.
    setFechaVista(fecha)
    setLunes(lunesDe(fecha))
  }
  const semana = useSemana(seccion, lunes)
  const delDia = useSemana(seccion, lunesDe(fecha))
  const hoy = hoyISO()

  const reglas = delDia.data
  const maximo = reglas?.maximo_por_dia ?? 0
  const cuentaEste = !tipo || reglas?.cuentan === 'TODAS' || tipo === 'PRUEBA'
  const otras = (reglas?.evaluaciones ?? []).filter((e) => e.fecha === fecha && e.id !== excluir)
  const contadas = otras.filter((e) => e.cuenta)
  const lleno = maximo > 0 && cuentaEste && contadas.length >= maximo

  return (
    <div className="space-y-2">
      {aviso && reglas && lleno && (
        <p className="flex items-start gap-2 rounded-control bg-ausente-50 px-3 py-2.5 text-[15px] text-ausente">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <span>
            <b>El curso ya tiene {cantidad(contadas.length, reglas.cuentan)} el {fechaLarga(fecha)}:</b> {listaMaterias(contadas)}.{' '}
            El colegio permite {cantidad(maximo, reglas.cuentan)} por día.{' '}
            {reglas.bloquea ? 'No vas a poder guardarlo en esta fecha: elegí otro día.' : 'Te conviene elegir otro día.'}
          </span>
        </p>
      )}
      {aviso && reglas && !lleno && otras.length > 0 && (
        <p className="rounded-control bg-tarde-50 px-3 py-2 text-sm text-grafito-700">
          Ese día el curso ya tiene: {listaMaterias(otras)}.
        </p>
      )}

      <div className="rounded-xl border border-grafito-200 bg-white">
        <div className="flex items-center justify-between border-b border-grafito-100 px-2 py-1">
          <BotonIcono type="button" onClick={() => setLunes(sumarDias(lunes, -7))} aria-label="Semana anterior"><ChevronLeft className="size-5" /></BotonIcono>
          <p className="text-center text-sm font-bold">Evaluaciones del curso · semana del {fechaCorta(lunes).slice(0, 5)} al {fechaCorta(sumarDias(lunes, 5)).slice(0, 5)}</p>
          <BotonIcono type="button" onClick={() => setLunes(sumarDias(lunes, 7))} aria-label="Semana siguiente"><ChevronRight className="size-5" /></BotonIcono>
        </div>
        {semana.isLoading ? <Cargando /> : semana.error ? <div className="p-3"><ErrorCaja error={semana.error} /></div> : (
          <ul className="divide-y divide-grafito-100">
            {DIAS_SEMANA.map((d, i) => {
              const iso = sumarDias(lunes, i)
              const ev = (semana.data?.evaluaciones ?? []).filter((e) => e.fecha === iso && e.id !== excluir)
              const n = ev.filter((e) => e.cuenta).length
              const max = semana.data?.maximo_por_dia ?? 0
              const elegido = iso === fecha
              const contenido = (
                <>
                  <div className="w-14 shrink-0">
                    <p className={cn('text-xs font-bold uppercase', iso === hoy ? 'text-tinta-700' : 'text-grafito-500')}>{d.corto}</p>
                    <p className="font-bold">{Number(iso.slice(8))}</p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5 py-0.5">
                    {!ev.length && <p className="text-sm text-grafito-400">Sin evaluaciones</p>}
                    {ev.map((e) => (
                      <p key={e.id} className={cn('truncate text-sm', !e.cuenta && 'opacity-60')}>
                        <b className={e.propia ? 'text-tinta-700' : undefined}>{e.materia}</b>
                        <span className="text-grafito-500"> · {e.tipo_texto}: {e.titulo}</span>
                      </p>
                    ))}
                  </div>
                  {n > 0 && (
                    <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold',
                      max > 0 && n >= max ? 'bg-ausente text-white' : 'bg-grafito-100 text-grafito-700')}>{n}</span>
                  )}
                </>
              )
              const clase = cn('flex w-full items-start gap-2 px-3 py-2 text-left', elegido && 'bg-tinta-50 ring-2 ring-inset ring-tinta-500')
              return (
                <li key={iso}>
                  {onElegir ? (
                    <button type="button" onClick={() => onElegir(iso)} className={cn(clase, 'hover:bg-grafito-50')}>{contenido}</button>
                  ) : <div className={clase}>{contenido}</div>}
                </li>
              )
            })}
          </ul>
        )}
        {semana.data && semana.data.maximo_por_dia > 0 && (
          <p className="border-t border-grafito-100 px-3 py-2 text-xs text-grafito-500">
            Regla del colegio: hasta {cantidad(semana.data.maximo_por_dia, semana.data.cuentan)} por día
            {semana.data.cuentan === 'PRUEBAS' && ' (los demás trabajos aparecen más claros y no cuentan)'}.
          </p>
        )}
      </div>
      {onElegir && <p className="text-xs text-grafito-500">Tocá un día para elegirlo como fecha del trabajo.</p>}
    </div>
  )
}
