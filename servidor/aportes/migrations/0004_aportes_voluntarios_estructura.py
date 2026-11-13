# Fase 2 (1/3): estructura nueva de aportes voluntarios, sin quitar nada todavía (docs/decisiones/0011).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("academico", "0009_estados_del_anio"),
        ("personas", "0003_por_institucion"),
        ("aportes", "0003_sin_borrados_en_cascada"),
    ]

    operations = [
        migrations.CreateModel(
            name="AsociacionACE",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("denominacion", models.CharField(max_length=200, verbose_name="Denominación")),
                ("ruc", models.CharField(blank=True, max_length=20, verbose_name="RUC")),
                ("reconocimiento", models.CharField(blank=True, max_length=120, verbose_name="Resolución de reconocimiento")),
                ("domicilio", models.CharField(blank=True, max_length=200)),
                ("telefono", models.CharField(blank=True, max_length=30, verbose_name="Teléfono")),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("estado", models.CharField(choices=[("ACTIVA", "Activa"), ("INACTIVA", "Inactiva")], default="ACTIVA", max_length=8)),
                ("institucion", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="asociaciones_ace", to="academico.institucion")),
            ],
            options={
                "verbose_name": "asociación de cooperación escolar",
                "verbose_name_plural": "asociaciones de cooperación escolar",
                "ordering": ["institucion", "denominacion"],
            },
        ),
        # Conceptos
        migrations.AddField("conceptoaporte", "tipo", models.CharField(default="APORTE_SOCIAL", max_length=16)),
        migrations.AddField("conceptoaporte", "descripcion", models.TextField(blank=True, default="", verbose_name="Descripción")),
        migrations.AddField("conceptoaporte", "ace", models.ForeignKey(
            null=True, on_delete=django.db.models.deletion.PROTECT, related_name="conceptos", to="aportes.asociacionace")),
        migrations.RenameField("conceptoaporte", "monto", "monto_sugerido"),
        migrations.AlterField("conceptoaporte", "monto_sugerido", models.PositiveIntegerField(blank=True, null=True)),
        # Recibos (todavía "Pago")
        migrations.AddField("pago", "ace", models.ForeignKey(
            null=True, on_delete=django.db.models.deletion.PROTECT, related_name="recibos", to="aportes.asociacionace")),
        migrations.AddField("pago", "serie", models.CharField(default="A", max_length=5)),
        migrations.AddField("pago", "ejercicio", models.PositiveSmallIntegerField(editable=False, null=True)),
        migrations.AddField("pago", "aportante_nombre", models.CharField(default="", max_length=150)),
        migrations.AddField("pago", "aportante_documento", models.CharField(blank=True, default="", max_length=20)),
        migrations.AddField("pago", "tutor", models.ForeignKey(
            blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="personas.tutor")),
        migrations.AddField("pago", "destino_restringido", models.CharField(blank=True, default="", max_length=200)),
        migrations.AddField("pago", "estado", models.CharField(default="EMITIDO", max_length=9)),
        migrations.AddField("pago", "codigo_verificacion", models.CharField(blank=True, default="", editable=False, max_length=12)),
        migrations.AlterField("pago", "matricula", models.ForeignKey(
            blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="pagos", to="academico.matricula")),
        migrations.AddField("detallepago", "descripcion", models.CharField(blank=True, default="", max_length=250)),
    ]
