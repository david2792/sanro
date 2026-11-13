import type { CrudConfig } from '../../components/Crud'
import { Etiqueta } from '../../components/ui'
import { fechaCorta, horarioTexto, hoyISO } from '../../lib/utils'

const persona = (o: any) => `${o.apellidos}, ${o.nombres}`
const SI_NO = (v: boolean) => (v ? <Etiqueta tono="verde">Activo</Etiqueta> : <Etiqueta>Inactivo</Etiqueta>)

export const TURNOS = [
  { valor: 'M', label: 'Mañana' },
  { valor: 'T', label: 'Tarde' },
  { valor: 'N', label: 'Noche' },
]
export const ROLES = [
  { valor: 'DIRECTOR', label: 'Director/a' },
  { valor: 'COORDINADOR', label: 'Coordinador/a' },
  { valor: 'SECRETARIA', label: 'Secretaría' },
  { valor: 'DOCENTE', label: 'Docente' },
  { valor: 'TUTOR', label: 'Padre/Madre/Tutor' },
  { valor: 'ACES', label: 'ACES (cooperadora)' },
]
const ESTADOS_ANIO = [
  { valor: 'PREPARACION', label: 'En preparación' },
  { valor: 'ACTIVO', label: 'Activo' },
  { valor: 'CIERRE_PENDIENTE', label: 'Cierre pendiente' },
  { valor: 'CERRADO', label: 'Cerrado' },
  { valor: 'ARCHIVADO', label: 'Archivado' },
]
export const ESTADOS_MATRICULA = [
  { valor: 'PREINSCRIPTO', label: 'Preinscripto' },
  { valor: 'PENDIENTE_DOC', label: 'Pendiente de documentación' },
  { valor: 'ACTIVA', label: 'Matriculado' },
  { valor: 'RETIRADO', label: 'Retirado' },
  { valor: 'TRASLADADO', label: 'Trasladado (pase)' },
  { valor: 'PROMOVIDO', label: 'Promovido' },
  { valor: 'REPROBADO', label: 'No promovido' },
  { valor: 'EGRESADO', label: 'Egresado' },
  { valor: 'ANULADA', label: 'Anulada (error de carga)' },
]
// Bajas: piden fecha y motivo (el servidor también lo exige).
const BAJAS_MATRICULA = ['RETIRADO', 'TRASLADADO', 'ANULADA']
const TIPOS_PERMISO = [
  { valor: 'PERMISO', label: 'Permiso' },
  { valor: 'REPOSO', label: 'Reposo médico' },
  { valor: 'LICENCIA', label: 'Licencia' },
  { valor: 'COMISION', label: 'Comisión de servicio' },
  { valor: 'OTRO', label: 'Otro' },
]

const FK = {
  anio: { ruta: '/anios-lectivos/', label: (o: any) => String(o.anio) },
  nivel: { ruta: '/niveles/', label: (o: any) => o.nombre },
  especialidad: { ruta: '/especialidades/', label: (o: any) => o.nombre },
  curso: { ruta: '/cursos/', label: (o: any) => o.descripcion },
  materia: { ruta: '/materias/', label: (o: any) => o.nombre },
  seccion: { ruta: '/secciones/', label: (o: any) => o.descripcion },
  docente: { ruta: '/docentes/', label: persona },
  alumno: { ruta: '/alumnos/', label: (o: any) => `${persona(o)} (${o.ci})` },
  tutor: { ruta: '/tutores/', label: (o: any) => `${persona(o)} (${o.ci})` },
  usuario: { ruta: '/usuarios/', label: (o: any) => `${o.username} — ${o.first_name} ${o.last_name}` },
  matricula: { ruta: '/matriculas/?estado=ACTIVA', label: (o: any) => `${o.alumno_nombre} — ${o.seccion_descripcion}` },
}

