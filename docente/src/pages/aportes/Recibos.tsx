// Recibos emitidos: buscar, ver, imprimir, anular o revertir (nunca editar ni borrar).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Boton, Cargando, Encabezado, ErrorCaja, Etiqueta, Hoja, Input, Segmentado, Tarjeta, Vacio, useAviso } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fechaCorta, fechaHora, guaranies } from '../../lib/utils'
import { AportesNav, ESTADO_RECIBO, numeroRecibo, Recibo } from './comun'

export default function Recibos() {
  const [q, setQ] = useState('')
  const [buscado, setBuscado] = useState('')
  const [estado, setEstado] = useState<'' | 'EMITIDO' | 'ANULADO' | 'REVERTIDO'>('')
  const [abierto, setAbierto] = useState<any | null>(null)
  useEffect(() => { const t = setTimeout(() => setBuscado(q.trim()), 300); return () => clearTimeout(t) }, [q])
  const recibos = useQuery({
    queryKey: ['aportes-recibos', buscado, estado],
    queryFn: () => api(`/aportes/recibos/?page_size=200&q=${encodeURIComponent(buscado)}${estado ? `&estado=${estado}` : ''}`),
  })
  const items: any[] = recibos.data?.results ?? []

  return (
    <div>
      <Encabezado titulo="Recibos" detalle="Un recibo no se edita ni se borra: si hubo un error, se anula y se emite otro." />
      <AportesNav />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-grafito-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" placeholder="Buscar por aportante o C.I." />
        </div>
        <Segmentado valor={estado} onChange={setEstado} opciones={[
          { valor: '', label: 'Todos' }, { valor: 'EMITIDO', label: 'Emitidos' },
          { valor: 'ANULADO', label: 'Anulados' }, { valor: 'REVERTIDO', label: 'Revertidos' }]} />
      </div>
      {recibos.isLoading ? <Cargando /> : recibos.error ? <ErrorCaja error={recibos.error} /> : !items.length ? <Vacio titulo="Sin recibos" /> : (
        <Tarjeta className="divide-y divide-grafito-100 p-0">
          {items.map((r) => (
            <button key={r.id} type="button" onClick={() => setAbierto(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-tinta-50/60">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.aportante_nombre}</p>
                <p className="text-sm text-grafito-500">{numeroRecibo(r)} · {fechaCorta(r.fecha)} · {r.lineas.map((l: any) => l.concepto_nombre).join(', ')}</p>
              </div>
              <span className="font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{guaranies(r.total)}</span>
              <Etiqueta tono={ESTADO_RECIBO[r.estado]?.tono ?? 'gris'}>{ESTADO_RECIBO[r.estado]?.texto}</Etiqueta>
            </button>
          ))}
        </Tarjeta>
      )}
      {abierto && <DetalleRecibo recibo={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}

const ACCION: Record<string, string> = { CREAR: 'Emitió', MODIFICAR: 'Modificó', DESCARGAR: 'Descargó' }

/** Quién hizo qué con el recibo (auditoría). */
function Historial({ recibo }: { recibo: number }) {
  const h = useQuery({ queryKey: ['recibo-historial', recibo], queryFn: () => api<any[]>(`/aportes/recibos/${recibo}/historial/`) })
  const propios = (h.data ?? []).filter((x) => x.modelo === 'aportes.recibo')
  if (!propios.length) return null
  return (
    <div className="no-imprimir mt-4 border-t border-grafito-100 pt-3 text-sm">
      <p className="mb-1 font-bold">Historial</p>
      <ul className="space-y-1">
        {propios.map((x) => (
          <li key={x.id}>
            <strong>{fechaHora(x.fecha)}</strong> · {ACCION[x.accion] ?? x.accion_nombre} <strong>{x.usuario_nombre || 'sistema'}</strong>
            {x.cambios?.estado && ` · ${x.cambios.estado[1].toLowerCase()}`}{x.motivo && ` · ${x.motivo}`}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DetalleRecibo({ recibo, onCerrar }: { recibo: any; onCerrar: () => void }) {
  const qc = useQueryClient()
  const avisar = useAviso()
  const { operaAportes } = useAuth()
  const [enviando, setEnviando] = useState(false)

  async function cerrar(accion: 'anular' | 'revertir') {
    const motivo = window.prompt(accion === 'anular'
      ? '¿Por qué se anula el recibo? (el número no se vuelve a usar)'
      : '¿Por qué se revierte? (ej.: la transferencia no se acreditó o se devolvió el dinero)')?.trim()
    if (!motivo) return
    setEnviando(true)
    try {
      await api(`/aportes/recibos/${recibo.id}/${accion}/`, { method: 'POST', body: { motivo } })
      avisar(accion === 'anular' ? 'Recibo anulado' : 'Recibo revertido')
      await qc.invalidateQueries({ queryKey: ['aportes-recibos'] })
      void qc.invalidateQueries({ queryKey: ['aportes-panel'] })
      onCerrar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={`Recibo ${numeroRecibo(recibo)}`} pie={
      <div className="flex flex-wrap gap-2">
        <Boton variante="secundario" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Boton>
        {operaAportes && recibo.estado === 'EMITIDO' && (
          <>
            <Boton variante="peligro" cargando={enviando} onClick={() => cerrar('anular')}>Anular</Boton>
            <Boton variante="fantasma" cargando={enviando} onClick={() => cerrar('revertir')}>Revertir</Boton>
          </>
        )}
      </div>
    }>
      <Recibo recibo={recibo} />
      <Historial recibo={recibo.id} />
    </Hoja>
  )
}
