# OCID — Exposición general del proyecto y arquitectura MVC

OCID es una aplicación web para gestionar **departamentos, docentes, anuncios, archivos, tareas y notificaciones**. Está dividida en dos capas:

- **Frontend**: páginas HTML, CSS por módulo y JavaScript organizado como MVC.
- **Backend**: API REST con Express, JWT y PostgreSQL.

La reorganización a MVC conservó el comportamiento original: las **51 rutas**, los payloads, el orden de los middleware y el diseño visual. Solo se separaron responsabilidades y se aplicaron los ajustes pedidos explícitamente.

---

## 1. Cómo se construyeron las funcionalidades

### Flujo general de una acción

1. El usuario interactúa con una **vista** (`frontend/html/*.html`).
2. Un **controlador frontend** (`frontend/js/controllers/*.js`) escucha el evento, valida y coordina.
3. El controlador llama a un **modelo frontend** (`session.js`, `api.js`, `ui.js`).
4. `api.js` hace `fetch` a `https://ocid.onrender.com` y añade el token `Bearer`.
5. El **backend** recibe la petición en `routes/public.js` o `routes/private.js`.
6. Los **middleware** verifican JWT y limitan intentos.
7. El **controlador backend** aplica reglas de negocio y llama a los **modelos**.
8. Los modelos ejecutan SQL parametrizado contra PostgreSQL.
9. La respuesta JSON vuelve al frontend, que actualiza el DOM sin recargar la página.

### Sesión y seguridad

- `login` y `registro` validan credenciales con `bcrypt` y emiten un **JWT**.
- El token se guarda en `localStorage` como `token_ocid` y el perfil como `usuario_ocid`.
- `route-guard.js` protege las páginas privadas antes de mostrarlas.
- `autenticarJWT` rechaza peticiones sin token (`401`) o con token inválido/expirado (`403`).
- Un `401` limpia la sesión y redirige a `login.html`.
- Hay limitadores de intentos: 15 intentos de acceso y 10 de creación/unirse a departamentos por 15 minutos.

### Roles y permisos

- Los roles son **Administrador General**, **Jefe de Departamento** y **Docente**, además de roles personalizados por departamento.
- `models/utils.js` normaliza roles, banderas (`t`, `f`, `sí`, `no`), nombres de departamento, colores, códigos y fechas.
- `models/access.js` consulta el contexto del usuario: departamento, jefatura y permisos.
- Los controladores backend deciden quién puede editar, eliminar, transferir la jefatura o restaurar elementos.

### Paginación

- Está implementada en `tareas.js` y `docentes.js` con el patrón visual `< 1 >`.
- Las flechas `<` y `>` **siempre son presionables**.
- Si no hay página destino, el clic **no hace nada**: no cambia la página ni vuelve a renderizar.
- Las flechas nunca reciben la clase de “página activa”.

### Papelera, restauración y borrado permanente

- Anuncios, archivos y tareas tienen rutas de papelera, restauración y borrado permanente.
- El borrado normal marca `eliminado = TRUE`; el restaurado lo revierte; el permanente ejecuta `DELETE`.
- Las consultas usan el contexto del usuario para respetar permisos por departamento.

### Notificaciones

- Se generan al crear o actualizar elementos.
- La campana global consulta `/notificaciones`, actualiza el contador y permite marcar como leído.
- `postElementostipoidvisto` registra qué usuario vio cada elemento.

### Navegación e interfaz

- `ui.js` centraliza toasts, modal de confirmación, menú móvil, campana y contador de notificaciones.
- La barra superior y el menú lateral se comparten entre páginas.
- Se conservaron las restricciones visuales: **sin variables CSS, sin estilos inline, sin `aria-label`, sin scrollbars personalizados** y sin `data-*` innecesarios.
- `login.css` se alineó con `registro.css` para lograr paridad visual; no se aplicó un parche global en `base.css`.
- Se corrigió el mojibake en 8 HTML: era UTF‑8 doblemente codificado.

