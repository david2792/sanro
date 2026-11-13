from django.core.exceptions import ValidationError
from django.db import models

from nucleo.instituciones import institucion_por_defecto
from personas.models import Alumno, Docente


class Institucion(models.Model):
    nombre = models.CharField(max_length=200)
    codigo_mec = models.CharField("Código MEC", max_length=20, blank=True)
    direccion = models.CharField(max_length=200, blank=True)
    ciudad = models.CharField(max_length=100, blank=True)
    departamento = models.CharField(max_length=100, blank=True)
    telefono = models.CharField(max_length=30, blank=True)
    asistencia_minima = models.PositiveSmallIntegerField(
        "Asistencia mínima (%)", default=80,
        help_text="Porcentaje mínimo de asistencia exigido a los alumnos.",
    )
    logro_minimo = models.PositiveSmallIntegerField(
        "Logro mínimo (%)", default=60,
        help_text="Porcentaje de logro en trabajos debajo del cual el alumno aparece en alerta.",
    )

    class EvaluacionesCuentan(models.TextChoices):
        PRUEBAS = "PRUEBAS", "Solo pruebas escritas"
        TODAS = "TODAS", "Todos los trabajos y evaluaciones"

    max_evaluaciones_dia = models.PositiveSmallIntegerField(
        "Máximo de evaluaciones por día", default=1,
        help_text="Cuántas evaluaciones puede tener una sección el mismo día. 0 = sin límite.",
    )
    evaluaciones_cuentan = models.CharField(
        "Qué cuenta para el máximo", max_length=10,
        choices=EvaluacionesCuentan.choices, default=EvaluacionesCuentan.PRUEBAS,
    )
    bloquear_evaluaciones = models.BooleanField(
        "No dejar pasar el máximo", default=True,
        help_text="Sí: el docente no puede guardar otra evaluación ese día. No: solo se le avisa.",
    )

    class Meta:
        verbose_name_plural = "instituciones"

    def cuenta_como_evaluacion(self, tipo):
        """Si un trabajo de este tipo cuenta para el máximo de evaluaciones por día."""
        return self.evaluaciones_cuentan == self.EvaluacionesCuentan.TODAS or tipo == "PRUEBA"

    def __str__(self):
        return self.nombre


class AnioLectivo(models.Model):
    institucion = models.ForeignKey(Institucion, on_delete=models.PROTECT, related_name="anios_lectivos",
                                    default=institucion_por_defecto, editable=False)
    anio = models.PositiveSmallIntegerField("Año")
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    activo = models.BooleanField(default=False)

    class Meta:
        ordering = ["-anio"]
        constraints = [
            models.UniqueConstraint(fields=["institucion", "anio"], name="anio_lectivo_unico_por_institucion"),
        ]
        verbose_name = "año lectivo"
        verbose_name_plural = "años lectivos"

    def save(self, *args, **kwargs):
        # Cada institución tiene un solo año lectivo activo.
        if self.activo:
            AnioLectivo.objects.filter(institucion_id=self.institucion_id).exclude(pk=self.pk).update(activo=False)
        super().save(*args, **kwargs)

    @classmethod
    def actual(cls, institucion=None):
        """Año activo de la institución (de cualquiera si no se indica, solo para uso interno)."""
        qs = cls.objects.filter(activo=True)
        if institucion is not None:
            iid = getattr(institucion, "pk", institucion)
            if iid is None:
                return None
            qs = qs.filter(institucion_id=iid)
        return qs.first()

    def __str__(self):
        return str(self.anio)


class Etapa(models.Model):
    anio_lectivo = models.ForeignKey(AnioLectivo, on_delete=models.CASCADE, related_name="etapas")
    numero = models.PositiveSmallIntegerField()
    nombre = models.CharField(max_length=50, default="Etapa")
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()

    class Meta:
        ordering = ["anio_lectivo", "numero"]
        unique_together = ("anio_lectivo", "numero")

    def __str__(self):
        return f"{self.numero}ª {self.nombre} {self.anio_lectivo}"


