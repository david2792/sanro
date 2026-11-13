from . import contexto


class AuditoriaMiddleware:
    """Abre el contexto de auditoría de cada petición y lo cierra al terminar."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        usuario = getattr(request, "user", None)
        tokens = contexto.iniciar(usuario if getattr(usuario, "is_authenticated", False) else None, request)
        try:
            return self.get_response(request)
        finally:
            contexto.terminar(tokens)
