// Piezas compartidas de Aportes voluntarios a la ACE (plan maestro 14.5 y 14.6).
import { NavLink } from 'react-router'
import { useAuth } from '../../lib/auth'
import { cn, fechaCorta, guaranies } from '../../lib/utils'

export const MEDIOS = [
  { valor: 'EFECTIVO', label: 'Efectivo' },
  { valor: 'TRANSFERENCIA', label: 'Transferencia' },
  { valor: 'CHEQUE', label: 'Cheque' },
  { valor: 'ESPECIE', label: 'En especie' },
  { valor: 'OTRO', label: 'Otro' },
]

export const TIPOS_CONCEPTO = [
  { valor: 'APORTE_SOCIAL', label: 'Aporte social voluntario' },
  { valor: 'DONACION', label: 'Donación monetaria' },
  { valor: 'DONACION_ESPECIE', label: 'Donación en especie' },
  { valor: 'ACTIVIDAD', label: 'Aporte para una actividad' },
  { valor: 'EVENTO', label: 'Recaudación de evento' },
  { valor: 'OTRO', label: 'Otro ingreso permitido' },
]

export const ESTADO_RECIBO: Record<string, { texto: string; tono: 'verde' | 'rojo' | 'ambar' }> = {
  EMITIDO: { texto: 'Emitido', tono: 'verde' },
  ANULADO: { texto: 'Anulado', tono: 'rojo' },
  REVERTIDO: { texto: 'Revertido', tono: 'ambar' },
}

export const numeroRecibo = (r: { serie: string; numero: number; ejercicio: number }) =>
  `${r.serie}-${String(r.numero).padStart(5, '0')}/${r.ejercicio}`

export function AportesNav() {
  const { operaAportes } = useAuth()
  const tabs = [
    { a: '/aportes', texto: 'Panel', fin: true },
    ...(operaAportes ? [{ a: '/aportes/cobrar', texto: 'Emitir recibo' }] : []),
    { a: '/aportes/recibos', texto: 'Recibos' },
    { a: '/aportes/reportes', texto: 'Rendición' },
    ...(operaAportes ? [{ a: '/aportes/configuracion', texto: 'Configuración' }] : []),
  ]
  return (
    <nav className="no-imprimir -mx-4 mb-5 overflow-x-auto px-4" aria-label="Secciones de aportes">
      <div className="inline-flex rounded-control bg-grafito-100 p-1">
        {tabs.map((t) => (
          <NavLink key={t.a} to={t.a} end={t.fin}
            className={({ isActive }) => cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold',
              isActive ? 'bg-white text-tinta-700 shadow-sm' : 'text-grafito-500')}>
            {t.texto}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Recibo interno de la ACE, listo para imprimir. No es una factura. */
export function Recibo({ recibo: r }: { recibo: any }) {
  const cerrado = r.estado !== 'EMITIDO'
  return (
    <div className="relative mx-auto max-w-lg rounded-xl border border-grafito-300 bg-white p-5 text-grafito">
      {cerrado && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="-rotate-12 rounded-lg border-4 border-ausente px-4 py-1 text-4xl font-extrabold uppercase text-ausente/80">
            {ESTADO_RECIBO[r.estado]?.texto}
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-4 border-b border-grafito-200 pb-3">
        <div>
          <p className="font-bold">{r.ace_nombre}</p>
          {r.ace_ruc && <p className="text-xs text-grafito-500">RUC {r.ace_ruc}</p>}
          <p className="text-xs font-bold uppercase tracking-wide text-grafito-500">Recibo de aporte voluntario</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-grafito-500">RECIBO N°</p>
          <p className="text-xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>{numeroRecibo(r)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-3 text-sm">
        <dt className="text-grafito-500">Fecha</dt><dd className="font-bold">{fechaCorta(r.fecha)}</dd>
        <dt className="text-grafito-500">Recibimos de</dt>
        <dd className="font-bold">{r.aportante_nombre}{r.aportante_documento && ` · C.I. ${r.aportante_documento}`}</dd>
        <dt className="text-grafito-500">Medio</dt><dd>{r.medio_nombre}{r.referencia ? ` · ${r.referencia}` : ''}</dd>
        {r.destino_restringido && <><dt className="text-grafito-500">Destino</dt><dd>{r.destino_restringido}</dd></>}
      </dl>
      <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr className="border-y border-grafito-200 text-left text-grafito-500"><th className="py-1.5">Concepto</th><th className="text-right">Monto</th></tr></thead>
        <tbody>
          {r.lineas.map((l: any) => (
            <tr key={l.id} className="border-b border-grafito-100">
              <td className="py-1.5">{l.concepto_nombre}{l.descripcion && <span className="block text-xs text-grafito-500">{l.descripcion}</span>}</td>
              <td className="text-right">{guaranies(l.monto)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td className="pt-2 font-bold">Total</td><td className="pt-2 text-right text-lg font-extrabold">{guaranies(r.total)}</td></tr></tfoot>
      </table>
      <p className="mt-2 text-sm">Son: <span className="font-bold">{r.importe_letras}</span>.</p>
      {r.observacion && <p className="mt-1 text-sm text-grafito-500">Obs.: {r.observacion}</p>}
      {cerrado && <p className="mt-2 text-sm font-bold text-ausente">{ESTADO_RECIBO[r.estado]?.texto}: {r.motivo_anulacion}
        {r.anulado_por_nombre && <span className="font-normal"> ({r.anulado_por_nombre})</span>}</p>}
      <div className="mt-12 flex items-end justify-between gap-4 text-xs text-grafito-500">
        <span>Registró: {r.registrado_por_nombre ?? '—'}<br />Código de verificación: <strong>{r.codigo_verificacion}</strong></span>
        <span className="w-44 border-t border-grafito pt-1 text-center text-grafito">Firma y sello de la ACE</span>
      </div>
      <p className="mt-3 border-t border-grafito-100 pt-2 text-center text-[11px] text-grafito-500">{r.leyenda}</p>
    </div>
  )
}
