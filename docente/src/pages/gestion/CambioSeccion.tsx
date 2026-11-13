// Cambio de sección dentro del año: no se pisa la matrícula, queda el historial (plan maestro 5).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'
import { useOpciones } from '../../components/Crud'
import { Boton, Campo, Hoja, Input, Select, Tarjeta, Textarea, useAviso } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { fechaCorta, hoyISO } from '../../lib/utils'

const EN_CURSO = ['ACTIVA', 'PENDIENTE_DOC']

export default function CambioSeccion({ alumno }: { alumno: number }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const matriculas = useQuery({ queryKey: ['matriculas-alumno', alumno], queryFn: () => lista(`/matriculas/?alumno=${alumno}`) })
  const actual = (matriculas.data ?? []).find((m: any) => EN_CURSO.includes(m.estado))
  const historial = useQuery({
    queryKey: ['cambios-seccion', actual?.id],
    queryFn: () => api(`/matriculas/${actual.id}/cambiar-seccion/`),
    enabled: !!actual,
  })
  const secciones = useOpciones('/secciones/')
  const [abierta, setAbierta] = useState(false)
  const [datos, setDatos] = useState({ seccion_nueva: '', fecha_efectiva: hoyISO(), motivo: '' })
  const [enviando, setEnviando] = useState(false)

  if (!actual) return null
  const opciones = (secciones.data ?? []).filter((s: any) => s.anio_lectivo === actual.anio_lectivo && s.id !== actual.seccion)

  async function guardar() {
    setEnviando(true)
    try {
      await api(`/matriculas/${actual.id}/cambiar-seccion/`, { method: 'POST', body: { ...datos, seccion_nueva: Number(datos.seccion_nueva) } })
      avisar('Cambio de sección registrado')
      setAbierta(false)
      setDatos({ seccion_nueva: '', fecha_efectiva: hoyISO(), motivo: '' })
      await Promise.all([qc.invalidateQueries({ queryKey: ['matriculas-alumno', alumno] }),
        qc.invalidateQueries({ queryKey: ['cambios-seccion'] }), qc.invalidateQueries({ queryKey: ['lista'] })])
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo cambiar de sección.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Tarjeta className="mb-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm"><span className="text-grafito-500">Sección actual:</span> <strong>{actual.seccion_descripcion}</strong></p>
        <Boton variante="secundario" onClick={() => setAbierta(true)}><ArrowRightLeft className="size-4" /> Cambiar de sección</Boton>
      </div>
      {!!historial.data?.length && (
        <ul className="space-y-1 border-t border-grafito-100 pt-3 text-sm">
          {historial.data.map((c: any) => (
            <li key={c.id}>
              <strong>{fechaCorta(c.fecha_efectiva)}</strong>: {c.seccion_anterior_descripcion} → {c.seccion_nueva_descripcion}
              <span className="text-grafito-500"> · {c.motivo}{c.autorizado_por_nombre && ` (${c.autorizado_por_nombre})`}</span>
            </li>
          ))}
        </ul>
      )}
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo="Cambiar de sección" pie={
        <Boton onClick={guardar} cargando={enviando} disabled={!datos.seccion_nueva || !datos.motivo.trim()}>Registrar cambio</Boton>
      }>
        <div className="space-y-4">
          <p className="text-sm text-grafito-500">La asistencia y las notas anteriores quedan en la sección donde se cargaron.</p>
          <Campo label="Nueva sección">
            <Select value={datos.seccion_nueva} onChange={(e) => setDatos({ ...datos, seccion_nueva: e.target.value })}>
              <option value="">Elegí…</option>
              {opciones.map((s: any) => <option key={s.id} value={s.id}>{s.descripcion}</option>)}
            </Select>
          </Campo>
          <Campo label="Desde">
            <Input type="date" value={datos.fecha_efectiva} onChange={(e) => setDatos({ ...datos, fecha_efectiva: e.target.value })} />
          </Campo>
          <Campo label="Motivo">
            <Textarea rows={2} maxLength={250} value={datos.motivo} onChange={(e) => setDatos({ ...datos, motivo: e.target.value })} />
          </Campo>
        </div>
      </Hoja>
    </Tarjeta>
  )
}
