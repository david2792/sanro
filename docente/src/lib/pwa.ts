import { useState, useSyncExternalStore } from 'react'

let deferredPrompt: any = null
const installListeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    installListeners.forEach((fn) => fn())
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installListeners.forEach((fn) => fn())
  })
}

export function usePwaInstall() {
  const [esStandalone] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    )
  })

  const [esIOS] = useState(() => {
    if (typeof window === 'undefined') return false
    const ua = window.navigator.userAgent.toLowerCase()
    return /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream
  })

  const canInstall = useSyncExternalStore(
    (onStoreChange) => {
      installListeners.add(onStoreChange)
      return () => installListeners.delete(onStoreChange)
    },
    () => deferredPrompt !== null,
  )


  const instalar = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      deferredPrompt = null
      installListeners.forEach((fn) => fn())
      return true
    }
    return false
  }

  return {
    canInstall,
    esStandalone,
    esIOS,
    instalar,
  }
}

// Registro y detector de actualizaciones del Service Worker
export function registrarServiceWorker(onNuevaVersion?: () => void) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      reg.addEventListener('updatefound', () => {
        const nuevoSW = reg.installing
        if (!nuevoSW) return
        nuevoSW.addEventListener('statechange', () => {
          if (nuevoSW.state === 'installed' && navigator.serviceWorker.controller) {
            onNuevaVersion?.()
            window.dispatchEvent(new CustomEvent('pwa-nueva-version', { detail: reg }))
          }
        })
      })

      // Verificar actualizaciones periódicamente (cada 30 min)
      setInterval(() => {
        reg.update().catch(() => {})
      }, 30 * 60 * 1000)
    } catch {
      // Entornos donde el SW no está habilitado
    }
  })
}

export function aplicarActualizacion() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        window.location.reload()
      }
    })
  }
}
