# 0009 — Lista con borrador y confirmación, correcciones con motivo y anulación

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
El plan (7.4-7.6) pide guardar borrador y confirmar, que una sesión cerrada requiera permiso para
corregirse, que las correcciones guarden valor anterior, nuevo, motivo, usuario y fecha, que no se borren
marcas confirmadas, que se registre el origen de cada marca y quién creó y quién sincronizó.

## Decisión
- `SesionClase.estado`: BORRADOR → CONFIRMADA; ANULADA para una clase que no se dio o se cargó por error
  (con motivo, usuario y fecha). Nada se borra.
- El parámetro `confirmar` vale **sí por defecto**, para que las listas guardadas sin señal en los teléfonos
  (enviadas por versiones anteriores de la app) sigan funcionando igual.
- Cambiar marcas de una lista confirmada es una **corrección**: exige motivo (queda en la auditoría con
  valor anterior y nuevo) y la puede hacer **gestión**, o **su docente el mismo día de la clase**. Reenviar
  la misma lista sin cambios (sincronización repetida) no es una corrección.
- `GET /api/sesiones/{id}/historial/` muestra todos los cambios de la lista y de sus marcas.
- Las clases anuladas quedan fuera de todos los reportes mediante el administrador por defecto
  (`SesionClase.objects`, `RegistroAsistencia.objects`); `SesionClase.todas` y `RegistroAsistencia.todos`
  las incluyen. Los conteos por relación (`Count("asistencias")`) no pasan por el administrador y filtran
  explícitamente.
- Estado R (retiro anticipado) con hora de salida; cuenta como asistencia.
- `RegistroAsistencia.origen`: en línea, sin conexión, importación o corrección. `SesionClase.creado_por`
  (quien llamó lista primero) y `registrado_por` (último que guardó o sincronizó).

## Consecuencias
- Una lista corregida sin conexión al día siguiente por el docente será rechazada al sincronizar y
  quedará con el error visible en el teléfono; dirección puede corregirla.
- Quién puede corregir después del día de clase podría volverse configurable por institución más adelante.
