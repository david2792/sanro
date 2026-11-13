# SIGE --- Sistema Integral de Gestión Escolar

## Plan maestro de producto, arquitectura, base de datos e implementación con Claude Code

**Versión:** 1.0\
**Fecha:** 13 de noviembre de 2026\
**País objetivo:** República del Paraguay\
**Ámbito inicial:** institución con Tercer Ciclo de la EEB y Educación
Media\
**Escalabilidad:** arquitectura multiinstitucional\
**Estado:** especificación funcional y técnica para iniciar el
desarrollo

------------------------------------------------------------------------

## 0. Uso de este documento con Claude Code

Este archivo es el documento maestro del proyecto. Debe mantenerse en la
raíz del repositorio como `docs/PLAN_MAESTRO_SIGE.md`.

Claude Code no debe intentar desarrollar todo el sistema en una sola
ejecución. El trabajo se divide en fases, módulos y entregables
verificables.

### Reglas de trabajo para Claude Code

1.  Leer el documento completo antes de modificar el proyecto.
2.  Inspeccionar el repositorio y describir su estado antes de crear
    archivos.
3.  Crear o actualizar `CLAUDE.md` con reglas permanentes.
4.  Trabajar por funcionalidades verticales: migración, modelo,
    validación, autorización, servicio, endpoint, interfaz, pruebas y
    documentación.
5.  No inventar normas, reglas de calificación, integraciones oficiales
    ni datos reales.
6.  No colocar reglas normativas como números mágicos en el código.
7.  No eliminar registros académicos o financieros confirmados.
8.  Ejecutar pruebas y análisis estático después de cada entrega.
9.  Mantener actualizado el roadmap y el registro de decisiones
    técnicas.
10. No declarar terminada una fase si no cumple sus criterios de
    aceptación.

### Prompt inicial para Claude Code

``` text
Lee docs/PLAN_MAESTRO_SIGE.md completo. Estamos desarrollando SIGE,
un Sistema Integral de Gestión Escolar para instituciones paraguayas
con Tercer Ciclo de EEB y Educación Media.

Primero inspecciona el repositorio, identifica el stack y presenta un
diagnóstico. No programes todos los módulos de una vez.

Propón la arquitectura inicial, estructura de carpetas, estrategia
multiinstitucional, modelo de seguridad, esquema inicial PostgreSQL
y plan de implementación del MVP.

El sistema es complementario al RUE y Paraguay Aprende. No asumas
que existen APIs oficiales disponibles. No automatices el acceso a
sistemas MEC mediante scraping ni almacenes contraseñas de docentes.

Las reglas de evaluación deben estar versionadas por nivel, modalidad,
año y normativa. Las operaciones ACE deben estar separadas de los
fondos institucionales. Los aportes sociales deben manejarse conforme
a su carácter voluntario y no pueden bloquear matrícula.

Presenta primero el diagnóstico y el plan de Fase 0. No modifiques
archivos hasta que el plan sea aprobado.
```

------------------------------------------------------------------------

# PARTE I --- VISIÓN Y ALCANCE

## 1. Resumen ejecutivo

SIGE será una aplicación web para administrar procesos académicos,
administrativos, documentales y financieros de una institución educativa
paraguaya.

Debe cubrir:

-   Tercer Ciclo EEB: 7.º, 8.º y 9.º grados.
-   Educación Media: 1.º, 2.º y 3.º cursos.
-   Bachillerato Científico.
-   Bachillerato Técnico y especialidades.
-   Turnos y secciones.
-   Matrícula y trayectoria escolar.
-   Asistencia diaria y por clase.
-   Ausencias, tardanzas, retiros y justificativos.
-   Planificación curricular.
-   Competencias, capacidades e indicadores.
-   Instrumentos y evidencias.
-   Registro de Secuencia de Aprendizaje (RSA).
-   Calificaciones, etapas y recuperación.
-   Documentación obligatoria.
-   Entrevistas y seguimiento de estudiantes.
-   Gestión de ACE.
-   Aportes voluntarios, recibos y donaciones.
-   Caja, bancos, ingresos y egresos.
-   Inventario.
-   Rendición de cuentas.
-   Reportes y dashboards.
-   Portal de padres o tutores.
-   Auditoría, seguridad y respaldos.

### 1.1. Objetivo general

Centralizar la información institucional en una plataforma segura y
trazable que permita documentar el proceso educativo, hacer seguimiento
de estudiantes, administrar procesos de la ACE y generar informes con
respaldo.

### 1.2. Objetivos específicos

1.  Reducir duplicación de planillas y registros.
2.  Estandarizar los procedimientos documentales.
3.  Relacionar planificación, capacidad, indicador, evidencia,
    instrumento y resultado.
