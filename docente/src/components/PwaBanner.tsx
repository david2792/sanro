import { Download, RefreshCw, Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { aplicarActualizacion, usePwaInstall } from '../lib/pwa'
import { Boton, BotonIcono } from './ui'

export function PwaBanner() {
  const { canInstall, esStandalone, esIOS, instalar } = usePwaInstall()
  const [nuevaVersion, setNuevaVersion] = useState(false)
  const [descartado, setDescartado] = useState(() => {
    if (typeof window === 'undefined') return false
    return !!localStorage.getItem('sr_pwa_banner_dismissed')
  })
  const [mostrarGuiaIOS, setMostrarGuiaIOS] = useState(false)

  useEffect(() => {
    const handleNuevaVersion = () => setNuevaVersion(true)
    window.addEventListener('pwa-nueva-version', handleNuevaVersion)
    return () => window.removeEventListener('pwa-nueva-version', handleNuevaVersion)
  }, [])


  const descartar = () => {
    setDescartado(true)
    setMostrarGuiaIOS(false)
    localStorage.setItem('sr_pwa_banner_dismissed', '1')
  }

  // 1. Banner prioritario: Actualización de la App
  if (nuevaVersion) {
    return (
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-tinta-700 px-4 py-2.5 text-white shadow-md">
        <div className="flex items-center gap-2 text-sm font-bold">
          <RefreshCw className="size-4 animate-spin text-tinta-200" />
          <span>¡Nueva versión disponible con mejoras!</span>
        </div>
        <Boton
          variante="secundario"
          className="h-8 px-3 text-xs"
          onClick={() => aplicarActualizacion()}
        >
          Actualizar ahora
        </Boton>
      </div>
    )
  }

  // Si ya está instalada o fue descartada, no mostrar nada
  if (esStandalone || descartado) return null

  // 2. Banner de instalación Android / Chrome
  if (canInstall) {
    return (
      <div className="relative border-b border-tinta-200 bg-tinta-50 px-4 py-2.5 text-tinta-900 transition-all">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-tinta-600 text-white shadow-sm">
              <Download className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate">Instalá la app en tu teléfono</p>
              <p className="text-xs text-grafito-500 hidden sm:block">Accedé más rápido y tomá lista incluso sin señal de internet.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Boton
              variante="primario"
              className="h-8 px-3 text-xs"
              onClick={() => void instalar()}
            >
              Instalar
            </Boton>
            <BotonIcono
              className="size-8 text-grafito-500 hover:bg-grafito-200"
              onClick={descartar}
              aria-label="Cerrar aviso"
            >
              <X className="size-4" />
            </BotonIcono>
          </div>
        </div>
      </div>
    )
  }

  // 3. Guía rápida para iOS Safari
  if (esIOS && !mostrarGuiaIOS) {
    return (
      <div className="relative border-b border-tinta-200 bg-tinta-50 px-4 py-2.5 text-tinta-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Share className="size-4 text-tinta-600" />
            <span>Usá San Roque como app en tu iPhone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMostrarGuiaIOS(true)}
              className="text-xs font-bold text-tinta-700 underline"
            >
              ¿Cómo instalar?
            </button>
            <BotonIcono
              className="size-7 text-grafito-500 hover:bg-grafito-200"
              onClick={descartar}
              aria-label="Cerrar"
            >
              <X className="size-3.5" />
            </BotonIcono>
          </div>
        </div>
      </div>
    )
  }

  if (esIOS && mostrarGuiaIOS) {
    return (
      <div className="fixed inset-x-0 bottom-16 z-50 p-4 lg:bottom-4">
        <div className="mx-auto max-w-md rounded-2xl bg-grafito p-4 text-white shadow-2xl anim-subir">
          <div className="flex items-start justify-between">
            <p className="font-bold text-base">Instalar en iPhone / iPad</p>
            <button onClick={descartar} className="text-grafito-300 hover:text-white">
              <X className="size-5" />
            </button>
          </div>
          <ol className="mt-3 space-y-2 text-sm text-grafito-200">
            <li className="flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-tinta-600 text-xs font-bold text-white">1</span>
              Tocá el botón <strong>Compartir</strong> <Share className="inline size-4 text-tinta-200" /> abajo en Safari.
            </li>
            <li className="flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-tinta-600 text-xs font-bold text-white">2</span>
              Deslizá hacia abajo y elegí <strong>"Agregar al inicio" ⊞</strong>.
            </li>
          </ol>
          <Boton
            variante="secundario"
            className="mt-4 w-full h-9 text-xs"
            onClick={descartar}
          >
            Entendido
          </Boton>
        </div>
      </div>
    )
  }

  return null
}
