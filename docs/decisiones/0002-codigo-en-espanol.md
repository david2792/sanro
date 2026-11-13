# 0002 — Código y modelo de datos en español

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
El código existente usa nombres en español (`Matricula`, `SesionClase`, `Asignacion`). El plan maestro
nombra algunas tablas en inglés (`normative_rules`, `journal_entries`).

## Decisión
Todo el código, los modelos, los endpoints y la interfaz siguen en español. Los nombres del plan se
traducen. Equivalencias usadas hasta ahora:

| Plan maestro | SIGE |
|---|---|
| `normative_sources` | `FuenteNormativa` |
| `normative_rules` | `ReglaNormativa` |
| `normative_versions` | `VersionRegla` |
| `normative_rule_scopes` | alcance dentro de `VersionRegla` (niveles, especialidades, institución) |
| `normative_approvals` | campos de aprobación de `VersionRegla` |
| `normative_change_logs` | auditoría general (`nucleo.RegistroAuditoria`) |
| `journal_entries` / `journal_lines` | `AsientoContable` / `LineaAsiento` (fase de tesorería) |
| `chart_of_accounts` | `CuentaContable` (fase de tesorería) |

## Consecuencias
Coherencia con el código y con los usuarios. Esta tabla se amplía cuando se agreguen módulos.
