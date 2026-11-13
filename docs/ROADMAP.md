# Hoja de ruta SIGE

Estados: ⬜ pendiente · 🔄 en curso · ✅ terminado (cumple criterios de aceptación).

## Fase 0 — Cimientos ✅ (13/11/2026)

| Paso | Entregable | Criterio de aceptación | Estado |
|---|---|---|---|
| 0.1 | Plan maestro, `CLAUDE.md`, ROADMAP y registro de decisiones | Archivos en `docs/` y raíz | ✅ |
| 0.2 | CI en GitHub Actions | Pruebas del backend, lint y build del frontend corren en cada push y PR | ✅ (verificado en local; confirmar la primera corrida en GitHub) |
| 0.3 | Auditoría base | Crear, modificar y borrar quedan registrados con usuario, cambios y motivo; probado | ✅ |
| 0.4 | Archivos privados | `/media/` no es público; descarga por enlace firmado y vencible, auditada; probado | ✅ |
| 0.5 | Base para varias instituciones | FK en modelos raíz, datos existentes migrados, vistas filtradas; probado con dos instituciones | ✅ |
| 0.6 | Registro normativo | Modelos, resolutor de reglas con vigencia y alcance, fuentes del plan cargadas como "pendientes de verificar"; probado | ✅ |
| 0.7 | Sin borrados físicos | Asistencia, puntajes y recibos protegidos contra borrado; probado | ✅ |

### Pendientes conocidos que deja la Fase 0
- Validar en los serializers que las claves foráneas enviadas pertenezcan a la institución del usuario
  (necesario **antes** de alojar una segunda institución).
- Revisar los reportes que reciben identificadores (`?asignacion=`, `?seccion=`) para que validen la institución.
- Auditoría detallada de cambios en relaciones muchos-a-muchos.
- Pantalla de consulta de auditoría y del registro normativo en el frontend (hoy: API y admin).
- El comando `importar_alumnos` busca secciones del año activo sin filtrar por institución.
- Mapear cada `Nivel`/`Especialidad` del colegio a las categorías del registro normativo
  (Tercer Ciclo / Media; Científico / Técnico) para resolver reglas automáticamente.

## Fase 1 — Asistencia, justificativos y matrícula con historial 🔄
- ✅ 1.1 Justificativo como proceso aparte con estados; la ausencia no se reemplaza; aprobación parcial;
  sin borrado (decisión 0008). Pantalla `Gestión › Justificativos`.
- ✅ 1.1 Quitar el estado `J` de la marca de asistencia (datos existentes migrados a justificativos aprobados).
- ✅ 1.2 Asistencia con borrador y confirmación; correcciones de listas confirmadas con motivo (decisión 0009).
- ✅ 1.2 Anulación de clases con motivo; historial de cambios de cada lista.
- ✅ 1.2 Retiro anticipado; origen de la marca; quién creó y quién sincronizó.
- Matrícula: estados del plan (preinscripto, pendiente de documentación, egresado, anulado) y
  historial de cambios de sección sin sobrescribir.
- Estados del año lectivo (preparación, activo, cierre pendiente, cerrado, archivado).

## Fase 2 — Aportes voluntarios a la ACE ⬜
- Rediseñar `aportes`: aportes voluntarios y donaciones; sin vencimientos, deuda, morosos ni exoneraciones.
- Recibos emitidos por la ACE a nombre del aportante; serie y ejercicio; importe en letras.
- Reportes de recaudación sin listas de familias que no aportaron.

## Fase 3 — Evaluación y RSA ⬜
- Catálogo curricular versionado (competencias, capacidades, indicadores oficiales).
- Evidencias, rúbricas y listas de cotejo con criterios y niveles.
- RSA con observaciones sucesivas.
- Calificación de etapa y final mediante `resolver_regla`, guardando la versión aplicada.
- Flujo de confirmación y referencia de carga en RUE (manual).

## Fases siguientes ⬜
Gestión documental · Entrevistas y seguimiento confidencial · ACE institucional (asociación, socios,
comisión, asambleas) · Tesorería con partida doble · Inventario · Rendición de cuentas ·
Portal de familias · Notificaciones · Bachillerato Técnico y Pasantía · Despliegue en producción con HTTPS.