4.  Facilitar asistencia y gestión de justificativos.
5.  Detectar inasistencias y dificultades de aprendizaje.
6.  Producir informes por estudiante, sección, disciplina, etapa y año.
7.  Separar recursos institucionales y fondos ACE.
8.  Trazar ingresos, egresos, donaciones y bienes.
9.  Generar rendiciones con comprobantes.
10. Mantener un archivo digital con permisos y versiones.
11. Facilitar la preparación de documentación para supervisión.
12. Adaptarse a cambios normativos sin reescribir el sistema.

## 2. Principios de diseño no negociables

### 2.1. Sistema complementario, no sustituto del MEC

SIGE no es el RUE, no es Paraguay Aprende y no es un sistema oficial del
MEC.

Debe registrar y sistematizar información institucional, generar
reportes internos y facilitar la preparación de datos para sistemas
oficiales.

No se debe:

-   Presentar una libreta interna como libreta oficial del MEC.
-   Presentar una calificación interna como calificación confirmada en
    RUE.
-   Afirmar que existe sincronización automática sin API, autorización y
    documentación oficial.
-   Automatizar acceso a sistemas oficiales mediante scraping.
-   Guardar contraseñas de docentes para operar sistemas MEC.
-   Alterar datos oficiales sin autorización.

Una integración futura será un módulo independiente y documentado.

### 2.2. Evidencia antes que calificación

Toda valoración debe poder rastrearse hasta:

1.  Planificación.
2.  Competencia o capacidad.
3.  Indicador.
4.  Actividad evaluativa.
5.  Evidencia.
6.  Instrumento.
7.  Criterio.
8.  Resultado.
9.  Retroalimentación.
10. Decisión pedagógica.

No generar calificación final sin cumplir las reglas aplicables.

### 2.3. Normativa configurable y versionada

Las reglas de evaluación, promoción, exigencia, períodos y documentos
deben estar parametrizadas.

Cada regla debe incluir:

-   Código y descripción.
-   Fuente normativa y artículo.
-   Nivel y modalidad aplicables.
-   Fecha inicial y final de vigencia.
-   Versión.
-   Estado: borrador, revisión, aprobada, sustituida o derogada.
-   Responsable y fecha de aprobación.
-   Documento de respaldo.

No colocar valores como `70`, `2`, `4`, `5` ni fórmulas de promoción
directamente en múltiples componentes. Deben estar en reglas
configurables, versionadas y probadas.

### 2.4. Separación de responsabilidades

La institución y la ACE deben mantener datos, permisos y registros
financieros separados.

La dirección administra la gestión institucional. La ACE administra su
asociación y fondos conforme a estatutos y normativa aplicable.

Compartir la identificación de personas o institución no significa
compartir permisos ni cuentas contables.

### 2.5. No discriminación por aportes

Los aportes deben modelarse como aportes voluntarios y donaciones según
corresponda.

No crear deuda obligatoria por un aporte social sugerido. No generar
bloqueos, sanciones, restricciones de matrícula, asistencia, acceso a
clases, calificaciones o documentos por ausencia de aportes.

No publicar listas de familias que no aportaron.

### 2.6. Privacidad desde el diseño

El sistema trata datos de menores, responsables familiares y
eventualmente datos sensibles.

Aplicar minimización, permisos granulares, almacenamiento privado y
auditoría. Los justificativos médicos no deben requerir ni mostrar
diagnósticos detallados si no son necesarios para el procedimiento
administrativo.

------------------------------------------------------------------------

# PARTE II --- MARCO NORMATIVO

## 3. Registro normativo inicial

Esta sección orienta el desarrollo; no sustituye revisión jurídica ni
consulta a la Supervisión Educativa.

Antes de activar un procedimiento normativo en producción, el
responsable institucional debe obtener y validar la versión oficial
vigente, sus modificaciones, circulares y calendario aplicable.

### 3.1. Educación y gestión institucional

  -----------------------------------------------------------------------
  Norma o documento       Área                    Tratamiento en SIGE
  ----------------------- ----------------------- -----------------------
  Ley N.º 1264/1998,      Marco educativo         Referencia normativa
  General de Educación                            

  Ley N.º 5749/2017,      Competencias            Referencia normativa
  Carta Orgánica del MEC  institucionales         

  Resolución MEC N.º      Documentos              Catálogo de requisitos
  563/2023                administrativos y       y documentos
                          técnico-pedagógicos de  
                          tenencia obligatoria    

  PEI, PCI y POA          Gestión institucional   Archivo y seguimiento

  Normas de convivencia   Convivencia             Archivo versionado
  aprobadas                                       
  -----------------------------------------------------------------------

La Resolución MEC N.º 563/2023 establece documentos de tenencia
obligatoria para instituciones oficiales, privadas y privadas
subvencionadas, y contempla que los documentos puedan estar en formato
físico o digital. También encomienda la automatización gradual de
procesos clave.

Para Tercer Ciclo y Educación Media, SIGE debe contemplar especialmente:

