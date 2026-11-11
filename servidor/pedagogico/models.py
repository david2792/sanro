from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from academico.models import Asignacion, Etapa, Matricula
from asistencia.models import SesionClase


# ---------------------------------------------------------------------------
# Planificación: unidad -> capacidades -> indicadores (por asignación)
# ---------------------------------------------------------------------------

class Unidad(models.Model):
    """Unidad temática que el docente desarrolla en su materia y sección."""

    asignacion = models.ForeignKey(Asignacion, on_delete=models.CASCADE, related_name="unidades")
    etapa = models.ForeignKey(Etapa, null=True, blank=True, on_delete=models.SET_NULL, related_name="unidades")
    numero = models.PositiveSmallIntegerField()
    titulo = models.CharField(max_length=200)
    competencia = models.TextField("Competencia", blank=True)
    # Datos del plan anual (cargado unidad por unidad)
    fecha_inicio = models.DateField("Desde", null=True, blank=True)
    fecha_fin = models.DateField("Hasta", null=True, blank=True)
    contenidos = models.TextField(blank=True)
    estrategias = models.TextField("Estrategias metodológicas", blank=True)
    recursos = models.TextField(blank=True)
    evaluacion = models.TextField("Procedimientos e instrumentos de evaluación", blank=True)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["asignacion", "numero"]
        unique_together = ("asignacion", "numero")
        verbose_name_plural = "unidades"

    def __str__(self):
        return f"Unidad {self.numero}: {self.titulo}"


class Capacidad(models.Model):
    unidad = models.ForeignKey(Unidad, on_delete=models.CASCADE, related_name="capacidades")
    orden = models.PositiveSmallIntegerField(default=1)
    descripcion = models.TextField()

    class Meta:
        ordering = ["unidad", "orden"]
        verbose_name_plural = "capacidades"

    def __str__(self):
        return self.descripcion[:80]


class Indicador(models.Model):
    capacidad = models.ForeignKey(Capacidad, on_delete=models.CASCADE, related_name="indicadores")
    orden = models.PositiveSmallIntegerField(default=1)
    descripcion = models.TextField()

    class Meta:
        ordering = ["capacidad", "orden"]
        verbose_name_plural = "indicadores"

    def __str__(self):
        return self.descripcion[:80]


# ---------------------------------------------------------------------------
# Registro de clase (lo que se desarrolló en cada clase)
# ---------------------------------------------------------------------------

class RegistroClase(models.Model):
    """
    Lo que el docente desarrolló en la clase: unidad, capacidades e indicadores
    trabajados/evaluados. Se vincula a la sesión donde llamó lista.
    """

    sesion = models.OneToOneField(SesionClase, on_delete=models.CASCADE, related_name="registro_clase")
    unidad = models.ForeignKey(Unidad, null=True, blank=True, on_delete=models.SET_NULL, related_name="registros")
    capacidades = models.ManyToManyField(Capacidad, blank=True, related_name="registros")
    indicadores_evaluados = models.ManyToManyField(Indicador, blank=True, related_name="registros")
    contenido = models.TextField("Contenido / tema desarrollado", blank=True)
    actividades = models.TextField("Actividades / estrategias", blank=True)
    observaciones = models.TextField(blank=True)
    creado = models.DateTimeField(auto_now_add=True)
    modificado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-sesion__fecha"]
        verbose_name = "registro de clase"
        verbose_name_plural = "registros de clase"

    def __str__(self):
        return f"{self.sesion}"


# ---------------------------------------------------------------------------
# Planificación de clases (lo que el docente piensa dar cada día)
# ---------------------------------------------------------------------------

class PlanClase(models.Model):
    """
    Clase planificada para una fecha. Cuando se da la clase, se usa para
    completar el registro de clase (que es lo que realmente se desarrolló).
    """

    asignacion = models.ForeignKey(Asignacion, on_delete=models.CASCADE, related_name="planes_clase")
    fecha = models.DateField()
    unidad = models.ForeignKey(Unidad, null=True, blank=True, on_delete=models.SET_NULL, related_name="planes_clase")
    capacidades = models.ManyToManyField(Capacidad, blank=True, related_name="planes_clase")
    indicadores = models.ManyToManyField(Indicador, blank=True, related_name="planes_clase",
                                         help_text="Indicadores que se piensa evaluar")
    contenido = models.TextField("Contenido / tema", blank=True)
    actividades = models.TextField("Actividades / estrategias", blank=True)
    recursos = models.TextField(blank=True)
    modificado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["asignacion", "fecha"]
        unique_together = ("asignacion", "fecha")
        verbose_name = "clase planificada"
        verbose_name_plural = "clases planificadas"

    def __str__(self):
        return f"{self.fecha} - {self.asignacion}: {self.contenido[:40]}"


