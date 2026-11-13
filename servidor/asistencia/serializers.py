from django.db import transaction
from rest_framework import serializers

from academico.models import Matricula
from . import justificaciones as tramite
from .models import Justificacion, PermisoDocente, RegistroAsistencia, SesionClase

# "J" ya no es un estado: los teléfonos que aún la envían (listas guardadas sin señal) la convierten
# en ausencia + aviso del docente, que gestión revisa como justificativo.
AVISO = "J"
ESTADOS_LISTA = RegistroAsistencia.Estado.choices + [(AVISO, "Ausente con aviso (pasa a justificativo)")]


class RegistroAsistenciaSerializer(serializers.ModelSerializer):
    alumno = serializers.CharField(source="matricula.alumno.__str__", read_only=True)
    minutos_tarde = serializers.IntegerField(read_only=True)
    estado = serializers.ChoiceField(choices=ESTADOS_LISTA, default=RegistroAsistencia.Estado.PRESENTE)
    justificada = serializers.BooleanField(read_only=True)
    justificacion_estado = serializers.SerializerMethodField()

    class Meta:
        model = RegistroAsistencia
        fields = ["id", "matricula", "alumno", "estado", "justificada", "justificacion_estado", "hora_llegada",
                  "minutos_tarde", "observacion"]

    def get_justificacion_estado(self, obj):
        """Estado del último justificativo que incluye esta ausencia (sin mostrar su motivo)."""
        v = obj.vinculos_justificacion.select_related("justificacion").order_by("-justificacion_id").first()
        return v.justificacion.estado if v else None


class SesionClaseSerializer(serializers.ModelSerializer):
    """
    Guarda la lista completa en una sola petición:
    {uuid, asignacion, fecha, hora_inicio, tema, registros: [{matricula, estado, observacion}]}
    Si llega de nuevo la misma clase (mismo uuid, o misma asignación y fecha),
    se actualiza en vez de duplicarse. Así funciona la sincronización sin conexión.
    """

    uuid = serializers.UUIDField(required=False)
    registros = RegistroAsistenciaSerializer(many=True)
    docente = serializers.PrimaryKeyRelatedField(read_only=True)
    docente_nombre = serializers.CharField(source="docente.__str__", read_only=True)
    asignacion_descripcion = serializers.CharField(source="asignacion.__str__", read_only=True)

    class Meta:
        model = SesionClase
        fields = ["id", "uuid", "asignacion", "asignacion_descripcion", "docente", "docente_nombre",
                  "fecha", "hora_inicio", "tema", "registros", "creado", "sincronizado"]
        validators = []  # el upsert se encarga de la unicidad asignación/fecha

    def validate(self, data):
        asignacion = data.get("asignacion") or self.instance.asignacion
        user = self.context["request"].user
        if not user.es_gestion:
            docente = getattr(user, "docente", None)
            if docente is None or asignacion.docente_id != docente.id:
                raise serializers.ValidationError("Solo podés llamar lista en tus propias clases.")
        validas = set(asignacion.seccion.matriculas.values_list("id", flat=True))
        for r in data.get("registros", []):
            if r["matricula"].id not in validas:
                raise serializers.ValidationError(
                    f"La matrícula {r['matricula'].id} no pertenece a la sección de esta clase."
                )
        return data

    @transaction.atomic
    def create(self, data):
        registros = data.pop("registros", [])
        request = self.context["request"]
        sesion = None
        if data.get("uuid"):
            sesion = SesionClase.objects.filter(uuid=data["uuid"]).first()
            # Un uuid de otra clase u otro día nunca debe pisar esa lista: se ignora.
            if sesion and (sesion.asignacion_id != data["asignacion"].id or sesion.fecha != data["fecha"]):
                sesion = None
                data.pop("uuid")
        if sesion is None:
            sesion = SesionClase.objects.filter(asignacion=data["asignacion"], fecha=data["fecha"]).first()
        if sesion is None:
            sesion = SesionClase(**data)
        else:
            for k, v in data.items():
                if k != "uuid":
                    setattr(sesion, k, v)
        # La presencia queda a nombre del docente titular de la asignación.
        sesion.docente = data["asignacion"].docente
        sesion.registrado_por = request.user
        sesion.save()
        self._guardar_registros(sesion, registros)
        return sesion

    @transaction.atomic
    def update(self, sesion, data):
        registros = data.pop("registros", None)
        for k, v in data.items():
            if k != "uuid":
                setattr(sesion, k, v)
        sesion.registrado_por = self.context["request"].user
        sesion.save()
        if registros is not None:
            self._guardar_registros(sesion, registros)
        return sesion

    def _guardar_registros(self, sesion, registros):
        usuario = self.context["request"].user
        for r in registros:
            estado = r.get("estado", "P")
            observacion = r.get("observacion", "")
            con_aviso = estado == AVISO
            if con_aviso:
                estado = RegistroAsistencia.Estado.AUSENTE
            registro, _ = RegistroAsistencia.objects.update_or_create(
                sesion=sesion, matricula=r["matricula"],
                defaults={
                    "estado": estado,
                    # La hora de llegada solo tiene sentido en una tardanza.
                    "hora_llegada": r.get("hora_llegada") if estado == RegistroAsistencia.Estado.TARDANZA else None,
                    "observacion": observacion,
                },
            )
            if con_aviso:
                tramite.aviso_del_docente(registro, observacion.strip() or "Aviso de ausencia recibido en clase.", usuario)
            else:
                tramite.retirar_aviso_del_docente(registro, usuario)
            tramite.recalcular(registro)