-   PEI con PCI y POA.
-   Horarios de clases.
-   Registro de entrevistas.
-   Informe de rendición de cuentas públicas pedagógica, organizacional,
    administrativa, financiera y comunitaria.
-   Inventario institucional, según corresponda.
-   Resoluciones de habilitación y documentos institucionales.
-   Plan anual docente.
-   Plan de desarrollo curricular por etapa.
-   Planilla RSA.
-   Registro y archivo de instrumentos aplicados en períodos ordinarios,
    complementarios y de regularización.
-   Informe pedagógico y documentación vinculada a ajustes razonables.
-   Legajo de Pasantía Educativa Laboral cuando corresponda.

**Implementación:** crear un catálogo de requisitos documentales con
aplicabilidad por gestión, nivel, modalidad, instancia responsable y año
lectivo. No asumir que todos los documentos aplican a todas las
instituciones de idéntica manera.

### 3.2. Evaluación y promoción

Normas de referencia inicial:

-   Resolución MEC N.º 1525/2014: criterios de promoción del Tercer
    Ciclo de EEB.
-   Resolución DGEM N.º 101/2014: criterios de promoción del
    Bachillerato Científico.
-   Resolución MEC N.º 03/2009: criterios de evaluación del Bachillerato
    Técnico.
-   Resolución DGTCEEByEM N.º 257/2023 y circulares posteriores que
    correspondan.
-   Programas de estudio y documentos curriculares vigentes.
-   Fascículo de Evaluación del Aprendizaje del Tercer Ciclo.
-   Guías del elaborador de Tercer Ciclo y Educación Media.
-   Resoluciones posteriores que modifiquen escalas, etapas o criterios.

No implementar una fórmula única para EEB y Educación Media. Cada nivel
y modalidad debe seleccionar reglas normativas propias.

### 3.3. ACE y aportes

Normas de referencia:

-   Ley N.º 4853/2013: conformación, organización y funcionamiento de la
    ACE.
-   Resolución MEC N.º 1238/2025, versión 3: lineamientos
    administrativos y técnicos para registro y reconocimiento de ACE.
-   Estatuto social vigente de la ACE.
-   Actas de asamblea y resoluciones de reconocimiento.
-   Normas contables, tributarias y de rendición aplicables a la
    asociación.

La Resolución 1238/2025 debe incorporarse al expediente normativo ACE y
verificarse contra una copia oficial. No utilizar documentos antiguos
como única fuente si existen lineamientos posteriores.

SIGE debe permitir registrar:

-   Estatuto social.
-   Escritura pública.
-   Asamblea constitutiva.
-   Acta de proclamación.
-   Comisión Directiva.
-   Autoridades y mandatos.
-   Reconocimiento y registro.
-   Actualizaciones y renovaciones.
-   Actas, decisiones y rendiciones.

La falta de pago de cuotas sociales o aportes no debe impedir matrícula
o inscripción del estudiante.

### 3.4. Protección de datos personales

Considerar:

-   Ley N.º 7593/2025 de Protección de Datos Personales.
-   Ley N.º 5136/2013 de Educación Inclusiva.
-   Normativa vigente sobre derechos de niños, niñas y adolescentes.
-   Disposiciones de archivo y conservación documental aplicables.

La Ley N.º 7593/2025 establece entrada en vigor luego de 24 meses desde
su publicación oficial. El desarrollo debe prepararse desde ahora para
sus principios de finalidad, minimización, exactitud, seguridad,
confidencialidad, limitación de conservación, derechos de titulares y
tratamiento reforzado de datos sensibles.

No almacenar información médica, biométrica, familiar o social que no
sea estrictamente necesaria.

### 3.5. Registro normativo en software

Crear:

-   `normative_sources`
-   `normative_versions`
-   `normative_rules`
-   `normative_rule_scopes`
-   `normative_approvals`
-   `normative_change_logs`

Cada proceso que use una regla debe guardar el identificador de la
versión aplicada. Así se podrá reconstruir por qué un cálculo se realizó
de determinada manera en un año lectivo anterior.

### 3.6. Control de actualización normativa

1.  Revisar fuentes oficiales MEC y BACN.
2.  Identificar resoluciones, circulares y modificaciones.
3.  Registrar documento y fecha.
4.  Determinar procesos afectados.
5.  Comparar contra reglas activas.
6.  Preparar propuesta de actualización.
7.  Obtener validación institucional.
8.  Activar nueva versión con fecha de vigencia.
9.  Mantener versión histórica.

No cambiar retroactivamente calificaciones o cierres sin procedimiento
formal y autorización.

------------------------------------------------------------------------

# PARTE III --- MÓDULOS FUNCIONALES

## 4. Módulo 1: Administración institucional

### Funciones

