from django.contrib import admin

from .models import (PlanAnual, Capacidad, Indicador, Instrumento, LogroIndicador, Puntaje, RegistroAnecdotico,
                     RegistroClase, Unidad)


class CapacidadInline(admin.StackedInline):
    model = Capacidad
    extra = 0


@admin.register(Unidad)
class UnidadAdmin(admin.ModelAdmin):
    list_display = ("numero", "titulo", "asignacion", "etapa")
    list_filter = ("asignacion__seccion__anio_lectivo", "asignacion__seccion")
    search_fields = ("titulo", "asignacion__materia__nombre")
    inlines = [CapacidadInline]


class IndicadorInline(admin.TabularInline):
    model = Indicador
    extra = 0


@admin.register(Capacidad)
class CapacidadAdmin(admin.ModelAdmin):
    list_display = ("__str__", "unidad")
    inlines = [IndicadorInline]


@admin.register(RegistroClase)
class RegistroClaseAdmin(admin.ModelAdmin):
    list_display = ("sesion", "unidad")
    list_filter = ("sesion__fecha", "sesion__asignacion__seccion")
    filter_horizontal = ("capacidades", "indicadores_evaluados")
    raw_id_fields = ("sesion",)


@admin.register(RegistroAnecdotico)
class RegistroAnecdoticoAdmin(admin.ModelAdmin):
    list_display = ("fecha", "asignacion", "tipo", "informado_a_tutor", "registrado_por")
    list_filter = ("tipo", "fecha", "asignacion__seccion")
    search_fields = ("hecho", "alumnos__alumno__apellidos", "alumnos__alumno__ci")
    filter_horizontal = ("alumnos",)
    readonly_fields = ("registrado_por", "creado", "modificado")

    def save_model(self, request, obj, form, change):
        if not obj.registrado_por_id:
            obj.registrado_por = request.user
        super().save_model(request, obj, form, change)


class PuntajeInline(admin.TabularInline):
    model = Puntaje
    extra = 0
    fields = ("matricula", "puntaje", "observacion")
    raw_id_fields = ("matricula",)


@admin.register(Instrumento)
class InstrumentoAdmin(admin.ModelAdmin):
    list_display = ("titulo", "tipo", "asignacion", "etapa", "fecha", "puntaje_total")
    list_filter = ("tipo", "etapa", "asignacion__seccion")
    filter_horizontal = ("indicadores",)
    inlines = [PuntajeInline]


@admin.register(LogroIndicador)
class LogroIndicadorAdmin(admin.ModelAdmin):
    list_display = ("matricula", "indicador", "estado", "modificado")
    list_filter = ("estado", "indicador__capacidad__unidad__asignacion__seccion")
    raw_id_fields = ("matricula", "indicador")


@admin.register(PlanAnual)
class PlanAnualAdmin(admin.ModelAdmin):
    list_display = ("asignacion", "estado", "enviado", "revisado", "revisado_por")
    list_filter = ("estado",)
