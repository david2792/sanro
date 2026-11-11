from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from academico.models import AnioLectivo, Curso, Matricula


class ConceptoAporte(models.Model):
    """
    Lo que cobra la ACES en un año: un monto total (ej. Gs. 200.000 que la familia
    paga en partes), una cuota mensual, la cuota de graduación…
    Los montos van en guaraníes (sin decimales).
    """

    class Periodicidad(models.TextChoices):
        MENSUAL = "MENSUAL", "Cuota mensual"
        UNICO = "UNICO", "Monto total"

    anio_lectivo = models.ForeignKey(AnioLectivo, on_delete=models.PROTECT, related_name="conceptos_aporte")
    nombre = models.CharField(max_length=100)
    periodicidad = models.CharField(max_length=7, choices=Periodicidad.choices, default=Periodicidad.UNICO)
    monto = models.PositiveIntegerField("Monto (Gs.)", help_text="Total del año, o por mes si es cuota mensual.")
    mes_inicio = models.PositiveSmallIntegerField("Primer mes", default=3)
    mes_fin = models.PositiveSmallIntegerField("Último mes", default=11)
    dia_vencimiento = models.PositiveSmallIntegerField(
        "Día de vencimiento", default=10, help_text="Día del mes en que vence cada cuota mensual.")
    fecha_vencimiento = models.DateField(
        null=True, blank=True, help_text="Solo monto total: hasta cuándo se puede completar. Vacío = fin del año lectivo.")
    cursos = models.ManyToManyField(
        Curso, blank=True, related_name="conceptos_aporte",
        help_text="Vacío = lo pagan todos los cursos.")
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ["anio_lectivo", "nombre"]
        unique_together = ("anio_lectivo", "nombre")
        verbose_name = "concepto de aporte"
        verbose_name_plural = "conceptos de aporte"

    def clean(self):
        if self.monto is not None and self.monto <= 0:
            raise ValidationError("El monto debe ser mayor a cero.")
        if self.periodicidad == self.Periodicidad.MENSUAL:
            if not (1 <= self.mes_inicio <= self.mes_fin <= 12):
                raise ValidationError("Los meses deben ir de 1 a 12 y el primero no puede ser posterior al último.")
            if not (1 <= self.dia_vencimiento <= 28):
                raise ValidationError("El día de vencimiento debe estar entre 1 y 28.")

    def cuotas(self):
        """[(mes, vencimiento)] — mes es None en un monto total."""
        anio = self.anio_lectivo.anio
        if self.periodicidad == self.Periodicidad.UNICO:
            return [(None, self.fecha_vencimiento or self.anio_lectivo.fecha_fin)]
        return [(m, date(anio, m, self.dia_vencimiento)) for m in range(self.mes_inicio, self.mes_fin + 1)]

    def __str__(self):
        return f"{self.nombre} {self.anio_lectivo}"


class Exoneracion(models.Model):
    """Alumno que no paga un concepto (beca, hermanos, situación económica…)."""

    matricula = models.ForeignKey(Matricula, on_delete=models.CASCADE, related_name="exoneraciones")
    concepto = models.ForeignKey(ConceptoAporte, on_delete=models.CASCADE, related_name="exoneraciones")
    motivo = models.CharField(max_length=200)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("matricula", "concepto")
        verbose_name = "exoneración"
        verbose_name_plural = "exoneraciones"

    def __str__(self):
        return f"{self.matricula.alumno} - {self.concepto}"


class Pago(models.Model):
    """
    Un recibo. El número es correlativo por año lectivo y no se reutiliza:
    un recibo mal hecho no se borra, se anula (queda en los reportes como anulado).
    """

    class Medio(models.TextChoices):
        EFECTIVO = "EFECTIVO", "Efectivo"
        TRANSFERENCIA = "TRANSFERENCIA", "Transferencia"
        OTRO = "OTRO", "Otro"

    anio_lectivo = models.ForeignKey(AnioLectivo, on_delete=models.PROTECT, editable=False, related_name="pagos")
    numero = models.PositiveIntegerField("N° de recibo", editable=False)
    matricula = models.ForeignKey(Matricula, on_delete=models.PROTECT, related_name="pagos")
    fecha = models.DateField()
    medio = models.CharField(max_length=13, choices=Medio.choices, default=Medio.EFECTIVO)
    referencia = models.CharField("Referencia / N° de transferencia", max_length=60, blank=True)
    pagado_por = models.CharField("Entregado por", max_length=120, blank=True)
    observacion = models.CharField(max_length=200, blank=True)
    anulado = models.BooleanField(default=False)
    motivo_anulacion = models.CharField(max_length=200, blank=True)
    anulado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    anulado_en = models.DateTimeField(null=True, blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-anio_lectivo__anio", "-numero"]
        unique_together = ("anio_lectivo", "numero")
        verbose_name = "pago (recibo)"
        verbose_name_plural = "pagos (recibos)"

    @property
    def total(self):
        return sum(d.monto for d in self.detalles.all())

    def __str__(self):
        return f"Recibo {self.numero:05d}/{self.anio_lectivo} - {self.matricula.alumno}"


class DetallePago(models.Model):
    """Qué cuota cubre el recibo. Una cuota puede pagarse en partes (varios detalles)."""

    pago = models.ForeignKey(Pago, on_delete=models.CASCADE, related_name="detalles")
    concepto = models.ForeignKey(ConceptoAporte, on_delete=models.PROTECT, related_name="detalles")
    mes = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Vacío en un monto total.")
    monto = models.PositiveIntegerField("Monto (Gs.)")

    class Meta:
        ordering = ["concepto", "mes"]
        verbose_name = "detalle del pago"
        verbose_name_plural = "detalles del pago"

    def __str__(self):
        return f"{self.concepto.nombre} {self.mes or ''}: {self.monto}"
