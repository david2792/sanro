"""
API de aportes voluntarios a la ACE. Solo totales y recibos emitidos: no hay planillas por sección,
deudas ni listas de familias que no aportaron (plan maestro 2.5 y 14.5).
"""
from collections import defaultdict
from datetime import date

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from academico.models import AnioLectivo, Matricula
from academico.views import FiltroParamsMixin
from nucleo.instituciones import PorInstitucionMixin, institucion_de
from personas.models import AlumnoTutor
from personas.permisos import PermisoACE
from .models import AsociacionACE, ConceptoAporte, LineaRecibo, Recibo
from .serializers import AsociacionACESerializer, ConceptoAporteSerializer, ReciboSerializer, cerrar_recibo


def _ace(request, obligatoria=True):
    ace = AsociacionACE.de_institucion(institucion_de(request).pk)
    if ace is None and obligatoria:
        raise ValidationError("Primero cargá los datos de la ACE (Aportes › Configuración).")
    return ace


def _anio(request):
    anio = AnioLectivo.actual(institucion_de(request))
    if anio is None:
        raise ValidationError("No hay un año lectivo activo. Activalo en Gestión › Años lectivos.")
    return anio


def _fecha(valor, por_defecto):
    if not valor:
        return por_defecto
    try:
        return date.fromisoformat(valor)
    except ValueError:
        raise ValidationError(f"Fecha inválida: {valor}. Usá el formato AAAA-MM-DD.")


@api_view(["GET", "PUT"])
@permission_classes([PermisoACE])
def ace(request):
    """Datos de la ACE de la institución: GET (null si todavía no se cargó) o PUT para cargarlos/actualizarlos."""
    actual = _ace(request, obligatoria=False)
    if request.method == "GET":
        return Response(AsociacionACESerializer(actual).data if actual else None)
    s = AsociacionACESerializer(actual, data=request.data, partial=actual is not None)
    s.is_valid(raise_exception=True)
    s.save(institucion=institucion_de(request))
    return Response(s.data)