class JustificacionSerializer(serializers.ModelSerializer):
    alumno = serializers.CharField(source="matricula.alumno.__str__", read_only=True)
    seccion = serializers.CharField(source="matricula.seccion.__str__", read_only=True)
    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)
    origen_nombre = serializers.CharField(source="get_origen_display", read_only=True)
    revisado_por_nombre = serializers.CharField(source="revisado_por.__str__", read_only=True, default=None)
    detalle_ausencias = serializers.SerializerMethodField()

    class Meta:
        model = Justificacion
        exclude = ["ausencias"]
        read_only_fields = ["registrado_por", "estado", "origen", "revisado_por", "decidido_en", "motivo_decision"]

    def get_detalle_ausencias(self, obj):
        return [{
            "registro": v.registro_id, "fecha": v.registro.sesion.fecha,
            "materia": v.registro.sesion.asignacion.materia.nombre, "aprobada": v.aprobada,
        } for v in obj.vinculos.select_related("registro__sesion__asignacion__materia").order_by("registro__sesion__fecha")]

    def validate(self, data):
        desde = data.get("fecha_desde", getattr(self.instance, "fecha_desde", None))
        hasta = data.get("fecha_hasta", getattr(self.instance, "fecha_hasta", None))
        if desde and hasta and desde > hasta:
            raise serializers.ValidationError("La fecha 'desde' no puede ser posterior a 'hasta'.")
        if self.instance is not None and not self.instance.abierto:
            raise serializers.ValidationError("Un justificativo ya decidido o cancelado no se modifica.")
        if self.instance is not None and "matricula" in data and data["matricula"] != self.instance.matricula:
            raise serializers.ValidationError({"matricula": "No se puede pasar el justificativo a otro alumno."})
        return data


class PermisoDocenteSerializer(serializers.ModelSerializer):
    docente_nombre = serializers.CharField(source="docente.__str__", read_only=True)

    class Meta:
        model = PermisoDocente
        fields = "__all__"


def resumen_asistencia(matriculas_qs, minimo):
    """Porcentaje de asistencia por matrícula. Tardanza cuenta como presente."""
    from django.db.models import Count, Q

    filas = []
    qs = matriculas_qs.select_related("alumno").annotate(
        total=Count("asistencias"),
        presentes=Count("asistencias", filter=Q(asistencias__estado__in=["P", "T"])),
        ausentes=Count("asistencias", filter=Q(asistencias__estado="A", asistencias__justificada=False)),
        justificadas=Count("asistencias", filter=Q(asistencias__estado="A", asistencias__justificada=True)),
        tardanzas=Count("asistencias", filter=Q(asistencias__estado="T")),
    )
    for m in qs:
        pct = round(m.presentes * 100 / m.total, 1) if m.total else None
        filas.append({
            "matricula": m.id,
            "numero_lista": m.numero_lista,
            "alumno": str(m.alumno),
            "ci": m.alumno.ci,
            "clases": m.total,
            "presentes": m.presentes,
            "ausentes": m.ausentes,
            "justificadas": m.justificadas,
            "tardanzas": m.tardanzas,
            "porcentaje": pct,
            "bajo_minimo": pct is not None and pct < minimo,
        })
    return filas
