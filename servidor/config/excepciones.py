from django.db.models import ProtectedError, RestrictedError
from django.db.utils import IntegrityError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def manejar_excepciones(exc, context):
    """Convierte errores de integridad en mensajes claros (400) en vez de error 500."""
    if isinstance(exc, (ProtectedError, RestrictedError)):
        return Response(
            {"detail": "No se puede eliminar: este registro ya se usa en otros datos del sistema."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if isinstance(exc, IntegrityError):
        return Response(
            {"detail": "Ya existe un registro con esos datos o falta un dato obligatorio."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return exception_handler(exc, context)
