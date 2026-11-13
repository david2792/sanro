from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.db import models


class RegistroAuditoria(models.Model):
    """Quién cambió qué, cuándo y por qué. Es de solo lectura: no se edita ni se borra."""

    class Accion(models.TextChoices):
        CREAR = "CREAR", "Creación"
        MODIFICAR = "MODIFICAR", "Modificación"
        ELIMINAR = "ELIMINAR", "Eliminación"
        ANULAR = "ANULAR", "Anulación"
        DESCARGAR = "DESCARGAR", "Descarga de archivo"
        OTRO = "OTRO", "Otro"

    fecha = models.DateTimeField(auto_now_add=True, db_index=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    usuario_nombre = models.CharField(
        max_length=150, blank=True, help_text="Se conserva aunque el usuario se elimine."
    )
    institucion = models.ForeignKey(
        "academico.Institucion", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    accion = models.CharField(max_length=10, choices=Accion.choices)
    modelo = models.CharField(max_length=100, db_index=True, help_text="app.modelo, ej. asistencia.registroasistencia")
    objeto_id = models.CharField(max_length=64, blank=True, db_index=True)
    descripcion = models.CharField(max_length=250, blank=True)
    cambios = models.JSONField(default=dict, blank=True, help_text='{"campo": [antes, después]}')
    motivo = models.CharField(max_length=250, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-fecha", "-id"]
        indexes = [models.Index(fields=["modelo", "objeto_id"])]
        verbose_name = "registro de auditoría"
        verbose_name_plural = "registros de auditoría"

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionDenied("Los registros de auditoría no se modifican.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionDenied("Los registros de auditoría no se borran.")

    def __str__(self):
        return f"{self.fecha:%Y-%m-%d %H:%M} {self.usuario_nombre or 'sistema'} {self.accion} {self.modelo}#{self.objeto_id}"
