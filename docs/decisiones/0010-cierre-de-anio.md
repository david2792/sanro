# 0010 — Estados del año lectivo y bloqueo de los años cerrados

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
El plan (módulo 1) define los estados del año lectivo (preparación, activo, cierre pendiente, cerrado,
archivado) y exige que un año cerrado no se modifique sin reapertura autorizada y auditada.

## Decisión
- `AnioLectivo.estado` con transiciones fijas: preparación → activo → cierre pendiente → cerrado →
  archivado. Desde cierre pendiente se puede volver a activo. **Reabrir** un año cerrado (volver a cierre
  pendiente) lo hace solo la dirección y exige motivo, que queda en la auditoría. Archivado es definitivo.
- `activo` sigue siendo "el año de trabajo" (uno por institución) y solo puede estarlo un año activo o en
  cierre pendiente. Crear un año marcado como de trabajo lo deja activo.
- `academico/cierre.py` impide crear, modificar o borrar cualquier dato de un año cerrado o archivado
  (secciones, matrículas, asistencia, justificativos, planificación, evaluaciones, aportes), mediante
  señales y un mapa de cómo llegar desde cada modelo a su año. La API responde 403 con un mensaje claro.
- Migración: el año de trabajo queda activo; los años pasados, en cierre pendiente (no se cierran solos,
  para no bloquear correcciones que pudieran faltar); los futuros, en preparación.

## Consecuencias
- `QuerySet.update()` y los cambios en relaciones muchos-a-muchos no pasan por el bloqueo (igual que la
  auditoría): no usarlos sobre datos de un año.
- Al agregar un modelo que pertenezca a un año, hay que sumarlo a `RUTAS` en `academico/cierre.py`.
