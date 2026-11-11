# Sistema San Roque — Backend (Fase 1)

## Puesta en marcha (Windows, dentro de `servidor`)
```
venv\Scripts\activate
copy .env.ejemplo .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```
Admin: http://127.0.0.1:8000/admin/ · API: http://127.0.0.1:8000/api/

## Endpoints principales
| Uso | Método y URL |
|---|---|
| Login (devuelve access/refresh) | POST `/api/auth/token/` {username, password} |
| Renovar token | POST `/api/auth/refresh/` {refresh} |
| Usuario logueado y su rol | GET `/api/yo/` |
| Clases del docente (año activo) | GET `/api/asignaciones/mias/` |
| Lista de alumnos de una clase | GET `/api/asignaciones/{id}/lista/` |
| Días y horario de una clase | POST `/api/asignaciones/{id}/dias/` {dias_clase:[1,3], horario:[{dia:1, inicio:"07:00", fin:"07:40"}]} |
| Guardar lista (crea o actualiza) | POST `/api/sesiones/` |
| % asistencia de una sección | GET `/api/secciones/{id}/asistencia/` |
| % asistencia de un alumno | GET `/api/alumnos/{id}/asistencia/` |
| Tablero del día (director) | GET `/api/reportes/resumen-dia/?fecha=AAAA-MM-DD` |

CRUD: usuarios, alumnos, tutores, alumnos-tutores, documentos-alumno, docentes, instituciones,
anios-lectivos, etapas, dias-no-lectivos, niveles, especialidades, cursos, materias, plan-materias,
secciones, asignaciones, matriculas, sesiones, justificaciones, permisos-docentes.
Filtros por parámetro, ej.: `/api/matriculas/?seccion=3`, `/api/alumnos/?search=Benítez`.

### Guardar lista (POST /api/sesiones/)
```json
{
  "uuid": "generado-en-el-celular (opcional)",
  "asignacion": 5, "fecha": "2027-03-02", "hora_inicio": "07:00", "tema": "Hojas de cálculo",
  "registros": [{"matricula": 12, "estado": "P"}, {"matricula": 13, "estado": "A"}]
}
```
Estados: P presente, A ausente, T tardanza, J justificado. Reenviar la misma clase (mismo uuid
o misma asignación y fecha) la actualiza, no la duplica: sirve para sincronizar sin internet.

## Módulo pedagógico
| Uso | Método y URL |
|---|---|
| Unidades con capacidades e indicadores | GET `/api/unidades/?asignacion=5` |
| Crear unidad completa | POST `/api/unidades/` (ver ejemplo abajo) |
| Editar capacidades / indicadores | `/api/capacidades/`, `/api/indicadores/` |
| Clases de donde copiar la planificación | GET `/api/unidades/origenes/?asignacion=5` |
| Copiar unidades de otra clase u otro año | POST `/api/unidades/copiar/` {asignacion, unidades:[ids]} |
| Registrar lo desarrollado en la clase | POST `/api/registros-clase/` {sesion, unidad, capacidades:[ids], indicadores_evaluados:[ids], contenido, actividades, observaciones} |
| Cuaderno de cátedra de una materia | GET `/api/registros-clase/?sesion__asignacion=5` |
| Registro anecdótico | POST `/api/anecdoticos/` {asignacion, alumnos:[matriculas], fecha, hora, tipo, hecho, interpretacion, acciones, informado_a_tutor} |
| Historial anecdótico de un alumno | GET `/api/anecdoticos/?alumnos__alumno=12` |
| Crear trabajo con puntaje | POST `/api/instrumentos/` {asignacion, etapa, tipo, titulo, fecha, puntaje_total, indicadores:[ids]} |
| Ver / cargar puntajes del curso | GET o POST `/api/instrumentos/{id}/puntajes/` {puntajes:[{matricula, puntaje, recuperatorio, entrega_tardia, observacion}]} |
| Planilla de la etapa (logrado y %) | GET `/api/planilla/?asignacion=5&etapa=1` |
| Frases que el docente usa seguido | GET `/api/frases/?campo=actividades` (actividades, observaciones, interpretacion, acciones) |
| Ficha rápida del alumno en una clase | GET `/api/ficha/?asignacion=5&matricula=12` |
| Planificar una clase | POST `/api/planes-clase/` {asignacion, fecha, unidad, capacidades, indicadores, contenido, actividades, recursos} |
| Calendario del mes (clases, planificación, dadas, trabajos, feriados) | GET `/api/planes-clase/calendario/?asignacion=5&mes=2026-04` |
| Repartir temas, uno por clase libre | POST `/api/planes-clase/repartir/` {asignacion, unidad, desde, temas:["…"]} |
| No se dio una clase: correr todo una clase | POST `/api/planes-clase/correr/` {asignacion, desde} |
| Evaluaciones de todas las materias de una sección, con la regla del colegio (máximo por día, qué cuenta, si bloquea; se configura en la Institución) | GET `/api/evaluaciones/?seccion=3&desde=2026-04-06&hasta=2026-04-11` |
| Sugerencias de dirección (plan anual o una clase) | GET/POST `/api/sugerencias/?asignacion=5&sobre=PLAN_ANUAL` · `?leida=false` · POST `/api/sugerencias/{id}/leida/` |
| Gestión: avance de la planificación de cada materia en el mes | GET `/api/planificacion/control/?mes=2026-04` |