export const REFERENCIALES: Record<string, CrudConfig> = {
  institucion: {
    titulo: 'Institución', singular: 'Institución', femenino: true, ruta: '/instituciones/',
    descripcion: 'Datos del colegio que aparecen en documentos y reportes.',
    columnas: [
      { label: 'Nombre', valor: (o) => o.nombre, principal: true },
      { label: 'Código MEC', valor: (o) => o.codigo_mec },
      { label: 'Ciudad', valor: (o) => o.ciudad },
      { label: 'Asistencia mínima', valor: (o) => `${o.asistencia_minima}%` },
      { label: 'Logro mínimo', valor: (o) => `${o.logro_minimo}%` },
      {
        label: 'Evaluaciones por día', valor: (o) => !o.max_evaluaciones_dia ? 'Sin límite'
          : `${o.max_evaluaciones_dia} ${o.evaluaciones_cuentan === 'PRUEBAS' ? (o.max_evaluaciones_dia === 1 ? 'prueba' : 'pruebas') : (o.max_evaluaciones_dia === 1 ? 'evaluación' : 'evaluaciones')}${o.bloquear_evaluaciones ? '' : ' (solo aviso)'}`,
      },
    ],
    campos: [
      { name: 'nombre', label: 'Nombre', requerido: true },
      { name: 'codigo_mec', label: 'Código MEC', medio: true },
      { name: 'telefono', label: 'Teléfono', tipo: 'tel', medio: true },
      { name: 'direccion', label: 'Dirección' },
      { name: 'ciudad', label: 'Ciudad', medio: true },
      { name: 'departamento', label: 'Departamento', medio: true },
      { name: 'asistencia_minima', label: 'Asistencia mínima (%)', tipo: 'numero', medio: true, ayuda: 'Debajo de este porcentaje el alumno entra en alerta.' },
      { name: 'logro_minimo', label: 'Logro mínimo (%)', tipo: 'numero', medio: true, ayuda: 'Logro en trabajos debajo del cual el alumno entra en alerta.' },
      { name: 'max_evaluaciones_dia', label: 'Máximo de evaluaciones por día', tipo: 'numero', medio: true, ayuda: 'Por sección. 0 = sin límite.' },
      {
        name: 'evaluaciones_cuentan', label: 'Qué cuenta para el máximo', tipo: 'select', medio: true, opciones: [
          { valor: 'PRUEBAS', label: 'Solo pruebas escritas' },
          { valor: 'TODAS', label: 'Todos los trabajos y evaluaciones' },
        ],
      },
      { name: 'bloquear_evaluaciones', label: 'No dejar pasar el máximo', tipo: 'si_no', ayuda: 'Sí: el docente no puede guardar otra evaluación ese día. No: solo se le avisa.' },
    ],
    inicial: () => ({ asistencia_minima: 80, logro_minimo: 60, max_evaluaciones_dia: 1, evaluaciones_cuentan: 'PRUEBAS', bloquear_evaluaciones: true }),
  },
  anios: {
    titulo: 'Años lectivos', singular: 'Año lectivo', ruta: '/anios-lectivos/',
    descripcion: 'Solo un año es el de trabajo. Un año cerrado no se modifica: para corregirlo, la dirección lo reabre con motivo.',
    columnas: [
      { label: 'Año', valor: (o) => o.anio, principal: true },
      { label: 'Inicio', valor: (o) => fechaCorta(o.fecha_inicio) },
      { label: 'Fin', valor: (o) => fechaCorta(o.fecha_fin) },
      { label: 'Estado', valor: (o) => <Etiqueta tono={o.activo ? 'verde' : o.estado === 'CERRADO' || o.estado === 'ARCHIVADO' ? 'gris' : 'ambar'}>{o.estado_nombre}{o.activo ? ' · de trabajo' : ''}</Etiqueta> },
    ],
    campos: [
      { name: 'anio', label: 'Año', tipo: 'numero', requerido: true },
      { name: 'fecha_inicio', label: 'Inicio de clases', tipo: 'fecha', requerido: true, medio: true },
      { name: 'fecha_fin', label: 'Fin de clases', tipo: 'fecha', requerido: true, medio: true },
      { name: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS_ANIO, medio: true,
        ayuda: 'Preparación → Activo → Cierre pendiente → Cerrado → Archivado.' },
      { name: 'activo', label: 'Año de trabajo', tipo: 'si_no', ayuda: 'Es el año que usan los docentes (solo uno).' },
      { name: 'motivo', label: 'Motivo del cambio de estado', ayuda: 'Obligatorio para reabrir un año cerrado (solo dirección).',
        visible: (v) => v.estado === 'CIERRE_PENDIENTE' },
    ],
    inicial: () => ({ anio: new Date().getFullYear(), activo: true }),
  },
  etapas: {
    titulo: 'Etapas', singular: 'Etapa', femenino: true, ruta: '/etapas/',
    columnas: [
      { label: 'Etapa', valor: (o) => `${o.numero}ª ${o.nombre}`, principal: true },
      { label: 'Desde', valor: (o) => fechaCorta(o.fecha_inicio) },
      { label: 'Hasta', valor: (o) => fechaCorta(o.fecha_fin) },
    ],
    campos: [
      { name: 'anio_lectivo', label: 'Año lectivo', tipo: 'fk', fk: FK.anio, requerido: true },
      { name: 'numero', label: 'Número', tipo: 'numero', requerido: true, medio: true },
      { name: 'nombre', label: 'Nombre', medio: true },
      { name: 'fecha_inicio', label: 'Desde', tipo: 'fecha', requerido: true, medio: true },
      { name: 'fecha_fin', label: 'Hasta', tipo: 'fecha', requerido: true, medio: true },
    ],
    inicial: () => ({ nombre: 'Etapa' }),
  },
  feriados: {
    titulo: 'Días no lectivos', singular: 'Día no lectivo', ruta: '/dias-no-lectivos/',
    descripcion: 'Feriados, asuetos y suspensiones de clases.',
    columnas: [
      { label: 'Fecha', valor: (o) => fechaCorta(o.fecha), principal: true },
      { label: 'Motivo', valor: (o) => o.motivo },
    ],
    campos: [
      { name: 'anio_lectivo', label: 'Año lectivo', tipo: 'fk', fk: FK.anio, requerido: true },
      { name: 'fecha', label: 'Fecha', tipo: 'fecha', requerido: true },
      { name: 'motivo', label: 'Motivo', requerido: true },
    ],
  },
  niveles: {
    titulo: 'Niveles', singular: 'Nivel', ruta: '/niveles/',
    descripcion: 'Por ejemplo: Educación Escolar Básica, Educación Media.',
    columnas: [{ label: 'Nombre', valor: (o) => o.nombre, principal: true }, { label: 'Orden', valor: (o) => o.orden }],
    campos: [
      { name: 'nombre', label: 'Nombre', requerido: true },
      { name: 'orden', label: 'Orden', tipo: 'numero', ayuda: 'Define en qué orden se listan.' },
    ],
    inicial: () => ({ orden: 1 }),
  },
  especialidades: {
    titulo: 'Especialidades', singular: 'Especialidad', femenino: true, ruta: '/especialidades/',
    descripcion: 'Bachilleratos y énfasis de la Educación Media.',
    columnas: [{ label: 'Nombre', valor: (o) => o.nombre, principal: true }],
    campos: [
      { name: 'nivel', label: 'Nivel', tipo: 'fk', fk: FK.nivel, requerido: true },
      { name: 'nombre', label: 'Nombre', requerido: true },
    ],
  },
  cursos: {
    titulo: 'Cursos', singular: 'Curso', ruta: '/cursos/',
    descripcion: 'Cada curso tiene su plan de estudios con las materias y horas.',
    columnas: [{ label: 'Curso', valor: (o) => o.descripcion, principal: true }],
    campos: [
      { name: 'nivel', label: 'Nivel', tipo: 'fk', fk: FK.nivel, requerido: true },
      { name: 'especialidad', label: 'Especialidad', tipo: 'fk', fk: FK.especialidad, ayuda: 'Dejar vacío en la EEB.' },
      { name: 'grado', label: 'Grado / curso (número)', tipo: 'numero', requerido: true, medio: true },
      { name: 'nombre', label: 'Nombre', requerido: true, medio: true, ayuda: 'Ej.: 1° Curso' },
    ],
    enlace: (o) => `/cursos/${o.id}`,
  },
  materias: {
    titulo: 'Materias', singular: 'Materia', femenino: true, ruta: '/materias/',
    columnas: [
      { label: 'Nombre', valor: (o) => o.nombre, principal: true },
      { label: 'Abreviatura', valor: (o) => o.abreviatura },
    ],
    campos: [
      { name: 'nombre', label: 'Nombre', requerido: true },
      { name: 'abreviatura', label: 'Abreviatura' },
    ],
  },
  plan: {
    titulo: 'Plan de estudios', singular: 'Materia del plan', femenino: true, ruta: '/plan-materias/',
    columnas: [
      { label: 'Materia', valor: (o) => o.materia_nombre, principal: true },
      { label: 'Plan', valor: (o) => (o.tipo === 'COMUN' ? 'Plan común' : 'Plan específico') },
      { label: 'Horas semanales', valor: (o) => `${o.horas_semanales} h` },
    ],
    campos: [
      { name: 'curso', label: 'Curso', tipo: 'fk', fk: FK.curso, requerido: true },
      { name: 'materia', label: 'Materia', tipo: 'fk', fk: FK.materia, requerido: true },
      { name: 'tipo', label: 'Plan', tipo: 'select', requerido: true, medio: true,
        opciones: [{ valor: 'COMUN', label: 'Plan común' }, { valor: 'ESPECIFICO', label: 'Plan específico' }] },
      { name: 'horas_semanales', label: 'Horas semanales', tipo: 'numero', medio: true },
    ],
    inicial: () => ({ tipo: 'COMUN', horas_semanales: 2 }),
  },
  secciones: {
    titulo: 'Secciones', singular: 'Sección', femenino: true, ruta: '/secciones/',
    descripcion: 'Cada curso en un año, con su letra, turno y cupo.',
    columnas: [
      { label: 'Sección', valor: (o) => o.descripcion, principal: true },
      { label: 'Inscriptos', valor: (o) => `${o.inscriptos} de ${o.cupo}` },
    ],
    campos: [
      { name: 'anio_lectivo', label: 'Año lectivo', tipo: 'fk', fk: FK.anio, requerido: true },
      { name: 'curso', label: 'Curso', tipo: 'fk', fk: FK.curso, requerido: true },
      { name: 'letra', label: 'Sección', medio: true, requerido: true },
      { name: 'turno', label: 'Turno', tipo: 'select', opciones: TURNOS, requerido: true, medio: true },
      { name: 'cupo', label: 'Cupo', tipo: 'numero', medio: true },
      { name: 'docente_guia', label: 'Docente guía', tipo: 'fk', fk: FK.docente },
    ],
    inicial: () => ({ letra: 'A', turno: 'M', cupo: 35 }),
    enlace: (o) => `/secciones/${o.id}`,
  },
  asignaciones: {
    titulo: 'Asignaciones docentes', singular: 'Asignación', femenino: true, ruta: '/asignaciones/',
    descripcion: 'Qué docente dicta cada materia en cada sección.',
    columnas: [
      { label: 'Materia', valor: (o) => o.materia_nombre, principal: true },
      { label: 'Sección', valor: (o) => o.seccion_descripcion },
      { label: 'Docente', valor: (o) => o.docente_nombre },
      { label: 'Horario', valor: (o) => horarioTexto(o.dias_clase, o.horario) || <span className="text-tarde">Sin cargar</span> },
    ],
    campos: [
      { name: 'seccion', label: 'Sección', tipo: 'fk', fk: FK.seccion, requerido: true },
      { name: 'materia', label: 'Materia', tipo: 'fk', fk: FK.materia, requerido: true },
      { name: 'docente', label: 'Docente', tipo: 'fk', fk: FK.docente, requerido: true },
      { name: 'horario', label: 'Días y horario de clase', tipo: 'horario',
        ayuda: 'Marcá cada día que tiene clase y cargá de qué hora a qué hora. Solo esos días se espera la lista.' },
      // Lo maneja el editor de horario; se envía junto con el horario.
      { name: 'dias_clase', label: 'Días de clase', tipo: 'dias', visible: () => false },
      { name: 'horas_semanales', label: 'Horas semanales', tipo: 'numero' },
    ],
    inicial: () => ({ horas_semanales: 2, dias_clase: [], horario: [] }),
  },
  alumnos: {
    titulo: 'Alumnos', singular: 'Alumno', ruta: '/alumnos/',
    columnas: [
      { label: 'Alumno', valor: persona, principal: true },
      { label: 'C.I.', valor: (o) => o.ci },
      { label: 'Sección', valor: (o) => o.seccion_actual?.seccion ?? 'Sin matrícula' },
    ],
    buscar: (o) => `${o.ci} ${o.nombres} ${o.apellidos}`,
    campos: [
      { name: 'ci', label: 'C.I.', requerido: true, medio: true },
      { name: 'sexo', label: 'Sexo', tipo: 'select', medio: true, opciones: [{ valor: 'M', label: 'Masculino' }, { valor: 'F', label: 'Femenino' }] },
      { name: 'nombres', label: 'Nombres', requerido: true },
      { name: 'apellidos', label: 'Apellidos', requerido: true },
      { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', tipo: 'fecha', medio: true },
      { name: 'lugar_nacimiento', label: 'Lugar de nacimiento', medio: true },
      { name: 'telefono', label: 'Teléfono', tipo: 'tel' },
      { name: 'direccion', label: 'Dirección' },
      { name: 'observaciones', label: 'Observaciones', tipo: 'area' },
      { name: 'activo', label: 'Estado', tipo: 'si_no', ayuda: 'Alumno activo' },
    ],
    inicial: () => ({ activo: true }),
    enlace: (o) => `/alumnos/${o.id}`,
  },
  tutores: {
    titulo: 'Padres y tutores', singular: 'Tutor', ruta: '/tutores/',
    columnas: [
      { label: 'Nombre', valor: persona, principal: true },
      { label: 'C.I.', valor: (o) => o.ci },
      { label: 'Teléfono / WhatsApp', valor: (o) => o.telefono },
    ],
    campos: [
      { name: 'ci', label: 'C.I.', requerido: true, medio: true },
      { name: 'telefono', label: 'Teléfono / WhatsApp', tipo: 'tel', medio: true },
      { name: 'nombres', label: 'Nombres', requerido: true },
      { name: 'apellidos', label: 'Apellidos', requerido: true },
      { name: 'email', label: 'Correo', tipo: 'email' },
      { name: 'direccion', label: 'Dirección' },
    ],
  },
  docentes: {
    titulo: 'Docentes', singular: 'Docente', ruta: '/docentes/',
    descripcion: 'Al cargar un docente le podés dar su usuario y contraseña para entrar a la plataforma.',
    columnas: [
      { label: 'Docente', valor: persona, principal: true },
      { label: 'C.I.', valor: (o) => o.ci },
      { label: 'Usuario', valor: (o) => o.username ?? <span className="text-ausente">Sin acceso</span> },
      { label: 'Estado', valor: (o) => SI_NO(o.activo), oculto_movil: true },
    ],
    campos: [
      { name: 'ci', label: 'C.I.', requerido: true, medio: true },
      { name: 'telefono', label: 'Teléfono', tipo: 'tel', medio: true },
      { name: 'nombres', label: 'Nombres', requerido: true },
      { name: 'apellidos', label: 'Apellidos', requerido: true },
      { name: 'email', label: 'Correo', tipo: 'email' },
      { name: 'titulo', label: 'Título' },
      { name: 'fecha_ingreso', label: 'Fecha de ingreso', tipo: 'fecha', medio: true },
      { name: 'username', label: 'Usuario para entrar', medio: true, ayuda: 'Vacío: se usa su C.I.' },
      { name: 'password', label: 'Contraseña', tipo: 'password', medio: true,
        ayuda: 'Mínimo 8 caracteres, no solo números. Al editar, dejala vacía para no cambiarla.' },
      { name: 'activo', label: 'Estado', tipo: 'si_no', ayuda: 'Docente activo (si no, no puede entrar)' },
    ],
    inicial: () => ({ activo: true }),
  },
  usuarios: {
    titulo: 'Usuarios', singular: 'Usuario', ruta: '/usuarios/',
    descripcion: 'Cuentas para entrar al sistema. El rol define qué puede ver cada uno.',
    columnas: [
      { label: 'Usuario', valor: (o) => o.username, principal: true },
      { label: 'Nombre', valor: (o) => `${o.first_name} ${o.last_name}` },
      { label: 'Rol', valor: (o) => ROLES.find((r) => r.valor === o.rol)?.label },
      { label: 'Estado', valor: (o) => SI_NO(o.is_active), oculto_movil: true },
    ],
    campos: [
      { name: 'username', label: 'Usuario', requerido: true, medio: true, ayuda: 'Sugerencia: el número de C.I.' },
      { name: 'rol', label: 'Rol', tipo: 'select', opciones: ROLES, requerido: true, medio: true },
      { name: 'first_name', label: 'Nombres', medio: true },
      { name: 'last_name', label: 'Apellidos', medio: true },
      { name: 'ci', label: 'C.I.', medio: true },
      { name: 'telefono', label: 'Teléfono', tipo: 'tel', medio: true },
      { name: 'email', label: 'Correo', tipo: 'email' },
      { name: 'password', label: 'Contraseña', tipo: 'password', ayuda: 'Dejar vacío para no cambiarla.' },
      { name: 'is_active', label: 'Estado', tipo: 'si_no', ayuda: 'Puede iniciar sesión' },
    ],
    inicial: () => ({ rol: 'DOCENTE', is_active: true }),
  },
  matriculas: {
    titulo: 'Matrículas', singular: 'Matrícula', femenino: true, ruta: '/matriculas/',
    columnas: [
      { label: 'Alumno', valor: (o) => o.alumno_nombre, principal: true },
      { label: 'Sección', valor: (o) => o.seccion_descripcion },
      { label: 'N°', valor: (o) => o.numero_lista ?? '', oculto_movil: true },
      { label: 'Estado', valor: (o) => <Etiqueta tono={o.estado === 'ACTIVA' ? 'verde' : o.estado === 'PENDIENTE_DOC' || o.estado === 'PREINSCRIPTO' ? 'ambar' : 'gris'}>{ESTADOS_MATRICULA.find((e) => e.valor === o.estado)?.label}</Etiqueta> },
    ],
    buscar: (o) => `${o.alumno_nombre} ${o.alumno_ci} ${o.seccion_descripcion}`,
    campos: [
      { name: 'alumno', label: 'Alumno', tipo: 'fk', fk: FK.alumno, requerido: true },
      { name: 'seccion', label: 'Sección', tipo: 'fk', fk: FK.seccion, requerido: true,
        ayuda: 'Para pasar a un alumno a otra sección usá «Cambiar de sección» en su ficha (queda el historial).' },
      { name: 'numero_lista', label: 'N° de lista', tipo: 'numero', medio: true },
      { name: 'fecha', label: 'Fecha', tipo: 'fecha', requerido: true, medio: true },
      { name: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS_MATRICULA, requerido: true },
      { name: 'fecha_baja', label: 'Fecha de baja', tipo: 'fecha', medio: true, visible: (v) => BAJAS_MATRICULA.includes(v.estado) },
      { name: 'motivo_baja', label: 'Motivo de baja', medio: true, requerido: true, visible: (v) => BAJAS_MATRICULA.includes(v.estado) },
      { name: 'institucion_procedencia', label: 'Institución de procedencia' },
    ],
    inicial: () => ({ fecha: hoyISO(), estado: 'ACTIVA' }),
  },
  justificaciones: {
    titulo: 'Justificaciones', singular: 'Justificación', femenino: true, ruta: '/justificaciones/',
    descripcion: 'Se presentan, se revisan y se deciden. Las ausencias no se borran: quedan justificadas al aprobarse.',
    columnas: [
      { label: 'Alumno', valor: (o) => o.alumno, principal: true },
      { label: 'Fechas', valor: (o) => `${fechaCorta(o.fecha_desde)} al ${fechaCorta(o.fecha_hasta)}` },
      { label: 'Motivo', valor: (o) => o.motivo },
    ],
    campos: [
      { name: 'matricula', label: 'Alumno', tipo: 'fk', fk: FK.matricula, requerido: true },
      { name: 'fecha_desde', label: 'Desde', tipo: 'fecha', requerido: true, medio: true },
      { name: 'fecha_hasta', label: 'Hasta', tipo: 'fecha', requerido: true, medio: true },
      { name: 'presentado_por', label: 'Presentado por', ayuda: 'Ej.: la madre, el padre, el tutor.' },
      { name: 'fecha_presentacion', label: 'Fecha de presentación', tipo: 'fecha', requerido: true },
      { name: 'motivo', label: 'Motivo', requerido: true, ayuda: 'Motivo general. No escribas diagnósticos médicos.' },
      { name: 'adjunto', label: 'Certificado o nota (foto o PDF)', tipo: 'archivo' },
    ],
    inicial: () => ({ fecha_desde: hoyISO(), fecha_hasta: hoyISO(), fecha_presentacion: hoyISO() }),
  },
  permisos: {
    titulo: 'Permisos docentes', singular: 'Permiso', ruta: '/permisos-docentes/',
    descripcion: 'Permisos, reposos y licencias. No cuentan como ausencias sin aviso.',
    columnas: [
      { label: 'Docente', valor: (o) => o.docente_nombre, principal: true },
      { label: 'Tipo', valor: (o) => TIPOS_PERMISO.find((t) => t.valor === o.tipo)?.label },
      { label: 'Fechas', valor: (o) => `${fechaCorta(o.fecha_desde)} al ${fechaCorta(o.fecha_hasta)}` },
    ],
    campos: [
      { name: 'docente', label: 'Docente', tipo: 'fk', fk: FK.docente, requerido: true },
      { name: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS_PERMISO, requerido: true },
      { name: 'fecha_desde', label: 'Desde', tipo: 'fecha', requerido: true, medio: true },
      { name: 'fecha_hasta', label: 'Hasta', tipo: 'fecha', requerido: true, medio: true },
      { name: 'motivo', label: 'Motivo' },
      { name: 'adjunto', label: 'Respaldo (foto o PDF)', tipo: 'archivo' },
    ],
    inicial: () => ({ tipo: 'PERMISO', fecha_desde: hoyISO(), fecha_hasta: hoyISO() }),
  },
}

/** Grupos para la pantalla "Gestión". */
export const GRUPOS: { titulo: string; items: { clave: string; texto: string }[] }[] = [
  {
    titulo: 'Institución y calendario',
    items: [
      { clave: 'institucion', texto: 'Datos del colegio y asistencia mínima' },
      { clave: 'anios', texto: 'Año en curso y fechas de clases' },
      { clave: 'etapas', texto: 'Períodos de evaluación del año' },
      { clave: 'feriados', texto: 'Feriados y suspensiones' },
    ],
  },
  {
    titulo: 'Estructura académica',
    items: [
      { clave: 'niveles', texto: 'EEB, Educación Media…' },
      { clave: 'especialidades', texto: 'Bachilleratos y énfasis' },
      { clave: 'cursos', texto: 'Cursos y su plan de estudios' },
      { clave: 'materias', texto: 'Catálogo de materias' },
      { clave: 'secciones', texto: 'Secciones, turnos, cupos y matriculados' },
      { clave: 'asignaciones', texto: 'Qué docente dicta cada materia' },
    ],
  },
  {
    titulo: 'Personas',
    items: [
      { clave: 'alumnos', texto: 'Legajo de cada alumno' },
      { clave: 'tutores', texto: 'Contactos de las familias' },
      { clave: 'docentes', texto: 'Legajo docente' },
      { clave: 'usuarios', texto: 'Cuentas de acceso y roles' },
    ],
  },
  {
    titulo: 'Matrícula y asistencia',
    items: [
      { clave: 'matriculas', texto: 'Inscripciones, pases y retiros' },
      { clave: 'justificaciones', texto: 'Ausencias justificadas de alumnos' },
      { clave: 'permisos', texto: 'Permisos y licencias docentes' },
    ],
  },
]
