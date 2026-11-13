from collections import defaultdict
from datetime import date

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from academico.models import AnioLectivo, Curso, Matricula, Seccion
from academico.views import FiltroParamsMixin
from personas.models import AlumnoTutor
from nucleo.instituciones import PorInstitucionMixin, institucion_de
from personas.permisos import EsAcesOGestion
from .estado import (AL_DIA, COMPLETO, CON_DEUDA, EXONERADO, EXONERADO_TOTAL, MESES, PAGADO, PAGO_PARCIAL, PARCIAL,
                     POR_VENCER, SIN_CUOTAS, SIN_PAGOS, EstadoAportes, nombre_seccion, pct)
from .models import ConceptoAporte, DetallePago, Exoneracion, Pago
from .serializers import ConceptoAporteSerializer, ExoneracionSerializer, PagoSerializer


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


def _secciones(anio):
    return list(Seccion.objects.filter(anio_lectivo=anio).select_related("curso__nivel")
                .order_by("curso__nivel__orden", "curso__grado", "letra", "turno"))


def _encabezado(anio):
    return {"institucion": anio.institucion.nombre, "anio": anio.anio, "generado": timezone.localtime().isoformat()}


# ------------------------------------------------------------------ ABM

class ConceptoAporteViewSet(PorInstitucionMixin, FiltroParamsMixin, viewsets.ModelViewSet):
    """Conceptos que cobra la ACES. Sin ?anio_lectivo= muestra los del año activo."""

    queryset = ConceptoAporte.objects.select_related("anio_lectivo").prefetch_related("cursos")
    serializer_class = ConceptoAporteSerializer
    permission_classes = [EsAcesOGestion]
    filtros = ["anio_lectivo", "activo"]
    campo_institucion = "anio_lectivo__institucion"

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.query_params.get("anio_lectivo"):
            qs = qs.filter(anio_lectivo__activo=True)
        return qs


class ExoneracionViewSet(PorInstitucionMixin, FiltroParamsMixin, viewsets.ModelViewSet):
    campo_institucion = "concepto__anio_lectivo__institucion"
    queryset = Exoneracion.objects.select_related("matricula__alumno", "matricula__seccion__curso", "concepto").order_by(
        "concepto__nombre", "matricula__alumno__apellidos", "matricula__alumno__nombres")
    serializer_class = ExoneracionSerializer
    permission_classes = [EsAcesOGestion]
    filtros = ["matricula", "concepto", "matricula__seccion"]

    def get_queryset(self):
        return super().get_queryset().filter(concepto__anio_lectivo__activo=True)

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


