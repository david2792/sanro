import { CalendarDays, ChevronRight, FileText } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { CrudPage } from '../../components/Crud'
import { Encabezado } from '../../components/ui'
import { GRUPOS, REFERENCIALES } from './referenciales'

/** Índice de todas las tablas de gestión. */
export function GestionInicio() {
  return (
    <div>
      <Encabezado titulo="Gestión" detalle="Datos del colegio, estructura académica, personas y matrícula." />
      <Link to="/planes" className="mb-6 flex items-center gap-3 rounded-xl border border-grafito-200 bg-white px-4 py-3 hover:bg-tinta-50/60 active:bg-tinta-50">
        <FileText className="size-6 text-tinta-600" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Planes anuales</p>
          <p className="truncate text-sm text-grafito-500">Ver el plan anual que cargó cada docente</p>
        </div>
        <ChevronRight className="size-5 text-grafito-300" />
      </Link>
      <Link to="/planificacion" className="-mt-3 mb-6 flex items-center gap-3 rounded-xl border border-grafito-200 bg-white px-4 py-3 hover:bg-tinta-50/60 active:bg-tinta-50">
        <CalendarDays className="size-6 text-tinta-600" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Planificación de clases</p>
          <p className="truncate text-sm text-grafito-500">Quiénes van planificando sus clases, mes a mes</p>
        </div>
        <ChevronRight className="size-5 text-grafito-300" />
      </Link>
      <div className="grid gap-6 md:grid-cols-2">
        {GRUPOS.map((g) => (
          <section key={g.titulo}>
            <h2 className="mb-2 text-sm font-bold text-grafito-500">{g.titulo}</h2>
            <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
              {g.items.map((i) => (
                <li key={i.clave}>
                  <Link to={`/ref/${i.clave}`} className="flex items-center gap-3 px-4 py-3 hover:bg-tinta-50/60 active:bg-tinta-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{REFERENCIALES[i.clave].titulo}</p>
                      <p className="truncate text-sm text-grafito-500">{i.texto}</p>
                    </div>
                    <ChevronRight className="size-5 text-grafito-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

export function RefPage() {
  const { clave = '' } = useParams()
  const config = REFERENCIALES[clave]
  if (!config) return <Navigate to="/ref" replace />
  return (
    <div>
      <Link to="/ref" className="mb-3 inline-block text-sm font-bold text-tinta-600">‹ Gestión</Link>
      <CrudPage key={clave} config={config} />
    </div>
  )
}
