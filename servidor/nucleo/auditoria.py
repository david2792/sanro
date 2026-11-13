"""
Auditoría automática: cada alta, cambio o baja de los modelos del sistema queda en RegistroAuditoria.

Limitaciones (ver docs/decisiones/0004-auditoria.md): QuerySet.update(), bulk_create y los cambios
en relaciones muchos-a-muchos no pasan por aquí.
"""
import datetime
import decimal
import uuid

from django.apps import apps
from django.db.models.fields.files import FieldFile
from django.db.models.signals import post_delete, post_save, pre_save

from . import contexto

# Apps cuyos modelos se auditan.
APPS_AUDITADAS = ("personas", "academico", "asistencia", "pedagogico", "aportes", "normativa")

# Campos que no se guardan (secretos o marcas de tiempo automáticas).
CAMPOS_EXCLUIDOS = {"password", "last_login", "creado", "modificado", "sincronizado", "subido"}

_modelos_auditados = set()


def _valor(v):
    """Convierte un valor a algo que se pueda guardar en JSON."""
    if isinstance(v, FieldFile):
        return v.name or None
    if isinstance(v, (datetime.date, datetime.time, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, (decimal.Decimal, uuid.UUID)):
        return str(v)
    return v


def _campos(modelo):
    return [f for f in modelo._meta.concrete_fields if f.name not in CAMPOS_EXCLUIDOS and not f.primary_key]


def _foto(instancia):
    return {f.attname: _valor(getattr(instancia, f.attname)) for f in _campos(type(instancia))}


def _descripcion(instancia):
    try:
        return str(instancia)[:250]
    except Exception:  # __str__ puede consultar relaciones que ya no existen (p. ej. al borrar)
        return ""


def registrar_evento(accion, *, objeto=None, modelo="", objeto_id="", descripcion="", cambios=None,
                     motivo=None, usuario=None):
    """Registra un evento a mano (descargas, anulaciones, cambios masivos)."""
    from .models import RegistroAuditoria

    usuario = usuario or contexto.usuario_actual()
    if objeto is not None:
        modelo = modelo or objeto._meta.label_lower
        objeto_id = objeto_id or str(objeto.pk)
        descripcion = descripcion or _descripcion(objeto)
    return RegistroAuditoria.objects.create(
        usuario=usuario if getattr(usuario, "pk", None) else None,
        usuario_nombre=getattr(usuario, "username", "") or "",
        institucion_id=getattr(usuario, "institucion_id", None),
        accion=accion,
        modelo=modelo,
        objeto_id=str(objeto_id)[:64],
        descripcion=descripcion[:250],
        cambios=cambios or {},
        motivo=contexto.motivo_actual() if motivo is None else motivo,
        ip=contexto.ip_actual(),
    )


def _antes(sender, instance, raw=False, **kwargs):
    if raw or sender not in _modelos_auditados or instance.pk is None:
        return
    nombres = [f.attname for f in _campos(sender)]
    fila = sender._base_manager.filter(pk=instance.pk).values(*nombres).first()
    instance._auditoria_antes = {k: _valor(v) for k, v in fila.items()} if fila else None


def _despues(sender, instance, created, raw=False, **kwargs):
    if raw or sender not in _modelos_auditados:
        return
    from .models import RegistroAuditoria

    ahora = _foto(instance)
    antes = getattr(instance, "_auditoria_antes", None)
    instance._auditoria_antes = None
    if created or antes is None:
        cambios = {k: [None, v] for k, v in ahora.items() if v not in (None, "", [], {})}
        accion = RegistroAuditoria.Accion.CREAR
    else:
        cambios = {k: [antes.get(k), v] for k, v in ahora.items() if antes.get(k) != v}
        if not cambios:
            return  # se guardó sin cambios reales
        accion = RegistroAuditoria.Accion.MODIFICAR
    registrar_evento(accion, objeto=instance, cambios=cambios)


def _borrado(sender, instance, **kwargs):
    if sender not in _modelos_auditados:
        return
    from .models import RegistroAuditoria

    cambios = {k: [v, None] for k, v in _foto(instance).items() if v not in (None, "", [], {})}
    registrar_evento(RegistroAuditoria.Accion.ELIMINAR, objeto=instance, cambios=cambios)


def conectar():
    """Se llama una vez al iniciar Django (NucleoConfig.ready)."""
    for etiqueta in APPS_AUDITADAS:
        try:
            config = apps.get_app_config(etiqueta)
        except LookupError:
            continue
        _modelos_auditados.update(config.get_models())
    pre_save.connect(_antes, dispatch_uid="sige_auditoria_antes")
    post_save.connect(_despues, dispatch_uid="sige_auditoria_despues")
    post_delete.connect(_borrado, dispatch_uid="sige_auditoria_borrado")
