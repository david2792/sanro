"""Estados del año lectivo y bloqueo de los años cerrados (plan maestro, módulo 1)."""
from datetime import date

from rest_framework.test import APITestCase

from asistencia.models import RegistroAsistencia, SesionClase
from nucleo.models import RegistroAuditoria
from personas.models import Alumno, Docente, Usuario
from .cierre import AnioCerrado
from .models import AnioLectivo, Asignacion, Curso, Materia, Matricula, Nivel, Seccion


class CierreDeAnioTest(APITestCase):
    def setUp(self):
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.secretaria = Usuario.objects.create_user("secre", password="x", rol="SECRETARIA")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="111", nombres="Ana", apellidos="Gómez")
        self.anio = AnioLectivo.objects.create(anio=2025, fecha_inicio=date(2025, 2, 20), fecha_fin=date(2025, 12, 1),
                                               estado="ACTIVO", activo=True)
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="Media"), grado=1, nombre="1° Curso")
        self.seccion = Seccion.objects.create(anio_lectivo=self.anio, curso=curso)
        self.asig = Asignacion.objects.create(seccion=self.seccion, materia=Materia.objects.create(nombre="Arte"),
                                              docente=doc)
        self.mat = Matricula.objects.create(alumno=Alumno.objects.create(ci="A1", nombres="Lucía", apellidos="E"),
                                            seccion=self.seccion, fecha=date(2025, 2, 20))
        self.sesion = SesionClase.objects.create(asignacion=self.asig, docente=doc, fecha=date(2025, 3, 3))
        self.registro = RegistroAsistencia.objects.create(sesion=self.sesion, matricula=self.mat, estado="P")
        self.url = f"/api/anios-lectivos/{self.anio.id}/"

    def login(self, user):
        r = self.client.post("/api/auth/token/", {"username": user.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def cerrar(self):
        self.login(self.director)
        self.assertEqual(self.client.patch(self.url, {"estado": "CIERRE_PENDIENTE"}).status_code, 200)
        r = self.client.patch(self.url, {"estado": "CERRADO"})
        self.assertEqual((r.status_code, r.data["estado"], r.data["activo"]), (200, "CERRADO", False))

    def test_transiciones(self):
        self.login(self.director)
        self.assertEqual(self.client.patch(self.url, {"estado": "CERRADO"}).status_code, 400)  # salteando el cierre pendiente
        self.assertEqual(self.client.patch(self.url, {"estado": "PREPARACION"}).status_code, 400)
        nuevo = self.client.post("/api/anios-lectivos/", {"anio": 2026, "fecha_inicio": "2026-02-20",
                                                          "fecha_fin": "2026-12-01", "activo": True})
        self.assertEqual((nuevo.status_code, nuevo.data["estado"]), (201, "ACTIVO"))

    def test_anio_cerrado_no_se_modifica(self):
        self.cerrar()
        self.registro.estado = "A"
        with self.assertRaises(AnioCerrado):
            self.registro.save()
        with self.assertRaises(AnioCerrado):
            Matricula.objects.create(alumno=Alumno.objects.create(ci="A2", nombres="M", apellidos="E"),
                                     seccion=self.seccion, fecha=date(2025, 3, 1))
        # Por la API: el docente no puede cargar ni corregir listas de ese año.
        self.login(self.u_doc)
        r = self.client.post("/api/sesiones/", {"asignacion": self.asig.id, "fecha": "2025-03-04", "registros": [
            {"matricula": self.mat.id, "estado": "P"}]}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertIn("cerrado", r.data["detail"])
        # Tampoco se cambian los datos del año en sí.
        self.login(self.director)
        self.assertEqual(self.client.patch(self.url, {"fecha_fin": "2025-12-20"}).status_code, 400)

    def test_reapertura_solo_direccion_con_motivo(self):
        self.cerrar()
        self.login(self.secretaria)
        self.assertEqual(self.client.patch(self.url, {"estado": "CIERRE_PENDIENTE", "motivo": "x"}).status_code, 400)
        self.login(self.director)
        self.assertEqual(self.client.patch(self.url, {"estado": "CIERRE_PENDIENTE"}).status_code, 400)  # sin motivo
        r = self.client.patch(self.url, {"estado": "CIERRE_PENDIENTE", "motivo": "Corregir notas de diciembre (acta 12)"})
        self.assertEqual(r.status_code, 200, r.data)
        cambio = RegistroAuditoria.objects.filter(modelo="academico.aniolectivo", accion="MODIFICAR").first()
        self.assertEqual((cambio.cambios["estado"], cambio.motivo),
                         (["CERRADO", "CIERRE_PENDIENTE"], "Corregir notas de diciembre (acta 12)"))
        self.registro.estado = "A"
        self.registro.save()  # reabierto: se puede corregir

    def test_archivado_es_definitivo(self):
        self.cerrar()
        self.assertEqual(self.client.patch(self.url, {"estado": "ARCHIVADO"}).status_code, 200)
        self.assertEqual(self.client.patch(self.url, {"estado": "CIERRE_PENDIENTE", "motivo": "x"}).status_code, 400)
