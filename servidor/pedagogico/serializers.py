from django.db import transaction
from rest_framework import serializers

from academico.models import Institucion

from .models import (Capacidad, Indicador, Instrumento, PlanClase, Puntaje, RegistroAnecdotico,
                     RegistroClase, Sugerencia, Unidad)


def verificar_asignacion(request, asignacion):
    """Un docente solo trabaja sobre sus propias asignaciones; gestión sobre todas."""
    user = request.user
    if user.es_gestion:
        return
    docente = getattr(user, "docente", None)
    if docente is None or asignacion.docente_id != docente.id:
        raise serializers.ValidationError("Solo podés registrar datos en tus propias clases.")


# --------------------------- Planificación ---------------------------------

class IndicadorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Indicador
        fields = ["id", "capacidad", "orden", "descripcion"]
        extra_kwargs = {"capacidad": {"required": False}}

    def validate(self, data):
        capacidad = data.get("capacidad") or getattr(self.instance, "capacidad", None)
        if capacidad and "request" in self.context:
            verificar_asignacion(self.context["request"], capacidad.unidad.asignacion)
        return data


class CapacidadSerializer(serializers.ModelSerializer):
    indicadores = IndicadorSerializer(many=True, required=False)

    class Meta:
        model = Capacidad
        fields = ["id", "unidad", "orden", "descripcion", "indicadores"]
        extra_kwargs = {"unidad": {"required": False}}

    def validate(self, data):
        unidad = data.get("unidad") or getattr(self.instance, "unidad", None)
        if unidad and "request" in self.context:
            verificar_asignacion(self.context["request"], unidad.asignacion)
        return data

    @transaction.atomic
    def create(self, data):
        indicadores = data.pop("indicadores", [])
        capacidad = Capacidad.objects.create(**data)
        for i in indicadores:
            i.pop("capacidad", None)
            Indicador.objects.create(capacidad=capacidad, **i)
        return capacidad

    def update(self, instance, data):
        data.pop("indicadores", None)  # los indicadores se editan en /api/indicadores/
        return super().update(instance, data)


class UnidadSerializer(serializers.ModelSerializer):
    """
    Se puede crear la unidad completa en un solo POST:
    {asignacion, etapa, numero, titulo, competencia,
     capacidades: [{descripcion, indicadores: [{descripcion}, ...]}, ...]}
    Para editar después, usar /api/capacidades/ y /api/indicadores/.
    """

    capacidades = CapacidadSerializer(many=True, required=False)

    class Meta:
        model = Unidad
        fields = ["id", "asignacion", "etapa", "numero", "titulo", "competencia", "fecha_inicio", "fecha_fin",
                  "contenidos", "estrategias", "recursos", "evaluacion", "capacidades", "creado"]

    def validate(self, data):
        asignacion = data.get("asignacion") or self.instance.asignacion
        verificar_asignacion(self.context["request"], asignacion)
        etapa = data.get("etapa")
        if etapa and etapa.anio_lectivo_id != asignacion.seccion.anio_lectivo_id:
            raise serializers.ValidationError("La etapa no corresponde al año lectivo de la sección.")
        desde = data.get("fecha_inicio", getattr(self.instance, "fecha_inicio", None))
        hasta = data.get("fecha_fin", getattr(self.instance, "fecha_fin", None))
        if desde and hasta and hasta < desde:
            raise serializers.ValidationError("La fecha 'hasta' no puede ser anterior a 'desde'.")
        return data

    @transaction.atomic
    def create(self, data):
        capacidades = data.pop("capacidades", [])
        unidad = Unidad.objects.create(**data)
        for orden, c in enumerate(capacidades, start=1):
            indicadores = c.pop("indicadores", [])
            c.pop("unidad", None)
            c.setdefault("orden", orden)
            capacidad = Capacidad.objects.create(unidad=unidad, **c)
            for o, i in enumerate(indicadores, start=1):
                i.pop("capacidad", None)
                i.setdefault("orden", o)
                Indicador.objects.create(capacidad=capacidad, **i)
        return unidad

    def update(self, instance, data):
        data.pop("capacidades", None)
        return super().update(instance, data)


# --------------------------- Registro de clase ------------------------------

