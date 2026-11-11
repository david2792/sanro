import { NavLink } from 'react-router'
import { COLORES } from '../../components/GraficosReporte'
import { Etiqueta } from '../../components/ui'
import { cn, fechaCorta, guaranies, MES_CORTO } from '../../lib/utils'

export type EstadoCuota = 'PAGADO' | 'PARCIAL' | 'VENCIDO' | 'POR_VENCER' | 'EXONERADO'
export type EstadoAlumno = 'AL_DIA' | 'CON_DEUDA' | 'EXONERADO' | 'SIN_CUOTAS'

/** Cada estado lleva un símbolo además del color, para que se lea también impreso en blanco y negro. */
export const CUOTA: Record<EstadoCuota, { texto: string; simbolo: string; clase: string }> = {
  PAGADO: { texto: 'Pagado', simbolo: '✓', clase: 'bg-presente-50 text-presente' },
  PARCIAL: { texto: 'Pago parcial', simbolo: '½', clase: 'bg-tarde-50 text-tarde' },
  VENCIDO: { texto: 'Vencido', simbolo: '!', clase: 'bg-ausente-50 text-ausente' },
  POR_VENCER: { texto: 'Por vencer', simbolo: '·', clase: 'bg-grafito-100 text-grafito-500' },
  EXONERADO: { texto: 'Exonerado', simbolo: 'E', clase: 'bg-justificado-50 text-justificado' },
}

export const ALUMNO: Record<EstadoAlumno, { texto: string; tono: 'verde' | 'rojo' | 'azul' | 'gris' }> = {
  AL_DIA: { texto: 'Al día', tono: 'verde' },
  CON_DEUDA: { texto: 'Con deuda', tono: 'rojo' },
  EXONERADO: { texto: 'Exonerado', tono: 'azul' },
  SIN_CUOTAS: { texto: 'Sin cuotas', tono: 'gris' },
}

export function EstadoAlumnoEtiqueta({ estado }: { estado: EstadoAlumno }) {
  return <Etiqueta tono={ALUMNO[estado].tono}>{ALUMNO[estado].texto}</Etiqueta>
}

/** Avance: cuánto del total del año pagó el alumno. */
export type Avance = 'COMPLETO' | 'PARCIAL' | 'SIN_PAGOS' | 'EXONERADO' | 'SIN_CUOTAS'
export const AVANCE: Record<Avance, { texto: string; tono: 'verde' | 'ambar' | 'azul' | 'gris' }> = {
  COMPLETO: { texto: 'Pagó todo', tono: 'verde' },
  PARCIAL: { texto: 'Pagó una parte', tono: 'ambar' },
  SIN_PAGOS: { texto: 'Sin pagos', tono: 'gris' },
  EXONERADO: { texto: 'Exonerado', tono: 'azul' },
  SIN_CUOTAS: { texto: 'Sin aportes', tono: 'gris' },
}

/** Etiqueta del avance; si además tiene algo vencido sin pagar, lo avisa en rojo. */
export function AvanceEtiqueta({ alumno }: { alumno: { avance: Avance; deuda: number } }) {
  const a = AVANCE[alumno.avance]
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Etiqueta tono={a.tono}>{a.texto}</Etiqueta>
      {alumno.deuda > 0 && <Etiqueta tono="rojo">Vencido</Etiqueta>}
    </span>
  )
}

/** Orden validado para daltonismo: el ámbar queda entre verde y azul, nunca junto al rojo. */
export const SERIES_AVANCE = [
  { nombre: 'Pagaron todo', color: COLORES.presente },
  { nombre: 'Pagaron una parte', color: COLORES.tarde },
  { nombre: 'Exonerados', color: COLORES.justificado },
  { nombre: 'Sin pagos', color: COLORES.neutro },
]

export const MEDIOS = [
  { valor: 'EFECTIVO', label: 'Efectivo' },
  { valor: 'TRANSFERENCIA', label: 'Transferencia' },
  { valor: 'OTRO', label: 'Otro' },
]

