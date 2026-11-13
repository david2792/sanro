# Varias instituciones (docs/decisiones/0003-varias-instituciones.md). Mismo esquema de tres pasos
# que academico.0007. Usuario queda opcional: vacío = superusuario global.

import django.db.models.deletion
from django.db import migrations, models

import nucleo.instituciones
from nucleo.migraciones import asignar_institucion

OBLIGATORIOS = {"alumno": "alumnos", "docente": "docentes", "tutor": "tutores"}


def fk(related_name, null=False, default=True):
    extra = {"default": nucleo.instituciones.institucion_por_defecto} if default else {}
    return models.ForeignKey(editable=False, null=null, blank=null, on_delete=django.db.models.deletion.PROTECT,
                             related_name=related_name, to="academico.institucion", **extra)


class Migration(migrations.Migration):

    dependencies = [
        ("academico", "0007_por_institucion"),
        ("personas", "0002_alter_usuario_rol"),
    ]

    operations = (
        [migrations.AddField(model_name=m, name="institucion", field=fk(r, null=True, default=False))
         for m, r in OBLIGATORIOS.items()]
        + [migrations.AddField(model_name="usuario", name="institucion", field=fk("usuarios", null=True, default=False))]
        + [migrations.RunPython(
            asignar_institucion("personas.Alumno", "personas.Docente", "personas.Tutor", "personas.Usuario"),
            migrations.RunPython.noop)]
        + [migrations.AlterField(model_name=m, name="institucion", field=fk(r, default=False))
           for m, r in OBLIGATORIOS.items()]
        + [migrations.AlterField(model_name=m, name="institucion", field=fk(r)) for m, r in OBLIGATORIOS.items()]
        + [migrations.AlterField(model_name="usuario", name="institucion", field=fk("usuarios", null=True))]
        + [migrations.AlterField(model_name=m, name="ci", field=models.CharField(max_length=20, verbose_name="C.I."))
           for m in OBLIGATORIOS]
        + [migrations.AddConstraint(model_name=m, constraint=models.UniqueConstraint(
            fields=("institucion", "ci"), name=f"{m}_ci_unica_por_institucion")) for m in OBLIGATORIOS]
    )
