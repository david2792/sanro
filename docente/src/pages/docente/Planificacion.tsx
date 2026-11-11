import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardList, ListPlus, Printer, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useImpresion } from '../../components/Reporte'
import { Sugerencias } from '../../components/Sugerencias'
import { Boton, BotonIcono, Campo, Cargando, Confirmar, ErrorCaja, Hoja, Input, Select, Textarea, useAviso } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { cn, DIAS_SEMANA, diaSemana, fechaCorta, fechaLarga, hoyISO, nombreMes, sumarMes } from '../../lib/utils'
import { MarcarCapacidades } from './Desarrollo'

type Dia = {
  fecha: string
  clase: boolean
  no_lectivo: string | null
  plan: any | null
  dictada: boolean
  registro: { contenido: string; unidad_titulo: string | null } | null
  trabajos: { id: number; titulo: string; tipo: string }[]
}

/** La unidad que, según sus fechas, corresponde a un día. */
function unidadDelDia(unidades: any[], fecha: string) {
  return unidades.find((u) => u.fecha_inicio && u.fecha_fin && u.fecha_inicio <= fecha && fecha <= u.fecha_fin) ?? null
}

/**
 * Planificación de las clases por fecha, mes a mes. Lo planificado para un día
 * se usa después para completar el desarrollo de esa clase.
 */
