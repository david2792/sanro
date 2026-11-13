from datetime import date

from django.db.models import Count, Q
from django.db.models.functions import ExtractIsoWeekDay, TruncMonth
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from academico.models import AnioLectivo, Matricula, Seccion
from academico.views import FiltroParamsMixin
from personas.models import Docente
from nucleo.instituciones import PorInstitucionMixin, institucion_de
from personas.permisos import EsGestion, EsPersonal
from . import justificaciones as tramite
from .models import Justificacion, PermisoDocente, RegistroAsistencia, SesionClase
from .serializers import JustificacionSerializer, PermisoDocenteSerializer, SesionClaseSerializer


class SesionClaseViewSet(PorInstitucionMixin, FiltroParamsMixin, viewsets.ModelViewSet):
    """
    POST /api/sesiones/  -> guarda (o actualiza) la lista de una clase.
    GET  /api/sesiones/?asignacion=5&fecha=2027-03-02
    """

    queryset = SesionClase.objects.select_related(
        "asignacion__materia", "asignacion__seccion__curso", "docente"
    ).prefetch_related("registros__matricula__alumno")
    serializer_class = SesionClaseSerializer
    permission_classes = [EsPersonal]
    filtros = ["asignacion", "fecha", "docente", "asignacion__seccion"]
    campo_institucion = "asignacion__seccion__anio_lectivo__institucion"
    # Las clases dadas no se borran (docs/decisiones/0007): se corrigen, y en la Fase 1 se anulan con motivo.
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()  # aplica ?asignacion=&fecha=
        user = self.request.user
        if not user.es_gestion:
            qs = qs.filter(asignacion__docente__usuario=user)
        return qs


class JustificacionViewSet(PorInstitucionMixin, FiltroParamsMixin, viewsets.ModelViewSet):
    campo_institucion = "matricula__anio_lectivo__institucion"
    """
    Trámite de justificativos (solo gestión). No se borran: se cancelan con motivo.
    POST {id}/revisar/ · POST {id}/decidir/ {decision, motivo, aprobadas:[registros]} · POST {id}/cancelar/ {motivo}
    """

    queryset = Justificacion.objects.select_related("matricula__alumno", "matricula__seccion__curso", "revisado_por")
    serializer_class = JustificacionSerializer
    permission_classes = [EsGestion]
    filtros = ["matricula", "matricula__alumno", "estado", "origen"]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def perform_create(self, serializer):
        j = serializer.save(registrado_por=self.request.user)
        tramite.vincular_ausencias(j)

    def perform_update(self, serializer):
        tramite.vincular_ausencias(serializer.save())

    def _responder(self, j):
        return Response(self.get_serializer(j).data)

    @action(detail=True, methods=["post"])
    def revisar(self, request, pk=None):
        j = self.get_object()
        if j.estado not in (Justificacion.Estado.PRESENTADO, Justificacion.Estado.REQUIERE_INFO):
            raise ValidationError("Solo se pasan a revisión los justificativos presentados.")
        j.estado = Justificacion.Estado.EN_REVISION
        j.revisado_por = request.user
        j.save()
        return self._responder(j)

    @action(detail=True, methods=["post"])
    def decidir(self, request, pk=None):
        d = request.data
        j = tramite.decidir(self.get_object(), request.user, d.get("decision"), d.get("motivo", ""), d.get("aprobadas"))
        return self._responder(j)

    @action(detail=True, methods=["post"])
    def cancelar(self, request, pk=None):
        return self._responder(tramite.cancelar(self.get_object(), request.user, request.data.get("motivo", "")))


class PermisoDocenteViewSet(PorInstitucionMixin, FiltroParamsMixin, viewsets.ModelViewSet):
    campo_institucion = "docente__institucion"
    queryset = PermisoDocente.objects.select_related("docente")
    serializer_class = PermisoDocenteSerializer
    permission_classes = [EsGestion]
    filtros = ["docente"]


