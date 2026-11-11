import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Cargando, Encabezado, ErrorCaja, Input, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { guaranies } from '../../lib/utils'
import { AportesNav } from './comun'

/** Búsqueda rápida del alumno (por nombre o C.I.) y acceso a cada sección. */
export default function Cobrar() {
  const [q, setQ] = useState('')
  const matriculas = useQuery({ queryKey: ['aportes-matriculas'], queryFn: () => api<any[]>('/aportes/matriculas/') })
  const secciones = useQuery({ queryKey: ['aportes-secciones'], queryFn: () => api('/aportes/secciones/') })

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return (matriculas.data ?? []).filter((m) => `${m.alumno} ${m.ci}`.toLowerCase().includes(t)).slice(0, 20)
  }, [q, matriculas.data])

  return (
    <div>
      <Encabezado titulo="Cobrar aportes" detalle="Buscá al alumno o entrá a su sección." />
      <AportesNav />

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-grafito-500" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, apellido o C.I. del alumno" className="pl-10" autoFocus aria-label="Buscar alumno" />
      </div>
      <ErrorCaja error={matriculas.error} />
      {q.trim().length >= 2 && (
        <ul className="mb-8 divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white">
          {!resultados.length && <li className="px-4 py-3 text-grafito-500">Sin resultados.</li>}
          {resultados.map((m) => (
            <li key={m.id}>
              <Link to={`/aportes/secciones/${m.seccion_id}?m=${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-tinta-50/60 active:bg-tinta-50">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{m.alumno}</p>
                  <p className="text-sm text-grafito-500">C.I. {m.ci} · {m.seccion}</p>
                </div>
                <ChevronRight className="size-5 text-grafito-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 mt-6 text-sm font-bold text-grafito-500">Secciones</h2>
      {secciones.isLoading && <Cargando />}
      <ErrorCaja error={secciones.error} />
      {secciones.data && !secciones.data.secciones.length && <Vacio titulo="No hay secciones en el año activo" />}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {secciones.data?.secciones.map((s: any) => (
          <li key={s.id}>
            <Link to={`/aportes/secciones/${s.id}`} className="flex items-center gap-3 rounded-xl border border-grafito-200 bg-white px-4 py-3 hover:bg-tinta-50/60">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{s.seccion}</p>
                <p className="text-sm text-grafito-500">
                  {s.alumnos} alumnos · {s.completos} pagaron todo
                  {s.saldo > 0 && <span className={s.deuda > 0 ? 'font-bold text-ausente' : undefined}> · saldo {guaranies(s.saldo)}</span>}
                </p>
              </div>
              <ChevronRight className="size-5 text-grafito-300" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
