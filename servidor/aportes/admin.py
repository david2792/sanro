from django.contrib import admin

from .models import ConceptoAporte, DetallePago, Exoneracion, Pago


@admin.register(ConceptoAporte)
class ConceptoAporteAdmin(admin.ModelAdmin):
    list_display = ("nombre", "anio_lectivo", "periodicidad", "monto", "activo")
    list_filter = ("anio_lectivo", "periodicidad", "activo")
    filter_horizontal = ("cursos",)


class DetalleInline(admin.TabularInline):
    model = DetallePago
    extra = 0


@admin.register(Pago)
class PagoAdmin(admin.ModelAdmin):
    list_display = ("numero", "anio_lectivo", "fecha", "matricula", "medio", "anulado")
    list_filter = ("anio_lectivo", "medio", "anulado")
    date_hierarchy = "fecha"
    raw_id_fields = ("matricula",)
    readonly_fields = ("numero", "anio_lectivo", "registrado_por", "anulado_por", "anulado_en", "creado")
    inlines = [DetalleInline]


@admin.register(Exoneracion)
class ExoneracionAdmin(admin.ModelAdmin):
    list_display = ("matricula", "concepto", "motivo")
    list_filter = ("concepto",)
    raw_id_fields = ("matricula",)
