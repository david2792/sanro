"""
Años lectivos cerrados (plan maestro, módulo 1; docs/decisiones/0010-cierre-de-anio.md).

Ningún dato que pertenezca a un año CERRADO o ARCHIVADO se crea, modifica ni borra. Para corregir,
dirección reabre el año con motivo. Se controla con señales sobre cada modelo; RUTAS dice cómo llegar
desde cada registro a su año lectivo.

Limitación: QuerySet.update() y los cambios en relaciones muchos-a-muchos no pasan por las señales.
"""
from django.apps import apps
from django.core.exceptions import PermissionDenied
from django.db.models.signals import pre_delete, pre_save

_A = "asignacion.seccion.anio_lectivo"
RUTAS = {
    "academico.Seccion": "anio_lectivo",
    "academico.Etapa": "anio_lectivo",
    "academico.DiaNoLectivo": "anio_lectivo",
    "academico.Asignacion": "seccion.anio_lectivo",
    "academico.Matricula": "seccion.anio_lectivo",
    "academico.CambioSeccion": "matricula.anio_lectivo",
    "asistencia.SesionClase": _A,
    "asistencia.RegistroAsistencia": "sesion." + _A,
    "asistencia.Justificacion": "matricula.anio_lectivo",
    "asistencia.AusenciaJustificada": "justificacion.matricula.anio_lectivo",
    "pedagogico.Unidad": _A,
    "pedagogico.Capacidad": "unidad." + _A,
    "pedagogico.Indicador": "capacidad.unidad." + _A,
    "pedagogico.RegistroClase": "sesion." + _A,
    "pedagogico.PlanClase": _A,
    "pedagogico.Sugerencia": _A,
    "pedagogico.RegistroAnecdotico": _A,
    "pedagogico.Instrumento": _A,
    "pedagogico.Puntaje": "instrumento." + _A,
    "pedagogico.LogroIndicador": "indicador.capacidad.unidad." + _A,
    "pedagogico.PlanAnual": _A,
    "aportes.ConceptoAporte": "anio_lectivo",
    "aportes.Exoneracion": "concepto.anio_lectivo",
    "aportes.Pago": "matricula.anio_lectivo",
    "aportes.DetallePago": "pago.matricula.anio_lectivo",
}

_rutas_por_modelo = {}


class AnioCerrado(PermissionDenied):
    pass


def anio_de(instancia, ruta):
    obj = instancia
    for parte in ruta.split("."):
        obj = getattr(obj, parte, None)
        if obj is None:
            return None
    return obj


def verificar(instancia, ruta):
    anio = anio_de(instancia, ruta)
    if anio is not None and anio.pk:
        # Se lee el estado guardado (no el que tenga el objeto en memoria).
        estado = type(anio)._base_manager.filter(pk=anio.pk).values_list("estado", flat=True).first()
        if estado in anio.BLOQUEADOS:
            raise AnioCerrado(
                f"El año lectivo {anio.anio} está cerrado: sus datos no se modifican. "
                "Para corregir algo, la dirección debe reabrirlo (con motivo).")


def _antes_de_guardar(sender, instance, raw=False, **kwargs):
    ruta = _rutas_por_modelo.get(sender)
    if ruta and not raw:
        if instance.pk is not None:
            # Si el registro se mueve de año, también se controla el año en el que estaba.
            previo = sender._base_manager.filter(pk=instance.pk).first()
            if previo is not None:
                verificar(previo, ruta)
        verificar(instance, ruta)


def _antes_de_borrar(sender, instance, **kwargs):
    ruta = _rutas_por_modelo.get(sender)
    if ruta:
        verificar(instance, ruta)


def conectar():
    for etiqueta, ruta in RUTAS.items():
        _rutas_por_modelo[apps.get_model(etiqueta)] = ruta
    pre_save.connect(_antes_de_guardar, dispatch_uid="sige_cierre_guardar")
    pre_delete.connect(_antes_de_borrar, dispatch_uid="sige_cierre_borrar")
