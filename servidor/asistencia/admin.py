from django.contrib import admin

from .models import Justificacion, PermisoDocente, RegistroAsistencia, SesionClase


class RegistroInline(admin.TabularInline):
    model = RegistroAsistencia
    extra = 0
    fields = ("matricula", "estado", "hora_llegada", "observacion")
    raw_id_fields = ("matricula",)


@admin.register(SesionClase)
class SesionClaseAdmin(admin.ModelAdmin):
    list_display = ("fecha", "hora_inicio", "asignacion", "docente")
    list_filter = ("fecha", "asignacion__seccion")
    date_hierarchy = "fecha"
    readonly_fields = ("uuid", "creado", "sincronizado", "registrado_por")
    inlines = [RegistroInline]


@admin.register(Justificacion)
class JustificacionAdmin(admin.ModelAdmin):
    list_display = ("matricula", "fecha_desde", "fecha_hasta", "motivo")
    raw_id_fields = ("matricula",)


@admin.register(PermisoDocente)
class PermisoDocenteAdmin(admin.ModelAdmin):
    list_display = ("docente", "tipo", "fecha_desde", "fecha_hasta")
    list_filter = ("tipo",)
