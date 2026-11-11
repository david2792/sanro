export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/** Fecha local en formato AAAA-MM-DD (no UTC). */
export function hoyISO(d = new Date()) {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function fechaLarga(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(a, m - 1, d)
  return `${DIAS[f.getDay()]} ${d} de ${MESES[m - 1]}`
}

/** "2026-11" -> "noviembre 2026" */
export function nombreMes(ym: string) {
  const [a, m] = ym.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}

/** "2026-11" + 1 -> "2026-12" */
export function sumarMes(ym: string, delta: number) {
  const [a, m] = ym.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function fechaCorta(iso?: string | null) {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** UUID v4 que funciona también por http en la red local (sin crypto.randomUUID). */
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * 200000 -> "200.000". Siempre con punto de miles, también en 4 cifras (1.500):
 * Intl en español no agrupa los números de 4 cifras.
 */
export function miles(n: number | string | null | undefined) {
  const v = Math.round(Number(n) || 0)
  return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** 25000 -> "Gs. 25.000" */
export function guaranies(n: number | string | null | undefined) {
  return `Gs. ${miles(n)}`
}

export const MES_CORTO = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Descarga una tabla como CSV que Excel abre bien en español (separador ; y acentos). */
export function descargarCSV(nombre: string, filas: (string | number | null | undefined)[][]) {
  const celda = (v: string | number | null | undefined) => {
    const t = v == null ? '' : String(v)
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const texto = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function iniciales(nombre: string) {
  return nombre
    .replace(',', '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/** Días de clase: 1 = lunes … 6 = sábado (como en el backend). */
export const DIAS_SEMANA = [
  { n: 1, corto: 'Lun', largo: 'lunes' },
  { n: 2, corto: 'Mar', largo: 'martes' },
  { n: 3, corto: 'Mié', largo: 'miércoles' },
  { n: 4, corto: 'Jue', largo: 'jueves' },
  { n: 5, corto: 'Vie', largo: 'viernes' },
  { n: 6, corto: 'Sáb', largo: 'sábado' },
]

/** [2, 4] -> "martes y jueves" */
export function diasTexto(dias?: number[] | null) {
  const nombres = DIAS_SEMANA.filter((d) => dias?.includes(d.n)).map((d) => d.largo)
  if (!nombres.length) return ''
  return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** Día de la semana de una fecha AAAA-MM-DD, en la misma numeración (1 = lunes, 7 = domingo). */
export function diaSemana(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  return ((new Date(a, m - 1, d).getDay() + 6) % 7) + 1
}

/** "2026-11-11" + 3 -> "2026-11-14" */
export function sumarDias(iso: string, n: number) {
  const [a, m, d] = iso.split('-').map(Number)
  return hoyISO(new Date(a, m - 1, d + n))
}

/** El lunes de la semana de una fecha (el domingo cuenta con la semana que termina). */
export const lunesDe = (iso: string) => sumarDias(iso, 1 - diaSemana(iso))

/** Si la materia tiene clase ese día. Sin días cargados se considera que sí. */
export function tieneClase(dias: number[] | null | undefined, iso: string) {
  return !dias?.length || dias.includes(diaSemana(iso))
}

/**
 * Enlace de WhatsApp para un teléfono de Paraguay: "0981 123 456" -> https://wa.me/595981123456?text=…
 * Devuelve null si el número no parece válido.
 */
export function whatsappUrl(telefono: string | null | undefined, texto = '') {
  let n = (telefono ?? '').replace(/\D/g, '')
  if (n.startsWith('00')) n = n.slice(2)
  if (n.startsWith('0')) n = '595' + n.slice(1)
  else if (!n.startsWith('595') && n.length === 9) n = '595' + n
  if (n.length < 11) return null
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

/** Bloque del horario de una materia: dia 1 = lunes, horas "HH:MM". */
export type Bloque = { dia: number; inicio: string; fin: string }

/** Hora actual "HH:MM". */
export function horaActual(d = new Date()) {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${z(d.getHours())}:${z(d.getMinutes())}`
}

/** "07:00" -> 420 */
export function aMinutos(hora: string) {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))
}

/** 85 -> "1 h 25 min" */
export function duracion(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/** Bloques de una materia en una fecha, ordenados por hora. */
export function bloquesDelDia(horario: Bloque[] | null | undefined, iso: string) {
  const dia = diaSemana(iso)
  return (horario ?? []).filter((b) => b.dia === dia).sort((a, b) => a.inicio.localeCompare(b.inicio))
}

/** Días con su hora: "Lun 07:00 · Mié 09:20 · Vie" (los días sin hora van solos). */
export function horarioTexto(dias: number[] | null | undefined, horario: Bloque[] | null | undefined) {
  return DIAS_SEMANA.filter((d) => dias?.includes(d.n))
    .map((d) => {
      const horas = (horario ?? []).filter((b) => b.dia === d.n).map((b) => b.inicio)
      return [d.corto, ...horas].join(' ')
    })
    .join(' · ')
}

/**
 * Revisa lo cargado antes de guardar: devuelve el horario limpio (sin bloques vacíos)
 * o el mensaje de error.
 */
export function horarioListo(horario: Bloque[]): { horario: Bloque[]; error?: string } {
  const limpio: Bloque[] = []
  for (const b of horario) {
    if (!b.inicio && !b.fin) continue
    const nombre = DIAS_SEMANA.find((x) => x.n === b.dia)?.largo
    if (!b.inicio || !b.fin) return { horario, error: `Completá la hora de inicio y de fin del ${nombre}, o quitá ese horario.` }
    if (b.inicio >= b.fin) return { horario, error: `El ${nombre}, la hora de fin debe ser posterior a la de inicio.` }
    limpio.push(b)
  }
  return { horario: limpio }
}

/** "2026-11-11T14:05:00" -> "11/11/2026 14:05" */
export function fechaHora(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('es-PY')} ${d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`
}
