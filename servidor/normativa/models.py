"""
Registro normativo (plan maestro 2.3 y 3.5; docs/decisiones/0006-registro-normativo.md).

Las reglas de evaluación, promoción, exigencia, períodos y documentos no se escriben en el código:
se cargan aquí, versionadas, con fuente, vigencia, alcance y aprobación.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class FuenteNormativa(models.Model):
    """Ley, resolución, circular o documento del que sale una regla."""

    class Tipo(models.TextChoices):
        LEY = "LEY", "Ley"
        DECRETO = "DECRETO", "Decreto"
        RESOLUCION = "RESOLUCION", "Resolución"
        CIRCULAR = "CIRCULAR", "Circular"
        DOCUMENTO_CURRICULAR = "CURRICULAR", "Programa o documento curricular"
        ESTATUTO = "ESTATUTO", "Estatuto"
        OTRO = "OTRO", "Otro"

    class Verificacion(models.TextChoices):
        PENDIENTE = "PENDIENTE", "Pendiente de verificar contra copia oficial"
        VERIFICADA = "VERIFICADA", "Verificada contra copia oficial"
        NO_VIGENTE = "NO_VIGENTE", "Derogada o sustituida"

    institucion = models.ForeignKey(
        "academico.Institucion", null=True, blank=True, on_delete=models.PROTECT, related_name="fuentes_normativas",
        help_text="Vacío: norma general (nacional), común a todas las instituciones.",
    )
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    numero = models.CharField("Número", max_length=40, blank=True, help_text="Ej.: 1525/2014")
    titulo = models.CharField("Título o descripción", max_length=250)
    organismo = models.CharField(max_length=120, blank=True, help_text="Ej.: MEC, DGEM, Congreso Nacional")
    fecha = models.DateField("Fecha de la norma", null=True, blank=True)
    enlace = models.URLField("Enlace oficial", blank=True)
    archivo = models.FileField("Copia oficial", upload_to="normativa/%Y/", null=True, blank=True)
    verificacion = models.CharField(max_length=10, choices=Verificacion.choices, default=Verificacion.PENDIENTE)
    verificada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name="+")
    verificada_en = models.DateField(null=True, blank=True)
    notas = models.TextField(blank=True)

    class Meta:
        ordering = ["tipo", "numero"]
        verbose_name = "fuente normativa"
        verbose_name_plural = "fuentes normativas"

    def __str__(self):
        return f"{self.get_tipo_display()} {self.organismo} N.º {self.numero}".replace("  ", " ").strip() \
            if self.numero else self.titulo


class ReglaNormativa(models.Model):
    """Catálogo de reglas que el sistema sabe aplicar. El código lo usa el programa; el valor, la versión."""

    class Area(models.TextChoices):
        EVALUACION = "EVALUACION", "Evaluación"
        PROMOCION = "PROMOCION", "Promoción"
        ASISTENCIA = "ASISTENCIA", "Asistencia"
        CALENDARIO = "CALENDARIO", "Calendario y períodos"
        DOCUMENTOS = "DOCUMENTOS", "Documentos obligatorios"
        ACE = "ACE", "ACE"
        OTRA = "OTRA", "Otra"

    class TipoValor(models.TextChoices):
        ENTERO = "ENTERO", "Número entero"
        NUMERO = "NUMERO", "Número"
        PORCENTAJE = "PORCENTAJE", "Porcentaje (0 a 100)"
        BOOLEANO = "BOOLEANO", "Sí / No"
        TEXTO = "TEXTO", "Texto"
        LISTA = "LISTA", "Lista"
        OBJETO = "OBJETO", "Estructura (fórmula, escala, tabla)"

    codigo = models.CharField("Código", max_length=60, unique=True, help_text="Ej.: EVAL_EXIGENCIA_MINIMA")
    nombre = models.CharField(max_length=150)
    descripcion = models.TextField("Descripción", blank=True)
    area = models.CharField("Área", max_length=10, choices=Area.choices)
    tipo_valor = models.CharField("Tipo de valor", max_length=10, choices=TipoValor.choices)

    class Meta:
        ordering = ["area", "codigo"]
        verbose_name = "regla normativa"
        verbose_name_plural = "reglas normativas"

    def save(self, *args, **kwargs):
        self.codigo = (self.codigo or "").strip().upper()
        super().save(*args, **kwargs)

    def validar_valor(self, valor):
        T = self.TipoValor
        es_numero = isinstance(valor, (int, float)) and not isinstance(valor, bool)
        validos = {
            T.ENTERO: isinstance(valor, int) and not isinstance(valor, bool),
            T.NUMERO: es_numero,
            T.PORCENTAJE: es_numero and 0 <= valor <= 100,
            T.BOOLEANO: isinstance(valor, bool),
            T.TEXTO: isinstance(valor, str) and bool(valor.strip()),
            T.LISTA: isinstance(valor, list),
            T.OBJETO: isinstance(valor, dict),
        }
        if not validos[self.tipo_valor]:
            raise ValidationError({"valor": f"El valor no corresponde al tipo de la regla: {self.get_tipo_valor_display()}."})

    def __str__(self):
        return f"{self.codigo} — {self.nombre}"


class VersionRegla(models.Model):
    """Valor de una regla para un alcance y un período de vigencia. Solo las APROBADAS se aplican."""

    class Estado(models.TextChoices):
        BORRADOR = "BORRADOR", "Borrador"
        REVISION = "REVISION", "En revisión"
        APROBADA = "APROBADA", "Aprobada"
        SUSTITUIDA = "SUSTITUIDA", "Sustituida"
        DEROGADA = "DEROGADA", "Derogada"

    class Nivel(models.TextChoices):
        TODOS = "TODOS", "Todos los niveles"
        EEB_3 = "EEB_3", "Tercer Ciclo de la EEB"
        EM = "EM", "Educación Media"

    class Modalidad(models.TextChoices):
        TODAS = "TODAS", "Todas las modalidades"
        CIENTIFICO = "CIENTIFICO", "Bachillerato Científico"
        TECNICO = "TECNICO", "Bachillerato Técnico"

    regla = models.ForeignKey(ReglaNormativa, on_delete=models.PROTECT, related_name="versiones")
    version = models.PositiveSmallIntegerField("Versión")
    valor = models.JSONField()
    fuente = models.ForeignKey(FuenteNormativa, null=True, blank=True, on_delete=models.PROTECT, related_name="versiones")
    articulo = models.CharField("Artículo o apartado", max_length=80, blank=True)
    # Alcance
    institucion = models.ForeignKey(
        "academico.Institucion", null=True, blank=True, on_delete=models.PROTECT, related_name="versiones_regla",
        help_text="Vacío: aplica a todas las instituciones.",
    )
    nivel = models.CharField(max_length=6, choices=Nivel.choices, default=Nivel.TODOS)
    modalidad = models.CharField(max_length=10, choices=Modalidad.choices, default=Modalidad.TODAS)
    # Vigencia y aprobación
    vigente_desde = models.DateField()
    vigente_hasta = models.DateField(null=True, blank=True)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.BORRADOR)
    aprobada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="+")
    aprobada_en = models.DateTimeField(null=True, blank=True)
    documento_aprobacion = models.FileField("Documento de aprobación", upload_to="normativa/aprobaciones/%Y/",
                                            null=True, blank=True)
    observaciones = models.TextField(blank=True)

    class Meta:
        ordering = ["regla", "-vigente_desde", "-version"]
        constraints = [models.UniqueConstraint(fields=["regla", "version"], name="version_regla_unica")]
        verbose_name = "versión de regla"
        verbose_name_plural = "versiones de reglas"

    def clean(self):
        if self.vigente_hasta and self.vigente_desde and self.vigente_hasta < self.vigente_desde:
            raise ValidationError({"vigente_hasta": "La vigencia no puede terminar antes de empezar."})
        if self.regla_id:
            self.regla.validar_valor(self.valor)
        if self.estado == self.Estado.APROBADA and not self.fuente_id:
            raise ValidationError({"fuente": "Una regla aprobada debe indicar su fuente normativa."})

    @property
    def especificidad(self):
        """Cuanto más específico el alcance, más prioridad tiene al resolver."""
        return ((self.institucion_id is not None) + (self.nivel != self.Nivel.TODOS)
                + (self.modalidad != self.Modalidad.TODAS))

    def __str__(self):
        return f"{self.regla.codigo} v{self.version} ({self.get_estado_display()})"
