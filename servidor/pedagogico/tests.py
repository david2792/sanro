from datetime import date

from rest_framework.test import APITestCase

from academico.models import (AnioLectivo, Asignacion, Curso, DiaNoLectivo, Etapa, Institucion, Materia,
                              Matricula, Nivel, Seccion)
from personas.models import Alumno, Docente, Usuario
from .models import Instrumento, PlanClase


class FlujoPedagogicoTest(APITestCase):
    def setUp(self):
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        self.u_otro = Usuario.objects.create_user("otro", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="1", nombres="Ana", apellidos="Gómez")
        Docente.objects.create(usuario=self.u_otro, ci="2", nombres="Luis", apellidos="Ruiz")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20),
                                          fecha_fin=date(2027, 12, 1), activo=True)
        self.etapa = Etapa.objects.create(anio_lectivo=anio, numero=1, nombre="Etapa",
                                          fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 7, 1))
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM"), grado=1, nombre="1° Curso")
        sec = Seccion.objects.create(anio_lectivo=anio, curso=curso)
        self.asig = Asignacion.objects.create(seccion=sec, materia=Materia.objects.create(nombre="Informática"),
                                              docente=doc)
        self.m = [Matricula.objects.create(alumno=Alumno.objects.create(ci=str(i), nombres="A", apellidos=f"X{i}"),
                                           seccion=sec, fecha=date(2027, 2, 20), numero_lista=i)
                  for i in (1, 2)]

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def test_flujo(self):
        self.login(self.u_doc)
        # 1. Unidad completa en un POST
        r = self.client.post("/api/unidades/", {
            "asignacion": self.asig.id, "etapa": self.etapa.id, "numero": 1, "titulo": "Hojas de cálculo",
            "competencia": "Utiliza herramientas informáticas...",
            "capacidades": [{"descripcion": "Aplica fórmulas", "indicadores": [
                {"descripcion": "Escribe fórmulas básicas"}, {"descripcion": "Usa referencias"}]}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        cap = r.data["capacidades"][0]
        ind1, ind2 = [i["id"] for i in cap["indicadores"]]

        # 2. Llama lista y registra lo desarrollado
        s = self.client.post("/api/sesiones/", {"asignacion": self.asig.id, "fecha": "2027-03-02",
                             "registros": [{"matricula": self.m[0].id, "estado": "P"}]}, format="json")
        rc = self.client.post("/api/registros-clase/", {
            "sesion": s.data["id"], "unidad": r.data["id"], "capacidades": [cap["id"]],
            "indicadores_evaluados": [ind1], "contenido": "Fórmulas SUMA y PROMEDIO"}, format="json")
        self.assertEqual(rc.status_code, 201, rc.data)

        # 3. Registro anecdótico
        an = self.client.post("/api/anecdoticos/", {
            "asignacion": self.asig.id, "alumnos": [self.m[1].id], "fecha": "2027-03-02",
            "tipo": "NEGATIVO", "hecho": "Usó el celular durante la prueba.",
            "acciones": "Se conversó con el alumno."}, format="json")
        self.assertEqual(an.status_code, 201, an.data)
        self.assertEqual(an.data["registrado_por"], self.u_doc.id)

        # 4. Trabajos con puntaje
        t1 = self.client.post("/api/instrumentos/", {
            "asignacion": self.asig.id, "etapa": self.etapa.id, "tipo": "PRACTICO", "titulo": "TP 1",
            "fecha": "2027-03-05", "puntaje_total": "10", "indicadores": [ind1, ind2]}, format="json")
        self.assertEqual(t1.status_code, 201, t1.data)
        t2 = self.client.post("/api/instrumentos/", {
            "asignacion": self.asig.id, "etapa": self.etapa.id, "tipo": "PRUEBA", "titulo": "Prueba 1",
            "fecha": "2027-03-10", "puntaje_total": "20"}, format="json")
        url = f"/api/instrumentos/{t1.data['id']}/puntajes/"
        malo = self.client.post(url, {"puntajes": [{"matricula": self.m[0].id, "puntaje": "11"}]}, format="json")
        self.assertEqual(malo.status_code, 400)
        print("excede:", malo.data)
        ok = self.client.post(url, {"puntajes": [{"matricula": self.m[0].id, "puntaje": "8"},
                                                 {"matricula": self.m[1].id, "puntaje": "5.5"}]}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.client.post(f"/api/instrumentos/{t2.data['id']}/puntajes/",
                         {"puntajes": [{"matricula": self.m[0].id, "puntaje": "18"}]}, format="json")
        pl = self.client.get(f"/api/planilla/?asignacion={self.asig.id}&etapa={self.etapa.id}").data
        print("planilla:", pl)
        self.assertEqual(pl["total_posible"], 30)
        self.assertEqual(pl["alumnos"][0]["porcentaje"], 86.7)  # 26/30

        # 5. Otro docente no ve ni modifica nada de esta materia
        self.login(self.u_otro)
        self.assertEqual(self.client.get("/api/unidades/").data["count"], 0)
        self.assertEqual(self.client.get("/api/anecdoticos/").data["count"], 0)
        self.assertEqual(self.client.post(url, {"puntajes": []}, format="json").status_code, 404)
        self.assertEqual(self.client.post("/api/instrumentos/", {
            "asignacion": self.asig.id, "etapa": self.etapa.id, "titulo": "x", "fecha": "2027-03-05",
            "puntaje_total": "5"}, format="json").status_code, 400)

        # 6. El director ve todo
        self.login(self.director)
        self.assertEqual(self.client.get(f"/api/anecdoticos/?alumnos__alumno={self.m[1].alumno_id}").data["count"], 1)
        self.assertEqual(self.client.get("/api/registros-clase/").data["count"], 1)


class RecuperatorioFrasesFichaTest(APITestCase):
    def setUp(self):
        from personas.models import AlumnoTutor, Tutor
        self.u_doc = Usuario.objects.create_user("profe4", password="x", rol="DOCENTE")
        self.u_otro = Usuario.objects.create_user("otro4", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="41", nombres="Ana", apellidos="Gómez")
        Docente.objects.create(usuario=self.u_otro, ci="42", nombres="Luis", apellidos="Ruiz")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 12, 1), activo=True)
        self.etapa = Etapa.objects.create(anio_lectivo=anio, numero=1, nombre="Etapa",
                                          fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 7, 1))
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM"), grado=1, nombre="1° Curso")
        sec = Seccion.objects.create(anio_lectivo=anio, curso=curso)
        self.asig = Asignacion.objects.create(seccion=sec, materia=Materia.objects.create(nombre="Química"), docente=doc)
        self.m = [Matricula.objects.create(alumno=Alumno.objects.create(ci=f"4{i}0", nombres="A", apellidos=f"X{i}"),
                                           seccion=sec, fecha=date(2027, 2, 20), numero_lista=i) for i in (1, 2)]
        tutor = Tutor.objects.create(ci="T1", nombres="Rosa", apellidos="Benítez", telefono="0981 123456")
        AlumnoTutor.objects.create(alumno=self.m[0].alumno, tutor=tutor, parentesco="Madre", es_principal=True)

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def test_recuperatorio_y_tardia(self):
        self.login(self.u_doc)
        t = self.client.post("/api/instrumentos/", {"asignacion": self.asig.id, "etapa": self.etapa.id, "titulo": "Prueba 1",
                             "tipo": "PRUEBA", "fecha": "2027-03-05", "puntaje_total": "10"}, format="json").data
        url = f"/api/instrumentos/{t['id']}/puntajes/"
        r = self.client.post(url, {"puntajes": [
            {"matricula": self.m[0].id, "puntaje": "4", "recuperatorio": "8"},
            {"matricula": self.m[1].id, "puntaje": "6", "entrega_tardia": True, "observacion": "Entregó el lunes"}]}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["alumnos"][0]["recuperatorio"], 8)
        # Guardar solo el puntaje no borra el recuperatorio ni la marca de tardía
        self.client.post(url, {"puntajes": [{"matricula": self.m[0].id, "puntaje": "5"},
                                            {"matricula": self.m[1].id, "puntaje": "7"}]}, format="json")
        pl = self.client.get(f"/api/planilla/?asignacion={self.asig.id}&etapa={self.etapa.id}").data
        self.assertEqual([a["puntajes"][0] for a in pl["alumnos"]], [8, 7])  # cuenta el mayor
        self.assertEqual([a["marcas"][0] for a in pl["alumnos"]], ["R", "T"])
        # El recuperatorio también respeta el total
        malo = self.client.post(url, {"puntajes": [{"matricula": self.m[0].id, "puntaje": "5", "recuperatorio": "11"}]}, format="json")
        self.assertEqual(malo.status_code, 400)
        self.assertEqual(self.client.get(f"/api/instrumentos/?asignacion={self.asig.id}").data["results"][0]["evaluados"], 2)

    def test_frases(self):
        self.login(self.u_doc)
        for fecha in ("2027-03-02", "2027-03-03", "2027-03-04"):
            s = self.client.post("/api/sesiones/", {"asignacion": self.asig.id, "fecha": fecha,
                                 "registros": [{"matricula": self.m[0].id, "estado": "P"}]}, format="json").data
            self.client.post("/api/registros-clase/", {"sesion": s["id"],
                             "actividades": "Trabajo en grupos. Experimento en el laboratorio\nPuesta en común"}, format="json")
        r = self.client.get("/api/frases/?campo=actividades").data
        self.assertEqual(r[:3], ["Trabajo en grupos.", "Experimento en el laboratorio", "Puesta en común"])
        self.assertIn("Lluvia de ideas.", r)  # completa con las frases base
        self.assertEqual(r.count("Trabajo en grupos."), 1)
        self.assertEqual(self.client.get("/api/frases/?campo=password").status_code, 400)
        # Cada docente ve solo sus frases
        self.login(self.u_otro)
        self.assertNotIn("Experimento en el laboratorio", self.client.get("/api/frases/?campo=actividades").data)

    def test_ficha(self):
        self.login(self.u_doc)
        for fecha, estado in (("2027-03-02", "P"), ("2027-03-03", "A"), ("2027-03-04", "T"), ("2027-03-05", "P")):
            self.client.post("/api/sesiones/", {"asignacion": self.asig.id, "fecha": fecha,
                             "registros": [{"matricula": self.m[0].id, "estado": estado}]}, format="json")
        t = self.client.post("/api/instrumentos/", {"asignacion": self.asig.id, "etapa": self.etapa.id, "titulo": "TP",
                             "fecha": "2027-03-05", "puntaje_total": "20"}, format="json").data
        # Fecha ya pasada: el que no lo entregó lo debe (un trabajo con fecha futura todavía no es pendiente).
        self.client.post("/api/instrumentos/", {"asignacion": self.asig.id, "etapa": self.etapa.id, "titulo": "Informe",
                         "fecha": "2020-03-06", "puntaje_total": "10"}, format="json")
        self.client.post(f"/api/instrumentos/{t['id']}/puntajes/", {"puntajes": [{"matricula": self.m[0].id, "puntaje": "15"}]}, format="json")
        self.client.post("/api/anecdoticos/", {"asignacion": self.asig.id, "alumnos": [self.m[0].id], "fecha": "2027-03-03",
                         "tipo": "POSITIVO", "hecho": "Ayudó a un compañero."}, format="json")

        url = f"/api/ficha/?asignacion={self.asig.id}&matricula={self.m[0].id}"
        f = self.client.get(url).data
        self.assertEqual(f["asistencia"]["materia"]["clases"], 4)
        self.assertEqual(f["asistencia"]["materia"]["porcentaje"], 75.0)  # tardanza cuenta como presente
        self.assertEqual(f["asistencia"]["ultimas_faltas"][0]["estado"], "A")
        self.assertEqual([(x["titulo"], x["pendiente"]) for x in f["trabajos"]], [("Informe", True), ("TP", False)])
        self.assertEqual(f["etapas"][0]["porcentaje"], 50.0)  # 15 de 30
        self.assertEqual(f["tutores"][0]["telefono"], "0981 123456")
        self.assertEqual(len(f["anecdoticos"]), 1)
        # Otro docente no puede ver la ficha de esta clase
        self.login(self.u_otro)
        self.assertEqual(self.client.get(url).status_code, 400)


class CopiarPlanificacionTest(APITestCase):
    def setUp(self):
        self.u_doc = Usuario.objects.create_user("profe3", password="x", rol="DOCENTE")
        self.u_otro = Usuario.objects.create_user("otro3", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="31", nombres="Ana", apellidos="Gómez")
        otro = Docente.objects.create(usuario=self.u_otro, ci="32", nombres="Luis", apellidos="Ruiz")
        viejo = AnioLectivo.objects.create(anio=2026, fecha_inicio=date(2026, 2, 20), fecha_fin=date(2026, 12, 1))
        nuevo = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 12, 1), activo=True)
        self.etapa_vieja = Etapa.objects.create(anio_lectivo=viejo, numero=2, nombre="Etapa",
                                                fecha_inicio=date(2026, 7, 1), fecha_fin=date(2026, 12, 1))
        self.etapa_nueva = Etapa.objects.create(anio_lectivo=nuevo, numero=2, nombre="Etapa",
                                                fecha_inicio=date(2027, 7, 1), fecha_fin=date(2027, 12, 1))
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM"), grado=2, nombre="2° Curso")
        mat = Materia.objects.create(nombre="Matemática")
        self.asig_vieja = Asignacion.objects.create(
            seccion=Seccion.objects.create(anio_lectivo=viejo, curso=curso, letra="A"), materia=mat, docente=doc)
        self.asig_a = Asignacion.objects.create(
            seccion=Seccion.objects.create(anio_lectivo=nuevo, curso=curso, letra="A"), materia=mat, docente=doc)
        self.asig_ajena = Asignacion.objects.create(
            seccion=Seccion.objects.create(anio_lectivo=nuevo, curso=curso, letra="B"), materia=mat, docente=otro)

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def unidad(self, asig, numero, etapa=None):
        return self.client.post("/api/unidades/", {
            "asignacion": asig.id, "etapa": etapa.id if etapa else None, "numero": numero,
            "titulo": f"Unidad {numero}", "competencia": "Resuelve problemas",
            "capacidades": [{"descripcion": "Cap 1", "indicadores": [{"descripcion": "I1"}, {"descripcion": "I2"}]},
                            {"descripcion": "Cap 2", "indicadores": [{"descripcion": "I3"}]}],
        }, format="json").data

    def test_copiar_del_anio_anterior(self):
        self.login(self.u_doc)
        u1 = self.unidad(self.asig_vieja, 1, self.etapa_vieja)
        u2 = self.unidad(self.asig_vieja, 2)
        self.unidad(self.asig_a, 1)  # el destino ya tiene una unidad 1

        org = self.client.get(f"/api/unidades/origenes/?asignacion={self.asig_a.id}").data
        self.assertEqual([g["asignacion"] for g in org], [self.asig_vieja.id])
        self.assertEqual(org[0]["unidades"][0]["indicadores"], 3)

        r = self.client.post("/api/unidades/copiar/", {"asignacion": self.asig_a.id, "unidades": [u1["id"], u2["id"]]},
                             format="json")
        self.assertEqual(r.status_code, 201, r.data)
        # La unidad 1 ya existía: la copia pasa a ser la 3; la 2 conserva su número.
        self.assertEqual(sorted(u["numero"] for u in r.data), [2, 3])
        copia1 = next(u for u in r.data if u["titulo"] == "Unidad 1")
        self.assertEqual(copia1["etapa"], self.etapa_nueva.id)
        self.assertEqual([len(c["indicadores"]) for c in copia1["capacidades"]], [2, 1])
        self.assertEqual(copia1["competencia"], "Resuelve problemas")
        # El original queda intacto
        self.assertEqual(self.client.get(f"/api/unidades/?asignacion={self.asig_vieja.id}").data["count"], 2)

    def test_no_copia_lo_ajeno(self):
        self.login(self.u_otro)
        ajena = self.unidad(self.asig_ajena, 1)
        self.login(self.u_doc)
        # No aparece entre los orígenes ni se puede copiar
        self.assertEqual(self.client.get(f"/api/unidades/origenes/?asignacion={self.asig_a.id}").data, [])
        r = self.client.post("/api/unidades/copiar/", {"asignacion": self.asig_a.id, "unidades": [ajena["id"]]}, format="json")
        self.assertEqual(r.status_code, 400)
        # Ni copiar hacia una clase que no es suya
        propia = self.unidad(self.asig_a, 1)
        r = self.client.post("/api/unidades/copiar/", {"asignacion": self.asig_ajena.id, "unidades": [propia["id"]]}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/unidades/copiar/", {"asignacion": self.asig_a.id, "unidades": []}, format="json")
        self.assertEqual(r.status_code, 400)


class LogroIndicadoresTest(APITestCase):
    def setUp(self):
        from academico.models import Institucion
        Institucion.objects.create(nombre="Colegio EMD San Roque González de Santacruz")
        self.u_doc = Usuario.objects.create_user("profe2", password="x", rol="DOCENTE")
        self.u_otro = Usuario.objects.create_user("otro2", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="11", nombres="David", apellidos="Espínola Benítez")
        Docente.objects.create(usuario=self.u_otro, ci="22", nombres="Luis", apellidos="Ruiz")
        anio = AnioLectivo.objects.create(anio=2026, fecha_inicio=date(2026, 2, 20), fecha_fin=date(2026, 12, 1), activo=True)
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM"), grado=2, nombre="2°")
        sec = Seccion.objects.create(anio_lectivo=anio, curso=curso, letra="A")
        self.asig = Asignacion.objects.create(seccion=sec, materia=Materia.objects.create(nombre="Gabinete Laboratorio"), docente=doc)
        self.m = [Matricula.objects.create(alumno=Alumno.objects.create(ci=str(100 + i), nombres="A", apellidos=f"X{i}"),
                                           seccion=sec, fecha=date(2026, 2, 20), numero_lista=i) for i in (1, 2)]

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def test_planilla(self):
        self.login(self.u_doc)
        u = self.client.post("/api/unidades/", {"asignacion": self.asig.id, "numero": 1, "titulo": "Laboratorio", "competencia": "C",
                             "capacidades": [{"descripcion": "Cap", "indicadores": [{"descripcion": f"I{k}"} for k in range(1, 5)]}]},
                             format="json").data
        ind = [i["id"] for i in u["capacidades"][0]["indicadores"]]
        url = f"/api/unidades/{u['id']}/logro/"
        marcas = [{"matricula": self.m[0].id, "indicador": i, "estado": e} for i, e in zip(ind, ["L", "L", "NL", "L"])]
        r = self.client.post(url, {"logros": marcas}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        a1 = r.data["alumnos"][0]
        self.assertEqual(a1["porcentaje"], 75.0)
        self.assertEqual(r.data["encabezado"]["area"], "Gabinete Laboratorio")
        # Corregir y borrar una marca
        r = self.client.post(url, {"logros": [{"matricula": self.m[0].id, "indicador": ind[2], "estado": "L"},
                                              {"matricula": self.m[0].id, "indicador": ind[3], "estado": None}]}, format="json")
        # L, L, L y una sin marcar: 3 puntos de 4 (sin marcar vale 0)
        self.assertEqual(r.data["alumnos"][0]["puntaje"], 3)
        self.assertEqual(r.data["alumnos"][0]["total"], 4)
        self.assertEqual(r.data["alumnos"][0]["porcentaje"], 75.0)
        self.assertEqual(r.data["alumnos"][0]["evaluados"], 3)
        # La unidad se suma a la planilla de puntajes de la materia: 4 puntos posibles
        pl = self.client.get(f"/api/planilla/?asignacion={self.asig.id}").data
        self.assertEqual(pl["total_posible"], 4)
        self.assertEqual(pl["trabajos"][-1]["titulo"], "Indicadores U1")
        self.assertEqual(pl["alumnos"][0]["logrado"], 3)
        self.assertIsNone(pl["alumnos"][1]["puntajes"][-1])  # alumno sin marcas
        self.assertEqual(r.data["por_indicador"][str(ind[0])]["logrados"], 1)
        # Indicador ajeno a la unidad
        self.assertEqual(self.client.post(url, {"logros": [{"matricula": self.m[0].id, "indicador": 9999, "estado": "L"}]}, format="json").status_code, 400)
        # Otro docente no la ve
        self.login(self.u_otro)
        self.assertEqual(self.client.get(url).status_code, 404)


import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PlanAnualTest(APITestCase):
    def setUp(self):
        self.director = Usuario.objects.create_user("dir3", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe3", password="x", rol="DOCENTE")
        self.u_otro = Usuario.objects.create_user("otro3", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="31", nombres="Ana", apellidos="Gómez")
        Docente.objects.create(usuario=self.u_otro, ci="32", nombres="Luis", apellidos="Ruiz")
        anio = AnioLectivo.objects.create(anio=2026, fecha_inicio=date(2026, 2, 20), fecha_fin=date(2026, 12, 1), activo=True)
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM3"), grado=1, nombre="1°")
        sec = Seccion.objects.create(anio_lectivo=anio, curso=curso, letra="A")
        self.asig = Asignacion.objects.create(seccion=sec, materia=Materia.objects.create(nombre="Química"), docente=doc)
        self.url = f"/api/plan-anual/{self.asig.id}/"

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def test_circuito(self):
        self.login(self.u_doc)
        self.assertEqual(self.client.get(self.url).data["estado"], "SIN_CARGAR")
        # No se puede enviar vacío
        self.assertEqual(self.client.post(self.url + "enviar/").status_code, 400)
        # Solo PDF
        mal = self.client.post(self.url + "archivo/", {"archivo": SimpleUploadedFile("plan.docx", b"x")}, format="multipart")
        self.assertEqual(mal.status_code, 400)
        r = self.client.post(self.url + "archivo/", {"archivo": SimpleUploadedFile("plan.pdf", b"%PDF-1.4 prueba",
                             content_type="application/pdf")}, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["archivo"].endswith(".pdf"))
        self.assertEqual(r.data["estado"], "BORRADOR")
        self.assertEqual(self.client.post(self.url + "enviar/").data["estado"], "ENVIADO")
        # El docente no puede aprobarse a sí mismo
        self.assertEqual(self.client.post(self.url + "revisar/", {"decision": "APROBADO"}).status_code, 400)
        # Otro docente no ve el plan
        self.login(self.u_otro)
        self.assertEqual(self.client.get(self.url).status_code, 400)
        # Dirección lo devuelve, el docente corrige y vuelve a enviar, dirección aprueba
        self.login(self.director)
        self.assertEqual(self.client.post(self.url + "revisar/", {"decision": "OBSERVADO"}).status_code, 400)  # sin motivo
        r = self.client.post(self.url + "revisar/", {"decision": "OBSERVADO", "observaciones": "Falta la evaluación"})
        self.assertEqual(r.data["estado"], "OBSERVADO")
        self.login(self.u_doc)
        self.client.post("/api/unidades/", {"asignacion": self.asig.id, "numero": 1, "titulo": "Materia y energía",
                         "fecha_inicio": "2026-03-02", "fecha_fin": "2026-04-10", "contenidos": "Estados de la materia",
                         "evaluacion": "Prueba escrita"}, format="json")
        self.assertEqual(self.client.post(self.url + "enviar/").data["estado"], "ENVIADO")
        self.login(self.director)
        r = self.client.post(self.url + "revisar/", {"decision": "APROBADO"})
        self.assertEqual(r.data["estado"], "APROBADO")
        self.assertEqual(r.data["unidades_completas"], 1)
        lista = self.client.get("/api/planes-anuales/").data
        self.assertEqual([p["estado"] for p in lista if p["asignacion"] == self.asig.id], ["APROBADO"])
        # Fechas al revés
        self.login(self.u_doc)
        malo = self.client.post("/api/unidades/", {"asignacion": self.asig.id, "numero": 2, "titulo": "X",
                                "fecha_inicio": "2026-05-10", "fecha_fin": "2026-05-01"}, format="json")
        self.assertEqual(malo.status_code, 400)


class PlanClaseTest(APITestCase):
    def setUp(self):
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        self.u_otro = Usuario.objects.create_user("otro", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="1", nombres="Ana", apellidos="Gómez")
        Docente.objects.create(usuario=self.u_otro, ci="2", nombres="Luis", apellidos="Ruiz")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20),
                                          fecha_fin=date(2027, 12, 1), activo=True)
        DiaNoLectivo.objects.create(anio_lectivo=anio, fecha=date(2027, 3, 10), motivo="Asueto")
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM"), grado=1, nombre="1° Curso")
        sec = Seccion.objects.create(anio_lectivo=anio, curso=curso)
        # Lunes y miércoles
        self.asig = Asignacion.objects.create(seccion=sec, materia=Materia.objects.create(nombre="Historia"),
                                              docente=doc, dias_clase=[1, 3])

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def fechas(self):
        return [(str(p.fecha), p.contenido) for p in PlanClase.objects.order_by("fecha")]

    def test_repartir_calendario_y_correr(self):
        self.login(self.u_doc)
        r = self.client.post("/api/planes-clase/repartir/", {
            "asignacion": self.asig.id, "desde": "2027-03-08", "temas": ["T1", "T2", " ", "T3"]}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        # El 10 es asueto: se salta.
        self.assertEqual(self.fechas(), [("2027-03-08", "T1"), ("2027-03-15", "T2"), ("2027-03-17", "T3")])

        r = self.client.post("/api/planes-clase/", {"asignacion": self.asig.id, "fecha": "2027-03-22",
                                                    "contenido": "T4"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client.post("/api/planes-clase/", {"asignacion": self.asig.id, "fecha": "2027-03-22"}, format="json")
        self.assertIn("Ya hay una clase", str(r.data))
        r = self.client.post("/api/planes-clase/", {"asignacion": self.asig.id, "fecha": "2028-03-22"}, format="json")
        self.assertIn("fuera del año lectivo", str(r.data))

        r = self.client.get(f"/api/planes-clase/calendario/?asignacion={self.asig.id}&mes=2027-03")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["resumen"], {"clases": 9, "planificadas": 4, "dictadas": 0})
        asueto = next(d for d in r.data["dias"] if str(d["fecha"]) == "2027-03-10")
        self.assertEqual((asueto["clase"], asueto["no_lectivo"]), (False, "Asueto"))

        # No se pudo dar la clase del 15: desde ahí todo avanza una clase.
        r = self.client.post("/api/planes-clase/correr/", {"asignacion": self.asig.id, "desde": "2027-03-15"},
                             format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.fechas(), [("2027-03-08", "T1"), ("2027-03-17", "T2"),
                                         ("2027-03-22", "T3"), ("2027-03-24", "T4")])

        # Otro docente no ve ni carga en esta clase.
        self.login(self.u_otro)
        self.assertEqual(self.client.get(f"/api/planes-clase/?asignacion={self.asig.id}").data["count"], 0)
        r = self.client.post("/api/planes-clase/", {"asignacion": self.asig.id, "fecha": "2027-04-05"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/planes-clase/correr/", {"asignacion": self.asig.id, "desde": "2027-03-01"},
                             format="json")
        self.assertEqual(r.status_code, 400)

    def test_control_de_direccion(self):
        self.login(self.u_doc)
        self.client.post("/api/planes-clase/repartir/", {
            "asignacion": self.asig.id, "desde": "2027-03-01", "temas": ["T1", "T2"]}, format="json")
        r = self.client.get("/api/planificacion/control/?mes=2027-03")
        self.assertEqual(r.status_code, 400)  # el docente no ve el control

        director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.login(director)
        r = self.client.get("/api/planificacion/control/?mes=2027-03")
        self.assertEqual(r.status_code, 200, r.data)
        fila = r.data["materias"][0]
        self.assertEqual((fila["estado"], fila["clases"], fila["planificadas"]), ("PARCIAL", 9, 2))
        self.assertEqual(str(fila["planificado_hasta"]), "2027-03-03")
        self.assertEqual(r.data["resumen"]["PARCIAL"], 1)
        # Dirección puede ver el calendario de la materia, con el encabezado para imprimir.
        r = self.client.get(f"/api/planes-clase/calendario/?asignacion={self.asig.id}&mes=2027-03")
        self.assertEqual(r.data["encabezado"]["materia"], "Historia")


class EvaluacionesSeccionTest(APITestCase):
    def setUp(self):
        self.u_a = Usuario.objects.create_user("ana", password="x", rol="DOCENTE")
        self.u_b = Usuario.objects.create_user("beto", password="x", rol="DOCENTE")
        self.u_c = Usuario.objects.create_user("caro", password="x", rol="DOCENTE")
        da = Docente.objects.create(usuario=self.u_a, ci="1", nombres="Ana", apellidos="Gómez")
        db = Docente.objects.create(usuario=self.u_b, ci="2", nombres="Beto", apellidos="Ruiz")
        Docente.objects.create(usuario=self.u_c, ci="3", nombres="Caro", apellidos="Paz")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20),
                                          fecha_fin=date(2027, 12, 1), activo=True)
        etapa = self.etapa = Etapa.objects.create(anio_lectivo=anio, numero=1, nombre="Etapa",
                                                  fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 7, 1))
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM"), grado=1, nombre="1° Curso")
        self.sec = Seccion.objects.create(anio_lectivo=anio, curso=curso)
        mat = self.mat = Asignacion.objects.create(seccion=self.sec, materia=Materia.objects.create(nombre="Matemática"), docente=da)
        his = Asignacion.objects.create(seccion=self.sec, materia=Materia.objects.create(nombre="Historia"), docente=db)
        for asig, titulo, dia in ((mat, "Prueba 1", 9), (his, "TP 1", 9), (his, "TP 2", 20)):
            Instrumento.objects.create(asignacion=asig, etapa=etapa, titulo=titulo, fecha=date(2027, 3, dia),
                                       puntaje_total=10, tipo="PRUEBA")

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def test_docente_ve_las_evaluaciones_de_todo_el_curso(self):
        url = f"/api/evaluaciones/?seccion={self.sec.id}&desde=2027-03-08&hasta=2027-03-13"
        self.login(self.u_a)
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual([(e["materia"], e["propia"]) for e in r.data["evaluaciones"]],
                         [("Historia", False), ("Matemática", True)])
        self.assertEqual((r.data["maximo_por_dia"], r.data["cuentan"]), (1, "PRUEBAS"))
        # Una docente que no da clase en la sección no las ve.
        self.login(self.u_c)
        self.assertEqual(self.client.get(url).status_code, 400)

    def test_maximo_de_pruebas_por_dia(self):
        inst = Institucion.objects.create(nombre="Colegio")  # por defecto: 1 prueba por día y se bloquea
        self.login(self.u_a)
        nueva = {"asignacion": self.mat.id, "etapa": self.etapa.id, "titulo": "Prueba 2",
                 "fecha": "2027-03-20", "puntaje_total": 10, "tipo": "PRUEBA"}
        r = self.client.post("/api/instrumentos/", nueva, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("ya tiene 1 prueba el 20/03 (Historia)", str(r.data))
        # Un trabajo práctico no cuenta como prueba.
        r = self.client.post("/api/instrumentos/", {**nueva, "tipo": "PRACTICO"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        # Editar un trabajo sin cambiar su día no se traba aunque el día ya esté lleno.
        r = self.client.patch(f"/api/instrumentos/{r.data['id']}/", {"titulo": "TP corregido"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        # Si dirección elige "solo avisar", se puede guardar.
        inst.bloquear_evaluaciones = False
        inst.save()
        r = self.client.post("/api/instrumentos/", nueva, format="json")
        self.assertEqual(r.status_code, 201, r.data)


class SugerenciasTest(APITestCase):
    def setUp(self):
        from asistencia.models import SesionClase
        from .models import RegistroClase, Unidad

        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        self.u_otro = Usuario.objects.create_user("otro", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="1", nombres="Ana", apellidos="Gómez")
        Docente.objects.create(usuario=self.u_otro, ci="2", nombres="Luis", apellidos="Ruiz")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20),
                                          fecha_fin=date(2027, 12, 1), activo=True)
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM"), grado=1, nombre="1° Curso")
        sec = Seccion.objects.create(anio_lectivo=anio, curso=curso)
        self.asig = Asignacion.objects.create(seccion=sec, materia=Materia.objects.create(nombre="Historia"), docente=doc)
        self.unidad = Unidad.objects.create(asignacion=self.asig, numero=1, titulo="La Colonia")
        sesion = SesionClase.objects.create(asignacion=self.asig, docente=doc, fecha=date(2027, 3, 1))
        self.registro = RegistroClase.objects.create(sesion=sesion, contenido="Tema 1")

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def test_direccion_sugiere_y_el_docente_lee(self):
        nueva = {"asignacion": self.asig.id, "sobre": "PLAN_ANUAL", "unidad": self.unidad.id,
                 "texto": "Agregá un indicador de evaluación oral."}
        self.login(self.u_doc)
        self.assertEqual(self.client.post("/api/sugerencias/", nueva, format="json").status_code, 400)

        self.login(self.director)
        r = self.client.post("/api/sugerencias/", nueva, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client.post("/api/sugerencias/", {**nueva, "sobre": "CLASE", "unidad": None}, format="json")
        self.assertIn("qué clase", str(r.data))
        r = self.client.post("/api/sugerencias/", {"asignacion": self.asig.id, "sobre": "CLASE",
                                                   "registro_clase": self.registro.id, "texto": "Buena clase."},
                             format="json")
        self.assertEqual(str(r.data["fecha_clase"]), "2027-03-01")
        # Dirección también puede corregir el desarrollo de la clase.
        r = self.client.patch(f"/api/registros-clase/{self.registro.id}/", {"contenido": "Tema 1 corregido"},
                              format="json")
        self.assertEqual(r.status_code, 200, r.data)

        self.login(self.u_doc)
        pendientes = self.client.get("/api/sugerencias/?leida=false").data["results"]
        self.assertEqual(len(pendientes), 2)
        r = self.client.post(f"/api/sugerencias/{pendientes[0]['id']}/leida/")
        self.assertTrue(r.data["leida"])
        self.assertEqual(self.client.get("/api/sugerencias/?leida=false").data["count"], 1)
        self.assertEqual(self.client.delete(f"/api/sugerencias/{pendientes[1]['id']}/").status_code, 400)

        self.login(self.u_otro)
        self.assertEqual(self.client.get("/api/sugerencias/").data["count"], 0)
