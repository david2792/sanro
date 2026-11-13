# 0008 — Justificativos como trámite; la ausencia no se reemplaza

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
Antes, guardar un justificativo cambiaba las ausencias del rango a "J" (se perdía el dato de que
hubo ausencia) y se aprobaba solo. El docente también podía marcar "J" en la lista. El plan maestro
(7.3 y módulo 5) exige que la justificación sea un proceso separado, con estados, revisión y decisión,
que no reemplace la ausencia ni se apruebe por la mera existencia de un archivo.

## Decisión
- `RegistroAsistencia.estado` solo admite P, A y T. Se agrega `justificada` (no editable), que calcula
  `asistencia.justificaciones.recalcular()` a partir de los justificativos aprobados.
- `Justificacion` tiene estados BORRADOR, PRESENTADO, EN_REVISION, REQUIERE_INFO, APROBADO,
  APROBADO_PARCIAL, RECHAZADO y CANCELADO; origen (secretaría, docente, familia); fecha de presentación,
  quién lo presentó, quién decidió, cuándo y por qué.
- `AusenciaJustificada` vincula cada ausencia con el trámite y guarda la decisión sobre ella
  (permite aprobar en parte).
- Acciones: `revisar`, `decidir` (APROBADO, APROBADO_PARCIAL con lista, RECHAZADO, REQUIERE_INFO;
  motivo obligatorio salvo para aprobar todo) y `cancelar` (con motivo). No hay borrado.
- La "J" del docente en la lista pasa a significar **ausente con aviso**: el servidor guarda "A" y abre
  un justificativo PRESENTADO (origen docente) para que gestión decida. El servidor sigue aceptando "J"
  porque puede haber listas guardadas sin señal en los teléfonos.
- Los reportes siguen mostrando "justificadas" (ausencias con justificativo aprobado) y "ausentes"
  (sin justificar), con las mismas cifras que antes.

## Migración de datos
Lo anterior se convierte sin perder nada: cada justificativo previo queda APROBADO (así lo trataba el
sistema) y vinculado a sus ausencias; cada "J" pasa a "A" con un justificativo APROBADO de origen
docente que conserva su observación. La conversión va en una migración aparte (0006) porque PostgreSQL
no permite crear índices en la misma transacción en que se modifican filas.

## Consecuencias
- Las ausencias registradas después de aprobar un justificativo no se justifican solas: se suman al
  trámite si sigue abierto; si ya se decidió, hace falta uno nuevo.
- El motivo del justificativo no se muestra al docente (solo el estado), para no exponer datos sensibles.
