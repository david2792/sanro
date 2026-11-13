# Fase 2 (3/3): se quita lo que modelaba deuda (vencimientos, cuotas mensuales, exoneraciones) y
# Pago/DetallePago pasan a llamarse Recibo/LineaRecibo (mismas filas, mismos números).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("aportes", "0005_aportes_voluntarios_datos"),
    ]

    operations = [
        migrations.DeleteModel("Exoneracion"),
        migrations.RemoveField("conceptoaporte", "periodicidad"),
        migrations.RemoveField("conceptoaporte", "mes_inicio"),
        migrations.RemoveField("conceptoaporte", "mes_fin"),
        migrations.RemoveField("conceptoaporte", "dia_vencimiento"),
        migrations.RemoveField("conceptoaporte", "fecha_vencimiento"),
        migrations.RemoveField("conceptoaporte", "cursos"),
        migrations.AlterField("conceptoaporte", "ace", models.ForeignKey(
            on_delete=django.db.models.deletion.PROTECT, related_name="conceptos", to="aportes.asociacionace")),
        migrations.AlterUniqueTogether("pago", set()),
        migrations.RemoveField("pago", "anulado"),
        migrations.RemoveField("pago", "pagado_por"),
        migrations.RemoveField("detallepago", "mes"),
        migrations.AlterField("pago", "ace", models.ForeignKey(
            on_delete=django.db.models.deletion.PROTECT, related_name="recibos", to="aportes.asociacionace")),
        migrations.AlterField("pago", "ejercicio", models.PositiveSmallIntegerField(editable=False)),
        migrations.RenameModel("Pago", "Recibo"),
        migrations.RenameModel("DetallePago", "LineaRecibo"),
        migrations.RenameField("linearecibo", "pago", "recibo"),
        migrations.AlterUniqueTogether("recibo", {("ace", "serie", "ejercicio", "numero")}),
    ]
