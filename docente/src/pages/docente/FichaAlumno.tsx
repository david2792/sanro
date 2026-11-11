import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Phone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Cargando, ErrorCaja, Etiqueta, Hoja, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cn, fechaCorta, whatsappUrl } from '../../lib/utils'
import { ListaAnecdoticos } from '../gestion/Detalles'

const num = (v: any) => (v == null ? '' : String(Number(v)))

function edad(iso?: string | null) {
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number)
  const hoy = new Date()
  return hoy.getFullYear() - a - (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d) ? 1 : 0)
}

/** Ficha rápida de un alumno dentro de una clase: asistencia, trabajos, anecdótico y familia. */
export function FichaAlumno({ asignacion, matricula, onCerrar }: { asignacion: number; matricula: number; onCerrar: () => void }) {
  const { esGestion } = useAuth()
  const ficha = useQuery({
    queryKey: ['ficha', asignacion, matricula],
    queryFn: () => api(`/ficha/?asignacion=${asignacion}&matricula=${matricula}`, { cache: true }),
  })
  const f = ficha.data

  return (
    <Hoja abierta titulo={f?.alumno.nombre ?? 'Alumno'} onCerrar={onCerrar}>
      {ficha.isLoading && <Cargando />}
      <ErrorCaja error={ficha.error} />
      {f && (
        <div className="space-y-6">
          <div>
            <p className="text-grafito-500">
              {f.numero_lista && `N° ${f.numero_lista} · `}C.I. {f.alumno.ci}
              {edad(f.alumno.fecha_nacimiento) != null && ` · ${edad(f.alumno.fecha_nacimiento)} años`}
              {f.estado !== 'Activa' && <> · <Etiqueta tono="ambar">{f.estado}</Etiqueta></>}
            </p>
            {f.alumno.observaciones && <p className="mt-2 rounded-control bg-tarde-50 px-3 py-2 text-tarde">{f.alumno.observaciones}</p>}
          </div>

          <Bloque titulo="Asistencia">
            <div className="grid grid-cols-2 gap-2">
              <Dato titulo={`En ${f.clase.materia}`} valor={f.asistencia.materia.porcentaje} minimo={f.minimos.asistencia}
                detalle={`${f.asistencia.materia.clases} clases`} />
              <Dato titulo="Todas las materias" valor={f.asistencia.general.porcentaje} minimo={f.minimos.asistencia}
                detalle={`${f.asistencia.general.clases} clases`} />
            </div>
            <p className="mt-2 text-sm text-grafito-600">
              En la materia: {f.asistencia.materia.ausentes} ausencias · {f.asistencia.materia.tardanzas} tardanzas · {f.asistencia.materia.justificadas} justificadas
            </p>
            {f.asistencia.ultimas_faltas.length > 0 && (
              <p className="mt-1 text-sm text-grafito-500">
                Últimas faltas: {f.asistencia.ultimas_faltas.map((x: any) => `${fechaCorta(x.fecha).slice(0, 5)}${x.estado === 'J' ? ' (J)' : ''}`).join(', ')}
              </p>
            )}
          </Bloque>

          <Bloque titulo="Trabajos y logro">
            {f.etapas.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {f.etapas.map((e: any) => (
                  <Dato key={e.etapa} titulo={e.etapa} valor={e.porcentaje} minimo={f.minimos.logro}
                    detalle={`${num(e.logrado)} de ${num(e.total_posible)} pts`} />
                ))}
              </div>
            )}
            {f.trabajos.length ? (
              <ul className="divide-y divide-grafito-100 rounded-xl border border-grafito-200">
                {f.trabajos.map((t: any) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{t.titulo}</span>
                      <span className="text-sm text-grafito-500">{fechaCorta(t.fecha)} · {t.etapa}ª etapa</span>
                    </span>
                    {t.entrega_tardia && <Etiqueta tono="ambar">Tarde</Etiqueta>}
                    {t.recuperatorio != null && <Etiqueta tono="azul">Recup. {num(t.recuperatorio)}</Etiqueta>}
                    {t.pendiente ? <Etiqueta tono="rojo">Debe</Etiqueta> : (
                      <span className="shrink-0 font-bold tabular-nums">{t.efectivo == null ? '—' : num(t.efectivo)}<span className="text-sm font-normal text-grafito-500"> / {num(t.puntaje_total)}</span></span>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="text-grafito-500">Todavía no hay trabajos en esta materia.</p>}
          </Bloque>

          <Bloque titulo="Familia">
            <Familia f={f} />
          </Bloque>

          <Bloque titulo="Registro anecdótico">
            {f.anecdoticos.length ? <ListaAnecdoticos registros={f.anecdoticos.slice(0, 5)} /> : <p className="text-grafito-500">Sin registros.</p>}
          </Bloque>

          {esGestion && (
            <Link to={`/alumnos/${f.alumno.id}`} className="block text-center font-bold text-tinta-600">Ver legajo completo</Link>
          )}
        </div>
      )}
    </Hoja>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-grafito-500">{titulo}</h3>
      {children}
    </section>
  )
}

/** Porcentaje grande, en rojo si está debajo del mínimo. */
function Dato({ titulo, valor, minimo, detalle }: { titulo: string; valor: number | null; minimo: number; detalle: string }) {
  const bajo = valor != null && valor < minimo
  return (
    <div className={cn('rounded-xl border px-3 py-2', bajo ? 'border-ausente/30 bg-ausente-50' : 'border-grafito-200 bg-white')}>
      <p className="truncate text-sm text-grafito-500">{titulo}</p>
      <p className={cn('text-2xl font-bold tabular-nums', bajo ? 'text-ausente' : 'text-tinta-700')}>{valor == null ? '—' : `${valor}%`}</p>
      <p className="text-xs text-grafito-500">{detalle}{bajo && ` · mínimo ${minimo}%`}</p>
    </div>
  )
}

/** Contactos de la familia y mensaje de WhatsApp listo para enviar (se puede editar). */
function Familia({ f }: { f: any }) {
  const nombre = f.alumno.nombres
  const saludo = `Buenos días. Le saluda ${f.clase.docente}, docente de ${f.clase.materia}. Le escribo por ${nombre}`
  const a = f.asistencia.materia
  const ultima = f.asistencia.ultimas_faltas[0]?.fecha
  const pendientes = f.trabajos.filter((t: any) => t.pendiente)
  const plantillas = [
    { label: 'Saludo', texto: `${saludo}.` },
    { label: 'Ausencias', texto: `${saludo}: registra ${a.ausentes} ${a.ausentes === 1 ? 'ausencia' : 'ausencias'} en la materia${ultima ? `, la última el ${fechaCorta(ultima)}` : ''}. Quedo a disposición por cualquier consulta.` },
    ...(pendientes.length ? [{
      label: 'Trabajos pendientes',
      texto: `${saludo}: tiene ${pendientes.length === 1 ? 'pendiente el trabajo' : 'pendientes los trabajos'} ${pendientes.map((t: any) => `"${t.titulo}"`).join(', ')}. Agradezco su acompañamiento para que se ponga al día.`,
    }] : []),
    { label: 'Felicitación', texto: `${saludo}: quiero compartirle que tiene un muy buen desempeño en la materia. ¡Felicitaciones!` },
  ]
  const [elegida, setElegida] = useState(0)
  const [texto, setTexto] = useState(plantillas[0].texto)

  if (!f.tutores.length) {
    return <p className="text-grafito-500">No hay padre, madre o tutor cargado. Secretaría puede cargarlo en el legajo del alumno.</p>
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {plantillas.map((p, i) => (
          <button key={p.label} type="button" onClick={() => { setElegida(i); setTexto(p.texto) }}
            className={cn('rounded-full border px-3 py-1 text-sm font-bold',
              i === elegida ? 'border-tinta-700 bg-tinta-700 text-white' : 'border-grafito-200 bg-white text-grafito-600')}>
            {p.label}
          </button>
        ))}
      </div>
      <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Mensaje para la familia" />
      <ul className="divide-y divide-grafito-100 rounded-xl border border-grafito-200">
        {f.tutores.map((t: any) => {
          const wa = whatsappUrl(t.telefono, texto)
          return (
            <li key={t.nombre} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{t.nombre}</span>
                <span className="text-sm text-grafito-500">{t.parentesco}{t.principal && ' · principal'}{t.telefono ? ` · ${t.telefono}` : ' · sin teléfono'}</span>
              </span>
              {t.telefono && (
                <a href={`tel:${t.telefono.replace(/[^\d+]/g, '')}`} aria-label={`Llamar a ${t.nombre}`}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-grafito-100 text-grafito-600 active:bg-grafito-200">
                  <Phone className="size-5" />
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer"
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control bg-[#1f8f4e] px-3 font-bold text-white active:brightness-95">
                  <MessageCircle className="size-5" /> WhatsApp
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
