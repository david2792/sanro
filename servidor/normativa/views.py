from datetime import date

from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from academico.views import FiltroParamsMixin
from nucleo.instituciones import id_institucion
from personas.permisos import EsGestion, EsPersonal
from .models import FuenteNormativa, ReglaNormativa, VersionRegla
from .serializers import FuenteNormativaSerializer, ReglaNormativaSerializer, VersionReglaSerializer
from .servicios import ReglaNoDefinida, aprobar_version, resolver_regla


def _puede_editar(usuario, obj):
    """Lo general (sin institución) solo lo toca un superusuario; lo de un colegio, su gestión."""
    if usuario.is_superuser:
        return True
    return obj.institucion_id is not None and obj.institucion_id == usuario.institucion_id


class PermisoNormativa(BasePermission):
    """Todo el personal consulta; gestión carga lo de su institución."""

    def has_permission(self, request, view):
        if not EsPersonal().has_permission(request, view):
            return False
        return request.method in SAFE_METHODS or request.user.es_gestion

    def has_object_permission(self, request, view, obj):
        return request.method in SAFE_METHODS or _puede_editar(request.user, obj)


class SoloSuperusuarioEscribe(BasePermission):
    """El catálogo de reglas lo usa el programa: solo un superusuario agrega o cambia códigos."""

    def has_permission(self, request, view):
        if not EsPersonal().has_permission(request, view):
            return False
        return request.method in SAFE_METHODS or request.user.is_superuser


class GeneralesYPropiasMixin(FiltroParamsMixin):
    """Muestra lo general (sin institución) y lo de la institución del usuario."""

    def get_queryset(self):
        qs = super().get_queryset()
        iid = id_institucion(self.request)
        if iid is None and self.request.user.is_superuser:
            return qs
        return qs.filter(Q(institucion__isnull=True) | Q(institucion_id=iid))

    def perform_create(self, serializer):
        # Lo que carga un colegio es suyo; un superusuario sin institución carga normas generales.
        serializer.save(institucion_id=id_institucion(self.request))


class FuenteNormativaViewSet(GeneralesYPropiasMixin, viewsets.ModelViewSet):
    queryset = FuenteNormativa.objects.all()
    serializer_class = FuenteNormativaSerializer
    permission_classes = [PermisoNormativa]
    filtros = ["tipo", "verificacion"]

    @action(detail=True, methods=["post"])
    def verificar(self, request, pk=None):
        """Marca la fuente como verificada contra la copia oficial."""
        fuente = self.get_object()
        fuente.verificacion = FuenteNormativa.Verificacion.VERIFICADA
        fuente.verificada_por = request.user
        fuente.verificada_en = timezone.localdate()
        fuente.save()
        return Response(self.get_serializer(fuente).data)


class ReglaNormativaViewSet(FiltroParamsMixin, viewsets.ModelViewSet):
    queryset = ReglaNormativa.objects.all()
    serializer_class = ReglaNormativaSerializer
    permission_classes = [SoloSuperusuarioEscribe]
    filtros = ["area", "codigo"]


class VersionReglaViewSet(GeneralesYPropiasMixin, viewsets.ModelViewSet):
    queryset = VersionRegla.objects.select_related("regla", "fuente")
    serializer_class = VersionReglaSerializer
    permission_classes = [PermisoNormativa]
    filtros = ["regla", "regla__codigo", "estado", "nivel", "modalidad"]

    def perform_destroy(self, instance):
        if instance.estado != VersionRegla.Estado.BORRADOR:
            raise ValidationError("Solo se borran borradores. Una versión revisada o aprobada se sustituye o deroga.")
        instance.delete()

    @action(detail=True, methods=["post"], permission_classes=[EsGestion])
    def aprobar(self, request, pk=None):
        version = self.get_object()
        if not _puede_editar(request.user, version):
            raise ValidationError("Las reglas generales solo las aprueba un superusuario.")
        if version.estado not in (VersionRegla.Estado.BORRADOR, VersionRegla.Estado.REVISION):
            raise ValidationError("Solo se aprueban versiones en borrador o en revisión.")
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            aprobar_version(version, request.user)
        except DjangoValidationError as e:
            raise ValidationError(e.message_dict if hasattr(e, "error_dict") else e.messages)
        return Response(self.get_serializer(version).data)


@api_view(["GET"])
@permission_classes([EsPersonal])
def resolver(request):
    """
    Qué versión de una regla se aplica: GET /api/normativa/resolver/?codigo=X&fecha=AAAA-MM-DD&nivel=EM&modalidad=TECNICO
    """
    p = request.query_params
    if not p.get("codigo"):
        raise ValidationError("Indicá el código de la regla.")
    try:
        fecha = date.fromisoformat(p["fecha"]) if p.get("fecha") else None
    except ValueError:
        raise ValidationError("Fecha inválida. Usá el formato AAAA-MM-DD.")
    try:
        version = resolver_regla(p["codigo"], institucion=id_institucion(request), fecha=fecha,
                                 nivel=p.get("nivel"), modalidad=p.get("modalidad"))
    except ReglaNoDefinida as e:
        return Response({"detail": str(e)}, status=404)
    return Response(VersionReglaSerializer(version, context={"request": request}).data)
