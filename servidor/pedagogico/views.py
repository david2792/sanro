import re
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from academico.models import Asignacion, DiaNoLectivo, Etapa, Matricula
from academico.views import FiltroParamsMixin
from asistencia.models import SesionClase
from nucleo.instituciones import PorInstitucionMixin, institucion_de
from personas.permisos import EsPersonal
from .models import (Capacidad, Indicador, Instrumento, PlanClase, Puntaje, RegistroAnecdotico,
                     RegistroClase, Sugerencia, Unidad)
from .serializers import (CapacidadSerializer, IndicadorSerializer, InstrumentoSerializer,
                          PlanClaseSerializer, PuntajesLoteSerializer, RegistroAnecdoticoSerializer,
                          RegistroClaseSerializer, SugerenciaSerializer, UnidadSerializer, verificar_asignacion)


class PropiasMixin(PorInstitucionMixin, FiltroParamsMixin):
    """Docente: solo ve lo de sus asignaciones. Gestión: ve todo lo de su institución."""

    permission_classes = [EsPersonal]
    campo_docente = "asignacion__docente__usuario"

    @property
    def campo_institucion(self):
        # Mismo camino que hasta el docente, pero terminando en la institución de la sección.
        return self.campo_docente.replace("docente__usuario", "seccion__anio_lectivo__institucion")

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.es_gestion:
            qs = qs.filter(**{self.campo_docente: self.request.user})
        return qs


