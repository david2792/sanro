from collections import defaultdict
from datetime import date

from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from academico.models import AnioLectivo, Matricula
from nucleo.instituciones import institucion_de
from .models import ConceptoAporte, DetallePago, Exoneracion, Pago


class ConceptoAporteSerializer(serializers.ModelSerializer):
    anio_lectivo = serializers.PrimaryKeyRelatedField(queryset=AnioLectivo.objects.all(), required=False)
    anio = serializers.IntegerField(source="anio_lectivo.anio", read_only=True)
    periodicidad_nombre = serializers.CharField(source="get_periodicidad_display", read_only=True)
    cursos_nombres = serializers.SerializerMethodField()

    class Meta:
        model = ConceptoAporte
        fields = "__all__"
        validators = []  # la unicidad año/nombre se valida abajo (el año puede venir vacío)

    def get_cursos_nombres(self, obj):
        return [str(c) for c in obj.cursos.all()]

    def validate(self, data):
        anio = data.get("anio_lectivo") or getattr(self.instance, "anio_lectivo", None) or AnioLectivo.actual(
            institucion_de(self.context.get("request")))
        if anio is None:
            raise serializers.ValidationError("No hay un año lectivo activo.")
        data["anio_lectivo"] = anio
        nombre = data.get("nombre", getattr(self.instance, "nombre", None))
        repetido = ConceptoAporte.objects.filter(anio_lectivo=anio, nombre__iexact=nombre)
        if self.instance:
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            raise serializers.ValidationError(f"Ya existe el concepto «{nombre}» en {anio}.")
        valores = {f: data.get(f, getattr(self.instance, f, None)) for f in
                   ("monto", "periodicidad", "mes_inicio", "mes_fin", "dia_vencimiento")}
        prueba = ConceptoAporte(**{k: v for k, v in valores.items() if v is not None})
        try:
            prueba.clean()
        except Exception as e:
            raise serializers.ValidationError(getattr(e, "messages", [str(e)]))

        if self.instance and self.instance.detalles.filter(pago__anulado=False).exists():
            if valores["periodicidad"] != self.instance.periodicidad:
                raise serializers.ValidationError(
                    "Este concepto ya tiene pagos: no se puede cambiar entre cuota mensual y monto total.")
            pagado = defaultdict(int)
            for mat, mes, monto in self.instance.detalles.filter(pago__anulado=False).values_list(
                    "pago__matricula_id", "mes", "monto"):
                pagado[(mat, mes)] += monto
            if max(pagado.values()) > valores["monto"]:
                raise serializers.ValidationError(
                    f"Ya hay cuotas pagadas por Gs. {max(pagado.values()):,}; el monto no puede ser menor.".replace(",", "."))
        return data


class ExoneracionSerializer(serializers.ModelSerializer):
    alumno = serializers.CharField(source="matricula.alumno.__str__", read_only=True)
    seccion = serializers.CharField(source="matricula.seccion.__str__", read_only=True)
    concepto_nombre = serializers.CharField(source="concepto.nombre", read_only=True)

    class Meta:
        model = Exoneracion
        fields = "__all__"
        read_only_fields = ["registrado_por"]

    def validate(self, data):
        m = data.get("matricula") or self.instance.matricula
        c = data.get("concepto") or self.instance.concepto
        if m.anio_lectivo_id != c.anio_lectivo_id:
            raise serializers.ValidationError("El concepto no corresponde al año de la matrícula.")
        return data


class DetallePagoSerializer(serializers.ModelSerializer):
    concepto_nombre = serializers.CharField(source="concepto.nombre", read_only=True)

    class Meta:
        model = DetallePago
        fields = ["id", "concepto", "concepto_nombre", "mes", "monto"]


