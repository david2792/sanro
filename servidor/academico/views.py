from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from nucleo.instituciones import PorInstitucionMixin, institucion_de
from personas.permisos import EsPersonal, GestionEscribePersonalLee
from .models import (AnioLectivo, Asignacion, Curso, DiaNoLectivo, Especialidad, Etapa,
                     Institucion, Materia, Matricula, Nivel, PlanMateria, Seccion)
from .serializers import (AnioLectivoSerializer, AsignacionSerializer, CursoSerializer,
                          DiaNoLectivoSerializer, EspecialidadSerializer, EtapaSerializer,
                          InstitucionSerializer, MateriaSerializer, MatriculaSerializer,
                          NivelSerializer, PlanMateriaSerializer, SeccionSerializer)


class FiltroParamsMixin:
    """Permite filtrar con ?campo=valor para los campos listados en `filtros`."""

    filtros = []

    def get_queryset(self):
        qs = super().get_queryset()
        for campo in self.filtros:
            valor = self.request.query_params.get(campo)
            if valor not in (None, ""):
                qs = qs.filter(**{campo: valor})
        return qs


class Base(PorInstitucionMixin, FiltroParamsMixin, viewsets.ModelViewSet):
    permission_classes = [GestionEscribePersonalLee]


class InstitucionViewSet(Base):
    queryset = Institucion.objects.all()
    serializer_class = InstitucionSerializer
    campo_institucion = "pk"


class AnioLectivoViewSet(Base):
    queryset = AnioLectivo.objects.all()
    serializer_class = AnioLectivoSerializer


class EtapaViewSet(Base):
    queryset = Etapa.objects.all()
    serializer_class = EtapaSerializer
    campo_institucion = "anio_lectivo__institucion"
    filtros = ["anio_lectivo"]


class DiaNoLectivoViewSet(Base):
    queryset = DiaNoLectivo.objects.all()
    serializer_class = DiaNoLectivoSerializer
    campo_institucion = "anio_lectivo__institucion"
    filtros = ["anio_lectivo"]


class NivelViewSet(Base):
    queryset = Nivel.objects.all()
    serializer_class = NivelSerializer


class EspecialidadViewSet(Base):
    queryset = Especialidad.objects.all()
    serializer_class = EspecialidadSerializer
    campo_institucion = "nivel__institucion"
    filtros = ["nivel"]


class CursoViewSet(Base):
    queryset = Curso.objects.select_related("nivel", "especialidad")
    serializer_class = CursoSerializer
    campo_institucion = "nivel__institucion"
    filtros = ["nivel", "especialidad"]


class MateriaViewSet(Base):
    queryset = Materia.objects.all()
    serializer_class = MateriaSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["nombre"]


class PlanMateriaViewSet(Base):
    queryset = PlanMateria.objects.select_related("materia")
    serializer_class = PlanMateriaSerializer
    campo_institucion = "curso__nivel__institucion"
    filtros = ["curso"]


class SeccionViewSet(Base):
    queryset = Seccion.objects.select_related("curso__nivel", "curso__especialidad", "anio_lectivo")
    serializer_class = SeccionSerializer
    campo_institucion = "anio_lectivo__institucion"
    filtros = ["anio_lectivo", "curso", "turno"]

    @action(detail=True)
    def asistencia(self, request, pk=None):
        """Porcentaje de asistencia de cada alumno de la sección."""
        from asistencia.serializers import resumen_asistencia

        seccion = self.get_object()  # solo secciones de la institución del usuario
        minimo = institucion_de(request).asistencia_minima
        qs = Matricula.objects.filter(seccion=seccion, estado__in=Matricula.EN_CURSO)
        return Response({"minimo": minimo, "alumnos": resumen_asistencia(qs, minimo)})