class RegistroClaseSerializer(serializers.ModelSerializer):
    fecha = serializers.DateField(source="sesion.fecha", read_only=True)
    asignacion = serializers.IntegerField(source="sesion.asignacion_id", read_only=True)
    unidad_titulo = serializers.CharField(source="unidad.__str__", read_only=True, default=None)

    class Meta:
        model = RegistroClase
        fields = ["id", "sesion", "fecha", "asignacion", "unidad", "unidad_titulo", "capacidades",
                  "indicadores_evaluados", "contenido", "actividades", "observaciones", "creado", "modificado"]

    def validate(self, data):
        sesion = data.get("sesion") or self.instance.sesion
        asignacion = sesion.asignacion
        verificar_asignacion(self.context["request"], asignacion)
        unidad = data.get("unidad")
        if unidad and unidad.asignacion_id != asignacion.id:
            raise serializers.ValidationError("La unidad no pertenece a esta clase.")
        for c in data.get("capacidades", []):
            if c.unidad.asignacion_id != asignacion.id:
                raise serializers.ValidationError(f"La capacidad {c.id} no pertenece a esta clase.")
        for i in data.get("indicadores_evaluados", []):
            if i.capacidad.unidad.asignacion_id != asignacion.id:
                raise serializers.ValidationError(f"El indicador {i.id} no pertenece a esta clase.")
        return data


class PlanClaseSerializer(serializers.ModelSerializer):
    unidad_titulo = serializers.CharField(source="unidad.__str__", read_only=True, default=None)

    class Meta:
        model = PlanClase
        fields = ["id", "asignacion", "fecha", "unidad", "unidad_titulo", "capacidades", "indicadores",
                  "contenido", "actividades", "recursos", "modificado"]
        validators = []  # la fecha repetida se valida abajo, con un mensaje en castellano

    def validate(self, data):
        asignacion = data.get("asignacion") or self.instance.asignacion
        if self.instance and asignacion.id != self.instance.asignacion_id:
            raise serializers.ValidationError("No se puede pasar una clase planificada a otra materia.")
        verificar_asignacion(self.context["request"], asignacion)
        fecha = data.get("fecha")
        anio = asignacion.seccion.anio_lectivo
        if fecha and not anio.fecha_inicio <= fecha <= anio.fecha_fin:
            raise serializers.ValidationError(f"La fecha está fuera del año lectivo {anio}.")
        otra = PlanClase.objects.filter(asignacion=asignacion, fecha=fecha)
        if self.instance:
            otra = otra.exclude(pk=self.instance.pk)
        if fecha and otra.exists():
            raise serializers.ValidationError("Ya hay una clase planificada en esa fecha.")
        unidad = data.get("unidad")
        if unidad and unidad.asignacion_id != asignacion.id:
            raise serializers.ValidationError("La unidad no pertenece a esta clase.")
        for c in data.get("capacidades", []):
            if c.unidad.asignacion_id != asignacion.id:
                raise serializers.ValidationError(f"La capacidad {c.id} no pertenece a esta clase.")
        for i in data.get("indicadores", []):
            if i.capacidad.unidad.asignacion_id != asignacion.id:
                raise serializers.ValidationError(f"El indicador {i.id} no pertenece a esta clase.")
        return data


class SugerenciaSerializer(serializers.ModelSerializer):
    unidad_titulo = serializers.CharField(source="unidad.__str__", read_only=True, default=None)
    fecha_clase = serializers.DateField(source="registro_clase.sesion.fecha", read_only=True, default=None)
    autor_nombre = serializers.SerializerMethodField()
    materia = serializers.CharField(source="asignacion.materia.nombre", read_only=True)
    seccion = serializers.CharField(source="asignacion.seccion.__str__", read_only=True)

    class Meta:
        model = Sugerencia
        fields = ["id", "asignacion", "materia", "seccion", "sobre", "unidad", "unidad_titulo", "registro_clase",
                  "fecha_clase", "texto", "autor_nombre", "creado", "leida", "leida_en"]
        read_only_fields = ["leida", "leida_en"]

    def get_autor_nombre(self, obj):
        u = obj.autor
        return (u.get_full_name() or u.username) if u else ""

    def validate(self, data):
        if not self.context["request"].user.es_gestion:
            raise serializers.ValidationError("Solo dirección y coordinación pueden dejar sugerencias.")
        asignacion = data.get("asignacion") or self.instance.asignacion
        sobre = data.get("sobre", getattr(self.instance, "sobre", None))
        unidad = data.get("unidad")
        registro = data.get("registro_clase")
        if unidad and unidad.asignacion_id != asignacion.id:
            raise serializers.ValidationError("La unidad no pertenece a esta materia.")
        if registro and registro.sesion.asignacion_id != asignacion.id:
            raise serializers.ValidationError("La clase no pertenece a esta materia.")
        if sobre == Sugerencia.Sobre.CLASE and not (registro or getattr(self.instance, "registro_clase", None)):
            raise serializers.ValidationError("Indicá sobre qué clase es la sugerencia.")
        if not str(data.get("texto", getattr(self.instance, "texto", ""))).strip():
            raise serializers.ValidationError("Escribí la sugerencia.")
        return data


