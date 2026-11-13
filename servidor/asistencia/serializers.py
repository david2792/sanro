from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from nucleo import contexto
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
    origen = serializers.CharField(read_only=True)

    class Meta:
        model = RegistroAsistencia
        fields = ["id", "matricula", "alumno", "estado", "justificada", "justificacion_estado", "hora_llegada",
                  "minutos_tarde", "hora_salida", "observacion", "origen"]

    def get_justificacion_estado(self, obj):
        """Estado del último justificativo que incluye esta ausencia (sin mostrar su motivo)."""
        v = obj.vinculos_justificacion.select_related("justificacion").order_by("-justificacion_id").first()
        return v.justificacion.estado if v else None


def puede_corregir(usuario, sesion):
    """Una lista confirmada la corrige gestión, o su docente el mismo día de la clase."""
    if usuario.es_gestion:
        return True
    docente = getattr(usuario, "docente", None)
    return docente is not None and sesion.asignacion.docente_id == docente.id and sesion.fecha == timezone.localdate()


class SesionClaseSerializer(serializers.ModelSerializer):
    """
    Guarda la lista completa en una sola petición:
    {uuid, asignacion, fecha, hora_inicio, tema, confirmar, motivo, sin_conexion,
     registros: [{matricula, estado, hora_llegada, hora_salida, observacion}]}
    Si llega de nuevo la misma clase (mismo uuid, o misma asignación y fecha), se actualiza en vez de
    duplicarse: así funciona la sincronización sin conexión.

    - confirmar (por defecto sí): BORRADOR -> CONFIRMADA. Una lista confirmada no vuelve a borrador.
    - Cambiar marcas de una lista confirmada es una corrección: exige `motivo` (queda en la auditoría)
      y solo la hace gestión, o el docente el mismo día de la clase.
    """

    uuid = serializers.UUIDField(required=False)
    registros = RegistroAsistenciaSerializer(many=True)
    docente = serializers.PrimaryKeyRelatedField(read_only=True)
    docente_nombre = serializers.CharField(source="docente.__str__", read_only=True)
    asignacion_descripcion = serializers.CharField(source="asignacion.__str__", read_only=True)
    estado = serializers.CharField(read_only=True)
    confirmar = serializers.BooleanField(write_only=True, required=False, default=True)
    motivo = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=250)
    sin_conexion = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = SesionClase
        fields = ["id", "uuid", "asignacion", "asignacion_descripcion", "docente", "docente_nombre",
                  "fecha", "hora_inicio", "tema", "estado", "confirmada_en", "registros", "creado", "sincronizado",
                  "confirmar", "motivo", "sin_conexion", "motivo_anulacion"]
        read_only_fields = ["confirmada_en", "motivo_anulacion"]
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

    @staticmethod
    def _opciones(data):
        return {k: data.pop(k, d) for k, d in (("confirmar", True), ("motivo", ""), ("sin_conexion", False))}

    @transaction.atomic
    def create(self, data):
        opciones = self._opciones(data)
        registros = data.pop("registros", [])
        sesion = None
        if data.get("uuid"):
            sesion = SesionClase.todas.filter(uuid=data["uuid"]).first()
            # Un uuid de otra clase u otro día nunca debe pisar esa lista: se ignora.
            if sesion and (sesion.asignacion_id != data["asignacion"].id or sesion.fecha != data["fecha"]):
                sesion = None
                data.pop("uuid")
        if sesion is None:
            sesion = SesionClase.todas.filter(asignacion=data["asignacion"], fecha=data["fecha"]).first()
        if sesion is None:
            sesion = SesionClase(**data, estado=SesionClase.Estado.BORRADOR,
                                 creado_por=self.context["request"].user)
        else:
            for k, v in data.items():
                if k != "uuid":
                    setattr(sesion, k, v)
        # La presencia queda a nombre del docente titular de la asignación.
        sesion.docente = data["asignacion"].docente
        return self._guardar(sesion, registros, **opciones)

    @transaction.atomic
    def update(self, sesion, data):
        opciones = self._opciones(data)
        registros = data.pop("registros", None)
        for k, v in data.items():
            if k != "uuid":
                setattr(sesion, k, v)
        return self._guardar(sesion, registros, **opciones)

    def _guardar(self, sesion, registros, confirmar, motivo, sin_conexion):
        usuario = self.context["request"].user
        E = SesionClase.Estado
        if sesion.estado == E.ANULADA:
            raise serializers.ValidationError(
                f"La clase de ese día fue anulada ({sesion.motivo_anulacion}). No se puede cargar la lista.")
        confirmada = sesion.pk is not None and sesion.estado == E.CONFIRMADA
        motivo = (motivo or "").strip()
        if confirmada and registros is not None and self._hay_cambios(sesion, registros):
            if not puede_corregir(usuario, sesion):
                raise serializers.ValidationError(
                    "La lista ya fue confirmada. Después del día de clase solo dirección puede corregirla.")
            if not motivo:
                raise serializers.ValidationError(
                    {"motivo": "La lista ya fue confirmada: indicá el motivo de la corrección."})
            contexto.fijar_motivo(motivo)
            origen = RegistroAsistencia.Origen.CORRECCION
        else:
            origen = RegistroAsistencia.Origen.SIN_CONEXION if sin_conexion else RegistroAsistencia.Origen.WEB
        if confirmar and sesion.estado == E.BORRADOR:
            sesion.estado = E.CONFIRMADA
            sesion.confirmada_en = timezone.now()
            sesion.confirmada_por = usuario
        sesion.registrado_por = usuario
        sesion.save()
        if registros is not None:
            self._guardar_registros(sesion, registros, origen)
        return sesion

    @staticmethod
    def _valores(r):
        """Lo que se guardaría para una marca (la "J" del docente es una ausencia)."""
        T = RegistroAsistencia.Estado
        estado = r.get("estado", "P")
        estado = T.AUSENTE if estado == AVISO else estado
        return {
            "estado": estado,
            # La hora de llegada solo tiene sentido en una tardanza; la de salida, en un retiro.
            "hora_llegada": r.get("hora_llegada") if estado == T.TARDANZA else None,
            "hora_salida": r.get("hora_salida") if estado == T.RETIRO else None,
            "observacion": r.get("observacion", ""),
        }

    def _hay_cambios(self, sesion, registros):
        actuales = {r.matricula_id: r for r in sesion.registros.all()}
        for r in registros:
            previo = actuales.get(r["matricula"].id)
            if previo is None or any(getattr(previo, k) != v for k, v in self._valores(r).items()):
                return True
        return False

    def _guardar_registros(self, sesion, registros, origen):
        usuario = self.context["request"].user
        actuales = {r.matricula_id: r for r in sesion.registros.all()}
        for r in registros:
            valores = self._valores(r)
            previo = actuales.get(r["matricula"].id)
            if previo is not None and all(getattr(previo, k) == v for k, v in valores.items()):
                registro = previo  # sin cambios: se conserva su origen
            else:
                registro, _ = RegistroAsistencia.todos.update_or_create(
                    sesion=sesion, matricula=r["matricula"], defaults={**valores, "origen": origen})
            if r.get("estado") == AVISO:
                nota = valores["observacion"].strip() or "Aviso de ausencia recibido en clase."
                tramite.aviso_del_docente(registro, nota, usuario)
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
    vigente = ~Q(asistencias__sesion__estado=SesionClase.Estado.ANULADA)  # Count por relación no usa el administrador
    qs = matriculas_qs.select_related("alumno").annotate(
        total=Count("asistencias", filter=vigente),
        presentes=Count("asistencias", filter=vigente & Q(asistencias__estado__in=RegistroAsistencia.PRESENTES)),
        ausentes=Count("asistencias", filter=vigente & Q(asistencias__estado="A", asistencias__justificada=False)),
        justificadas=Count("asistencias", filter=vigente & Q(asistencias__estado="A", asistencias__justificada=True)),
        tardanzas=Count("asistencias", filter=vigente & Q(asistencias__estado="T")),
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
