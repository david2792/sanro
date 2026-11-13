from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import serializers

from academico.models import AnioLectivo
from nucleo.instituciones import institucion_de
from .models import AsociacionACE, ConceptoAporte, LineaRecibo, Recibo
from .verificacion import codigo_verificacion


class AsociacionACESerializer(serializers.ModelSerializer):
    class Meta:
        model = AsociacionACE
        exclude = ["institucion"]


class ConceptoAporteSerializer(serializers.ModelSerializer):
    tipo_nombre = serializers.CharField(source="get_tipo_display", read_only=True)

    class Meta:
        model = ConceptoAporte
        fields = "__all__"
        read_only_fields = ["ace"]
        extra_kwargs = {"anio_lectivo": {"required": False}}  # vacío = año activo
        validators = []  # la unicidad año/nombre se valida abajo (el año puede venir vacío)

    def validate(self, data):
        request = self.context.get("request")
        anio = data.get("anio_lectivo") or getattr(self.instance, "anio_lectivo", None) or AnioLectivo.actual(
            institucion_de(request))
        if anio is None:
            raise serializers.ValidationError("No hay un año lectivo activo.")
        data["anio_lectivo"] = anio
        monto = data.get("monto_sugerido")
        if monto is not None and monto <= 0:
            raise serializers.ValidationError({"monto_sugerido": "Si se indica, debe ser mayor a cero."})
        nombre = data.get("nombre", getattr(self.instance, "nombre", None))
        repetido = ConceptoAporte.objects.filter(anio_lectivo=anio, nombre__iexact=nombre)
        if self.instance:
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            raise serializers.ValidationError({"nombre": "Ya existe un concepto con ese nombre en el año."})
        return data


class LineaReciboSerializer(serializers.ModelSerializer):
    concepto_nombre = serializers.CharField(source="concepto.nombre", read_only=True)
    concepto_tipo = serializers.CharField(source="concepto.tipo", read_only=True)

    class Meta:
        model = LineaRecibo
        fields = ["id", "concepto", "concepto_nombre", "concepto_tipo", "monto", "descripcion"]


class ReciboSerializer(serializers.ModelSerializer):
    """
    POST {fecha, aportante_nombre, aportante_documento?, tutor?, matricula?, medio, referencia?,
          destino_restringido?, observacion?, serie?, lineas: [{concepto, monto, descripcion?}]}
    El número, el ejercicio y el código de verificación los pone el sistema.
    """

    lineas = LineaReciboSerializer(many=True)
    total = serializers.IntegerField(read_only=True)
    importe_letras = serializers.CharField(read_only=True)
    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)
    medio_nombre = serializers.CharField(source="get_medio_display", read_only=True)
    ace_nombre = serializers.CharField(source="ace.denominacion", read_only=True)
    ace_ruc = serializers.CharField(source="ace.ruc", read_only=True)
    alumno = serializers.CharField(source="matricula.alumno.__str__", read_only=True, default=None)
    registrado_por_nombre = serializers.CharField(source="registrado_por.__str__", read_only=True, default=None)
    anulado_por_nombre = serializers.CharField(source="anulado_por.__str__", read_only=True, default=None)
    leyenda = serializers.SerializerMethodField()

    class Meta:
        model = Recibo
        fields = "__all__"
        read_only_fields = ["ace", "estado", "motivo_anulacion", "anulado_por", "anulado_en", "registrado_por"]

    def get_leyenda(self, obj):
        return "Recibo interno de aporte voluntario a la ACE. No válido como factura."

    def validate(self, data):
        request = self.context["request"]
        ace = AsociacionACE.de_institucion(institucion_de(request).pk)
        if ace is None:
            raise serializers.ValidationError("Primero cargá los datos de la ACE (Aportes › Configuración).")
        anio = AnioLectivo.actual(institucion_de(request))
        if anio is None:
            raise serializers.ValidationError("No hay un año lectivo activo.")
        if not data.get("aportante_nombre", "").strip():
            raise serializers.ValidationError({"aportante_nombre": "Indicá quién realiza el aporte."})
        lineas = data.get("lineas") or []
        if not lineas:
            raise serializers.ValidationError({"lineas": "Agregá al menos un concepto."})
        for linea in lineas:
            concepto = linea["concepto"]
            if concepto.ace_id != ace.id or concepto.anio_lectivo_id != anio.id or not concepto.activo:
                raise serializers.ValidationError({"lineas": f"El concepto «{concepto.nombre}» no está disponible."})
            especie = concepto.tipo == ConceptoAporte.Tipo.DONACION_ESPECIE
            if especie and not linea.get("descripcion", "").strip():
                raise serializers.ValidationError({"lineas": "En una donación en especie describí qué se donó."})
            if not especie and linea["monto"] <= 0:
                raise serializers.ValidationError({"lineas": "Cada monto debe ser mayor a cero."})
        matricula = data.get("matricula")
        if matricula is not None and matricula.anio_lectivo.institucion_id != ace.institucion_id:
            raise serializers.ValidationError({"matricula": "Alumno no válido."})
        data["ace"], data["anio_lectivo"] = ace, anio
        return data

    @transaction.atomic
    def create(self, data):
        lineas = data.pop("lineas")
        ace, ejercicio, serie = data["ace"], data["anio_lectivo"].anio, data.get("serie", "A")
        # Correlativo por ACE, serie y ejercicio; el bloqueo evita números repetidos con cargas simultáneas.
        list(Recibo.objects.select_for_update().filter(ace=ace, serie=serie, ejercicio=ejercicio).values_list("id"))
        ultimo = Recibo.objects.filter(ace=ace, serie=serie, ejercicio=ejercicio).aggregate(n=Max("numero"))["n"] or 0
        total = sum(linea["monto"] for linea in lineas)
        recibo = Recibo.objects.create(
            **data, ejercicio=ejercicio, numero=ultimo + 1, registrado_por=self.context["request"].user,
            codigo_verificacion=codigo_verificacion(ace.id, serie, ejercicio, ultimo + 1, total))
        for linea in lineas:
            LineaRecibo.objects.create(recibo=recibo, **linea)
        return recibo

    def update(self, instance, data):
        raise serializers.ValidationError("Un recibo emitido no se modifica: se anula y se emite otro.")


def cerrar_recibo(recibo, usuario, estado, motivo):
    """Anula o revierte un recibo. El número queda usado; el recibo sigue en los reportes como anulado/revertido."""
    if recibo.estado != Recibo.Estado.EMITIDO:
        raise serializers.ValidationError(f"El recibo ya está {recibo.get_estado_display().lower()}.")
    if not (motivo or "").strip():
        raise serializers.ValidationError({"motivo": "Indicá el motivo."})
    recibo.estado = estado
    recibo.motivo_anulacion = motivo.strip()[:200]
    recibo.anulado_por = usuario
    recibo.anulado_en = timezone.now()
    recibo.save()
    return recibo
