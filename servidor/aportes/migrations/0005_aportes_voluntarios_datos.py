# Fase 2 (2/3): convierte los datos existentes. Ningún recibo se pierde ni cambia de número.

from django.db import migrations


def convertir(apps, schema_editor):
    from aportes.verificacion import codigo_verificacion

    ACE = apps.get_model("aportes", "AsociacionACE")
    Concepto = apps.get_model("aportes", "ConceptoAporte")
    Pago = apps.get_model("aportes", "Pago")
    Detalle = apps.get_model("aportes", "DetallePago")
    Institucion = apps.get_model("academico", "Institucion")

    aces = {}

    def ace_de(anio):
        iid = anio.institucion_id
        if iid not in aces:
            aces[iid] = ACE.objects.filter(institucion_id=iid).order_by("id").first() or ACE.objects.create(
                institucion_id=iid, denominacion=f"ACE de {Institucion.objects.get(pk=iid).nombre}")
        return aces[iid]

    for c in Concepto.objects.select_related("anio_lectivo"):
        c.ace = ace_de(c.anio_lectivo)
        if c.periodicidad == "MENSUAL":
            c.descripcion = (f"Antes era una cuota mensual sugerida de Gs. {c.monto_sugerido} "
                             f"(meses {c.mes_inicio} a {c.mes_fin}).")
        c.save()

    for p in Pago.objects.select_related("anio_lectivo", "matricula__alumno"):
        p.ace = ace_de(p.anio_lectivo)
        p.ejercicio = p.anio_lectivo.anio
        alumno = p.matricula.alumno if p.matricula_id else None
        p.aportante_nombre = (p.pagado_por or (f"Familia de {alumno.apellidos}, {alumno.nombres}" if alumno else "Sin nombre"))[:150]
        p.estado = "ANULADO" if p.anulado else "EMITIDO"
        total = sum(Detalle.objects.filter(pago=p).values_list("monto", flat=True))
        p.codigo_verificacion = codigo_verificacion(p.ace_id, p.serie, p.ejercicio, p.numero, total)
        p.save()

    for d in Detalle.objects.exclude(mes=None):
        d.descripcion = f"Mes {d.mes} (registrado con el sistema anterior)"
        d.save()


class Migration(migrations.Migration):

    dependencies = [
        ("aportes", "0004_aportes_voluntarios_estructura"),
    ]

    operations = [migrations.RunPython(convertir, migrations.RunPython.noop)]