class UnidadViewSet(PropiasMixin, viewsets.ModelViewSet):
    """GET /api/unidades/?asignacion=5  -> unidades con capacidades e indicadores."""

    queryset = Unidad.objects.prefetch_related("capacidades__indicadores")
    serializer_class = UnidadSerializer
    filtros = ["asignacion", "etapa"]

    def _destino(self, valor):
        try:
            destino = Asignacion.objects.select_related("seccion").get(pk=valor)
        except (Asignacion.DoesNotExist, ValueError, TypeError):
            raise ValidationError("Indicá una asignación válida.")
        verificar_asignacion(self.request, destino)
        return destino

    def _copiables(self):
        """Docente: unidades de cualquiera de sus clases (de este año o anteriores). Gestión: todas."""
        qs = Unidad.objects.select_related(
            "asignacion__materia", "asignacion__docente",
            "asignacion__seccion__curso", "asignacion__seccion__anio_lectivo", "etapa",
        ).prefetch_related("capacidades__indicadores")
        if not self.request.user.es_gestion:
            qs = qs.filter(asignacion__docente__usuario=self.request.user)
        return qs

    @action(detail=False)
    def origenes(self, request):
        """
        Clases con planificación que se puede copiar a esta:
        GET /api/unidades/origenes/?asignacion=5
        Primero la misma materia y el mismo curso, después lo más reciente.
        """
        destino = self._destino(request.query_params.get("asignacion"))
        qs = self._copiables().exclude(asignacion=destino).order_by("numero")
        if request.user.es_gestion:
            # Gestión ve todas las clases: se limita a la misma materia para no listar el colegio entero.
            qs = qs.filter(asignacion__materia=destino.materia)

        grupos = {}
        for u in qs:
            a = u.asignacion
            g = grupos.setdefault(a.id, {
                "asignacion": a.id, "materia": a.materia.nombre, "seccion": str(a.seccion),
                "docente": str(a.docente), "anio": a.seccion.anio_lectivo.anio,
                "misma_materia": a.materia_id == destino.materia_id,
                "mismo_curso": a.seccion.curso_id == destino.seccion.curso_id,
                "unidades": [],
            })
            capacidades = u.capacidades.all()
            g["unidades"].append({
                "id": u.id, "numero": u.numero, "titulo": u.titulo,
                "capacidades": len(capacidades),
                "indicadores": sum(len(c.indicadores.all()) for c in capacidades),
            })
        return Response(sorted(grupos.values(), key=lambda g: (
            not g["misma_materia"], not g["mismo_curso"], -g["anio"], g["seccion"])))

    @action(detail=False, methods=["post"])
    def copiar(self, request):
        """
        Copia unidades de otra clase (con competencia, capacidades e indicadores):
        POST /api/unidades/copiar/ {asignacion: destino, unidades: [ids]}
        - Si el número de unidad ya existe en el destino, la copia va al final.
        - La etapa se busca por su número en el año de la sección (1ª etapa -> 1ª etapa).
        No se copian registros de clase, trabajos ni logros de alumnos.
        """
        destino = self._destino(request.data.get("asignacion"))
        try:
            ids = {int(i) for i in request.data.get("unidades") or []}
        except (TypeError, ValueError):
            raise ValidationError("La lista de unidades no es válida.")
        if not ids:
            raise ValidationError("Elegí al menos una unidad para copiar.")
        origen = list(self._copiables().filter(pk__in=ids).order_by("asignacion_id", "numero"))
        if len(origen) != len(ids):
            raise ValidationError("Alguna de las unidades no existe o no pertenece a tus clases.")

        etapas = {e.numero: e for e in Etapa.objects.filter(anio_lectivo_id=destino.seccion.anio_lectivo_id)}
        usados = set(destino.unidades.values_list("numero", flat=True))
        nuevas = []
        with transaction.atomic():
            for u in origen:
                numero = u.numero if u.numero not in usados else max(usados) + 1
                usados.add(numero)
                nueva = Unidad.objects.create(
                    asignacion=destino, numero=numero, titulo=u.titulo, competencia=u.competencia,
                    contenidos=u.contenidos, estrategias=u.estrategias, recursos=u.recursos, evaluacion=u.evaluacion,
                    etapa=etapas.get(u.etapa.numero) if u.etapa else None,
                )
                for c in u.capacidades.all():
                    cap = Capacidad.objects.create(unidad=nueva, orden=c.orden, descripcion=c.descripcion)
                    Indicador.objects.bulk_create(
                        Indicador(capacidad=cap, orden=i.orden, descripcion=i.descripcion)
                        for i in c.indicadores.all())
                nuevas.append(nueva.id)

        copiadas = Unidad.objects.filter(pk__in=nuevas).prefetch_related("capacidades__indicadores").order_by("numero")
        return Response(UnidadSerializer(copiadas, many=True, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"])
    def logro(self, request, pk=None):
        """
        Planilla de control de logro de indicadores de la unidad.
        GET  -> encabezado, capacidades con indicadores y, por alumno, L/NL de cada indicador y su % de logro.
        POST -> {logros: [{matricula, indicador, estado: 'L' | 'NL' | null}]}
        """
        from .models import LogroIndicador
        from .serializers import LogrosLoteSerializer

        unidad = self.get_object()
        asignacion = unidad.asignacion
        if request.method == "POST":
            verificar_asignacion(request, asignacion)
            s = LogrosLoteSerializer(data=request.data, context={"request": request, "unidad": unidad})
            s.is_valid(raise_exception=True)
            s.save()

        capacidades = list(unidad.capacidades.prefetch_related("indicadores"))
        indicadores = [i for c in capacidades for i in c.indicadores.all()]
        marcas = {}
        for mat_id, ind_id, estado in LogroIndicador.objects.filter(indicador__in=indicadores).values_list(
                "matricula_id", "indicador_id", "estado"):
            marcas.setdefault(mat_id, {})[ind_id] = estado

        cargadas = set(marcas)
        matriculas = asignacion.seccion.matriculas.filter(
            Q(estado=Matricula.Estado.ACTIVA) | Q(id__in=cargadas)
        ).select_related("alumno").order_by("numero_lista", "alumno__apellidos", "alumno__nombres")

        alumnos = []
        for m in matriculas:
            propias = marcas.get(m.id, {})
            l = sum(1 for v in propias.values() if v == "L")
            ev = len(propias)
            total = len(indicadores)
            alumnos.append({
                "matricula": m.id, "numero_lista": m.numero_lista, "alumno": str(m.alumno),
                "logros": {str(k): v for k, v in propias.items()},
                # Cada indicador vale 1 punto si es L y 0 si es NL (o si todavía no se marcó).
                "logrados": l, "evaluados": ev, "puntaje": l, "total": total,
                "porcentaje": round(l * 100 / total, 1) if total else None,
            })

        por_indicador = {}
        for i in indicadores:
            l = sum(1 for a in alumnos if a["logros"].get(str(i.id)) == "L")
            ev = sum(1 for a in alumnos if str(i.id) in a["logros"])
            por_indicador[str(i.id)] = {"logrados": l, "evaluados": ev, "porcentaje": round(l * 100 / ev, 1) if ev else None}

        inst = institucion_de(self.request)
        s = asignacion.seccion
        return Response({
            "encabezado": {
                "institucion": inst.nombre,
                "area": asignacion.materia.nombre,
                "seccion": f"{s.curso.nombre} {s.letra}",
                "seccion_completa": str(s),
                "docente": str(asignacion.docente),
                "competencia": unidad.competencia,
                "unidad": f"Unidad {unidad.numero}: {unidad.titulo}",
                "etapa": str(unidad.etapa) if unidad.etapa else "",
            },
            "capacidades": [{"id": c.id, "orden": c.orden, "descripcion": c.descripcion,
                             "indicadores": [{"id": i.id, "descripcion": i.descripcion} for i in c.indicadores.all()]}
                            for c in capacidades],
            "alumnos": alumnos,
            "por_indicador": por_indicador,
        })


class CapacidadViewSet(PropiasMixin, viewsets.ModelViewSet):
    queryset = Capacidad.objects.prefetch_related("indicadores")
    serializer_class = CapacidadSerializer
    filtros = ["unidad"]
    campo_docente = "unidad__asignacion__docente__usuario"


class IndicadorViewSet(PropiasMixin, viewsets.ModelViewSet):
    queryset = Indicador.objects.all()
    serializer_class = IndicadorSerializer
    filtros = ["capacidad", "capacidad__unidad"]
    campo_docente = "capacidad__unidad__asignacion__docente__usuario"


class RegistroClaseViewSet(PropiasMixin, viewsets.ModelViewSet):
    """
    POST /api/registros-clase/ {sesion, unidad, capacidades:[ids], indicadores_evaluados:[ids],
                                contenido, actividades, observaciones}
    GET  /api/registros-clase/?sesion__asignacion=5   -> cuaderno de cátedra de la materia
    """

    queryset = RegistroClase.objects.select_related("sesion", "unidad").prefetch_related(
        "capacidades", "indicadores_evaluados")
    serializer_class = RegistroClaseSerializer
    filtros = ["sesion", "sesion__asignacion", "unidad", "sesion__fecha"]
    campo_docente = "sesion__asignacion__docente__usuario"


def dias_de_clase(asignacion, desde, hasta, libres=None):
    """
    Fechas con clase de la materia entre desde y hasta: días de clase, dentro del año lectivo y sin días no lectivos.
    `libres`: los días no lectivos ya leídos (para no consultarlos de nuevo por cada materia).
    """
    anio = asignacion.seccion.anio_lectivo
    desde, hasta = max(desde, anio.fecha_inicio), min(hasta, anio.fecha_fin)
    if not asignacion.dias_clase or desde > hasta:
        return []
    if libres is None:
        libres = set(DiaNoLectivo.objects.filter(anio_lectivo=anio, fecha__range=(desde, hasta))
                     .values_list("fecha", flat=True))
    dias, d = [], desde
    while d <= hasta:
        if d.isoweekday() in asignacion.dias_clase and d not in libres:
            dias.append(d)
        d += timedelta(days=1)
    return dias


def leer_fecha(valor, nombre="la fecha"):
    try:
        return date.fromisoformat(str(valor))
    except ValueError:
        raise ValidationError(f"Indicá {nombre} (AAAA-MM-DD).")


def leer_mes(valor):
    """"2026-04" -> (1/4/2026, 30/4/2026)"""
    try:
        a, m = map(int, str(valor or "").split("-"))
        primero = date(a, m, 1)
    except ValueError:
        raise ValidationError("Indicá el mes (?mes=AAAA-MM).")
    return primero, date(a + m // 12, m % 12 + 1, 1) - timedelta(days=1)


class PlanClaseViewSet(PropiasMixin, viewsets.ModelViewSet):
    """
    Planificación de clases por fecha.
    GET  /api/planes-clase/?asignacion=5&fecha=2026-04-07   (o &desde=…&hasta=…)
    GET  /api/planes-clase/calendario/?asignacion=5&mes=2026-04
    POST /api/planes-clase/repartir/ {asignacion, unidad?, desde?, temas: ["…", …]}
    POST /api/planes-clase/correr/   {asignacion, desde}
    """

    queryset = PlanClase.objects.select_related("unidad").prefetch_related("capacidades", "indicadores")
    serializer_class = PlanClaseSerializer
    filtros = ["asignacion", "fecha", "unidad"]

    def get_queryset(self):
        qs = super().get_queryset()
        if desde := self.request.query_params.get("desde"):
            qs = qs.filter(fecha__gte=leer_fecha(desde, "desde"))
        if hasta := self.request.query_params.get("hasta"):
            qs = qs.filter(fecha__lte=leer_fecha(hasta, "hasta"))
        return qs

    @action(detail=False)
    def calendario(self, request):
        """Cada día del mes con clase, planificación, si ya se dio, trabajos y días no lectivos."""

        asignacion = asignacion_del_pedido(request)
        primero, ultimo = leer_mes(request.query_params.get("mes"))
        rango = (primero, ultimo)
        anio = asignacion.seccion.anio_lectivo

        planes = {p.fecha: p for p in self.get_queryset().filter(asignacion=asignacion, fecha__range=rango)}
        sesiones = set(SesionClase.objects.filter(asignacion=asignacion, fecha__range=rango)
                       .values_list("fecha", flat=True))
        registros = {r.sesion.fecha: r for r in RegistroClase.objects.filter(
            sesion__asignacion=asignacion, sesion__fecha__range=rango).select_related("sesion", "unidad")}
        trabajos = {}
        for t in Instrumento.objects.filter(asignacion=asignacion, fecha__range=rango).order_by("fecha", "id"):
            trabajos.setdefault(t.fecha, []).append({"id": t.id, "titulo": t.titulo, "tipo": t.get_tipo_display()})
        no_lectivos = dict(DiaNoLectivo.objects.filter(anio_lectivo=anio, fecha__range=rango)
                           .values_list("fecha", "motivo"))
        clases = set(dias_de_clase(asignacion, primero, ultimo))

        dias = []
        for f in sorted(clases | planes.keys() | sesiones | trabajos.keys() | no_lectivos.keys()):
            r = registros.get(f)
            dias.append({
                "fecha": f,
                "clase": f in clases,
                "no_lectivo": no_lectivos.get(f),
                "plan": PlanClaseSerializer(planes[f]).data if f in planes else None,
                "dictada": f in sesiones,
                "registro": {"contenido": r.contenido, "unidad_titulo": str(r.unidad) if r.unidad else None} if r else None,
                "trabajos": trabajos.get(f, []),
            })
        inst = institucion_de(self.request)
        s = asignacion.seccion
        return Response({
            "mes": f"{primero:%Y-%m}",
            "encabezado": {
                "institucion": inst.nombre,
                "materia": asignacion.materia.nombre,
                "seccion": str(s),
                "docente": str(asignacion.docente),
            },
            "anio_lectivo": {"inicio": anio.fecha_inicio, "fin": anio.fecha_fin},
            "dias_clase": asignacion.dias_clase,
            "dias": dias,
            "resumen": {
                "clases": len(clases),
                "planificadas": sum(1 for f in clases if f in planes),
                "dictadas": sum(1 for f in clases if f in sesiones),
            },
        })

    @action(detail=False, methods=["post"])
    def repartir(self, request):
        """Pone un tema por clase en las próximas clases libres, desde una fecha."""
        asignacion = asignacion_del_pedido(request, request.data.get("asignacion"))
        temas = [str(t).strip() for t in request.data.get("temas") or [] if str(t).strip()]
        if not temas:
            raise ValidationError("Escribí al menos un tema (uno por clase).")
        if not asignacion.dias_clase:
            raise ValidationError("Primero cargá los días de clase de la materia.")
        unidad = None
        if request.data.get("unidad"):
            unidad = Unidad.objects.filter(pk=request.data["unidad"], asignacion=asignacion).first()
            if unidad is None:
                raise ValidationError("La unidad no pertenece a esta clase.")
        desde = leer_fecha(request.data["desde"], "desde") if request.data.get("desde") else date.today()
        anio = asignacion.seccion.anio_lectivo

        ocupadas = set(PlanClase.objects.filter(asignacion=asignacion, fecha__gte=desde).values_list("fecha", flat=True))
        ocupadas |= set(SesionClase.objects.filter(asignacion=asignacion, fecha__gte=desde).values_list("fecha", flat=True))
        libres = [d for d in dias_de_clase(asignacion, desde, anio.fecha_fin) if d not in ocupadas]
        if len(libres) < len(temas):
            raise ValidationError(
                f"Hay {len(temas)} temas pero solo quedan {len(libres)} clases libres hasta el fin del año lectivo.")
        PlanClase.objects.bulk_create([
            PlanClase(asignacion=asignacion, fecha=f, unidad=unidad, contenido=t) for f, t in zip(libres, temas)])
        return Response({"creadas": len(temas), "desde": libres[0], "hasta": libres[len(temas) - 1]},
                        status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def correr(self, request):
        """
        No se pudo dar la clase de `desde`: todo lo planificado desde ese día
        pasa a la clase siguiente (cada plan avanza una clase).
        """
        asignacion = asignacion_del_pedido(request, request.data.get("asignacion"))
        desde = leer_fecha(request.data.get("desde"), "desde")
        planes = list(PlanClase.objects.filter(asignacion=asignacion, fecha__gte=desde).order_by("fecha"))
        if not planes:
            raise ValidationError("No hay clases planificadas desde esa fecha.")
        if not asignacion.dias_clase:
            raise ValidationError("Primero cargá los días de clase de la materia.")
        dias = dias_de_clase(asignacion, desde + timedelta(days=1), asignacion.seccion.anio_lectivo.fecha_fin)

        destinos, i = [], 0
        for p in planes:
            while i < len(dias) and (dias[i] <= p.fecha or (destinos and dias[i] <= destinos[-1])):
                i += 1
            if i >= len(dias):
                raise ValidationError(
                    f"No hay más clases en el año lectivo para correr la clase del {p.fecha:%d/%m}. "
                    "Borrá o juntá alguna clase planificada.")
            destinos.append(dias[i])
        with transaction.atomic():
            # De la última a la primera, para no pisar la fecha de otra clase planificada.
            for p, f in reversed(list(zip(planes, destinos))):
                p.fecha = f
                p.save(update_fields=["fecha", "modificado"])
        return Response({"corridas": len(planes)})


class SugerenciaViewSet(PropiasMixin, viewsets.ModelViewSet):
    """
    Sugerencias de dirección al docente sobre su plan anual o el desarrollo de una clase.
    GET  /api/sugerencias/?asignacion=5&sobre=PLAN_ANUAL      (docente: solo las de sus materias)
    GET  /api/sugerencias/?leida=false                        -> las que el docente todavía no leyó
    POST /api/sugerencias/ {asignacion, sobre, unidad?, registro_clase?, texto}   (solo gestión)
    POST /api/sugerencias/{id}/leida/                         -> el docente la marca como leída
    """

    queryset = Sugerencia.objects.select_related(
        "autor", "unidad", "registro_clase__sesion", "asignacion__materia", "asignacion__seccion__curso")
    serializer_class = SugerenciaSerializer
    filtros = ["asignacion", "sobre", "unidad", "registro_clase"]

    def get_queryset(self):
        qs = super().get_queryset()
        leida = self.request.query_params.get("leida", "").lower()
        if leida in ("true", "1", "false", "0"):
            qs = qs.filter(leida=leida in ("true", "1"))
        return qs

    def perform_create(self, serializer):
        serializer.save(autor=self.request.user)

    def perform_destroy(self, instance):
        if not self.request.user.es_gestion:
            raise ValidationError("Solo dirección y coordinación pueden borrar sugerencias.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def leida(self, request, pk=None):
        from django.utils import timezone

        s = self.get_object()
        if not s.leida:
            s.leida, s.leida_en = True, timezone.now()
            s.save(update_fields=["leida", "leida_en"])
        return Response(self.get_serializer(s).data)


class RegistroAnecdoticoViewSet(PropiasMixin, viewsets.ModelViewSet):
    """GET /api/anecdoticos/?alumnos__alumno=12  -> historial anecdótico de un alumno."""

    queryset = RegistroAnecdotico.objects.select_related(
        "asignacion__materia", "asignacion__seccion__curso", "registrado_por"
    ).prefetch_related("alumnos__alumno")
    serializer_class = RegistroAnecdoticoSerializer
    filtros = ["asignacion", "asignacion__seccion", "alumnos", "alumnos__alumno", "tipo", "fecha"]

    def get_queryset(self):
        return super().get_queryset().distinct()

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


class InstrumentoViewSet(PropiasMixin, viewsets.ModelViewSet):
    """
    GET  /api/instrumentos/?asignacion=5&etapa=1
    GET  /api/instrumentos/{id}/puntajes/  -> lista del curso con el puntaje de cada alumno
    POST /api/instrumentos/{id}/puntajes/  -> {puntajes: [{matricula, puntaje, observacion}]}
    """

    queryset = Instrumento.objects.select_related("etapa").annotate(
        evaluados=Count("puntajes", filter=Q(puntajes__puntaje__isnull=False) | Q(puntajes__recuperatorio__isnull=False)))
    serializer_class = InstrumentoSerializer
    filtros = ["asignacion", "etapa", "tipo"]

    @action(detail=True, methods=["get", "post"])
    def puntajes(self, request, pk=None):
        instrumento = self.get_object()
        if request.method == "POST":
            verificar_asignacion(request, instrumento.asignacion)
            s =PuntajesLoteSerializer(data=request.data,
                                       context={"request": request, "instrumento": instrumento})
            s.is_valid(raise_exception=True)
            s.save()

        cargados = {p.matricula_id: p for p in instrumento.puntajes.all()}
        matriculas = instrumento.asignacion.seccion.matriculas.filter(
            Q(estado=Matricula.Estado.ACTIVA) | Q(id__in=cargados.keys())
        ).select_related("alumno").order_by("numero_lista", "alumno__apellidos", "alumno__nombres")
        vacio = Puntaje()
        return Response({
            "instrumento": InstrumentoSerializer(instrumento, context={"request": request}).data,
            "alumnos": [{
                "matricula": m.id,
                "numero_lista": m.numero_lista,
                "alumno": str(m.alumno),
                "puntaje": cargados.get(m.id, vacio).puntaje,
                "recuperatorio": cargados.get(m.id, vacio).recuperatorio,
                "entrega_tardia": cargados.get(m.id, vacio).entrega_tardia,
                "observacion": cargados.get(m.id, vacio).observacion,
            } for m in matriculas],
        })


def asignacion_del_pedido(request, valor=None):
    """La asignación de ?asignacion=ID (o de `valor`), si el usuario puede trabajar sobre ella."""
    try:
        asignacion = Asignacion.objects.select_related("seccion__anio_lectivo", "materia", "docente").get(
            pk=valor if valor is not None else request.query_params.get("asignacion"))
    except (Asignacion.DoesNotExist, ValueError, TypeError):
        raise ValidationError("Indicá una asignación válida (?asignacion=ID).")
    verificar_asignacion(request, asignacion)
    return asignacion


@api_view(["GET"])
@permission_classes([EsPersonal])
def planilla(request):
    """
    Planilla de puntajes de una materia en una etapa:
    GET /api/planilla/?asignacion=5&etapa=1
    Devuelve los trabajos (columnas) y, por alumno, el puntaje de cada uno,
    el total logrado, el total posible y el porcentaje de logro.
    """
    return Response(calcular_planilla(asignacion_del_pedido(request), request.query_params.get("etapa")))


def calcular_planilla(asignacion, etapa=None, matriculas=None):
    """
    Planilla de una asignación (toda o de una etapa). En cada trabajo cuenta el mayor entre
    el puntaje y el recuperatorio; `marcas` dice si contó el recuperatorio (R) o si entregó tarde (T).
    """
    instrumentos = list(asignacion.instrumentos.all().order_by("fecha", "id"))
    if etapa:
        instrumentos = [i for i in instrumentos if str(i.etapa_id) == str(etapa)]
    total_posible = sum((i.puntaje_total for i in instrumentos), Decimal("0"))

    notas = {}
    for p in Puntaje.objects.filter(instrumento__in=instrumentos):
        notas[(p.matricula_id, p.instrumento_id)] = p

    # Unidades evaluadas por indicadores: cada indicador vale 1 punto (L = 1, NL = 0).
    # Solo cuentan las unidades que ya tienen al menos una marca cargada.
    from .models import LogroIndicador
    unidades = asignacion.unidades.prefetch_related("capacidades__indicadores").order_by("numero")
    if etapa:
        unidades = unidades.filter(etapa_id=etapa)
    columnas_unidad = []
    puntos_unidad = {}  # (matricula, unidad) -> L
    for u in unidades:
        ids = [i.id for c in u.capacidades.all() for i in c.indicadores.all()]
        marcas = list(LogroIndicador.objects.filter(indicador_id__in=ids).values_list("matricula_id", "estado"))
        if not ids or not marcas:
            continue
        columnas_unidad.append({"id": f"u{u.id}", "titulo": f"Indicadores U{u.numero}", "tipo": "Logro de indicadores",
                                "fecha": None, "puntaje_total": Decimal(len(ids)), "unidad": u.id})
        con_marca = set()
        for mat_id, estado in marcas:
            con_marca.add(mat_id)
            puntos_unidad[(mat_id, u.id)] = puntos_unidad.get((mat_id, u.id), 0) + (1 if estado == "L" else 0)
        for mat_id in con_marca:
            puntos_unidad.setdefault((mat_id, u.id), 0)
    total_posible += sum((c["puntaje_total"] for c in columnas_unidad), Decimal("0"))

    filas = []
    if matriculas is None:
        matriculas = asignacion.seccion.matriculas.filter(estado=Matricula.Estado.ACTIVA)
    matriculas = matriculas.select_related("alumno").order_by("numero_lista", "alumno__apellidos", "alumno__nombres")
    vacio = Puntaje()
    for m in matriculas:
        propios = [notas.get((m.id, i.id), vacio) for i in instrumentos]
        puntajes = [p.efectivo for p in propios]
        puntajes += [Decimal(puntos_unidad[(m.id, c["unidad"])]) if (m.id, c["unidad"]) in puntos_unidad else None
                     for c in columnas_unidad]
        logrado = sum((p for p in puntajes if p is not None), Decimal("0"))
        filas.append({
            "matricula": m.id,
            "numero_lista": m.numero_lista,
            "alumno": str(m.alumno),
            "puntajes": puntajes,
            "marcas": [p.marca for p in propios] + [""] * len(columnas_unidad),
            "logrado": logrado,
            "porcentaje": float(round(logrado * 100 / total_posible, 1)) if total_posible else None,
        })

    return {
        "asignacion": str(asignacion),
        "trabajos": [{"id": i.id, "titulo": i.titulo, "tipo": i.get_tipo_display(),
                      "fecha": i.fecha, "puntaje_total": i.puntaje_total} for i in instrumentos]
                    + [{k: v for k, v in c.items() if k != "unidad"} for c in columnas_unidad],
        "total_posible": total_posible,
        "alumnos": filas,
    }


# ---------------------------------------------------------------------------
# Frases frecuentes del docente (cuaderno de cátedra y anecdótico)
# ---------------------------------------------------------------------------

# campo -> (modelo, filtro que lo limita a lo escrito por el usuario)
CAMPOS_FRASES = {
    "actividades": (RegistroClase, "sesion__asignacion__docente__usuario"),
    "observaciones": (RegistroClase, "sesion__asignacion__docente__usuario"),
    "interpretacion": (RegistroAnecdotico, "registrado_por"),
    "acciones": (RegistroAnecdotico, "registrado_por"),
}
# Para empezar, mientras el docente todavía no tiene historial.
FRASES_BASE = {
    "actividades": [
        "Explicación oral del tema.", "Lluvia de ideas.", "Trabajo en grupos.", "Resolución de ejercicios.",
        "Lectura comprensiva.", "Puesta en común.", "Corrección de tareas.", "Trabajo individual en el cuaderno.",
    ],
    "observaciones": [
        "Clase desarrollada con normalidad.", "Buena participación del grupo.", "Quedó pendiente la corrección de la tarea.",
    ],
    "acciones": [
        "Se conversó con el alumno.", "Se registró en el cuaderno de comunicaciones.", "Se informó a coordinación.",
        "Se citó al padre, madre o tutor.", "Se felicitó al alumno frente al grupo.",
    ],
}
MAX_FRASES = 12


def partir_frases(texto):
    """Divide un texto en frases reutilizables: por renglón, punto y coma o punto seguido."""
    for parte in re.split(r"[\n;•]+|(?<=\.)\s+", texto):
        parte = parte.strip(" -*\t")
        if 3 <= len(parte) <= 160:
            yield parte


@api_view(["GET"])
@permission_classes([EsPersonal])
def frases(request):
    """
    Frases que el docente usa seguido en un campo, de la más usada a la menos usada:
    GET /api/frases/?campo=actividades
    """
    campo = request.query_params.get("campo")
    if campo not in CAMPOS_FRASES:
        raise ValidationError(f"Campo inválido. Opciones: {', '.join(CAMPOS_FRASES)}.")
    modelo, filtro = CAMPOS_FRASES[campo]
    textos = (modelo.objects.filter(**{filtro: request.user}).exclude(**{campo: ""})
              .order_by("-creado").values_list(campo, flat=True)[:300])

    clave = lambda f: f.lower().rstrip(".")  # noqa: E731
    cuenta, primera, reciente = {}, {}, {}
    for n, texto in enumerate(textos):
        for f in partir_frases(texto):
            k = clave(f)
            cuenta[k] = cuenta.get(k, 0) + 1
            primera.setdefault(k, f)
            reciente.setdefault(k, n)
    resultado = [primera[k] for k in sorted(cuenta, key=lambda k: (-cuenta[k], reciente[k]))[:MAX_FRASES]]
    for f in FRASES_BASE.get(campo, []):
        if len(resultado) >= MAX_FRASES:
            break
        if clave(f) not in cuenta:
            resultado.append(f)
    return Response(resultado)


# ---------------------------------------------------------------------------
# Ficha rápida del alumno (se abre desde la lista)
# ---------------------------------------------------------------------------

def resumen_registros(qs):
    c = {(e, j): n for e, j, n in qs.values_list("estado", "justificada").annotate(n=Count("id"))}
    total = sum(c.values())
    presentes = sum(n for (e, _), n in c.items() if e in ("P", "T"))
    return {"clases": total, "presentes": presentes, "ausentes": c.get(("A", False), 0),
            "tardanzas": sum(n for (e, _), n in c.items() if e == "T"),
            "justificadas": c.get(("A", True), 0), "porcentaje": round(presentes * 100 / total, 1) if total else None}


@api_view(["GET"])
@permission_classes([EsPersonal])
def ficha(request):
    """
    Todo lo del alumno en esta clase, en una sola consulta:
    GET /api/ficha/?asignacion=5&matricula=12
    Asistencia (en la materia y en general), trabajos y logro por etapa,
    registros anecdóticos y contactos de la familia.
    """
    from asistencia.models import RegistroAsistencia
    from personas.models import AlumnoTutor

    asignacion = asignacion_del_pedido(request)
    try:
        m = asignacion.seccion.matriculas.select_related("alumno").get(pk=request.query_params.get("matricula"))
    except (Matricula.DoesNotExist, ValueError, TypeError):
        raise ValidationError("El alumno no pertenece a esta clase.")
    alumno = m.alumno
    hoy = date.today()
    inst = institucion_de(request)

    registros = RegistroAsistencia.objects.filter(matricula=m)
    faltas = [{"sesion__fecha": f["sesion__fecha"], "estado": "J" if f["justificada"] else "A"}
              for f in registros.filter(sesion__asignacion=asignacion, estado="A")
              .order_by("-sesion__fecha").values("sesion__fecha", "justificada")[:5]]

    puntajes = {p.instrumento_id: p for p in Puntaje.objects.filter(matricula=m, instrumento__asignacion=asignacion)}
    vacio = Puntaje()
    trabajos = []
    for i in asignacion.instrumentos.select_related("etapa").order_by("fecha", "id"):
        p = puntajes.get(i.id, vacio)
        trabajos.append({
            "id": i.id, "titulo": i.titulo, "fecha": i.fecha, "etapa": i.etapa.numero, "puntaje_total": i.puntaje_total,
            "puntaje": p.puntaje, "recuperatorio": p.recuperatorio, "entrega_tardia": p.entrega_tardia,
            "efectivo": p.efectivo, "pendiente": p.efectivo is None and i.fecha <= hoy,
        })

    etapas = []
    for e in Etapa.objects.filter(anio_lectivo_id=asignacion.seccion.anio_lectivo_id).order_by("numero"):
        pl = calcular_planilla(asignacion, e.id, Matricula.objects.filter(pk=m.pk))
        if pl["total_posible"] and pl["alumnos"]:
            fila = pl["alumnos"][0]
            etapas.append({"etapa": str(e.numero) + "ª " + e.nombre, "logrado": fila["logrado"],
                           "total_posible": pl["total_posible"], "porcentaje": fila["porcentaje"]})

    anecdoticos = RegistroAnecdotico.objects.filter(alumnos=m).select_related(
        "asignacion__materia", "asignacion__seccion__curso", "registrado_por").prefetch_related("alumnos__alumno")
    if not request.user.es_gestion:
        anecdoticos = anecdoticos.filter(asignacion=asignacion)

    d = asignacion.docente
    return Response({
        "matricula": m.id, "numero_lista": m.numero_lista, "estado": m.get_estado_display(),
        "alumno": {"id": alumno.id, "nombre": str(alumno), "nombres": alumno.nombres, "ci": alumno.ci,
                   "fecha_nacimiento": alumno.fecha_nacimiento, "telefono": alumno.telefono,
                   "observaciones": alumno.observaciones},
        "clase": {"materia": asignacion.materia.nombre, "seccion": str(asignacion.seccion),
                  "docente": f"{d.nombres} {d.apellidos}"},
        "minimos": {"asistencia": inst.asistencia_minima, "logro": inst.logro_minimo},
        "asistencia": {
            "materia": resumen_registros(registros.filter(sesion__asignacion=asignacion)),
            "general": resumen_registros(registros),
            "ultimas_faltas": [{"fecha": f["sesion__fecha"], "estado": f["estado"]} for f in faltas],
        },
        "trabajos": trabajos,
        "etapas": etapas,
        "anecdoticos": RegistroAnecdoticoSerializer(anecdoticos[:20], many=True, context={"request": request}).data,
        "tutores": [{"nombre": f"{at.tutor.nombres} {at.tutor.apellidos}", "parentesco": at.parentesco,
                     "telefono": at.tutor.telefono, "principal": at.es_principal}
                    for at in AlumnoTutor.objects.filter(alumno=alumno).select_related("tutor").order_by("-es_principal")],
    })



# ------------------------------- Plan anual -------------------------------

def _plan_json(asignacion, request):
    from .models import PlanAnual

    plan = PlanAnual.objects.filter(asignacion=asignacion).select_related("revisado_por").first()
    unidades = list(asignacion.unidades.order_by("numero").values(
        "id", "numero", "titulo", "fecha_inicio", "fecha_fin", "contenidos", "estrategias", "recursos", "evaluacion"))
    completas = sum(1 for u in unidades if u["fecha_inicio"] and u["contenidos"] and u["evaluacion"])
    return {
        "asignacion": asignacion.id,
        "materia": asignacion.materia.nombre,
        "seccion": str(asignacion.seccion),
        "docente": str(asignacion.docente),
        "estado": plan.estado if plan else "SIN_CARGAR",
        "archivo": request.build_absolute_uri(plan.archivo.url) if plan and plan.archivo else None,
        "observaciones": plan.observaciones if plan else "",
        "enviado": plan.enviado if plan else None,
        "revisado": plan.revisado if plan else None,
        "revisado_por": str(plan.revisado_por) if plan and plan.revisado_por else None,
        "unidades": len(unidades),
        "unidades_completas": completas,
    }


@api_view(["GET", "POST"])
@permission_classes([EsPersonal])
def plan_anual(request, asignacion_id, accion=None):
    """
    GET  /api/plan-anual/<asignacion>/                 -> estado del plan anual de la materia
    POST /api/plan-anual/<asignacion>/archivo/         -> sube o reemplaza el PDF (multipart: archivo)
    POST /api/plan-anual/<asignacion>/quitar-archivo/  -> borra el PDF
    POST /api/plan-anual/<asignacion>/enviar/          -> el docente lo envía a coordinación
    POST /api/plan-anual/<asignacion>/revisar/         -> gestión: {decision: APROBADO | OBSERVADO, observaciones}
    """
    from django.utils import timezone
    from .models import PlanAnual

    try:
        asignacion = Asignacion.objects.select_related("materia", "seccion", "docente").get(pk=asignacion_id)
    except Asignacion.DoesNotExist:
        raise ValidationError("La materia no existe.")
    verificar_asignacion(request, asignacion)

    if request.method == "POST":
        plan, _ = PlanAnual.objects.get_or_create(asignacion=asignacion)
        if accion == "archivo":
            f = request.FILES.get("archivo")
            if not f:
                raise ValidationError("Elegí el archivo del plan anual.")
            if not f.name.lower().endswith(".pdf"):
                raise ValidationError("El plan anual tiene que ser un archivo PDF.")
            if f.size > 15 * 1024 * 1024:
                raise ValidationError("El PDF no puede pasar de 15 MB.")
            if plan.archivo:
                plan.archivo.delete(save=False)
            plan.archivo = f
            if plan.estado == PlanAnual.Estado.APROBADO:
                plan.estado = PlanAnual.Estado.BORRADOR  # un plan cambiado se vuelve a revisar
            plan.save()
        elif accion == "quitar-archivo":
            if plan.archivo:
                plan.archivo.delete(save=False)
            plan.archivo = None
            if plan.estado == PlanAnual.Estado.APROBADO:
                plan.estado = PlanAnual.Estado.BORRADOR
            plan.save()
        elif accion == "enviar":
            if not plan.archivo and not asignacion.unidades.exists():
                raise ValidationError("Subí el PDF o cargá al menos una unidad antes de enviarlo.")
            plan.estado = PlanAnual.Estado.ENVIADO
            plan.enviado = timezone.now()
            plan.save()
        elif accion == "revisar":
            if not request.user.es_gestion:
                raise ValidationError("Solo dirección o coordinación pueden revisar el plan anual.")
            decision = request.data.get("decision")
            if decision not in (PlanAnual.Estado.APROBADO, PlanAnual.Estado.OBSERVADO):
                raise ValidationError("Indicá si se aprueba o se devuelve con observaciones.")
            obs = (request.data.get("observaciones") or "").strip()
            if decision == PlanAnual.Estado.OBSERVADO and not obs:
                raise ValidationError("Escribí qué tiene que corregir el docente.")
            plan.estado = decision
            plan.observaciones = obs
            plan.revisado = timezone.now()
            plan.revisado_por = request.user
            plan.save()
        else:
            raise ValidationError("Acción desconocida.")
    return Response(_plan_json(asignacion, request))


@api_view(["GET"])
@permission_classes([EsPersonal])
def planes_anuales(request):
    """Gestión: estado del plan anual de todas las materias del año activo."""
    if not request.user.es_gestion:
        raise ValidationError("Solo para dirección y coordinación.")
    asignaciones = Asignacion.objects.filter(
        seccion__anio_lectivo__institucion_id=institucion_de(request).pk, seccion__anio_lectivo__activo=True,
    ).select_related(
        "materia", "seccion__curso", "docente").order_by("docente__apellidos", "seccion__curso", "materia__nombre")
    return Response([_plan_json(a, request) for a in asignaciones])


# ------------------------ Control de la planificación ------------------------

@api_view(["GET"])
@permission_classes([EsPersonal])
def control_planificacion(request):
    """
    Gestión: cómo va la planificación de clases de cada materia del año activo en un mes.
    GET /api/planificacion/control/?mes=2026-04
    """
    from django.db.models import Max
    from django.utils import timezone
    from academico.models import AnioLectivo

    if not request.user.es_gestion:
        raise ValidationError("Solo para dirección y coordinación.")
    inst = institucion_de(request)
    anio = AnioLectivo.actual(inst)
    if anio is None:
        raise ValidationError("No hay un año lectivo activo.")
    primero, ultimo = leer_mes(request.query_params.get("mes") or f"{date.today():%Y-%m}")
    rango = (primero, ultimo)

    asignaciones = Asignacion.objects.filter(seccion__anio_lectivo=anio).select_related(
        "materia", "seccion__curso", "seccion__anio_lectivo", "docente",
    ).order_by("docente__apellidos", "docente__nombres", "seccion__curso", "materia__nombre")
    libres = set(DiaNoLectivo.objects.filter(anio_lectivo=anio, fecha__range=rango).values_list("fecha", flat=True))

    def por_asignacion(pares):
        d = {}
        for a_id, f in pares:
            d.setdefault(a_id, set()).add(f)
        return d

    planes = por_asignacion(PlanClase.objects.filter(
        asignacion__seccion__anio_lectivo=anio, fecha__range=rango).values_list("asignacion_id", "fecha"))
    dadas = por_asignacion(SesionClase.objects.filter(
        asignacion__seccion__anio_lectivo=anio, fecha__range=rango).values_list("asignacion_id", "fecha"))
    desarrollos = por_asignacion(RegistroClase.objects.filter(
        sesion__asignacion__seccion__anio_lectivo=anio, sesion__fecha__range=rango,
    ).values_list("sesion__asignacion_id", "sesion__fecha"))
    totales = {t["asignacion"]: t for t in PlanClase.objects.filter(asignacion__seccion__anio_lectivo=anio)
               .values("asignacion").annotate(hasta=Max("fecha"), ultima=Max("modificado"), total=Count("id"))}

    filas = []
    for a in asignaciones:
        clases = dias_de_clase(a, primero, ultimo, libres)
        planificadas = sum(1 for f in clases if f in planes.get(a.id, ()))
        if not a.dias_clase:
            estado = "SIN_HORARIO"
        elif not clases:
            estado = "SIN_CLASES"
        elif planificadas == len(clases):
            estado = "COMPLETA"
        elif planificadas:
            estado = "PARCIAL"
        else:
            estado = "SIN_PLANIFICAR"
        t = totales.get(a.id, {})
        filas.append({
            "asignacion": a.id,
            "docente_id": a.docente_id,
            "docente": str(a.docente),
            "materia": a.materia.nombre,
            "seccion": str(a.seccion),
            "estado": estado,
            "clases": len(clases),
            "planificadas": planificadas,
            "dadas": len(dadas.get(a.id, ())),
            "con_desarrollo": len(desarrollos.get(a.id, ())),
            "planificado_hasta": t.get("hasta"),
            "ultima_carga": t.get("ultima"),
            "total_planificadas": t.get("total", 0),
        })

    return Response({
        "institucion": inst.nombre,
        "anio": anio.anio,
        "mes": f"{primero:%Y-%m}",
        "generado": timezone.localtime().isoformat(),
        "resumen": {e: sum(1 for f in filas if f["estado"] == e)
                    for e in ("COMPLETA", "PARCIAL", "SIN_PLANIFICAR", "SIN_HORARIO", "SIN_CLASES")},
        "materias": filas,
    })


# --------------------- Evaluaciones de la sección (todas las materias) ---------------------

@api_view(["GET"])
@permission_classes([EsPersonal])
def evaluaciones_seccion(request):
    """
    Trabajos y pruebas de todas las materias de una sección, para no cargar al curso
    con muchas evaluaciones el mismo día.
    GET /api/evaluaciones/?seccion=3&desde=2026-04-06&hasta=2026-04-11
    Un docente solo ve las secciones donde da clase.
    """
    from academico.models import Seccion

    try:
        seccion = Seccion.objects.get(pk=request.query_params.get("seccion"))
    except (Seccion.DoesNotExist, ValueError, TypeError):
        raise ValidationError("Indicá una sección válida (?seccion=ID).")
    docente = getattr(request.user, "docente", None)
    if not request.user.es_gestion and not (
            docente and seccion.asignaciones.filter(docente=docente).exists()):
        raise ValidationError("Solo podés ver las evaluaciones de las secciones donde das clase.")
    desde = leer_fecha(request.query_params.get("desde"), "desde")
    hasta = leer_fecha(request.query_params.get("hasta"), "hasta")
    if hasta < desde or (hasta - desde).days > 62:
        raise ValidationError("Elegí un rango de hasta dos meses.")

    qs = Instrumento.objects.filter(asignacion__seccion=seccion, fecha__range=(desde, hasta)).select_related(
        "asignacion__materia", "asignacion__docente").order_by("fecha", "asignacion__materia__nombre", "id")
    inst = institucion_de(request)
    return Response({
        "seccion": str(seccion),
        # Reglas del colegio (las configura dirección en Gestión > Institución).
        "maximo_por_dia": inst.max_evaluaciones_dia,
        "cuentan": inst.evaluaciones_cuentan,
        "bloquea": inst.bloquear_evaluaciones,
        "evaluaciones": [{
            "cuenta": inst.cuenta_como_evaluacion(t.tipo),
            "id": t.id,
            "fecha": t.fecha,
            "titulo": t.titulo,
            "tipo": t.tipo,
            "tipo_texto": t.get_tipo_display(),
            "asignacion": t.asignacion_id,
            "materia": t.asignacion.materia.nombre,
            "docente": str(t.asignacion.docente),
            "propia": docente is not None and t.asignacion.docente_id == docente.id,
        } for t in qs],
    })