class PagoViewSet(PorInstitucionMixin, FiltroParamsMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                  mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Recibos. No se editan ni se borran: un recibo equivocado se anula.
    GET  /api/aportes/pagos/?matricula=12&desde=2027-03-01&hasta=2027-03-31
    POST /api/aportes/pagos/{id}/anular/ {motivo}
    """

    queryset = Pago.objects.select_related(
        "matricula__alumno", "matricula__seccion__curso", "anio_lectivo", "registrado_por", "anulado_por",
    ).prefetch_related("detalles__concepto")
    serializer_class = PagoSerializer
    permission_classes = [EsAcesOGestion]
    filtros = ["matricula", "matricula__seccion", "anulado", "medio", "anio_lectivo"]
    campo_institucion = "anio_lectivo__institucion"

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("desde"):
            qs = qs.filter(fecha__gte=_fecha(p["desde"], None))
        if p.get("hasta"):
            qs = qs.filter(fecha__lte=_fecha(p["hasta"], None))
        return qs

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)

    @action(detail=True, methods=["post"])
    def anular(self, request, pk=None):
        pago = self.get_object()
        motivo = (request.data.get("motivo") or "").strip()
        if pago.anulado:
            raise ValidationError("El recibo ya estaba anulado.")
        if not motivo:
            raise ValidationError("Indicá el motivo de la anulación.")
        pago.anulado, pago.motivo_anulacion = True, motivo
        pago.anulado_por, pago.anulado_en = request.user, timezone.now()
        pago.save()
        return Response(self.get_serializer(pago).data)


# ------------------------------------------------- datos para formularios

@api_view(["GET"])
@permission_classes([EsAcesOGestion])
def cursos(request):
    """Cursos (para elegir a qué cursos corresponde un concepto)."""
    return Response([{"id": c.id, "descripcion": str(c)} for c in Curso.objects.select_related("nivel", "especialidad").filter(
        nivel__institucion_id=institucion_de(request).pk)])


@api_view(["GET"])
@permission_classes([EsAcesOGestion])
def matriculas(request):
    """Alumnos matriculados en el año activo (para exoneraciones)."""
    anio = _anio(request)
    qs = Matricula.objects.filter(anio_lectivo=anio, estado=Matricula.Estado.ACTIVA).select_related(
        "alumno", "seccion__curso").order_by("alumno__apellidos", "alumno__nombres")
    if request.query_params.get("seccion"):
        qs = qs.filter(seccion_id=request.query_params["seccion"])
    return Response([{"id": m.id, "alumno": str(m.alumno), "ci": m.alumno.ci, "seccion_id": m.seccion_id,
                      "seccion": nombre_seccion(m.seccion)} for m in qs])


# ------------------------------------------------------------ estado

@api_view(["GET"])
@permission_classes([EsAcesOGestion])
def secciones(request):
    """Resumen de aportes de cada sección del año activo."""
    anio = _anio(request)
    est = EstadoAportes(anio)
    resumenes = [est.resumen(m) for m in est.matriculas()]
    return Response({**_encabezado(anio), "secciones": est.por_seccion(resumenes, _secciones(anio))})


@api_view(["GET"])
@permission_classes([EsAcesOGestion])
def seccion(request, pk):
    """Planilla de una sección: cada alumno con sus cuotas, pagos y deuda."""
    anio = _anio(request)
    sec = get_object_or_404(Seccion.objects.select_related("curso"), pk=pk, anio_lectivo=anio)
    est = EstadoAportes(anio)
    alumnos = []
    for m in est.matriculas(seccion=sec):
        cuotas = est.cuotas(m)
        alumnos.append({**est.resumen(m, cuotas), "cuotas": cuotas})
    columnas = []  # una columna por cuota (concepto + mes), en orden
    for c in est.conceptos:
        for mes, vence in c.cuotas():
            if any(q["concepto"] == c.id and q["mes"] == mes for a in alumnos for q in a["cuotas"]):
                columnas.append({"concepto": c.id, "concepto_nombre": c.nombre, "mes": mes,
                                 "etiqueta": MESES[mes] if mes else c.nombre, "vence": vence, "monto": c.monto})
    resumen = est.por_seccion([{k: v for k, v in a.items() if k != "cuotas"} for a in alumnos], [sec])[0]
    return Response({**_encabezado(anio), "seccion": resumen, "columnas": columnas, "alumnos": alumnos,
                     "conceptos": ConceptoAporteSerializer(est.conceptos, many=True).data})


@api_view(["GET"])
@permission_classes([EsAcesOGestion])
def panel(request):
    """Estado general de los aportes para el panel con gráficos."""
    anio = _anio(request)
    est = EstadoAportes(anio)
    resumenes, por_cuota, por_concepto = [], defaultdict(lambda: defaultdict(int)), defaultdict(lambda: defaultdict(int))
    for m in est.matriculas():
        cuotas = est.cuotas(m)
        resumenes.append(est.resumen(m, cuotas))
        for q in cuotas:
            clave = (q["concepto"], q["mes"])
            # Con deuda = algo vencido sin pagar; parcial = pagó una parte y todavía no venció.
            grupo = CON_DEUDA if q["deuda"] else PARCIAL if q["estado"] == PARCIAL else q["estado"]
            por_cuota[clave][grupo] += 1
            pc = por_concepto[q["concepto"]]
            for k in ("exigible", "deuda", "pagado", "saldo"):
                pc[k] += q[k]

    validos = DetallePago.objects.filter(pago__anio_lectivo=anio, pago__anulado=False)
    recaudado_concepto = dict(validos.values("concepto").annotate(t=Sum("monto")).values_list("concepto", "t"))
    por_mes = defaultdict(int)
    for f, monto in validos.values_list("pago__fecha", "monto"):
        por_mes[(f.year, f.month)] += monto
    por_medio = defaultdict(int)
    for medio, monto in validos.values_list("pago__medio", "monto"):
        por_medio[medio] += monto

    exigible = sum(r["exigible"] for r in resumenes)
    deuda = sum(r["deuda"] for r in resumenes)
    hoy = est.hoy
    meses = []
    a, mm = anio.fecha_inicio.year, anio.fecha_inicio.month
    while (a, mm) <= (hoy.year, hoy.month) and (a, mm) <= (anio.fecha_fin.year, anio.fecha_fin.month):
        meses.append({"mes": f"{a}-{mm:02d}", "etiqueta": f"{MESES[mm]} {a}", "monto": por_mes.get((a, mm), 0)})
        a, mm = (a + 1, 1) if mm == 12 else (a, mm + 1)

    cuotas = []
    for c in est.conceptos:
        for mes, vence in c.cuotas():
            g = por_cuota.get((c.id, mes))
            if g:
                cuotas.append({"concepto": c.nombre, "mes": mes, "etiqueta": MESES[mes] if mes else c.nombre,
                               "vence": vence, "pagado": g[PAGADO], "parcial": g[PARCIAL], "exonerado": g[EXONERADO],
                               "con_deuda": g[CON_DEUDA], "por_vencer": g[POR_VENCER]})

    return Response({
        **_encabezado(anio),
        "totales": {
            "recaudado": sum(recaudado_concepto.values()),
            "exigible": exigible, "deuda": deuda,
            "saldo": sum(r["saldo"] for r in resumenes),
            # Total que se espera cobrar en el año (sin exonerados) y cuánto de eso ya se cobró.
            "total_anual": sum(r["pagado"] + r["saldo"] for r in resumenes),
            "porcentaje_pagado": pct(sum(r["pagado"] for r in resumenes),
                                     sum(r["pagado"] + r["saldo"] for r in resumenes)),
            "cumplimiento": pct(exigible - deuda, exigible),
            "recibos": Pago.objects.filter(anio_lectivo=anio, anulado=False).count(),
            "anulados": Pago.objects.filter(anio_lectivo=anio, anulado=True).count(),
            "recaudado_hoy": validos.filter(pago__fecha=hoy).aggregate(t=Sum("monto"))["t"] or 0,
        },
        "familias": {
            "alumnos": len(resumenes),
            "al_dia": sum(1 for r in resumenes if r["estado"] == AL_DIA),
            "con_deuda": sum(1 for r in resumenes if r["estado"] == CON_DEUDA),
            "exonerados": sum(1 for r in resumenes if r["estado"] == EXONERADO_TOTAL),
            "sin_cuotas": sum(1 for r in resumenes if r["estado"] == SIN_CUOTAS),
            "completos": sum(1 for r in resumenes if r["avance"] == COMPLETO),
            "parciales": sum(1 for r in resumenes if r["avance"] == PAGO_PARCIAL),
            "sin_pagos": sum(1 for r in resumenes if r["avance"] == SIN_PAGOS),
        },
        "por_mes": meses,
        "por_medio": [{"medio": label, "monto": por_medio.get(valor, 0)} for valor, label in Pago.Medio.choices],
        "por_concepto": [{
            "id": c.id, "concepto": c.nombre, "periodicidad": c.get_periodicidad_display(), "monto": c.monto,
            "recaudado": recaudado_concepto.get(c.id, 0),
            "exigible": por_concepto[c.id]["exigible"], "deuda": por_concepto[c.id]["deuda"],
            "saldo": por_concepto[c.id]["saldo"],
            "porcentaje_pagado": pct(por_concepto[c.id]["pagado"], por_concepto[c.id]["pagado"] + por_concepto[c.id]["saldo"]),
            "cumplimiento": pct(por_concepto[c.id]["exigible"] - por_concepto[c.id]["deuda"],
                                por_concepto[c.id]["exigible"]),
        } for c in est.conceptos],
        "cuotas": cuotas,
        "secciones": est.por_seccion(resumenes, _secciones(anio)),
    })


# ---------------------------------------------------------- reportes

@api_view(["GET"])
@permission_classes([EsAcesOGestion])
def reporte_recaudacion(request):
    """
    Rendición de lo cobrado en un período (?desde=&hasta=&seccion=).
    Lista cada recibo (también los anulados, marcados) y totaliza por concepto, medio y día.
    """
    anio = _anio(request)
    hoy = date.today()
    desde = _fecha(request.query_params.get("desde"), hoy.replace(day=1))
    hasta = _fecha(request.query_params.get("hasta"), hoy)
    if desde > hasta:
        raise ValidationError("La fecha 'desde' no puede ser posterior a 'hasta'.")
    pagos = Pago.objects.filter(anio_lectivo=anio, fecha__range=(desde, hasta)).select_related(
        "matricula__alumno", "matricula__seccion__curso", "registrado_por").prefetch_related(
        "detalles__concepto").order_by("fecha", "numero")
    if request.query_params.get("seccion"):
        pagos = pagos.filter(matricula__seccion_id=request.query_params["seccion"])

    recibos, por_concepto, por_medio, por_dia = [], defaultdict(int), defaultdict(int), defaultdict(int)
    total = anulado = 0
    for p in pagos:
        monto = p.total
        recibos.append({
            "id": p.id, "numero": p.numero, "fecha": p.fecha, "alumno": str(p.matricula.alumno),
            "ci": p.matricula.alumno.ci, "seccion": nombre_seccion(p.matricula.seccion),
            "detalle": ", ".join(f"{d.concepto.nombre}{f' {MESES[d.mes]}' if d.mes else ''}" for d in p.detalles.all()),
            "medio": p.get_medio_display(), "referencia": p.referencia, "total": monto,
            "anulado": p.anulado, "motivo_anulacion": p.motivo_anulacion,
            "registrado_por": str(p.registrado_por) if p.registrado_por else "",
        })
        if p.anulado:
            anulado += monto
            continue
        total += monto
        por_medio[p.get_medio_display()] += monto
        por_dia[p.fecha] += monto
        for d in p.detalles.all():
            por_concepto[d.concepto.nombre] += d.monto

    return Response({
        **_encabezado(anio), "desde": desde, "hasta": hasta,
        "recibos": recibos, "total": total, "cantidad": sum(1 for r in recibos if not r["anulado"]),
        "anulados": {"cantidad": sum(1 for r in recibos if r["anulado"]), "monto": anulado},
        "por_concepto": [{"concepto": k, "monto": v} for k, v in sorted(por_concepto.items())],
        "por_medio": [{"medio": k, "monto": v} for k, v in sorted(por_medio.items())],
        "por_dia": [{"fecha": k, "monto": v} for k, v in sorted(por_dia.items())],
    })


@api_view(["GET"])
@permission_classes([EsAcesOGestion])
def reporte_morosos(request):
    """
    Alumnos que deben, con el contacto del tutor (?seccion=).
    ?incluir=saldo lista todo lo que falta pagar; si no, solo lo vencido.
    """
    anio = _anio(request)
    est = EstadoAportes(anio)
    campo = "saldo" if request.query_params.get("incluir") == "saldo" else "deuda"
    filtros = {"seccion_id": request.query_params["seccion"]} if request.query_params.get("seccion") else {}
    filas = []
    for m in est.matriculas(**filtros):
        cuotas = est.cuotas(m)
        r = est.resumen(m, cuotas)
        if not r[campo]:
            continue
        pendientes = defaultdict(list)
        for q in cuotas:
            if q[campo]:
                pendientes[q["concepto_nombre"]].append(q["etiqueta"] if q["mes"] else "")
        r["detalle"] = "; ".join(f"{k} {' '.join(v)}".strip() for k, v in pendientes.items())
        filas.append(r)
    contactos = {}
    for at in AlumnoTutor.objects.filter(alumno_id__in=[f["alumno_id"] for f in filas]).select_related(
            "tutor").order_by("-es_principal"):
        contactos.setdefault(at.alumno_id, {"nombre": str(at.tutor), "telefono": at.tutor.telefono,
                                            "parentesco": at.parentesco})
    for f in filas:
        f["tutor"] = contactos.get(f["alumno_id"])
    return Response({**_encabezado(anio), "fecha": est.hoy, "incluir": campo, "alumnos": filas,
                     "total_deuda": sum(f["deuda"] for f in filas), "total_saldo": sum(f["saldo"] for f in filas)})
