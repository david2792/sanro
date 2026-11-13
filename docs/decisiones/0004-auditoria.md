# 0004 — Auditoría propia por señales de Django

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
El plan exige registrar valor anterior, valor nuevo, usuario, fecha y motivo de las correcciones, y
auditar descargas de archivos sensibles. Opciones: `django-simple-history` (una tabla histórica por
modelo) o un registro propio único.

## Decisión
App `nucleo` con el modelo `RegistroAuditoria`: institución, usuario, fecha, acción
(CREAR, MODIFICAR, ELIMINAR, DESCARGAR, otras), modelo, id del objeto, cambios
(`{campo: [antes, después]}`), motivo e IP.

- Señales `pre_save`, `post_save` y `post_delete` sobre todos los modelos de las apps del sistema.
- El usuario se toma de una variable de contexto (`nucleo.contexto`). La abre
  `nucleo.middleware.AuditoriaMiddleware` en cada petición (usuario de sesión, p. ej. el admin) y la
  actualiza cada vista de DRF apenas autentica el JWT (envoltura de `APIView.initial` en `NucleoConfig.ready`).
- Cambios hechos fuera de una petición (comandos, migraciones) quedan con usuario vacío = "sistema".
- El motivo se envía en la cabecera `X-Motivo` (obligatorio en correcciones a partir de la Fase 1).
- No se guardan contraseñas ni campos técnicos (`password`, `last_login`, marcas de tiempo automáticas).
- El registro es de solo lectura: sin edición ni borrado por API ni admin.

## Consecuencias
- Sin dependencias nuevas y una sola tabla para consultar.
- `QuerySet.update()` y `bulk_create` no disparan señales: no usarlos en datos académicos o registrar
  el evento a mano con `registrar_evento`.
- Los cambios en relaciones muchos-a-muchos no quedan detallados todavía (pendiente en ROADMAP).
