from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Max
from rest_framework import serializers

from .models import FuenteNormativa, ReglaNormativa, VersionRegla


class FuenteNormativaSerializer(serializers.ModelSerializer):
    tipo_nombre = serializers.CharField(source="get_tipo_display", read_only=True)
    verificacion_nombre = serializers.CharField(source="get_verificacion_display", read_only=True)
    general = serializers.SerializerMethodField()

    class Meta:
        model = FuenteNormativa
        fields = "__all__"
        read_only_fields = ["institucion", "verificada_por", "verificada_en"]

    def get_general(self, obj):
        return obj.institucion_id is None


class ReglaNormativaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReglaNormativa
        fields = "__all__"


class VersionReglaSerializer(serializers.ModelSerializer):
    regla_codigo = serializers.CharField(source="regla.codigo", read_only=True)
    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)
    fuente_descripcion = serializers.CharField(source="fuente.__str__", read_only=True, default=None)

    # Una versión aprobada solo puede cerrarse (sustituirse o derogarse) y anotarse.
    EDITABLES_SI_APROBADA = {"estado", "vigente_hasta", "observaciones"}

    class Meta:
        model = VersionRegla
        fields = "__all__"
        read_only_fields = ["version", "institucion", "aprobada_por", "aprobada_en"]

    def validate(self, data):
        actual = self.instance
        E = VersionRegla.Estado
        nuevo_estado = data.get("estado")
        if nuevo_estado == E.APROBADA and (actual is None or actual.estado != E.APROBADA):
            raise serializers.ValidationError({"estado": "Para aprobar una versión usá la acción «aprobar»."})
        if actual is not None and actual.estado == E.APROBADA:
            cambiados = {k for k, v in data.items() if getattr(actual, k) != v}
            if cambiados - self.EDITABLES_SI_APROBADA:
                raise serializers.ValidationError(
                    "Una versión aprobada no se modifica: creá una versión nueva y marcá esta como sustituida.")
            if nuevo_estado not in (None, E.APROBADA, E.SUSTITUIDA, E.DEROGADA):
                raise serializers.ValidationError({"estado": "Una versión aprobada solo puede sustituirse o derogarse."})
        if actual is not None and actual.estado in (E.SUSTITUIDA, E.DEROGADA):
            raise serializers.ValidationError("Una versión sustituida o derogada ya no se modifica.")

        # Validaciones del modelo (tipo de valor, vigencia) sobre los datos combinados.
        prueba = VersionRegla(**{**({f.attname: getattr(actual, f.attname) for f in VersionRegla._meta.concrete_fields}
                                    if actual else {}), **data})
        try:
            prueba.clean()
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict if hasattr(e, "error_dict") else e.messages)
        return data

    def create(self, data):
        ultima = VersionRegla.objects.filter(regla=data["regla"]).aggregate(n=Max("version"))["n"] or 0
        return super().create({**data, "version": ultima + 1})
