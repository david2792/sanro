# 0006 — Registro normativo versionado

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
El plan (2.3 y 3.5) exige que las reglas de evaluación, promoción y exigencia estén parametrizadas,
versionadas, con fuente normativa, vigencia y aprobación, y que cada cálculo guarde la versión aplicada.

## Decisión
App `normativa` con:
- `FuenteNormativa`: ley, resolución o circular (número, año, organismo, enlace, archivo, estado de
  verificación contra copia oficial).
- `ReglaNormativa`: catálogo por código (por ejemplo `EVAL_EXIGENCIA_MINIMA`), con descripción y tipo de valor.
- `VersionRegla`: valor (JSON), fuente y artículo, alcance (institución, niveles, especialidades),
  vigencia desde/hasta, estado (BORRADOR, REVISION, APROBADA, SUSTITUIDA, DEROGADA), aprobación
  (usuario, fecha, documento).
- Servicio `resolver_regla(codigo, institucion, fecha, nivel, especialidad)` que devuelve **solo**
  versiones APROBADAS y vigentes, eligiendo la de alcance más específico.

Las fuentes citadas en el plan se cargan como "pendientes de verificar"; **no se cargan valores de
reglas**: los valores los define y aprueba la institución con la copia oficial de la norma.

## Consecuencias
- Los parámetros institucionales de alerta (asistencia mínima y logro mínimo de la institución) siguen
  siendo configuración institucional (plan 7.7), pero sin valores por defecto repetidos en el código.
- Los cálculos de calificación y promoción que se construyan desde la fase de evaluación deben usar
  `resolver_regla` y guardar la versión aplicada.
