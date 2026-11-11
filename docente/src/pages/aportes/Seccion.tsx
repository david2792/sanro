import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { AccionesReporte, Dato, EncabezadoImpresion, Firmas, useImpresion } from '../../components/Reporte'
import {
  Boton, Campo, Cargando, Casilla, Encabezado, ErrorCaja, Etiqueta, Hoja, Input, InputMonto, Segmentado, Select, useAviso, Vacio,
} from '../../components/ui'
import { api, lista } from '../../lib/api'
import { cn, descargarCSV, fechaCorta, guaranies, hoyISO, miles } from '../../lib/utils'
import { AportesNav, AVANCE, AvanceEtiqueta, CUOTA, cuotaNombre, MEDIOS, Recibo, type EstadoCuota } from './comun'

const clave = (c: { concepto: number; mes: number | null }) => `${c.concepto}-${c.mes ?? 'u'}`

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['aportes-seccion', 'aportes-panel', 'aportes-secciones', 'aportes-pagos', 'aportes-exoneraciones', 'aportes-reporte']) {
    void qc.invalidateQueries({ queryKey: [k] })
  }
}

function Celda({ cuota }: { cuota?: any }) {
  if (!cuota) return <td className="px-1 py-2 text-center text-grafito-300">—</td>
  const e = CUOTA[cuota.estado as EstadoCuota]
  const titulo = `${e.texto}${cuota.pagado && cuota.estado !== 'PAGADO' ? ` (pagó ${guaranies(cuota.pagado)})` : ''}`
  return (
    <td className="px-1 py-2 text-center">
      <span title={titulo} aria-label={titulo} className={cn('inline-grid size-7 place-items-center rounded-md text-sm font-bold', e.clase)}>{e.simbolo}</span>
    </td>
  )
}