# --------------------------- Registro anecdótico ----------------------------

class RegistroAnecdoticoSerializer(serializers.ModelSerializer):
    alumnos_nombres = serializers.SerializerMethodField()
    asignacion_descripcion = serializers.CharField(source="asignacion.__str__", read_only=True)
    registrado_por_nombre = serializers.CharField(source="registrado_por.__str__", read_only=True, default=None)

    class Meta:
        model = RegistroAnecdotico
        fields = "__all__"
        read_only_fields = ["registrado_por"]

    def get_alumnos_nombres(self, obj):
        return [str(m.alumno) for m in obj.alumnos.all()]

    def validate(self, data):
        asignacion = data.get("asignacion") or self.instance.asignacion
        verificar_asignacion(self.context["request"], asignacion)
        alumnos = data.get("alumnos")
        if alumnos is not None:
            if not alumnos:
                raise serializers.ValidationError("Indicá al menos un alumno involucrado.")
            for m in alumnos:
                if m.seccion_id != asignacion.seccion_id:
                    raise serializers.ValidationError(f"{m.alumno} no pertenece a la sección de esta clase.")
        return data


# --------------------------- Trabajos y puntajes ----------------------------

class InstrumentoSerializer(serializers.ModelSerializer):
    etapa_nombre = serializers.CharField(source="etapa.__str__", read_only=True)
    evaluados = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Instrumento
        fields = "__all__"

    def validate(self, data):
        asignacion = data.get("asignacion") or self.instance.asignacion
        verificar_asignacion(self.context["request"], asignacion)
        etapa = data.get("etapa")
        if etapa and etapa.anio_lectivo_id != asignacion.seccion.anio_lectivo_id:
            raise serializers.ValidationError("La etapa no corresponde al año lectivo de la sección.")
        total = data.get("puntaje_total")
        if total is not None and total <= 0:
            raise serializers.ValidationError("El puntaje total debe ser mayor a cero.")
        if total is not None and self.instance:
            maximo = self.instance.puntajes.exclude(puntaje=None).order_by("-puntaje").first()
            if maximo and maximo.puntaje > total:
                raise serializers.ValidationError(
                    f"Ya hay alumnos con {maximo.puntaje} puntos; el total no puede ser menor.")
        for i in data.get("indicadores", []):
            if i.capacidad.unidad.asignacion_id != asignacion.id:
                raise serializers.ValidationError(f"El indicador {i.id} no pertenece a esta clase.")
        self._validar_maximo_del_dia(data, asignacion)
        return data

    def _validar_maximo_del_dia(self, data, asignacion):
        """Si el colegio lo bloquea, una sección no puede pasar del máximo de evaluaciones por día."""
        fecha = data.get("fecha", getattr(self.instance, "fecha", None))
        tipo = data.get("tipo", getattr(self.instance, "tipo", Instrumento.Tipo.PRACTICO))
        if self.instance and fecha == self.instance.fecha and tipo == self.instance.tipo:
            return  # no cambió el día ni el tipo: no se revisa (no traba la edición de lo ya cargado)
        inst = Institucion.objects.first()
        if not (inst and inst.bloquear_evaluaciones and inst.max_evaluaciones_dia and fecha
                and inst.cuenta_como_evaluacion(tipo)):
            return
        otras = [t for t in evaluaciones_del_dia(asignacion.seccion_id, fecha, inst)
                 if not self.instance or t.id != self.instance.id]
        if len(otras) >= inst.max_evaluaciones_dia:
            solo_pruebas = inst.evaluaciones_cuentan == Institucion.EvaluacionesCuentan.PRUEBAS

            def plural(n):
                if n == 1:
                    return "1 prueba" if solo_pruebas else "1 evaluación"
                return f"{n} pruebas" if solo_pruebas else f"{n} evaluaciones"

            materias = ", ".join(t.asignacion.materia.nombre for t in otras)
            raise serializers.ValidationError(
                f"La sección ya tiene {plural(len(otras))} el {fecha:%d/%m} ({materias}). "
                f"El colegio permite como máximo {plural(inst.max_evaluaciones_dia)} por día. Elegí otra fecha.")


