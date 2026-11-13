from django.contrib import admin

from .models import AsociacionACE, ConceptoAporte, LineaRecibo, Recibo


@admin.register(AsociacionACE)
class AsociacionACEAdmin(admin.ModelAdmin):
    list_display = ("denominacion", "institucion", "ruc", "estado")


@admin.register(ConceptoAporte)
class ConceptoAporteAdmin(admin.ModelAdmin):
    list_display = ("nombre", "tipo", "anio_lectivo", "monto_sugerido", "activo")
    list_filter = ("anio_lectivo", "tipo", "activo")


class LineaInline(admin.TabularInline):
    model = LineaRecibo
    extra = 0

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Recibo)
class ReciboAdmin(admin.ModelAdmin):
    """Los recibos no se editan ni se borran: se anulan o revierten desde el sistema."""

    list_display = ("numero", "serie", "ejercicio", "fecha", "aportante_nombre", "medio", "estado")
    list_filter = ("ejercicio", "serie", "medio", "estado")
    date_hierarchy = "fecha"
    search_fields = ("aportante_nombre", "aportante_documento", "numero")
    inlines = [LineaInline]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
