# 0001 — Evolucionar `sanro` hacia SIGE en lugar de reescribirlo

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
El repositorio `sanro` ya tiene una base funcional (Django + DRF + PostgreSQL, React PWA) que cubre
estructura académica, asistencia por clase con modo sin conexión, planificación y evaluación básica,
con 24 pruebas automáticas. El plan maestro SIGE amplía el alcance y fija principios que el código
actual no cumple en tres puntos: aportes modelados como deuda, justificación que reemplaza la ausencia
y ausencia de historial/auditoría.

## Decisión
Mantener la stack y el código existentes y hacerlos evolucionar por fases. Primero los cimientos
(Fase 0), luego corregir los choques de diseño (Fases 1 y 2) y recién después sumar módulos nuevos.

## Consecuencias
- Cada cambio de modelo requiere migraciones que conserven los datos.
- Los módulos que contradicen el plan (aportes, justificativos) se rediseñan, no se parchean.
