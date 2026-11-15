# OCID — Plataforma de Organización y Comunicación Interna Departamental

Sistema web full-stack diseñado para centralizar y agilizar la gestión administrativa, la comunicación interna y la asignación de tareas entre docentes y jefes de departamento en el entorno institucional.

---

## Características Principales

* **Control de Acceso Basado en Roles (RBAC):** Gestión diferenciada para perfiles de **Docente** y **Jefe de Departamento**, controlando privilegios de creación, edición y administración.
* **Autenticación y Seguridad:**
  * Cifrado de contraseñas mediante **bcrypt** (`saltRounds = 10`).
  * Manejo de sesiones con **JSON Web Tokens (JWT)** con expiración configurada.
  * Protección de cabeceras HTTP con **Helmet** y políticas estrictas de **CORS**.
  * Prevención de ataques de fuerza bruta y denegación de servicio mediante **Express Rate Limit** (limitador global y limitador estricto en endpoints de autenticación).
* **Tablero de Anuncios y Notificaciones:** Publicación de avisos categorizados por prioridad y departamento con generación automática de notificaciones internas en tiempo real para los usuarios.
* **Gestión de Tareas y Cronogramas:** Creación, asignación, seguimiento de estados (`Pendiente`, etc.) y control de horarios por departamento.
* **Repositorio de Archivos:** Carga, consulta y administración de documentos compartidos vinculados a departamentos y autores.
* **Administración de Departamentos:** Gestión completa de áreas académicas/administrativas con búsqueda insensible a mayúsculas por código único y asignación de jefaturas.

---

## Arquitectura y Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) — Desplegado en **Vercel** |
| **Backend** | Node.js, Express.js — Desplegado en **Render** |
| **Base de Datos** | PostgreSQL alojado en **Neon** (`pg` / `Pool`) |
| **Seguridad** | `bcrypt`, `jsonwebtoken`, `helmet`, `express-rate-limit`, `cors`, `dotenv` |

---

## Estructura de Endpoints de la API

### Sistema y Salud
* `GET /health` — Verifica el estado activo del servidor API.
* `GET /db-test` — Comprueba la conectividad con la base de datos PostgreSQL.

### Autenticación y Usuarios
* `POST /login` — Autentica credenciales con `bcrypt` y retorna el token JWT junto con los datos del usuario.
* `POST /registro` — Registra un nuevo usuario encriptando su contraseña y vinculándolo a un departamento.
* `GET /login` / `GET /docentes` — Obtiene el listado general de usuarios y sus departamentos asignados.
* `PUT /usuarios/:id` — Actualiza perfil, rol y departamento del usuario.
* `PATCH /usuarios/:id/password` — Actualiza la contraseña verificando previamente la clave actual.
* `DELETE /login/:id` — Elimina un usuario y sus notificaciones asociadas mediante una transacción SQL.

### Departamentos, Anuncios, Tareas y Archivos
* `GET / POST / PUT / DELETE /departamentos` — CRUD completo de departamentos y consulta por código (`GET /departamentos/codigo/:codigo`).
* `GET / POST / PUT /anuncios` — Gestión de avisos institucionales con disparo transaccional de notificaciones.
* `GET / POST / PUT / DELETE /tareas` — Administración de actividades y asignaciones departamentales.
* `GET / POST / DELETE /archivos` — Gestión de metadatos y almacenamiento de archivos compartidos.
* `GET /notificaciones` — Consulta de alertas por `usuario_id`.

---

## Instalación y Configuración Local

### 1. Clonar el repositorio
```bash
git clone [https://github.com/draftzzz/ocid.git](https://github.com/draftzzz/ocid.git)
cd ocid