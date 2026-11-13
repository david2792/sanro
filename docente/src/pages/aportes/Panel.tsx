// Panel de aportes: solo totales. Nunca listas de familias que no aportaron (plan maestro 2.5).
import { useQuery } from '@tanstack/react-query'
import { Cargando, Encabezado, ErrorCaja, Tarjeta, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { guaranies, nombreMes } from '../../lib/utils'
import { AportesNav } from './comun'

function Barras({ titulo, filas }: { titulo: string; filas: { etiqueta: string; total: number }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.total))
  return (
    <Tarjeta>
      <h2 className="mb-3 font-bold">{titulo}</h2>
      {!filas.length ? <p className="text-sm text-grafito-500">Sin datos.</p> : (
        <ul className="space-y-2">
          {filas.map((f) => (
            <li key={f.etiqueta}>
              <div className="flex justify-between gap-3 text-sm"><span>{f.etiqueta}</span><strong>{guaranies(f.total)}</strong></div>
              <div className="mt-1 h-2 rounded-full bg-grafito-100">
                <div className="h-2 rounded-full bg-tinta-600" style={{ width: `${(f.total * 100) / max}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}

export default function PanelAportes() {
  const panel = useQuery({ queryKey: ['aportes-panel'], queryFn: () => api('/aportes/panel/') })
  const d = panel.data
  return (
    <div>
      <Encabezado titulo="Aportes voluntarios" detalle={d ? `${d.ace} · ejercicio ${d.ejercicio}` : 'Asociación de Cooperación Escolar'} />
      <AportesNav />
      {panel.isLoading && <Cargando />}
      <ErrorCaja error={panel.error} />
      {d && (d.recibos === 0 ? <Vacio titulo="Todavía no hay aportes en este ejercicio" /> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tarjeta><p className="text-sm text-grafito-500">Recaudado</p><p className="text-2xl font-extrabold">{guaranies(d.total)}</p></Tarjeta>
            <Tarjeta><p className="text-sm text-grafito-500">Recibos emitidos</p><p className="text-2xl font-extrabold">{d.recibos}</p></Tarjeta>
            <Tarjeta><p className="text-sm text-grafito-500">Anulados o revertidos</p>
              <p className="text-2xl font-extrabold">{d.anulados_o_revertidos.recibos}</p>
              <p className="text-xs text-grafito-500">{guaranies(d.anulados_o_revertidos.monto)} (no suman)</p></Tarjeta>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Barras titulo="Por concepto" filas={d.por_concepto.map((f: any) => ({ etiqueta: f.concepto, total: f.total }))} />
            <Barras titulo="Por mes" filas={d.por_mes.map((f: any) => ({ etiqueta: nombreMes(f.mes), total: f.total }))} />
            <Barras titulo="Por tipo" filas={d.por_tipo.map((f: any) => ({ etiqueta: f.tipo, total: f.total }))} />
            <Barras titulo="Por medio" filas={d.por_medio.map((f: any) => ({ etiqueta: f.medio, total: f.total }))} />
          </div>
        </div>
      ))}
    </div>
  )
}
