from django.apps import AppConfig


class NucleoConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "nucleo"
    verbose_name = "Núcleo (auditoría, archivos, instituciones)"

    def ready(self):
        from django.db import models
        from rest_framework.serializers import ModelSerializer
        from rest_framework.views import APIView

        from . import auditoria, contexto
        from .archivos import ArchivoPrivadoField

        auditoria.conectar()

        # Los datos de un año lectivo cerrado o archivado no se modifican (plan maestro, módulo 1).
        from academico import cierre

        cierre.conectar()

        # Todos los FileField de la API se muestran como enlaces firmados (nunca la ruta de /media/).
        ModelSerializer.serializer_field_mapping[models.FileField] = ArchivoPrivadoField

        # Las vistas de DRF autentican por JWT después del middleware: avisarle a la auditoría
        # quién es el usuario apenas DRF lo conoce.
        if not getattr(APIView.initial, "_sige", False):
            original = APIView.initial

            def initial(vista, request, *args, **kwargs):
                original(vista, request, *args, **kwargs)
                contexto.fijar_usuario(request.user)

            initial._sige = True
            APIView.initial = initial