-   Crear y editar institución.
-   Registrar nombre legal, nombre de uso y código MEC.
-   Registrar tipo de gestión: oficial, privada o privada subvencionada.
-   Registrar departamento, distrito, dirección y contacto.
-   Registrar niveles, modalidades y especialidades habilitadas.
-   Registrar resoluciones de habilitación.
-   Configurar turnos.
-   Configurar años lectivos.
-   Definir períodos y etapas.
-   Configurar calendario académico.
-   Definir feriados, recesos y jornadas institucionales.
-   Administrar documentos institucionales.
-   Gestionar estructura organizativa.
-   Configurar responsables y autoridades.

### Reglas

-   Cada institución mantiene sus propios datos.
-   Año lectivo: preparación, activo, cierre pendiente, cerrado o
    archivado.
-   No modificar año cerrado sin reapertura autorizada y auditada.
-   Cursos y modalidades se habilitan por año y resolución.
-   No eliminar años lectivos con registros.

### Entregables

-   Ficha institucional.
-   Catálogo de niveles y modalidades.
-   Calendario académico.
-   Reporte de oferta educativa.
-   Archivo de resoluciones y habilitaciones.

## 5. Módulo 2: Personas, estudiantes y familias

### Personas

Una persona puede ser estudiante, padre, tutor, docente, funcionario,
proveedor, autoridad ACE o usuario.

Datos:

-   Nombres y apellidos.
-   Tipo y número de documento.
-   Fecha de nacimiento, solo si es necesaria.
-   Teléfono y correo.
-   Dirección, si corresponde.
-   Estado.
-   Contactos autorizados.
-   Relaciones con estudiantes.

No mostrar números de documentos a usuarios sin autorización.

### Estudiantes

-   Código interno.
-   Identificador RUE, si está disponible.
-   Persona asociada.
-   Estado de trayectoria.
-   Fecha de ingreso.
-   Institución de procedencia, si corresponde.
-   Observaciones administrativas no sensibles.

No utilizar el código RUE como clave primaria.

### Responsables familiares

Tipos:

-   Padre.
-   Madre.
-   Tutor legal.
-   Encargado autorizado.
-   Contacto de emergencia.

Relación estudiante-responsable:

-   Parentesco.
-   Vigencia.
-   Responsable principal.
-   Autorización de retiro.
-   Autorización de notificaciones.
-   Acceso al portal.
-   Restricciones legales documentadas, si corresponde.

### Matrícula

Proceso:

1.  Seleccionar año lectivo.
2.  Buscar estudiante.
3.  Verificar identidad y documentos.
4.  Seleccionar nivel, grado, curso y sección.
5.  Registrar modalidad y turno.
6.  Vincular responsables.
7.  Adjuntar documentos requeridos.
8.  Validar vacante y habilitación.
9.  Confirmar matrícula.
10. Generar constancia.

Estados:

-   Preinscripto.
-   Pendiente de documentación.
-   Matriculado.
-   Trasladado.
-   Retirado.
-   Egresado.
-   Anulado con motivo y auditoría.

La falta de aporte ACE no puede impedir matrícula.

### Cambios y traslados

Registrar sección anterior, nueva, fecha efectiva, motivo, autorizador,
documento de respaldo e historial. No sobrescribir la matrícula
histórica.

## 6. Módulo 3: Estructura académica y horarios

Entidades:

-   Nivel.
-   Grado o curso.
-   Sección.
-   Turno.
-   Modalidad.
-   Especialidad.
-   Plan curricular.
-   Área académica.
-   Disciplina.
-   Carga horaria.
-   Docente.
-   Asignación docente.
-   Horario.
-   Aula.
-   Período lectivo.

Debe permitir:

-   Configurar 7.º, 8.º, 9.º, 1.º, 2.º y 3.º.
-   Configurar Bachillerato Científico.
-   Configurar Bachillerato Técnico por especialidad.
-   Configurar disciplinas comunes y específicas.
-   Asignar docentes y carga horaria.
-   Evitar superposición de docentes, aulas y cursos.
-   Mantener vigencia de asignaciones.
-   Imprimir horarios.

La estructura curricular debe versionarse por año lectivo. No cambiar el
plan curricular de un año anterior cuando se modifica el actual.

## 7. Módulo 4: Asistencia

### 7.1. Objetivo

Registrar y consultar asistencia diaria y/o por período de clase, según
la modalidad institucional y disposiciones vigentes.

No confundir:

-   Asistencia institucional diaria.
-   Asistencia a cada hora cátedra.
-   Participación en actividades especiales.
-   Registro de ingreso y salida.
-   Justificación administrativa.

### 7.2. Tipos de sesión

-   Control diario de entrada.
-   Clase por hora cátedra.
-   Actividad institucional.
-   Evaluación.
-   Pasantía o práctica.
-   Salida pedagógica.
-   Control de salida, si se utiliza.

### 7.3. Estados

