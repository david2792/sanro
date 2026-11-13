"""Justificativos como trámite (plan maestro, módulo 5; docs/decisiones/0008-justificativos.md)."""
from datetime import date

from rest_framework.test import APITestCase

from academico.models import AnioLectivo, Asignacion, Curso, Materia, Matricula, Nivel, Seccion
from nucleo.models import RegistroAuditoria
from personas.models import Alumno, Docente, Usuario
from .models import Justificacion, RegistroAsistencia


class JustificativosTest(APITestCase):
    def setUp(self):
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="111", nombres="Ana", apellidos="Gómez")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 12, 1),
                                          activo=True)
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="Media"), grado=1, nombre="1° Curso")
        seccion = Seccion.objects.create(anio_lectivo=anio, curso=curso)
        self.asig = Asignacion.objects.create(seccion=seccion, materia=Materia.objects.create(nombre="Informática"),
                                              docente=doc)
        alumno = Alumno.objects.create(ci="A1", nombres="Lucía", apellidos="Ejemplo")
        self.mat = Matricula.objects.create(alumno=alumno, seccion=seccion, fecha=date(2027, 2, 20))

    def login(self, user):
        r = self.client.post("/api/auth/token/", {"username": user.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def lista(self, fecha, estado, observacion=""):
        r = self.client.post("/api/sesiones/", {"asignacion": self.asig.id, "fecha": fecha, "registros": [
            {"matricula": self.mat.id, "estado": estado, "observacion": observacion}]}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data["registros"][0]

    def nuevo(self, desde, hasta):
        r = self.client.post("/api/justificaciones/", {"matricula": self.mat.id, "fecha_desde": desde,
                                                       "fecha_hasta": hasta, "motivo": "Reposo",
                                                       "presentado_por": "Madre"})
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def test_aviso_del_docente_queda_pendiente_sin_duplicarse(self):
        self.login(self.u_doc)
        reg = self.lista("2027-03-02", "J", "Avisó la madre")
        self.assertEqual((reg["estado"], reg["justificada"], reg["justificacion_estado"]), ("A", False, "PRESENTADO"))
        self.lista("2027-03-02", "J", "Avisó la madre por WhatsApp")  # se reenvía (p. ej. sincronización)
        self.assertEqual(Justificacion.objects.count(), 1)
        self.assertEqual(Justificacion.objects.get().motivo, "Avisó la madre por WhatsApp")
        # Si el docente corrige y el alumno estaba presente, el aviso se cancela.
        reg = self.lista("2027-03-02", "P")
        self.assertEqual(reg["justificacion_estado"], "CANCELADO")

    def test_aprobacion_parcial_rechazo_y_cierre(self):
        self.login(self.u_doc)
        r1 = self.lista("2027-03-02", "A")
        r2 = self.lista("2027-03-03", "A")
        self.login(self.director)
        j = self.nuevo("2027-03-02", "2027-03-03")
        self.assertEqual(j["estado"], "PRESENTADO")
        self.assertEqual([a["registro"] for a in j["detalle_ausencias"]], [r1["id"], r2["id"]])
        url = f"/api/justificaciones/{j['id']}/"

        self.assertEqual(self.client.post(url + "revisar/").data["estado"], "EN_REVISION")
        # Aprobar en parte exige motivo y elegir las ausencias.
        self.assertEqual(self.client.post(url + "decidir/", {"decision": "APROBADO_PARCIAL", "aprobadas": [r1["id"]]},
                                          format="json").status_code, 400)
        d = self.client.post(url + "decidir/", {"decision": "APROBADO_PARCIAL", "aprobadas": [r1["id"]],
                                                "motivo": "El certificado cubre solo el primer día"}, format="json")
        self.assertEqual((d.status_code, d.data["estado"]), (200, "APROBADO_PARCIAL"), d.data)
        justificadas = dict(RegistroAsistencia.objects.values_list("id", "justificada"))
        self.assertEqual((justificadas[r1["id"]], justificadas[r2["id"]]), (True, False))
        # Las ausencias siguen siendo ausencias.
        self.assertEqual(set(RegistroAsistencia.objects.values_list("estado", flat=True)), {"A"})
        # Ya decidido: no se vuelve a decidir ni se edita, y nunca se borra.
        self.assertEqual(self.client.post(url + "decidir/", {"decision": "APROBADO"}).status_code, 400)
        self.assertEqual(self.client.patch(url, {"motivo": "otro"}).status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 405)

    def test_falta_documentacion_y_luego_rechazo(self):
        self.login(self.u_doc)
        reg = self.lista("2027-03-02", "A")
        self.login(self.director)
        j = self.nuevo("2027-03-02", "2027-03-02")
        url = f"/api/justificaciones/{j['id']}/"
        self.assertEqual(self.client.post(url + "decidir/", {"decision": "REQUIERE_INFO"}).status_code, 400)  # sin motivo
        self.assertEqual(self.client.post(url + "decidir/", {"decision": "REQUIERE_INFO",
                                                             "motivo": "Falta la firma"}).data["estado"], "REQUIERE_INFO")
        r = self.client.post(url + "decidir/", {"decision": "RECHAZADO", "motivo": "No corresponde a las fechas"})
        self.assertEqual(r.data["estado"], "RECHAZADO")
        self.assertFalse(RegistroAsistencia.objects.get(pk=reg["id"]).justificada)
        decision = RegistroAuditoria.objects.filter(modelo="asistencia.justificacion", objeto_id=str(j["id"]),
                                                    accion="MODIFICAR").first()  # el más reciente
        self.assertEqual(decision.cambios["estado"], ["REQUIERE_INFO", "RECHAZADO"])
        self.assertEqual(decision.usuario, self.director)

    def test_corregir_la_marca_quita_la_justificacion(self):
        self.login(self.u_doc)
        reg = self.lista("2027-03-02", "A")
        self.login(self.director)
        j = self.nuevo("2027-03-02", "2027-03-02")
        self.client.post(f"/api/justificaciones/{j['id']}/decidir/", {"decision": "APROBADO"})
        self.assertTrue(RegistroAsistencia.objects.get(pk=reg["id"]).justificada)
        self.login(self.u_doc)
        self.assertFalse(self.lista("2027-03-02", "P")["justificada"])  # estaba presente: no hay ausencia que justificar

    def test_sin_ausencias_no_se_aprueba_y_cancelar_pide_motivo(self):
        self.login(self.director)
        j = self.nuevo("2027-03-10", "2027-03-11")
        url = f"/api/justificaciones/{j['id']}/"
        self.assertEqual(self.client.post(url + "decidir/", {"decision": "APROBADO"}).status_code, 400)
        self.assertEqual(self.client.post(url + "cancelar/").status_code, 400)
        self.assertEqual(self.client.post(url + "cancelar/", {"motivo": "Cargado por error"}).data["estado"], "CANCELADO")
        self.login(self.u_doc)
        self.assertEqual(self.client.get("/api/justificaciones/").status_code, 403)  # trámite de gestión
