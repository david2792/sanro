from django.contrib import admin

from .models import FuenteNormativa, ReglaNormativa, VersionRegla


@admin.register(FuenteNormativa)
class FuenteNormativaAdmin(admin.ModelAdmin):
    list_display = ("tipo", "numero", "organismo", "titulo", "verificacion", "institucion")
    list_filter = ("tipo", "verificacion")
    search_fields = ("numero", "titulo", "organismo")


class VersionReglaInline(admin.TabularInline):
    model = VersionRegla
    extra = 0
    fields = ("version", "valor", "fuente", "articulo", "institucion", "nivel", "modalidad",
              "vigente_desde", "vigente_hasta", "estado")
    readonly_fields = ("version",)


@admin.register(ReglaNormativa)
class ReglaNormativaAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nombre", "area", "tipo_valor")
    list_filter = ("area",)
    search_fields = ("codigo", "nombre")
    inlines = [VersionReglaInline]


@admin.register(VersionRegla)
class VersionReglaAdmin(admin.ModelAdmin):
    list_display = ("regla", "version", "estado", "nivel", "modalidad", "institucion", "vigente_desde", "vigente_hasta")
    list_filter = ("estado", "nivel", "modalidad")
    readonly_fields = ("aprobada_por", "aprobada_en")