-   `PRESENT`: presente.
-   `ABSENT`: ausente.
-   `LATE`: llegó tarde.
-   `EARLY_DEPARTURE`: retiro anticipado.
-   `NOT_APPLICABLE`: no corresponde.
-   `PENDING`: pendiente de registro.

La justificación es un proceso separado, no un estado que reemplace la
ausencia.

### 7.4. Flujo docente

1.  Iniciar sesión.
2.  Abrir panel de asistencia.
3.  Seleccionar fecha y clase.
4.  Cargar nómina vigente.
5.  Marcar estados.
6.  Registrar tardanzas y observaciones no sensibles.
7.  Guardar borrador.
8.  Confirmar.
9.  Cerrar sesión.
10. Emitir resumen.

### 7.5. Integridad

-   Una marca por estudiante y sesión.
-   No permitir asistencia de estudiantes no matriculados en esa sección
    en la fecha.
-   Sesión cerrada requiere permiso para corregir.
-   Correcciones registran valor anterior, nuevo valor, motivo, usuario
    y fecha.
-   No borrar marcas confirmadas.
-   Registrar fuente: web, offline, importación o corrección.
-   Importaciones idempotentes.

### 7.6. Asistencia offline

Implementar PWA con cola local:

-   Descargar previamente nóminas y sesiones del día.
-   Registrar asistencia sin conexión.
-   Guardar operaciones con UUID.
-   Sincronizar al recuperar conexión.
-   Evitar duplicados.
-   Mostrar pendientes.
-   Resolver conflictos mediante política explícita.
-   No sobrescribir un registro confirmado sin mostrar conflicto.
-   Registrar creador y sincronizador.

No guardar documentos médicos ni datos sensibles en caché offline.

### 7.7. Informes

-   Lista diaria.
-   Resumen por sección.
-   Asistencia mensual por estudiante.
-   Asistencia por disciplina.
-   Ausencias por rango.
-   Tardanzas.
-   Retiros anticipados.
-   Inasistencia reiterada.
-   Informe anual.
-   Historial de correcciones.

Los porcentajes y alertas son parámetros institucionales; no equivalen
automáticamente a criterios de promoción.

## 8. Módulo 5: Justificativos

### Funciones

-   Registrar solicitud.
-   Seleccionar registros de ausencia.
-   Adjuntar documento.
-   Registrar presentante.
-   Registrar recepción.
-   Asignar revisor.
-   Aprobar, rechazar o solicitar documentación.
-   Registrar decisión.
-   Generar constancia.
-   Notificar al responsable.

### Estados

-   `DRAFT`
-   `SUBMITTED`
-   `UNDER_REVIEW`
-   `APPROVED`
-   `PARTIALLY_APPROVED`
-   `REJECTED`
-   `NEEDS_MORE_INFO`
-   `CANCELLED`

### Reglas

-   La justificación no elimina la ausencia.
-   Puede abarcar una o varias sesiones.
-   No adjuntar justificativo a otro estudiante.
-   Separar fecha de ausencia y fecha de presentación.
-   La decisión registra usuario y fecha.
-   No exponer diagnósticos a usuarios que no necesiten conocerlos.
-   Archivos sensibles privados, URLs temporales y auditoría de
    descarga.
-   No aprobar automáticamente por la mera existencia de un archivo.

### Documentos

-   Constancia de recepción.
-   Registro de decisión.
-   Notificación de documentación faltante.
-   Informe por período.
-   Historial por estudiante.

## 9. Módulo 6: Gestión académica y planificación

### 9.1. Catálogo curricular

Entidades:

-   Plan curricular.
-   Competencia.
-   Capacidad.
-   Indicador.
-   Área.
-   Disciplina.
-   Grado.
-   Modalidad.
-   Especialidad.
-   Fuente curricular.
-   Versión del programa.

Cada indicador incluye código, texto, capacidad, disciplina,
grado/curso, área/plan, vigencia, fuente y estado.

No mezclar indicadores de distintas versiones curriculares.

### 9.2. Planificación docente

Permitir:

-   Plan anual.
-   Plan de desarrollo curricular por etapa.
-   Plan de clase.
-   Unidad didáctica.
-   Proyecto.
-   Actividades.
-   Recursos.
-   Estrategias metodológicas.
-   Evaluación prevista.
-   Indicadores.
-   Evidencias esperadas.

Flujo:

1.  Docente crea planificación.
2.  Selecciona año, sección y disciplina.
3.  Selecciona capacidades e indicadores.
4.  Define actividades y cronograma.
5.  Adjunta recursos.
6.  Envía a revisión si corresponde.
7.  Coordinación revisa.
8.  Se aprueba o devuelve con observaciones.
9.  Se registra versión aprobada.
10. Se archiva al finalizar el año.

### 9.3. RSA

El Registro de Secuencia de Aprendizaje debe permitir observar la
evolución del indicador.

Datos:

