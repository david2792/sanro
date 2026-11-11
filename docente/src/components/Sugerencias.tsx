import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'

export type CampoFrases = 'actividades' | 'observaciones' | 'interpretacion' | 'acciones'

/**
 * Frases que el docente usa seguido en un campo: con un toque se agregan al texto.
 * Se aprenden de lo que ya escribió (las más usadas primero).
 */
export function Sugerencias({ campo, valor, onChange }: { campo: CampoFrases; valor: string; onChange: (v: string) => void }) {
  const frases = useQuery({
    queryKey: ['frases', campo],
    queryFn: () => api<string[]>(`/frases/?campo=${campo}`, { cache: true }),
    staleTime: 5 * 60_000,
  })
  const texto = valor.toLowerCase()
  const libres = (frases.data ?? []).filter((f) => !texto.includes(f.toLowerCase().replace(/\.$/, '')))
  if (!libres.length) return null

  const agregar = (f: string) => {
    const base = valor.trimEnd()
    if (!base) return onChange(f)
    // Sigue el estilo del texto: renglones si ya usa renglones, si no, frases seguidas.
    const sep = base.includes('\n') ? '\n' : /[.!?]$/.test(base) ? ' ' : '. '
    onChange(base + sep + f)
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Frases frecuentes">
      {libres.slice(0, 8).map((f) => (
        <button key={f} type="button" onClick={() => agregar(f)}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-grafito-200 bg-white px-2.5 py-1 text-left text-sm text-grafito-600 hover:border-tinta-500 hover:text-tinta-700 active:bg-tinta-50">
          <Plus className="size-3.5 shrink-0" /> <span className="truncate">{f}</span>
        </button>
      ))}
    </div>
  )
}