class DiaNoLectivo(models.Model):
    """Feriados, asuetos y suspensiones. No cuentan para la asistencia."""

    anio_lectivo = models.ForeignKey(AnioLectivo, on_delete=models.CASCADE, related_name="dias_no_lectivos")
    fecha = models.DateField()
    motivo = models.CharField(max_length=150)

    class Meta:
        ordering = ["fecha"]
        unique_together = ("anio_lectivo", "fecha")
        verbose_name = "día no lectivo"
        verbose_name_plural = "días no lectivos"

    def __str__(self):
        return f"{self.fecha} - {self.motivo}"


class Nivel(models.Model):
    """Ej.: Educación Escolar Básica (3er ciclo), Educación Media."""

    institucion = models.ForeignKey(Institucion, on_delete=models.PROTECT, related_name="niveles",
                                    default=institucion_por_defecto, editable=False)
    nombre = models.CharField(max_length=100)
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["orden"]
        constraints = [
            models.UniqueConstraint(fields=["institucion", "nombre"], name="nivel_unico_por_institucion"),
        ]
        verbose_name_plural = "niveles"

    def __str__(self):
        return self.nombre


class Especialidad(models.Model):
    """Ej.: Bachillerato Científico con énfasis en Ciencias Sociales, Bachillerato Técnico en..."""

    nivel = models.ForeignKey(Nivel, on_delete=models.PROTECT, related_name="especialidades")
    nombre = models.CharField(max_length=150)

    class Meta:
        ordering = ["nivel", "nombre"]
        verbose_name_plural = "especialidades"

    def __str__(self):
        return self.nombre


class Curso(models.Model):
    """Grado/curso de un plan: '7° grado' (EEB) o '1° curso - Bachillerato Científico' (EM)."""

    nivel = models.ForeignKey(Nivel, on_delete=models.PROTECT, related_name="cursos")
    especialidad = models.ForeignKey(
        Especialidad, null=True, blank=True, on_delete=models.PROTECT, related_name="cursos"
    )
    grado = models.PositiveSmallIntegerField()
    nombre = models.CharField(max_length=100, help_text="Ej.: 1° Curso, 9° Grado")

    class Meta:
        ordering = ["nivel__orden", "grado"]
        unique_together = ("nivel", "especialidad", "grado")

    def __str__(self):
        return f"{self.nombre} {self.especialidad or self.nivel}"


class Materia(models.Model):
    institucion = models.ForeignKey(Institucion, on_delete=models.PROTECT, related_name="materias",
                                    default=institucion_por_defecto, editable=False)
    nombre = models.CharField(max_length=100)
    abreviatura = models.CharField(max_length=15, blank=True)

    class Meta:
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(fields=["institucion", "nombre"], name="materia_unica_por_institucion"),
        ]

    def __str__(self):
        return self.nombre


class PlanMateria(models.Model):
    """Materias de cada curso según el plan de estudios (plan común / específico)."""

    class Tipo(models.TextChoices):
        COMUN = "COMUN", "Plan común"
        ESPECIFICO = "ESPECIFICO", "Plan específico"

    curso = models.ForeignKey(Curso, on_delete=models.CASCADE, related_name="plan")
    materia = models.ForeignKey(Materia, on_delete=models.PROTECT)
    tipo = models.CharField(max_length=10, choices=Tipo.choices, default=Tipo.COMUN)
    horas_semanales = models.PositiveSmallIntegerField(default=2)

    class Meta:
        unique_together = ("curso", "materia")
        verbose_name = "materia del plan"
        verbose_name_plural = "plan de estudios"

    def __str__(self):
        return f"{self.curso} - {self.materia}"


class Seccion(models.Model):
    """Un curso concreto en un año lectivo: '1° Curso A - Mañana - 2027'."""

    class Turno(models.TextChoices):
        MANANA = "M", "Mañana"
        TARDE = "T", "Tarde"
        NOCHE = "N", "Noche"

    anio_lectivo = models.ForeignKey(AnioLectivo, on_delete=models.PROTECT, related_name="secciones")
    curso = models.ForeignKey(Curso, on_delete=models.PROTECT, related_name="secciones")
    letra = models.CharField(max_length=3, default="A")
    turno = models.CharField(max_length=1, choices=Turno.choices, default=Turno.MANANA)
    cupo = models.PositiveSmallIntegerField(default=35)
    docente_guia = models.ForeignKey(
        Docente, null=True, blank=True, on_delete=models.SET_NULL, related_name="secciones_guia"
    )

    class Meta:
        ordering = ["anio_lectivo", "curso", "letra"]
        unique_together = ("anio_lectivo", "curso", "letra", "turno")
        verbose_name = "sección"
        verbose_name_plural = "secciones"

    @property
    def inscriptos(self):
        return self.matriculas.filter(estado=Matricula.Estado.ACTIVA).count()

    def __str__(self):
        return f"{self.curso} {self.letra} ({self.get_turno_display()}) {self.anio_lectivo}"


