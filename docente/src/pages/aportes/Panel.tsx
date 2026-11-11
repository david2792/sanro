import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Apiladas, COLORES, Columnas } from '../../components/GraficosReporte'
import { Dato } from '../../components/Reporte'
import { Boton, Cargando, Encabezado, ErrorCaja, Tarjeta, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { cn, guaranies, miles } from '../../lib/utils'
import { AportesNav, SERIES_AVANCE } from './comun'

/** Orden validado para daltonismo: el ámbar nunca queda junto al rojo. */
const SERIES_CUOTAS = [
  { nombre: 'Pagadas', color: COLORES.presente },
  { nombre: 'Pago parcial', color: COLORES.tarde },
  { nombre: 'Exoneradas', color: COLORES.justificado },
  { nombre: 'Con deuda', color: COLORES.ausente },
  { nombre: 'Sin pagos aún', color: COLORES.neutro },
]

/** "1.250.000" -> "1,3 M" para el eje de los gráficos. */
function corto(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-PY', { maximumFractionDigits: 1 })} M`
  if (n >= 1000) return `${Math.round(n / 1000)} mil`
  return String(n)
}

function Bloque({ titulo, detalle, children, className }: { titulo: string; detalle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0', className)}>
      <h2 className="text-lg font-bold leading-tight">{titulo}</h2>
      {detalle && <p className="mb-3 text-sm text-grafito-500">{detalle}</p>}
      {children}
    </section>
  )
}

export default function PanelAportes() {
  const navegar = useNavigate()
  const { data, isLoading, error } = useQuery({ queryKey: ['aportes-panel'], queryFn: () => api('/aportes/panel/'), refetchInterval: 120_000 })

  return (
    <div>
      <Encabezado titulo="Aportes de padres" detalle={data ? `ACES · año lectivo ${data.anio}` : 'ACES'}
        acciones={<Boton className="no-imprimir" onClick={() => navegar('/aportes/cobrar')}>Registrar pago</Boton>} />
      <AportesNav />
      {isLoading && <Cargando texto="Calculando el estado de los aportes…" />}
      <ErrorCaja error={error} />
      {data && !data.por_concepto.length && (
        <Vacio titulo="Todavía no hay conceptos de aporte"
          texto="Cargá primero qué se cobra (por ejemplo, la cuota mensual) y desde qué mes."
          accion={<Boton onClick={() => navegar('/aportes/configuracion')}>Configurar aportes</Boton>} />
      )}
      {data && data.por_concepto.length > 0 && <Contenido d={data} onSeccion={(id) => navegar(`/aportes/secciones/${id}`)} />}
    </div>
  )
}

function Contenido({ d, onSeccion }: { d: any; onSeccion: (id: number) => void }) {
  const t = d.totales
  const f = d.familias
  const secciones = [...d.secciones].filter((s: any) => s.alumnos)
    .sort((a: any, b: any) => (a.porcentaje_pagado ?? 101) - (b.porcentaje_pagado ?? 101))

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato texto="Recaudado en el año" valor={guaranies(t.recaudado)} detalle={`${miles(t.recibos)} recibos · hoy ${guaranies(t.recaudado_hoy)}`} />
        <Dato texto="Cobrado del total" valor={t.porcentaje_pagado == null ? '—' : `${t.porcentaje_pagado}%`}
          tono={t.porcentaje_pagado == null ? undefined : t.porcentaje_pagado >= 80 ? 'verde' : t.porcentaje_pagado >= 40 ? 'ambar' : 'rojo'}
          detalle={`de ${guaranies(t.total_anual)} esperados en el año`} />
        <Dato texto="Saldo por cobrar" valor={guaranies(t.saldo)} tono={t.deuda ? 'rojo' : undefined}
          detalle={t.deuda ? `${guaranies(t.deuda)} ya vencido · ${f.con_deuda} alumnos` : 'Nada vencido sin pagar'} />
        <Dato texto="Pagaron todo" valor={`${f.completos} de ${f.alumnos}`}
          detalle={`${f.parciales} pagaron una parte · ${f.sin_pagos} sin pagos · ${f.exonerados} exonerados`} />
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <Bloque className="lg:col-span-3" titulo="Avance por sección"
          detalle="Cuántos alumnos pagaron todo, una parte o nada todavía. Primero las secciones que menos cobraron.">
          <Tarjeta className="p-2">
            <Apiladas series={SERIES_AVANCE} onTocar={onSeccion}
              filas={secciones.map((s: any) => ({
                id: s.id, nombre: s.seccion, valores: [s.completos, s.parciales, s.exonerados, s.sin_pagos],
                derecha: s.porcentaje_pagado == null ? '—' : `${s.porcentaje_pagado}% cobrado`,
                detalle: `${s.completos} pagaron todo · ${s.parciales} una parte · ${s.sin_pagos} sin pagos · saldo ${guaranies(s.saldo)}${s.deuda ? ` (${guaranies(s.deuda)} vencido)` : ''}`,
              }))} />
            <p className="px-2 pb-1 pt-2 text-xs text-grafito-500">El porcentaje es lo cobrado sobre el total que la sección debe pagar en el año. Tocá una sección para ver la planilla.</p>
          </Tarjeta>
        </Bloque>

        <div className="space-y-8 lg:col-span-2">
          <Bloque titulo="Recaudación por mes" detalle="Total cobrado según la fecha de cada recibo.">
            <Tarjeta className="p-3">
              <Columnas titulo="Recaudación por mes" formato={guaranies} formatoEje={corto}
                datos={d.por_mes.map((m: any) => ({ clave: m.mes, etiqueta: m.etiqueta.split(' ')[0], valor: m.monto, detalle: m.etiqueta }))} />
            </Tarjeta>
          </Bloque>
          <Bloque titulo="Medio de pago">
            <Tarjeta className="divide-y divide-grafito-100">
              {d.por_medio.map((m: any) => (
                <div key={m.medio} className="flex justify-between px-4 py-2.5">
                  <span>{m.medio}</span>
                  <span className="font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{guaranies(m.monto)}</span>
                </div>
              ))}
            </Tarjeta>
          </Bloque>
        </div>
      </div>

      <Bloque titulo="Estado de cada aporte" detalle="Cuántos alumnos completaron el pago, cuántos pagaron una parte, cuántos deben algo vencido y cuántos todavía no empezaron.">
        <Tarjeta className="p-2">
          <Apiladas series={SERIES_CUOTAS}
            filas={d.cuotas.map((c: any, i: number) => {
              const total = c.pagado + c.parcial + c.exonerado + c.con_deuda + c.por_vencer
              return {
                id: i, nombre: d.por_concepto.length > 1 && c.mes ? `${c.concepto} · ${c.etiqueta}` : c.etiqueta,
                valores: [c.pagado, c.parcial, c.exonerado, c.con_deuda, c.por_vencer],
                derecha: total ? `${Math.round((c.pagado * 100) / total)}% pagado` : '',
              }
            })} />
        </Tarjeta>
      </Bloque>

      <Bloque titulo="Por concepto">
        <div className="overflow-x-auto rounded-xl border border-grafito-200 bg-white">
          <table className="w-full min-w-[600px] text-left" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="border-b border-grafito-200 bg-grafito-100/60 text-sm text-grafito-600">
              <tr>
                <th className="px-4 py-2.5">Concepto</th><th className="px-3 py-2.5 text-right">Monto (Gs.)</th>
                <th className="px-3 py-2.5 text-right">Recaudado</th><th className="px-3 py-2.5 text-right">Saldo</th>
                <th className="px-3 py-2.5 text-right">Vencido sin pagar</th><th className="px-4 py-2.5 text-right">Cobrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grafito-100">
              {d.por_concepto.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-bold">{c.concepto} <span className="font-normal text-grafito-500">· {c.periodicidad}</span></td>
                  <td className="px-3 py-3 text-right">{miles(c.monto)}</td>
                  <td className="px-3 py-3 text-right">{miles(c.recaudado)}</td>
                  <td className="px-3 py-3 text-right">{miles(c.saldo)}</td>
                  <td className={cn('px-3 py-3 text-right', c.deuda > 0 && 'font-bold text-ausente')}>{c.deuda ? miles(c.deuda) : '—'}</td>
                  <td className="px-4 py-3 text-right">{c.porcentaje_pagado == null ? '—' : `${c.porcentaje_pagado}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>
    </div>
  )
}
