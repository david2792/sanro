import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { usePaginacion } from '../../components/Crud'
import { Boton, Campo, Cargando, ErrorCaja, Hoja, Textarea, useAviso, Vacio } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { fechaLarga, hoyISO } from '../../lib/utils'
import Planificacion from '../docente/Planificacion'
import { BotonSugerir, ItemSugerencia, useSugerencias } from '../docente/SugerenciasDireccion'
import Unidades from '../docente/Unidades'
import { Pestanias } from './Detalles'

type Tab = 'plan' | 'desarrollo' | 'planificacion' | 'sugerencias'

/**
 * Dirección: todo lo pedagógico de una materia en un lugar. Puede ver, corregir y dejar
 * sugerencias sobre el plan anual y sobre el desarrollo de cada clase.
 */
export default function SeguimientoMateria() {
  const id = Number(useParams().id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('t') as Tab) || 'plan'
  const mes = params.get('mes') || hoyISO().slice(0, 7)
  const volver = params.get('desde') === 'planificacion' ? `/planificacion?mes=${mes}` : '/planes'
  const a = useQuery({ queryKey: ['asignacion', id], queryFn: () => api(`/asignaciones/${id}/`) })
  const sugerencias = useSugerencias(id)
  const sinLeer = (sugerencias.data ?? []).filter((s) => !s.leida).length

  if (a.isLoading) return <Cargando />
  if (a.error) return <ErrorCaja error={a.error} />
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-start gap-2">
        <Link to={volver} className="-ml-2 mt-0.5 grid size-10 shrink-0 place-items-center rounded-full hover:bg-grafito-100" aria-label="Volver">
          <ChevronLeft className="size-6" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight">{a.data.materia_nombre}</h1>
          <p className="text-grafito-500">{a.data.seccion_descripcion} · {a.data.docente_nombre}</p>
        </div>
      </div>

      <Pestanias valor={tab} onChange={(t: Tab) => setParams((p) => { p.set('t', t); return p }, { replace: true })} opciones={[
        { valor: 'plan', label: 'Plan anual' },
        { valor: 'desarrollo', label: 'Desarrollo de clases' },
        { valor: 'planificacion', label: 'Planificación' },
        { valor: 'sugerencias', label: `Sugerencias${sugerencias.data?.length ? ` (${sugerencias.data.length})` : ''}` },
      ]} />

      {tab === 'plan' && (
        <>
          <p className="mb-4 rounded-control bg-tinta-50 px-4 py-3 text-[15px] text-grafito-700">
            Podés corregir el plan directamente (los cambios los ve el docente) o dejarle una sugerencia para que lo corrija él.
          </p>
          <Unidades asignacion={id} seccion={a.data.seccion} />
        </>
      )}
      {tab === 'desarrollo' && <CuadernoClases asignacion={id} />}
      {tab === 'planificacion' && <Planificacion asignacion={id} soloLectura mesInicial={mes} />}
      {tab === 'sugerencias' && (
        <div className="space-y-2">
          {sugerencias.data?.length ? (
            <p className="text-sm text-grafito-500">{sinLeer ? `${sinLeer} todavía sin leer por el docente.` : 'El docente leyó todas.'}</p>
          ) : <Vacio titulo="Sin sugerencias" texto="Dejalas desde el plan anual o desde el desarrollo de cada clase." />}
          {sugerencias.data?.map((s) => <ItemSugerencia key={s.id} s={s} />)}
        </div>
      )}
    </div>
  )
}

/** Cuaderno de cátedra: lo que el docente registró de cada clase, de la más reciente a la más vieja. */
function CuadernoClases({ asignacion }: { asignacion: number }) {
  const registros = useQuery({
    queryKey: ['registros-clase', asignacion],
    queryFn: () => lista(`/registros-clase/?sesion__asignacion=${asignacion}`),
  })
  const sugerencias = useSugerencias(asignacion, 'CLASE')
  const [editar, setEditar] = useState<any | null>(null)
  const { visibles, paginador } = usePaginacion(registros.data ?? [], 10)

  if (registros.isLoading) return <Cargando />
  if (registros.error) return <ErrorCaja error={registros.error} />
  if (!registros.data?.length) return <Vacio titulo="Todavía no registró clases" texto="Acá aparece el desarrollo de cada clase que el docente cargue después de llamar lista." />

  return (
    <div>
      <ul className="space-y-3">
        {visibles.map((r: any) => {
          const sug = (sugerencias.data ?? []).filter((s) => s.registro_clase === r.id)
          return (
            <li key={r.id} className="rounded-xl border border-grafito-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold first-letter:uppercase">{fechaLarga(r.fecha)}</p>
                  {r.unidad_titulo && <p className="text-sm font-bold text-tinta-700">{r.unidad_titulo}</p>}
                </div>
                <div className="flex gap-2">
                  <Boton variante="fantasma" onClick={() => setEditar(r)}><Pencil className="size-4" /> Corregir</Boton>
                  <BotonSugerir asignacion={asignacion} sobre="CLASE" registro={r.id} />
                </div>
              </div>
              <dl className="mt-2 space-y-1.5 text-[15px]">
                {[['Contenido', r.contenido], ['Actividades y estrategias', r.actividades], ['Observaciones', r.observaciones]]
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-sm font-bold text-grafito-500">{k}</dt>
                      <dd className="whitespace-pre-line">{v || <span className="text-tarde">Sin cargar</span>}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-1.5 text-sm text-grafito-500">
                {r.capacidades.length} capacidades trabajadas · {r.indicadores_evaluados.length} indicadores evaluados
              </p>
              {sug.length > 0 && <div className="mt-3 space-y-2">{sug.map((s) => <ItemSugerencia key={s.id} s={s} contexto={false} />)}</div>}
            </li>
          )
        })}
      </ul>
      {paginador}
      {editar && <CorregirClase registro={editar} asignacion={asignacion} onCerrar={() => setEditar(null)} />}
    </div>
  )
}

/** Dirección corrige los textos del desarrollo de una clase. */
function CorregirClase({ registro, asignacion, onCerrar }: { registro: any; asignacion: number; onCerrar: () => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const [v, setV] = useState({ contenido: registro.contenido, actividades: registro.actividades, observaciones: registro.observaciones })
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    try {
      await api(`/registros-clase/${registro.id}/`, { method: 'PATCH', body: v })
      await qc.invalidateQueries({ queryKey: ['registros-clase', asignacion] })
      void qc.invalidateQueries({ queryKey: ['registro-clase'] })
      avisar('Desarrollo de la clase corregido')
      onCerrar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={`Clase del ${fechaLarga(registro.fecha)}`}
      pie={<Boton className="flex-1" onClick={guardar} cargando={guardando}>Guardar corrección</Boton>}>
      <div className="space-y-4">
        <p className="text-sm text-grafito-500">El docente ve el desarrollo corregido. Si preferís que lo corrija él, dejale una sugerencia.</p>
        <Campo label="Contenido o tema desarrollado"><Textarea value={v.contenido} onChange={(e) => setV({ ...v, contenido: e.target.value })} /></Campo>
        <Campo label="Actividades y estrategias"><Textarea value={v.actividades} onChange={(e) => setV({ ...v, actividades: e.target.value })} /></Campo>
        <Campo label="Observaciones"><Textarea rows={2} value={v.observaciones} onChange={(e) => setV({ ...v, observaciones: e.target.value })} /></Campo>
      </div>
    </Hoja>
  )
}
