from rest_framework.test import APITestCase

from .models import Docente, Usuario


class AccesoDocenteTest(APITestCase):
    """El director crea al docente y, en el mismo paso, su usuario y contraseña."""

    def setUp(self):
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.client.force_authenticate(self.director)

    def entrar(self, username, password):
        return self.client.post("/api/auth/token/", {"username": username, "password": password})

    def test_crear_docente_con_acceso(self):
        r = self.client.post("/api/docentes/", {
            "ci": "4567890", "nombres": "Ana", "apellidos": "Gómez", "activo": True,
            "username": "agomez", "password": "Pizarron.2027"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["username"], "agomez")
        self.assertNotIn("password", r.data)
        u = Usuario.objects.get(username="agomez")
        self.assertEqual((u.rol, u.first_name, u.ci, u.docente.id), ("DOCENTE", "Ana", "4567890", r.data["id"]))

        # El docente ya puede entrar y la app lo reconoce como docente.
        self.client.force_authenticate(None)
        tok = self.entrar("agomez", "Pizarron.2027")
        self.assertEqual(tok.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + tok.data["access"])
        self.assertEqual(self.client.get("/api/yo/").data["docente_id"], r.data["id"])

    def test_usuario_por_defecto_es_la_ci_y_cambio_de_clave(self):
        r = self.client.post("/api/docentes/", {"ci": "1234567", "nombres": "Luis", "apellidos": "Ruiz",
                                                "password": "Cuaderno.2027"}, format="json")
        self.assertEqual(r.data["username"], "1234567")
        # Editar sin contraseña no la cambia; con contraseña nueva, sí.
        self.client.patch(f"/api/docentes/{r.data['id']}/", {"telefono": "0981"}, format="json")
        self.assertEqual(self.entrar("1234567", "Cuaderno.2027").status_code, 200)
        self.client.patch(f"/api/docentes/{r.data['id']}/", {"password": "Tiza.Nueva.99"}, format="json")
        self.assertEqual(self.entrar("1234567", "Tiza.Nueva.99").status_code, 200)
        # Dar de baja al docente le quita el acceso.
        self.client.patch(f"/api/docentes/{r.data['id']}/", {"activo": False}, format="json")
        self.assertEqual(self.entrar("1234567", "Tiza.Nueva.99").status_code, 401)

    def test_validaciones(self):
        Usuario.objects.create_user("ocupado", password="x")
        base = {"ci": "111", "nombres": "A", "apellidos": "B"}
        r = self.client.post("/api/docentes/", {**base, "username": "ocupado", "password": "Pizarron.2027"}, format="json")
        self.assertIn("username", r.data)
        r = self.client.post("/api/docentes/", {**base, "username": "nuevo"}, format="json")
        self.assertIn("password", r.data)  # falta la contraseña
        r = self.client.post("/api/docentes/", {**base, "username": "nuevo", "password": "123"}, format="json")
        self.assertIn("password", r.data)  # contraseña débil
        self.assertFalse(Docente.objects.exists())
        # Sin usuario ni contraseña se crea el docente sin acceso.
        r = self.client.post("/api/docentes/", base, format="json")
        self.assertEqual((r.status_code, r.data["username"]), (201, None))
        # Así lo reenvía el formulario al editar un docente sin acceso: sigue sin acceso.
        e = self.client.patch(f"/api/docentes/{r.data['id']}/", {"username": None, "password": None, "titulo": "Lic."}, format="json")
        self.assertEqual((e.status_code, e.data["username"]), (200, None))

    def test_docente_no_crea_docentes(self):
        profe = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        self.client.force_authenticate(profe)
        r = self.client.post("/api/docentes/", {"ci": "9", "nombres": "X", "apellidos": "Y",
                                                "username": "x", "password": "Pizarron.2027"}, format="json")
        self.assertEqual(r.status_code, 403)
