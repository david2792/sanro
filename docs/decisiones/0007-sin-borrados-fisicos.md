# 0007 — Sin borrados físicos de registros académicos y financieros

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
Borrar una sesión de clase eliminaba en cascada sus marcas de asistencia, y borrar un trabajo
eliminaba los puntajes cargados.

## Decisión
- `RegistroAsistencia → SesionClase`, `Puntaje → Instrumento` y `DetallePago → Pago` pasan a
  `on_delete=PROTECT`: no se puede borrar el registro padre si tiene datos cargados.
- La API no ofrece borrado de sesiones de clase. Un trabajo sin puntajes sí se puede borrar.
- Los recibos ya se anulaban sin borrarse; se mantiene.
- La anulación con motivo de sesiones de clase se implementa en la Fase 1, junto con el flujo de
  borrador y confirmación de asistencia.

## Consecuencias
Un error de carga se corrige editando (queda auditado), no borrando.
