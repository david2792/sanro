# 0005 — Archivos privados con enlaces firmados

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
Los legajos, justificativos, permisos y planes anuales se servían en `/media/` sin autenticación:
cualquiera con el enlace podía abrirlos.

## Decisión
- Se quita el servicio público de `/media/`.
- Todos los `FileField` se devuelven en la API como `/api/archivos/<firma>/`: una firma
  (`django.core.signing`) con la ruta del archivo y el usuario que lo pidió, válida por 10 minutos.
- Solo quien puede leer el registro recibe el enlace, así que el permiso se hereda de la vista.
- Cada descarga queda en la auditoría (acción DESCARGAR).

## Consecuencias
- Un enlace compartido deja de funcionar a los 10 minutos.
- En producción, el servidor web no debe publicar la carpeta `media/`.