Las clases del calendario salen de los días de clase de la materia, dentro del año lectivo y sin los días no lectivos.
Cuando se registra el desarrollo de una clase que estaba planificada, el formulario se completa con lo planificado.

Ejemplo de unidad completa:
```json
{
  "asignacion": 5, "etapa": 1, "numero": 1, "titulo": "Hojas de cálculo",
  "competencia": "Utiliza herramientas informáticas para...",
  "capacidades": [
    {"descripcion": "Aplica fórmulas básicas",
     "indicadores": [{"descripcion": "Escribe fórmulas de suma"}, {"descripcion": "Usa referencias de celdas"}]}
  ]
}
```
Tipos de trabajo: PRUEBA, PRACTICO, INVESTIGACION, EXPOSICION, CARPETA, PROYECTO, LISTA_COTEJO, RUBRICA, OTRO.
Tipos de anecdótico: POSITIVO, NEGATIVO, NEUTRO. Un puntaje vacío (null) significa que el alumno no entregó.
En la planilla cuenta el mayor entre `puntaje` y `recuperatorio`; `marcas` indica R (contó el recuperatorio) y T (entrega tardía).
Los campos de puntaje que no se envían se conservan (enviar solo `puntaje` no borra el recuperatorio).

## Aportes de padres (ACES)
Usuarios con rol ACES (y gestión). Montos en guaraníes, sin decimales.
| Uso | Método y URL |
|---|---|
| Conceptos (cuota mensual, aporte único…) | `/api/aportes/conceptos/` {nombre, periodicidad MENSUAL/UNICO, monto, mes_inicio, mes_fin, dia_vencimiento, fecha_vencimiento, cursos:[ids]} |
| Exoneraciones | `/api/aportes/exoneraciones/` {matricula, concepto, motivo} |
| Registrar recibo | POST `/api/aportes/pagos/` {matricula, fecha, medio, referencia, pagado_por, detalles:[{concepto, mes, monto}]} |
| Anular recibo (no se borran ni editan) | POST `/api/aportes/pagos/{id}/anular/` {motivo} |
| Panel con totales y gráficos | GET `/api/aportes/panel/` |
| Resumen por sección / planilla de una sección | GET `/api/aportes/secciones/` · `/api/aportes/secciones/{id}/` |
| Rendición de recaudación | GET `/api/aportes/reportes/recaudacion/?desde=&hasta=&seccion=` |
| Alumnos con cuotas vencidas | GET `/api/aportes/reportes/morosos/?seccion=` |

Lo habitual es un **monto total** (periodicidad UNICO, ej. 200000) que la familia paga en partes;
sin `fecha_vencimiento` se puede completar hasta el fin del año lectivo y recién ahí el saldo cuenta como vencido.
Cada alumno informa `pagado`, `saldo`, `deuda` (lo vencido sin pagar) y `avance`
(COMPLETO, PARCIAL, SIN_PAGOS, EXONERADO). `/api/aportes/reportes/morosos/?incluir=saldo` lista todos los saldos.
Los recibos se numeran solos (correlativo por año). Una cuota puede pagarse en partes.
Quien se matricula a mitad de año no debe los meses anteriores a su matrícula.

## Reporte de ausencias
GET `/api/reportes/ausencias/?desde=&hasta=` (gestión): inasistencia por sección, curso, mes, día de la semana,
materia y alumnos con más ausencias. Inasistencia = (ausentes + justificadas) / registros.

## Roles
- DIRECTOR, COORDINADOR, SECRETARIA: administran todo.
- DOCENTE: consulta datos y solo llama lista en sus propias clases.
- TUTOR: reservado para el portal de padres (fase 3).
- ACES: solo el módulo de aportes; no ve asistencia, notas ni legajos.

## Pruebas
`python manage.py test`
