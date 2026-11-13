"""Ayudas para migraciones de datos (usan los modelos históricos, nunca los reales)."""


def asignar_institucion(*modelos):
    """
    Devuelve una función para RunPython que asigna la primera institución a las filas sin institución
    de los modelos indicados ("app.Modelo"). Si hay datos pero ninguna institución, crea una.
    En una base vacía no crea nada.
    """

    def rellenar(apps, schema_editor):
        Institucion = apps.get_model("academico", "Institucion")
        clases = [apps.get_model(*m.split(".")) for m in modelos]
        if not any(c.objects.filter(institucion__isnull=True).exists() for c in clases):
            return
        inst = Institucion.objects.order_by("pk").first() or Institucion.objects.create(nombre="Institución")
        for c in clases:
            c.objects.filter(institucion__isnull=True).update(institucion=inst)

    return rellenar
