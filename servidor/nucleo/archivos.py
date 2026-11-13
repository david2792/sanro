"""
Archivos privados: la API nunca entrega la ruta real de /media/, sino un enlace firmado que vence.
Quien puede leer el registro recibe el enlace; la descarga queda auditada.
"""
import mimetypes
import os

from django.core import signing
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpResponse
from django.urls import reverse
from rest_framework import serializers

SAL = "sige.archivos"
VIGENCIA_SEGUNDOS = 10 * 60
# Tipos que el navegador puede mostrar sin riesgo; el resto se descarga.
EXTENSIONES_EN_LINEA = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"}


def firmar(nombre, usuario_id=None):
    return signing.dumps({"r": nombre, "u": usuario_id}, salt=SAL, compress=True)


def enlace(nombre, request=None):
    usuario_id = getattr(getattr(request, "user", None), "pk", None)
    url = reverse("descargar_archivo", args=[firmar(nombre, usuario_id)])
    return request.build_absolute_uri(url) if request is not None else url


class ArchivoPrivadoField(serializers.FileField):
    """FileField que acepta subidas igual que siempre, pero se muestra como enlace firmado."""

    def to_representation(self, value):
        if not value:
            return None
        return enlace(value.name, self.context.get("request"))


def descargar_archivo(request, firma):
    from personas.models import Usuario

    from .auditoria import registrar_evento
    from .models import RegistroAuditoria

    try:
        datos = signing.loads(firma, salt=SAL, max_age=VIGENCIA_SEGUNDOS)
    except signing.SignatureExpired:
        return HttpResponse("El enlace venció. Volvé a abrir el archivo desde el sistema.", status=410,
                            content_type="text/plain; charset=utf-8")
    except signing.BadSignature:
        raise Http404
    nombre = datos.get("r") or ""
    if not nombre or not default_storage.exists(nombre):
        raise Http404
    usuario = Usuario.objects.filter(pk=datos.get("u")).first() if datos.get("u") else None
    registrar_evento(RegistroAuditoria.Accion.DESCARGAR, modelo="archivo", objeto_id=nombre[-64:],
                     descripcion=nombre, usuario=usuario, motivo="")
    extension = os.path.splitext(nombre)[1].lower()
    respuesta = FileResponse(
        default_storage.open(nombre, "rb"),
        as_attachment=extension not in EXTENSIONES_EN_LINEA,
        filename=os.path.basename(nombre),
        content_type=mimetypes.guess_type(nombre)[0] or "application/octet-stream",
    )
    respuesta["Cache-Control"] = "private, no-store"
    return respuesta
