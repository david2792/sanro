from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from academico import views as acad
from aportes import views as apor
from asistencia import views as asis
from pedagogico import views as peda
from personas import views as pers

router = DefaultRouter()
# Personas
router.register("usuarios", pers.UsuarioViewSet)
router.register("alumnos", pers.AlumnoViewSet)
router.register("tutores", pers.TutorViewSet)
router.register("alumnos-tutores", pers.AlumnoTutorViewSet)
router.register("documentos-alumno", pers.DocumentoAlumnoViewSet)
router.register("docentes", pers.DocenteViewSet)
# Estructura académica
router.register("instituciones", acad.InstitucionViewSet)
router.register("anios-lectivos", acad.AnioLectivoViewSet)
router.register("etapas", acad.EtapaViewSet)
router.register("dias-no-lectivos", acad.DiaNoLectivoViewSet)
router.register("niveles", acad.NivelViewSet)
router.register("especialidades", acad.EspecialidadViewSet)
router.register("cursos", acad.CursoViewSet)
router.register("materias", acad.MateriaViewSet)
router.register("plan-materias", acad.PlanMateriaViewSet)
router.register("secciones", acad.SeccionViewSet)
router.register("asignaciones", acad.AsignacionViewSet)
router.register("matriculas", acad.MatriculaViewSet)
# Asistencia
router.register("sesiones", asis.SesionClaseViewSet, basename="sesion")
router.register("justificaciones", asis.JustificacionViewSet)
router.register("permisos-docentes", asis.PermisoDocenteViewSet)
# Pedagógico
router.register("unidades", peda.UnidadViewSet)
router.register("capacidades", peda.CapacidadViewSet)
router.register("indicadores", peda.IndicadorViewSet)
router.register("registros-clase", peda.RegistroClaseViewSet)
router.register("planes-clase", peda.PlanClaseViewSet)
router.register("sugerencias", peda.SugerenciaViewSet)
router.register("anecdoticos", peda.RegistroAnecdoticoViewSet)
router.register("instrumentos", peda.InstrumentoViewSet)
# Aportes de padres (ACES)
router.register("aportes/conceptos", apor.ConceptoAporteViewSet)
router.register("aportes/exoneraciones", apor.ExoneracionViewSet)
router.register("aportes/pagos", apor.PagoViewSet)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", TokenObtainPairView.as_view()),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/yo/", pers.yo),
    path("api/reportes/resumen-dia/", asis.resumen_dia),
    path("api/reportes/panel/", asis.panel),
    path("api/reportes/ausencias/", asis.reporte_ausencias),
    path("api/aportes/panel/", apor.panel),
    path("api/aportes/secciones/", apor.secciones),
    path("api/aportes/secciones/<int:pk>/", apor.seccion),
    path("api/aportes/cursos/", apor.cursos),
    path("api/aportes/matriculas/", apor.matriculas),
    path("api/aportes/reportes/recaudacion/", apor.reporte_recaudacion),
    path("api/aportes/reportes/morosos/", apor.reporte_morosos),
    path("api/planilla/", peda.planilla),
    path("api/planes-anuales/", peda.planes_anuales),
    path("api/plan-anual/<int:asignacion_id>/", peda.plan_anual),
    path("api/plan-anual/<int:asignacion_id>/<str:accion>/", peda.plan_anual),
    path("api/frases/", peda.frases),
    path("api/ficha/", peda.ficha),
    path("api/planificacion/control/", peda.control_planificacion),
    path("api/evaluaciones/", peda.evaluaciones_seccion),
    path("api/", include(router.urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
