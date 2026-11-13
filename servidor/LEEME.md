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

## Aportes voluntarios a la ACE
La comisión de la ACE (rol ACES) opera; la dirección solo consulta. Montos en guaraníes, sin decimales.
Los aportes son voluntarios: no hay cuotas, vencimientos, deuda ni morosos (docs/decisiones/0011).
| Uso | Método y URL |
|---|---|
| Datos de la ACE (emisora de los recibos) | GET/PUT `/api/aportes/ace/` {denominacion, ruc, reconocimiento, domicilio, telefono, email} |
| Conceptos (monto sugerido opcional) | `/api/aportes/conceptos/` {nombre, tipo, monto_sugerido, descripcion, activo} |
| Buscar familia para el recibo | GET `/api/aportes/familias/?q=` (mínimo 3 letras; solo nombres) |
| Emitir recibo | POST `/api/aportes/recibos/` {fecha, aportante_nombre, aportante_documento, tutor, matricula, medio, referencia, destino_restringido, observacion, serie, lineas:[{concepto, monto, descripcion}]} |
| Anular / revertir (no se editan ni borran) | POST `/api/aportes/recibos/{id}/anular/` · `/revertir/` {motivo} |
| Panel con totales | GET `/api/aportes/panel/` |
| Rendición de lo recaudado | GET `/api/aportes/reportes/recaudacion/?desde=&hasta=` |

Tipos de concepto: APORTE_SOCIAL, DONACION, DONACION_ESPECIE (exige descripción), ACTIVIDAD, EVENTO, OTRO.
Los recibos se numeran solos por ACE, serie y ejercicio, e incluyen el importe en letras y un código de verificación.

## Reporte de ausencias
GET `/api/reportes/ausencias/?desde=&hasta=` (gestión): inasistencia por sección, curso, mes, día de la semana,
materia y alumnos con más ausencias. Inasistencia = (ausentes + justificadas) / registros.

## Núcleo (Fase 0)
| Uso | Método y URL |
|---|---|
| Historial de cambios (solo gestión, de su institución) | GET `/api/auditoria/?modelo=asistencia.registroasistencia&objeto_id=5&usuario=&accion=MODIFICAR&desde=&hasta=` |
| Descargar un archivo (enlace firmado, vence a los 10 min) | GET `/api/archivos/<firma>/` — la API ya devuelve este enlace en cada campo de archivo |

- Todo alta, cambio o baja queda auditado con usuario, valor anterior y nuevo. El motivo de una corrección se
  envía en la cabecera `X-Motivo`.
- `/media/` ya no se publica: los legajos y justificativos solo se abren con el enlace firmado.
- Cada usuario trabaja con los datos de **su institución**. Un superusuario sin institución ve todas.
- Las clases dadas, los puntajes cargados y los recibos no se borran (se corrigen; en la Fase 1 se anulan con motivo).

## Registro normativo
| Uso | Método y URL |
|---|---|
| Fuentes (leyes, resoluciones) | `/api/normativa/fuentes/` · POST `/api/normativa/fuentes/{id}/verificar/` |
| Catálogo de reglas (solo superusuario lo modifica) | `/api/normativa/reglas/` {codigo, nombre, area, tipo_valor} |
| Versiones de una regla | `/api/normativa/versiones/` {regla, valor, fuente, articulo, nivel, modalidad, vigente_desde, vigente_hasta} |
| Aprobar una versión (exige fuente) | POST `/api/normativa/versiones/{id}/aprobar/` |
| Qué versión se aplica | GET `/api/normativa/resolver/?codigo=X&fecha=AAAA-MM-DD&nivel=EM&modalidad=TECNICO` |

Solo se aplican versiones **aprobadas y vigentes**; gana la de alcance más específico (institución, nivel, modalidad).
Si no hay ninguna, el sistema no inventa un valor: responde 404. Ver `docs/decisiones/0006-registro-normativo.md`.

## Roles
- DIRECTOR, COORDINADOR, SECRETARIA: administran todo.
- DOCENTE: consulta datos y solo llama lista en sus propias clases.
- TUTOR: reservado para el portal de padres (fase 3).
- ACES: solo el módulo de aportes (opera); no ve asistencia, notas ni legajos. La dirección consulta los aportes sin modificarlos.

## Pruebas
`python manage.py test`