def evaluaciones_del_dia(seccion_id, fecha, inst):
    """Trabajos de la sección en esa fecha que cuentan para el máximo por día."""
    qs = Instrumento.objects.filter(asignacion__seccion_id=seccion_id, fecha=fecha).select_related("asignacion__materia")
    return [t for t in qs if inst.cuenta_como_evaluacion(t.tipo)]


class PuntajeItemSerializer(serializers.Serializer):
    matricula = serializers.IntegerField()
    puntaje = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    # Opcionales: si no vienen, se conserva lo que ya estaba cargado.
    recuperatorio = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True, required=False)
    entrega_tardia = serializers.BooleanField(required=False)
    observacion = serializers.CharField(required=False, allow_blank=True, max_length=200)


class PuntajesLoteSerializer(serializers.Serializer):
    """
    Carga de puntajes de todo el curso:
    {puntajes: [{matricula, puntaje, recuperatorio, entrega_tardia, observacion}]}
    """

    puntajes = PuntajeItemSerializer(many=True)

    def validate_puntajes(self, items):
        instrumento = self.context["instrumento"]
        validas = set(instrumento.asignacion.seccion.matriculas.values_list("id", flat=True))
        errores = []
        for it in items:
            if it["matricula"] not in validas:
                errores.append(f"La matrícula {it['matricula']} no pertenece a esta sección.")
            for campo in ("puntaje", "recuperatorio"):
                p = it.get(campo)
                if p is not None and (p < 0 or p > instrumento.puntaje_total):
                    errores.append(f"Matrícula {it['matricula']}: el {campo} {p} debe estar entre 0 "
                                   f"y {instrumento.puntaje_total}.")
        if errores:
            raise serializers.ValidationError(errores)
        return items

    @transaction.atomic
    def save(self, **kwargs):
        instrumento = self.context["instrumento"]
        user = self.context["request"].user
        for it in self.validated_data["puntajes"]:
            datos = {k: it[k] for k in ("puntaje", "recuperatorio", "entrega_tardia", "observacion") if k in it}
            Puntaje.objects.update_or_create(
                instrumento=instrumento, matricula_id=it["matricula"],
                defaults={**datos, "registrado_por": user},
            )
        return instrumento


class LogroItemSerializer(serializers.Serializer):
    matricula = serializers.IntegerField()
    indicador = serializers.IntegerField()
    estado = serializers.ChoiceField(choices=["L", "NL"], allow_null=True)


class LogrosLoteSerializer(serializers.Serializer):
    """{logros: [{matricula, indicador, estado: 'L' | 'NL' | null}]}  (null = borrar la marca)"""

    logros = LogroItemSerializer(many=True)

    def validate_logros(self, items):
        unidad = self.context["unidad"]
        indicadores = set(Indicador.objects.filter(capacidad__unidad=unidad).values_list("id", flat=True))
        matriculas = set(unidad.asignacion.seccion.matriculas.values_list("id", flat=True))
        for it in items:
            if it["indicador"] not in indicadores:
                raise serializers.ValidationError(f"El indicador {it['indicador']} no pertenece a esta unidad.")
            if it["matricula"] not in matriculas:
                raise serializers.ValidationError(f"La matrícula {it['matricula']} no pertenece a esta sección.")
        return items

    @transaction.atomic
    def save(self, **kwargs):
        from .models import LogroIndicador

        user = self.context["request"].user
        for it in self.validated_data["logros"]:
            if it["estado"] is None:
                LogroIndicador.objects.filter(indicador_id=it["indicador"], matricula_id=it["matricula"]).delete()
            else:
                LogroIndicador.objects.update_or_create(
                    indicador_id=it["indicador"], matricula_id=it["matricula"],
                    defaults={"estado": it["estado"], "registrado_por": user},
                )
