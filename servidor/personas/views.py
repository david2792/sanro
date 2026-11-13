from rest_framework import filters, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from nucleo.instituciones import PorInstitucionMixin, institucion_de
from .models import Alumno, AlumnoTutor, Docente, DocumentoAlumno, Tutor, Usuario
from .permisos import EsGestion, GestionEscribePersonalLee
from .serializers import (AlumnoSerializer, AlumnoTutorSerializer, DocenteSerializer,
                          DocumentoAlumnoSerializer, TutorSerializer, UsuarioSerializer)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def yo(request):
    """Datos del usuario logueado (rol, docente asociado). React lo usa al iniciar sesión."""
    return Response(UsuarioSerializer(request.user).data)


class UsuarioViewSet(PorInstitucionMixin, viewsets.ModelViewSet):
    queryset = Usuario.objects.all().order_by("username")
    serializer_class = UsuarioSerializer
    permission_classes = [EsGestion]
    filter_backends = [filters.SearchFilter]
    search_fields = ["username", "first_name", "last_name", "ci"]


class AlumnoViewSet(PorInstitucionMixin, viewsets.ModelViewSet):
    queryset = Alumno.objects.prefetch_related("alumnotutor_set__tutor", "documentos")
    serializer_class = AlumnoSerializer
    permission_classes = [GestionEscribePersonalLee]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["ci", "nombres", "apellidos"]

    @action(detail=True)
    def asistencia(self, request, pk=None):
        """Porcentaje de asistencia del alumno en el año lectivo activo."""
        from academico.models import Matricula
        from asistencia.serializers import resumen_asistencia

        alumno = self.get_object()  # solo alumnos de la institución del usuario
        minimo = institucion_de(request).asistencia_minima
        qs = Matricula.objects.filter(alumno=alumno, anio_lectivo__activo=True)
        filas = resumen_asistencia(qs, minimo)
        return Response(filas[0] if filas else {})


class TutorViewSet(PorInstitucionMixin, viewsets.ModelViewSet):
    queryset = Tutor.objects.all()
    serializer_class = TutorSerializer
    permission_classes = [GestionEscribePersonalLee]
    filter_backends = [filters.SearchFilter]
    search_fields = ["ci", "nombres", "apellidos", "telefono"]


class AlumnoTutorViewSet(PorInstitucionMixin, viewsets.ModelViewSet):
    campo_institucion = "alumno__institucion"
    queryset = AlumnoTutor.objects.select_related("tutor")
    serializer_class = AlumnoTutorSerializer
    permission_classes = [GestionEscribePersonalLee]


class DocumentoAlumnoViewSet(PorInstitucionMixin, viewsets.ModelViewSet):
    campo_institucion = "alumno__institucion"
    queryset = DocumentoAlumno.objects.all()
    serializer_class = DocumentoAlumnoSerializer
    permission_classes = [EsGestion]


class DocenteViewSet(PorInstitucionMixin, viewsets.ModelViewSet):
    queryset = Docente.objects.select_related("usuario")
    serializer_class = DocenteSerializer
    permission_classes = [GestionEscribePersonalLee]
    filter_backends = [filters.SearchFilter]
    search_fields = ["ci", "nombres", "apellidos"]
