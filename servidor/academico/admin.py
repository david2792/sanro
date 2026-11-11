from django.contrib import admin

from .models import (AnioLectivo, Asignacion, Curso, DiaNoLectivo, Especialidad, Etapa,
                     Institucion, Materia, Matricula, Nivel, PlanMateria, Seccion)

admin.site.site_header = "Sistema San Roque"
admin.site.site_title = "Sistema San Roque"
admin.site.index_title = "Administración"


@admin.register(Institucion)
class InstitucionAdmin(admin.ModelAdmin):
    list_display = ("nombre", "codigo_mec", "ciudad", "asistencia_minima", "logro_minimo")


class EtapaInline(admin.TabularInline):
    model = Etapa
    extra = 0


class DiaNoLectivoInline(admin.TabularInline):
    model = DiaNoLectivo
    extra = 0


@admin.register(AnioLectivo)
class AnioLectivoAdmin(admin.ModelAdmin):
    list_display = ("anio", "fecha_inicio", "fecha_fin", "activo")
    inlines = [EtapaInline, DiaNoLectivoInline]


admin.site.register(Nivel)


@admin.register(Especialidad)
class EspecialidadAdmin(admin.ModelAdmin):
    list_display = ("nombre", "nivel")


class PlanMateriaInline(admin.TabularInline):
    model = PlanMateria
    extra = 1


@admin.register(Curso)
class CursoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "nivel", "especialidad", "grado")
    list_filter = ("nivel", "especialidad")
    inlines = [PlanMateriaInline]


@admin.register(Materia)
class MateriaAdmin(admin.ModelAdmin):
    search_fields = ("nombre",)


class AsignacionInline(admin.TabularInline):
    model = Asignacion
    extra = 1
    autocomplete_fields = ["docente", "materia"]


class MatriculaInline(admin.TabularInline):
    model = Matricula
    extra = 0
    fields = ("numero_lista", "alumno", "fecha", "estado")
    autocomplete_fields = ["alumno"]


@admin.register(Seccion)
class SeccionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "turno", "cupo", "inscriptos", "docente_guia")
    list_filter = ("anio_lectivo", "turno", "curso__nivel")
    inlines = [AsignacionInline, MatriculaInline]


@admin.register(Asignacion)
class AsignacionAdmin(admin.ModelAdmin):
    list_display = ("materia", "seccion", "docente", "horas_semanales")
    list_filter = ("seccion__anio_lectivo", "seccion")
    search_fields = ("materia__nombre", "docente__apellidos")


@admin.register(Matricula)
class MatriculaAdmin(admin.ModelAdmin):
    list_display = ("alumno", "seccion", "numero_lista", "estado", "fecha")
    list_filter = ("anio_lectivo", "estado", "seccion")
    search_fields = ("alumno__ci", "alumno__apellidos", "alumno__nombres")
    autocomplete_fields = ["alumno"]
