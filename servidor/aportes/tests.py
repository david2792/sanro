from datetime import date

from rest_framework.test import APITestCase

from academico.models import AnioLectivo, Asignacion, Curso, Materia, Matricula, Nivel, Seccion
from asistencia.models import RegistroAsistencia, SesionClase
from personas.models import Alumno, Docente, Usuario


class AportesTest(APITestCase):
    def setUp(self):
        hoy = date.today()
        self.mes = hoy.month
        self.aces = Usuario.objects.create_user("aces", password="x", rol="ACES")
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="9", nombres="Ana", apellidos="Gómez")
        self.anio = AnioLectivo.objects.create(anio=hoy.year, fecha_inicio=date(hoy.year, 1, 1),
                                               fecha_fin=date(hoy.year, 12, 31), activo=True)
        nivel = Nivel.objects.create(nombre="EM")
        self.curso = Curso.objects.create(nivel=nivel, grado=1, nombre="1° Curso")
        self.otro_curso = Curso.objects.create(nivel=nivel, grado=3, nombre="3° Curso")
        self.sec = Seccion.objects.create(anio_lectivo=self.anio, curso=self.curso)
        self.m = [Matricula.objects.create(
            alumno=Alumno.objects.create(ci=str(i), nombres="A", apellidos=f"X{i}"),
            seccion=self.sec, fecha=date(hoy.year, 1, 1), numero_lista=i) for i in (1, 2, 3)]
        self.asig = Asignacion.objects.create(seccion=self.sec, materia=Materia.objects.create(nombre="Mate"), docente=doc)

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def pagar(self, matricula, concepto, monto, mes=None):
        return self.client.post("/api/aportes/pagos/", {
            "matricula": matricula.id, "fecha": date.today().isoformat(), "medio": "EFECTIVO",
            "detalles": [{"concepto": concepto, "mes": mes, "monto": monto}]}, format="json")

    def test_permisos(self):
        self.login(self.aces)
        self.assertEqual(self.client.get("/api/alumnos/").status_code, 403)
        self.assertEqual(self.client.get("/api/reportes/panel/").status_code, 403)
        self.assertEqual(self.client.get("/api/reportes/ausencias/").status_code, 403)
        self.assertEqual(self.client.get("/api/aportes/panel/").status_code, 200)
        self.login(self.u_doc)
        self.assertEqual(self.client.get("/api/aportes/panel/").status_code, 403)
        self.assertEqual(self.client.get("/api/aportes/pagos/").status_code, 403)

    def test_flujo_aportes(self):
        self.login(self.aces)
        # Cuota mensual de un solo mes (el actual, vencida el día 1) para todos los cursos.
        c = self.client.post("/api/aportes/conceptos/", {
            "nombre": "Cuota", "periodicidad": "MENSUAL", "monto": 20000,
            "mes_inicio": self.mes, "mes_fin": self.mes, "dia_vencimiento": 1}, format="json")
        self.assertEqual(c.status_code, 201, c.data)
        self.assertEqual(c.data["anio_lectivo"], self.anio.id)
        cid = c.data["id"]
        # Un concepto de otro curso no le corresponde a esta sección.
        g = self.client.post("/api/aportes/conceptos/", {
            "nombre": "Graduación", "periodicidad": "UNICO", "monto": 50000, "cursos": [self.otro_curso.id]},
            format="json")
        self.assertEqual(g.status_code, 201, g.data)
        self.assertEqual(self.pagar(self.m[0], g.data["id"], 50000).status_code, 400)

        r1 = self.pagar(self.m[0], cid, 20000, self.mes)
        self.assertEqual(r1.status_code, 201, r1.data)
        self.assertEqual(r1.data["numero"], 1)
        self.assertEqual(r1.data["total"], 20000)
        self.assertEqual(self.pagar(self.m[0], cid, 1000, self.mes).status_code, 400)  # ya pagada
        self.assertEqual(self.pagar(self.m[1], cid, 5000).status_code, 400)  # falta el mes
        r2 = self.pagar(self.m[1], cid, 5000, self.mes)  # pago parcial
        self.assertEqual(r2.data["numero"], 2)
        e = self.client.post("/api/aportes/exoneraciones/", {"matricula": self.m[2].id, "concepto": cid,
                                                             "motivo": "Hermanos"}, format="json")
        self.assertEqual(e.status_code, 201, e.data)
        self.assertEqual(self.pagar(self.m[2], cid, 20000, self.mes).status_code, 400)  # exonerado

        sec = self.client.get(f"/api/aportes/secciones/{self.sec.id}/").data
        estados = {a["matricula"]: (a["estado"], a["deuda"]) for a in sec["alumnos"]}
        self.assertEqual(estados[self.m[0].id], ("AL_DIA", 0))
        self.assertEqual(estados[self.m[1].id], ("CON_DEUDA", 15000))
        self.assertEqual(estados[self.m[2].id], ("EXONERADO", 0))
        self.assertEqual([x["etiqueta"] for x in sec["columnas"]], [sec["alumnos"][0]["cuotas"][0]["etiqueta"]])

        t = self.client.get("/api/aportes/panel/").data["totales"]
        self.assertEqual((t["recaudado"], t["exigible"], t["deuda"], t["cumplimiento"]), (25000, 40000, 15000, 62.5))

        # No se puede bajar el monto por debajo de lo ya cobrado.
        self.assertEqual(self.client.patch(f"/api/aportes/conceptos/{cid}/", {"monto": 10000}, format="json").status_code, 400)
        # Un recibo no se borra: se anula, y la cuota vuelve a quedar pendiente.
        self.assertEqual(self.client.delete(f"/api/aportes/pagos/{r1.data['id']}/").status_code, 405)
        self.assertEqual(self.client.post(f"/api/aportes/pagos/{r1.data['id']}/anular/", {}).status_code, 400)
        an = self.client.post(f"/api/aportes/pagos/{r1.data['id']}/anular/", {"motivo": "Error de carga"})
        self.assertTrue(an.data["anulado"])
        morosos = self.client.get("/api/aportes/reportes/morosos/").data
        self.assertEqual({a["matricula"] for a in morosos["alumnos"]}, {self.m[0].id, self.m[1].id})
        self.assertEqual(self.pagar(self.m[0], cid, 20000, self.mes).data["numero"], 3)

        rep = self.client.get("/api/aportes/reportes/recaudacion/").data
        self.assertEqual(rep["total"], 25000)
        self.assertEqual(rep["anulados"], {"cantidad": 1, "monto": 20000})
        self.assertEqual(len(rep["recibos"]), 3)

    def test_monto_total_en_partes(self):
        """Aporte de Gs. 200.000 que la familia va pagando de a poco."""
        self.login(self.aces)
        c = self.client.post("/api/aportes/conceptos/", {"nombre": "Aporte anual", "monto": 200000}, format="json")
        self.assertEqual(c.status_code, 201, c.data)
        self.assertEqual(c.data["periodicidad"], "UNICO")
        cid = c.data["id"]
        self.assertEqual(self.pagar(self.m[0], cid, 50000).status_code, 201)
        self.assertEqual(self.pagar(self.m[0], cid, 80000).status_code, 201)
        a = next(x for x in self.client.get(f"/api/aportes/secciones/{self.sec.id}/").data["alumnos"]
                 if x["matricula"] == self.m[0].id)
        # Vence a fin de año: pagó una parte, todavía no debe nada vencido.
        self.assertEqual((a["cuotas"][0]["estado"], a["pagado"], a["saldo"], a["deuda"], a["estado"], a["avance"]),
                         ("PARCIAL", 130000, 70000, 0, "AL_DIA", "PARCIAL"))
        self.assertEqual(a["porcentaje_pagado"], 65.0)
        excede = self.pagar(self.m[0], cid, 80000)
        self.assertEqual(excede.status_code, 400)
        self.assertIn("Gs. 70.000", str(excede.data))
        self.assertEqual(self.pagar(self.m[0], cid, 70000).status_code, 201)
        t = self.client.get("/api/aportes/panel/").data
        self.assertEqual(t["totales"]["recaudado"], 200000)
        self.assertEqual(t["cuotas"][0]["pagado"], 1)
        # 3 alumnos x 200.000 = 600.000 esperados; se cobraron 200.000.
        self.assertEqual((t["totales"]["total_anual"], t["totales"]["porcentaje_pagado"]), (600000, 33.3))
        self.assertEqual((t["familias"]["completos"], t["familias"]["sin_pagos"]), (1, 2))

    def test_reporte_ausencias(self):
        hoy = date.today()
        s = SesionClase.objects.create(asignacion=self.asig, docente=self.asig.docente, fecha=hoy)
        for m, est in zip(self.m, "PAJ"):
            RegistroAsistencia.objects.create(sesion=s, matricula=m, estado=est)
        self.login(self.director)
        r = self.client.get("/api/reportes/ausencias/")
        self.assertEqual(r.status_code, 200, r.data)
        fila = r.data["secciones"][0]
        self.assertEqual((fila["registros"], fila["ausentes"], fila["justificadas"]), (3, 1, 1))
        self.assertEqual(fila["inasistencia"], 66.7)
        self.assertEqual(r.data["cursos"][0]["inasistencia"], 66.7)
        self.assertEqual(r.data["alumnos"][0]["matricula"], self.m[1].id)
        self.assertEqual(self.client.get("/api/reportes/ausencias/?desde=xx").status_code, 400)
