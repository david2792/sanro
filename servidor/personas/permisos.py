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
    La ACE administra sus fondos; la institución no (plan maestro 2.4).
    Comisión de la ACE (y superusuario): todo. Dirección: solo consulta, por transparencia.
    """

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if u.is_superuser or u.es_aces:
            return True
        return request.method in SAFE_METHODS and u.rol == u.Rol.DIRECTOR