### Cambios recientes

- Se **eliminó la migración automática** del esquema. El arranque es inmediato; una base de datos nueva o antigua requiere migración manual.
- Los archivos de **infraestructura** se renombraron al inglés (`environment.js`, `database.js`, `auth.js`, `public.js`, etc.).
- Los archivos de **dominio** siguen en español (`anuncios.js`, `tareas.js`, `departamentos.js`, etc.).
- El modelo único `core.js` se separó en `session.js`, `api.js` y `ui.js`.

---

## 2. Uso de Express, JWT y CORS

### Express

**Cómo se usó**

- `express()` crea la aplicación en `backend/server.js`.
- `app.set('trust proxy', 1)` permite confiar en el proxy inverso de Render.
- `app.use(cors(corsOptions))` y `app.options('*', cors(corsOptions))` gestionan CORS y las peticiones `OPTIONS` de preflight.
- `app.use(express.json({ limit: '15mb' }))` convierte el cuerpo JSON de las peticiones en `req.body`. El límite amplio permite enviar archivos en Base64.
- `express.Router()` separa las rutas en `routes/public.js` y `routes/private.js`.
- `app.use(...)` monta los middleware en orden estricto: rutas públicas → `autenticarJWT` → rutas privadas.
- Un middleware final responde `404` con `{ success: false, error: 'Ruta no encontrada' }`.
- `app.listen(PORT, '0.0.0.0', ...)` arranca el servidor y `module.exports = app` lo expone.

**Funcionalidad que aporta**

Express es el **esqueleto HTTP** de la API: define las rutas REST, ejecuta la cadena de middleware, interpreta los cuerpos JSON, responde con JSON, maneja el preflight CORS, confía en el proxy de producción y controla el ciclo de vida del servidor. Gracias a los routers, las 51 rutas quedaron organizadas por dominio sin cambiar su orden ni sus middleware.

### JWT

**Cómo se usó**

- `jsonwebtoken` firma el token en `controllers/auth.js` durante el login:

  ```js
  jwt.sign(
    { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: '8h' }
  )
  ```

- El secreto se toma de `JWT_SECRET` en `config/environment.js`.
- El frontend guarda el token y `api.js` envía `Authorization: Bearer <token>` en cada petición privada.
- `middlewares/auth.js` lee ese header, ejecuta `jwt.verify(token, JWT_SECRET, ...)` y, si es válido, coloca el payload en `req.usuario` antes de llamar a `next()`.
- Si no hay token responde `401`; si está malformado o expirado responde `403`.
- Los controladores usan `req.usuario.id` para saber quién hace la petición.

**Funcionalidad que aporta**

JWT permite **mantener la sesión sin guardar estado en el servidor**. El token identifica al usuario, incluye su rol y expira a las 8 horas. De esta forma las rutas privadas quedan protegidas, el frontend puede restaurar la sesión después de recargar la página y un `401` permite limpiar la sesión y redirigir al login.

### CORS

**Cómo se usó**

En `backend/server.js` se define `corsOptions`:

