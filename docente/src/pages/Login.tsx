import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Sparkles,
  User,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Navigate } from 'react-router'
import { ErrorCaja } from '../components/ui'
import { useAuth } from '../lib/auth'

const ANIO_ACTUAL = new Date().getFullYear()

export default function Login() {
  const { usuario, entrar } = useAuth()
  const [u, setU] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sr_recordar_usuario') || ''
    }
    return ''
  })
  const [p, setP] = useState('')
  const [recordar, setRecordar] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('sr_recordar_usuario')
    }
    return false
  })
  const [mostrarPass, setMostrarPass] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (recordar && u.trim()) {
      localStorage.setItem('sr_recordar_usuario', u.trim())
    } else if (!recordar) {
      localStorage.removeItem('sr_recordar_usuario')
    }
  }, [recordar, u])

  if (usuario) return <Navigate to="/" replace />

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError('')
    try {
      await entrar(u.trim(), p)
    } catch (err: any) {
      setError(err?.status === 401 ? 'Usuario o contraseña incorrectos.' : err?.message ?? 'No se pudo iniciar sesión.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#0a1128] font-sans text-white flex flex-col lg:flex-row">
      {/* Luces y mallas de fondo dinámicas (Glow Auroras de alta tecnología) */}
      <div className="pointer-events-none absolute -left-40 -top-40 size-[32rem] rounded-full bg-blue-600/20 blur-[130px] filter" />
      <div className="pointer-events-none absolute -bottom-32 right-0 size-[36rem] rounded-full bg-indigo-500/15 blur-[140px] filter" />
      <div className="pointer-events-none absolute top-1/2 left-1/3 size-[24rem] rounded-full bg-amber-500/10 blur-[120px] filter" />
      
      {/* Patrón sutil de cuadrícula tecnológica */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      {/* ==================================================================== */}
      {/* COLUMNA IZQUIERDA: SHOWCASE INSTITUCIONAL DE VANGUARDIA              */}
      {/* ==================================================================== */}
      <div className="relative z-10 flex flex-col justify-between px-6 pt-10 pb-8 sm:px-10 lg:w-7/12 lg:p-16 xl:p-20">
        {/* Cabecera / Identidad */}
        <div>
          <div className="inline-flex items-center gap-2.5 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 backdrop-blur-md">
            <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold tracking-wide uppercase text-blue-200">
              🇵🇾 San Roque · Gestión Académica 2.0
            </span>
            <span className="rounded bg-blue-400/20 px-1.5 py-0.2 text-[10px] font-extrabold text-blue-300">
              PRO
            </span>
          </div>

          <div className="mt-8 flex items-center gap-5">
            <div className="relative size-20 sm:size-24 shrink-0 rounded-2xl bg-gradient-to-br from-blue-900/60 to-slate-900/80 p-1.5 border border-white/20 shadow-2xl backdrop-blur-md">
              <img
                src="/logo-san-roque.png"
                alt="Escudo Colegio Nacional San Roque González de Santacruz"
                className="size-full object-contain filter drop-shadow-[0_4px_12px_rgba(30,58,138,0.7)]"
              />
              <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-amber-500 text-slate-950 shadow-md">
                <Sparkles className="size-3.5 fill-current" />
              </span>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-300">
                Colegio Nacional E.M.D.
              </p>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
                San Roque González de Santacruz
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-400">
                Coronel Oviedo · República del Paraguay
              </p>
            </div>
          </div>
        </div>

        {/* Mensaje de Vanguardia Educativa */}
        <div className="my-8 lg:my-0 space-y-4 max-w-xl">
          <h2 className="text-3xl sm:text-4xl xl:text-5xl font-black tracking-tight leading-[1.15] text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-blue-200">
            La plataforma escolar más moderna e inteligente del país.
          </h2>
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            Diseñada para la máxima agilidad docente y precisión directiva. Control de asistencia, seguimiento institucional y gestión académica en tiempo real.
          </p>
        </div>

        {/* Pie de página institucional */}
        <div className="hidden lg:flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
          <span>© {ANIO_ACTUAL} Colegio Nacional San Roque González</span>
          <span className="flex items-center gap-1.5 text-blue-300 font-bold">
            <CheckCircle2 className="size-3.5 text-emerald-400" /> Sistema Verificado E.M.D.
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* COLUMNA DERECHA: FORMULARIO GLASSMORPHISM ULTRA MODERNO              */}
      {/* ==================================================================== */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Tarjeta de Inicio de Sesión Glassmorphism */}
          <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/10 p-7 sm:p-9 shadow-2xl backdrop-blur-2xl">
            {/* Efecto de brillo superior de borde */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-400 to-amber-400" />

            <div className="mb-7">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-200">
                  <Lock className="size-3" /> Acceso Protegido
                </span>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Docente & Directivo
                </span>
              </div>
              <h3 className="mt-3 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Iniciar Sesión
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                Ingresá con tus credenciales institucionales para acceder.
              </p>
            </div>

            <form onSubmit={enviar} className="space-y-5">
              {/* Campo Usuario */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Usuario o Cédula
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <User className="size-5" />
                  </div>
                  <input
                    type="text"
                    value={u}
                    onChange={(e) => setU(e.target.value)}
                    placeholder="Ej. docente.sanroque"
                    autoComplete="username"
                    autoCapitalize="none"
                    required
                    autoFocus
                    className="h-12 w-full rounded-xl border border-white/20 bg-white/10 pl-11 pr-4 text-[16px] text-white placeholder:text-slate-400 transition-all focus:border-blue-400 focus:bg-white/15 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Contraseña
                  </label>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Lock className="size-5" />
                  </div>
                  <input
                    type={mostrarPass ? 'text' : 'password'}
                    value={p}
                    onChange={(e) => setP(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="h-12 w-full rounded-xl border border-white/20 bg-white/10 pl-11 pr-11 text-[16px] text-white placeholder:text-slate-400 transition-all focus:border-blue-400 focus:bg-white/15 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPass(!mostrarPass)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-white transition-colors"
                    aria-label={mostrarPass ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {mostrarPass ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              {/* Opciones adicionales: Recordar cuenta */}
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={recordar}
                    onChange={(e) => setRecordar(e.target.checked)}
                    className="size-4 rounded border-white/20 bg-white/10 accent-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                  <span>Recordar mi usuario</span>
                </label>
                <a
                  href="#ayuda"
                  onClick={(e) => {
                    e.preventDefault()
                    alert('Para restablecer tu contraseña o activar tu cuenta docente, contactá con la Secretaría del Colegio Nacional San Roque González.')
                  }}
                  className="font-bold text-blue-300 hover:text-blue-200 transition-colors"
                >
                  ¿Olvidaste tu clave?
                </a>
              </div>

              {/* Caja de error estilizada */}
              <ErrorCaja error={error} />

              {/* Botón de Entrada Principal Neón/Gradiente */}
              <button
                type="submit"
                disabled={cargando}
                className="group relative flex h-13 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 px-6 font-bold text-white shadow-lg shadow-blue-600/35 transition-all duration-300 hover:shadow-blue-600/50 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {/* Resplandor animado de botón */}
                <span className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative z-10 text-base font-bold">
                  {cargando ? 'Iniciando sesión...' : 'Ingresar al Sistema'}
                </span>
                {!cargando && (
                  <ArrowRight className="relative z-10 size-5 transition-transform duration-300 group-hover:translate-x-1" />
                )}
              </button>
            </form>

            {/* Aviso de seguridad y soporte */}
            <div className="mt-6 border-t border-white/10 pt-4 text-center">
              <p className="text-xs text-slate-400">
                ¿Problemas para acceder? Dirigite a Secretaría o Coordinación Académica.
              </p>
            </div>
          </div>

          {/* Insignia móvil inferior */}
          <div className="mt-4 text-center lg:hidden">
            <p className="text-xs text-slate-400">
              Colegio Nacional E.M.D. San Roque González de Santacruz
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