-   Estudiante.
-   Docente.
-   Disciplina.
-   Capacidad.
-   Indicador.
-   Fecha de observación.
-   Evidencia.
-   Instrumento.
-   Resultado.
-   Comentario pedagógico.
-   Retroalimentación.
-   Próxima fecha de seguimiento.

No limitar el RSA a una nota numérica. Debe documentar observaciones
sucesivas.

## 10. Módulo 7: Evaluación, instrumentos y calificaciones

### 10.1. Procedimientos

-   Observación.
-   Informe.
-   Prueba.
-   Análisis de producción.
-   Desempeño práctico.
-   Proyecto.
-   Portafolio.
-   Exposición oral.
-   Actividad de aplicación.

### 10.2. Instrumentos

-   Lista de cotejo.
-   Rúbrica analítica.
-   Rúbrica holística.
-   Registro anecdótico.
-   Cuestionario.
-   Guía de entrevista.
-   Prueba escrita.
-   Prueba oral.
-   Prueba práctica.
-   Bitácora.
-   Portafolio.
-   RSA.

Cada instrumento incluye nombre, tipo, objetivo, indicadores, criterios,
niveles, descriptores, ponderación si corresponde, versión, fecha,
autor, plantilla y estado.

### 10.3. Actividad evaluativa

Campos:

-   Año lectivo.
-   Período o etapa.
-   Curso y sección.
-   Disciplina.
-   Docente.
-   Capacidad.
-   Indicadores.
-   Procedimiento.
-   Instrumento.
-   Fecha.
-   Puntaje máximo.
-   Criterios.
-   Evidencia esperada.
-   Estado.

### 10.4. Evidencias

Relacionar con estudiante, actividad, indicador, instrumento, fecha,
archivo/texto/referencia, docente, observación y confidencialidad.

Tipos: documento, fotografía de producción, audio, video, enlace, texto,
producto práctico, proyecto u observación.

No permitir archivos públicos por defecto.

### 10.5. Resultados

Guardar separadamente:

-   Puntaje bruto.
-   Nivel de logro.
-   Observación cualitativa.
-   Calificación de etapa.
-   Calificación final.
-   Estado de revisión.
-   Estado de confirmación.
-   Regla normativa utilizada.

### 10.6. Motor de reglas

Reglas por:

-   Nivel.
-   Modalidad.
-   Curso.
-   Disciplina.
-   Etapa.
-   Período.
-   Año lectivo.
-   Normativa vigente.

Debe admitir escala, exigencia, puntaje mínimo, redondeo, promedio,
condiciones de etapas, proyecto educativo, complementario,
regularización y promoción.

No programar una fórmula global. La regla se resuelve mediante
configuración validada.

### 10.7. Flujo de calificaciones

1.  Docente registra actividades y resultados.
2.  Se valida existencia de evidencias e instrumentos.
3.  Se calculan resultados preliminares conforme a regla.
4.  Docente revisa.
5.  Coordinación verifica si corresponde.
6.  Dirección confirma cierre institucional.
7.  Se genera reporte interno.
8.  Se prepara carga en RUE.
9.  Se registra referencia de confirmación oficial cuando se realice.
10. Se archiva versión final.

El resultado interno y el confirmado en RUE son entidades diferentes.

### 10.8. Complementario y regularización

Identificar indicadores no logrados, disciplinas pendientes, período,
actividad de recuperación, instrumento, evidencia, nuevo resultado y
regla aplicable.

No sobrescribir evaluación original: conservar historial.

## 11. Módulo 8: Bachillerato Técnico y Pasantía Educativa Laboral

Incluir:

-   Especialidades.
-   Módulos y disciplinas técnicas.
-   Empresas e instituciones receptoras.
-   Tutores institucionales y externos.
-   Convenios.
-   Contratos.
-   Plan de pasantía.
-   Plan de trabajo del estudiante.
-   Horas previstas y realizadas.
-   Registro de asistencia.
-   Evidencias.
-   Evaluación mediante rúbrica.
-   Informe final.
-   Certificado.
-   Incidentes y seguimiento.

Horas, criterios y documentos deben corresponder a la normativa vigente.
No fijar cantidades universales como constantes.

## 12. Módulo 9: Seguimiento estudiantil y entrevistas

Registrar:

-   Entrevistas con familias.
-   Reuniones con estudiantes.
-   Acuerdos y compromisos.
-   Derivaciones.
-   Seguimiento.
-   Acciones de apoyo.
-   Alertas.
-   Informe pedagógico.
-   Ajustes razonables.
-   Planes de acompañamiento.

Los registros de orientación pueden contener datos sensibles. Crear
acceso restringido, categorías de confidencialidad y auditoría. El
docente común no debe acceder a notas privadas de orientación o
diagnósticos.

