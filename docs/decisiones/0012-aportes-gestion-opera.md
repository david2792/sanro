# 0012 — Dirección y secretaría también operan los aportes, con registro de quién

**Fecha:** 2026-11-13 · **Estado:** Aceptada (sustituye la parte de permisos de la 0011)

## Contexto
La decisión 0011 dejaba la operación de los aportes solo en la comisión de la ACE y a la dirección como
consulta, siguiendo el plan maestro 2.4. La institución pidió que **secretaría y dirección** puedan consultar
y también registrar y modificar aportes, siempre que quede constancia de quién lo hizo.

## Decisión
- Operan los aportes (emitir, anular, revertir recibos; conceptos y datos de la ACE): comisión de la ACE,
  dirección, secretaría y superusuario. Coordinación y docentes no acceden.
- Trazabilidad: cada recibo guarda quién lo emitió (`registrado_por`) y quién lo anuló o revirtió
  (`anulado_por`, con fecha y motivo); todo cambio queda en la auditoría.
  `GET /api/aportes/recibos/{id}/historial/` y la pantalla de cada recibo muestran ese historial.
- Se mantienen las reglas de la 0011: los recibos no se editan ni se borran, los aportes son voluntarios y
  no hay listas de familias que no aportaron.

## Consecuencias
- La separación de permisos entre institución y ACE del plan (2.4) queda flexibilizada por decisión de la
  institución; la separación de **fondos** (recibos emitidos por la ACE) se mantiene.
