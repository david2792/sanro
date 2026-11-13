from datetime import date

from rest_framework.test import APITestCase

from academico.models import Institucion
from personas.models import Usuario
from .models import FuenteNormativa, ReglaNormativa, VersionRegla
from .servicios import ReglaNoDefinida, resolver_regla


class Base(APITestCase):
    def setUp(self):
        self.inst = Institucion.objects.create(nombre="Colegio A")
        self.otra = Institucion.objects.create(nombre="Colegio B")
        self.root = Usuario.objects.create_superuser("root", password="x", institucion=None)
        self.director = Usuario.objects.create_user("dir", password="x", rol="DIRECTOR", institucion=self.inst)
        self.docente = Usuario.objects.create_user("doc", password="x", rol="DOCENTE", institucion=self.inst)
        self.fuente = FuenteNormativa.objects.get(numero="1525/2014")
        self.regla = ReglaNormativa.objects.create(codigo="prueba_exigencia", nombre="Exigencia de prueba",
                                                   area="EVALUACION", tipo_valor="PORCENTAJE")

    def login(self, user):
        r = self.client.post("/api/auth/token/", {"username": user.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def version(self, valor, **extra):
        datos = {"regla": self.regla, "version": VersionRegla.objects.filter(regla=self.regla).count() + 1,
                 "valor": valor, "fuente": self.fuente, "vigente_desde": date(2026, 1, 1),
                 "estado": VersionRegla.Estado.APROBADA, **extra}
        return VersionRegla.objects.create(**datos)


class ResolverTest(Base):
    def test_sin_version_aprobada_no_inventa_valor(self):
        with self.assertRaises(ReglaNoDefinida):
            resolver_regla("PRUEBA_EXIGENCIA", institucion=self.inst)
        self.version(70, estado=VersionRegla.Estado.BORRADOR)
        with self.assertRaises(ReglaNoDefinida):
            resolver_regla("PRUEBA_EXIGENCIA", institucion=self.inst)

    def test_gana_el_alcance_mas_especifico(self):
        general = self.version(70)
        propia = self.version(65, institucion=self.inst)
        media = self.version(60, institucion=self.inst, nivel="EM")
        self.assertEqual(resolver_regla("prueba_exigencia", institucion=self.otra), general)
        self.assertEqual(resolver_regla("prueba_exigencia", institucion=self.inst), propia)
        self.assertEqual(resolver_regla("prueba_exigencia", institucion=self.inst, nivel="EEB_3"), propia)
        self.assertEqual(resolver_regla("prueba_exigencia", institucion=self.inst, nivel="EM"), media)

    def test_respeta_la_vigencia(self):
        vieja = self.version(70, vigente_desde=date(2020, 1, 1), vigente_hasta=date(2025, 12, 31))
        nueva = self.version(75, vigente_desde=date(2026, 1, 1))
        self.assertEqual(resolver_regla("PRUEBA_EXIGENCIA", fecha=date(2024, 6, 1)), vieja)
        self.assertEqual(resolver_regla("PRUEBA_EXIGENCIA", fecha=date(2026, 6, 1)), nueva)
        with self.assertRaises(ReglaNoDefinida):
            resolver_regla("PRUEBA_EXIGENCIA", fecha=date(2019, 6, 1))

    def test_fuentes_del_plan_cargadas_como_pendientes(self):
        generales = FuenteNormativa.objects.filter(institucion__isnull=True)
        self.assertGreaterEqual(generales.count(), 11)
        self.assertFalse(generales.exclude(verificacion="PENDIENTE").exists())
        self.assertFalse(VersionRegla.objects.exclude(regla=self.regla).exists())  # ningún valor precargado


class ApiTest(Base):
    def crear(self, **datos):
        base = {"regla": self.regla.id, "valor": 70, "fuente": self.fuente.id, "vigente_desde": "2026-01-01"}
        return self.client.post("/api/normativa/versiones/", {**base, **datos}, format="json")

    def test_flujo_borrador_aprobacion_y_sustitucion(self):
        self.login(self.director)
        r = self.crear()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["version"], r.data["estado"], r.data["institucion"]), (1, "BORRADOR", self.inst.id))
        vid = r.data["id"]

        # No se aprueba por PATCH, sino con la acción (que registra quién y cuándo).
        self.assertEqual(self.client.patch(f"/api/normativa/versiones/{vid}/", {"estado": "APROBADA"}).status_code, 400)
        ap = self.client.post(f"/api/normativa/versiones/{vid}/aprobar/")
        self.assertEqual(ap.status_code, 200, ap.data)
        self.assertEqual((ap.data["estado"], ap.data["aprobada_por"]), ("APROBADA", self.director.id))

        res = self.client.get("/api/normativa/resolver/?codigo=PRUEBA_EXIGENCIA")
        self.assertEqual((res.status_code, res.data["valor"]), (200, 70))

        # Aprobada: no se cambia el valor ni se borra; solo se sustituye o deroga.
        self.assertEqual(self.client.patch(f"/api/normativa/versiones/{vid}/", {"valor": 80}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(f"/api/normativa/versiones/{vid}/").status_code, 400)
        su = self.client.patch(f"/api/normativa/versiones/{vid}/", {"estado": "SUSTITUIDA", "vigente_hasta": "2026-12-31"},
                               format="json")
        self.assertEqual(su.status_code, 200, su.data)
        self.assertEqual(self.client.get("/api/normativa/resolver/?codigo=PRUEBA_EXIGENCIA").status_code, 404)

    def test_validaciones(self):
        self.login(self.director)
        self.assertEqual(self.crear(valor=120).status_code, 400)  # porcentaje fuera de rango
        self.assertEqual(self.crear(valor="setenta").status_code, 400)
        self.assertEqual(self.crear(vigente_hasta="2025-01-01").status_code, 400)
        sin_fuente = self.crear(fuente=None)
        self.assertEqual(sin_fuente.status_code, 201)
        self.assertEqual(self.client.post(f"/api/normativa/versiones/{sin_fuente.data['id']}/aprobar/").status_code, 400)

    def test_permisos(self):
        general = self.version(70, institucion=None, estado=VersionRegla.Estado.BORRADOR)
        self.login(self.docente)
        self.assertEqual(self.client.get("/api/normativa/versiones/").status_code, 200)
        self.assertEqual(self.crear().status_code, 403)
        self.login(self.director)
        # La norma general la ve, pero no la modifica ni la aprueba.
        self.assertEqual(self.client.patch(f"/api/normativa/versiones/{general.id}/", {"valor": 50},
                                           format="json").status_code, 403)
        self.assertEqual(self.client.post(f"/api/normativa/versiones/{general.id}/aprobar/").status_code, 400)
        self.assertEqual(self.client.post("/api/normativa/reglas/", {"codigo": "X", "nombre": "X", "area": "OTRA",
                                                                      "tipo_valor": "TEXTO"}).status_code, 403)
        self.login(self.root)
        self.assertEqual(self.client.post(f"/api/normativa/versiones/{general.id}/aprobar/").status_code, 200)

    def test_cambios_quedan_auditados(self):
        from nucleo.models import RegistroAuditoria

        self.login(self.director)
        vid = self.crear().data["id"]
        self.client.post(f"/api/normativa/versiones/{vid}/aprobar/")
        cambio = RegistroAuditoria.objects.get(modelo="normativa.versionregla", accion="MODIFICAR", objeto_id=str(vid))
        self.assertEqual(cambio.cambios["estado"], ["BORRADOR", "APROBADA"])
        self.assertEqual(cambio.usuario, self.director)
