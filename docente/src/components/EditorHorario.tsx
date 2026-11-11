import { Copy, Plus, X } from 'lucide-react'
import { type Bloque, cn, DIAS_SEMANA } from '../lib/utils'
import { Input } from './ui'

/**
 * Días y horas de clase de una materia: cada día marcado puede tener uno o más bloques
 * (de tal hora a tal hora). Un día sin bloques es día de clase sin hora cargada.
 */
export function EditorHorario({ dias, horario, onChange }: {
  dias: number[]; horario: Bloque[]; onChange: (dias: number[], horario: Bloque[]) => void
}) {
  const delDia = (dia: number) => horario.map((b, i) => ({ b, i })).filter((x) => x.b.dia === dia)

  const alternarDia = (dia: number) => {
    if (dias.includes(dia)) onChange(dias.filter((d) => d !== dia), horario.filter((b) => b.dia !== dia))
    else {
      // Al marcar un día nuevo se le pone la misma hora que el primer día con hora (si hay).
      const modelo = horario.find((b) => b.inicio && b.fin)
      const nuevos = modelo ? horario.filter((b) => b.dia === modelo.dia).map((b) => ({ ...b, dia })) : [{ dia, inicio: '', fin: '' }]
      onChange([...dias, dia].sort(), [...horario, ...nuevos])
    }
  }
  const cambiar = (i: number, campo: 'inicio' | 'fin', valor: string) =>
    onChange(dias, horario.map((b, k) => (k === i ? { ...b, [campo]: valor } : b)))
  const quitar = (i: number) => onChange(dias, horario.filter((_, k) => k !== i))
  const agregar = (dia: number) => {
    const ultimo = delDia(dia).at(-1)?.b
    onChange(dias, [...horario, { dia, inicio: ultimo?.fin ?? '', fin: '' }])
  }
  const copiarATodos = (dia: number) => {
    const modelo = horario.filter((b) => b.dia === dia && b.inicio && b.fin)
    onChange(dias, [...horario.filter((b) => b.dia === dia || !dias.includes(b.dia)),
      ...dias.filter((d) => d !== dia).flatMap((d) => modelo.map((b) => ({ ...b, dia: d })))])
  }

  return (
    <div className="space-y-2">
      {DIAS_SEMANA.map((d) => {
        const on = dias.includes(d.n)
        const bloques = delDia(d.n)
        const completo = bloques.some(({ b }) => b.inicio && b.fin)
        return (
          <div key={d.n} className="flex items-start gap-2">
            <button type="button" aria-pressed={on} onClick={() => alternarDia(d.n)}
              className={cn('h-11 w-24 shrink-0 rounded-control border font-bold capitalize sm:w-28',
                on ? 'border-tinta-700 bg-tinta-700 text-white' : 'border-grafito-200 bg-white text-grafito-600')}>
              {d.largo}
            </button>
            {on && (
              <div className="min-w-0 flex-1 space-y-1.5">
                {bloques.map(({ b, i }) => {
                  const mal = b.inicio && b.fin && b.inicio >= b.fin
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-1.5">
                        <Input type="time" aria-label={`Inicio del ${d.largo}`} value={b.inicio}
                          onChange={(e) => cambiar(i, 'inicio', e.target.value)} className={cn('min-w-0 px-2', mal && 'border-ausente')} />
                        <span className="text-grafito-500">a</span>
                        <Input type="time" aria-label={`Fin del ${d.largo}`} value={b.fin}
                          onChange={(e) => cambiar(i, 'fin', e.target.value)} className={cn('min-w-0 px-2', mal && 'border-ausente')} />
                        <button type="button" onClick={() => quitar(i)} aria-label="Quitar este horario"
                          className="grid size-9 shrink-0 place-items-center rounded-full text-grafito-400 hover:bg-grafito-100 hover:text-ausente">
                          <X className="size-4" />
                        </button>
                      </div>
                      {mal && <p className="text-sm text-ausente">La hora de fin debe ser posterior a la de inicio.</p>}
                    </div>
                  )
                })}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold">
                  <button type="button" onClick={() => agregar(d.n)} className="inline-flex items-center gap-1 text-tinta-600 hover:underline">
                    <Plus className="size-4" /> {bloques.length ? 'Otra hora este día' : 'Agregar hora'}
                  </button>
                  {completo && dias.length > 1 && (
                    <button type="button" onClick={() => copiarATodos(d.n)} className="inline-flex items-center gap-1 text-tinta-600 hover:underline">
                      <Copy className="size-4" /> Misma hora los otros días
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

