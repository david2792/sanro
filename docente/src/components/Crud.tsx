import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Pencil, Plus, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { api, ApiError, cuerpoConArchivos, lista, mensajeDeError } from '../lib/api'
import { cn, DIAS_SEMANA, horarioListo } from '../lib/utils'
import { EditorHorario } from './EditorHorario'
import { Boton, Campo, Cargando, Casilla, Confirmar, Encabezado, ErrorCaja, Hoja, Input, InputMonto, Select, Textarea, useAviso, Vacio } from './ui'

export type CampoDef = {
  name: string
  label: string
  tipo?: 'texto' | 'numero' | 'monto' | 'fecha' | 'hora' | 'area' | 'select' | 'fk' | 'fk_multiple' | 'dias' | 'horario' | 'si_no' | 'archivo' | 'password' | 'email' | 'tel'
  opciones?: { valor: string; label: string }[]
  fk?: { ruta: string; label: (o: any) => string }
  requerido?: boolean
  ayuda?: string
  medio?: boolean
  /** Si se define, el campo se muestra solo cuando devuelve true. */
  visible?: (valores: Record<string, any>) => boolean
}

export type ColDef = { label: string; valor: (o: any) => ReactNode; principal?: boolean; oculto_movil?: boolean }

export type CrudConfig = {
  titulo: string
  singular: string
  ruta: string
  descripcion?: string
  columnas: ColDef[]
  campos: CampoDef[]
  inicial?: () => Record<string, any>
  enlace?: (o: any) => string
  buscar?: (o: any) => string
  ordenar?: (a: any, b: any) => number
  soloLectura?: boolean
  /** Sin botón Eliminar (registros que se desactivan o anulan en vez de borrarse). */
  sinBorrar?: boolean
  /** Para concordar: "Nueva materia", "Materia creada". */
  femenino?: boolean
}

/* ---------------------------- Opciones de FK ---------------------------- */

export function useOpciones(ruta?: string) {
  return useQuery({ queryKey: ['opciones', ruta], queryFn: () => lista(ruta!), enabled: !!ruta, staleTime: 60_000 })
}

function CampoFK({ def, valor, onChange }: { def: CampoDef; valor: any; onChange: (v: any) => void }) {
  const { data = [], isLoading } = useOpciones(def.fk!.ruta)
  if (def.tipo === 'fk_multiple') {
    const sel: number[] = valor ?? []
    return (
      <div className="max-h-56 overflow-y-auto rounded-control border border-grafito-200 px-3">
        {isLoading && <p className="py-2 text-grafito-500">Cargando…</p>}
        {data.map((o: any) => (
          <Casilla key={o.id} checked={sel.includes(o.id)}
            onChange={(c) => onChange(c ? [...sel, o.id] : sel.filter((x) => x !== o.id))}>
            {def.fk!.label(o)}
          </Casilla>
        ))}
      </div>
    )
  }
  return (
    <>
      <Select value={valor ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} required={def.requerido}>
        <option value="">{isLoading ? 'Cargando…' : 'Seleccionar…'}</option>
        {data.map((o: any) => <option key={o.id} value={o.id}>{def.fk!.label(o)}</option>)}
      </Select>
      {!isLoading && !data.length && (
        <span className="mt-1 block text-sm font-bold text-tarde">
          No hay opciones para «{def.label}». Cargalas primero en Gestión.
        </span>
      )}
    </>
  )
}

