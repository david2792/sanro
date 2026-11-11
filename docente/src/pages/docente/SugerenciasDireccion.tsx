import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, MessageSquarePlus, MessageSquareText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Boton, Campo, Hoja, Select, Textarea, useAviso } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cn, fechaCorta, fechaHora } from '../../lib/utils'

export type Sugerencia = {
  id: number; asignacion: number; materia: string; seccion: string
  sobre: 'PLAN_ANUAL' | 'CLASE'; unidad: number | null; unidad_titulo: string | null
  registro_clase: number | null; fecha_clase: string | null
  texto: string; autor_nombre: string; creado: string; leida: boolean; leida_en: string | null
}

/** Sugerencias de dirección de una materia (filtradas por `sobre`). */
export function useSugerencias(asignacion: number, sobre?: Sugerencia['sobre']) {
  return useQuery({
    queryKey: ['sugerencias', asignacion, sobre ?? 'todas'],
    queryFn: () => lista(`/sugerencias/?asignacion=${asignacion}${sobre ? `&sobre=${sobre}` : ''}`) as Promise<Sugerencia[]>,
  })
}

/** Una sugerencia: el docente la marca como leída; dirección la puede borrar. */
export function ItemSugerencia({ s, contexto = true }: { s: Sugerencia; contexto?: boolean }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const { esGestion } = useAuth()
  const [ocupado, setOcupado] = useState(false)

  const ejecutar = async (accion: 'leida' | 'borrar') => {
    setOcupado(true)
    try {
      if (accion === 'leida') await api(`/sugerencias/${s.id}/leida/`, { method: 'POST' })
      else await api(`/sugerencias/${s.id}/`, { method: 'DELETE' })
      await qc.invalidateQueries({ queryKey: ['sugerencias'] })
      void qc.invalidateQueries({ queryKey: ['sugerencias-pendientes'] })
      if (accion === 'borrar') avisar('Sugerencia borrada')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo completar.', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const sobre = s.sobre === 'CLASE'
    ? `Clase del ${fechaCorta(s.fecha_clase)}`
    : s.unidad_titulo ?? 'Plan anual en general'
  return (
    <div className={cn('rounded-lg border px-3 py-2.5', !s.leida && !esGestion ? 'border-tarde bg-tarde-50' : 'border-grafito-200 bg-white')}>
      {contexto && <p className="text-xs font-bold uppercase tracking-wide text-tinta-700">{sobre}</p>}
      <p className="whitespace-pre-line text-[15px]">{s.texto}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-grafito-500">
        <span>{s.autor_nombre} · {fechaHora(s.creado)}</span>
        {esGestion && <span className={s.leida ? 'text-presente' : 'text-tarde'}>{s.leida ? `Leída el ${fechaHora(s.leida_en)}` : 'Todavía no la leyó'}</span>}
        {!esGestion && !s.leida && (
          <button onClick={() => void ejecutar('leida')} disabled={ocupado}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-tinta-700 shadow-xs">
            <Check className="size-4" /> Entendido
          </button>
        )}
        {esGestion && (
          <button onClick={() => void ejecutar('borrar')} disabled={ocupado} aria-label="Borrar sugerencia"
            className="ml-auto grid size-7 place-items-center rounded-full text-grafito-400 hover:bg-grafito-100 hover:text-ausente">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Bloque "Sugerencias de dirección" de una materia. Para el docente solo aparece si hay alguna;
 * las que no leyó van primero y resaltadas.
 */
export function ListaSugerencias({ asignacion, sobre, registro }: {
  asignacion: number; sobre: Sugerencia['sobre']; registro?: number
}) {
  const { esGestion } = useAuth()
  const q = useSugerencias(asignacion, sobre)
  const items = (q.data ?? []).filter((s) => registro == null || s.registro_clase === registro)
    .sort((a, b) => Number(a.leida) - Number(b.leida))
  if (!items.length) return null
  const nuevas = items.filter((s) => !s.leida).length
  return (
    <section className="mb-5 space-y-2">
      <h3 className="flex items-center gap-1.5 font-bold">
        <MessageSquareText className="size-5 text-tinta-600" /> Sugerencias de dirección
        {!esGestion && nuevas > 0 && <span className="rounded-full bg-tarde px-2 text-sm text-white">{nuevas} nueva{nuevas > 1 ? 's' : ''}</span>}
      </h3>
      {items.map((s) => <ItemSugerencia key={s.id} s={s} contexto={registro == null} />)}
    </section>
  )
}

/** Dirección escribe una sugerencia (sobre el plan anual o una unidad, o sobre una clase). */
export function BotonSugerir({ asignacion, sobre, unidades, unidad, registro, texto = 'Sugerir', variante = 'secundario' }: {
  asignacion: number; sobre: Sugerencia['sobre']; unidades?: any[]; unidad?: number; registro?: number
  texto?: string; variante?: 'secundario' | 'fantasma'
}) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const { esGestion } = useAuth()
  const [abierta, setAbierta] = useState(false)
  const [valor, setValor] = useState('')
  const [unidadSel, setUnidadSel] = useState<number | null>(unidad ?? null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  if (!esGestion) return null

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      await api('/sugerencias/', {
        method: 'POST',
        body: { asignacion, sobre, texto: valor, unidad: sobre === 'PLAN_ANUAL' ? unidadSel : null, registro_clase: registro ?? null },
      })
      await qc.invalidateQueries({ queryKey: ['sugerencias'] })
      avisar('Sugerencia enviada al docente')
      setValor('')
      setAbierta(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Boton variante={variante} onClick={() => setAbierta(true)}><MessageSquarePlus className="size-4" /> {texto}</Boton>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo={sobre === 'CLASE' ? 'Sugerencia sobre la clase' : 'Sugerencia sobre el plan anual'}
        pie={<Boton className="flex-1" onClick={guardar} cargando={guardando} disabled={!valor.trim()}>Enviar al docente</Boton>}>
        <div className="space-y-4">
          {sobre === 'PLAN_ANUAL' && unidades && unidades.length > 0 && (
            <Campo label="Sobre">
              <Select value={unidadSel ?? ''} onChange={(e) => setUnidadSel(e.target.value ? Number(e.target.value) : null)}>
                <option value="">El plan anual en general</option>
                {unidades.map((u) => <option key={u.id} value={u.id}>Unidad {u.numero}: {u.titulo}</option>)}
              </Select>
            </Campo>
          )}
          <Campo label="Sugerencia" ayuda="El docente la ve en su materia y la marca como leída.">
            <Textarea rows={5} value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
          </Campo>
          {error && <p className="rounded-control bg-ausente-50 px-4 py-3 text-ausente">{error}</p>}
        </div>
      </Hoja>
    </>
  )
}
