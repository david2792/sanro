import { CrudPage, type CrudConfig } from '../../components/Crud'
import { Encabezado, Etiqueta } from '../../components/ui'
import { fechaCorta, guaranies, MES_CORTO } from '../../lib/utils'
import { AportesNav } from './comun'

const MESES = MES_CORTO.slice(1).map((m, i) => ({ valor: String(i + 1), label: m }))
const mensual = (v: Record<string, any>) => v.periodicidad !== 'UNICO'

const CONCEPTOS: CrudConfig = {
  titulo: 'Conceptos de aporte', singular: 'Concepto', ruta: '/aportes/conceptos/',
  descripcion: 'Lo que cobra la ACES este año. Un monto total (ej. Gs. 200.000) se puede pagar en partes.',
  columnas: [
    { label: 'Concepto', valor: (o) => o.nombre, principal: true },
    { label: 'Monto', valor: (o) => `${guaranies(o.monto)}${o.periodicidad === 'MENSUAL' ? ' por mes' : ''}` },
    {
      label: 'Período', valor: (o) => o.periodicidad === 'MENSUAL'
        ? `Cuota mensual · ${MES_CORTO[o.mes_inicio]} a ${MES_CORTO[o.mes_fin]} · vence el ${o.dia_vencimiento}`
        : `Monto total · ${o.fecha_vencimiento ? `completar hasta ${fechaCorta(o.fecha_vencimiento)}` : 'completar en el año'}`,
    },
    { label: 'Cursos', valor: (o) => (o.cursos_nombres.length ? o.cursos_nombres.join(', ') : 'Todos'), oculto_movil: true },
    { label: 'Estado', valor: (o) => (o.activo ? <Etiqueta tono="verde">Activo</Etiqueta> : <Etiqueta>Inactivo</Etiqueta>), oculto_movil: true },
  ],
  campos: [
    { name: 'nombre', label: 'Nombre', requerido: true, ayuda: 'Ej.: Aporte de padres, Cuota de graduación.' },
    { name: 'periodicidad', label: 'Tipo', tipo: 'select', requerido: true, medio: true,
      opciones: [{ valor: 'UNICO', label: 'Monto total (en partes)' }, { valor: 'MENSUAL', label: 'Cuota mensual' }] },
    { name: 'monto', label: 'Monto', tipo: 'monto', requerido: true, medio: true,
      ayuda: 'Total del año; si es cuota mensual, por mes.' },
    { name: 'mes_inicio', label: 'Primer mes', tipo: 'select', opciones: MESES, requerido: true, medio: true, visible: mensual },
    { name: 'mes_fin', label: 'Último mes', tipo: 'select', opciones: MESES, requerido: true, medio: true, visible: mensual },
    { name: 'dia_vencimiento', label: 'Vence el día', tipo: 'numero', medio: true, visible: mensual, ayuda: 'De cada mes (1 a 28).' },
    { name: 'fecha_vencimiento', label: 'Completar hasta', tipo: 'fecha', visible: (v) => !mensual(v),
      ayuda: 'Fecha límite para terminar de pagar. Vacío: fin del año lectivo. Lo que falte después de esa fecha cuenta como deuda.' },
    { name: 'cursos', label: 'Cursos que lo pagan', tipo: 'fk_multiple', fk: { ruta: '/aportes/cursos/', label: (o) => o.descripcion },
      ayuda: 'Sin marcar ninguno: lo pagan todos.' },
    { name: 'activo', label: 'Estado', tipo: 'si_no', ayuda: 'Concepto activo (se cobra y aparece en los reportes)' },
  ],
  inicial: () => ({ periodicidad: 'UNICO', mes_inicio: '3', mes_fin: '11', dia_vencimiento: 10, cursos: [], activo: true }),
}

const EXONERACIONES: CrudConfig = {
  titulo: 'Exoneraciones', singular: 'Exoneración', femenino: true, ruta: '/aportes/exoneraciones/',
  columnas: [
    { label: 'Alumno', valor: (o) => o.alumno, principal: true },
    { label: 'Concepto', valor: (o) => o.concepto_nombre },
    { label: 'Motivo', valor: (o) => o.motivo },
  ],
  campos: [
    { name: 'matricula', label: 'Alumno', tipo: 'fk', requerido: true, fk: { ruta: '/aportes/matriculas/', label: (o) => `${o.alumno} — ${o.seccion}` } },
    { name: 'concepto', label: 'Concepto', tipo: 'fk', requerido: true, fk: { ruta: '/aportes/conceptos/', label: (o) => o.nombre } },
    { name: 'motivo', label: 'Motivo', requerido: true, ayuda: 'Ej.: hermanos en el colegio, situación económica, beca.' },
  ],
}

export default function ConfiguracionAportes() {
  return (
    <div>
      <Encabezado titulo="Configuración de aportes" detalle="Conceptos que se cobran y alumnos exonerados." />
      <AportesNav />
      <div className="space-y-10">
        <CrudPage config={CONCEPTOS} embebido />
        <CrudPage config={EXONERACIONES} embebido />
      </div>
    </div>
  )
}
