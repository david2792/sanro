# Fuentes normativas citadas en docs/PLAN_MAESTRO_SIGE.md (sección 3), cargadas como
# "pendientes de verificar contra copia oficial". No se cargan valores de reglas: los define y
# aprueba la institución con la copia oficial de cada norma.

from django.db import migrations

FUENTES = [
    # (tipo, número, organismo, título, notas)
    ("LEY", "1264/1998", "Congreso Nacional", "Ley General de Educación", "Marco educativo."),
    ("LEY", "5749/2017", "Congreso Nacional", "Carta Orgánica del Ministerio de Educación y Ciencias",
     "Competencias institucionales."),
    ("RESOLUCION", "563/2023", "MEC",
     "Documentos administrativos y técnico-pedagógicos de tenencia obligatoria", "Catálogo de requisitos y documentos."),
    ("RESOLUCION", "1525/2014", "MEC", "Criterios de promoción del Tercer Ciclo de la EEB", "Evaluación y promoción."),
    ("RESOLUCION", "101/2014", "DGEM", "Criterios de promoción del Bachillerato Científico", "Evaluación y promoción."),
    ("RESOLUCION", "03/2009", "MEC", "Criterios de evaluación del Bachillerato Técnico", "Evaluación."),
    ("RESOLUCION", "257/2023", "DGTCEEByEM", "Resolución DGTCEEByEM N.º 257/2023",
     "Evaluación. Revisar también las circulares posteriores que correspondan."),
    ("LEY", "4853/2013", "Congreso Nacional",
     "Conformación, organización y funcionamiento de la Asociación de Cooperación Escolar (ACE)", "ACE."),
    ("RESOLUCION", "1238/2025", "MEC",
     "Lineamientos administrativos y técnicos para registro y reconocimiento de ACE (versión 3)", "ACE."),
    ("LEY", "7593/2025", "Congreso Nacional", "Protección de Datos Personales",
     "Entra en vigor 24 meses después de su publicación oficial."),
    ("LEY", "5136/2013", "Congreso Nacional", "Educación Inclusiva", "Protección de datos e inclusión."),
]


def cargar(apps, schema_editor):
    Fuente = apps.get_model("normativa", "FuenteNormativa")
    for tipo, numero, organismo, titulo, notas in FUENTES:
        Fuente.objects.get_or_create(
            tipo=tipo, numero=numero, organismo=organismo, institucion=None,
            defaults={"titulo": titulo, "notas": notas, "verificacion": "PENDIENTE"},
        )


def quitar(apps, schema_editor):
    Fuente = apps.get_model("normativa", "FuenteNormativa")
    for tipo, numero, organismo, *_ in FUENTES:
        Fuente.objects.filter(tipo=tipo, numero=numero, organismo=organismo, institucion=None,
                              versiones__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("normativa", "0001_initial"),
    ]

    operations = [migrations.RunPython(cargar, quitar)]
