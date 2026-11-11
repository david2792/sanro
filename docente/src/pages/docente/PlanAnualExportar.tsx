import { useQuery } from '@tanstack/react-query'
import { FileDown, Sheet } from 'lucide-react'
import { useImpresion } from '../../components/Reporte'
import { Boton } from '../../components/ui'
import { api } from '../../lib/api'
import { descargarCSV, fechaCorta } from '../../lib/utils'

type Encabezado = { institucion: string; materia: string; seccion: string; docente: string }

/** Datos del encabezado: colegio, materia, sección y docente. */
function useEncabezado(asignacion: number): Encabezado | null {
  const a = useQuery({ queryKey: ['asignacion', asignacion], queryFn: () => api(`/asignaciones/${asignacion}/`, { cache: true }) })
  const inst = useQuery({ queryKey: ['institucion'], queryFn: () => api('/instituciones/') })
  if (!a.data) return null
  return {
    institucion: inst.data?.results?.[0]?.nombre ?? '',
    materia: a.data.materia_nombre,
    seccion: a.data.seccion_descripcion,
    docente: a.data.docente_nombre,
  }
}

const nombreArchivo = (e: Encabezado) =>
  `plan-anual-${e.materia}-${e.seccion}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')

/** Botones "PDF" y "Excel" del plan anual de una materia, tal como lo cargó el docente. */
export function ExportarPlanAnual({ asignacion, unidades }: { asignacion: number; unidades: any[] }) {
  const e = useEncabezado(asignacion)
  const [imprimir, zona] = useImpresion()
  const vacio = !unidades.length || !e

  const excel = () => {
    if (!e) return
    const filas: (string | number | null)[][] = [
      ['Plan anual'], ['Institución', e.institucion], ['Área', e.materia], ['Curso / Sección', e.seccion], ['Docente', e.docente], [],
      ['Unidad', 'Título', 'Desde', 'Hasta', 'Competencia', 'Capacidad', 'Indicadores', 'Contenidos',
        'Estrategias metodológicas', 'Recursos', 'Evaluación'],
    ]
    for (const u of unidades) {
      const comunes = [u.numero, u.titulo, fechaCorta(u.fecha_inicio), fechaCorta(u.fecha_fin), u.competencia]
      const resto = [u.contenidos, u.estrategias, u.recursos, u.evaluacion]
      // Una fila por capacidad, con sus indicadores en la misma celda (uno por línea).
      const caps = u.capacidades.length ? u.capacidades : [{ descripcion: '', indicadores: [] }]
      caps.forEach((c: any, i: number) => filas.push([
        ...(i === 0 ? comunes : comunes.map(() => '')),
        c.descripcion, c.indicadores.map((x: any) => `• ${x.descripcion}`).join('\n'),
        ...(i === 0 ? resto : resto.map(() => '')),
      ]))
    }
    descargarCSV(nombreArchivo(e), filas)
  }

  return (
    <>
      <Boton variante="secundario" onClick={imprimir} disabled={vacio} title="Abre la impresión: elegí «Guardar como PDF»">
        <FileDown className="size-4" /> PDF
      </Boton>
      <Boton variante="secundario" onClick={excel} disabled={vacio}><Sheet className="size-4" /> Excel</Boton>
      {e && zona(<PlanAnualImpreso e={e} unidades={unidades} />)}
    </>
  )
}

/** El plan anual en hojas A4: encabezado del colegio y una tabla por unidad. */
function PlanAnualImpreso({ e, unidades }: { e: Encabezado; unidades: any[] }) {
  const celda = 'border border-black px-2 py-1 align-top'
  const etiqueta = `${celda} w-40 bg-[#c6d9ef] text-right font-bold`
  const fila = (titulo: string, contenido: any) => contenido ? (
    <tr><td className={etiqueta}>{titulo}</td><td className={`${celda} whitespace-pre-line`}>{contenido}</td></tr>
  ) : null
  return (
    <div className="text-[11px] text-black" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <style>{'@page { size: A4 portrait; margin: 12mm; }'}</style>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td colSpan={4} className={`${celda} bg-[#1f4e79] py-1.5 text-white`}>
              <div className="flex items-center justify-center gap-3">
                <img src="/logo-san-roque.png" alt="" className="h-11 w-auto rounded-sm bg-white p-0.5" />
                <span className="text-[15px] font-bold">PLAN ANUAL</span>
              </div>
            </td>
          </tr>
          <tr><td className={etiqueta}>Institución:</td><td className={celda}>{e.institucion}</td><td className={`${etiqueta} w-24`}>Área:</td><td className={celda}>{e.materia}</td></tr>
          <tr><td className={etiqueta}>Curso / Sección:</td><td className={celda}>{e.seccion}</td><td className={etiqueta}>Docente:</td><td className={celda}>{e.docente}</td></tr>
        </tbody>
      </table>

      {unidades.map((u) => (
        <table key={u.id} className="mt-3 w-full border-collapse" style={{ breakInside: 'avoid' }}>
          <tbody>
            <tr>
              <td colSpan={2} className={`${celda} bg-[#fff2cc] font-bold`}>
                Unidad {u.numero}: {u.titulo}
                {u.fecha_inicio && <span className="font-normal"> · del {fechaCorta(u.fecha_inicio)}{u.fecha_fin && ` al ${fechaCorta(u.fecha_fin)}`}</span>}
              </td>
            </tr>
            {fila('Competencia', u.competencia)}
            {u.capacidades.length > 0 && (
              <tr>
                <td className={etiqueta}>Capacidades e indicadores</td>
                <td className={celda}>
                  {u.capacidades.map((c: any, i: number) => (
                    <div key={c.id} className={i ? 'mt-1.5' : undefined}>
                      <p className="font-bold">{i + 1}. {c.descripcion}</p>
                      {c.indicadores.map((x: any) => <p key={x.id} className="pl-4">• {x.descripcion}</p>)}
                    </div>
                  ))}
                </td>
              </tr>
            )}
            {fila('Contenidos', u.contenidos)}
            {fila('Estrategias metodológicas', u.estrategias)}
            {fila('Recursos', u.recursos)}
            {fila('Evaluación', u.evaluacion)}
          </tbody>
        </table>
      ))}

      <div className="mt-16 flex justify-around gap-8">
        {['Docente', 'Coordinación pedagógica', 'Dirección'].map((c) => (
          <div key={c} className="w-48 border-t border-black pt-1 text-center">{c}</div>
        ))}
      </div>
    </div>
  )
}