class AsignacionViewSet(Base):
    queryset = Asignacion.objects.select_related("materia", "docente", "seccion__curso", "seccion__anio_lectivo")
    serializer_class = AsignacionSerializer
    campo_institucion = "seccion__anio_lectivo__institucion"
    filtros = ["seccion", "docente", "materia", "seccion__anio_lectivo"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Un docente solo ve sus propias clases.
        if not user.es_gestion:
            qs = qs.filter(docente__usuario=user)
        return qs

    @action(detail=False, permission_classes=[EsPersonal])
    def mias(self, request):
        """Clases del docente logueado en el año lectivo activo (pantalla de inicio del docente)."""
        qs = self.get_queryset().filter(docente__usuario=request.user, seccion__anio_lectivo__activo=True)
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[EsPersonal])
    def dias(self, request, pk=None):
        """
        El docente (o gestión) carga sus días y horas de clase:
        {dias_clase: [2, 4], horario: [{dia: 2, inicio: "07:00", fin: "07:40"}]}  (horario es opcional)
        """
        asignacion = self.get_object()  # un docente solo obtiene sus propias asignaciones
        datos = {k: request.data[k] for k in ("dias_clase", "horario") if k in request.data}
        s = AsignacionSerializer(asignacion, data=datos, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    @action(detail=True, permission_classes=[EsPersonal])
    def lista(self, request, pk=None):
        """Alumnos activos de la clase, en orden de lista, para llamar lista."""
        asignacion = self.get_object()
        qs = asignacion.seccion.matriculas.filter(estado__in=Matricula.EN_CURSO).select_related("alumno")
        qs = qs.order_by("numero_lista", "alumno__apellidos", "alumno__nombres")
        return Response([
            {"matricula": m.id, "numero_lista": m.numero_lista, "alumno_id": m.alumno_id,
             "alumno": str(m.alumno), "ci": m.alumno.ci}
            for m in qs
        ])


class MatriculaViewSet(Base):
    queryset = Matricula.objects.select_related("alumno", "seccion__curso", "seccion__anio_lectivo")
    serializer_class = MatriculaSerializer
    campo_institucion = "anio_lectivo__institucion"
    filtros = ["seccion", "alumno", "anio_lectivo", "estado"]
    filter_backends = [filters.SearchFilter]
    search_fields = ["alumno__ci", "alumno__nombres", "alumno__apellidos"]
    # La matrícula no se borra: se anula con motivo (estado ANULADA).
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    @action(detail=True, methods=["get", "post"], url_path="cambiar-seccion")
    def cambiar_seccion(self, request, pk=None):
        """
        GET: historial de cambios de sección. POST {seccion, fecha_efectiva, motivo, documento?}: pasa al alumno
        a otra sección del mismo año sin sobrescribir la historia.
        """
        from django.db import transaction

        from .serializers import CambioSeccionSerializer

        matricula = self.get_object()
        if request.method == "GET":
            return Response(CambioSeccionSerializer(matricula.cambios_seccion.all(), many=True,
                                                    context={"request": request}).data)
        s = CambioSeccionSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        nueva = s.validated_data["seccion_nueva"]
        if matricula.estado not in Matricula.EN_CURSO:
            raise ValidationError("Solo se cambia de sección a un alumno que está cursando.")
        if nueva == matricula.seccion:
            raise ValidationError({"seccion_nueva": "El alumno ya está en esa sección."})
        if nueva.anio_lectivo_id != matricula.anio_lectivo_id:
            raise ValidationError({"seccion_nueva": "La sección nueva debe ser del mismo año lectivo."})
        if not Seccion.objects.filter(pk=nueva.pk, anio_lectivo__institucion_id=matricula.anio_lectivo.institucion_id).exists():
            raise ValidationError({"seccion_nueva": "Sección no válida."})
        if s.validated_data["fecha_efectiva"] < matricula.fecha:
            raise ValidationError({"fecha_efectiva": "No puede ser anterior a la matriculación."})
        if nueva.inscriptos >= nueva.cupo:
            raise ValidationError({"seccion_nueva": f"La sección {nueva} ya completó su cupo ({nueva.cupo})."})
        with transaction.atomic():
            cambio = s.save(matricula=matricula, seccion_anterior=matricula.seccion, autorizado_por=request.user)
            matricula.seccion = nueva
            matricula.numero_lista = None  # el número de lista es de la sección anterior
            matricula.save()
        return Response(CambioSeccionSerializer(cambio, context={"request": request}).data, status=201)
