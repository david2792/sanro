from datetime import time

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (AnioLectivo, Asignacion, Curso, DiaNoLectivo, Especialidad, Etapa,
                     Institucion, Materia, Matricula, Nivel, PlanMateria, Seccion)


class InstitucionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Institucion
        fields = "__all__"


class AnioLectivoSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnioLectivo
        fields = "__all__"


class EtapaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Etapa
        fields = "__all__"


class DiaNoLectivoSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiaNoLectivo
        fields = "__all__"


class NivelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Nivel
        fields = "__all__"


class EspecialidadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Especialidad
        fields = "__all__"


class CursoSerializer(serializers.ModelSerializer):
    descripcion = serializers.CharField(source="__str__", read_only=True)

    class Meta:
        model = Curso
        fields = "__all__"


class MateriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Materia
        fields = "__all__"


class PlanMateriaSerializer(serializers.ModelSerializer):
    materia_nombre = serializers.CharField(source="materia.nombre", read_only=True)

    class Meta:
        model = PlanMateria
        fields = "__all__"


class SeccionSerializer(serializers.ModelSerializer):
    descripcion = serializers.CharField(source="__str__", read_only=True)
    inscriptos = serializers.IntegerField(read_only=True)

    class Meta:
        model = Seccion
        fields = "__all__"


DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]


def se_superponen(a, b):
    """Dos bloques {dia, inicio, fin} del mismo día que comparten minutos (las horas van como "HH:MM")."""
    return a["dia"] == b["dia"] and a["inicio"] < b["fin"] and b["inicio"] < a["fin"]


class AsignacionSerializer(serializers.ModelSerializer):
    materia_nombre = serializers.CharField(source="materia.nombre", read_only=True)
    seccion_descripcion = serializers.CharField(source="seccion.__str__", read_only=True)
    docente_nombre = serializers.CharField(source="docente.__str__", read_only=True)

    def validate_dias_clase(self, dias):
        dias = sorted({int(d) for d in dias or []})
        if any(d < 1 or d > 6 for d in dias):
            raise serializers.ValidationError("Los días van de 1 (lunes) a 6 (sábado).")
        return dias

    def validate_horario(self, bloques):
        limpios = []
        for b in bloques or []:
            try:
                dia = int(b["dia"])
                # Acepta "7:00", "07:00" y "07:00:00".
                inicio, fin = (time(*map(int, str(b[k]).split(":")[:2])) for k in ("inicio", "fin"))
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError("Cada bloque necesita día, hora de inicio y hora de fin (HH:MM).")
            if not 1 <= dia <= 6:
                raise serializers.ValidationError("Los días van de 1 (lunes) a 6 (sábado).")
            if inicio >= fin:
                raise serializers.ValidationError(f"El {DIAS[dia]}, la hora de fin debe ser posterior a la de inicio.")
            limpios.append({"dia": dia, "inicio": inicio.strftime("%H:%M"), "fin": fin.strftime("%H:%M")})
        limpios.sort(key=lambda b: (b["dia"], b["inicio"]))
        for a, b in zip(limpios, limpios[1:]):
            if se_superponen(a, b):
                raise serializers.ValidationError(f"Hay dos bloques que se superponen el {DIAS[a['dia']]}.")
        return limpios

    def validate(self, data):
        # Días y horario siempre de acuerdo: cada bloque cuenta como día de clase,
        # y al quitar un día se quitan sus bloques.
        if "horario" in data:
            dias = data.get("dias_clase", getattr(self.instance, "dias_clase", None) or [])
            data["dias_clase"] = sorted(set(dias) | {b["dia"] for b in data["horario"]})
            self._sin_choques(data)
        elif "dias_clase" in data and self.instance:
            data["horario"] = [b for b in self.instance.horario if b["dia"] in data["dias_clase"]]
        return data

    def _sin_choques(self, data):
        """Un docente no puede estar en dos clases a la vez."""
        docente = data.get("docente") or getattr(self.instance, "docente", None)
        seccion = data.get("seccion") or getattr(self.instance, "seccion", None)
        if not (data["horario"] and docente and seccion):
            return
        otras = Asignacion.objects.filter(
            docente=docente, seccion__anio_lectivo_id=seccion.anio_lectivo_id,
        ).exclude(pk=getattr(self.instance, "pk", None)).select_related("materia", "seccion__curso")
        for o in otras:
            for b in data["horario"]:
                for c in o.horario:
                    if se_superponen(b, c):
                        raise serializers.ValidationError(
                            f"El {DIAS[b['dia']]} de {c['inicio']} a {c['fin']} ya tiene {o.materia} "
                            f"en {o.seccion.curso.nombre} {o.seccion.letra}.")

    class Meta:
        model = Asignacion
        fields = "__all__"


class MatriculaSerializer(serializers.ModelSerializer):
    alumno_nombre = serializers.CharField(source="alumno.__str__", read_only=True)
    alumno_ci = serializers.CharField(source="alumno.ci", read_only=True)
    seccion_descripcion = serializers.CharField(source="seccion.__str__", read_only=True)

    class Meta:
        model = Matricula
        fields = "__all__"
        read_only_fields = ["anio_lectivo"]
        validators = []  # la unicidad alumno/año se valida en Matricula.clean()

    def validate(self, data):
        instancia = Matricula(**{**({f.name: getattr(self.instance, f.name) for f in Matricula._meta.concrete_fields}
                                    if self.instance else {}), **data})
        try:
            instancia.clean()
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)
        return data
