from django.db import transaction
from rest_framework import serializers

from academico.models import Matricula
from .models import Justificacion, PermisoDocente, RegistroAsistencia, SesionClase


class RegistroAsistenciaSerializer(serializers.ModelSerializer):
    alumno = serializers.CharField(source="matricula.alumno.__str__", read_only=True)
    minutos_tarde = serializers.IntegerField(read_only=True)

    class Meta:
        model = RegistroAsistencia
        fields = ["id", "matricula", "alumno", "estado", "hora_llegada", "minutos_tarde", "observacion"]


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
        for r in registros:
            estado = r.get("estado", "P")
            RegistroAsistencia.objects.update_or_create(
                sesion=sesion, matricula=r["matricula"],
                defaults={
                    "estado": estado,
                    # La hora de llegada solo tiene sentido en una tardanza.
                    "hora_llegada": r.get("hora_llegada") if estado == RegistroAsistencia.Estado.TARDANZA else None,
                    "observacion": r.get("observacion", ""),
                },
            )


class JustificacionSerializer(serializers.ModelSerializer):
    alumno = serializers.CharField(source="matricula.alumno.__str__", read_only=True)

    class Meta:
        model = Justificacion
        fields = "__all__"
        read_only_fields = ["registrado_por"]

    def validate(self, data):
        if data["fecha_desde"] > data["fecha_hasta"]:
            raise serializers.ValidationError("La fecha 'desde' no puede ser posterior a 'hasta'.")
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
        ausentes=Count("asistencias", filter=Q(asistencias__estado="A")),
        justificadas=Count("asistencias", filter=Q(asistencias__estado="J")),
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
