# SIGE — Sistema Integral de Gestión Escolar (repositorio `sanro`)

Documento maestro: [docs/PLAN_MAESTRO_SIGE.md](docs/PLAN_MAESTRO_SIGE.md).
Hoja de ruta: [docs/ROADMAP.md](docs/ROADMAP.md). Decisiones técnicas: [docs/decisiones/](docs/decisiones/).

## Stack
- `servidor/`: Django 6 + Django REST Framework + simplejwt, PostgreSQL. Python 3.12+.
- `docente/`: React 19 + TypeScript + Vite + Tailwind 4 + TanStack Query. PWA con cola sin conexión.

## Comandos
```
# Backend (dentro de servidor/, con venv activo)
python manage.py runserver
python manage.py makemigrations && python manage.py migrate
python manage.py test --parallel 4 --keepdb

# Frontend (dentro de docente/)
npm run dev
npm run lint
npm run build      # incluye chequeo de tipos (tsc -b)
```

## Reglas permanentes
1. Leer el plan maestro antes de cambios grandes. Trabajar por fases y funcionalidades verticales:
   migración, modelo, validación, autorización, servicio, endpoint, interfaz, pruebas y documentación.
2. **Todo en español**: modelos, campos, endpoints, variables y textos de la interfaz (voseo paraguayo en la UI).
3. **Evolucionar, no reescribir**: cada cambio de modelo va con su migración y debe conservar los datos existentes.
4. **Varias instituciones**: todo dato pertenece a una institución. Las vistas filtran con
   `nucleo.instituciones.PorInstitucionMixin` y los datos de la institución actual se obtienen con
   `institucion_de(request)`. Nunca usar `Institucion.objects.first()` en código nuevo.
5. **Sin números mágicos normativos**: las reglas de evaluación, promoción y exigencia van al registro
   normativo (`normativa`), versionadas y con fuente. Los parámetros institucionales (alertas) se leen
   de la institución, sin valores por defecto repetidos en el código.
6. **No borrar registros académicos ni financieros confirmados** (asistencia, puntajes, recibos):
   se anulan o corrigen con motivo. Las relaciones hacia ellos usan `on_delete=PROTECT`.
7. **Auditoría**: los modelos de las apps del sistema quedan auditados automáticamente
   (`nucleo.auditoria`). Las actualizaciones masivas (`QuerySet.update()`) NO pasan por la auditoría:
   evitarlas en datos académicos o registrar el cambio a mano con `registrar_evento`.
8. **Archivos privados**: los `FileField` se sirven solo por enlace firmado y temporal
   (`/api/archivos/<firma>/`). Nunca exponer `/media/` públicamente.
9. **Privacidad**: datos de menores. Minimizar datos, no mostrar documentos de identidad sin necesidad,
   **nunca** subir datos reales (CSV, Excel, respaldos) al repositorio.
10. SIGE complementa al RUE y a Paraguay Aprende: no hacer scraping de sistemas del MEC ni guardar
    contraseñas de terceros. No inventar normas ni reglas de calificación.
11. Aportes a la ACE: voluntarios. Nunca modelar deuda, morosidad ni bloqueos por falta de aporte.
12. Después de cada entrega: pruebas del backend, `npm run lint` y `npm run build`.
    No declarar terminada una fase si no cumple sus criterios de aceptación (ver ROADMAP).
13. Git: trabajar en la rama `desarrollo`; a `main` solo por Pull Request.
