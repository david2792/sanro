import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePaginacion } from '../../components/Crud'
import { Link } from 'react-router'
import { Cargando, Encabezado, ErrorCaja, Etiqueta, Input, Segmentado, Vacio } from '../../components/ui'
import { api } from '../../lib/api'

type Filtro = 'TODOS' | 'SIN_CARGAR' | 'INCOMPLETOS' | 'COMPLETOS'

/** Cómo va el plan anual de una materia, según las unidades que cargó el docente. */
function estado(p: any): { filtro: Filtro; texto: string; tono: 'gris' | 'verde' | 'ambar' } {
  if (!p.unidades) return { filtro: 'SIN_CARGAR', texto: 'Sin unidades', tono: 'gris' }
  if (p.unidades_completas < p.unidades) return { filtro: 'INCOMPLETOS', texto: 'Incompleto', tono: 'ambar' }
  return { filtro: 'COMPLETOS', texto: 'Completo', tono: 'verde' }
}

/** Dirección y coordinación: el plan anual que cada docente carga en el sistema (solo consulta). */
export default function PlanesAnuales() {
  const planes = useQuery({ queryKey: ['planes-anuales'], queryFn: () => api('/planes-anuales/') })
  const [filtro, setFiltro] = useState<Filtro>('TODOS')
  const [q, setQ] = useState('')

  const todos: any[] = planes.data ?? []
  const cuenta = (f: Filtro) => todos.filter((p) => estado(p).filtro === f).length
  const filtrados = useMemo(() => {
    const t = q.toLowerCase()
    return todos.filter((p) =>
      (filtro === 'TODOS' || estado(p).filtro === filtro) &&
      (!t || `${p.materia} ${p.seccion} ${p.docente}`.toLowerCase().includes(t)))
  }, [todos, filtro, q])
  const { visibles, paginador } = usePaginacion(filtrados, 30)

  return (
    <div>
      <Encabezado titulo="Planes anuales" detalle="El plan anual que carga cada docente. Tocá una materia para verlo, corregirlo, exportarlo o dejar sugerencias." />
      {planes.isLoading && <Cargando />}
      <ErrorCaja error={planes.error} />

      {planes.data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmentado valor={filtro} onChange={setFiltro} opciones={[
              { valor: 'TODOS', label: 'Todos' },
              { valor: 'SIN_CARGAR', label: `Sin unidades ${cuenta('SIN_CARGAR')}` },
              { valor: 'INCOMPLETOS', label: `Incompletos ${cuenta('INCOMPLETOS')}` },
              { valor: 'COMPLETOS', label: `Completos ${cuenta('COMPLETOS')}` },
            ]} />
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-grafito-500" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar docente, materia o sección…" className="pl-10" />
            </div>
          </div>

          {!filtrados.length ? <Vacio titulo="Nada en esta lista" /> : (
            <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
              {visibles.map((p) => {
                const e = estado(p)
                return (
                  <li key={p.asignacion}>
                    <Link to={`/seguimiento/${p.asignacion}`} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-tinta-50/60 active:bg-tinta-50">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{p.materia} <span className="font-normal text-grafito-500">· {p.docente}</span></p>
                        <p className="truncate text-sm text-grafito-500">{p.seccion}</p>
                        <p className="text-sm text-grafito-500">
                          {p.unidades
                            ? `${p.unidades} ${p.unidades === 1 ? 'unidad' : 'unidades'} · ${p.unidades_completas} con fechas, contenidos y evaluación`
                            : 'Todavía no cargó unidades'}
                        </p>
                      </div>
                      <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
                      <ChevronRight className="size-5 shrink-0 text-grafito-300" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          {paginador}
        </>
      )}

    </div>
  )
}
