"""
Trámite de justificativos (plan maestro, módulo 5; docs/decisiones/0008-justificativos.md).

- La ausencia nunca se reemplaza: queda "A" y su marca `justificada` se recalcula según los
  justificativos aprobados que la incluyen.
- Nunca se aprueba solo: alguien de gestión decide, con fecha y usuario.
- Todo cambio se guarda fila por fila para que quede en la auditoría.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import AusenciaJustificada, Justificacion, RegistroAsistencia

E = Justificacion.Estado
DECISIONES = (E.APROBADO, E.APROBADO_PARCIAL, E.RECHAZADO, E.REQUIERE_INFO)


def recalcular(registro):
    """La ausencia está justificada si algún justificativo aprobado la aprobó."""
    valor = registro.estado == RegistroAsistencia.Estado.AUSENTE and AusenciaJustificada.objects.filter(
        registro=registro, aprobada=True, justificacion__estado__in=Justificacion.APROBADOS,
    ).exists()
    if registro.justificada != valor:
        registro.justificada = valor
        registro.save(update_fields=["justificada"])


def vincular_ausencias(justificacion):
    """Suma al trámite las ausencias del alumno en el rango que todavía no están incluidas."""
    ya = set(justificacion.vinculos.values_list("registro_id", flat=True))
    nuevas = RegistroAsistencia.objects.filter(
        matricula=justificacion.matricula, estado=RegistroAsistencia.Estado.AUSENTE,
        sesion__fecha__range=(justificacion.fecha_desde, justificacion.fecha_hasta),
    ).exclude(pk__in=ya)
    for r in nuevas:
        AusenciaJustificada.objects.create(justificacion=justificacion, registro=r)


def _cerrar(justificacion, estado, usuario, motivo):
    justificacion.estado = estado
    justificacion.revisado_por = usuario
    justificacion.decidido_en = timezone.now()
    justificacion.motivo_decision = motivo
    justificacion.save()


@transaction.atomic
def decidir(justificacion, usuario, decision, motivo="", aprobadas=None):
    """
    decision: APROBADO, APROBADO_PARCIAL (con `aprobadas` = ids de registros), RECHAZADO o REQUIERE_INFO.
    """
    motivo = (motivo or "").strip()
    if decision not in DECISIONES:
        raise ValidationError("Decisión no válida.")
    if not justificacion.abierto:
        raise ValidationError(f"El justificativo ya está {justificacion.get_estado_display().lower()}.")
    if decision != E.APROBADO and not motivo:
        raise ValidationError({"motivo": "Indicá el motivo de la decisión."})

    vincular_ausencias(justificacion)
    vinculos = list(justificacion.vinculos.select_related("registro"))
    if decision in (E.APROBADO, E.APROBADO_PARCIAL) and not vinculos:
        raise ValidationError("No hay ausencias registradas en esas fechas para justificar.")

    if decision == E.APROBADO_PARCIAL:
        ids = {int(i) for i in (aprobadas or [])}
        validos = {v.registro_id for v in vinculos}
        if not ids or not ids <= validos:
            raise ValidationError({"aprobadas": "Elegí las ausencias que se aprueban (de las incluidas en el trámite)."})
        if ids == validos:
            decision = E.APROBADO  # se aprobaron todas
    else:
        ids = {v.registro_id for v in vinculos} if decision == E.APROBADO else set()

    if decision != E.REQUIERE_INFO:
        for v in vinculos:
            nuevo = v.registro_id in ids
            if v.aprobada != nuevo:
                v.aprobada = nuevo
                v.save()
    if decision == E.REQUIERE_INFO:
        justificacion.estado = E.REQUIERE_INFO
        justificacion.motivo_decision = motivo
        justificacion.revisado_por = usuario
        justificacion.save()
    else:
        _cerrar(justificacion, decision, usuario, motivo)
    for v in vinculos:
        recalcular(v.registro)
    return justificacion


@transaction.atomic
def cancelar(justificacion, usuario, motivo):
    if justificacion.estado in (E.RECHAZADO, E.CANCELADO):
        raise ValidationError("El justificativo ya está cerrado.")
    if not (motivo or "").strip():
        raise ValidationError({"motivo": "Indicá por qué se cancela."})
    _cerrar(justificacion, E.CANCELADO, usuario, motivo.strip())
    for v in justificacion.vinculos.select_related("registro"):
        recalcular(v.registro)
    return justificacion


def aviso_del_docente(registro, nota, usuario):
    """
    El docente marcó en la lista que el alumno faltó con aviso (antes era el estado "J").
    Queda un justificativo PRESENTADO para que gestión lo revise; si ya existe uno abierto, se actualiza.
    """
    vinculo = (AusenciaJustificada.objects.select_related("justificacion")
               .filter(registro=registro, justificacion__origen=Justificacion.Origen.DOCENTE,
                       justificacion__estado__in=Justificacion.ABIERTOS).first())
    if vinculo:
        j = vinculo.justificacion
        if j.motivo != nota:
            j.motivo = nota
            j.save()
        return j
    fecha = registro.sesion.fecha
    j = Justificacion.objects.create(
        matricula=registro.matricula, fecha_desde=fecha, fecha_hasta=fecha, motivo=nota,
        origen=Justificacion.Origen.DOCENTE, estado=E.PRESENTADO, registrado_por=usuario,
    )
    AusenciaJustificada.objects.create(justificacion=j, registro=registro)
    return j


def retirar_aviso_del_docente(registro, usuario):
    """Si el docente corrige la marca y el alumno ya no figura ausente con aviso, se cancela su aviso pendiente."""
    for v in (AusenciaJustificada.objects.select_related("justificacion")
              .filter(registro=registro, justificacion__origen=Justificacion.Origen.DOCENTE,
                      justificacion__estado__in=Justificacion.ABIERTOS)):
        _cerrar(v.justificacion, E.CANCELADO, usuario, "El docente corrigió la marca de asistencia.")