# ---------------------------------------------------------------------------
# Sugerencias de dirección / coordinación al docente
# ---------------------------------------------------------------------------

class Sugerencia(models.Model):
    """Observación de dirección sobre el plan anual (o una unidad) o sobre una clase dada."""

    class Sobre(models.TextChoices):
        PLAN_ANUAL = "PLAN_ANUAL", "Plan anual"
        CLASE = "CLASE", "Desarrollo de una clase"

    asignacion = models.ForeignKey(Asignacion, on_delete=models.CASCADE, related_name="sugerencias")
    sobre = models.CharField(max_length=10, choices=Sobre.choices)
    unidad = models.ForeignKey(Unidad, null=True, blank=True, on_delete=models.SET_NULL, related_name="sugerencias")
    registro_clase = models.ForeignKey(RegistroClase, null=True, blank=True, on_delete=models.CASCADE,
                                       related_name="sugerencias")
    texto = models.TextField()
    autor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    creado = models.DateTimeField(auto_now_add=True)
    leida = models.BooleanField("Leída por el docente", default=False)
    leida_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-creado"]

    def __str__(self):
        return f"{self.get_sobre_display()} - {self.asignacion}: {self.texto[:40]}"


# ---------------------------------------------------------------------------
# Registro anecdótico
# ---------------------------------------------------------------------------

class RegistroAnecdotico(models.Model):
    """Hecho ocurrido en el aula: qué pasó, cómo se interpreta y qué se hizo."""

    class Tipo(models.TextChoices):
        POSITIVO = "POSITIVO", "Positivo"
        NEGATIVO = "NEGATIVO", "Negativo"
        NEUTRO = "NEUTRO", "Informativo"

    asignacion = models.ForeignKey(Asignacion, on_delete=models.PROTECT, related_name="anecdoticos")
    alumnos = models.ManyToManyField(Matricula, related_name="anecdoticos",
                                     help_text="Alumnos involucrados")
    fecha = models.DateField()
    hora = models.TimeField(null=True, blank=True)
    lugar = models.CharField(max_length=100, default="Aula")
    tipo = models.CharField(max_length=10, choices=Tipo.choices, default=Tipo.NEUTRO)
    hecho = models.TextField("Descripción del hecho")
    interpretacion = models.TextField("Interpretación / comentario", blank=True)
    acciones = models.TextField("Acciones tomadas", blank=True)
    informado_a_tutor = models.BooleanField("Se informó al tutor", default=False)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    creado = models.DateTimeField(auto_now_add=True)
    modificado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-fecha", "-hora"]
        verbose_name = "registro anecdótico"
        verbose_name_plural = "registros anecdóticos"

    def __str__(self):
        return f"{self.fecha} - {self.asignacion} - {self.get_tipo_display()}"


# ---------------------------------------------------------------------------
# Trabajos / instrumentos de evaluación con puntaje
# ---------------------------------------------------------------------------

class Instrumento(models.Model):
    """Trabajo, prueba o instrumento que crea el docente, con su puntaje total."""

    class Tipo(models.TextChoices):
        PRUEBA = "PRUEBA", "Prueba escrita"
        PRACTICO = "PRACTICO", "Trabajo práctico"
        INVESTIGACION = "INVESTIGACION", "Trabajo de investigación"
        EXPOSICION = "EXPOSICION", "Exposición oral"
        CARPETA = "CARPETA", "Carpeta / cuaderno"
        PROYECTO = "PROYECTO", "Proyecto"
        LISTA_COTEJO = "LISTA_COTEJO", "Lista de cotejo"
        RUBRICA = "RUBRICA", "Rúbrica"
        OTRO = "OTRO", "Otro"

    asignacion = models.ForeignKey(Asignacion, on_delete=models.CASCADE, related_name="instrumentos")
    etapa = models.ForeignKey(Etapa, on_delete=models.PROTECT, related_name="instrumentos")
    tipo = models.CharField(max_length=15, choices=Tipo.choices, default=Tipo.PRACTICO)
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    fecha = models.DateField("Fecha de aplicación / entrega")
    puntaje_total = models.DecimalField(max_digits=6, decimal_places=2)
    indicadores = models.ManyToManyField(Indicador, blank=True, related_name="instrumentos")
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["asignacion", "etapa", "fecha"]
        verbose_name = "trabajo / instrumento"
        verbose_name_plural = "trabajos / instrumentos"

    def clean(self):
        if self.puntaje_total is not None and self.puntaje_total <= 0:
            raise ValidationError("El puntaje total debe ser mayor a cero.")

    def __str__(self):
        return f"{self.titulo} ({self.puntaje_total} pts)"


