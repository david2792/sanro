import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from academico.models import Asignacion, Matricula
from personas.models import Docente


class SesionesVigentes(models.Manager):
    """Las clases anuladas no cuentan en ningún lado (siguen en SesionClase.todas)."""

    def get_queryset(self):
        return super().get_queryset().exclude(estado=SesionClase.Estado.ANULADA)


class SesionClase(models.Model):
    """
    Una clase dictada: el docente la abre y llama lista.
    Abrir la sesión registra automáticamente la presencia del docente.
    El `uuid` lo genera el celular del docente, así puede trabajar sin
    internet y reenviar la misma sesión sin duplicarla al sincronizar.

    Flujo (plan 7.4): BORRADOR → CONFIRMADA. Una lista confirmada solo se corrige con motivo
    (queda en la auditoría). Una clase que no se dio se ANULA con motivo; nunca se borra.
    """

    class Estado(models.TextChoices):
        BORRADOR = "BORRADOR", "Borrador"
        CONFIRMADA = "CONFIRMADA", "Confirmada"
        ANULADA = "ANULADA", "Anulada"

    objects = SesionesVigentes()
    todas = models.Manager()

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.CONFIRMADA)
    confirmada_en = models.DateTimeField(null=True, blank=True)
    confirmada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name="+")
    anulada_en = models.DateTimeField(null=True, blank=True)
    anulada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    motivo_anulacion = models.CharField("Motivo de la anulación", max_length=250, blank=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+", help_text="Quien llamó lista por primera vez.")
    asignacion = models.ForeignKey(Asignacion, on_delete=models.PROTECT, related_name="sesiones")
    docente = models.ForeignKey(Docente, on_delete=models.PROTECT, related_name="sesiones")
    fecha = models.DateField()
    hora_inicio = models.TimeField(null=True, blank=True)
    tema = models.CharField("Tema / capacidad desarrollada", max_length=250, blank=True)
    creado = models.DateTimeField(auto_now_add=True)
    sincronizado = models.DateTimeField(auto_now=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+",
        help_text="Último que guardó o sincronizó la lista.",
    )

    class Meta:
        base_manager_name = "todas"
        default_manager_name = "objects"
        ordering = ["-fecha", "-hora_inicio"]
        constraints = [
            models.UniqueConstraint(fields=["asignacion", "fecha"], name="una_lista_por_clase_y_dia"),
        ]
        verbose_name = "sesión de clase"
        verbose_name_plural = "sesiones de clase"

    def __str__(self):
        return f"{self.fecha} - {self.asignacion}"


class RegistrosVigentes(models.Manager):
    def get_queryset(self):
        return super().get_queryset().exclude(sesion__estado=SesionClase.Estado.ANULADA)


class RegistroAsistencia(models.Model):
    class Estado(models.TextChoices):
        PRESENTE = "P", "Presente"
        AUSENTE = "A", "Ausente"
        TARDANZA = "T", "Llegada tardía"
        RETIRO = "R", "Se retiró antes"

    class Origen(models.TextChoices):
        WEB = "WEB", "Cargada en línea"
        SIN_CONEXION = "SIN_CONEXION", "Cargada sin conexión y sincronizada"
        IMPORTACION = "IMPORTACION", "Importada"
        CORRECCION = "CORRECCION", "Corrección de una lista confirmada"

    # Estados que cuentan como asistencia (estuvo en clase, aunque sea una parte).
    PRESENTES = (Estado.PRESENTE, Estado.TARDANZA, Estado.RETIRO)

    objects = RegistrosVigentes()
    todos = models.Manager()

    sesion = models.ForeignKey(SesionClase, on_delete=models.PROTECT, related_name="registros")
    matricula = models.ForeignKey(Matricula, on_delete=models.PROTECT, related_name="asistencias")
    estado = models.CharField(max_length=1, choices=Estado.choices, default=Estado.PRESENTE)
    # La justificación es un proceso aparte (Justificacion): la ausencia sigue siendo "A".
    # Esta marca la mantiene asistencia.justificaciones.recalcular() según los justificativos aprobados.
    justificada = models.BooleanField(default=False, editable=False)
    hora_llegada = models.TimeField("Hora de llegada", null=True, blank=True, help_text="Solo en llegadas tardías.")
    hora_salida = models.TimeField("Hora de salida", null=True, blank=True, help_text="Solo en retiros anticipados.")
    observacion = models.CharField(max_length=200, blank=True)
    origen = models.CharField(max_length=12, choices=Origen.choices, default=Origen.WEB)

    @property
    def minutos_tarde(self):
        """Minutos entre el inicio de la clase y la llegada (None si falta alguna hora)."""
        inicio = self.sesion.hora_inicio
        if self.estado != self.Estado.TARDANZA or not self.hora_llegada or not inicio:
            return None
        return max(0, (self.hora_llegada.hour * 60 + self.hora_llegada.minute) - (inicio.hour * 60 + inicio.minute))

    class Meta:
        base_manager_name = "todos"
        default_manager_name = "objects"
        unique_together = ("sesion", "matricula")
        verbose_name = "registro de asistencia"
        verbose_name_plural = "registros de asistencia"

    def __str__(self):
        return f"{self.matricula.alumno} {self.estado} {self.sesion.fecha}"


class Justificacion(models.Model):
    """
    Justificativo de ausencias (plan maestro, módulo 5). Es un trámite con estados: se presenta, se revisa
    y se decide. No reemplaza la ausencia: las ausencias aprobadas quedan marcadas como justificadas.
    Nunca se aprueba solo por tener un archivo adjunto.
    """

    class Estado(models.TextChoices):
        BORRADOR = "BORRADOR", "Borrador"
        PRESENTADO = "PRESENTADO", "Presentado"
        EN_REVISION = "EN_REVISION", "En revisión"
        REQUIERE_INFO = "REQUIERE_INFO", "Falta documentación"
        APROBADO = "APROBADO", "Aprobado"
        APROBADO_PARCIAL = "APROBADO_PARCIAL", "Aprobado en parte"
        RECHAZADO = "RECHAZADO", "Rechazado"
        CANCELADO = "CANCELADO", "Cancelado"

    class Origen(models.TextChoices):
        GESTION = "GESTION", "Presentado en secretaría"
        DOCENTE = "DOCENTE", "Aviso recibido por el docente en clase"
        FAMILIA = "FAMILIA", "Presentado por la familia"

    ABIERTOS = (Estado.BORRADOR, Estado.PRESENTADO, Estado.EN_REVISION, Estado.REQUIERE_INFO)
    APROBADOS = (Estado.APROBADO, Estado.APROBADO_PARCIAL)

    matricula = models.ForeignKey(Matricula, on_delete=models.PROTECT, related_name="justificaciones")
    fecha_desde = models.DateField("Ausencias desde")
    fecha_hasta = models.DateField("Ausencias hasta")
    fecha_presentacion = models.DateField("Fecha de presentación", default=timezone.localdate)
    presentado_por = models.CharField("Presentado por", max_length=120, blank=True,
                                      help_text="Quién entregó el justificativo, ej. la madre.")
    origen = models.CharField(max_length=8, choices=Origen.choices, default=Origen.GESTION)
    motivo = models.CharField(max_length=200, help_text="Motivo general. No escribir diagnósticos médicos.")
    adjunto = models.FileField(upload_to="justificaciones/%Y/", null=True, blank=True)
    estado = models.CharField(max_length=16, choices=Estado.choices, default=Estado.PRESENTADO)
    revisado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="+")
    decidido_en = models.DateTimeField(null=True, blank=True)
    motivo_decision = models.CharField("Motivo de la decisión", max_length=250, blank=True)
    ausencias = models.ManyToManyField(RegistroAsistencia, through="AusenciaJustificada", related_name="justificaciones")
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha_presentacion", "-id"]
        verbose_name = "justificación"
        verbose_name_plural = "justificaciones"

    @property
    def abierto(self):
        return self.estado in self.ABIERTOS

    def __str__(self):
        return f"{self.matricula.alumno} {self.fecha_desde}–{self.fecha_hasta} ({self.get_estado_display()})"


class AusenciaJustificada(models.Model):
    """Cada ausencia que abarca un justificativo, con la decisión sobre ella (permite aprobar en parte)."""

    justificacion = models.ForeignKey(Justificacion, on_delete=models.PROTECT, related_name="vinculos")
    registro = models.ForeignKey(RegistroAsistencia, on_delete=models.PROTECT, related_name="vinculos_justificacion")
    aprobada = models.BooleanField(null=True, help_text="Vacío: todavía sin decidir.")

    class Meta:
        unique_together = ("justificacion", "registro")
        verbose_name = "ausencia justificada"
        verbose_name_plural = "ausencias justificadas"

    def __str__(self):
        return f"{self.justificacion_id} → {self.registro_id} ({self.aprobada})"


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
