"""
Aportes voluntarios y donaciones a la ACE (plan maestro 2.4, 2.5, 14.5 y 14.6;
docs/decisiones/0011-aportes-voluntarios.md).

- La ACE es una entidad distinta de la institución: emite sus propios recibos.
- Los aportes son voluntarios: no hay cuotas, vencimientos, deuda, morosos ni exoneraciones, y la falta de
  aporte nunca restringe matrícula, asistencia, notas ni documentos.
- Los recibos no se borran ni se editan: se anulan o revierten con motivo, y su número no se reutiliza.
Montos en guaraníes, enteros.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from academico.models import AnioLectivo, Institucion, Matricula
from .letras import importe_en_letras


class AsociacionACE(models.Model):
    """Asociación de Cooperación Escolar vinculada a la institución (Ley 4853/2013)."""

    class Estado(models.TextChoices):
        ACTIVA = "ACTIVA", "Activa"
        INACTIVA = "INACTIVA", "Inactiva"

    institucion = models.ForeignKey(Institucion, on_delete=models.PROTECT, related_name="asociaciones_ace")
    denominacion = models.CharField("Denominación", max_length=200)
    ruc = models.CharField("RUC", max_length=20, blank=True)
    reconocimiento = models.CharField("Resolución de reconocimiento", max_length=120, blank=True)
    domicilio = models.CharField(max_length=200, blank=True)
    telefono = models.CharField("Teléfono", max_length=30, blank=True)
    email = models.EmailField(blank=True)
    estado = models.CharField(max_length=8, choices=Estado.choices, default=Estado.ACTIVA)

    class Meta:
        ordering = ["institucion", "denominacion"]
        verbose_name = "asociación de cooperación escolar"
        verbose_name_plural = "asociaciones de cooperación escolar"

    @classmethod
    def de_institucion(cls, institucion_id):
        return cls.objects.filter(institucion_id=institucion_id, estado=cls.Estado.ACTIVA).order_by("id").first()

    def __str__(self):
        return self.denominacion


class ConceptoAporte(models.Model):
    """Para qué se aporta: aporte social, una actividad, un evento, una donación… El monto es solo sugerido."""

    class Tipo(models.TextChoices):
        APORTE_SOCIAL = "APORTE_SOCIAL", "Aporte social voluntario"
        DONACION = "DONACION", "Donación monetaria"
        DONACION_ESPECIE = "DONACION_ESPECIE", "Donación en especie"
        ACTIVIDAD = "ACTIVIDAD", "Aporte para una actividad"
        EVENTO = "EVENTO", "Recaudación de evento"
        OTRO = "OTRO", "Otro ingreso permitido"

    ace = models.ForeignKey(AsociacionACE, on_delete=models.PROTECT, related_name="conceptos")
    anio_lectivo = models.ForeignKey(AnioLectivo, on_delete=models.PROTECT, related_name="conceptos_aporte",
                                     help_text="Ejercicio al que corresponde.")
    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=16, choices=Tipo.choices, default=Tipo.APORTE_SOCIAL)
    monto_sugerido = models.PositiveIntegerField(
        "Monto sugerido (Gs.)", null=True, blank=True,
        help_text="Solo orientativo: el aporte es voluntario y puede ser de cualquier monto.")
    descripcion = models.TextField("Descripción", blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ["anio_lectivo", "nombre"]
        unique_together = ("anio_lectivo", "nombre")
        verbose_name = "concepto de aporte"
        verbose_name_plural = "conceptos de aporte"

    def clean(self):
        if self.monto_sugerido is not None and self.monto_sugerido <= 0:
            raise ValidationError({"monto_sugerido": "Si se indica, el monto sugerido debe ser mayor a cero."})

    def __str__(self):
        return f"{self.nombre} {self.anio_lectivo}"


class Recibo(models.Model):
    """
    Recibo interno de la ACE a nombre del aportante. Numeración correlativa por ACE, serie y ejercicio.
    No es una factura tributaria.
    """

    class Estado(models.TextChoices):
        EMITIDO = "EMITIDO", "Emitido"
        ANULADO = "ANULADO", "Anulado"
        REVERTIDO = "REVERTIDO", "Revertido (el dinero se devolvió o no se acreditó)"

    class Medio(models.TextChoices):
        EFECTIVO = "EFECTIVO", "Efectivo"
        TRANSFERENCIA = "TRANSFERENCIA", "Transferencia"
        CHEQUE = "CHEQUE", "Cheque"
        ESPECIE = "ESPECIE", "En especie"
        OTRO = "OTRO", "Otro"

    ace = models.ForeignKey(AsociacionACE, on_delete=models.PROTECT, related_name="recibos")
    anio_lectivo = models.ForeignKey(AnioLectivo, on_delete=models.PROTECT, editable=False, related_name="recibos")
    serie = models.CharField(max_length=5, default="A")
    ejercicio = models.PositiveSmallIntegerField(editable=False)
    numero = models.PositiveIntegerField("N° de recibo", editable=False)
    fecha = models.DateField()
    aportante_nombre = models.CharField("Aportante", max_length=150)
    aportante_documento = models.CharField("Documento del aportante", max_length=20, blank=True)
    tutor = models.ForeignKey("personas.Tutor", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    matricula = models.ForeignKey(Matricula, null=True, blank=True, on_delete=models.PROTECT, related_name="recibos",
                                  help_text="Alumno de referencia de la familia (opcional).")
    medio = models.CharField(max_length=13, choices=Medio.choices, default=Medio.EFECTIVO)
    referencia = models.CharField("Referencia / N° de transferencia", max_length=60, blank=True)
    destino_restringido = models.CharField(
        "Destino indicado por el aportante", max_length=200, blank=True,
        help_text="Solo si el aportante pidió expresamente que se use para algo determinado.")
    observacion = models.CharField(max_length=200, blank=True)
    estado = models.CharField(max_length=9, choices=Estado.choices, default=Estado.EMITIDO)
    motivo_anulacion = models.CharField("Motivo de anulación o reversión", max_length=200, blank=True)
    anulado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    anulado_en = models.DateTimeField(null=True, blank=True)
    codigo_verificacion = models.CharField(max_length=12, blank=True, editable=False)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-ejercicio", "-numero"]
        unique_together = ("ace", "serie", "ejercicio", "numero")
        verbose_name = "recibo de aporte"
        verbose_name_plural = "recibos de aporte"

    @property
    def total(self):
        return sum(linea.monto for linea in self.lineas.all())

    @property
    def importe_letras(self):
        return importe_en_letras(self.total)

    def __str__(self):
        return f"Recibo {self.serie}-{self.numero:05d}/{self.ejercicio} - {self.aportante_nombre}"


class LineaRecibo(models.Model):
    """Cada concepto que cubre el recibo. En una donación en especie, el monto es el valor documentado (puede ser 0)."""

    recibo = models.ForeignKey(Recibo, on_delete=models.PROTECT, related_name="lineas")
    concepto = models.ForeignKey(ConceptoAporte, on_delete=models.PROTECT, related_name="lineas")
    monto = models.PositiveIntegerField("Monto (Gs.)")
    descripcion = models.CharField("Descripción", max_length=250, blank=True,
                                   help_text="Obligatoria en donaciones en especie: qué se donó.")

    class Meta:
        ordering = ["recibo", "id"]
        verbose_name = "línea del recibo"
        verbose_name_plural = "líneas del recibo"

    def __str__(self):
        return f"{self.concepto.nombre}: {self.monto}"
