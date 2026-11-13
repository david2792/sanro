from datetime import time

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from .models import (AnioLectivo, Asignacion, CambioSeccion, Curso, DiaNoLectivo, Especialidad, Etapa,
                     Institucion, Materia, Matricula, Nivel, PlanMateria, Seccion)


class InstitucionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Institucion
        fields = "__all__"


class AnioLectivoSerializer(serializers.ModelSerializer):
    """
    El estado se cambia con el mismo formulario, siguiendo AnioLectivo.TRANSICIONES.
    Reabrir un año cerrado (volver a cierre pendiente) lo hace solo la dirección y exige motivo.
    """

    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)
    motivo = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=250)

    class Meta:
        model = AnioLectivo
        fields = "__all__"

    def validate(self, data):
        from nucleo import contexto

        E = AnioLectivo.Estado
        actual = self.instance
        motivo = (data.pop("motivo", "") or "").strip()
        anterior = actual.estado if actual else E.PREPARACION
        if actual is None and data.get("activo") and "estado" not in data:
            data["estado"] = E.ACTIVO  # crear un año marcado como de trabajo lo deja activo
        nuevo = data.get("estado", anterior)
        if actual is None and nuevo not in (E.PREPARACION, E.ACTIVO):
            raise serializers.ValidationError({"estado": "Un año nuevo empieza en preparación o activo."})
        if actual is not None and nuevo != anterior:
            if nuevo not in AnioLectivo.TRANSICIONES[anterior]:
                raise serializers.ValidationError(
                    {"estado": f"No se puede pasar de «{actual.get_estado_display()}» a «{E(nuevo).label}»."})
            if anterior == E.CERRADO and nuevo == E.CIERRE_PENDIENTE:
                usuario = self.context["request"].user
                if not (usuario.is_superuser or usuario.rol == usuario.Rol.DIRECTOR):
                    raise serializers.ValidationError("Solo la dirección puede reabrir un año cerrado.")
                if not motivo:
                    raise serializers.ValidationError({"motivo": "Indicá por qué se reabre el año (queda en el historial)."})
        if actual is not None and anterior in AnioLectivo.BLOQUEADOS:
            otros = {k for k, v in data.items() if k != "estado" and getattr(actual, k) != v}
            if otros:
                raise serializers.ValidationError("El año está cerrado: solo se puede reabrir o archivar.")
        if nuevo in AnioLectivo.BLOQUEADOS or nuevo == E.PREPARACION:
            data["activo"] = False
        elif nuevo == E.ACTIVO and actual is not None and anterior != E.ACTIVO:
            data.setdefault("activo", True)
        if data.get("activo") and nuevo not in (E.ACTIVO, E.CIERRE_PENDIENTE):
            raise serializers.ValidationError({"activo": "Solo un año activo o en cierre pendiente puede ser el año de trabajo."})
        if motivo:
            contexto.fijar_motivo(motivo)
        return data


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

    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)

    def validate(self, data):
        E = Matricula.Estado
        actual = self.instance
        if actual is not None:
            if "seccion" in data and data["seccion"] != actual.seccion:
                raise serializers.ValidationError(
                    {"seccion": "Para cambiar de sección usá «Cambiar de sección» (queda en el historial)."})
            if "alumno" in data and data["alumno"] != actual.alumno:
                raise serializers.ValidationError({"alumno": "Una matrícula no se pasa a otro alumno."})
            nuevo = data.get("estado", actual.estado)
            if nuevo != actual.estado and nuevo not in Matricula.TRANSICIONES[actual.estado]:
                raise serializers.ValidationError(
                    {"estado": f"No se puede pasar de «{actual.get_estado_display()}» a «{E(nuevo).label}»."})
        nuevo = data.get("estado", getattr(actual, "estado", E.ACTIVA))
        if nuevo in Matricula.BAJAS:
            if not (data.get("motivo_baja") or getattr(actual, "motivo_baja", "")).strip():
                raise serializers.ValidationError({"motivo_baja": "Indicá el motivo de la baja."})
            if not (data.get("fecha_baja") or getattr(actual, "fecha_baja", None)):
                data["fecha_baja"] = timezone.localdate()
        elif actual is not None and actual.estado in Matricula.BAJAS and nuevo in Matricula.EN_CURSO:
            data["fecha_baja"], data["motivo_baja"] = None, ""  # reincorporación (la baja queda en el historial)
        instancia = Matricula(**{**({f.name: getattr(actual, f.name) for f in Matricula._meta.concrete_fields}
                                    if actual else {}), **data})
        try:
            instancia.clean()
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)
        return data


class CambioSeccionSerializer(serializers.ModelSerializer):
    seccion_anterior_descripcion = serializers.CharField(source="seccion_anterior.__str__", read_only=True)
    seccion_nueva_descripcion = serializers.CharField(source="seccion_nueva.__str__", read_only=True)
    autorizado_por_nombre = serializers.CharField(source="autorizado_por.__str__", read_only=True, default=None)

    class Meta:
        model = CambioSeccion
        fields = "__all__"
        read_only_fields = ["matricula", "seccion_anterior", "autorizado_por"]
