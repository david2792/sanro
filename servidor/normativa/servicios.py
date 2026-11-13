from datetime import date

from django.db.models import Q
from django.utils import timezone

from .models import VersionRegla


class ReglaNoDefinida(Exception):
    """No hay una versión aprobada y vigente de la regla para ese alcance y fecha."""


def resolver_regla(codigo, *, institucion=None, fecha=None, nivel=None, modalidad=None):
    """
    Devuelve la VersionRegla APROBADA y vigente que corresponde, eligiendo la de alcance más específico
    (institución > nivel > modalidad) y, a igual alcance, la de vigencia más reciente.

    Quien la use para calcular debe guardar `version.pk` junto al resultado (plan maestro 3.5).
    Lanza ReglaNoDefinida si no hay ninguna: nunca se inventa un valor por defecto.
    """
    fecha = fecha or date.today()
    iid = getattr(institucion, "pk", institucion)
    niveles = [VersionRegla.Nivel.TODOS] + ([nivel] if nivel else [])
    modalidades = [VersionRegla.Modalidad.TODAS] + ([modalidad] if modalidad else [])
    candidatas = list(
        VersionRegla.objects.filter(
            regla__codigo=codigo.upper(), estado=VersionRegla.Estado.APROBADA, vigente_desde__lte=fecha,
            nivel__in=niveles, modalidad__in=modalidades,
        )
        .filter(Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=fecha))
        .filter(Q(institucion__isnull=True) | Q(institucion_id=iid))
        .select_related("regla", "fuente")
    )
    if not candidatas:
        raise ReglaNoDefinida(
            f"No hay una versión aprobada y vigente de la regla {codigo} al {fecha:%d/%m/%Y}"
            f"{' para ' + nivel if nivel else ''}{' / ' + modalidad if modalidad else ''}."
        )
    return max(candidatas, key=lambda v: (v.especificidad, v.vigente_desde, v.version))


def aprobar_version(version, usuario):
    """Aprueba una versión (requiere fuente y valor válido)."""
    version.estado = VersionRegla.Estado.APROBADA
    version.full_clean()
    version.aprobada_por = usuario
    version.aprobada_en = timezone.now()
    version.save()
    return version