export function cuotaNombre(d: { concepto_nombre: string; mes: number | null }) {
  return d.mes ? `${d.concepto_nombre} — ${MES_CORTO[d.mes]}` : d.concepto_nombre
}

export function AportesNav() {
  const tabs = [
    { a: '/aportes', texto: 'Panel', fin: true },
    { a: '/aportes/cobrar', texto: 'Cobrar' },
    { a: '/aportes/reportes', texto: 'Reportes' },
    { a: '/aportes/configuracion', texto: 'Configuración' },
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

/* ------------------------------ Recibo ---------------------------------- */

export function Recibo({ pago, institucion }: { pago: any; institucion?: string }) {
  return (
    <div className="relative mx-auto max-w-lg rounded-xl border border-grafito-300 bg-white p-5 text-grafito">
      {pago.anulado && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="-rotate-12 rounded-lg border-4 border-ausente px-4 py-1 text-4xl font-extrabold text-ausente/80">ANULADO</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-4 border-b border-grafito-200 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-grafito-500">{institucion || 'Colegio'}</p>
          <p className="font-bold">Asociación Cooperadora Escolar (ACES)</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-grafito-500">RECIBO N°</p>
          <p className="text-xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>{String(pago.numero).padStart(5, '0')}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-3 text-sm">
        <dt className="text-grafito-500">Fecha</dt><dd className="font-bold">{fechaCorta(pago.fecha)}</dd>
        <dt className="text-grafito-500">Alumno</dt><dd className="font-bold">{pago.alumno} · C.I. {pago.alumno_ci}</dd>
        <dt className="text-grafito-500">Sección</dt><dd>{pago.seccion}</dd>
        {pago.pagado_por && <><dt className="text-grafito-500">Entregó</dt><dd>{pago.pagado_por}</dd></>}
        <dt className="text-grafito-500">Medio</dt><dd>{pago.medio_nombre}{pago.referencia ? ` · ${pago.referencia}` : ''}</dd>
      </dl>
      <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr className="border-y border-grafito-200 text-left text-grafito-500"><th className="py-1.5">Concepto</th><th className="text-right">Monto</th></tr></thead>
        <tbody>
          {pago.detalles.map((d: any) => (
            <tr key={d.id} className="border-b border-grafito-100"><td className="py-1.5">{cuotaNombre(d)}</td><td className="text-right">{guaranies(d.monto)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td className="pt-2 font-bold">Total</td><td className="pt-2 text-right text-lg font-extrabold">{guaranies(pago.total)}</td></tr></tfoot>
      </table>
      <p className="mt-2 text-sm">Son guaraníes: <span className="font-bold">{numeroALetras(pago.total)}</span>.</p>
      {pago.observacion && <p className="mt-1 text-sm text-grafito-500">Obs.: {pago.observacion}</p>}
      {pago.anulado && <p className="mt-2 text-sm font-bold text-ausente">Anulado: {pago.motivo_anulacion}</p>}
      <div className="mt-12 flex items-end justify-between gap-4 text-xs text-grafito-500">
        <span>Registró: {pago.registrado_por_nombre ?? '—'}</span>
        <span className="w-44 border-t border-grafito pt-1 text-center text-grafito">Firma y sello ACES</span>
      </div>
    </div>
  )
}

/* -------------------------- Montos en letras ---------------------------- */

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
  'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos']

function hastaMil(n: number): string {
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const r = n % 100
  const resto = r < 30 ? UNIDADES[r] : `${DECENAS[Math.floor(r / 10)]}${r % 10 ? ` y ${UNIDADES[r % 10]}` : ''}`
  return [CENTENAS[c], resto].filter(Boolean).join(' ')
}

/** "uno" -> "un" delante de mil/millones: "veintiún mil", "un millón". */
const apocope = (t: string) => t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')

/** 1250000 -> "un millón doscientos cincuenta mil" */
export function numeroALetras(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (millones) partes.push(millones === 1 ? 'un millón' : `${apocope(numeroALetras(millones))} millones`)
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocope(hastaMil(miles))} mil`)
  if (resto) partes.push(hastaMil(resto))
  return partes.join(' ')
}
