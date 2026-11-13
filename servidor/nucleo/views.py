from rest_framework import generics, serializers

from personas.permisos import EsGestion
from .models import RegistroAuditoria


class RegistroAuditoriaSerializer(serializers.ModelSerializer):
    accion_nombre = serializers.CharField(source="get_accion_display", read_only=True)

    class Meta:
        model = RegistroAuditoria
        fields = ["id", "fecha", "usuario", "usuario_nombre", "accion", "accion_nombre", "modelo",
                  "objeto_id", "descripcion", "cambios", "motivo", "ip"]


class AuditoriaLista(generics.ListAPIView):
    """
    GET /api/auditoria/?modelo=asistencia.registroasistencia&objeto_id=5&usuario=3&accion=MODIFICAR
                       &desde=2026-03-01&hasta=2026-03-31
    Solo gestión, y solo los registros de su institución.
    """

    serializer_class = RegistroAuditoriaSerializer
    permission_classes = [EsGestion]

    def get_queryset(self):
        qs = RegistroAuditoria.objects.all()
        user = self.request.user
        if getattr(user, "institucion_id", None):
            qs = qs.filter(institucion_id=user.institucion_id)
        p = self.request.query_params
        for campo in ("modelo", "objeto_id", "usuario", "accion"):
            if p.get(campo):
                qs = qs.filter(**{campo: p[campo]})
        if p.get("desde"):
            qs = qs.filter(fecha__date__gte=p["desde"])
        if p.get("hasta"):
            qs = qs.filter(fecha__date__lte=p["hasta"])
        return qs
