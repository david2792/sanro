// Datos de la ACE (emisora de los recibos) y conceptos de aporte del año.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CrudPage, type CrudConfig } from '../../components/Crud'
import { Boton, Campo, Encabezado, ErrorCaja, Input, Tarjeta, useAviso } from '../../components/ui'
import { api } from '../../lib/api'
import { guaranies } from '../../lib/utils'
import { AportesNav, TIPOS_CONCEPTO } from './comun'

const CONCEPTOS: CrudConfig = {
  titulo: 'Conceptos de aporte', singular: 'Concepto', ruta: '/aportes/conceptos/', sinBorrar: true,
  descripcion: 'El monto sugerido es solo orientativo: cada familia aporta lo que decide. Un concepto que ya no se usa se desactiva.',
  columnas: [
    { label: 'Concepto', valor: (o) => o.nombre, principal: true },
    { label: 'Tipo', valor: (o) => o.tipo_nombre },
    { label: 'Sugerido', valor: (o) => (o.monto_sugerido ? guaranies(o.monto_sugerido) : '—') },
    { label: 'Activo', valor: (o) => (o.activo ? 'Sí' : 'No'), oculto_movil: true },
  ],
  campos: [
    { name: 'nombre', label: 'Nombre', requerido: true },
    { name: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS_CONCEPTO, requerido: true },
    { name: 'monto_sugerido', label: 'Monto sugerido (opcional)', tipo: 'monto', medio: true },
    { name: 'activo', label: 'Activo', tipo: 'si_no', medio: true },
    { name: 'descripcion', label: 'Descripción', tipo: 'area' },
  ],
  inicial: () => ({ tipo: 'APORTE_SOCIAL', activo: true }),
}

function DatosACE() {
  const qc = useQueryClient()
  const avisar = useAviso()
  const ace = useQuery({ queryKey: ['aportes-ace'], queryFn: () => api('/aportes/ace/') })
  const [datos, setDatos] = useState<Record<string, string> | null>(null)
  const [guardando, setGuardando] = useState(false)
  const valores = datos ?? ace.data ?? {}
  const campo = (name: string, label: string) => (
    <Campo label={label}><Input value={valores[name] ?? ''} onChange={(e) => setDatos({ ...valores, [name]: e.target.value })} /></Campo>
  )

  async function guardar() {
    setGuardando(true)
    try {
      await api('/aportes/ace/', { method: 'PUT', body: valores })
      await qc.invalidateQueries({ queryKey: ['aportes-ace'] })
      setDatos(null)
      avisar('Datos de la ACE guardados')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Tarjeta className="mb-6 space-y-3">
      <h2 className="font-bold">Asociación de Cooperación Escolar</h2>
      <p className="text-sm text-grafito-500">Es la que emite los recibos. Sus fondos son distintos de los de la institución.</p>
      <ErrorCaja error={ace.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        {campo('denominacion', 'Denominación')}
        {campo('ruc', 'RUC')}
        {campo('reconocimiento', 'Resolución de reconocimiento')}
        {campo('domicilio', 'Domicilio')}
        {campo('telefono', 'Teléfono')}
        {campo('email', 'Correo')}
      </div>
      <Boton onClick={guardar} cargando={guardando} disabled={!valores.denominacion?.trim()}>Guardar</Boton>
    </Tarjeta>
  )
}

export default function ConfiguracionAportes() {
  return (
    <div>
      <Encabezado titulo="Configuración de aportes" />
      <AportesNav />
      <DatosACE />
      <CrudPage embebido config={CONCEPTOS} />
    </div>
  )
}
