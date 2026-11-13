import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El frontend llama a /api; Vite lo reenvía a Django. (/media no se publica: los archivos van por /api/archivos/)
// Así los celulares de la red del colegio usan una sola dirección (http://IP-de-la-PC:5173).
const DJANGO = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      '/api': DJANGO,
    },
  },
  preview: {
    host: true,
    proxy: {
      '/api': DJANGO,
    },
  },
})