export default function Planificacion({ asignacion, irAClase, soloLectura, mesInicial }: {
  asignacion: number; irAClase?: (fecha: string, tab: 'lista' | 'desarrollo') => void
  /** Dirección: ve e imprime, pero no cambia la planificación del docente. */
  soloLectura?: boolean; mesInicial?: string
}) {
  const [mes, setMes] = useState(mesInicial ?? hoyISO().slice(0, 7))
  const [editando, setEditando] = useState<Dia | null>(null)
  const [repartir, setRepartir] = useState(false)
  const [imprimir, zona] = useImpresion()

  const cal = useQuery({
    queryKey: ['calendario', asignacion, mes],
    queryFn: () => api(`/planes-clase/calendario/?asignacion=${asignacion}&mes=${mes}`),
  })
  const unidades = useQuery({ queryKey: ['unidades', asignacion], queryFn: () => lista(`/unidades/?asignacion=${asignacion}`, true) })

  const datos = cal.data
  const dias: Dia[] = datos?.dias ?? []
  const abrir = (fecha: string) =>
    setEditando(dias.find((d) => d.fecha === fecha) ?? { fecha, clase: false, no_lectivo: null, plan: null, dictada: false, registro: null, trabajos: [] })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <BotonIcono onClick={() => setMes(sumarMes(mes, -1))} aria-label="Mes anterior"><ChevronLeft className="size-5" /></BotonIcono>
          <h2 className="min-w-40 text-center text-lg font-bold capitalize">{nombreMes(mes)}</h2>
          <BotonIcono onClick={() => setMes(sumarMes(mes, 1))} aria-label="Mes siguiente"><ChevronRight className="size-5" /></BotonIcono>
          {mes !== hoyISO().slice(0, 7) && (
            <button onClick={() => setMes(hoyISO().slice(0, 7))} className="ml-1 rounded-lg bg-grafito-100 px-2.5 py-1.5 text-xs font-bold text-grafito-700">
              Este mes
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={imprimir} disabled={!datos}><Printer className="size-4" /> Imprimir mes</Boton>
          {!soloLectura && <Boton variante="secundario" onClick={() => setRepartir(true)}><ListPlus className="size-4" /> Repartir temas</Boton>}
        </div>
      </div>

      {cal.error && <ErrorCaja error={cal.error} />}
      {cal.isLoading && <Cargando />}

      {datos && (
        <>
          {!datos.dias_clase?.length && (
            <p className="rounded-control bg-tarde-50 px-4 py-3 text-grafito-700">
              Cargá los días de clase de la materia (el botón de horario, arriba) para ver tus clases en el calendario.
              Igual podés planificar tocando cualquier día.
            </p>
          )}
          <Resumen r={datos.resumen} />
          <Mes mes={mes} dias={dias} onDia={abrir} />
          <ListaDias dias={dias} onDia={abrir} />
        </>
      )}

      {editando && (soloLectura || !irAClase ? (
        <VerDia dia={editando} unidades={unidades.data ?? []} onCerrar={() => setEditando(null)} />
      ) : (
        <EditarDia key={editando.fecha} asignacion={asignacion} dia={editando} unidades={unidades.data ?? []}
          onCerrar={() => setEditando(null)}
          onMovido={(fecha) => setMes(fecha.slice(0, 7))}
          irAClase={irAClase} />
      ))}
      {!soloLectura && (
        <Repartir abierta={repartir} asignacion={asignacion} unidades={unidades.data ?? []}
          onCerrar={() => setRepartir(false)} onListo={(desde) => setMes(desde.slice(0, 7))} />
      )}
      {datos && zona(<MesImpreso datos={datos} unidades={unidades.data ?? []} />)}
    </div>
  )
}

function Resumen({ r }: { r: { clases: number; planificadas: number; dictadas: number } }) {
  if (!r.clases) return null
  const faltan = r.clases - r.planificadas
  return (
    <div className="rounded-xl border border-grafito-200 bg-white px-4 py-3">
      <p className="text-[15px]">
        <b>{r.clases}</b> {r.clases === 1 ? 'clase' : 'clases'} este mes · <b>{r.planificadas}</b> planificadas · <b>{r.dictadas}</b> dadas
        {faltan > 0 && <span className="text-tarde"> · {faltan} sin planificar</span>}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-grafito-100">
        <div className="h-full rounded-full bg-tinta-600" style={{ width: `${(r.planificadas / r.clases) * 100}%` }} />
      </div>
    </div>
  )
}

/** Grilla del mes, de lunes a sábado. */
function Mes({ mes, dias, onDia }: { mes: string; dias: Dia[]; onDia: (fecha: string) => void }) {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  const corrimiento = diaSemana(`${mes}-01`) - 1
  const semanas: (string | null)[][] = Array.from({ length: Math.ceil((ultimo + corrimiento) / 7) }, () => Array(6).fill(null))
  for (let d = 1; d <= ultimo; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`
    const ds = diaSemana(iso)
    if (ds === 7) continue
    semanas[Math.floor((d - 1 + corrimiento) / 7)][ds - 1] = iso
  }
  const porFecha = new Map(dias.map((d) => [d.fecha, d]))
  const hoy = hoyISO()

  return (
    <div className="rounded-xl border border-grafito-200 bg-white p-2">
      <div className="grid grid-cols-6 gap-1 text-center text-xs font-bold text-grafito-500">
        {DIAS_SEMANA.map((d) => <div key={d.n} className="py-1">{d.corto}</div>)}
      </div>
      {semanas.filter((s) => s.some(Boolean)).map((s, i) => (
        <div key={i} className="mt-1 grid grid-cols-6 gap-1">
          {s.map((iso, j) => {
            if (!iso) return <div key={j} />
            const d = porFecha.get(iso)
            const sinPlan = d?.clase && !d.plan && !d.dictada
            return (
              <button key={j} onClick={() => onDia(iso)}
                className={cn('relative flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-bold transition-colors',
                  d?.no_lectivo ? 'border-transparent bg-grafito-100 text-grafito-400 line-through'
                    : d?.dictada ? 'border-presente bg-presente-50 text-presente'
                    : d?.plan ? 'border-tinta-500 bg-tinta-50 text-tinta-700'
                    : sinPlan ? 'border-dashed border-tarde bg-tarde-50 text-tarde'
                    : 'border-transparent text-grafito-400 hover:bg-grafito-50',
                  iso === hoy && 'ring-2 ring-tinta-700 ring-offset-1')}>
                {Number(iso.slice(8))}
                <span className="flex h-2 items-center gap-0.5">
                  {d?.dictada && <Check className="size-3" />}
                  {!!d?.trabajos.length && <span className="size-1.5 rounded-full bg-ausente" />}
                </span>
              </button>
            )
          })}
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-grafito-500">
        <span><span className="mr-1 inline-block size-2.5 rounded-sm border border-tinta-500 bg-tinta-50" />Planificada</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm border border-dashed border-tarde bg-tarde-50" />Sin planificar</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm border border-presente bg-presente-50" />Dada</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-grafito-100" />No lectivo</span>
        <span><span className="mr-1 inline-block size-1.5 rounded-full bg-ausente align-middle" /> Trabajo</span>
      </div>
    </div>
  )
}

/** Las clases del mes, una debajo de otra, con lo planificado. */
function ListaDias({ dias, onDia }: { dias: Dia[]; onDia: (fecha: string) => void }) {
  if (!dias.length) return <p className="py-6 text-center text-grafito-500">No hay clases en este mes.</p>
  const hoy = hoyISO()
  return (
    <ul className="space-y-2">
      {dias.map((d) => (
        <li key={d.fecha}>
          <button onClick={() => onDia(d.fecha)}
            className={cn('flex w-full items-start gap-3 rounded-xl border bg-white px-3 py-2.5 text-left hover:bg-grafito-50',
              d.fecha === hoy ? 'border-tinta-700' : 'border-grafito-200', d.no_lectivo && 'opacity-60')}>
            <div className="w-12 shrink-0 text-center">
              <p className="text-xs font-bold uppercase text-grafito-500">{DIAS_SEMANA.find((x) => x.n === diaSemana(d.fecha))?.corto ?? 'Dom'}</p>
              <p className="text-xl font-bold leading-tight">{Number(d.fecha.slice(8))}</p>
            </div>
            <div className="min-w-0 flex-1">
              {d.no_lectivo ? (
                <p className="font-bold text-grafito-500">No lectivo: {d.no_lectivo}</p>
              ) : d.plan ? (
                <>
                  {d.plan.unidad_titulo && <p className="truncate text-xs font-bold text-tinta-700">{d.plan.unidad_titulo}</p>}
                  <p className="line-clamp-2">{d.plan.contenido || <span className="text-grafito-500">Sin tema escrito</span>}</p>
                </>
              ) : d.clase && !d.dictada ? (
                <p className="font-bold text-tarde">Sin planificar</p>
              ) : !d.clase && !d.dictada && !d.trabajos.length ? (
                <p className="text-grafito-500">Sin clase</p>
              ) : null}
              {d.dictada && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-presente">
                  <Check className="size-4 shrink-0" />
                  <span className="truncate">Dada{d.registro?.contenido ? `: ${d.registro.contenido}` : ''}</span>
                </p>
              )}
              {d.trabajos.map((t) => (
                <p key={t.id} className="mt-0.5 flex items-center gap-1 text-sm text-ausente">
                  <ClipboardList className="size-4 shrink-0" /> <span className="truncate">{t.tipo}: {t.titulo}</span>
                </p>
              ))}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Planificar (o mover, borrar o correr) la clase de un día. */
function EditarDia({ asignacion, dia, unidades, onCerrar, onMovido, irAClase }: {
  asignacion: number; dia: Dia; unidades: any[]
  onCerrar: () => void; onMovido: (fecha: string) => void; irAClase: (fecha: string, tab: 'lista' | 'desarrollo') => void
}) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const p = dia.plan
  const [form, setForm] = useState(() => ({
    fecha: dia.fecha,
    unidad: p ? p.unidad : unidadDelDia(unidades, dia.fecha)?.id ?? null,
    capacidades: (p?.capacidades ?? []) as number[],
    indicadores: (p?.indicadores ?? []) as number[],
    contenido: p?.contenido ?? '',
    actividades: p?.actividades ?? '',
    recursos: p?.recursos ?? '',
  }))
  const [ocupado, setOcupado] = useState<'' | 'guardar' | 'borrar' | 'correr'>('')
  const [confirmar, setConfirmar] = useState<'' | 'borrar' | 'correr'>('')
  const unidad = unidades.find((u) => u.id === form.unidad)
  const pasada = dia.fecha <= hoyISO()

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['calendario', asignacion] })
    void qc.invalidateQueries({ queryKey: ['plan-clase', asignacion] })
  }

  const ejecutar = async (accion: 'guardar' | 'borrar' | 'correr') => {
    setOcupado(accion)
    setConfirmar('')
    try {
      if (accion === 'guardar') {
        const body = { ...form, asignacion }
        await (p ? api(`/planes-clase/${p.id}/`, { method: 'PATCH', body }) : api('/planes-clase/', { method: 'POST', body }))
        if (form.fecha !== dia.fecha) {
          avisar(`Clase movida al ${fechaLarga(form.fecha)}`)
          onMovido(form.fecha)
        } else avisar('Clase planificada')
        void qc.invalidateQueries({ queryKey: ['frases'] })
      } else if (accion === 'borrar') {
        await api(`/planes-clase/${p.id}/`, { method: 'DELETE' })
        avisar('Planificación borrada')
      } else {
        const r = await api('/planes-clase/correr/', { method: 'POST', body: { asignacion, desde: dia.fecha } })
        avisar(`${r.corridas} ${r.corridas === 1 ? 'clase corrida' : 'clases corridas'} a la clase siguiente`)
      }
      refrescar()
      onCerrar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo completar.', 'error')
    } finally {
      setOcupado('')
    }
  }

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={`Clase del ${fechaLarga(dia.fecha)}`}
      pie={<Boton className="flex-1" onClick={() => void ejecutar('guardar')} cargando={ocupado === 'guardar'}>Guardar</Boton>}>
      <div className="space-y-4">
        {dia.no_lectivo && <p className="rounded-control bg-grafito-100 px-4 py-3 text-grafito-700">Día no lectivo: {dia.no_lectivo}</p>}
        {!dia.clase && !dia.no_lectivo && (
          <p className="rounded-control bg-grafito-100 px-4 py-3 text-grafito-600">Este día no es un día de clase de la materia. Igual podés planificarlo.</p>
        )}
        {dia.dictada ? (
          <div className="rounded-control bg-presente-50 px-4 py-3">
            <p className="font-bold text-presente">Esta clase ya se dio{dia.registro?.contenido ? `: ${dia.registro.contenido}` : '.'}</p>
            <Boton variante="secundario" className="mt-2" onClick={() => irAClase(dia.fecha, 'desarrollo')}>Ver el desarrollo</Boton>
          </div>
        ) : pasada && dia.clase && (
          <Boton variante="secundario" onClick={() => irAClase(dia.fecha, 'lista')}>Llamar lista de este día</Boton>
        )}
        {dia.trabajos.map((t) => (
          <p key={t.id} className="flex items-center gap-1.5 text-ausente"><ClipboardList className="size-4" /> {t.tipo}: {t.titulo}</p>
        ))}

        <Campo label="Unidad">
          <Select value={form.unidad ?? ''} onChange={(e) => setForm({ ...form, unidad: e.target.value ? Number(e.target.value) : null, capacidades: [], indicadores: [] })}>
            <option value="">Sin unidad</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>Unidad {u.numero}: {u.titulo}</option>)}
          </Select>
        </Campo>
        {unidad && (
          <MarcarCapacidades unidad={unidad} titulo="Capacidades a trabajar" ayudaIndicadores="Indicadores que pensás evaluar"
            capacidades={form.capacidades} indicadores={form.indicadores}
            onChange={(capacidades, indicadores) => setForm({ ...form, capacidades, indicadores })} />
        )}
        <Campo label="Contenido o tema">
          <Textarea value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })} />
        </Campo>
        <div>
          <Campo label="Actividades y estrategias">
            <Textarea value={form.actividades} onChange={(e) => setForm({ ...form, actividades: e.target.value })} />
          </Campo>
          <Sugerencias campo="actividades" valor={form.actividades} onChange={(actividades) => setForm({ ...form, actividades })} />
        </div>
        <Campo label="Recursos">
          <Textarea rows={2} value={form.recursos} onChange={(e) => setForm({ ...form, recursos: e.target.value })} />
        </Campo>

        {p && (
          <div className="space-y-3 border-t border-grafito-200 pt-4">
            <Campo label="Mover a otra fecha" ayuda="Para cambiar solo esta clase de día.">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value || dia.fecha })} />
            </Campo>
            {!dia.dictada && (
              <Boton variante="secundario" className="w-full" onClick={() => setConfirmar('correr')} cargando={ocupado === 'correr'}>
                <CalendarClock className="size-4" /> No se dio esta clase: correr todo una clase
              </Boton>
            )}
            <Boton variante="fantasma" className="w-full text-ausente" onClick={() => setConfirmar('borrar')} cargando={ocupado === 'borrar'}>
              <Trash2 className="size-4" /> Borrar la planificación de este día
            </Boton>
          </div>
        )}
      </div>

      <Confirmar abierta={confirmar === 'correr'} titulo="Correr la planificación" accion="Correr"
        texto={`Lo planificado desde el ${fechaLarga(dia.fecha)} pasa a la clase siguiente (cada clase avanza una). Usalo cuando no pudiste dar esta clase.`}
        onCerrar={() => setConfirmar('')} onConfirmar={() => void ejecutar('correr')} />
      <Confirmar abierta={confirmar === 'borrar'} titulo="Borrar la planificación" accion="Borrar"
        texto="Se borra lo planificado para este día. Las demás clases no cambian."
        onCerrar={() => setConfirmar('')} onConfirmar={() => void ejecutar('borrar')} />
    </Hoja>
  )
}

/** Textos de capacidades e indicadores por id, para mostrar lo que guarda la planificación. */
function textos(unidades: any[]) {
  const capacidades = new Map<number, string>()
  const indicadores = new Map<number, string>()
  for (const u of unidades)
    for (const c of u.capacidades) {
      capacidades.set(c.id, c.descripcion)
      for (const i of c.indicadores) indicadores.set(i.id, i.descripcion)
    }
  return { capacidades, indicadores }
}

/** Dirección: lo planificado para un día, sin poder cambiarlo. */
function VerDia({ dia, unidades, onCerrar }: { dia: Dia; unidades: any[]; onCerrar: () => void }) {
  const p = dia.plan
  const t = textos(unidades)
  const bloque = (titulo: string, contenido: ReactNode) => contenido ? (
    <div>
      <p className="text-sm font-bold text-grafito-500">{titulo}</p>
      <div className="whitespace-pre-line">{contenido}</div>
    </div>
  ) : null
  return (
    <Hoja abierta onCerrar={onCerrar} titulo={`Clase del ${fechaLarga(dia.fecha)}`}>
      <div className="space-y-4">
        {dia.no_lectivo && <p className="rounded-control bg-grafito-100 px-4 py-3 text-grafito-700">Día no lectivo: {dia.no_lectivo}</p>}
        {dia.dictada && (
          <p className="rounded-control bg-presente-50 px-4 py-3 font-bold text-presente">
            Clase dada{dia.registro?.contenido ? `: ${dia.registro.contenido}` : ' (sin desarrollo cargado)'}
          </p>
        )}
        {!p ? (
          <p className="rounded-control bg-tarde-50 px-4 py-3 font-bold text-tarde">Sin planificar</p>
        ) : (
          <>
            {bloque('Unidad', p.unidad_titulo)}
            {bloque('Capacidades', p.capacidades.length > 0 && (
              <ul className="list-disc pl-5">{p.capacidades.map((id: number) => <li key={id}>{t.capacidades.get(id)}</li>)}</ul>))}
            {bloque('Indicadores a evaluar', p.indicadores.length > 0 && (
              <ul className="list-disc pl-5">{p.indicadores.map((id: number) => <li key={id}>{t.indicadores.get(id)}</li>)}</ul>))}
            {bloque('Contenido o tema', p.contenido)}
            {bloque('Actividades y estrategias', p.actividades)}
            {bloque('Recursos', p.recursos)}
          </>
        )}
        {dia.trabajos.map((tr) => (
          <p key={tr.id} className="flex items-center gap-1.5 text-ausente"><ClipboardList className="size-4" /> {tr.tipo}: {tr.titulo}</p>
        ))}
      </div>
    </Hoja>
  )
}

/** Planificación del mes en una hoja A4 apaisada, para entregar o archivar. */
function MesImpreso({ datos, unidades }: { datos: any; unidades: any[] }) {
  const e = datos.encabezado
  const t = textos(unidades)
  const celda = 'border border-black px-1.5 py-1 align-top'
  const etiqueta = `${celda} bg-[#c6d9ef] text-right font-bold`
  const cab = `${celda} bg-[#c6d9ef] text-center font-bold`
  const dias: Dia[] = datos.dias.filter((d: Dia) => d.clase || d.plan || d.no_lectivo || d.trabajos.length)
  return (
    <div className="text-[10.5px] text-black" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <style>{'@page { size: A4 landscape; margin: 9mm; }'}</style>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td colSpan={4} className={`${celda} bg-[#1f4e79] py-1.5 text-white`}>
              <div className="flex items-center justify-center gap-3">
                <img src="/logo-san-roque.png" alt="" className="h-11 w-auto rounded-sm bg-white p-0.5" />
                <span className="text-[15px] font-bold uppercase">Planificación de clases · {nombreMes(datos.mes)}</span>
              </div>
            </td>
          </tr>
          <tr><td className={`${etiqueta} w-32`}>Institución:</td><td className={celda}>{e.institucion}</td><td className={`${etiqueta} w-24`}>Área:</td><td className={celda}>{e.materia}</td></tr>
          <tr><td className={etiqueta}>Curso / Sección:</td><td className={celda}>{e.seccion}</td><td className={etiqueta}>Docente:</td><td className={celda}>{e.docente}</td></tr>
          <tr>
            <td className={etiqueta}>Resumen:</td>
            <td colSpan={3} className={celda}>
              {datos.resumen.clases} clases en el mes · {datos.resumen.planificadas} planificadas · {datos.resumen.dictadas} dadas
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr>
            <th className={`${cab} w-20`}>Fecha</th>
            <th className={`${cab} w-[20%]`}>Unidad y capacidades</th>
            <th className={cab}>Contenido</th>
            <th className={cab}>Actividades y estrategias</th>
            <th className={`${cab} w-[12%]`}>Recursos</th>
            <th className={`${cab} w-[16%]`}>Evaluación</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => {
            const p = d.plan
            const dia = `${DIAS_SEMANA.find((x) => x.n === diaSemana(d.fecha))?.corto ?? 'Dom'} ${fechaCorta(d.fecha).slice(0, 5)}`
            if (d.no_lectivo)
              return (
                <tr key={d.fecha}>
                  <td className={`${celda} font-bold`}>{dia}</td>
                  <td colSpan={5} className={`${celda} bg-[#eeeeee] italic`}>No lectivo: {d.no_lectivo}</td>
                </tr>
              )
            const evaluacion = [
              ...d.trabajos.map((tr) => `${tr.tipo}: ${tr.titulo}`),
              ...(p?.indicadores ?? []).map((id: number) => t.indicadores.get(id)),
            ].filter(Boolean)
            return (
              <tr key={d.fecha} style={{ breakInside: 'avoid' }}>
                <td className={`${celda} font-bold`}>{dia}{d.dictada && <span className="block font-normal">(dada)</span>}</td>
                <td className={celda}>
                  {p?.unidad_titulo && <p className="font-bold">{p.unidad_titulo}</p>}
                  {(p?.capacidades ?? []).map((id: number) => <p key={id}>• {t.capacidades.get(id)}</p>)}
                </td>
                <td className={`${celda} whitespace-pre-line`}>{p?.contenido || (!p && <span className="italic text-[#888]">Sin planificar</span>)}</td>
                <td className={`${celda} whitespace-pre-line`}>{p?.actividades}</td>
                <td className={`${celda} whitespace-pre-line`}>{p?.recursos}</td>
                <td className={celda}>{evaluacion.map((x, k) => <p key={k}>• {x}</p>)}</td>
              </tr>
            )
          })}
          {!dias.length && <tr><td colSpan={6} className={`${celda} text-center`}>No hay clases en este mes.</td></tr>}
        </tbody>
      </table>

      <div className="mt-14 flex justify-around gap-8">
        {['Docente', 'Coordinación pedagógica', 'Dirección'].map((c) => (
          <div key={c} className="w-56 border-t border-black pt-1 text-center">{c}</div>
        ))}
      </div>
    </div>
  )
}

/** Quita viñetas y numeración del principio de una línea: "1. Tema" / "- Tema" -> "Tema". */
const limpiarTema = (t: string) => t.replace(/^\s*([-•*–]|\d+[.)-])\s*/, '').trim()

