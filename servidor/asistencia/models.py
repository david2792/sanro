import uuid

from django.conf import settings
from django.db import models

from academico.models import Asignacion, Matricula
from personas.models import Docente


class SesionClase(models.Model):
    """
    Una clase dictada: el docente la abre y llama lista.
    Abrir la sesión registra automáticamente la presencia del docente.
    El `uuid` lo genera el celular del docente, así puede trabajar sin
    internet y reenviar la misma sesión sin duplicarla al sincronizar.
    """

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    asignacion = models.ForeignKey(Asignacion, on_delete=models.PROTECT, related_name="sesiones")
    docente = models.ForeignKey(Docente, on_delete=models.PROTECT, related_name="sesiones")
    fecha = models.DateField()
    hora_inicio = models.TimeField(null=True, blank=True)
    tema = models.CharField("Tema / capacidad desarrollada", max_length=250, blank=True)
    creado = models.DateTimeField(auto_now_add=True)
    sincronizado = models.DateTimeField(auto_now=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-fecha", "-hora_inicio"]
        constraints = [
            models.UniqueConstraint(fields=["asignacion", "fecha"], name="una_lista_por_clase_y_dia"),
        ]
        verbose_name = "sesión de clase"
        verbose_name_plural = "sesiones de clase"

    def __str__(self):
        return f"{self.fecha} - {self.asignacion}"


class RegistroAsistencia(models.Model):
    class Estado(models.TextChoices):
        PRESENTE = "P", "Presente"
        AUSENTE = "A", "Ausente"
        TARDANZA = "T", "Llegada tardía"
        JUSTIFICADO = "J", "Ausencia justificada"

    sesion = models.ForeignKey(SesionClase, on_delete=models.PROTECT, related_name="registros")
    matricula = models.ForeignKey(Matricula, on_delete=models.PROTECT, related_name="asistencias")
    estado = models.CharField(max_length=1, choices=Estado.choices, default=Estado.PRESENTE)
    hora_llegada = models.TimeField("Hora de llegada", null=True, blank=True, help_text="Solo en llegadas tardías.")
    observacion = models.CharField(max_length=200, blank=True)

    @property
    def minutos_tarde(self):
        """Minutos entre el inicio de la clase y la llegada (None si falta alguna hora)."""
        inicio = self.sesion.hora_inicio
        if self.estado != self.Estado.TARDANZA or not self.hora_llegada or not inicio:
            return None
        return max(0, (self.hora_llegada.hour * 60 + self.hora_llegada.minute) - (inicio.hour * 60 + inicio.minute))

    class Meta:
        unique_together = ("sesion", "matricula")
        verbose_name = "registro de asistencia"
        verbose_name_plural = "registros de asistencia"

    def __str__(self):
        return f"{self.matricula.alumno} {self.estado} {self.sesion.fecha}"


class Justificacion(models.Model):
    """Justificativo de ausencia (certificado médico, nota del tutor) por rango de fechas."""

    matricula = models.ForeignKey(Matricula, on_delete=models.PROTECT, related_name="justificaciones")
    fecha_desde = models.DateField()
    fecha_hasta = models.DateField()
    motivo = models.CharField(max_length=200)
    adjunto = models.FileField(upload_to="justificaciones/%Y/", null=True, blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha_desde"]
        verbose_name = "justificación"
        verbose_name_plural = "justificaciones"

    def aplicar(self):
        """Marca como justificadas las ausencias del rango. Devuelve cuántas cambió."""
        return RegistroAsistencia.objects.filter(
            matricula=self.matricula,
            sesion__fecha__range=(self.fecha_desde, self.fecha_hasta),
            estado=RegistroAsistencia.Estado.AUSENTE,
        ).update(estado=RegistroAsistencia.Estado.JUSTIFICADO)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.aplicar()

    def __str__(self):
        return f"{self.matricula.alumno} {self.fecha_desde}–{self.fecha_hasta}"


class PermisoDocente(models.Model):
    """Permisos y licencias del docente (para no contarlos como ausencias injustificadas)."""

    class Tipo(models.TextChoices):
        PERMISO = "PERMISO", "Permiso"
        REPOSO = "REPOSO", "Reposo médico"
        LICENCIA = "LICENCIA", "Licencia"
        COMISION = "COMISION", "Comisión de servicio"
        OTRO = "OTRO", "Otro"

    docente = models.ForeignKey(Docente, on_delete=models.CASCADE, related_name="permisos")
    tipo = models.CharField(max_length=10, choices=Tipo.choices, default=Tipo.PERMISO)
    fecha_desde = models.DateField()
    fecha_hasta = models.DateField()
    motivo = models.CharField(max_length=200, blank=True)
    adjunto = models.FileField(upload_to="permisos_docentes/%Y/", null=True, blank=True)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha_desde"]
        verbose_name = "permiso docente"
        verbose_name_plural = "permisos docentes"

    def __str__(self):
        return f"{self.docente} {self.get_tipo_display()} {self.fecha_desde}"