class Asignacion(models.Model):
    """Qué docente dicta qué materia en qué sección. Es la 'clase' donde se llama lista."""

    seccion = models.ForeignKey(Seccion, on_delete=models.CASCADE, related_name="asignaciones")
    materia = models.ForeignKey(Materia, on_delete=models.PROTECT)
    docente = models.ForeignKey(Docente, on_delete=models.PROTECT, related_name="asignaciones")
    horas_semanales = models.PositiveSmallIntegerField(default=2)
    dias_clase = models.JSONField(
        "Días de clase", default=list, blank=True,
        help_text="Días de la semana con clase: 1=lunes … 6=sábado. Vacío = no definido (se considera todos los días).",
    )
    horario = models.JSONField(
        "Horario", default=list, blank=True,
        help_text='Bloques de clase: [{"dia": 1, "inicio": "07:00", "fin": "07:40"}]. '
                  "Cada bloque cuenta también como día de clase.",
    )

    class Meta:
        unique_together = ("seccion", "materia")
        verbose_name = "asignación docente"
        verbose_name_plural = "asignaciones docentes"

    def tiene_clase(self, fecha):
        """True si la materia tiene clase ese día (o si todavía no se cargaron los días)."""
        return not self.dias_clase or fecha.isoweekday() in self.dias_clase

    def __str__(self):
        return f"{self.materia} - {self.seccion} - {self.docente}"


class Matricula(models.Model):
    class Estado(models.TextChoices):
        ACTIVA = "ACTIVA", "Activa"
        RETIRADO = "RETIRADO", "Retirado"
        TRASLADADO = "TRASLADADO", "Trasladado (pase)"
        PROMOVIDO = "PROMOVIDO", "Promovido"
        REPROBADO = "REPROBADO", "No promovido"

    alumno = models.ForeignKey(Alumno, on_delete=models.PROTECT, related_name="matriculas")
    seccion = models.ForeignKey(Seccion, on_delete=models.PROTECT, related_name="matriculas")
    anio_lectivo = models.ForeignKey(AnioLectivo, on_delete=models.PROTECT, editable=False)
    numero_lista = models.PositiveSmallIntegerField("N° de lista", null=True, blank=True)
    fecha = models.DateField("Fecha de matriculación")
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.ACTIVA)
    fecha_baja = models.DateField(null=True, blank=True)
    motivo_baja = models.CharField(max_length=200, blank=True)
    institucion_procedencia = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["seccion", "numero_lista", "alumno__apellidos"]
        constraints = [
            # Un alumno tiene una sola matrícula por año lectivo.
            models.UniqueConstraint(fields=["alumno", "anio_lectivo"], name="matricula_unica_por_anio"),
        ]
        verbose_name = "matrícula"

    def clean(self):
        if not self.seccion_id:
            return
        self.anio_lectivo_id = self.seccion.anio_lectivo_id
        if self.alumno_id and Matricula.objects.filter(
            alumno_id=self.alumno_id, anio_lectivo_id=self.anio_lectivo_id
        ).exclude(pk=self.pk).exists():
            raise ValidationError("El alumno ya está matriculado en este año lectivo.")
        nueva = self.pk is None
        if nueva and self.estado == self.Estado.ACTIVA and self.seccion.inscriptos >= self.seccion.cupo:
            raise ValidationError(f"La sección {self.seccion} ya completó su cupo ({self.seccion.cupo}).")

    def save(self, *args, **kwargs):
        self.anio_lectivo_id = self.seccion.anio_lectivo_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.alumno} - {self.seccion}"
