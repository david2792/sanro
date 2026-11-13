"""Código de verificación de un recibo: permite comprobar que un recibo impreso no fue alterado."""
import hashlib
import hmac

from django.conf import settings


def codigo_verificacion(ace_id, serie, ejercicio, numero, total):
    mensaje = f"{ace_id}|{serie}|{ejercicio}|{numero}|{total}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), mensaje, hashlib.sha256).hexdigest()[:10].upper()
