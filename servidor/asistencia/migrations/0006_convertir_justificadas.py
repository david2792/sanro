# Conversión de datos de la Fase 1 en una migración aparte: PostgreSQL no permite crear índices
# en la misma transacción en que se modifican filas de esas tablas.

from django.db import migrations


MOTIVO_SISTEMA_ANTERIOR = "Aprobado automáticamente por el sistema anterior a la Fase 1."


def convertir(apps, schema_editor):
    """
    Antes, un justificativo cambiaba la ausencia a "J" y el docente podía marcar "J" en la lista.
    Ahora la ausencia queda "A" y la justificación es un trámite: lo anterior pasa como APROBADO
    (así lo trataba el sistema) y vinculado a sus ausencias. Ningún dato se pierde.
    """
    Registro = apps.get_model("asistencia", "RegistroAsistencia")
    Justificacion = apps.get_model("asistencia", "Justificacion")
    Vinculo = apps.get_model("asistencia", "AusenciaJustificada")

    for j in Justificacion.objects.all():
        j.estado = "APROBADO"
        j.origen = "GESTION"
        j.fecha_presentacion = j.creado.date()
        j.decidido_en = j.creado
        j.revisado_por_id = j.registrado_por_id
        j.motivo_decision = MOTIVO_SISTEMA_ANTERIOR
        j.save()
        for r in Registro.objects.filter(matricula_id=j.matricula_id, estado__in=["A", "J"],
                                         sesion__fecha__range=(j.fecha_desde, j.fecha_hasta)):
            Vinculo.objects.get_or_create(justificacion=j, registro=r, defaults={"aprobada": True})
            r.estado, r.justificada = "A", True
            r.save()

    for r in Registro.objects.filter(estado="J").select_related("sesion"):
        fecha = r.sesion.fecha
        j = Justificacion.objects.create(
            matricula_id=r.matricula_id, fecha_desde=fecha, fecha_hasta=fecha, fecha_presentacion=fecha,
            motivo=(r.observacion or "Marcada como justificada en la lista.")[:200], origen="DOCENTE",
            estado="APROBADO", decidido_en=r.sesion.creado, motivo_decision=MOTIVO_SISTEMA_ANTERIOR,
            registrado_por_id=r.sesion.registrado_por_id,
        )
        Vinculo.objects.create(justificacion=j, registro=r, aprobada=True)
        r.estado, r.justificada = "A", True
        r.save()



class Migration(migrations.Migration):

    dependencies = [
        ("asistencia", "0005_justificativos_como_tramite"),
    ]

    operations = [migrations.RunPython(convertir, migrations.RunPython.noop)]