- **Orígenes permitidos**: `https://ocid-nine.vercel.app`, `https://ocid.onrender.com` y `localhost`/`127.0.0.1` con cualquier puerto.
- **Métodos**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` y `OPTIONS`.
- **Headers permitidos**: `Content-Type` y `Authorization`.
- **`credentials: true`**.
- Se aplica tanto a `app.options('*', cors(corsOptions))` como a `app.use(cors(corsOptions))`.

**Funcionalidad que aporta**

CORS autoriza que el **frontend desplegado en Vercel** (y el entorno local) pueda consumir la **API desplegada en Render**, que están en dominios distintos. Sin esta configuración, el navegador bloquearía las peticiones `fetch` por política de mismo origen. El manejo explícito de `OPTIONS` responde las peticiones de preflight que el navegador envía antes de los `PUT`, `PATCH`, `DELETE` o peticiones con header `Authorization`.

### Resumen de dependencias clave

| Tecnología | Función principal en OCID |
|---|---|
| `express` | Enrutamiento REST, middleware, parseo JSON, 404 y arranque del servidor. |
| `jsonwebtoken` | Firma y verificación del token de sesión de 8 horas. |
| `cors` | Permite que el frontend en otro dominio consuma la API. |
| `express-rate-limit` | Limita accesos y creación/uniones de departamentos. |
| `bcrypt` | Hashea y compara contraseñas. |
| `pg` | Pool de PostgreSQL y consultas parametrizadas. |

---

## 3. Backend: qué hace cada archivo

### Bootstrap y configuración

| Archivo | Función |
|---|---|
| `backend/server.js` | Punto de entrada. Configura CORS, `trust proxy`, `express.json`, monta rutas públicas, aplica `autenticarJWT`, monta rutas privadas, define el 404 y arranca el servidor. |
| `backend/config/environment.js` | Expone `PORT` y `JWT_SECRET` desde variables de entorno. |
| `backend/config/database.js` | Crea el `Pool` de PostgreSQL y la función `consultar(texto, valores)` con SQL parametrizado. |

### Middleware

| Archivo | Función |
|---|---|
| `backend/middlewares/auth.js` | Verifica el JWT (`autenticarJWT`) y define los limitadores `authLimiter`, `departmentCreationLimiter` y `departmentJoinLimiter`. |

### Modelos

| Archivo | Función |
|---|---|
| `backend/models/utils.js` | Normalización y reglas reutilizables: roles, banderas, nombres de departamento, colores, códigos, fechas y destinos de tareas. |
| `backend/models/access.js` | Consultas de contexto y permisos: perfil del usuario, papelera, departamento y jefatura. |

### Rutas

| Archivo | Función |
|---|---|
| `backend/routes/public.js` | 4 rutas públicas: `/health`, `/db-test`, `/login`, `/registro`. |
| `backend/routes/private.js` | 47 rutas privadas de perfil, usuarios, departamentos, anuncios, archivos, tareas, resúmenes y notificaciones. |

### Controladores

| Archivo | Función |
|---|---|
| `controllers/system.js` | Health check y prueba de conexión a la BD. |
| `controllers/auth.js` | Login y registro: valida credenciales, hashea contraseñas y emite JWT. |
| `controllers/identidad.js` | Perfil, listado de usuarios/docentes, cambio de rol, estado, contraseña, salida de departamento y borrado. |
| `controllers/departamentos.js` | Crear, unirse, listar, editar y eliminar departamentos; roles personalizados y transferencia de jefatura. |
| `controllers/anuncios.js` | Alta, edición, borrado, papelera, restauración y borrado permanente de anuncios. |
| `controllers/archivos.js` | Alta, consulta, edición, borrado, papelera y restauración de archivos. |
| `controllers/tareas.js` | Creación y ciclo de vida de tareas, incluyendo fecha límite, papelera y borrado permanente. |
| `controllers/notificaciones.js` | Listado, marcar leído, borrar y registrar elementos vistos. |
| `controllers/summary.js` | Estadísticas generales y conteo por departamento. |

---

## 4. Frontend: qué hace cada archivo

### Vistas

| Archivo | Función |
|---|---|
| `frontend/index.html` | Portada pública. Carga el controlador de sesión inicial, el guard de rutas, los modelos y el controlador `index.js`. |
| `frontend/html/login.html` | Inicio de sesión. Comparte diseño y comportamiento con registro. |
| `frontend/html/registro.html` | Creación de cuenta. |
| `frontend/html/inicio.html` | Panel principal del usuario. |
| `frontend/html/bienvenida.html` | Pantalla de bienvenida. |
| `frontend/html/calendario.html` | Vista de calendario. |
| `frontend/html/docentes.html` | Listado de docentes con filtros y paginación. |
| `frontend/html/base.html` | Base visual compartida de departamentos. |
| `frontend/html/crear-departamento.html` | Creación de departamentos. |
| `frontend/html/mi-departamento.html` | Administración del departamento propio. |
| `frontend/html/anuncios.html` | Muro de anuncios. |
| `frontend/html/archivos.html` | Gestión de archivos. |
| `frontend/html/tareas.html` | Listado de tareas con paginación `< 1 >`. |
| `frontend/html/notificaciones.html` | Centro de notificaciones. |
| `frontend/html/papelera.html` | Elementos eliminados. |
| `frontend/html/mi-perfil.html` | Edición del perfil. |

### CSS

| Archivo | Función |
|---|---|
| `css/base.css` | Estilos compartidos y sistema visual base. |
| `css/navigation.css` | Barra superior, menú lateral y menú móvil. |
| `css/login.css` / `css/registro.css` | Paridad visual de autenticación. |
| `css/index.css` | Portada. |
| `css/inicio.css`, `css/bienvenida.css`, `css/calendario.css` | Panel y páginas informativas. |
| `css/docentes.css`, `css/crear-departamento.css`, `css/mi-departamento.css` | Departamentos y docentes. |
| `css/anuncios.css`, `css/archivos.css`, `css/tareas.css`, `css/papelera.css` | Contenido y papelera. |
| `css/notificaciones.css`, `css/perfil.css` | Notificaciones y perfil. |

### Modelos frontend

| Archivo | Función |
|---|---|
| `js/models/session.js` | Lee/guarda token y usuario en `localStorage`, calcula etiquetas de rol, sincroniza el perfil y limpia la sesión. |
| `js/models/api.js` | Define `API_BASE`, `apiFetch` y `apiPublico`; añade el header `Authorization` y traduce errores HTTP. |
| `js/models/ui.js` | Toasts, modal de confirmación, menú móvil, campana, contador de notificaciones y navegación compartida. |

### Controladores frontend

| Archivo | Función |
|---|---|
| `js/controllers/cover-session.js` | Si ya hay sesión válida en la portada, redirige a `inicio.html`. |
| `js/controllers/route-guard.js` | Verifica la sesión antes de permitir una página privada. |
| `js/controllers/index.js` | Comportamiento de la portada. |
| `js/controllers/login.js`, `registro.js` | Envían credenciales y guardan la sesión. |
| `js/controllers/inicio.js`, `bienvenida.js`, `calendario.js` | Panel principal, bienvenida y calendario. |
| `js/controllers/docentes.js` | Filtros, tabla y paginación de docentes. |
| `js/controllers/tareas.js` | Alta, edición, borrado, papelera y paginación de tareas. |
| `js/controllers/anuncios.js`, `archivos.js`, `papelera.js` | Gestión de contenido y restauración. |
| `js/controllers/mi-departamento.js`, `crear-departamento.js` | Creación y administración de departamentos. |
| `js/controllers/notificaciones.js` | Campana, lista y acciones de notificaciones. |
| `js/controllers/perfil.js` | Edición del perfil y contraseña. |

Los 20 métodos de `window.OCID` siguen disponibles para todos los controladores, además de `window.mostrarMensaje`.

---

## 5. Verificación y estado final

- **51/51 rutas** conservadas con el mismo orden y middleware.
- **80 etiquetas `<script>`** resueltas, 0 archivos faltantes.
- **0 referencias** a los nombres antiguos de infraestructura.
- `node --check`: **37 archivos JS, 0 fallos**.
- Sin errores de consola en navegador en las pruebas de sesión, API, toast, menú y paginación.
- `git diff --check` limpio.
- **Sin commit**: todos los cambios quedaron sin preparar.

> Nota: `README.md` todavía describe el estado original y menciona el antiguo `frontend/js/ocid-core.js`. No se modificó porque es documentación histórica del proyecto.