class Puntaje(models.Model):
    instrumento = models.ForeignKey(Instrumento, on_delete=models.CASCADE, related_name="puntajes")
    matricula = models.ForeignKey(Matricula, on_delete=models.PROTECT, related_name="puntajes")
    puntaje = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True,
                                  help_text="Vacío = no entregó / no se evaluó todavía")
    recuperatorio = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True,
                                        help_text="Puntaje del recuperatorio. Cuenta el mayor de los dos.")
    entrega_tardia = models.BooleanField("Entregó fuera de término", default=False)
    observacion = models.CharField(max_length=200, blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    modificado = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("instrumento", "matricula")

    @property
    def efectivo(self):
        """El que cuenta en la planilla: el mayor entre el puntaje y el recuperatorio (None si no hay ninguno)."""
        valores = [v for v in (self.puntaje, self.recuperatorio) if v is not None]
        return max(valores) if valores else None

    @property
    def marca(self):
        """'R' si cuenta el recuperatorio, 'T' si entregó tarde (pueden ir las dos)."""
        recupero = self.recuperatorio is not None and (self.puntaje is None or self.recuperatorio > self.puntaje)
        return ("R" if recupero else "") + ("T" if self.entrega_tardia else "")

    def clean(self):
        for nombre, valor in (("puntaje", self.puntaje), ("recuperatorio", self.recuperatorio)):
            if valor is None:
                continue
            if valor < 0:
                raise ValidationError(f"El {nombre} no puede ser negativo.")
            if valor > self.instrumento.puntaje_total:
                raise ValidationError(
                    f"El {nombre} ({valor}) supera el total del trabajo ({self.instrumento.puntaje_total})."
                )

    def __str__(self):
        return f"{self.matricula.alumno}: {self.puntaje}/{self.instrumento.puntaje_total}"



# ---------------------------------------------------------------------------
# Logro de indicadores (L / NL por alumno)
# ---------------------------------------------------------------------------

class LogroIndicador(models.Model):
    """Si el alumno logró (L) o no logró (NL) un indicador de la unidad."""

    class Estado(models.TextChoices):
        LOGRADO = "L", "Logrado"
        NO_LOGRADO = "NL", "No logrado"

    indicador = models.ForeignKey(Indicador, on_delete=models.CASCADE, related_name="logros")
    matricula = models.ForeignKey(Matricula, on_delete=models.CASCADE, related_name="logros_indicador")
    estado = models.CharField(max_length=2, choices=Estado.choices)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    modificado = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("indicador", "matricula")
        verbose_name = "logro de indicador"
        verbose_name_plural = "logros de indicadores"

    def __str__(self):
        return f"{self.matricula.alumno} - {self.indicador}: {self.estado}"



# ---------------------------------------------------------------------------
# Plan anual (por materia): PDF subido o unidades cargadas una a una
# ---------------------------------------------------------------------------

class PlanAnual(models.Model):
    class Estado(models.TextChoices):
        BORRADOR = "BORRADOR", "En borrador"
        ENVIADO = "ENVIADO", "Enviado a coordinación"
        APROBADO = "APROBADO", "Aprobado"
        OBSERVADO = "OBSERVADO", "Devuelto con observaciones"

    asignacion = models.OneToOneField(Asignacion, on_delete=models.CASCADE, related_name="plan_anual")
    archivo = models.FileField("Plan anual en PDF", upload_to="planes_anuales/%Y/", null=True, blank=True)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.BORRADOR)
    observaciones = models.TextField("Observaciones de coordinación", blank=True)
    enviado = models.DateTimeField(null=True, blank=True)
    revisado = models.DateTimeField(null=True, blank=True)
    revisado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    modificado = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "plan anual"
        verbose_name_plural = "planes anuales"

    def __str__(self):
        return f"Plan anual {self.asignacion}"
