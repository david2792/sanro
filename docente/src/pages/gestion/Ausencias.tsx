import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Apiladas, COLORES, Columnas } from '../../components/GraficosReporte'
import { AccionesReporte, Dato, EncabezadoImpresion } from '../../components/Reporte'
import { Campo, Cargando, Encabezado, ErrorCaja, Input, Segmentado, Tarjeta, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { cn, descargarCSV, fechaCorta, MES_CORTO, miles } from '../../lib/utils'

/** Orden validado para daltonismo: ausente y tarde nunca quedan juntos. */
const SERIES = [
  { nombre: 'Ausente', color: COLORES.ausente },
  { nombre: 'Justificada', color: COLORES.justificado },
  { nombre: 'Tardanza', color: COLORES.tarde },
]

const pct = (n: number | null) => (n == null ? '—' : `${n}%`)

function Bloque({ titulo, detalle, children, className }: { titulo: string; detalle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 break-inside-avoid', className)}>
      <h2 className="text-lg font-bold leading-tight">{titulo}</h2>
      {detalle && <p className="mb-3 text-sm text-grafito-500">{detalle}</p>}
      {children}
    </section>
  )
}

export default function Ausencias() {
  const navegar = useNavigate()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [nivel, setNivel] = useState<'secciones' | 'cursos'>('secciones')
  const q = new URLSearchParams({ ...(desde && { desde }), ...(hasta && { hasta }) }).toString()
  const { data, isLoading, error } = useQuery({ queryKey: ['ausencias', q], queryFn: () => api(`/reportes/ausencias/${q ? `?${q}` : ''}`) })

  const filas = data ? (nivel === 'secciones' ? data.secciones : data.cursos) : []
  const nombre = (f: any) => (nivel === 'secciones' ? f.seccion : f.curso)
  const tope = Math.max(10, ...filas.map((f: any) => f.pct_ausentes + f.pct_justificadas + f.pct_tardanzas))

  const csv = () => descargarCSV(`ausencias-${nivel}-${data.desde}-al-${data.hasta}`, [
    [nivel === 'secciones' ? 'Sección' : 'Curso', 'Alumnos', 'Registros', 'Ausentes', 'Justificadas', 'Tardanzas', 'Inasistencia %', 'Sin justificar %'],
    ...filas.map((f: any) => [nombre(f), f.alumnos, f.registros, f.ausentes, f.justificadas, f.tardanzas, f.inasistencia ?? '', f.sin_justificar ?? '']),
  ])

  return (
    <div>
      <div className="no-imprimir">
        <Encabezado titulo="Ausencias por curso y sección"
          detalle="Dónde se falta más. Inasistencia = ausencias (justificadas o no) sobre el total de registros de asistencia."
          acciones={data && <AccionesReporte onCSV={csv} />} />
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <Campo label="Desde"><Input type="date" value={desde || data?.desde || ''} onChange={(e) => setDesde(e.target.value)} /></Campo>
          <Campo label="Hasta"><Input type="date" value={hasta || data?.hasta || ''} onChange={(e) => setHasta(e.target.value)} /></Campo>
          <Segmentado valor={nivel} onChange={setNivel} opciones={[{ valor: 'secciones', label: 'Por sección' }, { valor: 'cursos', label: 'Por curso' }]} />
        </div>
      </div>
      {isLoading && <Cargando texto="Calculando ausencias…" />}
      <ErrorCaja error={error} />
      {data && (
        <>
          <EncabezadoImpresion institucion={data.institucion} titulo={`Reporte de ausencias ${nivel === 'secciones' ? 'por sección' : 'por curso'}`}
            detalle={`Del ${fechaCorta(data.desde)} al ${fechaCorta(data.hasta)} · año lectivo ${data.anio}`} />
          {!data.totales.registros ? (
            <Vacio titulo="No hay listas en este período" texto="Elegí otras fechas o esperá a que los docentes llamen lista." />
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Dato texto="Inasistencia general" valor={pct(data.totales.inasistencia)}
                  tono={data.totales.inasistencia > 100 - data.minimo_asistencia ? 'rojo' : undefined}
                  detalle={`${miles(data.totales.registros)} registros`} />
                <Dato texto="Ausencias sin justificar" valor={miles(data.totales.ausentes)} tono="rojo" detalle={pct(data.totales.sin_justificar)} />
                <Dato texto="Justificadas" valor={miles(data.totales.justificadas)} detalle={pct(data.totales.pct_justificadas)} />
                <Dato texto={nivel === 'secciones' ? 'Sección con más ausencia' : 'Curso con más ausencia'}
                  valor={filas[0] ? pct(filas[0].inasistencia) : '—'} tono="ambar" detalle={filas[0] ? nombre(filas[0]) : ''} />
              </div>

              <Bloque titulo={nivel === 'secciones' ? 'Ranking de secciones' : 'Ranking de cursos'}
                detalle="De mayor a menor inasistencia. La barra muestra qué parte de los registros fueron ausencias, justificadas y tardanzas.">
                <Tarjeta className="p-2">
                  <Apiladas series={SERIES} maximo={tope}
                    onTocar={nivel === 'secciones' ? (id) => navegar(`/secciones/${id}`) : undefined}
                    filas={filas.map((f: any) => ({
                      id: f.id, nombre: nombre(f), valores: [f.pct_ausentes, f.pct_justificadas, f.pct_tardanzas],
                      derecha: pct(f.inasistencia),
                      detalle: `${miles(f.ausentes)} ausencias · ${miles(f.justificadas)} justificadas · ${miles(f.tardanzas)} tardanzas · ${f.alumnos} alumnos${f.alumnos_con_ausencias != null ? ` (${f.alumnos_con_ausencias} faltaron alguna vez)` : ''}`,
                    }))} />
                </Tarjeta>
              </Bloque>

              <div className="grid gap-8 lg:grid-cols-2">
                <Bloque titulo="Inasistencia por mes">
                  <Tarjeta className="p-3">
                    <Columnas titulo="Inasistencia por mes" color={COLORES.ausente} formato={(n) => `${n}%`} formatoEje={(n) => `${n}%`}
                      datos={data.meses.map((m: any) => ({ clave: m.mes, etiqueta: MES_CORTO[Number(m.mes.slice(5))], valor: m.inasistencia,
                        detalle: `${miles(m.ausentes + m.justificadas)} ausencias de ${miles(m.registros)} registros` }))} />
                  </Tarjeta>
                </Bloque>
                <Bloque titulo="Inasistencia por día de la semana">
                  <Tarjeta className="p-3">
                    <Columnas titulo="Inasistencia por día de la semana" color={COLORES.ausente} formato={(n) => `${n}%`} formatoEje={(n) => `${n}%`}
                      datos={data.dias.map((d: any) => ({ clave: d.dia, etiqueta: d.dia.slice(0, 3), valor: d.inasistencia,
                        detalle: `${miles(d.ausentes + d.justificadas)} ausencias de ${miles(d.registros)} registros` }))} />
                  </Tarjeta>
                </Bloque>
              </div>

              <Bloque titulo={nivel === 'secciones' ? 'Detalle por sección' : 'Detalle por curso'}>
                <TablaDetalle filas={filas} nombre={nombre} titulo={nivel === 'secciones' ? 'Sección' : 'Curso'} />
              </Bloque>

              <div className="grid gap-8 lg:grid-cols-2">
                <Bloque titulo="Materias con más inasistencia">
                  <div className="overflow-hidden rounded-xl border border-grafito-200 bg-white">
                    <table className="w-full text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <thead className="border-b border-grafito-200 bg-grafito-100/60 text-grafito-600">
                        <tr><th className="px-4 py-2.5">Materia</th><th className="px-3 py-2.5 text-right">Ausencias</th><th className="px-4 py-2.5 text-right">Inasistencia</th></tr>
                      </thead>
                      <tbody className="divide-y divide-grafito-100">
                        {data.materias.slice(0, 10).map((m: any) => (
                          <tr key={m.materia}><td className="px-4 py-2">{m.materia}</td><td className="px-3 py-2 text-right">{miles(m.ausentes + m.justificadas)}</td><td className="px-4 py-2 text-right font-bold">{pct(m.inasistencia)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Bloque>
                <Bloque titulo="Alumnos con más ausencias sin justificar">
                  <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
                    {data.alumnos.slice(0, 15).map((a: any) => (
                      <li key={a.matricula}>
                        <Link to={`/alumnos/${a.alumno_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-tinta-50/60">
                          <div className="min-w-0 flex-1"><p className="truncate font-bold">{a.alumno}</p><p className="text-sm text-grafito-500">{a.seccion}</p></div>
                          <div className="text-right text-sm"><p className="font-bold text-ausente">{a.ausentes} ausencias</p><p className="text-grafito-500">inasistencia {pct(a.inasistencia)}</p></div>
                        </Link>
                      </li>
                    ))}
                    {!data.alumnos.length && <li className="px-4 py-3 text-grafito-500">Ningún alumno con ausencias sin justificar.</li>}
                  </ul>
                </Bloque>
              </div>

              <Bloque titulo="Llegadas tardías" detalle="Las más recientes con la hora en que llegó el alumno y cuántos minutos después del inicio de la clase.">
                {!data.llegadas_tarde.length ? (
                  <Vacio titulo="Sin llegadas tardías con hora registrada" texto="Aparecen cuando el docente marca a un alumno como «tarde» al llamar lista." />
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-grafito-200 bg-white print:overflow-visible">
                    <table className="w-full min-w-[640px] text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <thead className="border-b border-grafito-200 bg-grafito-100/60 text-grafito-600">
                        <tr>
                          <th className="px-4 py-2.5">Fecha</th><th className="px-3 py-2.5">Alumno</th><th className="px-3 py-2.5">Materia</th>
                          <th className="px-3 py-2.5 text-right">Inicio</th><th className="px-3 py-2.5 text-right">Llegó</th><th className="px-4 py-2.5 text-right">Atraso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-grafito-100">
                        {data.llegadas_tarde.map((t: any, i: number) => (
                          <tr key={i}>
                            <td className="px-4 py-2">{fechaCorta(t.fecha)}</td>
                            <td className="px-3 py-2"><Link to={`/alumnos/${t.alumno_id}`} className="font-bold hover:underline">{t.alumno}</Link><span className="block text-xs text-grafito-500">{t.seccion}</span></td>
                            <td className="px-3 py-2">{t.materia}</td>
                            <td className="px-3 py-2 text-right">{t.hora_inicio?.slice(0, 5) ?? '—'}</td>
                            <td className="px-3 py-2 text-right font-bold text-tarde">{t.hora_llegada.slice(0, 5)}</td>
                            <td className="px-4 py-2 text-right">{t.minutos_tarde == null ? '—' : `${t.minutos_tarde} min`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Bloque>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TablaDetalle({ filas, nombre, titulo }: { filas: any[]; nombre: (f: any) => string; titulo: string }) {
  const t = filas.reduce((s, f) => ({ registros: s.registros + f.registros, ausentes: s.ausentes + f.ausentes, justificadas: s.justificadas + f.justificadas, tardanzas: s.tardanzas + f.tardanzas, alumnos: s.alumnos + f.alumnos }),
    { registros: 0, ausentes: 0, justificadas: 0, tardanzas: 0, alumnos: 0 })
  const total = t.registros ? Math.round(((t.ausentes + t.justificadas) * 1000) / t.registros) / 10 : null
  return (
    <div className="overflow-x-auto rounded-xl border border-grafito-200 bg-white print:overflow-visible">
      <table className="w-full min-w-[680px] text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead className="border-b border-grafito-200 bg-grafito-100/60 text-grafito-600">
          <tr>
            <th className="px-4 py-2.5">{titulo}</th><th className="px-3 py-2.5 text-right">Alumnos</th><th className="px-3 py-2.5 text-right">Registros</th>
            <th className="px-3 py-2.5 text-right">Ausentes</th><th className="px-3 py-2.5 text-right">Justificadas</th><th className="px-3 py-2.5 text-right">Tardanzas</th>
            <th className="px-4 py-2.5 text-right">Inasistencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-grafito-100">
          {filas.map((f) => (
            <tr key={f.id}>
              <td className="px-4 py-2 font-bold">{nombre(f)}</td><td className="px-3 py-2 text-right">{miles(f.alumnos)}</td><td className="px-3 py-2 text-right">{miles(f.registros)}</td>
              <td className="px-3 py-2 text-right">{miles(f.ausentes)}</td><td className="px-3 py-2 text-right">{miles(f.justificadas)}</td><td className="px-3 py-2 text-right">{miles(f.tardanzas)}</td>
              <td className="px-4 py-2 text-right font-bold">{pct(f.inasistencia)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-grafito-300 font-bold">
          <tr>
            <td className="px-4 py-2.5">Total</td><td className="px-3 py-2.5 text-right">{miles(t.alumnos)}</td><td className="px-3 py-2.5 text-right">{miles(t.registros)}</td>
            <td className="px-3 py-2.5 text-right">{miles(t.ausentes)}</td><td className="px-3 py-2.5 text-right">{miles(t.justificadas)}</td><td className="px-3 py-2.5 text-right">{miles(t.tardanzas)}</td>
            <td className="px-4 py-2.5 text-right">{pct(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
