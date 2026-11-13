"""Matrícula con estados del plan, bajas con motivo e historial de cambios de sección (plan maestro 5 y 7.5)."""
from datetime import date

from rest_framework.test import APITestCase

from personas.models import Alumno, Docente, Usuario
from .models import AnioLectivo, Asignacion, CambioSeccion, Curso, Materia, Matricula, Nivel, Seccion


class MatriculasTest(APITestCase):
    def setUp(self):
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="111", nombres="Ana", apellidos="Gómez")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 12, 1),
                                          activo=True)
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="Media"), grado=1, nombre="1° Curso")
        self.a = Seccion.objects.create(anio_lectivo=anio, curso=curso, letra="A", cupo=1)
        self.b = Seccion.objects.create(anio_lectivo=anio, curso=curso, letra="B", cupo=1)
        materia = Materia.objects.create(nombre="Informática")
        self.asig_a = Asignacion.objects.create(seccion=self.a, materia=materia, docente=doc)
        self.asig_b = Asignacion.objects.create(seccion=self.b, materia=materia, docente=doc)
        self.alumno = Alumno.objects.create(ci="A1", nombres="Lucía", apellidos="Ejemplo")
        self.login(self.director)

    def login(self, user):
        r = self.client.post("/api/auth/token/", {"username": user.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def matricular(self, **datos):
        return self.client.post("/api/matriculas/", {"alumno": self.alumno.id, "seccion": self.a.id,
                                                     "fecha": "2027-02-20", **datos})

    def test_preinscripcion_no_ocupa_cupo_hasta_confirmar(self):
        pre = self.matricular(estado="PREINSCRIPTO")
        self.assertEqual(pre.status_code, 201, pre.data)
        otro = Alumno.objects.create(ci="A2", nombres="Mateo", apellidos="Ejemplo")
        r = self.client.post("/api/matriculas/", {"alumno": otro.id, "seccion": self.a.id, "fecha": "2027-02-20"})
        self.assertEqual(r.status_code, 201)  # ocupa el único lugar
        # Al confirmar al preinscripto ya no hay cupo.
        self.assertEqual(self.client.patch(f"/api/matriculas/{pre.data['id']}/", {"estado": "ACTIVA"}).status_code, 400)
        self.assertEqual(self.client.patch(f"/api/matriculas/{pre.data['id']}/", {"estado": "PENDIENTE_DOC"}).status_code, 400)

    def test_transiciones_y_bajas_con_motivo(self):
        m = self.matricular().data
        url = f"/api/matriculas/{m['id']}/"
        self.assertEqual(self.client.patch(url, {"estado": "PREINSCRIPTO"}).status_code, 400)  # no vuelve atrás
        self.assertEqual(self.client.patch(url, {"estado": "RETIRADO"}).status_code, 400)  # falta el motivo
        r = self.client.patch(url, {"estado": "RETIRADO", "motivo_baja": "Se mudó de ciudad"})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNotNone(r.data["fecha_baja"])
        # Reincorporación: vuelve a cursar y la baja queda solo en el historial.
        r = self.client.patch(url, {"estado": "ACTIVA"})
        self.assertEqual((r.status_code, r.data["fecha_baja"], r.data["motivo_baja"]), (200, None, ""))
        self.assertEqual(self.client.delete(url).status_code, 405)  # se anula, no se borra
        self.assertEqual(self.client.patch(url, {"estado": "ANULADA", "motivo_baja": "Cargada dos veces"}).status_code, 200)
        self.assertEqual(self.client.patch(url, {"estado": "ACTIVA"}).status_code, 400)  # una anulada no revive

    def test_cambio_de_seccion_con_historial(self):
        m = self.matricular(numero_lista=3).data
        url = f"/api/matriculas/{m['id']}/"
        self.assertEqual(self.client.patch(url, {"seccion": self.b.id}).status_code, 400)  # no se pisa la sección
        sin_motivo = self.client.post(url + "cambiar-seccion/", {"seccion_nueva": self.b.id, "fecha_efectiva": "2027-05-01"})
        self.assertEqual(sin_motivo.status_code, 400)
        r = self.client.post(url + "cambiar-seccion/", {"seccion_nueva": self.b.id, "fecha_efectiva": "2027-05-01",
                                                        "motivo": "Pedido de la familia por el turno"})
        self.assertEqual(r.status_code, 201, r.data)
        mat = Matricula.objects.get(pk=m["id"])
        self.assertEqual((mat.seccion, mat.numero_lista), (self.b, None))
        self.assertEqual(mat.seccion_en(date(2027, 4, 30)), self.a.id)
        self.assertEqual(mat.seccion_en(date(2027, 5, 1)), self.b.id)
        historial = self.client.get(url + "cambiar-seccion/").data
        self.assertEqual((len(historial), historial[0]["autorizado_por"]), (1, self.director.id))
        self.assertEqual(CambioSeccion.objects.count(), 1)

    def test_asistencia_solo_si_cursaba_en_esa_seccion_ese_dia(self):
        m = self.matricular().data
        self.client.post(f"/api/matriculas/{m['id']}/cambiar-seccion/", {
            "seccion_nueva": self.b.id, "fecha_efectiva": "2027-05-01", "motivo": "Cambio de turno"})
        self.login(self.u_doc)

        def lista(asig, fecha):
            return self.client.post("/api/sesiones/", {"asignacion": asig.id, "fecha": fecha, "registros": [
                {"matricula": m["id"], "estado": "P"}]}, format="json").status_code

        self.assertEqual(lista(self.asig_a, "2027-02-10"), 400)  # antes de matricularse
        self.assertEqual(lista(self.asig_a, "2027-04-30"), 201)  # en A antes del cambio
        self.assertEqual(lista(self.asig_a, "2027-05-02"), 400)  # ya estaba en B
        self.assertEqual(lista(self.asig_b, "2027-05-02"), 201)
        self.assertEqual(lista(self.asig_b, "2027-04-29"), 400)  # todavía estaba en A
