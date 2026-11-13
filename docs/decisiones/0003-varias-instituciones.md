# 0003 — Varias instituciones en esquema compartido

**Fecha:** 2026-11-13 · **Estado:** Aceptada

## Contexto
El plan exige una arquitectura multiinstitucional. Opciones: una base o esquema PostgreSQL por
institución (`django-tenants`), o un esquema compartido con una columna `institucion` por fila.

## Decisión
Esquema compartido. Los modelos raíz tienen `institucion` (FK, no editable por la API):
`AnioLectivo`, `Nivel`, `Materia`, `Alumno`, `Tutor`, `Docente` y `Usuario`. El resto pertenece a una
institución a través de su relación (por ejemplo `Seccion → AnioLectivo`).

- `nucleo.instituciones.PorInstitucionMixin` filtra cada vista por la institución del usuario
  (`campo_institucion` indica el camino) y asigna la institución al crear.
- `institucion_de(request)` reemplaza a `Institucion.objects.first()`.
- `AnioLectivo.actual(institucion)` busca el año activo de esa institución.
- Las unicidades pasan a ser por institución (C.I. del alumno, año, nombre de materia y de nivel).
- Superusuario sin institución asignada: ve todas.

## Consecuencias
- Migraciones simples y una sola base de datos.
- Transitorio: mientras exista una sola institución, la FK tiene como valor por defecto la primera
  institución (`institucion_por_defecto`), para no romper comandos, admin ni pruebas.
- **Pendiente antes de alojar una segunda institución:** validar en los serializers que las claves
  foráneas enviadas pertenezcan a la institución del usuario, y revisar los reportes que aún reciben
  identificadores sin filtrar. Está anotado en el ROADMAP. Más adelante se puede reforzar con
  seguridad por filas de PostgreSQL (RLS).