class ConceptoAporteViewSet(PorInstitucionMixin, FiltroParamsMixin, viewsets.ModelViewSet):
    """Conceptos de aporte. Sin ?anio_lectivo= muestra los del año activo. No se borran: se desactivan."""

    queryset = ConceptoAporte.objects.select_related("anio_lectivo")
    serializer_class = ConceptoAporteSerializer
    permission_classes = [PermisoACE]
    filtros = ["anio_lectivo", "activo", "tipo"]
    campo_institucion = "ace__institucion"
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.query_params.get("anio_lectivo"):
            qs = qs.filter(anio_lectivo__activo=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(ace=_ace(self.request))


class ReciboViewSet(PorInstitucionMixin, FiltroParamsMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                    mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Recibos. No se editan ni se borran: un recibo equivocado se anula; uno cuyo dinero no se acreditó o se
    devolvió, se revierte. GET ?desde=&hasta=&estado=&medio=&concepto=&q=  ·  POST {id}/anular/ · {id}/revertir/
    """

    queryset = Recibo.objects.select_related("ace", "matricula__alumno", "registrado_por").prefetch_related(
        "lineas__concepto")
    serializer_class = ReciboSerializer
    permission_classes = [PermisoACE]
    filtros = ["estado", "medio", "serie", "ejercicio"]
    campo_institucion = "ace__institucion"

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("desde"):
            qs = qs.filter(fecha__gte=_fecha(p["desde"], None))
        if p.get("hasta"):
            qs = qs.filter(fecha__lte=_fecha(p["hasta"], None))
        if p.get("concepto"):
            qs = qs.filter(lineas__concepto_id=p["concepto"]).distinct()
        if p.get("q"):
            qs = qs.filter(Q(aportante_nombre__icontains=p["q"]) | Q(aportante_documento__icontains=p["q"]))
        return qs

    @action(detail=True, methods=["post"])
    def anular(self, request, pk=None):
        recibo = cerrar_recibo(self.get_object(), request.user, Recibo.Estado.ANULADO, request.data.get("motivo"))
        return Response(self.get_serializer(recibo).data)

    @action(detail=True, methods=["post"])
    def revertir(self, request, pk=None):
        recibo = cerrar_recibo(self.get_object(), request.user, Recibo.Estado.REVERTIDO, request.data.get("motivo"))
        return Response(self.get_serializer(recibo).data)


@api_view(["GET"])
@permission_classes([PermisoACE])
def familias(request):
    """
    Buscar a qué familia emitir el recibo: ?q= (mínimo 3 letras) por nombre o C.I. del alumno o del tutor.
    Devuelve solo nombres para completar el recibo; nunca si la familia aportó o no.
    """
    q = (request.query_params.get("q") or "").strip()
    if len(q) < 3:
        return Response([])
    anio = _anio(request)
    filtro = (Q(alumno__nombres__icontains=q) | Q(alumno__apellidos__icontains=q) | Q(alumno__ci__icontains=q)
              | Q(alumno__tutores__nombres__icontains=q) | Q(alumno__tutores__apellidos__icontains=q))
    mats = (Matricula.objects.filter(filtro, anio_lectivo=anio, estado__in=Matricula.EN_CURSO)
            .select_related("alumno", "seccion__curso").distinct()[:20])
    tutores = defaultdict(list)
    for at in AlumnoTutor.objects.filter(alumno__in=[m.alumno_id for m in mats]).select_related("tutor").order_by("-es_principal"):
        tutores[at.alumno_id].append({"id": at.tutor_id, "nombre": f"{at.tutor.nombres} {at.tutor.apellidos}",
                                      "ci": at.tutor.ci, "parentesco": at.parentesco})
    return Response([{"matricula": m.id, "alumno": str(m.alumno), "seccion": f"{m.seccion.curso.nombre} {m.seccion.letra}",
                      "tutores": tutores[m.alumno_id]} for m in mats])


def _totales(lineas):
    return lineas.aggregate(total=Sum("monto"), recibos=Count("recibo", distinct=True))


@api_view(["GET"])
@permission_classes([PermisoACE])
def panel(request):
    """Totales del ejercicio activo: por concepto, tipo, mes y medio. Sin datos por familia."""
    ace_, anio = _ace(request), _anio(request)
    lineas = LineaRecibo.objects.filter(recibo__ace=ace_, recibo__ejercicio=anio.anio)
    vigentes = lineas.filter(recibo__estado=Recibo.Estado.EMITIDO)
    no_vigentes = lineas.exclude(recibo__estado=Recibo.Estado.EMITIDO)
    tipos = dict(ConceptoAporte.Tipo.choices)
    medios = dict(Recibo.Medio.choices)
    return Response({
        "ace": ace_.denominacion, "ejercicio": anio.anio, "generado": timezone.localtime().isoformat(),
        "total": _totales(vigentes)["total"] or 0,
        "recibos": _totales(vigentes)["recibos"] or 0,
        "anulados_o_revertidos": {"recibos": _totales(no_vigentes)["recibos"] or 0, "monto": _totales(no_vigentes)["total"] or 0},
        "por_concepto": [{"concepto": f["concepto__nombre"], "total": f["total"], "recibos": f["recibos"]}
                         for f in vigentes.values("concepto__nombre").annotate(
                             total=Sum("monto"), recibos=Count("recibo", distinct=True)).order_by("-total")],
        "por_tipo": [{"tipo": tipos.get(f["concepto__tipo"], f["concepto__tipo"]), "total": f["total"]}
                     for f in vigentes.values("concepto__tipo").annotate(total=Sum("monto")).order_by("-total")],
        "por_mes": [{"mes": f["mes"].strftime("%Y-%m"), "total": f["total"]}
                    for f in vigentes.annotate(mes=TruncMonth("recibo__fecha")).values("mes")
                    .annotate(total=Sum("monto")).order_by("mes")],
        "por_medio": [{"medio": medios.get(f["recibo__medio"], f["recibo__medio"]), "total": f["total"]}
                      for f in vigentes.values("recibo__medio").annotate(total=Sum("monto")).order_by("-total")],
    })


@api_view(["GET"])
@permission_classes([PermisoACE])
def reporte_recaudacion(request):
    """
    Rendición de lo recaudado: ?desde=&hasta= (por defecto, el ejercicio activo hasta hoy).
    Lista los recibos emitidos en el período (también anulados y revertidos, marcados) con totales por
    concepto y medio. Solo incluye a quienes aportaron: nunca a quienes no.
    """
    ace_, anio = _ace(request), _anio(request)
    desde = _fecha(request.query_params.get("desde"), anio.fecha_inicio)
    hasta = _fecha(request.query_params.get("hasta"), min(timezone.localdate(), anio.fecha_fin))
    if desde > hasta:
        raise ValidationError("La fecha 'desde' no puede ser posterior a 'hasta'.")
    recibos = (Recibo.objects.filter(ace=ace_, fecha__range=(desde, hasta))
               .prefetch_related("lineas__concepto").order_by("fecha", "serie", "numero"))
    vigentes = LineaRecibo.objects.filter(recibo__in=recibos, recibo__estado=Recibo.Estado.EMITIDO)
    medios = dict(Recibo.Medio.choices)
    return Response({
        "ace": ace_.denominacion, "ruc": ace_.ruc, "desde": desde, "hasta": hasta,
        "generado": timezone.localtime().isoformat(),
        "total": vigentes.aggregate(t=Sum("monto"))["t"] or 0,
        "por_concepto": list(vigentes.values("concepto__nombre").annotate(total=Sum("monto")).order_by("concepto__nombre")),
        "por_medio": [{"medio": medios.get(f["recibo__medio"]), "total": f["total"]}
                      for f in vigentes.values("recibo__medio").annotate(total=Sum("monto"))],
        "recibos": [{
            "id": r.id, "serie": r.serie, "numero": r.numero, "fecha": r.fecha, "aportante": r.aportante_nombre,
            "conceptos": ", ".join(sorted({linea.concepto.nombre for linea in r.lineas.all()})),
            "medio": r.get_medio_display(), "total": r.total, "estado": r.estado,
            "motivo_anulacion": r.motivo_anulacion,
        } for r in recibos],
    })
