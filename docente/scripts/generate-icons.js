import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#122454" />
      <stop offset="50%" stop-color="#1d3b8b" />
      <stop offset="100%" stop-color="#2a4fb0" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#091124" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Fondo app -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />

  <!-- Cuaderno escolar con sombra -->
  <g filter="url(#shadow)">
    <!-- Tapa posterior -->
    <rect x="110" y="96" width="292" height="320" rx="20" fill="#203974" />
    
    <!-- Hoja blanca de cuaderno -->
    <rect x="118" y="104" width="276" height="304" rx="16" fill="#fcfdfe" />
    
    <!-- Margen rojo escolar -->
    <line x1="178" y1="104" x2="178" y2="408" stroke="#d9534f" stroke-width="4" stroke-linecap="round" />
    
    <!-- Renglones de tinta azul -->
    <line x1="198" y1="160" x2="360" y2="160" stroke="#3b5fc4" stroke-width="6" stroke-linecap="round" />
    <line x1="198" y1="208" x2="340" y2="208" stroke="#3b5fc4" stroke-width="6" stroke-linecap="round" />
    <line x1="198" y1="256" x2="360" y2="256" stroke="#3b5fc4" stroke-width="6" stroke-linecap="round" />
    <line x1="198" y1="304" x2="310" y2="304" stroke="#3b5fc4" stroke-width="6" stroke-linecap="round" />
    <line x1="198" y1="352" x2="350" y2="352" stroke="#3b5fc4" stroke-width="6" stroke-linecap="round" />

    <!-- Tilde / verificación de asistencia dorada -->
    <circle cx="340" cy="336" r="38" fill="url(#goldGrad)" filter="url(#shadow)" />
    <path d="M324 336 l10 10 l22 -22" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>
`

const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#122454" />
      <stop offset="50%" stop-color="#1d3b8b" />
      <stop offset="100%" stop-color="#2a4fb0" />
    </linearGradient>
    <linearGradient id="goldGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>

  <!-- Fondo completo para maskable -->
  <rect width="512" height="512" fill="url(#bgGrad2)" />

  <!-- Safe area centrada (radio menor) -->
  <g transform="translate(32, 32) scale(0.875)">
    <rect x="118" y="104" width="276" height="304" rx="16" fill="#fcfdfe" />
    <line x1="178" y1="104" x2="178" y2="408" stroke="#d9534f" stroke-width="5" />
    <line x1="198" y1="160" x2="360" y2="160" stroke="#3b5fc4" stroke-width="7" stroke-linecap="round" />
    <line x1="198" y1="210" x2="340" y2="210" stroke="#3b5fc4" stroke-width="7" stroke-linecap="round" />
    <line x1="198" y1="260" x2="360" y2="260" stroke="#3b5fc4" stroke-width="7" stroke-linecap="round" />
    <line x1="198" y1="310" x2="310" y2="310" stroke="#3b5fc4" stroke-width="7" stroke-linecap="round" />
    <line x1="198" y1="360" x2="350" y2="360" stroke="#3b5fc4" stroke-width="7" stroke-linecap="round" />

    <circle cx="340" cy="336" r="38" fill="url(#goldGrad2)" />
    <path d="M324 336 l10 10 l22 -22" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>
`

async function main() {
  const publicDir = path.resolve('public')
  
  // 512x512
  await sharp(Buffer.from(svgContent))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'))
  console.log('pwa-512x512.png OK')

  // 192x192
  await sharp(Buffer.from(svgContent))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'))
  console.log('pwa-192x192.png OK')

  // Apple touch icon 180x180
  await sharp(Buffer.from(svgContent))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'))
  console.log('apple-touch-icon.png OK')

  // Maskable 512x512
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'))
  console.log('pwa-maskable-512x512.png OK')
}

main().catch(console.error)