class PagoSerializer(serializers.ModelSerializer):
    """
    Registra un recibo con una o varias cuotas:
    {matricula, fecha, medio, referencia, pagado_por, observacion,
     detalles: [{concepto, mes, monto}, ...]}
    """

    detalles = DetallePagoSerializer(many=True)
    total = serializers.SerializerMethodField()
    alumno = serializers.CharField(source="matricula.alumno.__str__", read_only=True)
    alumno_ci = serializers.CharField(source="matricula.alumno.ci", read_only=True)
    seccion = serializers.CharField(source="matricula.seccion.__str__", read_only=True)
    medio_nombre = serializers.CharField(source="get_medio_display", read_only=True)
    registrado_por_nombre = serializers.CharField(source="registrado_por.__str__", read_only=True, default=None)
    anulado_por_nombre = serializers.CharField(source="anulado_por.__str__", read_only=True, default=None)

    class Meta:
        model = Pago
        fields = "__all__"
        read_only_fields = ["anulado", "motivo_anulacion", "anulado_por", "anulado_en", "registrado_por"]

    def get_total(self, obj):
        return obj.total

    def validate(self, data):
        if data["fecha"] > date.today():
            raise serializers.ValidationError("La fecha del pago no puede ser futura.")
        if not data["detalles"]:
            raise serializers.ValidationError("Agregá al menos una cuota al recibo.")
        if data["matricula"].estado != Matricula.Estado.ACTIVA:
            raise serializers.ValidationError("La matrícula del alumno no está activa.")
        return data

    def _verificar_detalles(self, m, detalles):
        """Se llama con la matrícula bloqueada, así dos cobros simultáneos no pagan dos veces la misma cuota."""
        ya = defaultdict(int)
        for con, mes, monto in DetallePago.objects.filter(pago__matricula=m, pago__anulado=False).values_list(
                "concepto_id", "mes", "monto"):
            ya[(con, mes)] += monto
        exonerados = set(m.exoneraciones.values_list("concepto_id", flat=True))
        vistos = set()
        errores = []
        for d in detalles:
            c, mes, monto = d["concepto"], d.get("mes"), d["monto"]
            nombre = f"{c.nombre}{f' (mes {mes})' if mes else ''}"
            if c.anio_lectivo_id != m.anio_lectivo_id:
                errores.append(f"{c.nombre} no corresponde al año lectivo del alumno.")
                continue
            cursos = set(c.cursos.values_list("id", flat=True))
            if cursos and m.seccion.curso_id not in cursos:
                errores.append(f"{c.nombre} no corresponde al curso del alumno.")
            if c.periodicidad == ConceptoAporte.Periodicidad.MENSUAL:
                if mes is None or not (c.mes_inicio <= mes <= c.mes_fin):
                    errores.append(f"{c.nombre}: el mes debe estar entre {c.mes_inicio} y {c.mes_fin}.")
            elif mes is not None:
                errores.append(f"{c.nombre} es un monto total: no lleva mes.")
            if c.id in exonerados:
                errores.append(f"El alumno está exonerado de {c.nombre}.")
            if (c.id, mes) in vistos:
                errores.append(f"{nombre} aparece dos veces en el recibo.")
            vistos.add((c.id, mes))
            if monto <= 0:
                errores.append(f"{nombre}: el monto debe ser mayor a cero.")
            saldo = c.monto - ya[(c.id, mes)]
            if monto > saldo:
                errores.append(f"{nombre}: el saldo es Gs. {saldo:,} y se quiere cobrar Gs. {monto:,}.".replace(",", "."))
        if errores:
            raise serializers.ValidationError(errores)

    @transaction.atomic
    def create(self, data):
        detalles = data.pop("detalles")
        m = Matricula.objects.select_for_update().select_related("seccion").get(pk=data["matricula"].pk)
        self._verificar_detalles(m, detalles)
        # Numeración correlativa por año: se bloquea el año mientras se asigna el número.
        anio = AnioLectivo.objects.select_for_update().get(pk=m.anio_lectivo_id)
        ultimo = Pago.objects.filter(anio_lectivo=anio).aggregate(n=Max("numero"))["n"] or 0
        pago = Pago.objects.create(anio_lectivo=anio, numero=ultimo + 1, **data)
        for d in detalles:
            DetallePago.objects.create(pago=pago, **d)
        return pago