Alertas por inasistencia reiterada, ausencias sin justificar,
dificultades persistentes, evaluaciones pendientes y riesgo de
interrupción de trayectoria. Son indicadores para revisión humana, no
decisiones automáticas sobre derechos.

## 13. Módulo 10: Gestión documental

Tipos:

-   PEI, PCI, POA y plan plurianual.
-   Normas de convivencia.
-   Horarios.
-   Actas y resoluciones.
-   Circulares y notas.
-   Planificaciones.
-   RSA.
-   Instrumentos.
-   Informes.
-   Constancias.
-   Documentación PEL.
-   Inventarios.
-   Rendiciones.
-   Comprobantes.
-   Contratos y documentos ACE.

Funciones:

-   Subir y clasificar archivos.
-   Etiquetar.
-   Relacionar con estudiante, curso, docente o proceso.
-   Registrar fecha y responsable.
-   Definir acceso.
-   Versionar.
-   Aprobar.
-   Archivar.
-   Buscar y descargar con autorización.
-   Generar PDF y Excel.

Cada versión debe tener número, fecha, autor, motivo, estado, archivo,
hash SHA-256 y aprobador cuando corresponda.

### Plantillas

-   Constancia de matrícula.
-   Constancia de asistencia.
-   Constancia de recepción de justificativo.
-   Informe mensual de asistencia.
-   Informe de rendimiento.
-   Informe de seguimiento.
-   Acta de entrevista.
-   Acta de reunión.
-   Planilla de evaluación.
-   Reporte RSA.
-   Recibo de aporte.
-   Comprobante de donación.
-   Libro de ingresos y egresos.
-   Informe de rendición.
-   Inventario.
-   Memoria anual.

La firma impresa o un nombre digitado no equivalen automáticamente a
firma digital cualificada. Distinguir firma manuscrita, aprobación
interna y firma digital legalmente válida.

## 14. Módulo 11: Gestión de ACE

### 14.1. Asociación

Registrar denominación, institución vinculada, estatuto, escritura
pública, registro, reconocimiento MEC, resolución, domicilio, contacto y
estado.

### 14.2. Socios

Registrar persona, relación con estudiante matriculado, alta, baja,
estado y documentación. La condición de socio debe derivarse de
estatutos y no de haber pagado un aporte.

### 14.3. Comisión Directiva

Cargos configurables según estatuto: presidente, vicepresidente,
secretario, tesorero, vocales, síndico y otros.

Registrar período, acta de elección, fecha de asamblea, autoridad,
resolución de reconocimiento, vigencia y renovación.

### 14.4. Asambleas

Registrar convocatoria, orden del día, fecha, lugar, asistentes, quórum
conforme al estatuto, resoluciones, acta, firmas y adjuntos.

No codificar quórums ni plazos sin revisar estatuto y norma aplicable.

### 14.5. Aportes voluntarios

Tipos:

-   Aporte social voluntario.
-   Donación monetaria.
-   Donación en especie.
-   Aporte para actividad específica.
-   Recaudación de evento.
-   Otros ingresos permitidos.

Registrar aportante, fecha, concepto, importe, medio, recibo, destino
restringido si fue expresamente indicado, cuenta y documento.

No usar expresiones como "deuda escolar", "moroso" o "bloqueado por
falta de aporte". No generar intereses, recargos ni restricciones
automáticas por no aportar.

### 14.6. Recibos

-   Numeración correlativa por serie y ejercicio.
-   Fecha y hora.
-   ACE emisora.
-   Aportante.
-   Concepto.
-   Importe en números y letras.
-   Medio de pago.
-   Usuario.
-   Estado.
-   Código interno de verificación opcional.

Estados: borrador, emitido, anulado y revertido. La anulación conserva
número y motivo. No reutilizar números.

El recibo interno no debe presentarse como factura tributaria salvo que
cumpla los requisitos legales.

## 15. Módulo 12: Tesorería y contabilidad ACE

No basta con tablas separadas de ingresos y egresos.

### Separación patrimonial

La ACE y la institución deben mantener fondos y libros separados.

Entidades: titular de fondos, asociación, cuenta financiera, caja,
banco, fuente de fondos, proyecto, categoría, ejercicio, presupuesto,
movimiento, comprobante, asiento y libro.

Si la institución oficial administra transferencias públicas, deben
estar en submódulo separado con normativa y reportes propios. No
registrarlas como dinero de ACE.

### Libro de ingresos y egresos

Registrar fecha, número, concepto, categoría, fuente, cuenta, importe,
medio de pago, beneficiario/aportante, comprobante, usuario, aprobador y
proyecto.

### Plan de cuentas

Catálogo configurable: código, nombre, tipo, naturaleza, nivel, cuenta
padre y titular de fondos. Validar estructura con profesional
responsable y requisitos aplicables.

### Partida doble

Implementar:

-   `journal_entries`
-   `journal_lines`
-   `chart_of_accounts`

