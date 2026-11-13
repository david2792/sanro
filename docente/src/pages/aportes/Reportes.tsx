// Rendición de lo recaudado en un período. Solo quienes aportaron: nunca listas de quienes no.
import { useQuery } from '@tanstack/react-query'
import { Download, Printer } from 'lucide-react'
import { useState } from 'react'
import { Boton, Campo, Cargando, Encabezado, ErrorCaja, Input, Tarjeta } from '../../components/ui'
import { api } from '../../lib/api'
import { descargarCSV, fechaCorta, guaranies } from '../../lib/utils'
import { AportesNav, ESTADO_RECIBO } from './comun'

export default function ReportesAportes() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const rep = useQuery({
    queryKey: ['aportes-rendicion', desde, hasta],
    queryFn: () => api(`/aportes/reportes/recaudacion/?desde=${desde}&hasta=${hasta}`),
  })
  const d = rep.data

  const csv = () => descargarCSV(`rendicion-aportes-${d.desde}-${d.hasta}.csv`, [
    ['Fecha', 'Recibo', 'Aportante', 'Conceptos', 'Medio', 'Monto', 'Estado', 'Motivo'],
    ...d.recibos.map((r: any) => [r.fecha, `${r.serie}-${r.numero}`, r.aportante, r.conceptos, r.medio,
      r.estado === 'EMITIDO' ? r.total : 0, ESTADO_RECIBO[r.estado]?.texto, r.motivo_anulacion]),
    ['', '', '', '', 'Total', d.total, '', ''],
  ])

  return (
    <div>
      <Encabezado titulo="Rendición de aportes" detalle="Recibos del período con totales por concepto y medio." />
      <AportesNav />
      <div className="no-imprimir mb-4 flex flex-wrap items-end gap-3">
        <Campo label="Desde"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
        <Campo label="Hasta"><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>
        {d && <Boton variante="secundario" onClick={csv}><Download className="size-4" /> Planilla (CSV)</Boton>}
        {d && <Boton variante="secundario" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Boton>}
      </div>
      {rep.isLoading && <Cargando />}
      <ErrorCaja error={rep.error} />
      {d && (
        <div className="space-y-4">
          <Tarjeta>
            <p className="font-bold">{d.ace}{d.ruc && ` · RUC ${d.ruc}`}</p>
            <p className="text-sm text-grafito-500">Del {fechaCorta(d.desde)} al {fechaCorta(d.hasta)}</p>
            <p className="mt-2 text-2xl font-extrabold">{guaranies(d.total)}</p>
            <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
              <ul>{d.por_concepto.map((c: any) => <li key={c.concepto__nombre} className="flex justify-between"><span>{c.concepto__nombre}</span><strong>{guaranies(c.total)}</strong></li>)}</ul>
              <ul>{d.por_medio.map((m: any) => <li key={m.medio} className="flex justify-between"><span>{m.medio}</span><strong>{guaranies(m.total)}</strong></li>)}</ul>
            </div>
          </Tarjeta>
          <Tarjeta className="overflow-x-auto p-0">
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr className="border-b border-grafito-200 text-left text-grafito-500">
                <th className="px-3 py-2">Fecha</th><th>Recibo</th><th>Aportante</th><th>Conceptos</th><th>Medio</th><th className="px-3 text-right">Monto</th>
              </tr></thead>
              <tbody>
                {d.recibos.map((r: any) => (
                  <tr key={r.id} className={r.estado === 'EMITIDO' ? 'border-b border-grafito-100' : 'border-b border-grafito-100 text-grafito-400 line-through'}>
                    <td className="px-3 py-1.5">{fechaCorta(r.fecha)}</td><td>{r.serie}-{r.numero}</td><td>{r.aportante}</td>
                    <td>{r.conceptos}</td><td>{r.medio}</td><td className="px-3 text-right">{guaranies(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        </div>
      )}
    </div>
  )
}
