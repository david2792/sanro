"""Lista con borrador y confirmación, correcciones con motivo, anulación, retiro anticipado y origen (plan 7.4-7.6)."""
from datetime import date, timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from academico.models import AnioLectivo, Asignacion, Curso, Materia, Matricula, Nivel, Seccion
from nucleo.models import RegistroAuditoria
from personas.models import Alumno, Docente, Usuario
from .models import RegistroAsistencia, SesionClase


class SesionesTest(APITestCase):
    def setUp(self):
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="111", nombres="Ana", apellidos="Gómez")
        hoy = timezone.localdate()
        anio = AnioLectivo.objects.create(anio=hoy.year, fecha_inicio=hoy - timedelta(days=200),
                                          fecha_fin=hoy + timedelta(days=200), activo=True)
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="Media"), grado=1, nombre="1° Curso")
        self.seccion = Seccion.objects.create(anio_lectivo=anio, curso=curso)
        self.asig = Asignacion.objects.create(seccion=self.seccion, materia=Materia.objects.create(nombre="Informática"),
                                              docente=doc)
        self.mat = Matricula.objects.create(alumno=Alumno.objects.create(ci="A1", nombres="Lucía", apellidos="Ejemplo"),
                                            seccion=self.seccion, fecha=hoy - timedelta(days=200))
        self.hoy, self.ayer = hoy.isoformat(), (hoy - timedelta(days=1)).isoformat()

    def login(self, user):
        r = self.client.post("/api/auth/token/", {"username": user.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def guardar(self, fecha, estado, **extra):
        registro = {"matricula": self.mat.id, "estado": estado}
        registro.update({k: extra.pop(k) for k in ("hora_salida", "hora_llegada") if k in extra})
        return self.client.post("/api/sesiones/", {"asignacion": self.asig.id, "fecha": fecha, "hora_inicio": "07:00",
                                                   "registros": [registro], **extra}, format="json")

    def test_borrador_y_confirmacion(self):
        self.login(self.u_doc)
        r = self.guardar(self.hoy, "A", confirmar=False)
        self.assertEqual(r.data["estado"], "BORRADOR")
        r = self.guardar(self.hoy, "P", confirmar=False)  # el borrador se ajusta sin motivo
        self.assertEqual((r.data["estado"], r.data["registros"][0]["estado"]), ("BORRADOR", "P"))
        r = self.guardar(self.hoy, "P")
        self.assertEqual(r.data["estado"], "CONFIRMADA")
        self.assertIsNotNone(r.data["confirmada_en"])
        r = self.guardar(self.hoy, "P", confirmar=False)  # una confirmada no vuelve a borrador
        self.assertEqual(r.data["estado"], "CONFIRMADA")

    def test_correccion_de_lista_confirmada(self):
        self.login(self.u_doc)
        self.guardar(self.hoy, "P")
        self.assertEqual(self.guardar(self.hoy, "A").status_code, 400)  # sin motivo
        r = self.guardar(self.hoy, "A", motivo="Se había ido al baño, no estaba")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["registros"][0]["origen"], "CORRECCION")
        cambio = RegistroAuditoria.objects.get(modelo="asistencia.registroasistencia", accion="MODIFICAR")
        self.assertEqual((cambio.cambios["estado"], cambio.motivo), (["P", "A"], "Se había ido al baño, no estaba"))
        hist = self.client.get(f"/api/sesiones/{r.data['id']}/historial/").data
        self.assertTrue(any(h["motivo"] == "Se había ido al baño, no estaba" for h in hist))
        # Reenviar lo mismo (p. ej. una sincronización repetida) no es una corrección.
        self.assertEqual(self.guardar(self.hoy, "A").status_code, 201)

    def test_dia_pasado_solo_corrige_direccion(self):
        self.login(self.u_doc)
        self.guardar(self.ayer, "P")
        r = self.guardar(self.ayer, "A", motivo="Me equivoqué")
        self.assertEqual(r.status_code, 400)
        self.assertIn("solo dirección", str(r.data))
        self.login(self.director)
        r = self.guardar(self.ayer, "A", motivo="Nota de la docente")
        self.assertEqual((r.status_code, r.data["registros"][0]["estado"]), (201, "A"))

    def test_anular_clase_deja_de_contar(self):
        self.login(self.u_doc)
        r = self.guardar(self.hoy, "A")
        url = f"/api/sesiones/{r.data['id']}/"
        self.assertEqual(self.client.post(url + "anular/").status_code, 400)  # sin motivo
        a = self.client.post(url + "anular/", {"motivo": "Hubo acto escolar, no se dio clase"})
        self.assertEqual((a.status_code, a.data["estado"]), (200, "ANULADA"))
        # No aparece en las listas ni cuenta en los porcentajes; pero sigue guardada.
        self.assertEqual(self.client.get(f"/api/sesiones/?asignacion={self.asig.id}").data["count"], 0)
        self.login(self.director)
        alumno = self.client.get(f"/api/secciones/{self.seccion.id}/asistencia/").data["alumnos"][0]
        self.assertEqual((alumno["clases"], alumno["ausentes"]), (0, 0))
        self.assertEqual(SesionClase.todas.get(pk=r.data["id"]).motivo_anulacion, "Hubo acto escolar, no se dio clase")
        self.assertEqual(RegistroAsistencia.todos.filter(sesion_id=r.data["id"]).count(), 1)
        # Esa clase ya no se puede volver a cargar.
        self.login(self.u_doc)
        self.assertEqual(self.guardar(self.hoy, "P").status_code, 400)

    def test_retiro_anticipado_cuenta_como_presente(self):
        self.login(self.u_doc)
        r = self.guardar(self.hoy, "R", hora_salida="09:30")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["registros"][0]["estado"], r.data["registros"][0]["hora_salida"]), ("R", "09:30:00"))
        self.login(self.director)
        alumno = self.client.get(f"/api/secciones/{self.seccion.id}/asistencia/").data["alumnos"][0]
        self.assertEqual((alumno["presentes"], alumno["porcentaje"]), (1, 100.0))

    def test_origen_y_quien_creo_y_sincronizo(self):
        self.login(self.u_doc)
        r = self.guardar(self.hoy, "P", sin_conexion=True)
        self.assertEqual(r.data["registros"][0]["origen"], "SIN_CONEXION")
        s = SesionClase.objects.get(pk=r.data["id"])
        self.assertEqual((s.creado_por, s.registrado_por, s.confirmada_por), (self.u_doc, self.u_doc, self.u_doc))
        self.login(self.director)
        self.guardar(self.hoy, "T", hora_llegada="07:10", motivo="Llegó tarde, la docente avisó")
        s.refresh_from_db()
        self.assertEqual((s.creado_por, s.registrado_por), (self.u_doc, self.director))
