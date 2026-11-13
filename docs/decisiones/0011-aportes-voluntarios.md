# 0011 — Aportes voluntarios a la ACE

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
El módulo `aportes` modelaba una obligación: cuotas con vencimiento, deuda, "morosos", exoneraciones y
una planilla por sección que mostraba qué familias no habían pagado. El plan maestro (2.4, 2.5, 14.5 y
14.6) lo prohíbe: los aportes son voluntarios, no generan deuda ni restricciones, no se publican listas de
quienes no aportaron, y la ACE es una entidad distinta de la institución, con sus propios fondos y recibos.

## Decisión
- `AsociacionACE`: la ACE de cada institución (denominación, RUC, reconocimiento, contacto). Emite los recibos.
- `ConceptoAporte`: tipo (aporte social, donación monetaria, donación en especie, actividad, evento, otro) y
  **monto sugerido opcional**. Sin vencimientos, meses, cursos obligados ni exoneraciones.
- `Recibo` (antes `Pago`): a nombre del **aportante** (nombre y C.I.; tutor o alumno de referencia
  opcionales). Numeración correlativa por **ACE, serie y ejercicio**; importe en letras; código de
  verificación (HMAC); leyenda "No válido como factura"; destino restringido solo si el aportante lo pidió.
  Estados EMITIDO, ANULADO y REVERTIDO (con motivo, usuario y fecha); no se edita ni se borra; el número
  anulado no se reutiliza.
- `LineaRecibo` (antes `DetallePago`): concepto, monto y descripción (obligatoria en donaciones en especie).
- Reportes: panel con totales (por concepto, tipo, mes y medio) y rendición de lo recaudado en un período.
  Se eliminaron los reportes de morosos, la planilla por sección y las exoneraciones.
- Permisos: **la comisión de la ACE opera**; la **dirección solo consulta** (transparencia); el resto del
  personal no accede.
- Buscar familia (`/api/aportes/familias/`) devuelve solo nombres para completar el recibo, nunca si la
  familia aportó.

## Migración de datos
En tres pasos (estructura, datos, limpieza): se crea la ACE de cada institución; los recibos conservan su
número, quedan a nombre de quien los entregó (o "Familia de …") y como emitidos o anulados, con su código
de verificación; las cuotas mensuales quedan anotadas en la descripción. Las exoneraciones se eliminan
(presuponían una obligación); su historia queda en la auditoría.

## Pendiente
- El "ejercicio" de la ACE hoy coincide con el año lectivo; si su ejercicio contable es otro, se separa
  en la fase de tesorería.
- Estado BORRADOR del recibo (plan 14.6) no se implementó: los recibos se emiten directamente.
