from rest_framework.permissions import SAFE_METHODS, BasePermission


class EsGestion(BasePermission):
    """Director/a, coordinación, secretaría o superusuario."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.es_gestion)


class EsPersonal(BasePermission):
    """Funcionarios del colegio (no padres/tutores ni la comisión de la ACES)."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.is_superuser or u.rol not in (u.Rol.TUTOR, u.Rol.ACES)))


class GestionEscribePersonalLee(BasePermission):
    """El personal consulta; solo gestión crea, modifica o borra."""

    def has_permission(self, request, view):
        if not EsPersonal().has_permission(request, view):
            return False
        return request.method in SAFE_METHODS or request.user.es_gestion


class PermisoACE(BasePermission):
    """
    Aportes a la ACE (docs/decisiones/0012): los operan la comisión de la ACE, la dirección y la secretaría.
    Todo queda registrado con quién lo hizo (auditoría, registrado_por, anulado_por).
    """

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        return u.is_superuser or u.es_aces or u.rol in (u.Rol.DIRECTOR, u.Rol.SECRETARIA)
