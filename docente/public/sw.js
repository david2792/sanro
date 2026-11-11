// Service Worker para San Roque PWA
// Versión y caché para soporte offline real y actualizaciones controladas.
const CACHE_NAME = 'sanroque-v3'

const ASSETS_ESTATICOS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/logo-san-roque.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
]

// Instalación: precachea recursos esenciales y activa de inmediato
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_ESTATICOS)
    })
  )
  self.skipWaiting()
})

// Activación: limpia cachés antiguas y toma el control de los clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// Recepción de mensajes (ej. 'SKIP_WAITING' desde la UI)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Manejo de peticiones
self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Ignorar métodos que no sean GET o llamadas a Django (/api, /media)
  if (req.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/media')) {
    return
  }

  // 1. Navegación (HTML): Red primero, si falla recurre a /index.html en caché (SPA)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(req, copia))
          }
          return res
        })
        .catch(() => {
          return caches.match('/index.html').then((res) => res || caches.match('/'))
        })
    )
    return
  }

  // 2. Archivos estáticos con hash de Vite o fuentes: Caché primero, fallback a Red y guardar
  const esEstatico = url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png')

  if (esEstatico) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Opcional: revalidar en segundo plano si la red está disponible
          fetch(req)
            .then((fresh) => {
              if (fresh && fresh.status === 200) {
                caches.open(CACHE_NAME).then((c) => c.put(req, fresh))
              }
            })
            .catch(() => {})
          return cached
        }
        return fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copia = res.clone()
              caches.open(CACHE_NAME).then((c) => c.put(req, copia))
            }
            return res
          })
          .catch(() => caches.match('/index.html'))
      })
    )
    return
  }

  // 3. Demás peticiones GET
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone()
        caches.open(CACHE_NAME).then((c) => c.put(req, copia))
        return res
      })
      .catch(() => caches.match(req))
  )
})