@api_view(["GET"])
@permission_classes([EsGestion])
def resumen_dia(request):
    """
    Tablero del día para el director: ?fecha=AAAA-MM-DD (por defecto hoy).
    - Clases con lista llamada y cuántos ausentes hubo en cada una.
    - Docentes que registraron clase, docentes con permiso y docentes sin registro.
    """
    fecha = request.query_params.get("fecha") or date.today().isoformat()
    inst = institucion_de(request)

    sesiones = (
        SesionClase.objects.filter(fecha=fecha, asignacion__seccion__anio_lectivo__institucion_id=inst.pk)
        .select_related("asignacion__materia", "asignacion__seccion__curso", "docente")
        .annotate(
            total=Count("registros"),
            ausentes=Count("registros", filter=Q(registros__estado="A")),
            tardanzas=Count("registros", filter=Q(registros__estado="T")),
        )
    )
    clases = [{
        "sesion": s.id,
        "seccion": str(s.asignacion.seccion),
        "materia": s.asignacion.materia.nombre,
        "docente": str(s.docente),
        "hora_inicio": s.hora_inicio,
        "alumnos": s.total,
        "ausentes": s.ausentes,
        "tardanzas": s.tardanzas,
    } for s in sesiones]

    con_clase = set(sesiones.values_list("docente_id", flat=True))
    con_permiso = set(PermisoDocente.objects.filter(
        docente__institucion_id=inst.pk, fecha_desde__lte=fecha, fecha_hasta__gte=fecha).values_list("docente_id", flat=True))
    activos = list(Docente.objects.filter(
        institucion_id=inst.pk, activo=True, asignaciones__seccion__anio_lectivo__activo=True).distinct())
    # Si hay días de clase cargados, solo cuentan los docentes que tenían clase ese día.
    from academico.models import Asignacion
    dia = date.fromisoformat(fecha)
    con_clase_programada = {a.docente_id for a in Asignacion.objects.filter(
        seccion__anio_lectivo__institucion_id=inst.pk, seccion__anio_lectivo__activo=True)
                            if a.tiene_clase(dia)}
    activos = [d for d in activos if d.id in con_clase_programada]

    def nombres(ids):
        return [str(d) for d in activos if d.id in ids]

    return Response({
        "fecha": fecha,
        "clases": clases,
        "docentes_con_clase": nombres(con_clase),
        "docentes_con_permiso": nombres(con_permiso),
        # Docentes que tenían clase ese día (según sus días de clase) y no registraron ninguna lista.
        "docentes_sin_registro": nombres({d.id for d in activos} - con_clase - con_permiso),
    })


