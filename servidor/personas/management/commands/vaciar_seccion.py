"""
Quita todas las matrículas de una sección y borra a los alumnos que queden sin ninguna matrícula.

Uso:
    python manage.py vaciar_seccion                       # lista las secciones con su número
    python manage.py vaciar_seccion --seccion 5           # muestra qué se borraría (no borra)
    python manage.py vaciar_seccion --seccion 5 --confirmar
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academico.models import Matricula, Seccion


class Command(BaseCommand):
    help = "Quita las matrículas de una sección y borra a los alumnos que queden sin matrícula."

    def add_arguments(self, parser):
        parser.add_argument("--seccion", type=int)
        parser.add_argument("--confirmar", action="store_true")

    def handle(self, seccion=None, confirmar=False, **_):
        if seccion is None:
            self.stdout.write("Secciones (número · nombre · inscriptos):")
            for s in Seccion.objects.select_related("curso", "anio_lectivo").order_by("-anio_lectivo__anio", "curso", "letra"):
                self.stdout.write(f"  {s.id:>4}  {s}  ({s.matriculas.count()} matriculados)")
            self.stdout.write("\nRepetí con --seccion NÚMERO para ver qué se borraría.")
            return
        try:
            sec = Seccion.objects.get(pk=seccion)
        except Seccion.DoesNotExist:
            raise CommandError(f"No existe la sección {seccion}.")

        matriculas = list(sec.matriculas.select_related("alumno").order_by("numero_lista", "alumno__apellidos"))
        self.stdout.write(f"Sección: {sec}\nSe quitarían {len(matriculas)} matrículas:")
        for m in matriculas:
            otras = m.alumno.matriculas.exclude(pk=m.pk).count()
            extra = f"  (se conserva el alumno: tiene {otras} matrícula(s) más)" if otras else "  (se borra el alumno)"
            self.stdout.write(f"  {m.numero_lista or '-':>3}  {m.alumno} · C.I. {m.alumno.ci}{extra}")
        if not confirmar:
            self.stdout.write(self.style.WARNING("\nNo se borró nada. Si es correcto, repetí agregando --confirmar"))
            return

        quitadas = borrados = 0
        bloqueados = []
        for m in matriculas:
            alumno = m.alumno
            try:
                with transaction.atomic():
                    m.delete()
                    quitadas += 1
                    if not alumno.matriculas.exists():
                        alumno.delete()
                        borrados += 1
            except Exception:
                bloqueados.append(f"{alumno}: tiene asistencias, puntajes u otros datos cargados; no se borró")
        self.stdout.write(self.style.SUCCESS(f"Listo: {quitadas} matrículas quitadas y {borrados} alumnos borrados de {sec}."))
        for b in bloqueados:
            self.stdout.write(self.style.WARNING(b))
