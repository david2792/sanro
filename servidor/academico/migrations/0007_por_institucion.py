# Varias instituciones (docs/decisiones/0003-varias-instituciones.md).
# En tres pasos para no crear una institución vacía en bases nuevas:
# columna opcional -> asignar la institución a los datos existentes -> columna obligatoria con valor por defecto.

import django.db.models.deletion
from django.db import migrations, models

import nucleo.instituciones
from nucleo.migraciones import asignar_institucion

MODELOS = {"aniolectivo": "anios_lectivos", "materia": "materias", "nivel": "niveles"}


def fk(related_name, null=False, default=True):
    extra = {"default": nucleo.instituciones.institucion_por_defecto} if default else {}
    return models.ForeignKey(editable=False, null=null, on_delete=django.db.models.deletion.PROTECT,
                             related_name=related_name, to="academico.institucion", **extra)


class Migration(migrations.Migration):

    dependencies = [
        ("academico", "0006_limite_evaluaciones"),
    ]

    operations = (
        [migrations.AddField(model_name=m, name="institucion", field=fk(r, null=True, default=False))
         for m, r in MODELOS.items()]
        + [migrations.RunPython(asignar_institucion("academico.AnioLectivo", "academico.Materia", "academico.Nivel"),
                                migrations.RunPython.noop)]
        + [migrations.AlterField(model_name=m, name="institucion", field=fk(r, default=False))
           for m, r in MODELOS.items()]
        + [migrations.AlterField(model_name=m, name="institucion", field=fk(r)) for m, r in MODELOS.items()]
        + [
            migrations.AlterField(model_name="aniolectivo", name="anio",
                                  field=models.PositiveSmallIntegerField(verbose_name="Año")),
            migrations.AlterField(model_name="materia", name="nombre", field=models.CharField(max_length=100)),
            migrations.AlterField(model_name="nivel", name="nombre", field=models.CharField(max_length=100)),
            migrations.AddConstraint(model_name="aniolectivo", constraint=models.UniqueConstraint(
                fields=("institucion", "anio"), name="anio_lectivo_unico_por_institucion")),
            migrations.AddConstraint(model_name="materia", constraint=models.UniqueConstraint(
                fields=("institucion", "nombre"), name="materia_unica_por_institucion")),
            migrations.AddConstraint(model_name="nivel", constraint=models.UniqueConstraint(
                fields=("institucion", "nombre"), name="nivel_unico_por_institucion")),
        ]
    )
