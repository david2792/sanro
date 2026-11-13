# Las listas guardadas antes de la Fase 1.2 ya estaban "confirmadas": se completa quién y cuándo.

from django.db import migrations
from django.db.models import F


def completar(apps, schema_editor):
    Sesion = apps.get_model("asistencia", "SesionClase")
    # En las migraciones el modelo histórico usa un administrador simple: ve también las anuladas.
    Sesion.objects.filter(confirmada_en__isnull=True).update(
        confirmada_en=F("creado"), confirmada_por=F("registrado_por"), creado_por=F("registrado_por"),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("asistencia", "0007_sesiones_con_estado"),
    ]

    operations = [migrations.RunPython(completar, migrations.RunPython.noop)]
