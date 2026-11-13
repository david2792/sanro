// Emitir un recibo de aporte voluntario: a nombre de quien aporta, por el monto que decida.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Boton, Campo, Encabezado, ErrorCaja, Input, InputMonto, Select, Tarjeta, Vacio, useAviso } from '../../components/ui'
import { api, lista } from '../../lib/api'
import { guaranies, hoyISO } from '../../lib/utils'
import { AportesNav, MEDIOS, Recibo } from './comun'

type Linea = { monto: number | null; descripcion: string }

export default function Cobrar() {
  const qc = useQueryClient()
  const avisar = useAviso()
  const conceptos = useQuery({ queryKey: ['aportes-conceptos', 'activos'], queryFn: () => lista('/aportes/conceptos/?activo=true') })
  const [q, setQ] = useState('')
  const [buscado, setBuscado] = useState('')
  useEffect(() => { const t = setTimeout(() => setBuscado(q.trim()), 300); return () => clearTimeout(t) }, [q])
  const familias = useQuery({
    queryKey: ['aportes-familias', buscado],
    queryFn: () => api<any[]>(`/aportes/familias/?q=${encodeURIComponent(buscado)}`),
    enabled: buscado.length >= 3,
  })

  const vacio = { aportante_nombre: '', aportante_documento: '', tutor: null as number | null, matricula: null as number | null,
    fecha: hoyISO(), medio: 'EFECTIVO', referencia: '', destino_restringido: '', observacion: '' }
  const [datos, setDatos] = useState(vacio)
  const [lineas, setLineas] = useState<Record<number, Linea>>({})
  const [enviando, setEnviando] = useState(false)
  const [emitido, setEmitido] = useState<any | null>(null)

  const elegir = (f: any, t?: any) => {
    setDatos((d) => ({ ...d, matricula: f.matricula, tutor: t?.id ?? null,
      aportante_nombre: t ? t.nombre : `Familia de ${f.alumno}`, aportante_documento: t?.ci ?? '' }))
    setQ('')
  }
  const cambiarLinea = (id: number, cambio: Partial<Linea>) =>
    setLineas((l) => ({ ...l, [id]: { ...(l[id] ?? { monto: null, descripcion: '' }), ...cambio } }))
  const elegidas = Object.entries(lineas).filter(([, l]) => (l.monto ?? 0) > 0 || l.descripcion.trim())
  const total = elegidas.reduce((s, [, l]) => s + (l.monto ?? 0), 0)

  async function emitir() {
    setEnviando(true)
    try {
      const r = await api('/aportes/recibos/', { method: 'POST', body: {
        ...datos, lineas: elegidas.map(([id, l]) => ({ concepto: Number(id), monto: l.monto ?? 0, descripcion: l.descripcion.trim() })) } })
      setEmitido(r)
      setDatos(vacio)
      setLineas({})
      avisar(`Recibo N° ${r.numero} emitido`)
      void qc.invalidateQueries({ queryKey: ['aportes-panel'] })
      void qc.invalidateQueries({ queryKey: ['aportes-recibos'] })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo emitir el recibo.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  if (emitido) return (
    <div>
      <div className="no-imprimir mb-4 flex flex-wrap gap-2">
        <Boton onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Boton>
        <Boton variante="secundario" onClick={() => setEmitido(null)}>Emitir otro</Boton>
      </div>
      <Recibo recibo={emitido} />
    </div>
  )

  return (
    <div>
      <Encabezado titulo="Emitir recibo" detalle="El aporte es voluntario: el monto lo decide quien aporta." />
      <AportesNav />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="space-y-4">
          <h2 className="font-bold">¿Quién aporta?</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-grafito-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" placeholder="Buscar familia por alumno, tutor o C.I. (opcional)" />
          </div>
          {buscado.length >= 3 && q && (
            <ul className="divide-y divide-grafito-100 rounded-control border border-grafito-200">
              {!familias.data?.length && <li className="px-3 py-2 text-sm text-grafito-500">Sin resultados.</li>}
              {familias.data?.map((f) => (
                <li key={f.matricula} className="px-3 py-2 text-sm">
                  <p className="font-bold">{f.alumno} <span className="font-normal text-grafito-500">· {f.seccion}</span></p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {f.tutores.map((t: any) => (
                      <button key={t.id} type="button" onClick={() => elegir(f, t)} className="rounded-full bg-tinta-50 px-2.5 py-1 font-bold text-tinta-700">
                        {t.nombre} ({t.parentesco})
                      </button>
                    ))}
                    <button type="button" onClick={() => elegir(f)} className="rounded-full bg-grafito-100 px-2.5 py-1 font-bold">Familia</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Campo label="Nombre del aportante">
            <Input value={datos.aportante_nombre} maxLength={150} onChange={(e) => setDatos({ ...datos, aportante_nombre: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="C.I. (opcional)"><Input value={datos.aportante_documento} maxLength={20} onChange={(e) => setDatos({ ...datos, aportante_documento: e.target.value })} /></Campo>
            <Campo label="Fecha"><Input type="date" value={datos.fecha} onChange={(e) => setDatos({ ...datos, fecha: e.target.value })} /></Campo>
            <Campo label="Medio">
              <Select value={datos.medio} onChange={(e) => setDatos({ ...datos, medio: e.target.value })}>
                {MEDIOS.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
              </Select>
            </Campo>
            <Campo label="Referencia"><Input value={datos.referencia} maxLength={60} onChange={(e) => setDatos({ ...datos, referencia: e.target.value })} /></Campo>
          </div>
          <Campo label="Destino indicado por el aportante" ayuda="Solo si pidió expresamente que se use para algo determinado.">
            <Input value={datos.destino_restringido} maxLength={200} onChange={(e) => setDatos({ ...datos, destino_restringido: e.target.value })} />
          </Campo>
          <Campo label="Observación"><Input value={datos.observacion} maxLength={200} onChange={(e) => setDatos({ ...datos, observacion: e.target.value })} /></Campo>
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <h2 className="font-bold">Conceptos</h2>
          <ErrorCaja error={conceptos.error} />
          {conceptos.data && !conceptos.data.length && <Vacio titulo="No hay conceptos activos" texto="Cargalos en Configuración." />}
          {conceptos.data?.map((c: any) => {
            const especie = c.tipo === 'DONACION_ESPECIE'
            const l = lineas[c.id]
            return (
              <div key={c.id} className="rounded-control border border-grafito-200 p-3">
                <p className="font-bold">{c.nombre} <span className="text-sm font-normal text-grafito-500">· {c.tipo_nombre}</span></p>
                {c.monto_sugerido && <p className="text-xs text-grafito-500">Sugerido: {guaranies(c.monto_sugerido)} (voluntario)</p>}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <InputMonto valor={l?.monto ?? null} onChange={(v) => cambiarLinea(c.id, { monto: v })}
                    placeholder={especie ? 'Valor (opcional)' : 'Monto'} aria-label={`Monto de ${c.nombre}`} />
                  {especie && <Input value={l?.descripcion ?? ''} onChange={(e) => cambiarLinea(c.id, { descripcion: e.target.value })}
                    placeholder="Qué se donó" maxLength={250} />}
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between border-t border-grafito-200 pt-3">
            <span className="text-lg font-extrabold">{guaranies(total)}</span>
            <Boton onClick={emitir} cargando={enviando} disabled={!datos.aportante_nombre.trim() || !elegidas.length}>Emitir recibo</Boton>
          </div>
        </Tarjeta>
      </div>
    </div>
  )
}
