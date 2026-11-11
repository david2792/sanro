from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Alumno, AlumnoTutor, Docente, DocumentoAlumno, Tutor, Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ("username", "first_name", "last_name", "rol", "is_active")
    list_filter = ("rol", "is_active")
    fieldsets = UserAdmin.fieldsets + (("Datos del colegio", {"fields": ("rol", "ci", "telefono")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Datos del colegio", {"fields": ("rol", "first_name", "last_name", "ci")}),)


class AlumnoTutorInline(admin.TabularInline):
    model = AlumnoTutor
    extra = 1
    autocomplete_fields = ["tutor"]


class DocumentoInline(admin.TabularInline):
    model = DocumentoAlumno
    extra = 0


@admin.register(Alumno)
class AlumnoAdmin(admin.ModelAdmin):
    list_display = ("ci", "apellidos", "nombres", "fecha_nacimiento", "activo")
    search_fields = ("ci", "nombres", "apellidos")
    list_filter = ("activo", "sexo")
    inlines = [AlumnoTutorInline, DocumentoInline]


@admin.register(Tutor)
class TutorAdmin(admin.ModelAdmin):
    list_display = ("ci", "apellidos", "nombres", "telefono")
    search_fields = ("ci", "nombres", "apellidos", "telefono")


@admin.register(Docente)
class DocenteAdmin(admin.ModelAdmin):
    list_display = ("ci", "apellidos", "nombres", "telefono", "usuario", "activo")
    search_fields = ("ci", "nombres", "apellidos")
    list_filter = ("activo",)