@api_view(["GET"])
@permission_classes([EsGestion])
def reporte_ausencias(request):
    """
    Cursos y secciones con más ausencias: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
    (por defecto, desde el inicio del año activo hasta hoy).
    Inasistencia = (ausentes + justificadas) / registros de asistencia. Las tardanzas se informan aparte.
    """
    from .panel import _nombre_corto

    inst = institucion_de(request)
    anio = AnioLectivo.actual(inst)
    if anio is None:
        raise ValidationError("No hay un año lectivo activo.")
    try:
        p = request.query_params
        desde = date.fromisoformat(p["desde"]) if p.get("desde") else anio.fecha_inicio
        # Si el año activo todavía no empezó, se muestra el año completo (vacío) en vez de un rango invertido.
        hoy = date.today()
        hasta = date.fromisoformat(p["hasta"]) if p.get("hasta") else (
            min(hoy, anio.fecha_fin) if hoy >= anio.fecha_inicio else anio.fecha_fin)
    except ValueError:
        raise ValidationError("Fecha inválida. Usá el formato AAAA-MM-DD.")
    if desde > hasta:
        raise ValidationError("La fecha 'desde' no puede ser posterior a 'hasta'.")

    regs = RegistroAsistencia.objects.filter(
        sesion__asignacion__seccion__anio_lectivo=anio, sesion__fecha__range=(desde, hasta))
    if p.get("seccion"):
        regs = regs.filter(sesion__asignacion__seccion_id=p["seccion"])
    conteos = {
        "registros": Count("id"),
        "ausentes": Count("id", filter=Q(estado="A", justificada=False)),
        "justificadas": Count("id", filter=Q(estado="A", justificada=True)),
        "tardanzas": Count("id", filter=Q(estado="T")),
    }

    def con_pct(d):
        t = d["registros"]
        d["inasistencia"] = round((d["ausentes"] + d["justificadas"]) * 100 / t, 1) if t else None
        d["sin_justificar"] = round(d["ausentes"] * 100 / t, 1) if t else None
        d["pct_ausentes"] = round(d["ausentes"] * 100 / t, 1) if t else 0
        d["pct_justificadas"] = round(d["justificadas"] * 100 / t, 1) if t else 0
        d["pct_tardanzas"] = round(d["tardanzas"] * 100 / t, 1) if t else 0
        return d

    secciones = {s.id: s for s in Seccion.objects.filter(anio_lectivo=anio).select_related("curso__especialidad", "curso__nivel")}
    inscriptos = dict(Matricula.objects.filter(anio_lectivo=anio, estado=Matricula.Estado.ACTIVA)
                      .values("seccion").annotate(n=Count("id")).values_list("seccion", "n"))
    por_seccion = []
    for f in regs.values("sesion__asignacion__seccion").annotate(
            **conteos, alumnos_con_ausencias=Count("matricula", distinct=True, filter=Q(estado="A"))):
        s = secciones[f.pop("sesion__asignacion__seccion")]
        por_seccion.append(con_pct({**f, "id": s.id, "seccion": _nombre_corto(s), "curso_id": s.curso_id,
                                    "curso": str(s.curso), "alumnos": inscriptos.get(s.id, 0)}))
    por_seccion.sort(key=lambda x: -(x["inasistencia"] or 0))

    cursos = {}
    for f in por_seccion:
        c = cursos.setdefault(f["curso_id"], {"id": f["curso_id"], "curso": f["curso"], "secciones": 0, "alumnos": 0,
                                              "registros": 0, "ausentes": 0, "justificadas": 0, "tardanzas": 0})
        c["secciones"] += 1
        for k in ("alumnos", "registros", "ausentes", "justificadas", "tardanzas"):
            c[k] += f[k]
    por_curso = sorted((con_pct(c) for c in cursos.values()), key=lambda x: -(x["inasistencia"] or 0))

    por_mes = [con_pct({**f, "mes": f["mes"].strftime("%Y-%m")})
               for f in regs.annotate(mes=TruncMonth("sesion__fecha")).values("mes").annotate(**conteos).order_by("mes")]
    dias = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    por_dia = [con_pct({**f, "dia": dias[f["dia"]]})
               for f in regs.annotate(dia=ExtractIsoWeekDay("sesion__fecha")).values("dia").annotate(**conteos).order_by("dia")]
    por_materia = sorted(
        (con_pct({**f, "materia": f.pop("sesion__asignacion__materia__nombre")})
         for f in regs.values("sesion__asignacion__materia__nombre").annotate(**conteos)),
        key=lambda x: -(x["inasistencia"] or 0))

    top = list(regs.values("matricula").annotate(**conteos).filter(ausentes__gt=0).order_by("-ausentes")[:30])
    mats = Matricula.objects.select_related("alumno", "seccion__curso__especialidad").in_bulk([f["matricula"] for f in top])
    alumnos = [con_pct({**f, "alumno_id": mats[f["matricula"]].alumno_id, "alumno": str(mats[f["matricula"]].alumno),
                        "seccion": _nombre_corto(mats[f["matricula"]].seccion)}) for f in top]

    # Llegadas tardías con la hora registrada, de la más reciente a la más antigua.
    tardes = (regs.filter(estado="T", hora_llegada__isnull=False)
              .select_related("sesion__asignacion__materia", "sesion__asignacion__seccion__curso__especialidad",
                              "matricula__alumno")
              .order_by("-sesion__fecha", "-hora_llegada")[:50])
    llegadas_tarde = [{
        "fecha": r.sesion.fecha, "alumno_id": r.matricula.alumno_id, "alumno": str(r.matricula.alumno),
        "seccion": _nombre_corto(r.sesion.asignacion.seccion), "materia": r.sesion.asignacion.materia.nombre,
        "hora_inicio": r.sesion.hora_inicio, "hora_llegada": r.hora_llegada, "minutos_tarde": r.minutos_tarde,
    } for r in tardes]

    return Response({
        "institucion": inst.nombre, "anio": anio.anio, "desde": desde, "hasta": hasta,
        "llegadas_tarde": llegadas_tarde,
        "minimo_asistencia": inst.asistencia_minima,
        "totales": con_pct(regs.aggregate(**conteos)),
        "secciones": por_seccion, "cursos": por_curso, "meses": por_mes, "dias": por_dia,
        "materias": por_materia, "alumnos": alumnos,
    })


@api_view(["GET"])
@permission_classes([EsPersonal])
def panel(request):
    """
    Panel de decisiones según el rol del usuario:
    - colegio: dirección/coordinación/secretaría
    - guia: secciones donde es docente guía
    - docente: sus materias
    ?fecha=AAAA-MM-DD permite ver el panel de otro día.
    """
    from .panel import panel as calcular

    fecha = request.query_params.get("fecha")
    return Response(calcular(request.user, date.fromisoformat(fecha) if fecha else None, institucion_de(request)))
