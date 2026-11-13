"""
Usuario y petición en curso, para que la auditoría sepa quién hizo cada cambio.

El middleware abre el contexto en cada petición (con el usuario de sesión, p. ej. el admin) y las
vistas de DRF lo actualizan con el usuario autenticado por JWT (ver NucleoConfig.ready).
"""
from contextvars import ContextVar

_usuario = ContextVar("sige_usuario", default=None)
_peticion = ContextVar("sige_peticion", default=None)


def iniciar(usuario=None, peticion=None):
    return _usuario.set(usuario), _peticion.set(peticion)


def terminar(tokens):
    _usuario.reset(tokens[0])
    _peticion.reset(tokens[1])


def fijar_usuario(usuario):
    if usuario is not None and getattr(usuario, "is_authenticated", False):
        _usuario.set(usuario)


def usuario_actual():
    return _usuario.get()


def motivo_actual():
    """Motivo del cambio enviado por el cliente en la cabecera X-Motivo."""
    peticion = _peticion.get()
    if peticion is None:
        return ""
    return (peticion.headers.get("X-Motivo") or "").strip()[:250]


def ip_actual():
    peticion = _peticion.get()
    return peticion.META.get("REMOTE_ADDR") if peticion is not None else None