Cada asiento debe cumplir `SUM(debe) = SUM(haber)`. No contabilizar
asiento desbalanceado.

Importes en guaraníes como enteros `BIGINT` cuando no existan
fracciones. Nunca usar `FLOAT` para dinero.

### Operaciones

-   Ingreso.
-   Egreso.
-   Transferencia.
-   Reintegro.
-   Anulación.
-   Ajuste.
-   Donación.
-   Compra.
-   Otros movimientos autorizados.

### Flujo de egresos

1.  Solicitud.
2.  Categoría y proyecto.
3.  Presupuesto o acta, si corresponde.
4.  Comprobante.
5.  Aprobación.
6.  Ejecución del pago.
7.  Confirmación.
8.  Asiento.
9.  Actualización de caja/banco.
10. Inclusión en informe.

Aplicar segregación de funciones: quien registra no debe ser la única
persona que autoriza y concilia.

### Cierres

Cierre mensual/anual, conciliación, revisión de comprobantes, aprobación
de balance y archivo. No editar períodos cerrados sin reapertura
autorizada, motivo y auditoría.

## 16. Módulo 13: Inventario y donaciones

Registrar bien, código, descripción, categoría, fecha de adquisición,
proveedor/donante, valor documentado, ubicación, responsable, estado,
titular (institución o ACE), documento y código patrimonial MEC cuando
corresponda.

Movimientos: alta, traslado, entrega, devolución, mantenimiento, baja,
donación y ajuste.

No mezclar inventario institucional y ACE. Cada bien debe tener titular
patrimonial claro.

Informes: inventario general, por aula, por responsable, altas/bajas,
donaciones, bienes sin ubicación e historial.

## 17. Módulo 14: Rendición de cuentas ACE

Generar expediente anual con:

1.  Datos de ACE.
2.  Período.
3.  Autoridades.
4.  Actas.
5.  Memoria.
6.  Presupuesto.
7.  Libro de ingresos.
8.  Libro de egresos.
9.  Estado de caja.
10. Conciliaciones.
11. Balance o estado financiero validado.
12. Comprobantes.
13. Donaciones.
14. Inventario.
15. Ejecución presupuestaria.
16. Observaciones.
17. Aprobación de Comisión Directiva.
18. Aprobación de Asamblea.
19. Documentos de presentación, cuando corresponda.

Exportar PDF consolidado, Excel de movimientos, ZIP de comprobantes,
índice documental, libros, memoria y ejecución.

Generar el informe no equivale a aprobación legal o contable. Registrar
revisores y aprobadores.

## 18. Módulo 15: Portal de familias

Acceso individual con autenticación.

Funciones:

-   Consultar asistencia de hijos vinculados.
-   Consultar ausencias y justificativos.
-   Presentar justificativo si se habilita.
-   Consultar comunicados y calendario.
-   Consultar informes autorizados.
-   Descargar constancias permitidas.
-   Consultar recibos propios.
-   Solicitar actualización de contacto.
-   Recibir notificaciones.

No permitir consultar otros estudiantes, finanzas de otras familias,
notas privadas de orientación ni documentos sensibles ajenos.

## 19. Módulo 16: Comunicaciones y notificaciones

Canales: sistema, correo, WhatsApp mediante proveedor autorizado o SMS
mediante proveedor autorizado.

Eventos: ausencia, inasistencia reiterada, justificativo
recibido/resuelto, reunión, comunicado, documento disponible y cierre de
período.

No enviar diagnósticos ni documentos sensibles por canales inseguros.
Notificaciones mínimas con enlace al portal.

Registrar destinatario, canal, plantilla, evento, fecha, estado,
reintentos y error.

## 20. Módulo 17: Dashboard y analítica

### Dirección

-   Matrícula por nivel/curso.
-   Estudiantes activos.
-   Distribución por turno.
-   Asistencia global.
-   Inasistencias reiteradas.
-   Calificaciones por etapa.
-   Disciplinas con dificultades.
-   Indicadores con menor logro.
-   Documentos pendientes.
-   Planificaciones.
-   Seguimiento.

### Coordinación

-   Planificaciones pendientes.
-   RSA sin actualizar.
-   Instrumentos.
-   Evidencias faltantes.
-   Resultados por capacidad e indicador.
-   Estudiantes que requieren refuerzo.
-   Comparación de etapas.

### Secretaría

-   Matrículas pendientes.
-   Documentos faltantes.
-   Justificativos pendientes.
-   Constancias.
-   Traslados.
-   Cierres.

### ACE

-   Ingresos/egresos por categoría.
-   Saldo por cuenta.
-   Ejecución presupuestaria.
-   Donaciones.
-   Inventario.
-   Comprobantes pendientes.
-   Rendición anual.

Dashboards con filtros por año, curso, nivel, disciplina y período. No
mostrar datos sensibles sin autorización.
