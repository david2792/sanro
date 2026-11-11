# Sistema San Roque — Frontend (React)

React 19 + Vite + Tailwind CSS 4 + React Router + TanStack Query.
Pensado primero para el celular del docente; en computadora muestra menú lateral.

## Puesta en marcha (Windows)
Con Django corriendo en otra terminal (`python manage.py runserver`):
```
cd docente
npm install
npm run dev
```
Abrí http://localhost:5173

## Usarlo desde el celular (misma red Wi-Fi)
1. En la PC: `ipconfig` y anotá la "Dirección IPv4" (ej. 192.168.1.50).
2. `npm run dev` (ya escucha en toda la red).
3. En el celular: http://192.168.1.50:5173
Si no abre, permití Node.js en el Firewall de Windows (redes privadas).
Vite reenvía /api y /media a Django, así que no hace falta tocar CORS.

## Roles
- Dirección, Coordinación, Secretaría: Tablero, Alumnos, Gestión (todas las tablas) y Mis clases si también son docentes.
- Docente: Mis clases → Lista, Desarrollo, Trabajos, Unidades, Anecdótico.

## Sin señal
Si el docente guarda una lista sin internet, queda en el teléfono y se envía sola al volver la señal
(aviso "por enviar" arriba). Para instalarla como app y abrirla sin señal se necesita HTTPS (producción).

## Estructura
- src/lib: API (JWT), sesión, cola sin conexión, utilidades
- src/components: interfaz (ui.tsx), menú (Layout.tsx), ABM genérico (Crud.tsx)
- src/pages/docente: pantallas del docente
- src/pages/gestion: tablero, referenciales (referenciales.tsx define todas las tablas) y detalles
