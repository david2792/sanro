import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import { REFERENCIALES } from './pages/gestion/referenciales'
import { AvisosProvider, Cargando } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'

// Route-level code splitting con React.lazy para carga ultrarrápida en móviles
const Login = lazy(() => import('./pages/Login'))
const Perfil = lazy(() => import('./pages/Perfil'))
const MisClases = lazy(() => import('./pages/docente/MisClases'))
const Clase = lazy(() => import('./pages/docente/Clase'))
const Tablero = lazy(() => import('./pages/gestion/Tablero'))
const PlanesAnuales = lazy(() => import('./pages/gestion/PlanesAnuales'))
const ControlPlanificacion = lazy(() => import('./pages/gestion/ControlPlanificacion'))
const SeguimientoMateria = lazy(() => import('./pages/gestion/SeguimientoMateria'))
const CrudPage = lazy(() => import('./components/Crud').then((m) => ({ default: m.CrudPage })))
const AlumnoDetalle = lazy(() => import('./pages/gestion/Detalles').then((m) => ({ default: m.AlumnoDetalle })))
const SeccionDetalle = lazy(() => import('./pages/gestion/Detalles').then((m) => ({ default: m.SeccionDetalle })))
const CursoDetalle = lazy(() => import('./pages/gestion/Detalles').then((m) => ({ default: m.CursoDetalle })))
const GestionInicio = lazy(() => import('./pages/gestion/Gestion').then((m) => ({ default: m.GestionInicio })))
const RefPage = lazy(() => import('./pages/gestion/Gestion').then((m) => ({ default: m.RefPage })))
const Ausencias = lazy(() => import('./pages/gestion/Ausencias'))
const PanelAportes = lazy(() => import('./pages/aportes/Panel'))
const Cobrar = lazy(() => import('./pages/aportes/Cobrar'))
const SeccionAportes = lazy(() => import('./pages/aportes/Seccion'))
const ReportesAportes = lazy(() => import('./pages/aportes/Reportes'))
const ConfiguracionAportes = lazy(() => import('./pages/aportes/Configuracion'))

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
})

function Protegida({ children, soloGestion, soloAportes }: { children: ReactNode; soloGestion?: boolean; soloAportes?: boolean }) {
  const { usuario, cargando, esGestion, veAportes } = useAuth()
  if (cargando && !usuario) return <Cargando />
  if (!usuario) return <Navigate to="/login" replace />
  if (soloGestion && !esGestion) return <Navigate to="/" replace />
  if (soloAportes && !veAportes) return <Navigate to="/" replace />
  return children
}

function Inicio() {
  const { usuario, esGestion, esDocente } = useAuth()
  const destino = esGestion ? '/tablero' : esDocente ? '/clases' : usuario?.rol === 'ACES' ? '/aportes' : '/perfil'
  return <Navigate to={destino} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <AvisosProvider>
          <BrowserRouter>
            <Suspense fallback={<Cargando texto="Abriendo..." />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<Protegida><Layout /></Protegida>}>
                  <Route index element={<Inicio />} />
                  <Route path="clases" element={<MisClases />} />
                  <Route path="clases/:id" element={<Clase />} />
                  <Route path="perfil" element={<Perfil />} />
                  <Route path="tablero" element={<Tablero />} />
                  <Route path="alumnos" element={<Protegida soloGestion><CrudPage config={REFERENCIALES.alumnos} /></Protegida>} />
                  <Route path="alumnos/:id" element={<AlumnoDetalle />} />
                  <Route path="secciones/:id" element={<SeccionDetalle />} />
                  <Route path="cursos/:id" element={<Protegida soloGestion><CursoDetalle /></Protegida>} />
                  <Route path="planes" element={<Protegida soloGestion><PlanesAnuales /></Protegida>} />
                  <Route path="planificacion" element={<Protegida soloGestion><ControlPlanificacion /></Protegida>} />
                  <Route path="seguimiento/:id" element={<Protegida soloGestion><SeguimientoMateria /></Protegida>} />
                <Route path="ref" element={<Protegida soloGestion><GestionInicio /></Protegida>} />
                  <Route path="ref/:clave" element={<Protegida soloGestion><RefPage /></Protegida>} />
                  <Route path="ausencias" element={<Protegida soloGestion><Ausencias /></Protegida>} />
                  <Route path="aportes" element={<Protegida soloAportes><PanelAportes /></Protegida>} />
                  <Route path="aportes/cobrar" element={<Protegida soloAportes><Cobrar /></Protegida>} />
                  <Route path="aportes/secciones/:id" element={<Protegida soloAportes><SeccionAportes /></Protegida>} />
                  <Route path="aportes/reportes" element={<Protegida soloAportes><ReportesAportes /></Protegida>} />
                  <Route path="aportes/configuracion" element={<Protegida soloAportes><ConfiguracionAportes /></Protegida>} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AvisosProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
