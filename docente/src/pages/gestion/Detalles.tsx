import { useQuery } from '@tanstack/react-query'
import { FileText, Pencil, Phone, Plus, Star } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { CrudPage, FormularioCrud, usePaginacion, type CrudConfig } from '../../components/Crud'
import { Boton, Cargando, Encabezado, ErrorCaja, Etiqueta, Tarjeta, Vacio } from '../../components/ui'
import { api } from '../../lib/api'
import { cn, fechaCorta } from '../../lib/utils'
import CambioSeccion from './CambioSeccion'
import { REFERENCIALES } from './referenciales'

const plural = (n: number, palabra: string) => `${n} ${palabra}${n === 1 ? '' : 's'}`

/* ------------------------------ Pestañas -------------------------------- */

export function Pestanias<T extends string>({ valor, opciones, onChange }: {
  valor: T; opciones: { valor: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto border-b border-grafito-200 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1">
        {opciones.map((o) => (
          <button key={o.valor} onClick={() => onChange(o.valor)}
            className={cn('shrink-0 border-b-[3px] px-3 pb-2.5 pt-1 font-bold',
              valor === o.valor ? 'border-tinta-700 text-tinta-700' : 'border-transparent text-grafito-500')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-grafito-500">{label}</dt>
      <dd className="font-bold">{children || '—'}</dd>
    </div>
  )
}

/* ------------------------------ Asistencia ------------------------------ */

export function BarraAsistencia({ porcentaje, minimo }: { porcentaje: number | null; minimo: number }) {
  if (porcentaje == null) return <span className="text-sm text-grafito-500">Sin clases</span>
  const bajo = porcentaje < minimo
  return (
    <div className="flex items-center gap-2">
      <div className="relative hidden h-2 w-24 overflow-hidden rounded-full bg-grafito-100 sm:block">
        <div className={cn('h-full rounded-full', bajo ? 'bg-ausente' : 'bg-presente')} style={{ width: `${porcentaje}%` }} />
        <div className="absolute inset-y-0 w-px bg-grafito" style={{ left: `${minimo}%` }} />
      </div>
      <span className={cn('w-14 text-right font-bold', bajo ? 'text-ausente' : 'text-grafito')}>{porcentaje}%</span>
    </div>
  )
}

/* ------------------------------ Alumno ---------------------------------- */

const CFG_TUTOR_ALUMNO: CrudConfig = {
  titulo: 'Tutores', singular: 'Vínculo', ruta: '/alumnos-tutores/', columnas: [],
  campos: [
    { name: 'tutor', label: 'Tutor', tipo: 'fk', requerido: true,
      fk: { ruta: '/tutores/', label: (o) => `${o.apellidos}, ${o.nombres} (${o.ci})` },
      ayuda: 'Si no está en la lista, cargalo primero en Gestión › Padres y tutores.' },
    { name: 'parentesco', label: 'Parentesco', medio: true },
    { name: 'es_principal', label: 'Contacto', tipo: 'si_no', ayuda: 'Contacto principal', medio: true },
  ],
  inicial: () => ({ parentesco: 'Madre' }),
}

const CFG_DOCUMENTO: CrudConfig = {
  titulo: 'Documentos', singular: 'Documento', ruta: '/documentos-alumno/', columnas: [],
  campos: [
    { name: 'tipo', label: 'Tipo de documento', requerido: true, ayuda: 'Ej.: Certificado de nacimiento, C.I., Certificado de estudios' },
    { name: 'archivo', label: 'Archivo (foto o PDF)', tipo: 'archivo', requerido: true },
  ],
}

export function AlumnoDetalle() {
  const { id } = useParams()
  const [tab, setTab] = useState<'datos' | 'asistencia' | 'familia' | 'documentos' | 'anecdotico' | 'matriculas'>('datos')
  const [form, setForm] = useState<{ cfg: CrudConfig; registro: any | null } | null>(null)
  const alumno = useQuery({ queryKey: ['alumno', id], queryFn: () => api(`/alumnos/${id}/`) })
  const asistencia = useQuery({ queryKey: ['alumno-asistencia', id], queryFn: () => api(`/alumnos/${id}/asistencia/`), enabled: tab === 'asistencia' })
  const anecdoticos = useQuery({ queryKey: ['alumno-anec', id], queryFn: () => api(`/anecdoticos/?alumnos__alumno=${id}&page_size=200`), enabled: tab === 'anecdotico' })
  // El servidor envía el mínimo de la institución junto con la asistencia.
  const minimo: number = asistencia.data?.minimo

  if (alumno.isLoading) return <Cargando />
  if (alumno.error) return <ErrorCaja error={alumno.error} />
  const a = alumno.data

  return (
    <div>
      <Link to="/alumnos" className="mb-3 inline-block text-sm font-bold text-tinta-600">‹ Alumnos</Link>
      <Encabezado
        titulo={`${a.apellidos}, ${a.nombres}`}
        detalle={<>C.I. {a.ci} · {a.seccion_actual ? a.seccion_actual.seccion : 'Sin matrícula este año'}</>}
        acciones={<Boton variante="secundario" onClick={() => setForm({ cfg: REFERENCIALES.alumnos, registro: a })}><Pencil className="size-4" /> Editar</Boton>}
      />
      <Pestanias valor={tab} onChange={setTab} opciones={[
        { valor: 'datos', label: 'Datos' }, { valor: 'asistencia', label: 'Asistencia' },
        { valor: 'familia', label: 'Familia' }, { valor: 'documentos', label: 'Documentos' },
        { valor: 'anecdotico', label: 'Anecdótico' }, { valor: 'matriculas', label: 'Matrículas' },
      ]} />

      {tab === 'datos' && (
        <Tarjeta className="p-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <Dato label="Fecha de nacimiento">{fechaCorta(a.fecha_nacimiento)}</Dato>
            <Dato label="Lugar de nacimiento">{a.lugar_nacimiento}</Dato>
            <Dato label="Sexo">{a.sexo === 'M' ? 'Masculino' : a.sexo === 'F' ? 'Femenino' : ''}</Dato>
            <Dato label="Teléfono">{a.telefono}</Dato>
            <Dato label="Dirección">{a.direccion}</Dato>
            <Dato label="Estado">{a.activo ? 'Activo' : 'Inactivo'}</Dato>
          </dl>
          {a.observaciones && <p className="mt-5 whitespace-pre-line border-t border-grafito-100 pt-4 text-grafito-600">{a.observaciones}</p>}
        </Tarjeta>
      )}

      {tab === 'asistencia' && (asistencia.isLoading ? <Cargando /> : asistencia.data?.clases ? (
        <Tarjeta className="p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-bold">Asistencia del año</p>
            <BarraAsistencia porcentaje={asistencia.data.porcentaje} minimo={minimo} />
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Dato label="Clases">{asistencia.data.clases}</Dato>
            <Dato label="Presentes">{asistencia.data.presentes}</Dato>
            <Dato label="Ausentes"><span className="text-ausente">{asistencia.data.ausentes}</span></Dato>
            <Dato label="Justificadas"><span className="text-justificado">{asistencia.data.justificadas}</span></Dato>
            <Dato label="Llegadas tardías"><span className="text-tarde">{asistencia.data.tardanzas}</span></Dato>
          </dl>
          {asistencia.data.bajo_minimo && (
            <p className="mt-5 rounded-control bg-ausente-50 px-4 py-3 text-ausente">Está por debajo del mínimo de asistencia ({minimo}%).</p>
          )}
        </Tarjeta>
      ) : <Vacio titulo="Sin registros de asistencia este año" />)}

      {tab === 'familia' && (
        <div>
          <div className="mb-3 flex justify-end">
            <Boton onClick={() => setForm({ cfg: CFG_TUTOR_ALUMNO, registro: null })}><Plus className="size-5" /> Vincular tutor</Boton>
          </div>
          {!a.tutores.length ? <Vacio titulo="Sin tutores vinculados" texto="Vinculá al menos un contacto para avisos y autorizaciones." /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {a.tutores.map((t: any) => (
                <Tarjeta key={t.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-bold">{t.tutor_nombre} {t.es_principal && <Star className="size-4 fill-tarde text-tarde" />}</p>
                    <p className="text-sm text-grafito-500">{t.parentesco}</p>
                  </div>
                  {t.tutor_telefono && (
                    <a href={`https://wa.me/595${t.tutor_telefono.replace(/\D/g, '').replace(/^0/, '')}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-full bg-presente-50 px-3 py-1.5 text-sm font-bold text-presente">
                      <Phone className="size-4" /> {t.tutor_telefono}
                    </a>
                  )}
                  <button onClick={() => setForm({ cfg: CFG_TUTOR_ALUMNO, registro: t })} className="rounded-lg p-2 text-grafito-500 hover:bg-grafito-100" aria-label="Editar">
                    <Pencil className="size-4" />
                  </button>
                </Tarjeta>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'documentos' && (
        <div>
          <div className="mb-3 flex justify-end">
            <Boton onClick={() => setForm({ cfg: CFG_DOCUMENTO, registro: null })}><Plus className="size-5" /> Subir documento</Boton>
          </div>
          {!a.documentos.length ? <Vacio titulo="Legajo sin documentos" texto="Subí fotos o PDF de los documentos del alumno." /> : (
            <ul className="divide-y divide-grafito-100 rounded-xl border border-grafito-200 bg-white">
              {a.documentos.map((d: any) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-5 text-tinta-600" />
                  <a href={d.archivo} target="_blank" rel="noreferrer" className="flex-1 font-bold text-tinta-700 underline-offset-2 hover:underline">{d.tipo}</a>
                  <span className="text-sm text-grafito-500">{fechaCorta(d.subido)}</span>
                  <button onClick={() => setForm({ cfg: CFG_DOCUMENTO, registro: d })} className="rounded-lg p-2 text-grafito-500 hover:bg-grafito-100" aria-label="Editar"><Pencil className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'anecdotico' && (anecdoticos.isLoading ? <Cargando /> : (
        anecdoticos.data?.results?.length ? <ListaAnecdoticos registros={anecdoticos.data.results} /> : <Vacio titulo="Sin registros anecdóticos" />
      ))}

      {tab === 'matriculas' && <CambioSeccion alumno={Number(id)} />}
      {tab === 'matriculas' && (
        <CrudPage embebido config={{ ...REFERENCIALES.matriculas, titulo: 'Historial de matrículas', enlace: undefined }} filtro={`alumno=${id}`} fijos={{ alumno: Number(id) }} />
      )}

      <FormularioCrud config={form?.cfg ?? CFG_DOCUMENTO} abierto={!!form} registro={form?.registro ?? null}
        fijos={form?.cfg === REFERENCIALES.alumnos ? undefined : { alumno: Number(id) }} onCerrar={() => setForm(null)} />
    </div>
  )
}

export function ListaAnecdoticos({ registros, onTocar }: { registros: any[]; onTocar?: (r: any) => void }) {
  const tono = { POSITIVO: 'verde', NEGATIVO: 'rojo', NEUTRO: 'gris' } as const
  const texto = { POSITIVO: 'Positivo', NEGATIVO: 'Negativo', NEUTRO: 'Informativo' } as const
  const { visibles, paginador } = usePaginacion(registros, 15)
  return (
    <>
    <ul className="space-y-3">
      {visibles.map((r) => (
        <li key={r.id}>
          <Tarjeta className={cn('p-4', onTocar && 'cursor-pointer active:bg-tinta-50')} onClick={() => onTocar?.(r)}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Etiqueta tono={tono[r.tipo as keyof typeof tono]}>{texto[r.tipo as keyof typeof texto]}</Etiqueta>
              <span className="text-sm font-bold text-grafito-500">{fechaCorta(r.fecha)}{r.hora && ` · ${r.hora.slice(0, 5)}`}</span>
              {r.informado_a_tutor && <span className="text-sm text-presente">Tutor informado</span>}
            </div>
            <p className="font-bold">{r.alumnos_nombres.join(', ')}</p>
            <p className="mt-1 whitespace-pre-line text-grafito-600">{r.hecho}</p>
            {r.acciones && <p className="mt-2 text-sm text-grafito-500"><b>Acciones:</b> {r.acciones}</p>}
            <p className="mt-2 text-xs text-grafito-500">{r.asignacion_descripcion} · registró {r.registrado_por_nombre}</p>
          </Tarjeta>
        </li>
      ))}
    </ul>
    {paginador}
    </>
  )
}

/* ------------------------------ Sección --------------------------------- */

export function SeccionDetalle() {
  const { id } = useParams()
  const [tab, setTab] = useState<'alumnos' | 'materias' | 'asistencia'>('alumnos')
  const [editar, setEditar] = useState(false)
  const seccion = useQuery({ queryKey: ['seccion', id], queryFn: () => api(`/secciones/${id}/`) })
  const asistencia = useQuery({ queryKey: ['seccion-asistencia', id], queryFn: () => api(`/secciones/${id}/asistencia/`), enabled: tab === 'asistencia' })

  if (seccion.isLoading) return <Cargando />
  if (seccion.error) return <ErrorCaja error={seccion.error} />
  const s = seccion.data

  return (
    <div>
      <Link to="/ref/secciones" className="mb-3 inline-block text-sm font-bold text-tinta-600">‹ Secciones</Link>
      <Encabezado titulo={s.descripcion} detalle={`${s.inscriptos} inscriptos de ${s.cupo} lugares`}
        acciones={<Boton variante="secundario" onClick={() => setEditar(true)}><Pencil className="size-4" /> Editar</Boton>} />
      <Pestanias valor={tab} onChange={setTab} opciones={[
        { valor: 'alumnos', label: 'Alumnos' }, { valor: 'materias', label: 'Materias y docentes' }, { valor: 'asistencia', label: 'Asistencia' },
      ]} />

      {tab === 'alumnos' && (
        <CrudPage embebido filtro={`seccion=${id}`} fijos={{ seccion: Number(id) }}
          config={{ ...REFERENCIALES.matriculas, titulo: 'Alumnos matriculados',
            ordenar: (x, y) => (x.numero_lista ?? 999) - (y.numero_lista ?? 999) || x.alumno_nombre.localeCompare(y.alumno_nombre) }} />
      )}
      {tab === 'materias' && (
        <CrudPage embebido filtro={`seccion=${id}`} fijos={{ seccion: Number(id) }}
          config={{ ...REFERENCIALES.asignaciones, titulo: 'Materias y docentes' }} />
      )}
      {tab === 'asistencia' && (asistencia.isLoading ? <Cargando /> : !asistencia.data?.alumnos?.length ? <Vacio titulo="Sin alumnos" /> : (
        <div className="overflow-hidden rounded-xl border border-grafito-200 bg-white">
          <ul className="divide-y divide-grafito-100">
            {asistencia.data.alumnos.map((f: any) => (
              <li key={f.matricula} className={cn('flex items-center gap-3 px-4 py-3', f.bajo_minimo && 'bg-ausente-50/50')}>
                <span className="w-6 shrink-0 text-right text-sm text-grafito-500">{f.numero_lista}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{f.alumno}</p>
                  <p className="text-sm text-grafito-500">{plural(f.ausentes, 'ausencia')} · {plural(f.justificadas, 'justificada')} · {plural(f.tardanzas, 'tarde')}</p>
                </div>
                <BarraAsistencia porcentaje={f.porcentaje} minimo={asistencia.data.minimo} />
              </li>
            ))}
          </ul>
          <p className="border-t border-grafito-100 px-4 py-2 text-sm text-grafito-500">La línea vertical marca el mínimo exigido ({asistencia.data.minimo}%).</p>
        </div>
      ))}

      <FormularioCrud config={REFERENCIALES.secciones} abierto={editar} registro={s} onCerrar={() => setEditar(false)} />
    </div>
  )
}

/* ------------------------------ Curso (plan de estudios) ---------------- */

export function CursoDetalle() {
  const { id } = useParams()
  const curso = useQuery({ queryKey: ['curso', id], queryFn: () => api(`/cursos/${id}/`) })
  if (curso.isLoading) return <Cargando />
  return (
    <div>
      <Link to="/ref/cursos" className="mb-3 inline-block text-sm font-bold text-tinta-600">‹ Cursos</Link>
      <Encabezado titulo={curso.data?.descripcion} detalle="Materias del plan de estudios y carga horaria semanal." />
      <CrudPage embebido filtro={`curso=${id}`} fijos={{ curso: Number(id) }} config={REFERENCIALES.plan} />
    </div>
  )
}
