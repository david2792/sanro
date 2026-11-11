import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AccionesReporte, EncabezadoImpresion, Firmas } from '../../components/Reporte'
import { Campo, Cargando, Encabezado, ErrorCaja, Etiqueta, Input, Segmentado, Select, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { cn, descargarCSV, fechaCorta, guaranies, hoyISO, miles } from '../../lib/utils'
import { AportesNav } from './comun'

type Tipo = 'recaudacion' | 'morosos' | 'secciones'
const FIRMAS = ['Tesorero/a ACES', 'Presidente/a ACES', 'Director/a']

function telWhatsApp(tel: string) {
  const d = tel.replace(/\D/g, '')
  return d.startsWith('595') ? d : `595${d.replace(/^0/, '')}`
}

/** Tabla con el estilo de las demás; en papel se imprime completa. */
function Tabla({ cabecera, children, pie, minimo = 640 }: { cabecera: ReactNode; children: ReactNode; pie?: ReactNode; minimo?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-grafito-200 bg-white print:overflow-visible print:border-0">
      <table className="w-full text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums', minWidth: minimo }}>
        <thead className="border-b border-grafito-200 bg-grafito-100/60 text-grafito-600 [&_th]:px-3 [&_th]:py-2.5">{cabecera}</thead>
        <tbody className="divide-y divide-grafito-100 [&_td]:px-3 [&_td]:py-2">{children}</tbody>
        {pie && <tfoot className="border-t-2 border-grafito-300 font-bold [&_td]:px-3 [&_td]:py-2.5">{pie}</tfoot>}
      </table>
    </div>
  )
}

function useSecciones() {
  return useQuery({ queryKey: ['aportes-secciones'], queryFn: () => api('/aportes/secciones/') })
}

function FiltroSeccion({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const { data } = useSecciones()
  return (
    <Campo label="Sección">
      <Select value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todas</option>
        {data?.secciones.map((s: any) => <option key={s.id} value={s.id}>{s.seccion}</option>)}
      </Select>
    </Campo>
  )
}

export default function ReportesAportes() {
  const [tipo, setTipo] = useState<Tipo>('recaudacion')
  return (
    <div>
      <div className="no-imprimir">
        <Encabezado titulo="Reportes de aportes" detalle="Para rendir cuentas en asamblea, controlar la caja y hacer seguimiento de la deuda." />
        <AportesNav />
        <div className="mb-5">
          <Segmentado valor={tipo} onChange={setTipo} opciones={[
            { valor: 'recaudacion', label: 'Recaudación' }, { valor: 'morosos', label: 'Saldos pendientes' }, { valor: 'secciones', label: 'Por sección' },
          ]} />
        </div>
      </div>
      {tipo === 'recaudacion' && <Recaudacion />}
      {tipo === 'morosos' && <Morosos />}
      {tipo === 'secciones' && <PorSeccion />}
    </div>
  )
}

/* ------------------------------ Recaudación ------------------------------ */

function Recaudacion() {
  const hoy = hoyISO()
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01')
  const [hasta, setHasta] = useState(hoy)
  const [seccion, setSeccion] = useState('')
  const q = `desde=${desde}&hasta=${hasta}${seccion ? `&seccion=${seccion}` : ''}`
  const { data, isLoading, error } = useQuery({ queryKey: ['aportes-reporte', 'recaudacion', q], queryFn: () => api(`/aportes/reportes/recaudacion/?${q}`) })

  const csv = () => descargarCSV(`recaudacion-${desde}-al-${hasta}`, [
    ['Recibo', 'Fecha', 'Alumno', 'C.I.', 'Sección', 'Detalle', 'Medio', 'Referencia', 'Monto (Gs.)', 'Estado', 'Registró'],
    ...data.recibos.map((r: any) => [r.numero, fechaCorta(r.fecha), r.alumno, r.ci, r.seccion, r.detalle, r.medio, r.referencia, r.total,
      r.anulado ? `ANULADO: ${r.motivo_anulacion}` : 'Válido', r.registrado_por]),
    [],
    ['', '', '', '', '', '', '', 'Total válido', data.total],
  ])

  return (
    <div>
      <div className="no-imprimir mb-5 flex flex-wrap items-end gap-3">
        <Campo label="Desde"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
        <Campo label="Hasta"><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>
        <div className="min-w-48"><FiltroSeccion valor={seccion} onChange={setSeccion} /></div>
        <div className="ml-auto">{data && <AccionesReporte onCSV={csv} />}</div>
      </div>
      {isLoading && <Cargando />}
      <ErrorCaja error={error} />
      {data && (
        <>
          <EncabezadoImpresion institucion={data.institucion} titulo="ACES — Rendición de recaudación"
            detalle={`Del ${fechaCorta(data.desde)} al ${fechaCorta(data.hasta)} · año lectivo ${data.anio}`} generado={data.generado} />
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Resumen titulo="Total recaudado" valor={guaranies(data.total)} detalle={`${data.cantidad} recibos válidos`} />
            <Resumen titulo="Por medio de pago" lineas={data.por_medio.map((m: any) => [m.medio, guaranies(m.monto)])} />
            <Resumen titulo="Por concepto" lineas={data.por_concepto.map((c: any) => [c.concepto, guaranies(c.monto)])} />
          </div>
          {data.anulados.cantidad > 0 && (
            <p className="mb-3 text-sm text-grafito-600">{data.anulados.cantidad} recibo(s) anulado(s) por {guaranies(data.anulados.monto)}: figuran en la lista pero no suman al total.</p>
          )}
          {!data.recibos.length ? <Vacio titulo="No hay recibos en este período" /> : (
            <Tabla minimo={760} cabecera={<tr><th>Recibo</th><th>Fecha</th><th>Alumno</th><th>Sección</th><th>Detalle</th><th>Medio</th><th className="text-right">Monto (Gs.)</th></tr>}
              pie={<tr><td colSpan={6}>Total recaudado (sin anulados)</td><td className="text-right">{miles(data.total)}</td></tr>}>
              {data.recibos.map((r: any) => (
                <tr key={r.id} className={cn(r.anulado && 'text-grafito-500')}>
                  <td className="font-bold">{String(r.numero).padStart(5, '0')}</td>
                  <td>{fechaCorta(r.fecha)}</td>
                  <td>{r.alumno}<span className="block text-xs text-grafito-500">C.I. {r.ci}</span></td>
                  <td>{r.seccion}</td>
                  <td>{r.detalle}{r.anulado && <span className="block text-xs font-bold text-ausente">ANULADO: {r.motivo_anulacion}</span>}</td>
                  <td>{r.medio}{r.referencia && <span className="block text-xs text-grafito-500">{r.referencia}</span>}</td>
                  <td className={cn('text-right', r.anulado && 'line-through')}>{miles(r.total)}</td>
                </tr>
              ))}
            </Tabla>
          )}
          <Firmas cargos={FIRMAS} />
        </>
      )}
    </div>
  )
}

function Resumen({ titulo, valor, detalle, lineas }: { titulo: string; valor?: string; detalle?: string; lineas?: string[][] }) {
  return (
    <div className="rounded-xl border border-grafito-200 bg-white p-4">
      <p className="text-sm font-bold text-grafito-500">{titulo}</p>
      {valor && <p className="mt-1 text-2xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>{valor}</p>}
      {detalle && <p className="text-sm text-grafito-500">{detalle}</p>}
      {lineas && (
        <dl className="mt-1 space-y-0.5 text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {!lineas.length && <dd className="text-grafito-500">—</dd>}
          {lineas.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt>{k}</dt><dd className="font-bold">{v}</dd></div>)}
        </dl>
      )}
    </div>
  )
}

/* -------------------------------- Deudores ------------------------------- */

function Morosos() {
  const [seccion, setSeccion] = useState('')
  const [incluir, setIncluir] = useState<'saldo' | 'deuda'>('saldo')
  const q = new URLSearchParams({ incluir, ...(seccion && { seccion }) }).toString()
  const { data, isLoading, error } = useQuery({
    queryKey: ['aportes-reporte', 'morosos', q],
    queryFn: () => api(`/aportes/reportes/morosos/?${q}`),
  })
  const csv = () => descargarCSV(`deudores-aces-${hoyISO()}`, [
    ['Sección', 'N°', 'Alumno', 'C.I.', 'Pendiente', 'Pagado (Gs.)', 'Saldo (Gs.)', 'Vencido (Gs.)', 'Tutor', 'Teléfono'],
    ...data.alumnos.map((a: any) => [a.seccion, a.numero_lista ?? '', a.alumno, a.ci, a.detalle, a.pagado, a.saldo, a.deuda, a.tutor?.nombre ?? '', a.tutor?.telefono ?? '']),
    [], ['', '', '', '', 'Total', data.alumnos.reduce((s: number, a: any) => s + a.pagado, 0), data.total_saldo, data.total_deuda],
  ])

  return (
    <div>
      <div className="no-imprimir mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-48"><FiltroSeccion valor={seccion} onChange={setSeccion} /></div>
        <Segmentado valor={incluir} onChange={setIncluir} opciones={[
          { valor: 'saldo', label: 'Todo el saldo' }, { valor: 'deuda', label: 'Solo lo vencido' },
        ]} />
        <div className="ml-auto">{data && <AccionesReporte onCSV={csv} />}</div>
      </div>
      {isLoading && <Cargando />}
      <ErrorCaja error={error} />
      {data && (
        <>
          <EncabezadoImpresion institucion={data.institucion}
            titulo={data.incluir === 'saldo' ? 'ACES — Alumnos con saldo pendiente' : 'ACES — Alumnos con pagos vencidos'}
            detalle={`Situación al ${fechaCorta(data.fecha)} · año lectivo ${data.anio}`} generado={data.generado} />
          <p className="mb-3 text-grafito-600">
            <span className="font-bold">{data.alumnos.length}</span> alumnos con saldo de <span className="font-bold">{guaranies(data.total_saldo)}</span>
            {data.total_deuda > 0 && <>, de los cuales <span className="font-bold text-ausente">{guaranies(data.total_deuda)}</span> ya vencieron</>}.
          </p>
          {!data.alumnos.length ? <Vacio titulo={data.incluir === 'saldo' ? 'Todos completaron sus pagos' : 'Nadie tiene pagos vencidos'} /> : (
            <Tabla minimo={860} cabecera={<tr><th>Alumno</th><th>Sección</th><th>Pendiente</th><th className="text-right">Pagado</th><th className="text-right">Saldo (Gs.)</th><th className="text-right">Vencido</th><th>Tutor</th></tr>}
              pie={<tr><td colSpan={3}>Totales</td><td className="text-right">{miles(data.alumnos.reduce((s: number, a: any) => s + a.pagado, 0))}</td><td className="text-right">{miles(data.total_saldo)}</td><td className="text-right text-ausente">{miles(data.total_deuda)}</td><td /></tr>}>
              {data.alumnos.map((a: any) => {
                const msg = `Buenos días. Le escribimos de la ACES del colegio. Le recordamos que ${a.alumno} tiene un saldo pendiente de ${guaranies(a.saldo)} (${a.detalle}). Muchas gracias por su colaboración.`
                return (
                  <tr key={a.matricula}>
                    <td className="font-bold">{a.alumno}<span className="block text-xs font-normal text-grafito-500">C.I. {a.ci}</span></td>
                    <td>{a.seccion}</td>
                    <td>{a.detalle}</td>
                    <td className="text-right">{miles(a.pagado)}</td>
                    <td className="text-right font-bold">{miles(a.saldo)}</td>
                    <td className={cn('text-right', a.deuda > 0 && 'font-bold text-ausente')}>{a.deuda ? miles(a.deuda) : '—'}</td>
                    <td>
                      {a.tutor ? <>{a.tutor.nombre}<span className="block text-xs text-grafito-500">{a.tutor.telefono}</span></> : <span className="text-grafito-500">Sin tutor cargado</span>}
                      {a.tutor?.telefono && (
                        <a href={`https://wa.me/${telWhatsApp(a.tutor.telefono)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                          className="no-imprimir mt-1 inline-flex items-center gap-1 text-xs font-bold text-presente">
                          <MessageCircle className="size-3.5" /> Recordar por WhatsApp
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Tabla>
          )}
          <Firmas cargos={FIRMAS.slice(0, 2)} />
        </>
      )}
    </div>
  )
}

/* ------------------------------ Por sección ------------------------------ */

function PorSeccion() {
  const { data, isLoading, error } = useSecciones()
  if (isLoading) return <Cargando />
  if (error) return <ErrorCaja error={error} />
  const filas = data.secciones.filter((s: any) => s.alumnos)
  const suma = (k: string) => filas.reduce((a: number, s: any) => a + s[k], 0)
  const cobrado = suma('pagado')
  const saldo = suma('saldo')
  const deuda = suma('deuda')
  const csv = () => descargarCSV(`aportes-por-seccion-${hoyISO()}`, [
    ['Sección', 'Alumnos', 'Pagaron todo', 'Pagaron una parte', 'Sin pagos', 'Exonerados', 'Cobrado (Gs.)', 'Saldo (Gs.)', 'Vencido sin pagar (Gs.)', '% cobrado'],
    ...filas.map((s: any) => [s.seccion, s.alumnos, s.completos, s.parciales, s.sin_pagos, s.exonerados, s.pagado, s.saldo, s.deuda, s.porcentaje_pagado ?? '']),
  ])
  return (
    <div>
      <div className="no-imprimir mb-5 flex justify-end"><AccionesReporte onCSV={csv} /></div>
      <EncabezadoImpresion institucion={data.institucion} titulo="ACES — Estado de aportes por sección" detalle={`Año lectivo ${data.anio}`} generado={data.generado} />
      {!filas.length ? <Vacio titulo="No hay alumnos matriculados" /> : (
        <Tabla minimo={760}
          cabecera={<tr><th>Sección</th><th className="text-right">Alumnos</th><th className="text-right">Pagaron todo</th><th className="text-right">Una parte</th><th className="text-right">Sin pagos</th><th className="text-right">Exon.</th><th className="text-right">Cobrado (Gs.)</th><th className="text-right">Saldo (Gs.)</th><th className="text-right">Vencido (Gs.)</th><th className="text-right">% cobrado</th></tr>}
          pie={<tr><td>Total</td><td className="text-right">{miles(suma('alumnos'))}</td><td className="text-right">{miles(suma('completos'))}</td><td className="text-right">{miles(suma('parciales'))}</td><td className="text-right">{miles(suma('sin_pagos'))}</td><td className="text-right">{miles(suma('exonerados'))}</td><td className="text-right">{miles(cobrado)}</td><td className="text-right">{miles(saldo)}</td><td className="text-right">{miles(deuda)}</td><td className="text-right">{cobrado + saldo ? `${Math.round((cobrado * 1000) / (cobrado + saldo)) / 10}%` : '—'}</td></tr>}>
          {filas.map((s: any) => (
            <tr key={s.id}>
              <td className="font-bold">{s.seccion}</td>
              <td className="text-right">{s.alumnos}</td>
              <td className="text-right">{s.completos}</td>
              <td className="text-right">{s.parciales}</td>
              <td className="text-right">{s.sin_pagos}</td>
              <td className="text-right">{s.exonerados}</td>
              <td className="text-right">{miles(s.pagado)}</td>
              <td className="text-right">{miles(s.saldo)}</td>
              <td className={cn('text-right', s.deuda > 0 && 'font-bold text-ausente')}>{miles(s.deuda)}</td>
              <td className="text-right">{s.porcentaje_pagado == null ? '—' : <Etiqueta tono={s.porcentaje_pagado >= 80 ? 'verde' : s.porcentaje_pagado >= 40 ? 'ambar' : 'rojo'}>{s.porcentaje_pagado}%</Etiqueta>}</td>
            </tr>
          ))}
        </Tabla>
      )}
      <Firmas cargos={FIRMAS.slice(0, 2)} />
    </div>
  )
}
