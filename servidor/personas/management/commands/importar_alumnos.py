"""
Importa alumnos desde un CSV y, opcionalmente, los matricula en una sección.

Formato (separado por ; o tabulación; la primera fila es el encabezado):
    Nro;APELLIDO Y NOMBRE;N° DOCUMENTO
    1;ALONSO CAREAGA, LUZ ABIGAHYL;8067366

Uso:
    python manage.py importar_alumnos datos/alumnos_2bccs.csv               # muestra las secciones
    python manage.py importar_alumnos datos/alumnos_2bccs.csv --seccion 3   # importa y matricula
Si el alumno ya existe (misma C.I.) se actualiza el nombre; no se duplica.
"""
import csv
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academico.models import Matricula, Seccion
from personas.models import Alumno

MINUSCULAS = {"de", "del", "la", "las", "los", "y"}


def nombre_propio(texto):
    """'NICOLE DEL ROSARIO' -> 'Nicole del Rosario'."""
    palabras = texto.strip().lower().split()
    return " ".join(p if (i and p in MINUSCULAS) else p.capitalize() for i, p in enumerate(palabras))


class Command(BaseCommand):
    help = "Importa alumnos desde un CSV (Nro;APELLIDO Y NOMBRE;DOCUMENTO) y los matricula en una sección."

    def add_arguments(self, parser):
        parser.add_argument("archivo")
        parser.add_argument("--seccion", type=int, help="ID de la sección donde matricularlos")
        parser.add_argument("--fecha", help="Fecha de matrícula AAAA-MM-DD (por defecto, hoy)")
        parser.add_argument("--deshacer", action="store_true",
                            help="Quita las matrículas del año activo de los alumnos del archivo y borra a los que queden sin matrícula")
        parser.add_argument("--confirmar", action="store_true", help="Con --deshacer: ejecuta el borrado (sin esto solo muestra qué haría)")

    def handle(self, archivo, seccion=None, fecha=None, deshacer=False, confirmar=False, **_):
        filas = self.leer(archivo)
        self.stdout.write(f"{len(filas)} alumnos en el archivo.")
        if deshacer:
            return self.deshacer(filas, seccion, confirmar)

        if seccion is None:
            self.stdout.write("\nIndicá la sección con --seccion ID. Secciones del año activo:")
            for s in Seccion.objects.filter(anio_lectivo__activo=True).select_related("curso"):
                self.stdout.write(f"  {s.id:>4}  {s}  ({s.inscriptos}/{s.cupo})")
            return

        try:
            sec = Seccion.objects.select_related("anio_lectivo").get(pk=seccion)
        except Seccion.DoesNotExist:
            raise CommandError(f"No existe la sección {seccion}.")
        f_matricula = date.fromisoformat(fecha) if fecha else date.today()

        ya = set(Matricula.objects.filter(anio_lectivo=sec.anio_lectivo, alumno__ci__in=[f["ci"] for f in filas])
                 .values_list("alumno__ci", flat=True))
        nuevos = len([f for f in filas if f["ci"] not in ya])
        if sec.inscriptos + nuevos > sec.cupo:
            raise CommandError(
                f"La sección tiene cupo {sec.cupo} y quedarían {sec.inscriptos + nuevos} inscriptos. "
                f"Aumentá el cupo en Gestión › Secciones y volvé a ejecutar.")

        creados = actualizados = matriculados = 0
        otros = []
        with transaction.atomic():
            for f in filas:
                alumno, nuevo = Alumno.objects.get_or_create(ci=f["ci"], defaults={"nombres": f["nombres"], "apellidos": f["apellidos"]})
                if nuevo:
                    creados += 1
                elif (alumno.nombres, alumno.apellidos) != (f["nombres"], f["apellidos"]):
                    alumno.nombres, alumno.apellidos = f["nombres"], f["apellidos"]
                    alumno.save()
                    actualizados += 1
                m = Matricula.objects.filter(alumno=alumno, anio_lectivo=sec.anio_lectivo).first()
                if m is None:
                    Matricula.objects.create(alumno=alumno, seccion=sec, fecha=f_matricula, numero_lista=f["nro"])
                    matriculados += 1
                elif m.seccion_id == sec.id:
                    if m.numero_lista != f["nro"]:
                        m.numero_lista = f["nro"]
                        m.save()
                else:
                    otros.append(f"{alumno} ya está matriculado en {m.seccion}")

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {creados} alumnos nuevos, {actualizados} actualizados, {matriculados} matriculados en {sec}."))
        for o in otros:
            self.stdout.write(self.style.WARNING(o))

    def deshacer(self, filas, seccion, confirmar):
        """Revierte una importación: borra las matrículas y los alumnos que no tengan otras."""
        cis = [f["ci"] for f in filas]
        matriculas = Matricula.objects.filter(alumno__ci__in=cis, anio_lectivo__activo=True).select_related("alumno", "seccion")
        if seccion:
            matriculas = matriculas.filter(seccion_id=seccion)
        matriculas = list(matriculas)
        alumnos = list(Alumno.objects.filter(ci__in=cis))
        self.stdout.write(f"\nSe quitarían {len(matriculas)} matrículas:")
        for m in matriculas:
            self.stdout.write(f"  - {m.alumno} ({m.alumno.ci}) de {m.seccion}")
        if not confirmar:
            self.stdout.write(self.style.WARNING(
                "\nNo se borró nada. Si la lista es correcta, repetí el comando agregando --confirmar"))
            return
        borradas = alumnos_borrados = 0
        bloqueados = []
        for m in matriculas:
            try:
                with transaction.atomic():
                    m.delete()
                borradas += 1
            except Exception:
                bloqueados.append(f"{m.alumno}: ya tiene asistencias o puntajes cargados en {m.seccion}")
        for a in alumnos:
            if not a.matriculas.exists():
                try:
                    with transaction.atomic():
                        a.delete()
                    alumnos_borrados += 1
                except Exception:
                    bloqueados.append(f"{a}: no se pudo borrar porque tiene otros datos asociados")
        self.stdout.write(self.style.SUCCESS(f"Listo: {borradas} matrículas quitadas y {alumnos_borrados} alumnos borrados."))
        for b in bloqueados:
            self.stdout.write(self.style.WARNING(b))

    def leer(self, archivo):
        # Acepta UTF-8 o la codificación de Windows (Excel / Bloc de notas guardan así la Ñ).
        try:
            with open(archivo, encoding="utf-8-sig") as fh:
                fh.read()
            codificacion = "utf-8-sig"
        except UnicodeDecodeError:
            codificacion = "cp1252"
        with open(archivo, encoding=codificacion, newline="") as fh:
            muestra = fh.read(2048)
            fh.seek(0)
            sep = "\t" if muestra.count("\t") > muestra.count(";") else ";"
            lector = csv.reader(fh, delimiter=sep)
            next(lector, None)  # encabezado
            filas = []
            for n, r in enumerate(lector, start=2):
                if not r or not "".join(r).strip():
                    continue
                if len(r) < 3 or "," not in r[1]:
                    raise CommandError(f"Línea {n}: se esperaba 'Nro;APELLIDOS, NOMBRES;DOCUMENTO' y llegó {r}")
                apellidos, nombres = r[1].split(",", 1)
                filas.append({
                    "nro": int(r[0]) if r[0].strip().isdigit() else None,
                    "apellidos": nombre_propio(apellidos),
                    "nombres": nombre_propio(nombres),
                    "ci": r[2].strip().replace(".", ""),
                })
            return filas
