from datetime import date

from rest_framework.test import APITestCase

from personas.models import Docente, Usuario
from .models import AnioLectivo, Asignacion, Curso, Materia, Nivel, Seccion


class HorarioTest(APITestCase):
    def setUp(self):
        self.director = Usuario.objects.create_user("director", password="x", rol="DIRECTOR")
        self.u_doc = Usuario.objects.create_user("profe", password="x", rol="DOCENTE")
        doc = Docente.objects.create(usuario=self.u_doc, ci="1", nombres="Ana", apellidos="Gómez")
        anio = AnioLectivo.objects.create(anio=2027, fecha_inicio=date(2027, 2, 20), fecha_fin=date(2027, 12, 1), activo=True)
        curso = Curso.objects.create(nivel=Nivel.objects.create(nombre="EM"), grado=1, nombre="1° Curso")
        self.mate = Asignacion.objects.create(seccion=Seccion.objects.create(anio_lectivo=anio, curso=curso, letra="A"),
                                              materia=Materia.objects.create(nombre="Matemática"), docente=doc)
        self.hist = Asignacion.objects.create(seccion=Seccion.objects.create(anio_lectivo=anio, curso=curso, letra="B"),
                                              materia=Materia.objects.create(nombre="Historia"), docente=doc)

    def login(self, u):
        r = self.client.post("/api/auth/token/", {"username": u.username, "password": "x"})
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])

    def guardar(self, asig, **datos):
        return self.client.post(f"/api/asignaciones/{asig.id}/dias/", datos, format="json")

    def test_horario(self):
        self.login(self.u_doc)
        r = self.guardar(self.mate, dias_clase=[5], horario=[
            {"dia": 3, "inicio": "09:20", "fin": "10:00"}, {"dia": 1, "inicio": "7:00", "fin": "07:40"}])
        self.assertEqual(r.status_code, 200, r.data)
        # Ordenado, con HH:MM, y los días del horario se suman a los días de clase.
        self.assertEqual(r.data["horario"][0], {"dia": 1, "inicio": "07:00", "fin": "07:40"})
        self.assertEqual(r.data["dias_clase"], [1, 3, 5])

        # Fin antes del inicio, bloques superpuestos y día inválido
        self.assertEqual(self.guardar(self.mate, horario=[{"dia": 1, "inicio": "08:00", "fin": "07:00"}]).status_code, 400)
        self.assertEqual(self.guardar(self.mate, horario=[{"dia": 1, "inicio": "07:00", "fin": "08:00"},
                                                          {"dia": 1, "inicio": "07:30", "fin": "08:30"}]).status_code, 400)
        self.assertEqual(self.guardar(self.mate, horario=[{"dia": 7, "inicio": "07:00", "fin": "08:00"}]).status_code, 400)

        # El docente no puede tener dos clases a la misma hora; pegadas sí.
        choque = self.guardar(self.hist, horario=[{"dia": 1, "inicio": "07:20", "fin": "08:00"}])
        self.assertEqual(choque.status_code, 400)
        self.assertIn("Matemática", str(choque.data))
        self.assertEqual(self.guardar(self.hist, horario=[{"dia": 1, "inicio": "07:40", "fin": "08:20"}]).status_code, 200)

        # Quitar un día de clase quita su bloque del horario.
        r = self.guardar(self.mate, dias_clase=[3])
        self.assertEqual(r.data["horario"], [{"dia": 3, "inicio": "09:20", "fin": "10:00"}])
        # "Mis clases" trae el horario para armar "Ahora tengo".
        mias = {a["id"]: a for a in self.client.get("/api/asignaciones/mias/").data}
        self.assertEqual(mias[self.hist.id]["horario"], [{"dia": 1, "inicio": "07:40", "fin": "08:20"}])

    def test_gestion_edita_dias(self):
        self.mate.horario = [{"dia": 2, "inicio": "07:00", "fin": "07:40"}]
        self.mate.dias_clase = [2, 4]
        self.mate.save()
        self.login(self.director)
        r = self.client.patch(f"/api/asignaciones/{self.mate.id}/", {"dias_clase": [4]}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["horario"], [])
