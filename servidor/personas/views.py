from rest_framework import filters, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Alumno, AlumnoTutor, Docente, DocumentoAlumno, Tutor, Usuario
from .permisos import EsGestion, GestionEscribePersonalLee
from .serializers import (AlumnoSerializer, AlumnoTutorSerializer, DocenteSerializer,
                          DocumentoAlumnoSerializer, TutorSerializer, UsuarioSerializer)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def yo(request):
    """Datos del usuario logueado (rol, docente asociado). React lo usa al iniciar sesión."""
    return Response(UsuarioSerializer(request.user).data)


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.all().order_by("username")
    serializer_class = UsuarioSerializer
    permission_classes = [EsGestion]
    filter_backends = [filters.SearchFilter]
    search_fields = ["username", "first_name", "last_name", "ci"]


class AlumnoViewSet(viewsets.ModelViewSet):
    queryset = Alumno.objects.prefetch_related("alumnotutor_set__tutor", "documentos")
    serializer_class = AlumnoSerializer
    permission_classes = [GestionEscribePersonalLee]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["ci", "nombres", "apellidos"]

    @action(detail=True)
    def asistencia(self, request, pk=None):
        """Porcentaje de asistencia del alumno en el año lectivo activo."""
        from academico.models import Institucion, Matricula
        from asistencia.serializers import resumen_asistencia

        inst = Institucion.objects.first()
        minimo = inst.asistencia_minima if inst else 80
        qs = Matricula.objects.filter(alumno_id=pk, anio_lectivo__activo=True)
        filas = resumen_asistencia(qs, minimo)
        return Response(filas[0] if filas else {})


class TutorViewSet(viewsets.ModelViewSet):
    queryset = Tutor.objects.all()
    serializer_class = TutorSerializer
    permission_classes = [GestionEscribePersonalLee]
    filter_backends = [filters.SearchFilter]
    search_fields = ["ci", "nombres", "apellidos", "telefono"]


class AlumnoTutorViewSet(viewsets.ModelViewSet):
    queryset = AlumnoTutor.objects.select_related("tutor")
    serializer_class = AlumnoTutorSerializer
    permission_classes = [GestionEscribePersonalLee]


class DocumentoAlumnoViewSet(viewsets.ModelViewSet):
    queryset = DocumentoAlumno.objects.all()
    serializer_class = DocumentoAlumnoSerializer
    permission_classes = [EsGestion]


class DocenteViewSet(viewsets.ModelViewSet):
    queryset = Docente.objects.select_related("usuario")
    serializer_class = DocenteSerializer
    permission_classes = [GestionEscribePersonalLee]
    filter_backends = [filters.SearchFilter]
    search_fields = ["ci", "nombres", "apellidos"]
