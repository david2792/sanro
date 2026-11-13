"""Reporte de ausencias (estaba en las pruebas de aportes; se mudó acá en la Fase 2)."""
from datetime import date

from rest_framework.test import APITestCase

from academico.models import AnioLectivo, Asignacion, Curso, Materia, Matricula, Nivel, Seccion
from personas.models import Alumno, Docente, Usuario
from . import justificaciones as tramite
from .models import Justificacion, RegistroAsistencia, SesionClase


class ReporteAusenciasTest(APITestCase):
    def setUp(self):
        hoy = date.today()
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        doc = Docente.objects.create(usuario=Usuario.objects.create_user("profe", password="x", rol="DOCENTE"),
                                     ci="9", nombres="Ana", apellidos="Gómez")
        anio = AnioLectivo.objects.create(anio=hoy.year, fecha_inicio=date(hoy.year, 1, 1),
                                          fecha_fin=date(hoy.year, 12, 31), activo=True)
        sec = Seccion.objects.create(anio_lectivo=anio, curso=Curso.objects.create(
            nivel=Nivel.objects.create(nombre="EM"), grado=1, nombre="1° Curso"))
        self.m = [Matricula.objects.create(alumno=Alumno.objects.create(ci=str(i), nombres="A", apellidos=f"X{i}"),
                                           seccion=sec, fecha=date(hoy.year, 1, 1), numero_lista=i) for i in (1, 2, 3)]
        self.asig = Asignacion.objects.create(seccion=sec, materia=Materia.objects.create(nombre="Mate"), docente=doc)

    def test_reporte_ausencias(self):
        hoy = date.today()
        s = SesionClase.objects.create(asignacion=self.asig, docente=self.asig.docente, fecha=hoy)
        for m, est in zip(self.m, "PAA"):
            RegistroAsistencia.objects.create(sesion=s, matricula=m, estado=est)
        # La tercera ausencia tiene un justificativo aprobado (la ausencia sigue siendo "A").
        j = Justificacion.objects.create(matricula=self.m[2], fecha_desde=hoy, fecha_hasta=hoy, motivo="Reposo")
        tramite.decidir(j, self.director, "APROBADO")
        r = self.client.post("/api/auth/token/", {"username": "director", "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])
        r = self.client.get("/api/reportes/ausencias/")
        self.assertEqual(r.status_code, 200, r.data)
        fila = r.data["secciones"][0]
        self.assertEqual((fila["registros"], fila["ausentes"], fila["justificadas"]), (3, 1, 1))
        self.assertEqual(fila["inasistencia"], 66.7)
        self.assertEqual(r.data["cursos"][0]["inasistencia"], 66.7)
        self.assertEqual(r.data["alumnos"][0]["matricula"], self.m[1].id)
        self.assertEqual(self.client.get("/api/reportes/ausencias/?desde=xx").status_code, 400)
