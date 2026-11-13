from django.contrib.auth.models import AbstractUser
from django.db import models

from nucleo.instituciones import institucion_por_defecto


def _fk_institucion(related_name, null=False):
    return models.ForeignKey(
        "academico.Institucion", on_delete=models.PROTECT, related_name=related_name,
        default=institucion_por_defecto, editable=False, null=null, blank=null,
    )


class Usuario(AbstractUser):
    """Usuario del sistema. El rol define qué puede ver y hacer."""

    class Rol(models.TextChoices):
        DIRECTOR = "DIRECTOR", "Director/a"
        COORDINADOR = "COORDINADOR", "Coordinador/a"
        SECRETARIA = "SECRETARIA", "Secretaría"
        DOCENTE = "DOCENTE", "Docente"
        TUTOR = "TUTOR", "Padre/Madre/Tutor"
        ACES = "ACES", "ACES (cooperadora)"

    rol = models.CharField(max_length=20, choices=Rol.choices, default=Rol.DOCENTE)
    # Vacía solo en un superusuario global, que ve todas las instituciones.
    institucion = _fk_institucion("usuarios", null=True)
    ci = models.CharField("C.I.", max_length=20, blank=True)
    telefono = models.CharField(max_length=30, blank=True)

    @property
    def es_gestion(self):
        """Director, coordinación y secretaría administran el sistema."""
        return self.is_superuser or self.rol in (
            self.Rol.DIRECTOR, self.Rol.COORDINADOR, self.Rol.SECRETARIA
        )

    @property
    def es_aces(self):
        """Comisión de la ACES: administra los aportes de padres."""
        return self.rol == self.Rol.ACES

    def __str__(self):
        return self.get_full_name() or self.username


class Sexo(models.TextChoices):
    M = "M", "Masculino"
    F = "F", "Femenino"


class Alumno(models.Model):
    institucion = _fk_institucion("alumnos")
    ci = models.CharField("C.I.", max_length=20)
    nombres = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    sexo = models.CharField(max_length=1, choices=Sexo.choices, blank=True)
    lugar_nacimiento = models.CharField(max_length=100, blank=True)
    direccion = models.CharField(max_length=200, blank=True)
    telefono = models.CharField(max_length=30, blank=True)
    observaciones = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    creado = models.DateTimeField(auto_now_add=True)
    modificado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["apellidos", "nombres"]
        constraints = [models.UniqueConstraint(fields=["institucion", "ci"], name="alumno_ci_unica_por_institucion")]

    def __str__(self):
        return f"{self.apellidos}, {self.nombres}"


class Tutor(models.Model):
    institucion = _fk_institucion("tutores")
    ci = models.CharField("C.I.", max_length=20)
    nombres = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)
    telefono = models.CharField("Teléfono / WhatsApp", max_length=30, blank=True)
    email = models.EmailField(blank=True)
    direccion = models.CharField(max_length=200, blank=True)
    usuario = models.OneToOneField(
        Usuario, null=True, blank=True, on_delete=models.SET_NULL, related_name="tutor"
    )
    alumnos = models.ManyToManyField(Alumno, through="AlumnoTutor", related_name="tutores")

    class Meta:
        ordering = ["apellidos", "nombres"]
        constraints = [models.UniqueConstraint(fields=["institucion", "ci"], name="tutor_ci_unica_por_institucion")]
        verbose_name_plural = "tutores"

    def __str__(self):
        return f"{self.apellidos}, {self.nombres}"


class AlumnoTutor(models.Model):
    alumno = models.ForeignKey(Alumno, on_delete=models.CASCADE)
    tutor = models.ForeignKey(Tutor, on_delete=models.CASCADE)
    parentesco = models.CharField(max_length=30, default="Madre/Padre")
    es_principal = models.BooleanField("Contacto principal", default=False)

    class Meta:
        unique_together = ("alumno", "tutor")
        verbose_name = "tutor del alumno"
        verbose_name_plural = "tutores del alumno"


class DocumentoAlumno(models.Model):
    """Documentos escaneados del legajo (certificado de nacimiento, C.I., etc.)."""

    alumno = models.ForeignKey(Alumno, on_delete=models.CASCADE, related_name="documentos")
    tipo = models.CharField(max_length=60)
    archivo = models.FileField(upload_to="legajos/%Y/")
    subido = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.tipo} - {self.alumno}"


class Docente(models.Model):
    usuario = models.OneToOneField(
        Usuario, null=True, blank=True, on_delete=models.SET_NULL, related_name="docente"
    )
    institucion = _fk_institucion("docentes")
    ci = models.CharField("C.I.", max_length=20)
    nombres = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)
    telefono = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    titulo = models.CharField("Título", max_length=150, blank=True)
    fecha_ingreso = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ["apellidos", "nombres"]
        constraints = [models.UniqueConstraint(fields=["institucion", "ci"], name="docente_ci_unica_por_institucion")]

    def __str__(self):
        return f"{self.apellidos}, {self.nombres}"
