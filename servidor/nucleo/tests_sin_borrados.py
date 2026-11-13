"""Registros académicos y financieros no se borran (docs/decisiones/0007-sin-borrados-fisicos.md)."""
from datetime import date

from django.db import models
from django.db.models import ProtectedError
from rest_framework.test import APITestCase

from academico.models import AnioLectivo, Asignacion, Curso, Etapa, Materia, Matricula, Nivel, Seccion
from aportes.models import LineaRecibo
from asistencia.models import Justificacion, RegistroAsistencia, SesionClase
from pedagogico.models import Instrumento, LogroIndicador, Puntaje, RegistroClase
from personas.models import Alumno, Docente, Usuario


class SinBorradosTest(APITestCase):
    def setUp(self):
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="111", nombres="Ana", apellidos="Gómez")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 12, 1),
                                          activo=True)
        self.etapa = Etapa.objects.create(anio_lectivo=anio, numero=1, fecha_inicio=date(2027, 2, 20),
                                          fecha_fin=date(2027, 7, 1))
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="Media"), grado=1, nombre="1° Curso")
        seccion = Seccion.objects.create(anio_lectivo=anio, curso=curso)
        self.asig = Asignacion.objects.create(seccion=seccion, materia=Materia.objects.create(nombre="Informática"),
                                              docente=doc)
        alumno = Alumno.objects.create(ci="A1", nombres="Lucía", apellidos="Ejemplo")
        self.mat = Matricula.objects.create(alumno=alumno, seccion=seccion, fecha=date(2027, 2, 20))
        self.sesion = SesionClase.objects.create(asignacion=self.asig, docente=doc, fecha=date(2027, 3, 2))
        RegistroAsistencia.objects.create(sesion=self.sesion, matricula=self.mat, estado="A")
        r = self.client.post("/api/auth/token/", {"username": "profe", "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def test_la_api_no_borra_clases_dadas(self):
        r = self.client.delete(f"/api/sesiones/{self.sesion.id}/")
        self.assertEqual(r.status_code, 405)
        self.assertTrue(SesionClase.objects.filter(pk=self.sesion.pk).exists())

    def test_ni_siquiera_por_codigo_se_pierden_las_marcas(self):
        with self.assertRaises(ProtectedError):
            self.sesion.delete()
        self.assertEqual(RegistroAsistencia.objects.count(), 1)

    def test_trabajo_con_puntajes_no_se_borra_y_sin_puntajes_si(self):
        con = Instrumento.objects.create(asignacion=self.asig, etapa=self.etapa, titulo="TP 1",
                                         fecha=date(2027, 3, 5), puntaje_total=10)
        Puntaje.objects.create(instrumento=con, matricula=self.mat, puntaje=None)  # "no entregó" también es un dato
        r = self.client.delete(f"/api/instrumentos/{con.id}/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("No se puede eliminar", r.data["detail"])
        sin = Instrumento.objects.create(asignacion=self.asig, etapa=self.etapa, titulo="TP 2",
                                         fecha=date(2027, 3, 6), puntaje_total=10)
        self.assertEqual(self.client.delete(f"/api/instrumentos/{sin.id}/").status_code, 204)

    def test_relaciones_protegidas(self):
        protegidas = [
            (RegistroAsistencia, "sesion"), (Justificacion, "matricula"), (RegistroClase, "sesion"),
            (Puntaje, "instrumento"), (LogroIndicador, "indicador"), (LogroIndicador, "matricula"),
            (LineaRecibo, "recibo"),
        ]
        for modelo, campo in protegidas:
            with self.subTest(f"{modelo.__name__}.{campo}"):
                self.assertIs(modelo._meta.get_field(campo).remote_field.on_delete, models.PROTECT)