/** Un tema por línea -> un tema por clase, desde una fecha, en las clases libres. */
function Repartir({ abierta, asignacion, unidades, onCerrar, onListo }: {
  abierta: boolean; asignacion: number; unidades: any[]; onCerrar: () => void; onListo: (desde: string) => void
}) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const [unidad, setUnidad] = useState<number | null>(null)
  const [desde, setDesde] = useState(hoyISO())
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const temas = texto.split('\n').map(limpiarTema).filter(Boolean)
  const u = unidades.find((x) => x.id === unidad)

  const elegirUnidad = (id: number | null) => {
    setUnidad(id)
    const nueva = unidades.find((x) => x.id === id)
    if (nueva?.fecha_inicio && nueva.fecha_inicio > hoyISO()) setDesde(nueva.fecha_inicio)
    setError('')
  }

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      const r = await api('/planes-clase/repartir/', { method: 'POST', body: { asignacion, unidad, desde, temas } })
      avisar(`${r.creadas} ${r.creadas === 1 ? 'clase planificada' : 'clases planificadas'}, del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`)
      void qc.invalidateQueries({ queryKey: ['calendario', asignacion] })
      void qc.invalidateQueries({ queryKey: ['plan-clase', asignacion] })
      setTexto('')
      onListo(r.desde)
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo planificar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Repartir temas en las clases"
      pie={<Boton className="flex-1" onClick={guardar} cargando={guardando} disabled={!temas.length}>
        Planificar {temas.length || ''} {temas.length === 1 ? 'clase' : 'clases'}
      </Boton>}>
      <p className="mb-4 text-grafito-600">
        Escribí un tema por línea. Cada tema va a una clase, en orden, desde la fecha que elijas.
        Se saltan los feriados y los días que ya tienen algo planificado o que ya se dieron.
      </p>
      <div className="space-y-4">
        <Campo label="Unidad">
          <Select value={unidad ?? ''} onChange={(e) => elegirUnidad(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sin unidad</option>
            {unidades.map((x) => <option key={x.id} value={x.id}>Unidad {x.numero}: {x.titulo}</option>)}
          </Select>
        </Campo>
        {u?.contenidos && (
          <Boton variante="secundario" onClick={() => setTexto(u.contenidos.split('\n').map(limpiarTema).filter(Boolean).join('\n'))}>
            Usar los contenidos de la unidad
          </Boton>
        )}
        <Campo label="Desde">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value || hoyISO())} />
        </Campo>
        <Campo label="Temas (uno por línea)" ayuda={temas.length ? `${temas.length} ${temas.length === 1 ? 'tema' : 'temas'} = ${temas.length} ${temas.length === 1 ? 'clase' : 'clases'}` : undefined}>
          <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={'La Revolución de Mayo\nLa Independencia del Paraguay\nEvaluación'} />
        </Campo>
        {error && <p className="rounded-control bg-ausente-50 px-4 py-3 text-ausente">{error}</p>}
      </div>
    </Hoja>
  )
}
