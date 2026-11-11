import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { sincronizar } from './lib/offline'

import { registrarServiceWorker } from './lib/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Envía las listas que quedaron guardadas sin señal.
void sincronizar()

// Registra Service Worker y detecta actualizaciones
registrarServiceWorker()

