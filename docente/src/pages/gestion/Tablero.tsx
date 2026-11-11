import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, AlertTriangle, BookOpen, CalendarClock, ChevronRight, CircleAlert, ClipboardList, MessageCircle, UserX } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { BarrasPorcentaje, LineaAsistencia, DonutAsistenciaHoy } from '../../components/Graficos'
import { Cargando, Encabezado, ErrorCaja, Etiqueta, Input, Segmentado, Select, Tarjeta, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cn, diasTexto, fechaCorta, fechaLarga, hoyISO } from '../../lib/utils'

type Vista = 'colegio' | 'guia' | 'docente'

/* ============================== piezas comunes ============================== */

function Bloque({ titulo, detalle, children, accion, className }: {
  titulo: string; detalle?: ReactNode; children: ReactNode; accion?: ReactNode; className?: string
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{titulo}</h2>
          {detalle && <p className="text-sm text-grafito-500">{detalle}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}

const NIVEL = {
  ALTO: { texto: 'Riesgo alto', icono: AlertOctagon, clase: 'bg-ausente text-white' },
  MEDIO: { texto: 'Riesgo medio', icono: AlertTriangle, clase: 'bg-tarde-50 text-tarde' },
  BAJO: { texto: 'Atención', icono: CircleAlert, clase: 'bg-grafito-100 text-grafito-600' },
} as const

function NivelRiesgo({ nivel }: { nivel: keyof typeof NIVEL }) {
  const n = NIVEL[nivel]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold', n.clase)}>
      <n.icono className="size-3.5" /> {n.texto}
    </span>
  )
}

function Cifra({ valor, texto, icono: I, tono }: { valor: ReactNode; texto: string; icono?: typeof UserX; tono?: 'rojo' | 'ambar' }) {
  const tonoClase = {
    rojo: 'bg-rose-50 text-rose-600 border-rose-100',
    ambar: 'bg-amber-50 text-amber-700 border-amber-100',
    normal: 'bg-grafito-100/70 text-grafito-600 border-grafito-200',
  }[tono || 'normal']

  return (
    <Tarjeta className="flex h-full flex-col justify-between p-3.5 sm:p-4 transition-all hover:shadow-xs border border-grafito-200">
      <div className="flex items-center justify-between">
        <span className={cn('text-3xl font-extrabold tracking-tight', tono === 'rojo' ? 'text-ausente' : tono === 'ambar' ? 'text-tarde' : 'text-grafito')}>
          {valor}
        </span>
        {I && (
          <span className={cn('grid size-9 place-items-center rounded-xl border', tonoClase)}>
            <I className="size-4.5" />
          </span>
        )}
      </div>
      <p className="mt-2 text-xs sm:text-[13px] font-bold leading-snug text-grafito-500">{texto}</p>
    </Tarjeta>
  )
}

/** Lista de alumnos en riesgo con sus motivos. */
function Alertas({ alertas, mostrarSeccion = true, inicial = 6 }: { alertas: any[]; mostrarSeccion?: boolean; inicial?: number }) {
  const [nivel, setNivel] = useState<'TODOS' | 'ALTO' | 'MEDIO' | 'BAJO'>('TODOS')
  const [seccion, setSeccion] = useState('')
  const [todos, setTodos] = useState(false)
  const secciones = [...new Set(alertas.map((a) => a.seccion))]
  const filtradas = alertas.filter((a) => (nivel === 'TODOS' || a.nivel === nivel) && (!seccion || a.seccion === seccion))
  const visibles = todos ? filtradas : filtradas.slice(0, inicial)

  if (!alertas.length) {
    return <Vacio titulo="Ningún alumno en alerta" texto="Con los datos cargados hasta hoy nadie muestra señales de riesgo." />
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Segmentado valor={nivel} onChange={setNivel} opciones={[
          { valor: 'TODOS', label: `Todos ${alertas.length}` },
          { valor: 'ALTO', label: `Alto ${alertas.filter((a) => a.nivel === 'ALTO').length}` },
          { valor: 'MEDIO', label: `Medio ${alertas.filter((a) => a.nivel === 'MEDIO').length}` },
          { valor: 'BAJO', label: 'Atención' },
        ]} />
        {mostrarSeccion && secciones.length > 1 && (
          <Select value={seccion} onChange={(e) => setSeccion(e.target.value)} className="h-9 w-auto text-sm" aria-label="Sección">
            <option value="">Todas las secciones</option>
            {secciones.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
      </div>
      <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
        {visibles.map((a) => (
          <li key={a.matricula}>
            <Link to={`/alumnos/${a.alumno_id}`} className="flex gap-3 px-4 py-3 hover:bg-tinta-50/50 active:bg-tinta-50">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold">{a.alumno}</span>
                  <NivelRiesgo nivel={a.nivel} />
                </div>
                {mostrarSeccion && <p className="text-sm text-grafito-500">{a.seccion}</p>}
                <ul className="mt-1.5 space-y-0.5 text-[15px] text-grafito-600">
                  {a.motivos.map((m: string) => <li key={m} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-grafito-300" />{m}</li>)}
                </ul>
              </div>
              <ChevronRight className="mt-1 size-5 shrink-0 text-grafito-300" />
            </Link>
          </li>
        ))}
      </ul>
      {filtradas.length > inicial && (
        <button onClick={() => setTodos(!todos)} className="mt-2 w-full py-2 font-bold text-tinta-600">
          {todos ? 'Mostrar menos' : `Ver los ${filtradas.length}`}
        </button>
      )}
    </div>
  )
}

function Hoy({ hoy, extra, className }: { hoy: any; extra?: ReactNode; className?: string }) {
  const porcentaje = hoy.porcentaje
  const optimo = porcentaje != null && porcentaje >= 85
  const bajo = porcentaje != null && porcentaje < 75

  return (
    <div className={cn('relative overflow-hidden flex flex-col justify-between rounded-2xl bg-gradient-to-br from-tinta-900 via-tinta-800 to-tinta-700 p-5 text-white shadow-md', className)}>
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-tinta-200">Asistencia de Hoy</span>
        {porcentaje != null && (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', optimo ? 'bg-emerald-500/20 text-emerald-300' : bajo ? 'bg-rose-500/20 text-rose-300' : 'bg-blue-500/20 text-blue-200')}>
            {optimo ? '⭐ Óptima' : bajo ? '⚠️ Alerta' : 'Normal'}
          </span>
        )}
      </div>

      <div className="my-2 flex items-center justify-between gap-2">
        <div>
          {porcentaje == null ? (
            <p className="my-2 text-2xl font-bold leading-tight">Todavía no hay listas</p>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-5xl lg:text-6xl font-extrabold tracking-tight">{porcentaje}</span>
              <span className="text-2xl font-bold text-tinta-300">%</span>
            </div>
          )}
          <p className="mt-1 text-xs text-tinta-100 font-medium leading-relaxed">
            {hoy.registros ? `${hoy.presentes} presentes de ${hoy.registros} alumnos registrados` : 'Aparece apenas los docentes guarden sus listas.'}
          </p>
        </div>

        {porcentaje != null && (
          <div className="hidden sm:block shrink-0">
            <DonutAsistenciaHoy porcentaje={porcentaje} presentes={hoy.presentes} totalRegistros={hoy.registros} />
          </div>
        )}
      </div>

      {extra}
    </div>
  )
}


function TablaDatos({ titulo, datos }: { titulo: string; datos: any[] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer font-bold text-tinta-600">Ver datos</summary>
      <table className="mt-2 w-full" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <caption className="sr-only">{titulo}</caption>
        <thead><tr className="text-left text-grafito-500"><th className="py-1">Fecha</th><th>Asistencia</th><th>Registros</th></tr></thead>
        <tbody>{datos.map((d) => <tr key={d.fecha} className="border-t border-grafito-100"><td className="py-1">{fechaCorta(d.fecha)}</td><td>{d.porcentaje}%</td><td>{d.registros}</td></tr>)}</tbody>
      </table>
    </details>
  )
}

/* ============================== vista colegio =============================== */

function VistaColegio({ c, minimos }: { c: any; minimos: any }) {
  const navegar = useNavigate()
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 items-stretch gap-2 sm:gap-3 lg:grid-cols-4">
        <Hoy className="col-span-3 lg:col-span-1" hoy={c.hoy} extra={<p className="mt-3 border-t border-white/15 pt-3 text-sm text-tinta-200">
          {c.hoy.feriado ? 'Hoy es día no lectivo'
            : c.hoy.clases_programadas ? `${c.hoy.clases_programadas - (c.hoy.pendientes ?? []).length} de ${c.hoy.clases_programadas} clases de hoy con lista`
            : `${c.hoy.clases_registradas} clases con lista hoy`} · {c.hoy.docentes_con_permiso} docentes con permiso</p>} />
        <Cifra valor={c.totales.riesgo_alto} texto={`en riesgo alto, de ${c.totales.alumnos} alumnos`} icono={AlertOctagon} tono={c.totales.riesgo_alto ? 'rojo' : undefined} />
        <Cifra valor={c.totales.riesgo_medio} texto="en riesgo medio" icono={AlertTriangle} tono={c.totales.riesgo_medio ? 'ambar' : undefined} />
        {c.hoy.con_horario ? (
          <Cifra valor={c.docentes.reduce((t: number, d: any) => t + d.sin_lista_14, 0)}
            texto="clases sin lista en los últimos 14 días" icono={CalendarClock}
            tono={c.docentes.some((d: any) => d.sin_lista_14) ? 'ambar' : undefined} />
        ) : (
          <Cifra valor={c.docentes.filter((d: any) => !d.con_permiso && (d.dias_sin_lista == null || d.dias_sin_lista >= 3)).length}
            texto="docentes sin listas hace 3 días o más" icono={CalendarClock} tono="ambar" />
        )}
      </div>

      {(c.hoy.pendientes ?? []).length > 0 && (
        <Bloque titulo="Clases de hoy sin lista" detalle="Según los días de clase de cada materia. Se actualiza a medida que los docentes guardan.">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(c.hoy.pendientes ?? []).map((p: any) => (
              <li key={p.asignacion} className="rounded-xl border border-grafito-200 bg-white px-4 py-3">
                <p className="font-bold">{p.materia}</p>
                <p className="text-sm text-grafito-500">{p.seccion}</p>
                <p className="text-sm text-grafito-600">{p.docente}</p>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      <div className="grid gap-8 lg:grid-cols-5">
        <Bloque className="lg:col-span-3" titulo="Alertas tempranas"
          detalle="Alumnos con señales de abandono o bajo rendimiento, del más urgente al menos urgente.">
          <Alertas alertas={c.alertas} />
        </Bloque>

        <div className="space-y-8 lg:col-span-2">
          <Bloque titulo="Asistencia de los últimos 30 días" detalle="Porcentaje de presentes por día en todo el colegio.">
            <Tarjeta className="p-3">
              <LineaAsistencia datos={c.tendencia} minimo={minimos.asistencia} />
              <TablaDatos titulo="Asistencia diaria" datos={c.tendencia} />
            </Tarjeta>
          </Bloque>
          <Bloque titulo="Secciones" detalle="Asistencia del año, de la más baja a la más alta."
            accion={<Link to="/ausencias" className="shrink-0 text-sm font-bold text-tinta-600">Reporte de ausencias</Link>}>
            <Tarjeta className="p-2">
              <BarrasPorcentaje minimo={minimos.asistencia} onTocar={(id) => navegar(`/secciones/${id}`)}
                filas={c.secciones.map((s: any) => ({
                  id: s.id, nombre: s.nombre, valor: s.asistencia,
                  detalle: [s.logro != null && `logro ${s.logro}%`, (s.riesgo_alto + s.riesgo_medio) > 0 && `${s.riesgo_alto + s.riesgo_medio} en riesgo`, s.bajo_minimo > 0 && `${s.bajo_minimo} bajo mínimo`].filter(Boolean).join(' · '),
                }))} />
            </Tarjeta>
          </Bloque>
        </div>
      </div>

      <Bloque titulo="Seguimiento docente" detalle="Listas, desarrollo de clases y trabajos sin completar. Primero los que más tiempo llevan sin registrar.">
        <div className="overflow-x-auto rounded-xl border border-grafito-200 bg-white">
          <table className="w-full min-w-[760px] text-left" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="border-b border-grafito-200 bg-grafito-100/60 text-sm text-grafito-600">
              <tr>
                <th className="px-4 py-2.5 font-bold">Docente</th>
                <th className="px-3 py-2.5 font-bold">Última lista</th>
                <th className="px-3 py-2.5 text-right font-bold">Listas en 14 días</th>
                <th className="px-3 py-2.5 text-right font-bold">Clases sin lista (14 días)</th>
                <th className="px-3 py-2.5 text-right font-bold">Clases con desarrollo</th>
                <th className="px-4 py-2.5 text-right font-bold">Trabajos sin completar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grafito-100">
              {c.docentes.map((d: any) => {
                const atraso = d.dias_sin_lista == null || d.dias_sin_lista >= 3
                return (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-bold">{d.docente}{d.con_permiso && <span className="ml-2"><Etiqueta tono="azul">Con permiso</Etiqueta></span>}</td>
                    <td className="px-3 py-3">
                      {d.ultima_lista == null ? <span className="inline-flex items-center gap-1 font-bold text-ausente"><AlertOctagon className="size-4" /> Nunca</span>
                        : d.dias_sin_lista === 0 ? <span className="text-presente">Hoy</span>
                        : <span className={cn(atraso && !d.con_permiso && 'inline-flex items-center gap-1 font-bold text-tarde')}>
                            {atraso && !d.con_permiso && <AlertTriangle className="size-4" />}Hace {d.dias_sin_lista} {d.dias_sin_lista === 1 ? 'día' : 'días'}
                          </span>}
                    </td>
                    <td className="px-3 py-3 text-right">{d.listas_14_dias}</td>
                    <td className={cn('px-3 py-3 text-right', d.sin_lista_14 > 0 && 'font-bold text-tarde')}>
                      {d.con_horario ? (d.sin_lista_14 || '—') : <span className="text-sm font-normal text-grafito-500">Sin días cargados</span>}
                    </td>
                    <td className={cn('px-3 py-3 text-right', d.desarrollo_registrado != null && d.desarrollo_registrado < 50 && 'font-bold text-tarde')}>
                      {d.desarrollo_registrado == null ? '—' : `${d.desarrollo_registrado}%`}
                    </td>
                    <td className={cn('px-4 py-3 text-right', d.trabajos_incompletos > 0 && 'font-bold')}>{d.trabajos_incompletos || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-grafito-500">"Clases sin lista" cuenta los días que la materia tenía clase y no se guardó la lista (sin contar feriados ni permisos). "Clases con desarrollo" mide cuántas listas de los últimos 30 días tienen registrado lo que se desarrolló.</p>
      </Bloque>
    </div>
  )
}

/* ============================== vista profe guía ============================ */

function telWhatsApp(tel: string) {
  const d = tel.replace(/\D/g, '')
  return d.startsWith('595') ? d : `595${d.replace(/^0/, '')}`
}

function VistaGuia({ secciones, minimos }: { secciones: any[]; minimos: any }) {
  if (!secciones.length) return <Vacio titulo="No sos docente guía de ninguna sección" texto="Se asigna en Gestión › Secciones, campo Docente guía." />
  return (
    <div className="space-y-12">
      {secciones.map((s) => (
        <div key={s.seccion_id} className="space-y-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-grafito-500">Sección guiada</p>
              <h2 className="text-xl font-bold">{s.seccion}</h2>
            </div>
            <Link to={`/secciones/${s.seccion_id}`} className="shrink-0 font-bold text-tinta-600">Ver sección</Link>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Hoy hoy={s.hoy} />
            <Tarjeta className="p-4 lg:col-span-2">
              <div className="mb-2 flex items-center gap-2">
                <UserX className="size-5 text-ausente" />
                <h3 className="font-bold">Faltaron hoy</h3>
                <Etiqueta tono={s.ausentes_hoy.length ? 'rojo' : 'verde'}>{s.ausentes_hoy.length}</Etiqueta>
              </div>
              {!s.ausentes_hoy.length ? (
                <p className="text-grafito-500">{s.hoy.registros ? 'Nadie faltó a todas sus clases de hoy.' : 'Todavía no hay listas de hoy.'}</p>
              ) : (
                <ul className="divide-y divide-grafito-100">
                  {s.ausentes_hoy.map((a: any) => {
                    const msg = `Buenos días, le escribimos del Colegio San Roque González. ${a.alumno} no asistió hoy a clases. ¿Podría indicarnos el motivo? Gracias.`
                    return (
                      <li key={a.matricula} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link to={`/alumnos/${a.alumno_id}`} className="font-bold hover:underline">{a.alumno}</Link>
                          <p className="text-sm text-grafito-500">
                            {a.dias_seguidos >= 2 && <span className="font-bold text-ausente">{a.dias_seguidos} días seguidos · </span>}
                            {a.tutor ? `${a.tutor.parentesco}: ${a.tutor.nombre}` : 'Sin tutor cargado'}
                          </p>
                        </div>
                        {a.tutor?.telefono && (
                          <a href={`https://wa.me/${telWhatsApp(a.tutor.telefono)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-presente px-3 py-1.5 text-sm font-bold text-white">
                            <MessageCircle className="size-4" /> Avisar por WhatsApp
                          </a>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Tarjeta>
          </div>

          <div className="grid gap-8 lg:grid-cols-5">
            <Bloque className="lg:col-span-3" titulo="Alumnos a acompañar" detalle="Señales de riesgo en tu sección.">
              <Alertas alertas={s.alertas} mostrarSeccion={false} />
            </Bloque>
            <div className="space-y-8 lg:col-span-2">
              <Bloque titulo="Logro por materia" detalle="Promedio de los trabajos corregidos en cada materia.">
                <Tarjeta className="p-2">
                  <BarrasPorcentaje minimo={minimos.logro} etiquetaMinimo="Logro mínimo"
                    filas={s.materias.map((m: any) => ({ id: m.asignacion, nombre: m.materia, valor: m.logro,
                      detalle: `${m.docente}${m.asistencia != null ? ` · asistencia ${m.asistencia}%` : ''}` }))} />
                </Tarjeta>
              </Bloque>
              <Bloque titulo="Asistencia de la sección" detalle="Últimos 30 días.">
                <Tarjeta className="p-3"><LineaAsistencia datos={s.tendencia} minimo={minimos.asistencia} alto={170} /></Tarjeta>
              </Bloque>
            </div>
          </div>

          {s.anecdoticos.length > 0 && (
            <Bloque titulo="Registros anecdóticos recientes">
              <ul className="grid gap-3 md:grid-cols-2">
                {s.anecdoticos.map((r: any) => (
                  <li key={r.id}>
                    <Tarjeta className="h-full p-4">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                        <Etiqueta tono={r.tipo === 'NEGATIVO' ? 'rojo' : r.tipo === 'POSITIVO' ? 'verde' : 'gris'}>
                          {r.tipo === 'NEGATIVO' ? 'Negativo' : r.tipo === 'POSITIVO' ? 'Positivo' : 'Informativo'}
                        </Etiqueta>
                        <span className="font-bold text-grafito-500">{fechaCorta(r.fecha)} · {r.materia}</span>
                      </div>
                      <p className="font-bold">{r.alumnos.join(', ')}</p>
                      <p className="line-clamp-2 text-grafito-600">{r.hecho}</p>
                    </Tarjeta>
                  </li>
                ))}
              </ul>
            </Bloque>
          )}
        </div>
      ))}
    </div>
  )
}

/* ============================== vista docente =============================== */

function VistaDocente({ clases, minimos }: { clases: any[]; minimos: any }) {
  if (!clases.length) return <Vacio titulo="No tenés materias asignadas este año" />
  const deHoy = clases.filter((c) => c.clase_hoy || c.lista_hoy)
  const conLista = deHoy.filter((c) => c.lista_hoy).length
  const pendientes = clases.reduce((s, c) => s + c.sin_desarrollo + c.trabajos_incompletos.length, 0)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra valor={deHoy.length ? `${conLista}/${deHoy.length}` : '—'} texto={deHoy.length ? 'clases de hoy con lista' : 'hoy no tenés clases'} icono={ClipboardList} />
        <Cifra valor={pendientes} texto="pendientes de registro" icono={BookOpen} tono={pendientes ? 'ambar' : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {clases.map((c) => (
          <Tarjeta key={c.asignacion} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-tight">{c.materia}</h3>
                <p className="text-sm text-grafito-500">{c.seccion} · {c.alumnos} alumnos</p>
              </div>
              {c.lista_hoy ? <Etiqueta tono="verde">Lista de hoy</Etiqueta>
                : c.clase_hoy ? <Etiqueta tono="ambar">Sin lista hoy</Etiqueta>
                : <Etiqueta>{c.dias_clase?.length ? `Clase: ${diasTexto(c.dias_clase)}` : 'Sin clase hoy'}</Etiqueta>}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Medida titulo="Asistencia" valor={c.asistencia} minimo={minimos.asistencia} />
              <Medida titulo="Logro en trabajos" valor={c.logro} minimo={minimos.logro} />
            </dl>

            {(c.sin_desarrollo > 0 || c.trabajos_incompletos.length > 0) && (
              <div className="mt-3 rounded-lg bg-tarde-50 px-3 py-2 text-[15px] text-grafito">
                <p className="mb-0.5 flex items-center gap-1.5 font-bold text-tarde"><AlertTriangle className="size-4" /> Pendiente</p>
                {c.sin_desarrollo > 0 && <p>{c.sin_desarrollo} {c.sin_desarrollo === 1 ? 'clase' : 'clases'} sin desarrollo registrado (30 días)</p>}
                {c.trabajos_incompletos.map((t: any) => <p key={t.id}>{t.titulo}: {t.cargados} de {t.alumnos} puntajes</p>)}
              </div>
            )}

            {c.en_riesgo.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-sm font-bold text-grafito-600">Alumnos a atender en tu materia</p>
                <ul className="space-y-1 text-[15px]">
                  {c.en_riesgo.slice(0, 5).map((a: any) => (
                    <li key={a.matricula}><span className="font-bold">{a.alumno}</span> <span className="text-grafito-500">· {a.motivos.join(' · ')}</span></li>
                  ))}
                  {c.en_riesgo.length > 5 && <li className="text-grafito-500">y {c.en_riesgo.length - 5} más</li>}
                </ul>
              </div>
            )}

            <Link to={`/clases/${c.asignacion}`} className="mt-4 inline-flex items-center gap-1 self-start font-bold text-tinta-600">
              Ir a la clase <ChevronRight className="size-4" />
            </Link>
          </Tarjeta>
        ))}
      </div>
    </div>
  )
}

function Medida({ titulo, valor, minimo }: { titulo: string; valor: number | null; minimo: number }) {
  const bajo = valor != null && valor < minimo
  return (
    <div>
      <dt className="text-sm text-grafito-500">{titulo}</dt>
      <dd className={cn('text-2xl font-bold', bajo && 'text-ausente')}>
        {valor == null ? <span className="text-base font-normal text-grafito-500">Sin datos</span> : `${valor}%`}
      </dd>
      <div className="relative mt-1 h-1.5 rounded-full bg-grafito-100">
        {valor != null && <div className={cn('h-full rounded-full', bajo ? 'bg-ausente' : 'bg-tinta-500')} style={{ width: `${valor}%` }} />}
        <div className="absolute -inset-y-0.5 w-0.5 bg-grafito" style={{ left: `${minimo}%` }} />
      </div>
      {bajo && <p className="mt-0.5 text-xs font-bold text-ausente">Debajo de {minimo}%</p>}
    </div>
  )
}

/* ============================== página ===================================== */

export default function Tablero() {
  const { esGestion } = useAuth()
  const [fecha, setFecha] = useState(hoyISO())
  const { data, isLoading, error } = useQuery({
    queryKey: ['panel', fecha],
    queryFn: () => api(`/reportes/panel/?fecha=${fecha}`, { cache: true }),
    refetchInterval: 120_000,
  })

  const disponibles: { valor: Vista; label: string }[] = []
  if (data?.colegio) disponibles.push({ valor: 'colegio', label: 'Colegio' })
  if (data?.guia?.length) disponibles.push({ valor: 'guia', label: 'Mi sección' })
  if (data?.docente?.length) disponibles.push({ valor: 'docente', label: 'Mis clases' })

  const [elegida, setElegida] = useState<Vista | null>(() => {
    try { return localStorage.getItem('sr_vista_panel') as Vista | null } catch { return null }
  })
  const vista = disponibles.find((d) => d.valor === elegida)?.valor ?? disponibles[0]?.valor
  const elegir = (v: Vista) => {
    setElegida(v)
    try { localStorage.setItem('sr_vista_panel', v) } catch { /* sin almacenamiento */ }
  }

  return (
    <div>
      <Encabezado
        titulo={esGestion ? 'Panel de dirección' : 'Mi panel'}
        detalle={<span className="block first-letter:uppercase">{fechaLarga(fecha)}{data?.anio ? ` · año lectivo ${data.anio}` : ''}</span>}
        acciones={<Input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value || hoyISO())} className="w-auto" aria-label="Fecha del panel" />}
      />
      {isLoading && <Cargando texto="Calculando el panel…" />}
      <ErrorCaja error={error} />
      {data && !data.anio && <Vacio titulo="No hay un año lectivo activo" texto="Activá el año en Gestión › Años lectivos para ver el panel." />}

      {disponibles.length > 1 && (
        <div className="mb-6"><Segmentado valor={vista!} onChange={elegir} opciones={disponibles} /></div>
      )}

      {data && vista === 'colegio' && <VistaColegio c={data.colegio} minimos={data.minimos} />}
      {data && vista === 'guia' && <VistaGuia secciones={data.guia} minimos={data.minimos} />}
      {data && vista === 'docente' && <VistaDocente clases={data.docente} minimos={data.minimos} />}
    </div>
  )
}