export function ControlCampo({ def, valor, onChange, valores, onCambios }: {
  def: CampoDef; valor: any; onChange: (v: any) => void
  /** Todos los valores del formulario y cómo cambiar varios a la vez (para 'horario', que también toca dias_clase). */
  valores?: Record<string, any>; onCambios?: (cambios: Record<string, any>) => void
}) {
  switch (def.tipo) {
    case 'horario':
      return <EditorHorario dias={valores?.dias_clase ?? []} horario={valor ?? []}
        onChange={(dias_clase, horario) => onCambios?.({ dias_clase, horario })} />
    case 'area':
      return <Textarea value={valor ?? ''} onChange={(e) => onChange(e.target.value)} required={def.requerido} />
    case 'select':
      return (
        <Select value={valor ?? ''} onChange={(e) => onChange(e.target.value)} required={def.requerido}>
          {!def.requerido && <option value="">—</option>}
          {def.opciones!.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
        </Select>
      )
    case 'monto':
      return <InputMonto valor={valor} onChange={onChange} required={def.requerido} />
    case 'fk':
    case 'fk_multiple':
      return <CampoFK def={def} valor={valor} onChange={onChange} />
    case 'dias': {
      const sel: number[] = valor ?? []
      return (
        <div className="flex flex-wrap gap-2">
          {DIAS_SEMANA.map((d) => {
            const on = sel.includes(d.n)
            return (
              <button key={d.n} type="button" aria-pressed={on}
                onClick={() => onChange(on ? sel.filter((x) => x !== d.n) : [...sel, d.n].sort())}
                className={cn('h-11 min-w-14 rounded-control border px-3 font-bold',
                  on ? 'border-tinta-700 bg-tinta-700 text-white' : 'border-grafito-200 bg-white text-grafito-600')}>
                {d.corto}
              </button>
            )
          })}
        </div>
      )
    }
    case 'si_no':
      return <Casilla checked={!!valor} onChange={onChange}>{def.ayuda ?? 'Sí'}</Casilla>
    case 'archivo':
      return (
        <div>
          {typeof valor === 'string' && valor && (
            <a href={valor} target="_blank" rel="noreferrer" className="mb-2 block truncate text-tinta-600 underline">Ver archivo actual</a>
          )}
          <input type="file" accept="image/*,application/pdf" onChange={(e) => onChange(e.target.files?.[0] ?? valor)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-tinta-50 file:px-4 file:py-2.5 file:font-bold file:text-tinta-700" />
        </div>
      )
    default: {
      const tipos: Record<string, string> = { numero: 'number', fecha: 'date', hora: 'time', password: 'password', email: 'email', tel: 'tel' }
      const tipo = tipos[def.tipo ?? ''] ?? 'text'
      return (
        <Input type={tipo} value={valor ?? ''} required={def.requerido}
          inputMode={def.tipo === 'numero' ? 'decimal' : def.tipo === 'tel' ? 'tel' : undefined}
          onChange={(e) => onChange(def.tipo === 'numero' ? (e.target.value === '' ? null : e.target.value) : e.target.value)} />
      )
    }
  }
}

/* ---------------------------- Formulario -------------------------------- */

export function FormularioCrud({ config, abierto, registro, fijos, onCerrar, onGuardado }: {
  config: CrudConfig
  abierto: boolean
  registro: any | null
  fijos?: Record<string, any>
  onCerrar: () => void
  onGuardado?: (r: any) => void
}) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const [valores, setValores] = useState<Record<string, any>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [borrar, setBorrar] = useState(false)
  const [abiertoPrevio, setAbiertoPrevio] = useState(false)

  // Reinicia el formulario cada vez que se abre.
  if (abierto !== abiertoPrevio) {
    setAbiertoPrevio(abierto)
    if (abierto) {
      setValores(registro ? { ...registro } : { ...(config.inicial?.() ?? {}), ...fijos })
      setErrores({})
      setErrorGeneral('')
    }
  }

  const campos = config.campos.filter((c) => !(fijos && c.name in fijos) && (!c.visible || c.visible(valores)))

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setErrores({})
    setErrorGeneral('')
    try {
      const datos: Record<string, any> = { ...fijos }
      for (const c of config.campos) {
        if (!(c.name in valores)) continue
        let v = valores[c.name]
        if (c.tipo === 'horario') {
          const r = horarioListo(v ?? [])
          if (r.error) {
            setErrores({ [c.name]: r.error })
            return
          }
          v = r.horario
        }
        if (c.tipo === 'archivo' && !(v instanceof File)) continue
        if (c.tipo === 'password' && !v) continue
        datos[c.name] = v === '' && (c.tipo === 'fecha' || c.tipo === 'hora' || c.tipo === 'numero') ? null : v
      }
      const r = registro
        ? await api(`${config.ruta}${registro.id}/`, { method: 'PATCH', body: cuerpoConArchivos(datos) })
        : await api(config.ruta, { method: 'POST', body: cuerpoConArchivos(datos) })
      await qc.invalidateQueries()
      avisar(`${config.singular} ${registro ? (config.femenino ? 'actualizada' : 'actualizado') : config.femenino ? 'creada' : 'creado'}`)
      onGuardado?.(r)
      onCerrar()
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object' && !Array.isArray(err.data)) {
        const porCampo: Record<string, string> = {}
        const resto: string[] = []
        for (const [k, v] of Object.entries(err.data)) {
          if (campos.some((c) => c.name === k)) porCampo[k] = mensajeDeError(v)
          else resto.push(mensajeDeError(v))
        }
        setErrores(porCampo)
        setErrorGeneral(resto.join(' '))
      } else setErrorGeneral(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    setGuardando(true)
    try {
      await api(`${config.ruta}${registro.id}/`, { method: 'DELETE' })
      await qc.invalidateQueries()
      avisar(`${config.singular} ${config.femenino ? 'eliminada' : 'eliminado'}`)
      setBorrar(false)
      onCerrar()
    } catch (err) {
      setBorrar(false)
      setErrorGeneral(err instanceof Error ? err.message : 'No se pudo eliminar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Hoja abierta={abierto} onCerrar={onCerrar} titulo={registro ? `Editar ${config.singular.toLowerCase()}` : `${config.femenino ? 'Nueva' : 'Nuevo'} ${config.singular.toLowerCase()}`}
        pie={<>
          {registro && !config.soloLectura && !config.sinBorrar && <Boton type="button" variante="secundario" className="text-ausente" onClick={() => setBorrar(true)}>Eliminar</Boton>}
          <Boton type="submit" form="form-crud" className="flex-1" cargando={guardando}>Guardar</Boton>
        </>}>
        <form id="form-crud" onSubmit={guardar} className="grid grid-cols-2 gap-x-3 gap-y-4">
          {campos.map((c) => (
            <Campo key={c.name} label={c.label + (c.requerido ? '' : '')} ayuda={c.tipo === 'si_no' ? undefined : c.ayuda} error={errores[c.name]}
              className={c.medio ? 'col-span-1' : 'col-span-2'}>
              <ControlCampo def={c} valor={valores[c.name]} onChange={(v) => setValores((s) => ({ ...s, [c.name]: v }))}
                valores={valores} onCambios={(cambios) => setValores((s) => ({ ...s, ...cambios }))} />
            </Campo>
          ))}
          {errorGeneral && <div className="col-span-2"><ErrorCaja error={errorGeneral} /></div>}
        </form>
      </Hoja>
      <Confirmar abierta={borrar} titulo={`Eliminar ${config.singular.toLowerCase()}`} cargando={guardando}
        texto="Esta acción no se puede deshacer. Si el registro ya se usa en otros datos, el sistema no lo va a permitir."
        onConfirmar={eliminar} onCerrar={() => setBorrar(false)} />
    </>
  )
}

/* ---------------------------- Página de listado ------------------------- */

export function CrudPage({ config, filtro = '', fijos, embebido }: {
  config: CrudConfig
  /** Query string extra, ej. "seccion=3" */
  filtro?: string
  /** Valores fijos para los registros nuevos (y campos ocultos), ej. {seccion: 3} */
  fijos?: Record<string, any>
  embebido?: boolean
}) {
  const navegar = useNavigate()
  const [q, setQ] = useState('')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(15)
  const [editando, setEditando] = useState<any | null>(null)
  const [abierto, setAbierto] = useState(false)
  const ruta = config.ruta + (filtro ? `?${filtro}` : '')
  const { data, isLoading, error } = useQuery({ queryKey: ['lista', ruta], queryFn: () => lista(ruta) })

  const filas = useMemo(() => {
    let r = data ?? []
    if (config.ordenar) r = [...r].sort(config.ordenar)
    if (!q.trim()) return r
    const t = q.toLowerCase()
    return r.filter((o) => (config.buscar?.(o) ?? config.columnas.map((c) => String(c.valor(o) ?? '')).join(' ')).toLowerCase().includes(t))
  }, [data, q, config])

  const paginas = Math.max(1, Math.ceil(filas.length / porPagina))
  const actual = Math.min(pagina, paginas)
  const visibles = filas.slice((actual - 1) * porPagina, actual * porPagina)

  const abrir = (o: any | null) => {
    setEditando(o)
    setAbierto(true)
  }
  const tocar = (o: any) => (config.enlace ? navegar(config.enlace(o)) : !config.soloLectura && abrir(o))
  const principal = config.columnas.find((c) => c.principal) ?? config.columnas[0]
  const resto = config.columnas.filter((c) => c !== principal)

  const botonNuevo = !config.soloLectura && (
    <Boton onClick={() => abrir(null)}><Plus className="size-5" /> {embebido ? 'Agregar' : `${config.femenino ? 'Nueva' : 'Nuevo'} ${config.singular.toLowerCase()}`}</Boton>
  )

  return (
    <div>
      {embebido ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{config.titulo}</h2>
          {botonNuevo}
        </div>
      ) : (
        <Encabezado titulo={config.titulo} detalle={config.descripcion} acciones={botonNuevo} />
      )}

      {(data?.length ?? 0) > 8 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-grafito-500" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1) }} placeholder="Buscar…" className="pl-10" aria-label="Buscar" />
        </div>
      )}

      {isLoading && <Cargando />}
      <ErrorCaja error={error} />
      {data && !filas.length && (
        <Vacio titulo={q ? 'Sin resultados' : `Todavía no hay ${config.titulo.toLowerCase()}`}
          texto={q ? 'Probá con otra palabra.' : undefined} accion={!q && botonNuevo} />
      )}

      {!!filas.length && (
        <>
          {/* Celular: lista */}
          <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white md:hidden">
            {visibles.map((o) => (
              <li key={o.id}>
                <button onClick={() => tocar(o)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-tinta-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{principal.valor(o)}</p>
                    <p className="truncate text-sm text-grafito-500">
                      {resto.filter((c) => !c.oculto_movil).map((c) => c.valor(o)).filter((v) => v !== '' && v != null).map((v, i) => (
                        <span key={i}>{i > 0 && ' · '}{v}</span>
                      ))}
                    </p>
                  </div>
                  {config.enlace ? <ChevronRight className="size-5 text-grafito-300" /> : !config.soloLectura && <Pencil className="size-4 text-grafito-300" />}
                </button>
              </li>
            ))}
          </ul>

          {/* Pantalla grande: tabla */}
          <div className="hidden overflow-hidden rounded-xl border border-grafito-200 bg-white md:block">
            <table className="w-full text-left">
              <thead className="border-b border-grafito-200 bg-grafito-100/60 text-sm text-grafito-600">
                <tr>
                  {config.columnas.map((c) => <th key={c.label} className="px-4 py-2.5 font-bold">{c.label}</th>)}
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-grafito-100">
                {visibles.map((o) => (
                  <tr key={o.id} onClick={() => tocar(o)} className={cn('cursor-pointer hover:bg-tinta-50/60')}>
                    {config.columnas.map((c) => (
                      <td key={c.label} className={cn('px-4 py-3', c === principal && 'font-bold')}>{c.valor(o)}</td>
                    ))}
                    <td className="pr-3 text-right">
                      {config.enlace && !config.soloLectura ? (
                        <button onClick={(e) => { e.stopPropagation(); abrir(o) }} className="rounded-lg p-2 text-grafito-500 hover:bg-white" aria-label="Editar">
                          <Pencil className="size-4" />
                        </button>
                      ) : config.enlace ? <ChevronRight className="size-5 text-grafito-300" /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginador total={filas.length} pagina={actual} paginas={paginas} porPagina={porPagina}
            onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(1) }} />
        </>
      )}

      <FormularioCrud config={config} abierto={abierto} registro={editando} fijos={fijos} onCerrar={() => setAbierto(false)} />
    </div>
  )
}

/* ---------------------------- Paginación -------------------------------- */

export function Paginador({ total, pagina, paginas, porPagina, onPagina, onPorPagina }: {
  total: number; pagina: number; paginas: number; porPagina: number
  onPagina: (p: number) => void; onPorPagina: (n: number) => void
}) {
  const desde = total ? (pagina - 1) * porPagina + 1 : 0
  const hasta = Math.min(pagina * porPagina, total)
  const boton = 'grid size-10 place-items-center rounded-control border border-grafito-200 bg-white text-grafito-600 hover:bg-tinta-50 disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-grafito-500">
      <div className="flex items-center gap-2">
        <span>{desde}–{hasta} de {total}</span>
        <select value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))} aria-label="Registros por página"
          className="h-9 rounded-control border border-grafito-200 bg-white px-2 text-grafito">
          {[15, 30, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
        </select>
      </div>
      {paginas > 1 && (
        <div className="flex items-center gap-2">
          <button className={boton} onClick={() => onPagina(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior">
            <ChevronLeft className="size-5" />
          </button>
          <span className="min-w-20 text-center font-bold text-grafito">Página {pagina} de {paginas}</span>
          <button className={boton} onClick={() => onPagina(pagina + 1)} disabled={pagina >= paginas} aria-label="Página siguiente">
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  )
}

/** Paginación en memoria para cualquier lista. */
export function usePaginacion<T>(items: T[], inicial = 15) {
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(inicial)
  const paginas = Math.max(1, Math.ceil(items.length / porPagina))
  const actual = Math.min(pagina, paginas)
  return {
    visibles: items.slice((actual - 1) * porPagina, actual * porPagina),
    paginador: items.length > Math.min(porPagina, 15) ? (
      <Paginador total={items.length} pagina={actual} paginas={paginas} porPagina={porPagina}
        onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(1) }} />
    ) : null,
  }
}
