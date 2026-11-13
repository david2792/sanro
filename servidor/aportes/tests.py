"""Aportes voluntarios a la ACE (plan maestro 2.4, 2.5, 14.5 y 14.6; docs/decisiones/0011)."""
from datetime import date
from unittest import mock

from rest_framework.test import APITestCase

from academico.models import AnioLectivo, Curso, Matricula, Nivel, Seccion
from personas.models import Alumno, AlumnoTutor, Tutor, Usuario
from .letras import importe_en_letras, numero_a_letras
from .models import AsociacionACE, ConceptoAporte, Recibo


class Base(APITestCase):
    def setUp(self):
        hoy = date.today()
        self.aces = Usuario.objects.create_user("aces", password="x", rol="ACES")
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.secretaria = Usuario.objects.create_user("secre", password="x", rol="SECRETARIA")
        self.anio = AnioLectivo.objects.create(anio=hoy.year, fecha_inicio=date(hoy.year, 1, 1),
                                               fecha_fin=date(hoy.year, 12, 31), estado="ACTIVO", activo=True)
        sec = Seccion.objects.create(anio_lectivo=self.anio, curso=Curso.objects.create(
            nivel=Nivel.objects.create(nombre="EM"), grado=1, nombre="1° Curso"))
        alumno = Alumno.objects.create(ci="111", nombres="Lucía", apellidos="Benítez")
        self.mat = Matricula.objects.create(alumno=alumno, seccion=sec, fecha=date(hoy.year, 1, 1))
        Matricula.objects.create(alumno=Alumno.objects.create(ci="222", nombres="Mateo", apellidos="Ruiz"),
                                 seccion=sec, fecha=date(hoy.year, 1, 1))
        self.tutor = Tutor.objects.create(ci="999", nombres="Rosa", apellidos="Benítez")
        AlumnoTutor.objects.create(alumno=alumno, tutor=self.tutor, parentesco="Madre", es_principal=True)
        self.login(self.aces)
        self.assertEqual(self.client.put("/api/aportes/ace/", {"denominacion": "ACE Colegio San Roque",
                                                                "ruc": "80000000-1"}).status_code, 200)
        self.social = self.client.post("/api/aportes/conceptos/", {
            "nombre": "Aporte social", "tipo": "APORTE_SOCIAL", "monto_sugerido": 50000}, format="json").data["id"]
        self.especie = self.client.post("/api/aportes/conceptos/", {
            "nombre": "Donaciones en especie", "tipo": "DONACION_ESPECIE"}, format="json").data["id"]

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def emitir(self, monto=30000, **extra):
        datos = {"fecha": date.today().isoformat(), "aportante_nombre": "Rosa Benítez", "medio": "EFECTIVO",
                 "lineas": [{"concepto": self.social, "monto": monto}], **extra}
        return self.client.post("/api/aportes/recibos/", datos, format="json")