export default function SeccionAportes() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { data, isLoading, error } = useQuery({ queryKey: ['aportes-seccion', id], queryFn: () => api(`/aportes/secciones/${id}/`) })
  const abierto = Number(params.get('m')) || null
  const abrir = (m: number | null) => setParams(m ? { m: String(m) } : {}, { replace: true })
  const alumno = data?.alumnos.find((a: any) => a.matricula === abierto)

  const csv = () => descargarCSV(`aportes-${data.seccion.seccion}`, [
    ['N°', 'Alumno', 'C.I.', ...data.columnas.map((c: any) => c.mes ? `${c.concepto_nombre} ${c.etiqueta}` : c.concepto_nombre), 'Pagado (Gs.)', 'Saldo (Gs.)', 'Vencido sin pagar (Gs.)', 'Estado'],
    ...data.alumnos.map((a: any) => [
      a.numero_lista ?? '', a.alumno, a.ci,
      ...data.columnas.map((c: any) => {
        const q = a.cuotas.find((x: any) => clave(x) === clave(c))
        return q ? CUOTA[q.estado as EstadoCuota].texto : ''
      }),
      a.pagado, a.saldo, a.deuda, AVANCE[a.avance as keyof typeof AVANCE].texto,
    ]),
  ])

  return (
    <div>
      <Link to="/aportes/cobrar" className="no-imprimir mb-3 inline-block text-sm font-bold text-tinta-600">‹ Cobrar</Link>
      {isLoading && <Cargando />}
      <ErrorCaja error={error} />
      {data && (
        <>
          <EncabezadoImpresion institucion={data.institucion} titulo={`Planilla de aportes ACES — ${data.seccion.seccion}`}
            detalle={`Año lectivo ${data.anio}`} generado={data.generado} />
          <div className="no-imprimir">
            <Encabezado titulo={data.seccion.seccion} detalle={`Aportes ACES · ${data.anio}`} acciones={<AccionesReporte onCSV={csv} />} />
            <AportesNav />
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato texto="Pagaron todo" valor={`${data.seccion.completos} de ${data.seccion.alumnos}`}
              detalle={`${data.seccion.parciales} una parte · ${data.seccion.sin_pagos} sin pagos · ${data.seccion.exonerados} exon.`} />
            <Dato texto="Cobrado" valor={guaranies(data.seccion.pagado)} tono="verde" />
            <Dato texto="Saldo por cobrar" valor={guaranies(data.seccion.saldo)} tono={data.seccion.deuda ? 'rojo' : undefined}
              detalle={data.seccion.deuda ? `${guaranies(data.seccion.deuda)} ya vencido` : 'Nada vencido sin pagar'} />
            <Dato texto="Cobrado del total" valor={data.seccion.porcentaje_pagado == null ? '—' : `${data.seccion.porcentaje_pagado}%`} />
          </div>

          {!data.alumnos.length ? <Vacio titulo="La sección no tiene alumnos matriculados" /> : !data.columnas.length ? (
            <Vacio titulo="No hay cuotas para esta sección" texto="Revisá los conceptos de aporte en Configuración." />
          ) : (
            <>
              <ul className="no-imprimir mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-grafito-600">
                {Object.entries(CUOTA).map(([k, e]) => (
                  <li key={k} className="flex items-center gap-1.5"><span className={cn('inline-grid size-5 place-items-center rounded text-xs font-bold', e.clase)}>{e.simbolo}</span>{e.texto}</li>
                ))}
              </ul>
              {/* Celular: lista */}
              <ul className="divide-y divide-grafito-100 overflow-hidden rounded-xl border border-grafito-200 bg-white md:hidden print:hidden">
                {data.alumnos.map((a: any) => (
                  <li key={a.matricula}>
                    <button onClick={() => abrir(a.matricula)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-tinta-50">
                      <span className="w-6 text-right text-sm font-bold text-grafito-500">{a.numero_lista ?? ''}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{a.alumno}</p>
                        <p className="text-sm text-grafito-500">
                          Pagó {guaranies(a.pagado)}
                          {a.saldo > 0 && <span className={cn(a.deuda > 0 && 'font-bold text-ausente')}> · saldo {guaranies(a.saldo)}</span>}
                        </p>
                      </div>
                      <AvanceEtiqueta alumno={a} />
                    </button>
                  </li>
                ))}
              </ul>
              {/* Pantalla grande e impresión: planilla */}
              <div className="hidden overflow-x-auto rounded-xl border border-grafito-200 bg-white md:block print:block">
                <table className="w-full text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead className="border-b border-grafito-200 bg-grafito-100/60 text-grafito-600">
                    <tr>
                      <th className="px-3 py-2.5">N°</th>
                      <th className="px-3 py-2.5">Alumno</th>
                      {data.columnas.map((c: any) => <th key={clave(c)} className="px-1 py-2.5 text-center" title={`${c.concepto_nombre} · vence ${fechaCorta(c.vence)}`}>{c.etiqueta}</th>)}
                      <th className="px-3 py-2.5 text-right">Pagado (Gs.)</th>
                      <th className="px-3 py-2.5 text-right">Saldo (Gs.)</th>
                      <th className="px-3 py-2.5 text-right">Vencido (Gs.)</th>
                      <th className="no-imprimir w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-grafito-100">
                    {data.alumnos.map((a: any) => (
                      <tr key={a.matricula} className="hover:bg-tinta-50/40">
                        <td className="px-3 py-2 text-grafito-500">{a.numero_lista ?? ''}</td>
                        <td className="px-3 py-2 font-bold">{a.alumno}</td>
                        {data.columnas.map((c: any) => <Celda key={clave(c)} cuota={a.cuotas.find((x: any) => clave(x) === clave(c))} />)}
                        <td className="px-3 py-2 text-right">{a.pagado ? miles(a.pagado) : '—'}</td>
                        <td className="px-3 py-2 text-right">{a.saldo ? miles(a.saldo) : '—'}</td>
                        <td className={cn('px-3 py-2 text-right', a.deuda > 0 && 'font-bold text-ausente')}>{a.deuda ? miles(a.deuda) : '—'}</td>
                        <td className="no-imprimir pr-3 text-right">
                          <Boton variante="secundario" className="h-9 px-3 text-sm" onClick={() => abrir(a.matricula)}>Cobrar</Boton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-grafito-200 font-bold">
                    <tr>
                      <td className="px-3 py-2.5" colSpan={2 + data.columnas.length}>Totales</td>
                      <td className="px-3 py-2.5 text-right">{miles(data.seccion.pagado)}</td>
                      <td className="px-3 py-2.5 text-right">{miles(data.seccion.saldo)}</td>
                      <td className={cn('px-3 py-2.5 text-right', data.seccion.deuda > 0 && 'text-ausente')}>{miles(data.seccion.deuda)}</td>
                      <td className="no-imprimir" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <Firmas cargos={['Tesorero/a ACES', 'Presidente/a ACES']} />
            </>
          )}
          {alumno && <HojaAlumno alumno={alumno} institucion={data.institucion} onCerrar={() => abrir(null)} />}
        </>
      )}
    </div>
  )
}

/* ============================= hoja del alumno ============================= */

function HojaAlumno({ alumno, institucion, onCerrar }: { alumno: any; institucion: string; onCerrar: () => void }) {
  const [pestana, setPestana] = useState<'cobrar' | 'recibos' | 'exoneraciones'>('cobrar')
  const [recibo, setRecibo] = useState<any | null>(null)
  const [imprimir, zona] = useImpresion()

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={recibo ? `Recibo N° ${String(recibo.numero).padStart(5, '0')}` : alumno.alumno}
      pie={recibo ? (
        <>
          <Boton variante="secundario" className="flex-1" onClick={() => setRecibo(null)}>Volver</Boton>
          <Boton className="flex-1" onClick={imprimir}><Printer className="size-4" /> Imprimir recibo</Boton>
        </>
      ) : undefined}>
      {recibo ? (
        <>
          <Recibo pago={recibo} institucion={institucion} />
          {zona(<Recibo pago={recibo} institucion={institucion} />)}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <AvanceEtiqueta alumno={alumno} />
            <span className="text-sm text-grafito-500">C.I. {alumno.ci}</span>
            <span className="text-sm text-grafito-500">Pagó {guaranies(alumno.pagado)}</span>
            {alumno.saldo > 0 && <span className={cn('text-sm font-bold', alumno.deuda > 0 && 'text-ausente')}>Saldo {guaranies(alumno.saldo)}</span>}
          </div>
          <div className="mb-4">
            <Segmentado valor={pestana} onChange={setPestana} opciones={[
              { valor: 'cobrar', label: 'Cobrar' }, { valor: 'recibos', label: 'Recibos' }, { valor: 'exoneraciones', label: 'Exoneraciones' },
            ]} />
          </div>
          {pestana === 'cobrar' && <FormCobro alumno={alumno} onCobrado={setRecibo} />}
          {pestana === 'recibos' && <Recibos matricula={alumno.matricula} onVer={setRecibo} />}
          {pestana === 'exoneraciones' && <Exoneraciones alumno={alumno} />}
        </>
      )}
    </Hoja>
  )
}

function FormCobro({ alumno, onCobrado }: { alumno: any; onCobrado: (r: any) => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const pendientes = alumno.cuotas.filter((c: any) => ['VENCIDO', 'PARCIAL', 'POR_VENCER'].includes(c.estado))
  const saldo = (c: any) => c.monto - c.pagado
  // Si debe un solo concepto (ej. el aporte anual), ya queda marcado con su saldo.
  const [sel, setSel] = useState<Record<string, number | null>>(() =>
    pendientes.length === 1 ? { [clave(pendientes[0])]: saldo(pendientes[0]) } : {})
  const [fecha, setFecha] = useState(hoyISO())
  const [medio, setMedio] = useState('EFECTIVO')
  const [referencia, setReferencia] = useState('')
  const [pagadoPor, setPagadoPor] = useState('')
  const [observacion, setObservacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  if (!pendientes.length) {
    return <Vacio titulo="No tiene cuotas pendientes" texto="Todas sus cuotas están pagadas o exoneradas." />
  }
  const marcar = (c: any, si: boolean) => setSel((s) => {
    const n = { ...s }
    if (si) n[clave(c)] = saldo(c)
    else delete n[clave(c)]
    return n
  })
  const vencidas = () => setSel(Object.fromEntries(pendientes.filter((c: any) => c.deuda > 0).map((c: any) => [clave(c), saldo(c)])))
  const total = Object.values(sel).reduce<number>((a, v) => a + (v ?? 0), 0)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const marcadas = pendientes.filter((c: any) => clave(c) in sel)
    if (!marcadas.length) return setError('Marcá al menos un concepto.')
    const sinMonto = marcadas.find((c: any) => !sel[clave(c)])
    if (sinMonto) return setError(`Indicá cuánto paga de ${cuotaNombre(sinMonto)}.`)
    const excede = marcadas.find((c: any) => sel[clave(c)]! > saldo(c))
    if (excede) return setError(`${cuotaNombre(excede)}: el saldo es ${guaranies(saldo(excede))}, no se puede cobrar ${guaranies(sel[clave(excede)])}.`)
    const detalles = marcadas.map((c: any) => ({ concepto: c.concepto, mes: c.mes, monto: sel[clave(c)] }))
    setGuardando(true)
    try {
      const r = await api('/aportes/pagos/', {
        method: 'POST',
        body: { matricula: alumno.matricula, fecha, medio, referencia, pagado_por: pagadoPor, observacion, detalles },
      })
      invalidar(qc)
      avisar(`Recibo N° ${r.numero} registrado`)
      onCobrado(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-bold text-grafito-600">Qué paga</span>
          {pendientes.filter((c: any) => c.deuda > 0).length > 1 && (
            <button type="button" onClick={vencidas} className="text-sm font-bold text-tinta-600">Marcar las vencidas</button>
          )}
        </div>
        <ul className="divide-y divide-grafito-100 rounded-control border border-grafito-200">
          {pendientes.map((c: any) => {
            const k = clave(c)
            const e = CUOTA[c.estado as EstadoCuota]
            const queda = k in sel ? saldo(c) - (sel[k] ?? 0) : null
            return (
              <li key={k} className="px-3 pb-2">
                <Casilla checked={k in sel} onChange={(v) => marcar(c, v)}>
                  <span className="font-bold">{cuotaNombre(c)}</span>{' '}
                  <span className={cn('rounded px-1 text-xs font-bold', e.clase)}>{e.texto}</span>
                  <span className="block text-sm text-grafito-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    Total {guaranies(c.monto)}{c.pagado > 0 && ` · pagó ${guaranies(c.pagado)}`} · <span className="font-bold text-grafito">saldo {guaranies(saldo(c))}</span>
                  </span>
                  <span className="block text-xs text-grafito-500">{c.mes ? 'Vence' : 'Completar hasta'} el {fechaCorta(c.vence)}</span>
                </Casilla>
                {k in sel && (
                  <div className="ml-8 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <InputMonto valor={sel[k]} onChange={(v) => setSel((s) => ({ ...s, [k]: v }))} aria-label={`Monto que paga de ${cuotaNombre(c)}`} className="w-44" />
                    <span className={cn('text-sm', queda != null && queda < 0 ? 'font-bold text-ausente' : 'text-grafito-500')}>
                      {queda == null ? '' : queda < 0 ? `Supera el saldo en ${guaranies(-queda)}` : queda === 0 ? 'Completa el pago' : `Pago parcial: quedará debiendo ${guaranies(queda)}`}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Fecha"><Input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} required /></Campo>
        <Campo label="Medio de pago">
          <Select value={medio} onChange={(e) => setMedio(e.target.value)}>
            {MEDIOS.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
          </Select>
        </Campo>
        {medio !== 'EFECTIVO' && (
          <Campo label="N° de transferencia / referencia" className="col-span-2"><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} /></Campo>
        )}
        <Campo label="Entregado por" ayuda="Nombre de quien paga (opcional)" className="col-span-2">
          <Input value={pagadoPor} onChange={(e) => setPagadoPor(e.target.value)} />
        </Campo>
        <Campo label="Observación" className="col-span-2"><Input value={observacion} onChange={(e) => setObservacion(e.target.value)} /></Campo>
      </div>
      <ErrorCaja error={error} />
      <div className="flex items-center justify-between gap-3 rounded-xl bg-grafito px-4 py-3 text-white">
        <span><span className="block text-xs text-grafito-300">Total a cobrar</span><span className="text-xl font-extrabold">{guaranies(total)}</span></span>
        <Boton type="submit" variante="secundario" cargando={guardando} disabled={!total}>Registrar y emitir recibo</Boton>
      </div>
    </form>
  )
}

function Recibos({ matricula, onVer }: { matricula: number; onVer: (r: any) => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const { data, isLoading, error } = useQuery({ queryKey: ['aportes-pagos', matricula], queryFn: () => lista(`/aportes/pagos/?matricula=${matricula}`) })
  const [anulando, setAnulando] = useState<any | null>(null)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const anular = async () => {
    setGuardando(true)
    try {
      await api(`/aportes/pagos/${anulando.id}/anular/`, { method: 'POST', body: { motivo } })
      invalidar(qc)
      avisar(`Recibo N° ${anulando.numero} anulado`)
      setAnulando(null)
      setMotivo('')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo anular.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  if (isLoading) return <Cargando />
  if (error) return <ErrorCaja error={error} />
  if (!data?.length) return <Vacio titulo="Todavía no hay recibos" />
  return (
    <ul className="divide-y divide-grafito-100 rounded-control border border-grafito-200">
      {data.map((p: any) => (
        <li key={p.id} className="px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold">N° {String(p.numero).padStart(5, '0')} · {guaranies(p.total)} {p.anulado && <Etiqueta tono="rojo">Anulado</Etiqueta>}</p>
              <p className="truncate text-sm text-grafito-500">{fechaCorta(p.fecha)} · {p.detalles.map(cuotaNombre).join(', ')}</p>
            </div>
            <button onClick={() => onVer(p)} className="text-sm font-bold text-tinta-600">Ver</button>
            {!p.anulado && <button onClick={() => setAnulando(p)} className="text-sm font-bold text-ausente">Anular</button>}
          </div>
          {anulando?.id === p.id && (
            <div className="mt-2 space-y-2 rounded-lg bg-ausente-50 p-3">
              <p className="text-sm">El recibo queda en los registros como anulado y las cuotas vuelven a quedar pendientes.</p>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la anulación" aria-label="Motivo" autoFocus />
              <div className="flex gap-2">
                <Boton variante="secundario" className="flex-1" onClick={() => setAnulando(null)}>Cancelar</Boton>
                <Boton variante="peligro" className="flex-1" disabled={!motivo.trim()} cargando={guardando} onClick={anular}>Anular recibo</Boton>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function Exoneraciones({ alumno }: { alumno: any }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const { data = [], isLoading } = useQuery({
    queryKey: ['aportes-exoneraciones', alumno.matricula],
    queryFn: () => lista(`/aportes/exoneraciones/?matricula=${alumno.matricula}`),
  })
  const conceptos = [...new Map(alumno.cuotas.map((c: any) => [c.concepto, c.concepto_nombre])).entries()] as [number, string][]
  const libres = conceptos.filter(([id]) => !data.some((e: any) => e.concepto === id))
  const [concepto, setConcepto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const ejecutar = async (accion: () => Promise<unknown>, ok: string) => {
    setGuardando(true)
    try {
      await accion()
      invalidar(qc)
      avisar(ok)
      setMotivo('')
      setConcepto('')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  if (isLoading) return <Cargando />
  return (
    <div className="space-y-4">
      {data.length > 0 && (
        <ul className="divide-y divide-grafito-100 rounded-control border border-grafito-200">
          {data.map((e: any) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1"><p className="font-bold">{e.concepto_nombre}</p><p className="text-sm text-grafito-500">{e.motivo}</p></div>
              <button disabled={guardando} className="text-sm font-bold text-ausente"
                onClick={() => ejecutar(() => api(`/aportes/exoneraciones/${e.id}/`, { method: 'DELETE' }), 'Exoneración quitada')}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {libres.length > 0 ? (
        <form className="space-y-3" onSubmit={(ev) => {
          ev.preventDefault()
          void ejecutar(() => api('/aportes/exoneraciones/', { method: 'POST', body: { matricula: alumno.matricula, concepto: Number(concepto), motivo } }), 'Alumno exonerado')
        }}>
          <Campo label="Exonerar de">
            <Select value={concepto} onChange={(e) => setConcepto(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {libres.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Motivo" ayuda="Ej.: hermanos en el colegio, situación económica, beca."><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} required /></Campo>
          <Boton type="submit" cargando={guardando} className="w-full">Exonerar</Boton>
        </form>
      ) : !data.length && <Vacio titulo="No hay conceptos para exonerar" />}
    </div>
  )
}
