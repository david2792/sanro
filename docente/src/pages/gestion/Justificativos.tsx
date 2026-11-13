// Trámite de justificativos: se presentan, se revisan y se deciden. Las ausencias nunca se borran.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { FormularioCrud } from '../../components/Crud'
import { Boton, Campo, Cargando, Casilla, Encabezado, ErrorCaja, Etiqueta, Hoja, Segmentado, Tarjeta, Textarea, Vacio, useAviso } from '../../components/ui'
import { api } from '../../lib/api'
import { fechaCorta } from '../../lib/utils'
import { REFERENCIALES } from './referenciales'

type Filtro = 'PENDIENTES' | 'DECIDIDOS' | 'TODOS'
const PENDIENTES = ['BORRADOR', 'PRESENTADO', 'EN_REVISION', 'REQUIERE_INFO']
const TONO: Record<string, 'gris' | 'verde' | 'rojo' | 'ambar' | 'azul'> = {
  PRESENTADO: 'azul', EN_REVISION: 'azul', REQUIERE_INFO: 'ambar', APROBADO: 'verde',
  APROBADO_PARCIAL: 'verde', RECHAZADO: 'rojo', CANCELADO: 'gris', BORRADOR: 'gris',
}

export default function Justificativos() {
  const [filtro, setFiltro] = useState<Filtro>('PENDIENTES')
  const [nuevo, setNuevo] = useState(false)
  const [abierto, setAbierto] = useState<any | null>(null)
  const lista = useQuery({ queryKey: ['justificaciones'], queryFn: () => api('/justificaciones/?page_size=500') })

  const items: any[] = (lista.data?.results ?? []).filter((j: any) =>
    filtro === 'TODOS' ? true : filtro === 'PENDIENTES' ? PENDIENTES.includes(j.estado) : !PENDIENTES.includes(j.estado))

  return (
    <div className="space-y-4">
      <Encabezado titulo="Justificativos" detalle={REFERENCIALES.justificaciones.descripcion}
        acciones={<Boton onClick={() => setNuevo(true)}><Plus className="size-4" /> Nuevo</Boton>} />
      <Segmentado valor={filtro} onChange={setFiltro} opciones={[
        { valor: 'PENDIENTES', label: 'Por decidir' }, { valor: 'DECIDIDOS', label: 'Decididos' }, { valor: 'TODOS', label: 'Todos' }]} />

      {lista.isLoading ? <Cargando /> : lista.error ? <ErrorCaja error={lista.error} /> : items.length === 0 ? (
        <Vacio titulo={filtro === 'PENDIENTES' ? 'No hay justificativos por decidir' : 'Sin justificativos'} />
      ) : (
        <Tarjeta className="divide-y divide-grafito-100 p-0">
          {items.map((j) => (
            <button key={j.id} type="button" onClick={() => setAbierto(j)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-tinta-50/60">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{j.alumno}</p>
                <p className="truncate text-sm text-grafito-500">
                  {fechaCorta(j.fecha_desde)}{j.fecha_hasta !== j.fecha_desde && ` al ${fechaCorta(j.fecha_hasta)}`}
                  {' · '}{j.detalle_ausencias.length} {j.detalle_ausencias.length === 1 ? 'ausencia' : 'ausencias'}
                  {j.origen === 'DOCENTE' && ' · aviso en clase'}
                </p>
              </div>
              <Etiqueta tono={TONO[j.estado] ?? 'gris'}>{j.estado_nombre}</Etiqueta>
            </button>
          ))}
        </Tarjeta>
      )}

      <FormularioCrud config={REFERENCIALES.justificaciones} abierto={nuevo} registro={null}
        onCerrar={() => setNuevo(false)} onGuardado={() => { setNuevo(false); void lista.refetch() }} />
      {abierto && <Decidir justificacion={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}

function Decidir({ justificacion: j, onCerrar }: { justificacion: any; onCerrar: () => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const [motivo, setMotivo] = useState('')
  const [aprobadas, setAprobadas] = useState<number[]>(j.detalle_ausencias.map((a: any) => a.registro))
  const [enviando, setEnviando] = useState('')
  const abierto = PENDIENTES.includes(j.estado)
  const todas = aprobadas.length === j.detalle_ausencias.length

  async function ejecutar(accion: string, cuerpo: Record<string, any> = {}, texto = 'Listo') {
    setEnviando(accion)
    try {
      await api(`/justificaciones/${j.id}/${accion}/`, { method: 'POST', body: cuerpo })
      await qc.invalidateQueries({ queryKey: ['justificaciones'] })
      avisar(texto)
      onCerrar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setEnviando('')
    }
  }

  const aprobar = () => todas
    ? ejecutar('decidir', { decision: 'APROBADO', motivo }, 'Justificativo aprobado')
    : ejecutar('decidir', { decision: 'APROBADO_PARCIAL', motivo, aprobadas }, 'Aprobado en parte')

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={j.alumno} pie={abierto && (
      <div className="flex flex-wrap gap-2">
        <Boton onClick={aprobar} cargando={enviando === 'decidir'} disabled={!aprobadas.length || (!todas && !motivo.trim())}>
          {todas ? 'Aprobar' : `Aprobar ${aprobadas.length}`}
        </Boton>
        <Boton variante="secundario" disabled={!motivo.trim()} cargando={enviando === 'pedir'}
          onClick={() => ejecutar('decidir', { decision: 'REQUIERE_INFO', motivo }, 'Se pidió documentación')}>Pedir documentación</Boton>
        <Boton variante="peligro" disabled={!motivo.trim()}
          onClick={() => ejecutar('decidir', { decision: 'RECHAZADO', motivo }, 'Justificativo rechazado')}>Rechazar</Boton>
      </div>
    )}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Etiqueta tono={TONO[j.estado] ?? 'gris'}>{j.estado_nombre}</Etiqueta>
          <span className="text-sm text-grafito-500">{j.origen_nombre}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-grafito-500">Sección</dt><dd>{j.seccion}</dd>
          <dt className="text-grafito-500">Presentado</dt><dd>{fechaCorta(j.fecha_presentacion)}{j.presentado_por && ` · ${j.presentado_por}`}</dd>
          <dt className="text-grafito-500">Motivo</dt><dd>{j.motivo}</dd>
          {j.adjunto && (<><dt className="text-grafito-500">Respaldo</dt>
            <dd><a href={j.adjunto} target="_blank" rel="noreferrer" className="text-tinta-600 underline">Ver archivo</a></dd></>)}
          {j.motivo_decision && (<><dt className="text-grafito-500">Decisión</dt>
            <dd>{j.motivo_decision}{j.revisado_por_nombre && ` (${j.revisado_por_nombre})`}</dd></>)}
        </dl>

        <div>
          <p className="mb-2 font-bold">Ausencias incluidas</p>
          {j.detalle_ausencias.length === 0 ? (
            <p className="text-sm text-grafito-500">No hay ausencias registradas en esas fechas. Se suman solas si se cargan después.</p>
          ) : (
            <ul className="space-y-1">
              {j.detalle_ausencias.map((a: any) => (
                <li key={a.registro}>
                  {abierto ? (
                    <Casilla checked={aprobadas.includes(a.registro)}
                      onChange={(v) => setAprobadas((s) => v ? [...s, a.registro] : s.filter((x) => x !== a.registro))}>
                      {fechaCorta(a.fecha)} · {a.materia}
                    </Casilla>
                  ) : (
                    <span className="text-sm">{fechaCorta(a.fecha)} · {a.materia} — {a.aprobada ? 'justificada' : a.aprobada === false ? 'no justificada' : 'sin decidir'}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {abierto && (
          <>
            <Campo label="Motivo de la decisión" ayuda="Obligatorio para rechazar, pedir documentación o aprobar solo algunas ausencias.">
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={250} />
            </Campo>
            <div className="flex gap-2">
              {j.estado !== 'EN_REVISION' && (
                <Boton variante="fantasma" cargando={enviando === 'revisar'} onClick={() => ejecutar('revisar', {}, 'En revisión')}>Marcar en revisión</Boton>
              )}
              <Boton variante="fantasma" disabled={!motivo.trim()} cargando={enviando === 'cancelar'}
                onClick={() => ejecutar('cancelar', { motivo }, 'Justificativo cancelado')}>Cancelar trámite</Boton>
            </div>
          </>
        )}
      </div>
    </Hoja>
  )
}
