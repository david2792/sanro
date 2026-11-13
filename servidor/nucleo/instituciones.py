"""
Varias instituciones en un esquema compartido (docs/decisiones/0003-varias-instituciones.md).

- Los modelos raíz tienen `institucion` con valor por defecto `institucion_por_defecto`: la institución
  del usuario que hace la petición o, fuera de una petición (comandos, admin sin institución), la primera.
- `institucion_de(request)` es la institución con la que trabaja el usuario.
- `PorInstitucionMixin` filtra las vistas por institución.
"""
from . import contexto

_tabla_lista = False


def _tabla_existe(modelo):
    """Django crea modelos en memoria antes de migrar (p. ej. los chequeos del sistema en una base vacía)."""
    global _tabla_lista
    if not _tabla_lista:
        from django.db import connection

        _tabla_lista = modelo._meta.db_table in connection.introspection.table_names()
    return _tabla_lista


def institucion_por_defecto():
    """Valor por defecto de la FK `institucion` (devuelve la clave)."""
    from academico.models import Institucion

    usuario = contexto.usuario_actual()
    if getattr(usuario, "institucion_id", None):
        return usuario.institucion_id
    if not _tabla_existe(Institucion):
        return None
    pk = Institucion.objects.order_by("pk").values_list("pk", flat=True).first()
    if pk is None:  # instalación nueva sin institución cargada
        pk = Institucion.objects.create(nombre="Institución").pk
    return pk


def id_institucion(request):
    """Id de la institución del usuario, o None si es un superusuario sin institución (ve todas)."""
    return getattr(getattr(request, "user", None), "institucion_id", None)


def institucion_de(request):
    """
    Institución con la que trabaja el usuario. Nunca devuelve None: si todavía no hay ninguna cargada,
    devuelve una sin guardar con los valores por defecto del modelo.
    """
    from academico.models import Institucion

    iid = id_institucion(request)
    inst = None
    if iid:
        inst = Institucion.objects.filter(pk=iid).first()
    if inst is None:
        inst = Institucion.objects.order_by("pk").first()
    return inst or Institucion()


def filtrar(qs, request, campo="institucion"):
    """Filtra un queryset por la institución del usuario (`campo` es el camino hasta la institución)."""
    usuario = getattr(request, "user", None)
    iid = id_institucion(request)
    if iid is None and getattr(usuario, "is_superuser", False):
        return qs
    return qs.filter(**{campo: iid})


class PorInstitucionMixin:
    """
    Cada vista solo ve los datos de la institución del usuario.
    `campo_institucion` es el camino hasta la institución, ej. "seccion__anio_lectivo__institucion".
    Al crear, la institución se asigna sola (ver institucion_por_defecto).
    """

    campo_institucion = "institucion"

    def get_queryset(self):
        return filtrar(super().get_queryset(), self.request, self.campo_institucion)