class RecibosTest(Base):
    def test_emitir_recibo_correlativo_con_letras_y_verificacion(self):
        r1 = self.emitir(30000, tutor=self.tutor.id, matricula=self.mat.id, aportante_documento="999")
        self.assertEqual(r1.status_code, 201, r1.data)
        self.assertEqual((r1.data["serie"], r1.data["numero"], r1.data["ejercicio"]), ("A", 1, self.anio.anio))
        self.assertEqual(r1.data["importe_letras"], "Treinta mil guaraníes")
        self.assertEqual(len(r1.data["codigo_verificacion"]), 10)
        self.assertIn("No válido como factura", r1.data["leyenda"])
        self.assertEqual(r1.data["ace_nombre"], "ACE Colegio San Roque")
        self.assertEqual(self.emitir(15000).data["numero"], 2)
        self.assertEqual(self.emitir(1000, serie="B").data["numero"], 1)  # cada serie tiene su correlativo

    def test_monto_libre_aunque_haya_sugerido(self):
        self.assertEqual(self.emitir(5000).status_code, 201)  # menos que lo sugerido: es voluntario
        self.assertEqual(self.emitir(0).status_code, 400)

    def test_donacion_en_especie(self):
        sin = self.emitir(lineas=[{"concepto": self.especie, "monto": 0}])
        self.assertEqual(sin.status_code, 400)  # hay que describir qué se donó
        r = self.emitir(lineas=[{"concepto": self.especie, "monto": 0, "descripcion": "2 resmas de papel"}],
                        medio="ESPECIE")
        self.assertEqual((r.status_code, r.data["total"]), (201, 0))

    def test_no_se_edita_ni_se_borra_se_anula_o_revierte(self):
        r = self.emitir().data
        url = f"/api/aportes/recibos/{r['id']}/"
        self.assertEqual(self.client.patch(url, {"aportante_nombre": "Otro"}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(url).status_code, 405)
        self.assertEqual(self.client.post(url + "anular/").status_code, 400)  # sin motivo
        a = self.client.post(url + "anular/", {"motivo": "Se cargó a otra familia"})
        self.assertEqual((a.data["estado"], a.data["numero"]), ("ANULADO", 1))
        self.assertEqual(self.client.post(url + "revertir/", {"motivo": "x"}).status_code, 400)  # ya cerrado
        self.assertEqual(self.emitir().data["numero"], 2)  # el número anulado no se reutiliza
        t = self.emitir(medio="TRANSFERENCIA").data
        rev = self.client.post(f"/api/aportes/recibos/{t['id']}/revertir/", {"motivo": "La transferencia no se acreditó"})
        self.assertEqual(rev.data["estado"], "REVERTIDO")

    def test_panel_y_rendicion_solo_cuentan_lo_vigente(self):
        self.emitir(30000)
        anulado = self.emitir(10000).data
        self.client.post(f"/api/aportes/recibos/{anulado['id']}/anular/", {"motivo": "Error"})
        p = self.client.get("/api/aportes/panel/").data
        self.assertEqual((p["total"], p["recibos"], p["anulados_o_revertidos"]["monto"]), (30000, 1, 10000))
        self.assertEqual(p["por_concepto"][0]["concepto"], "Aporte social")
        r = self.client.get("/api/aportes/reportes/recaudacion/").data
        self.assertEqual(r["total"], 30000)
        self.assertEqual([x["estado"] for x in r["recibos"]], ["EMITIDO", "ANULADO"])


class PrincipiosTest(Base):
    def test_sin_deuda_morosos_ni_planillas_por_seccion(self):
        for ruta in ("/api/aportes/reportes/morosos/", "/api/aportes/secciones/", "/api/aportes/exoneraciones/",
                     "/api/aportes/pagos/"):
            self.assertEqual(self.client.get(ruta).status_code, 404, ruta)
        # Nada en las respuestas habla de deuda ni vencimientos.
        self.emitir()
        texto = str(self.client.get("/api/aportes/panel/").data) + str(self.client.get("/api/aportes/recibos/").data)
        for palabra in ("deuda", "moroso", "vencid", "saldo", "exoner"):
            self.assertNotIn(palabra, texto.lower())

    def test_buscar_familia_no_revela_quien_aporto(self):
        self.emitir(matricula=self.mat.id)
        r = self.client.get("/api/aportes/familias/?q=Ben").data
        self.assertEqual(r[0]["tutores"][0]["nombre"], "Rosa Benítez")
        self.assertEqual(set(r[0]), {"matricula", "alumno", "seccion", "tutores"})
        self.assertEqual(self.client.get("/api/aportes/familias/?q=Be").data, [])  # mínimo 3 letras

    def test_la_ace_opera_la_direccion_solo_consulta(self):
        self.login(self.director)
        self.assertEqual(self.client.get("/api/aportes/panel/").status_code, 200)
        self.assertEqual(self.emitir().status_code, 403)
        self.login(self.secretaria)
        self.assertEqual(self.client.get("/api/aportes/panel/").status_code, 403)

    def test_matricular_no_depende_de_aportes(self):
        self.login(self.director)
        nuevo = Alumno.objects.create(ci="333", nombres="Sofía", apellidos="Ramos")
        r = self.client.post("/api/matriculas/", {"alumno": nuevo.id, "seccion": self.mat.seccion_id,
                                                  "fecha": date.today().isoformat()})
        self.assertEqual(r.status_code, 201, r.data)


class LetrasTest(APITestCase):
    def test_numeros(self):
        casos = {1: "un", 21: "veintiún", 100: "cien", 101: "ciento un", 1000: "mil", 15000: "quince mil",
                 200000: "doscientos mil", 1_000_000: "un millón", 2_350_500: "dos millones trescientos cincuenta mil quinientos"}
        for n, texto in casos.items():
            self.assertEqual(numero_a_letras(n), texto)
        self.assertEqual(importe_en_letras(1_000_000), "Un millón de guaraníes")

    def test_codigo_cambia_si_cambia_el_monto(self):
        from .verificacion import codigo_verificacion

        with mock.patch("django.conf.settings.SECRET_KEY", "clave"):
            self.assertNotEqual(codigo_verificacion(1, "A", 2026, 5, 1000), codigo_verificacion(1, "A", 2026, 5, 10000))
