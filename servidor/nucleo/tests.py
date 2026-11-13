import shutil
import tempfile
import time
from unittest import mock

from django.core.exceptions import PermissionDenied
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from academico.models import Materia
from personas.models import Alumno, Usuario
from .models import RegistroAuditoria


class Base(APITestCase):
    def setUp(self):
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.docente = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")

    def login(self, user):
        r = self.client.post("/api/auth/token/", {"username": user.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])


class AuditoriaTest(Base):
    def test_alta_y_cambio_quedan_registrados_con_usuario_y_motivo(self):
        self.login(self.director)
        r = self.client.post("/api/materias/", {"nombre": "Informática", "abreviatura": "INF"})
        self.assertEqual(r.status_code, 201, r.data)
        alta = RegistroAuditoria.objects.get(modelo="academico.materia", accion="CREAR")
        self.assertEqual(alta.usuario, self.director)
        self.assertEqual(alta.objeto_id, str(r.data["id"]))
        self.assertEqual(alta.cambios["nombre"], [None, "Informática"])

        self.client.patch(f"/api/materias/{r.data['id']}/", {"abreviatura": "INFO"},
                          HTTP_X_MOTIVO="Corrección pedida por coordinación")
        cambio = RegistroAuditoria.objects.get(modelo="academico.materia", accion="MODIFICAR")
        self.assertEqual(cambio.cambios, {"abreviatura": ["INF", "INFO"]})
        self.assertEqual(cambio.motivo, "Corrección pedida por coordinación")
        self.assertEqual(cambio.usuario_nombre, "director")

    def test_guardar_sin_cambios_no_registra_y_borrar_si(self):
        m = Materia.objects.create(nombre="Música")
        m.save()
        self.assertEqual(RegistroAuditoria.objects.filter(modelo="academico.materia").count(), 1)
        m.delete()
        baja = RegistroAuditoria.objects.get(modelo="academico.materia", accion="ELIMINAR")
        self.assertEqual(baja.cambios["nombre"], ["Música", None])
        self.assertIsNone(baja.usuario)  # cambio hecho por el sistema, no por una persona

    def test_no_guarda_contrasenas(self):
        Usuario.objects.create_user("nuevo", password="Secreta.2027")
        alta = RegistroAuditoria.objects.get(modelo="personas.usuario", objeto_id=str(Usuario.objects.get(username="nuevo").pk))
        self.assertNotIn("password", alta.cambios)

    def test_registro_inmutable(self):
        Materia.objects.create(nombre="Arte")
        reg = RegistroAuditoria.objects.first()
        reg.motivo = "otro"
        with self.assertRaises(PermissionDenied):
            reg.save()
        with self.assertRaises(PermissionDenied):
            reg.delete()

    def test_consulta_solo_gestion(self):
        Materia.objects.create(nombre="Química")
        self.login(self.docente)
        self.assertEqual(self.client.get("/api/auditoria/").status_code, 403)
        self.login(self.director)
        r = self.client.get("/api/auditoria/?modelo=academico.materia")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 1)


class ArchivosPrivadosTest(Base):
    def setUp(self):
        super().setUp()
        self.media = tempfile.mkdtemp()
        self.ajustes = override_settings(MEDIA_ROOT=self.media)
        self.ajustes.enable()
        self.alumno = Alumno.objects.create(ci="A-1", nombres="Ana", apellidos="Prueba")

    def tearDown(self):
        self.ajustes.disable()
        shutil.rmtree(self.media, ignore_errors=True)

    def subir(self):
        self.login(self.director)
        archivo = SimpleUploadedFile("certificado.pdf", b"%PDF-1.4 prueba", content_type="application/pdf")
        r = self.client.post("/api/documentos-alumno/", {"alumno": self.alumno.id, "tipo": "Certificado",
                                                         "archivo": archivo}, format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data["archivo"]

    def test_enlace_firmado_funciona_sin_sesion_y_queda_auditado(self):
        url = self.subir()
        self.assertIn("/api/archivos/", url)
        self.assertNotIn("/media/", url)
        self.client.credentials()  # sin sesión: el enlace firmado alcanza
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b"".join(r.streaming_content), b"%PDF-1.4 prueba")
        self.assertEqual(r["Cache-Control"], "private, no-store")
        descarga = RegistroAuditoria.objects.get(accion="DESCARGAR")
        self.assertEqual(descarga.usuario, self.director)  # quien pidió el enlace

    def test_firma_alterada_o_vencida(self):
        url = self.subir()
        self.assertEqual(self.client.get(url[:-3] + "xyz/").status_code, 404)
        ahora = time.time()
        with mock.patch("time.time", return_value=ahora + 11 * 60):
            self.assertEqual(self.client.get(url).status_code, 410)

    def test_media_no_es_publica(self):
        self.subir()
        nombre = self.alumno.documentos.first().archivo.name
        self.assertEqual(self.client.get("/media/" + nombre).status_code, 404)
