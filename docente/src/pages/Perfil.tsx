import { LogOut, RefreshCw, Trash2 } from 'lucide-react'
import { Boton, Encabezado, Tarjeta } from '../components/ui'
import { ROL_NOMBRE, useAuth } from '../lib/auth'
import { descartarPendiente, sincronizar, usePendientes } from '../lib/offline'
import { usePwaInstall } from '../lib/pwa'
import { fechaCorta } from '../lib/utils'

export default function Perfil() {
  const { usuario, salir } = useAuth()
  const pendientes = usePendientes()
  const { canInstall, instalar } = usePwaInstall()
  if (!usuario) return null
  return (
    <div className="max-w-xl">
      <Encabezado titulo={`${usuario.first_name} ${usuario.last_name}`.trim() || usuario.username} detalle={`${ROL_NOMBRE[usuario.rol]} · usuario ${usuario.username}`} />

      <Tarjeta className="mb-4 p-5">
        <h2 className="mb-1 font-bold">Listas guardadas en este teléfono</h2>
        {pendientes.length === 0 ? (
          <p className="text-grafito-500">Todo está enviado al sistema.</p>
        ) : (
          <>
            <p className="mb-3 text-grafito-500">Se envían solas cuando hay señal.</p>
            <ul className="mb-4 divide-y divide-grafito-100">
              {pendientes.map((p) => (
                <li key={p.body.uuid} className="flex items-center gap-3 py-2">
                  <div className="flex-1">
                    <p className="font-bold">Clase del {fechaCorta(p.body.fecha)}</p>
                    {p.error && <p className="text-sm text-ausente">{p.error}</p>}
                  </div>
                  {p.error && (
                    <button onClick={() => descartarPendiente(p.body.uuid)} className="rounded-lg p-2 text-grafito-500 hover:bg-grafito-100" aria-label="Descartar">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <Boton variante="secundario" onClick={() => void sincronizar()}><RefreshCw className="size-4" /> Enviar ahora</Boton>
          </>
        )}
      </Tarjeta>

      <Tarjeta className="mb-6 p-5">
        <h2 className="mb-1 font-bold">Aplicación Móvil (PWA)</h2>
        <p className="text-sm text-grafito-500 mb-3">San Roque funciona sin conexión y se actualiza sola.</p>
        <div className="flex flex-wrap items-center gap-2">
          {canInstall && (
            <Boton variante="primario" onClick={() => void instalar()}>
              Instalar en este celular
            </Boton>
          )}
          <Boton
            variante="secundario"
            onClick={() => {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then((r) => r?.update())
              }
              window.location.reload()
            }}
          >
            <RefreshCw className="size-4" /> Actualizar versión
          </Boton>
        </div>
      </Tarjeta>

      <Boton variante="secundario" className="w-full text-ausente" onClick={salir}><LogOut className="size-4" /> Cerrar sesión</Boton>
    </div>
  )
}
