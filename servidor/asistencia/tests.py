import uuid
from datetime import date

from rest_framework.test import APITestCase

from academico.models import (AnioLectivo, Asignacion, Curso, Institucion, Materia, Matricula,
                              Nivel, Seccion)
from personas.models import Alumno, Docente, Usuario
from .models import RegistroAsistencia, SesionClase


class FlujoAsistenciaTest(APITestCase):
    def setUp(self):
        Institucion.objects.create(nombre="Colegio Nacional San Roque", asistencia_minima=80)
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        self.u_otro = Usuario.objects.create_user("otro", password="x", rol="DOCENTE")
        self.doc = Docente.objects.create(usuario=self.u_doc, ci="111", nombres="Ana", apellidos="Gómez")
        self.otro = Docente.objects.create(usuario=self.u_otro, ci="222", nombres="Luis", apellidos="Ruiz")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20),
                                          fecha_fin=date(2027, 12, 1), activo=True)
        nivel = Nivel.objects.create(nombre="Educación Media")
        curso = Curso.objects.create(nivel=nivel, grado=1, nombre="1° Curso")
        self.seccion = Seccion.objects.create(anio_lectivo=anio, curso=curso, letra="A", cupo=2)
        self.mat = Materia.objects.create(nombre="Informática")
        self.asig = Asignacion.objects.create(seccion=self.seccion, materia=self.mat, docente=self.doc)

    def login(self, user):
        r = self.client.post("/api/auth/token/", {"username": user.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def test_flujo_completo(self):
        self.login(self.director)
        ids = []
        for i, ci in enumerate(["A1", "A2", "A3"]):
            a = self.client.post("/api/alumnos/", {"ci": ci, "nombres": "N" + ci, "apellidos": "Ap"})
            self.assertEqual(a.status_code, 201, a.data)
            r = self.client.post("/api/matriculas/", {"alumno": a.data["id"], "seccion": self.seccion.id,
                                                      "fecha": "2027-02-20", "numero_lista": i + 1})
            ids.append(r)
        self.assertEqual(ids[0].status_code, 201)
        self.assertEqual(ids[1].status_code, 201)
        self.assertEqual(ids[2].status_code, 400)  # cupo completo
        print("cupo:", ids[2].data)
        dup = self.client.post("/api/matriculas/", {"alumno": ids[0].data["alumno"], "seccion": self.seccion.id,
                                                    "fecha": "2027-02-20"})
        self.assertEqual(dup.status_code, 400)
        m1, m2 = ids[0].data["id"], ids[1].data["id"]

        # Docente: ve sus clases y la lista
        self.login(self.u_doc)
        self.assertEqual(len(self.client.get("/api/asignaciones/mias/").data), 1)
        lista = self.client.get(f"/api/asignaciones/{self.asig.id}/lista/").data
        self.assertEqual([x["matricula"] for x in lista], [m1, m2])

        u = str(uuid.uuid4())
        body = {"uuid": u, "asignacion": self.asig.id, "fecha": "2027-03-02", "hora_inicio": "07:00",
                "registros": [{"matricula": m1, "estado": "P"}, {"matricula": m2, "estado": "A"}]}
        r = self.client.post("/api/sesiones/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        # Reenvío offline (mismo uuid, corrigiendo un estado) -> no duplica
        body["registros"][1]["estado"] = "T"
        r2 = self.client.post("/api/sesiones/", body, format="json")
        self.assertEqual(r2.data["id"], r.data["id"])
        # La tardanza guarda la hora de llegada y calcula los minutos de atraso.
        tarde = [x for x in r2.data["registros"] if x["matricula"] == m2][0]
        self.assertEqual((tarde["hora_llegada"], tarde["minutos_tarde"]), (None, None))
        body["registros"][1]["hora_llegada"] = "07:18"
        body["registros"][0]["hora_llegada"] = "07:30"  # presente: se ignora
        r3 = self.client.post("/api/sesiones/", body, format="json")
        regs = {x["matricula"]: x for x in r3.data["registros"]}
        self.assertEqual((regs[m2]["hora_llegada"], regs[m2]["minutos_tarde"]), ("07:18:00", 18))
        self.assertIsNone(regs[m1]["hora_llegada"])
        del body["registros"][0]["hora_llegada"]
        # El docente también marca ausencias justificadas, con su motivo.
        j = self.client.post("/api/sesiones/", {"asignacion": self.asig.id, "fecha": "2027-03-05", "registros": [
            {"matricula": m1, "estado": "J", "observacion": "Certificado médico"},
            {"matricula": m2, "estado": "P"}]}, format="json")
        regs = {x["matricula"]: x for x in j.data["registros"]}
        self.assertEqual((regs[m1]["estado"], regs[m1]["observacion"]), ("J", "Certificado médico"))
        # Limpieza de la prueba: las marcas están protegidas (decisión 0007), se quitan explícitamente primero.
        RegistroAsistencia.objects.filter(sesion_id=j.data["id"]).delete()
        SesionClase.objects.filter(pk=j.data["id"]).delete()
        # Otro día, m2 ausente
        self.client.post("/api/sesiones/", {"asignacion": self.asig.id, "fecha": "2027-03-03",
                         "registros": [{"matricula": m1, "estado": "P"}, {"matricula": m2, "estado": "A"}]},
                         format="json")
        # El filtro por clase y fecha devuelve solo esa lista.
        f = self.client.get(f"/api/sesiones/?asignacion={self.asig.id}&fecha=2027-03-02").data
        self.assertEqual((f["count"], f["results"][0]["id"]), (1, r.data["id"]))
        # Reusar el uuid del 02/03 para guardar el 04/03 no pisa la lista del 02/03.
        otro = self.client.post("/api/sesiones/", {**body, "fecha": "2027-03-04"}, format="json")
        self.assertEqual(otro.status_code, 201, otro.data)
        self.assertNotEqual(otro.data["id"], r.data["id"])
        self.assertEqual(str(SesionClase.objects.get(pk=r.data["id"]).fecha), "2027-03-02")
        RegistroAsistencia.objects.filter(sesion_id=otro.data["id"]).delete()  # limpieza (decisión 0007)
        SesionClase.objects.filter(pk=otro.data["id"]).delete()

        # Otro docente no puede llamar lista en clase ajena ni verla
        self.login(self.u_otro)
        r = self.client.post("/api/sesiones/", body, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get(f"/api/asignaciones/{self.asig.id}/lista/").status_code, 404)
        self.assertEqual(self.client.post("/api/alumnos/", {"ci": "Z", "nombres": "a", "apellidos": "b"}).status_code, 403)

        # Director: reportes y justificación
        self.login(self.director)
        rep = self.client.get(f"/api/secciones/{self.seccion.id}/asistencia/").data
        print("seccion:", rep)
        fila2 = [f for f in rep["alumnos"] if f["matricula"] == m2][0]
        self.assertEqual(fila2["porcentaje"], 50.0)
        self.assertTrue(fila2["bajo_minimo"])
        j = self.client.post("/api/justificaciones/", {"matricula": m2, "fecha_desde": "2027-03-03",
                                                       "fecha_hasta": "2027-03-03", "motivo": "Reposo"})
        self.assertEqual(j.status_code, 201, j.data)
        fila2 = self.client.get(f"/api/alumnos/{ids[1].data['alumno']}/asistencia/").data
        self.assertEqual(fila2["justificadas"], 1)
        dia = self.client.get("/api/reportes/resumen-dia/?fecha=2027-03-02").data
        print("dia:", dia)
        self.assertEqual(dia["docentes_con_clase"], ["Gómez, Ana"])
        self.assertEqual(dia["docentes_sin_registro"], [])
        self.assertEqual(self.client.get("/api/yo/").data["rol"], "DIRECTOR")
