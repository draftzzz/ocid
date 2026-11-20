# OCID — Organización y Comunicación Interna para Docentes

OCID es una aplicación web para concentrar herramientas de coordinación académica: anuncios, archivos, tareas, calendario, departamentos, docentes, notificaciones y perfil. Está organizada como una interfaz web estática y una API REST que consulta una base de datos PostgreSQL.

Este documento sirve como guía para presentar el proyecto: explica cómo se divide, cómo fluye la información y cuáles son las responsabilidades de sus funciones principales.

## 1. ¿Cómo está organizado?

```text
ocid/
├── frontend/
│   ├── index.html             # Portada pública
│   ├── css/                   # Hojas de estilo por pantalla o módulo
│   ├── html/                  # Pantallas de la aplicación
│   └── js/                    # Lógica del navegador e integración con la API
├── backend/
│   ├── server.js              # Servidor Express, seguridad y rutas REST
│   ├── package.json           # Dependencias y comando de inicio
│   └── package-lock.json      # Versiones resueltas de dependencias
├── EXPOSICION_MVC.md          # Exposición general y mapa de archivos MVC
├── GUIA_JS.js                 # Guía ejecutable de funciones y conceptos de JS
└── README.md
```

## 2. Tecnologías y arquitectura

| Parte | Tecnologías | Responsabilidad |
|---|---|---|
| Interfaz | HTML, CSS y JavaScript | Presenta las pantallas, valida interacciones sencillas y muestra los datos recibidos. |
| API | Node.js y Express | Recibe las peticiones del navegador, verifica sesiones y ejecuta operaciones de datos. |
| Persistencia | PostgreSQL, mediante `pg` y `Pool` | Guarda usuarios, departamentos, anuncios, archivos, tareas y notificaciones. |
| Seguridad y acceso | `bcrypt`, `jsonwebtoken`, `cors`, `express-rate-limit` | Hashea contraseñas, valida JWT, controla orígenes y limita operaciones seleccionadas. |

El frontend envía peticiones HTTP con `fetch`. El backend procesa la ruta, consulta PostgreSQL con consultas parametrizadas y devuelve respuestas JSON. La URL de API que usan los scripts del frontend está configurada como `https://ocid.onrender.com`.

## 3. Recorrido de una sesión

1. **Entrada:** se abre la portada pública o una pantalla de la carpeta `frontend/html/`.
2. **Autenticación:** el formulario envía correo y contraseña a `POST /login`. El backend busca al usuario, compara la contraseña con `bcrypt` y, si coincide, firma un JWT.
3. **Sesión en el navegador:** el frontend guarda los datos del usuario con `OCID.guardarSesion`. Las llamadas protegidas agregan el token como `Authorization: Bearer ...`.
4. **Operaciones:** los módulos consultan la API para listar, crear, editar o eliminar datos y actualizan la interfaz.
5. **Cierre o expiración:** se limpia la sesión local y se vuelve a la pantalla de acceso cuando corresponde.

El servidor recibe el JWT en el encabezado `Authorization: Bearer ...`; no lee ni establece cookies de sesión. El frontend conserva el token en `localStorage`, por lo que queda accesible desde JavaScript del navegador.

## 4. Pantallas del frontend

Los documentos HTML componen las vistas; cada uno enlaza su hoja CSS y su script JavaScript. En general, los nombres de los archivos indican qué módulo controlan.

| Pantalla | Propósito |
|---|---|
| `frontend/index.html` | Portada pública, explicación del sistema, módulos y roles. |
| `frontend/html/login.html` y `registro.html` | Acceso y registro de usuarios. |
| `frontend/html/inicio.html` | Tablero principal con resumen y accesos a módulos. |
| `frontend/html/anuncios.html` | Consulta, publicación, edición y eliminación lógica de anuncios. |
| `frontend/html/archivos.html` | Consulta, descarga y administración de archivos compartidos. |
| `frontend/html/tareas.html` | Consulta, asignación, edición y seguimiento de tareas. |
| `frontend/html/calendario.html` | Vista de calendario y tareas asociadas a fechas. |
| `frontend/html/mi-departamento.html` | Información y miembros del departamento. |
| `frontend/html/docentes.html` | Listado, búsqueda, registro y administración de docentes. |
| `frontend/html/notificaciones.html` | Lista y resumen de notificaciones. |
| `frontend/html/papelera.html` | Restauración o eliminación definitiva de anuncios y archivos. |
| `frontend/html/mi-perfil.html` | Datos y preferencias del usuario. |
| `frontend/html/bienvenida.html` y `crear-departamento.html` | Flujo de bienvenida y formulario de creación de departamento. |
| `frontend/html/base.html` | Otra plantilla de pantalla de la aplicación. |
| `frontend/html/test/test2.html` | Pantalla de prueba/prototipo; no es una suite automatizada de pruebas. |

### Estilos

`frontend/css/` contiene estilos separados por vista para que cada módulo mantenga su presentación:

- `base.css`: estilos compartidos.
- `index.css` y `bienvenida.css`: portada y bienvenida.
- `login.css` y `registro.css`: formularios de acceso y alta.
- `inicio.css`, `anuncios.css`, `archivos.css`, `tareas.css` y `calendario.css`: tablero y módulos principales.
- `docentes.css`, `mi-departamento.css`, `crear-departamento.css`, `notificaciones.css` y `mi-perfil.css`: administración y cuenta.

Las hojas de estilo controlan distribución, colores, componentes y adaptación a pantallas pequeñas. La portada, por ejemplo, reorganiza sus rejillas y botones mediante una regla `@media` para móvil.

## 5. Desarrollo del frontend: cómo se construyó la lógica

Los archivos JavaScript conectan los controles de cada HTML con la API. El patrón general es:

1. **Seleccionar controles del DOM:** se localizan formularios, botones, campos, tablas, menús y contenedores mediante `getElementById` o `querySelector`.
2. **Esperar a que la página esté lista:** la mayoría de los scripts instala sus eventos en `DOMContentLoaded`; algunos usan una función de inicio que también funciona si el documento ya terminó de cargar.
3. **Leer estado local:** los módulos consultan `localStorage` para recuperar `usuario_ocid` y determinar qué nombre, rol o autor mostrar.
4. **Solicitar datos:** las funciones `async` usan `fetch` y `await`. Cuando hay varias colecciones independientes, ciertos módulos usan `Promise.all` para pedirlas en paralelo.
5. **Convertir y presentar:** las respuestas se normalizan a arreglos, se filtran y se convierten en nodos o filas. Se muestran mensajes de carga, estados vacíos y errores.
6. **Guardar cambios:** los formularios hacen una petición `POST`, `PUT`, `PATCH` o `DELETE`; ante una respuesta exitosa, cierran el modal, limpian el formulario y vuelven a cargar o renderizar los datos.

El proyecto no usa un framework de componentes. La estructura de las pantallas se escribe en HTML; JavaScript agrega comportamiento a los elementos existentes y crea contenido dinámico con el DOM. Algunos módulos usan `textContent` o funciones `escaparHTML` antes de presentar valores de usuario. Otros construyen plantillas con `innerHTML`, por lo que su contenido debe revisarse con cuidado al modificar esas secciones.

### 5.1 Funciones compartidas: `frontend/js/ocid-core.js`

El archivo se implementó como una función autoejecutable (`IIFE`) en modo estricto. Así mantiene sus variables internas en un ámbito propio y publica una sola interfaz compartida: `window.OCID`.

- `crearElemento(tag, opciones)`: crea un elemento DOM y permite fijar clase, id, texto, atributos y algunos manejadores de eventos. Se usa para construir avisos y controles sin repetir la misma secuencia de creación.
- `escaparHTML(texto)`: coloca el texto en un nodo y devuelve su representación escapada. Sirve para evitar que texto recibido se interprete como marcado HTML cuando se inserta en una plantilla.
- `obtenerUsuarioSesion()`: lee y parsea `usuario_ocid`; si los datos no son JSON válido, los borra y devuelve `null`.
- `obtenerToken()`: busca el JWT dentro del usuario o en la clave local `token`.
- `guardarSesion(usuario)`: guarda el usuario serializado y, si viene incluido, conserva también el token.
- `limpiarSesion()`: elimina varias claves de token y los datos de `sessionStorage`.
- `apiFetch(path, opciones)`: prepara `Content-Type`, agrega `Authorization: Bearer ...`, interpreta respuesta JSON o texto y convierte respuestas HTTP fallidas en errores. Ante `401` o `403`, limpia la sesión y dirige al acceso.
- `apiPublico(path, opciones)`: realiza el mismo trabajo de petición y lectura de respuesta sin adjuntar autenticación, para endpoints públicos como `/login` y `/registro`.
- `mostrarToast(texto, esError, duracion)`: crea el contenedor si hace falta, agrega un aviso visual y lo retira después de un temporizador.
- `configurarCierreSesion()`: conecta los botones de salir para limpiar la sesión y volver a `login.html`.
- `actualizarCabeceraUsuario()`: coloca nombre, rol e iniciales en los elementos de cabecera encontrados.
- `configurarMenuMovil()`: crea el botón hamburguesa y el fondo de cierre cuando no existen; abre o cierra la navegación con el botón, el fondo, un enlace o la tecla Escape.
- `actualizarContadorNotificaciones()`: consulta las notificaciones del usuario y actualiza las insignias no leídas.

**Detalle de integración:** aunque el comentario del archivo lo describe como módulo para todas las páginas, en el HTML actual se ve cargado explícitamente junto con `login.js`. Varios otros módulos repiten helpers de sesión, menú o notificaciones en vez de llamar a `OCID`.

### 5.2 Portada y acceso

#### `frontend/js/index.js`

Se encapsuló en una `IIFE` para mantener privadas las funciones de la portada.

- `desplazarASeccion(identificadorSeccion)` busca una sección por `id` y usa `scrollIntoView` con desplazamiento suave.
- `redirigirInicioSesion()` lleva a `login.html`.
- `inicializarIndexPublico()` lee `usuario_ocid`, conecta los botones de acceso y exploración y cambia el texto y la acción del botón si detecta un usuario con `id`.
- Cuando hay sesión, el botón de portada se convierte en acceso al panel `inicio.html`; si no, abre el login.
- La inicialización se ejecuta en `DOMContentLoaded` o inmediatamente si el documento ya estaba cargado. Al final se vuelven a dibujar los iconos Lucide cuando esa biblioteca está disponible.

#### `frontend/js/login.js`

El script espera `DOMContentLoaded`, crea un helper `$` para buscar elementos por id y conecta dos comportamientos:

1. El botón de contraseña alterna el `type` del campo entre `password` y `text`.
2. El `submit` del formulario se cancela para evitar recargar la página. Se oculta el aviso anterior y se desactiva el botón mientras se procesa la operación.
3. Se llama a `window.OCID.apiPublico('/login', ...)` con correo normalizado mediante `trim()` y contraseña.
4. Si la respuesta indica éxito y contiene al usuario, se guarda la sesión y se navega a `inicio.html`; en caso de error, se muestra un mensaje en la misma página.
5. `finally` vuelve a habilitar el botón tanto si la petición funcionó como si falló.

#### `frontend/js/registro.js`

El patrón de formulario es similar al de acceso. `DOMContentLoaded` conecta el botón para revelar la contraseña y el evento `submit` del registro. Se envían nombre, correo y contraseña como JSON a `OCID.apiPublico('/registro', ...)`. Si el backend confirma el alta, el navegador va al login; si no, el error queda en la caja de estado. El botón de registro se desactiva durante la petición y se reactiva en `finally`.

**Dependencia importante:** `registro.js` usa `window.OCID`, pero `registro.html` actualmente carga solamente `registro.js`. Para ejecutar ese flujo, el HTML también debe cargar `ocid-core.js` antes del script de registro.

### 5.3 Bienvenida y departamentos

#### `frontend/js/bienvenida.js`

Primero lee `usuario_ocid`; sin un objeto que contenga `id`, redirige a `login.html`. Con sesión, actualiza el nombre y crea iniciales para el avatar. `alternarMenu()` cambia la clase CSS del menú móvil. Los eventos del modal abren y cierran la ventana de unirse a un departamento; un clic en el fondo también la cierra. Al enviar el código, el script hace `POST /departamentos/unirse`, guarda el usuario devuelto y navega al inicio. El cierre de sesión elimina el usuario local.

#### `frontend/js/crear-departamento.js`

También valida la sesión local y presenta el nombre e iniciales del usuario. `alternarMenu()` abre/cierra el menú lateral. Al enviar `form_crear_departamento`, toma el nombre y la descripción, los limpia con `trim()` y envía `POST /departamentos` con `jefe_id`. Si el backend responde con el departamento creado, actualiza el objeto de usuario local con `departamento_id` y el rol “Jefe de Departamento”, guarda el objeto y redirige al panel. Los errores se presentan con `alert()`.

### 5.4 Tablero

#### `frontend/js/inicio.js`

Este script reúne el resumen de la pantalla principal. Declara listas en memoria para anuncios, usuarios y departamentos y define utilidades propias:

- `obtenerToken()` lee el token guardado dentro de `usuario_ocid`.
- `fetchConAuth(url, opciones)` copia los encabezados de la petición y agrega Bearer si encuentra token.
- `leerRespuesta(respuesta)` entiende JSON y texto, y lanza un error para estados HTTP fallidos.
- `obtenerLista(datos)` acepta respuestas como arreglo o como propiedades `data`, `usuarios` o `departamentos`.
- `escaparHTML()` y `mostrarMensaje()` preparan texto y avisos para la interfaz.
- `inicializarSesion()` pinta el saludo, el nombre y el rol; `cerrarSesion()` elimina la sesión local.
- `normalizarPrioridad()` agrupa diferentes valores de prioridad en las categorías que entiende la vista.
- `cargarAnuncios()` obtiene anuncios, transforma sus campos al formato de las tarjetas y llama a `renderizarAnunciosUI()`.
- `renderizarAnunciosUI()` muestra hasta cinco avisos, sus metadatos y botones. `mostrarDetalleAnuncio()` presenta el detalle seleccionado.
- `publicarAnuncio()` valida campos y departamento, envía `POST /anuncios` y recarga la lista si el servidor confirma la operación.
- `eliminarAnuncio()` pide confirmación, envía `DELETE` y actualiza la lista.
- `cargarUsuarios()` y `cargarDepartamentos()` llenan indicadores y el selector del formulario.
- `cargarEventosProximos()` trata de obtener eventos y actualiza la tarjeta del plantel; `filtrarAnunciosEnTiempoReal()` filtra la lista local conforme se escribe.
- `ejecutarAutenticacion()` implementa un acceso alternativo en modal. `abrirModalCrearAnuncio()`, `abrirModalLogin()` y `cerrarModal()` controlan ventanas de la pantalla.

Al cargar el documento se inicializa el usuario y se disparan varias cargas. También se genera el menú móvil si la plantilla no trae el botón. El botón para subir archivos en este tablero muestra un mensaje indicando que esa acción todavía no está conectada; el módulo de archivos separado sí contiene su propio formulario.

### 5.5 Anuncios

#### `frontend/js/anuncios.js`

Es uno de los módulos que aprovecha el helper compartido. Al iniciar, usa `OCID` para configurar el cierre de sesión, la cabecera, el menú móvil y el contador de notificaciones.

- `cargar_anuncios_desde_servidor()` obtiene anuncios y departamentos en paralelo con `OCID.apiFetch`. Normaliza prioridad, nombre de departamento, autor y fecha; llena el selector de departamento y después llama al render.
- `renderizar_interfaz()` aplica búsqueda por título y filtros por departamento y prioridad. Crea cada tarjeta y sus botones con elementos DOM; comprueba en la interfaz si el usuario actual coincide con `autor_id` antes de habilitar sus acciones.
- `toggleMenuOpciones()` abre el menú de una tarjeta y cierra los demás.
- `prepararEdicionAnuncio()` valida la autoría en el navegador, copia los datos al formulario y abre el modal.
- El `submit` del formulario arma un objeto con título, prioridad, departamento, contenido y autor; usa `POST /anuncios` para crear o `PUT /anuncios/:id` para editar. Al terminar, cierra y limpia el modal, muestra un toast y vuelve a cargar.
- `eliminarAnuncio()` confirma la acción, llama a `DELETE /anuncios/:id` con `apiFetch` y recarga.
- `actualizar_panel_lateral()` calcula cantidades por algunos nombres de departamento y presenta los tres anuncios más recientes que tenga en memoria.
- Los filtros y botones del modal se conectan directamente a eventos del DOM.

La comprobación de autor en JavaScript mejora la experiencia visual, pero no reemplaza permisos verificados en el servidor.

### 5.6 Archivos

#### `frontend/js/archivos.js`

El módulo define su URL de API, referencias al modal, al selector de archivos y una lista `archivosCargados`.

- `iniciarInterfaz()` muestra identidad del usuario, intenta actualizar insignias de notificaciones y configura el menú móvil. También conecta el cierre de sesión.
- `sesionArchivos()` obtiene el usuario desde `localStorage`.
- `mostrarToastArchivos()` construye avisos flotantes para éxitos, errores y advertencias.
- `respuestaArchivos(ruta, opciones)` ejecuta `fetch` y espera JSON. Actualmente reemplaza varios detalles de error por el mensaje genérico “No se pudo cargar”.
- `formatearTamano(bytes)` convierte bytes a KB o MB.
- `cargarArchivos()` solicita los archivos y departamentos; completa los filtros y el selector destino, y llama a `dibujarArchivos()`.
- `dibujarArchivos()` filtra por departamento, extensión y nombre, y construye filas para la tabla con nombre, tamaño, autor, departamento, fecha y acciones.
- `descargarArchivo(id)` solicita el registro, toma `archivo.ruta` como Data URL base64, decodifica los bytes con `atob`, crea un `Blob` y provoca la descarga del navegador.
- `eliminarArchivo(id, autorId)` compara el autor con el usuario local, pide confirmación, solicita el borrado y recarga la tabla.
- Los eventos de `DOMContentLoaded` controlan el modal, la zona de selección, los filtros y el envío.
- Para subir, se limita el archivo a 10 MB, `FileReader.readAsDataURL()` lo convierte a Data URL y se envían nombre, contenido, tipo, tamaño, autor y departamento a `POST /archivos`.

La descarga depende de una ruta `GET /archivos/:id`, que el backend actual no declara; por eso la función del navegador y la API todavía no están alineadas en esa operación.

### 5.7 Tareas y calendario

#### `frontend/js/tareas.js`

Este script es el más extenso de los módulos. Se encapsula en una `IIFE` y guarda en memoria tareas, departamentos, usuarios, página actual, tarea en edición y conjuntos `Set` para departamentos/personas seleccionados.

- `iniciarInterfaz()` dibuja usuario y avatar, actualiza insignias, conecta menú móvil y salida.
- `obtenerFechaActualISO()` genera la fecha local como `AAAA-MM-DD`; `formatearFecha()` adapta fechas para la tabla.
- `escaparHTML()` y `mostrarToastTareas()` se ocupan de texto y notificaciones temporales.
- `cargarCatalogosServidor()` pide departamentos, docentes (con fallback a usuarios) y tareas. Después llena filtros, listas del modal y tabla.
- `poblarFiltrosYModalDepartamentos()`, `renderizarListaDepartamentosModal()` y `renderizarListaPersonasModal()` construyen opciones dinámicas y conservan selecciones mientras se busca.
- El checkbox de departamento general limpia selecciones individuales y permite asignar una tarea a un alcance más amplio.
- `abrir_modal()`, `cerrar_modal()` y `cerrarModalDetalle()` manejan formularios y vista de detalle; al cerrar se reinician campos, búsquedas, conjuntos y estado de edición.
- `cambiarAlcanceTareas()` alterna las vistas “todas”, “mías” y “departamento”.
- `obtenerTareasFiltradas()` combina alcance, texto, departamento y estado.
- `renderizarPaginacion()` crea botones y limita la navegación a tres elementos por página.
- `renderizarTabla()` arma filas, insignias de estado y menús. Si la descripción es larga, agrega un botón para verla completa.
- `prepararEdicionTarea()` llena el modal con la tarea seleccionada y comprueba en el navegador si el usuario es su autor.
- `cambiarEstadoTareaDirecto()`, `eliminarTareaDirecto()` y sus variantes de acciones envían `PUT` o `DELETE` a `/tareas/:id`; al terminar actualizan el estado local o vuelven a renderizar.
- El envío del formulario valida título, fecha y asignaciones; arma el objeto con descripción, destinatarios, departamentos, estado y autor; usa `POST /tareas` o `PUT /tareas/:id` según sea creación o edición.
- Los eventos de búsqueda, filtros, modal y pestañas se conectan al final del proceso de inicialización.

La autorización de edición/eliminación se representa también en la interfaz mediante el autor. Como el cliente puede modificarse, la autorización definitiva debe comprobarse en el backend.

#### `frontend/js/calendario.js`

El calendario usa la tabla de tareas, no un recurso separado de eventos. Mantiene una lista de tareas, fecha seleccionada, vista (`mes`, `semana` o `dia`) e id que se está editando.

- `iniciarInterfaz()` configura nombre/avatar, badge de notificaciones y menú móvil.
- `fechaClave()` convierte un `Date` a `AAAA-MM-DD` para comparar fechas sin depender del formato visual.
- `cargarTareasDesdeDB()` obtiene `/tareas`, actualiza la lista y llama a `dibujarTodo()`.
- `actualizarBadgesNavMes()` detecta si existen tareas anteriores o posteriores al periodo visible.
- `dibujarGrilla()` construye las celdas según vista mensual, semanal o diaria; marca fechas fuera del mes y muestra las tareas en el día correspondiente.
- `dibujarListaEventos()` ordena por fecha y genera la lista con horario, departamento, creador y menú de acciones.
- `prepararEdicionTarea()` y `eliminarTareaBD()` revisan la autoría local antes de editar o eliminar.
- `guardarTareaBD()` valida título/fecha y hace `POST /tareas` o `PUT /tareas/:id`; al confirmar, cierra el modal y vuelve a cargar.
- Los botones de navegación cambian el periodo y redibujan la grilla.

### 5.8 Docentes y departamento

#### `frontend/js/docentes.js`

El listado de administración se construye dinámicamente:

- `iniciarInterfaz()` muestra los datos de sesión, actualiza notificaciones, configura el menú móvil y el enlace de salida.
- `cargarDepartamentosDocentes()` obtiene departamentos, prepara el filtro y el selector del modal y luego carga el listado.
- `cargarDocentes()` obtiene el arreglo de usuarios y delega cada fila a `agregarFilaDocente()`.
- `obtenerRolAutomatico()` interpreta `es_jefe` o `rol` para elegir la etiqueta del selector.
- `agregarFilaDocente(docente)` compone una fila con avatar, correo, selectores editables de departamento y rol, y botón de eliminación. Los cambios envían `PUT /usuarios/:id`.
- `procesarRegistroDocente()` recoge formulario, departamento y rol y envía `POST /registro`.
- `eliminarDocente()` impide en la interfaz borrar la propia cuenta, pide confirmación y solicita el borrado.
- `filtrarTablaDocentes()` compara texto, departamento y estado con atributos `data-*` de cada fila.
- `renderizarPaginacionDocentes()` crea controles para recorrer los resultados filtrados.
- `abrirModalDocente()`, `cerrarModalDocente()` y `mostrarAvisoDocentes()` controlan formulario y notificaciones.

#### `frontend/js/mi-departamento.js`

El script está encapsulado en una IIFE y mantiene en memoria el departamento seleccionado, sus integrantes y los roles. Al iniciar, actualiza la cabecera y conecta el cierre de sesión; luego consulta departamentos, usuarios, archivos y tareas en paralelo mediante `Promise.all` y `OCID.apiFetch`. Selecciona el departamento asociado al usuario (o aquel donde figura como jefe) y consulta sus roles.

La vista calcula el total de docentes, archivos y tareas relacionadas con ese departamento. La búsqueda filtra integrantes en el navegador, sin volver a solicitar los datos. Las tablas, etiquetas de rol y estados se construyen con nodos del DOM y `textContent`.

El acceso a los controles se muestra según el rol y la jefatura del usuario. La interfaz permite editar los datos del departamento, crear y eliminar roles, cambiar el rol o estado de integrantes, transferir la jefatura y solicitar la baja lógica del departamento. Estas operaciones usan `OCID.apiFetch` y las rutas de la API descritas abajo. Los formularios de confirmación requieren frases específicas para la transferencia y la baja. Los diálogos se cierran con sus botones, al pulsar Escape o al hacer clic en el fondo cuando corresponde.

El contacto con la jefatura valida correo, asunto y mensaje, y prepara un enlace `mailto:` para abrir el cliente de correo del usuario; no envía el mensaje desde el backend. Los errores y resultados de las operaciones se muestran con `OCID.mostrarToast`.

##### Cómo se construyó `mi-departamento.html`

La página se compone en tres capas que colaboran mediante identificadores del DOM:

1. **Estructura HTML:** `frontend/html/mi-departamento.html` define el menú lateral, la cabecera, el resumen del departamento, la tarjeta de jefatura, la descripción, la tabla de integrantes, el panel de gestión y los diálogos. Las filas iniciales se dejan vacías para que JavaScript las complete con los datos del servidor.
2. **Presentación CSS:** `frontend/css/mi-departamento.css` da estilo al menú, tarjetas, métricas, tabla, etiquetas, formularios y diálogos. Usa Flexbox y CSS Grid para distribuir los elementos y reglas `@media` para adaptar la cuadrícula, la tabla y los controles a pantallas más estrechas. Cada hoja incluye los estilos de navegación compartidos.
3. **Comportamiento JavaScript:** `frontend/js/mi-departamento.js` espera `DOMContentLoaded`, obtiene los elementos por `id`, conecta eventos y usa `frontend/js/ocid-core.js` para sesión, peticiones autenticadas y mensajes temporales. Las respuestas se transforman en texto, insignias, filas, listas y opciones de formulario.

El recorrido de carga es: validar que haya usuario y token; solicitar los datos necesarios en paralelo; localizar el departamento y sus roles; calcular las métricas; y renderizar el contenido. Si no existe sesión, la pantalla redirige a `login.html`; si una petición falla, muestra un aviso y registra el error en la consola.

Las rutas utilizadas por esta pantalla son `GET /departamentos`, `GET /usuarios`, `GET /archivos`, `GET /tareas` y `GET /departamentos/:id/roles` para cargar información. Para cambios utiliza `PUT /departamentos/:id`, `PATCH /usuarios/:id/estado`, `PATCH /usuarios/:id/rol`, `POST /departamentos/:id/roles`, `DELETE /departamentos/:id/roles/:rolId`, `PATCH /departamentos/:id/transferir-jefatura` y `DELETE /departamentos/:id`. La presencia u ocultación de controles en el navegador organiza la experiencia, pero los permisos efectivos deben ser validados también por el servidor.

### 5.9 Notificaciones, papelera y perfil

#### `frontend/js/notificaciones.js`

El archivo declara `cargarNotificaciones()` para consultar, clasificar y pintar notificaciones. Muestra estado de carga, calcula total/no leídas/anuncios/tareas, formatea fechas y crea botones para marcar como leída o borrar. Antes de contar, filtra la lista para conservar elementos cuya fecha sea posterior a `timestampCargaPagina`.

**Estado de integración:** este archivo no define el URL `API`, `fetchConAuth`, `leerRespuesta`, `timestampCargaPagina`, `escaparHTML`, `mostrarMensaje`, `marcarLeida` ni `borrarNotificacion`, y tampoco llama por sí mismo a `cargarNotificaciones()`. El HTML de notificaciones solo carga este archivo. Por lo tanto, estas dependencias deben proporcionarse para que la pantalla funcione completamente.

#### `frontend/js/papelera.js`

Está encapsulado en una `IIFE`. Mantiene dos arreglos, uno para archivos borrados y otro para anuncios, además de la pestaña activa.

- `obtenerSesion()` y `obtenerToken()` buscan datos de sesión y JWT en claves comunes; el segundo revisa también el objeto de usuario.
- `fetchConAuth()` agrega JSON y el encabezado Bearer.
- `iniciarInterfaz()` actualiza identidad y contador, conecta menú y cierre de sesión, y después carga la pantalla.
- `cargarPapeleraGeneral()` solicita en paralelo `/archivos/papelera` y `/anuncios/papelera`.
- `cambiarSeccionPapelera()` alterna pestañas; `renderizarContenidoActual()` aplica búsqueda y llama al renderizador correspondiente.
- `renderizarTablaArchivos()` y `renderizarTablaAnuncios()` crean columnas, estados vacíos y botones de acción.
- `restaurarArchivo()` / `restaurarAnuncio()` llaman a `PUT .../:id/restaurar`, quitan el registro del arreglo local y redibujan.
- `eliminarDefinitivoArchivo()` / `eliminarDefinitivoAnuncio()` piden confirmación, llaman a `DELETE .../:id/permanente` y actualizan la vista.

#### `frontend/js/perfil.js`

Al cargar el DOM, muestra usuario/rol/avatar, actualiza insignias, crea controles de menú móvil y conecta la salida.

- `obtenerUsuarioSesion()` parsea el usuario guardado.
- `peticionServidor(ruta, opciones)` centraliza el `fetch`, analiza JSON y convierte fallos HTTP/red en errores para los formularios.
- `mostrarAviso(mensaje, esError)` crea un aviso junto a la cabecera y lo oculta mediante un temporizador de siete segundos.
- `cargarDatosPerfil()` inicializa campos de nombre, correo y rol y obtiene departamentos para el selector.
- El evento de `formulario_datos_perfil` compara valores nuevos con los guardados para detectar si no hay cambios. Si hay cambios, envía `PUT /usuarios/:id`, actualiza `localStorage` y la cabecera.
- El evento de `formulario_contrasena` verifica sesión, confirmación y longitud mínima de seis caracteres antes de mandar `PATCH /usuarios/:id/password`.
- Los toggles de sistema, tareas y anuncios se leen y guardan como JSON en `preferencias_ocid` de `localStorage`; no se envían a la API.

### 5.10 Pantalla experimental

#### `frontend/html/test/test2.js`

Es una versión de prueba del tablero, separada del módulo principal. Repite lógica de resumen: helpers `$`, `escaparHTML()`, `leerRespuesta()` y `obtenerLista()`; presenta avisos con `mostrarMensaje()`; carga y renderiza anuncios; normaliza prioridades; actualiza contadores; publica y elimina anuncios; consulta usuarios, departamentos y eventos; y permite una autenticación en modal mediante `ejecutarAutenticacion()`.

La carga de página dispara varias consultas y configura el menú móvil. Esta implementación tiene utilidades similares a `inicio.js`, pero no las importa desde un módulo compartido; conviene tratarla como prototipo y no como la fuente canónica del tablero.

### 5.11 Decisiones de implementación y límites entre scripts

- **Estado en memoria:** anuncios, tareas, archivos y listas de usuarios se guardan en arreglos mientras la página está abierta. Después de crear, editar o borrar, el script normalmente vuelve a consultar o renderizar.
- **Estado persistente del navegador:** `usuario_ocid` guarda la identidad local; `preferencias_ocid` guarda solo preferencias del perfil. La fuente de datos funcional debe ser la API/base de datos, no esos arreglos.
- **Operaciones asíncronas:** `async`/`await` hace que el código espere a la respuesta antes de actualizar la interfaz. `try/catch/finally` se usa para mostrar errores y volver a habilitar botones.
- **Filtros y paginación:** se aplican sobre arreglos ya cargados, por lo que la búsqueda no genera una petición por cada carácter.
- **DOM:** los scripts seleccionan elementos por ids/clases previstos en sus HTML. Cambiar esos identificadores requiere actualizar el JS correspondiente.
- **Autorización:** algunos botones se ocultan o se muestran según el usuario local sea autor. Esa comprobación es solo de interfaz; una autorización real debe estar en el backend.
- **Código compartido incompleto:** `ocid-core.js` contiene utilidades reutilizables, pero varios módulos duplican funciones de sesión, toast, menú y parseo de respuestas.

## 6. Backend y API

El servidor vive en `backend/server.js` y está construido con Express, un framework para Node.js que permite definir rutas HTTP y encadenar middleware. Las rutas de salud y las de acceso/registro son públicas. Después de `app.use(autenticarJWT)`, las demás rutas requieren un token válido.

### Cómo se aplica Express en este proyecto

1. `express()` crea la aplicación HTTP y `app.set('trust proxy', 1)` le indica que está detrás de un proxy.
2. `app.use(cors(...))` configura los orígenes, métodos y encabezados permitidos para que el frontend pueda llamar a la API. `express.json({ limit: '15mb' })` analiza cuerpos JSON.
3. Las funciones middleware se aplican antes o junto a las rutas: los limitadores protegen operaciones seleccionadas y `autenticarJWT` verifica el Bearer token. Esta última se registra después de las rutas públicas para proteger las rutas que vienen a continuación.
4. `app.get`, `app.post`, `app.put`, `app.patch` y `app.delete` conectan cada URL con su función. Las funciones validan los datos, consultan PostgreSQL mediante `Pool` y responden normalmente con JSON y un código HTTP.
5. `app.listen(PORT, ...)` inicia el servidor en el puerto configurado o en el `3000` predeterminado.

### Dependencias del backend

Estas son las dependencias externas que `backend/server.js` importa y utiliza:

| Dependencia | Uso en el proyecto |
|---|---|
| `express` | Crea el servidor, define rutas y ejecuta middleware como `express.json`. |
| `cors` | Configura los dominios, métodos y encabezados permitidos para las peticiones del frontend. |
| `bcrypt` | Crea hashes de contraseñas al registrar o cambiar una clave y compara hashes al iniciar sesión. |
| `jsonwebtoken` | Firma JWT para las sesiones y verifica el token en el middleware de autenticación. |
| `express-rate-limit` | Limita intentos de acceso/registro y operaciones de crear o unirse a departamentos. |
| `pg` | Proporciona `Pool` y conexiones para ejecutar consultas PostgreSQL. |

`crypto` también se utiliza para generar valores aleatorios, pero forma parte de Node.js y no se instala desde npm. El servidor no carga automáticamente un archivo `.env`; las variables deben definirse en el entorno de ejecución.

### Funciones y configuración del servidor

- `autenticarJWT(req, res, next)`: busca el token en el encabezado Bearer, lo verifica y adjunta el usuario decodificado a `req`.
- `Pool`: mantiene el conjunto de conexiones PostgreSQL usado por las rutas.
- `cors(...)`, `express.json(...)` y los limitadores: configuran orígenes, lectura de cuerpos JSON y límites de frecuencia.
- Las funciones asíncronas dentro de cada ruta validan la petición, ejecutan consultas SQL y devuelven un resultado o un error HTTP.

### Rutas disponibles

Todas las rutas de esta tabla, excepto `/health`, `/db-test`, `/login` y `/registro`, están detrás del middleware JWT.

| Área | Método y ruta | Función |
|---|---|---|
| Estado | `GET /health` | Comprueba que la API responde. |
| Estado | `GET /db-test` | Prueba una consulta a PostgreSQL. |
| Sesión | `POST /login` | Valida credenciales, genera un JWT y devuelve el usuario. |
| Usuarios | `POST /registro` | Registra un usuario y cifra su contraseña. |
| Usuarios | `GET /usuarios`, `GET /docentes` | Consulta usuarios y sus departamentos. |
| Usuarios | `PUT /usuarios/:id` | Actualiza datos de usuario. |
| Usuarios | `PATCH /usuarios/:id/password` | Cambia la contraseña. |
| Usuarios | `DELETE /usuarios/:id` | Elimina un usuario. |
| Anuncios | `GET /anuncios`, `POST /anuncios`, `PUT /anuncios/:id`, `DELETE /anuncios/:id` | Consulta y administra anuncios. |
| Anuncios | `GET /anuncios/papelera`, `PUT /anuncios/:id/restaurar`, `DELETE /anuncios/:id/permanente` | Consulta, restaura o elimina definitivamente anuncios archivados. |
| Archivos | `GET /archivos`, `POST /archivos`, `DELETE /archivos/:id` | Consulta y administra registros de archivos. |
| Archivos | `GET /archivos/papelera`, `PUT /archivos/:id/restaurar`, `DELETE /archivos/:id/permanente` | Consulta, restaura o elimina definitivamente archivos archivados. |
| Tareas | `GET /tareas`, `POST /tareas`, `PUT /tareas/:id`, `DELETE /tareas/:id` | Consulta y administra tareas. |
| Departamentos | `GET /departamentos`, `GET /departamentos/codigo/:codigo`, `POST /departamentos`, `PUT /departamentos/:id`, `DELETE /departamentos/:id` | Consulta y administra departamentos. |
| Notificaciones | `GET /notificaciones`, `PUT /notificaciones/:id/leer`, `DELETE /notificaciones/:id` | Consulta, marca como leída o elimina notificaciones. |
| Resúmenes | `GET /api/stats`, `GET /api/departamentos-con-conteo` | Obtiene estadísticas para las pantallas de resumen. |

La eliminación de anuncios y archivos incluye una papelera lógica, con campos `eliminado` y `fecha_eliminacion`; la API también ofrece restauración y borrado permanente.

## 7. Seguridad y datos de configuración

El backend lee estas variables de entorno:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. |
| `JWT_SECRET` | Clave para firmar y verificar los JWT. |
| `PORT` | Puerto del servidor; si no se define, usa `3000`. |

Medidas presentes en el código:

- Las contraseñas se hashean con `bcrypt` usando 10 rondas de salt.
- Los JWT expiran a las 8 horas.
- Las rutas de acceso y registro permiten hasta 15 peticiones por ventana de 15 minutos; crear y unirse a departamentos tienen límites de 10 por ventana de 15 minutos. No hay un limitador global.
- CORS permite los dominios configurados y direcciones localhost.
- El JSON de entrada tiene un límite de 15 MB.
- Las consultas SQL usan parámetros para separar los valores del texto SQL.

**Importante:** configura `DATABASE_URL` y `JWT_SECRET` como variables del entorno donde ejecutas el backend. El código contiene una clave de respaldo para desarrollo; no debe usarse en producción. El servidor no carga `backend/.env` por sí solo; no publiques secretos.

La autenticación JWT protege las rutas, pero no se debe asumir que cada ruta aplica permisos por rol: la presencia de `rol` o `es_jefe` en los datos no sustituye una autorización explícita en el servidor.

## 8. Cómo ejecutar el proyecto

### Iniciar el backend

Desde una terminal:

```powershell
cd backend
npm install
npm start
```

Antes de iniciarlo, configura `DATABASE_URL` y `JWT_SECRET` en el entorno del proceso o del servicio de despliegue. El comando `npm start` ejecuta `node server.js`. Para verificar el servidor, consulta `/health`; para probar también la conexión a la base, consulta `/db-test`.

### Abrir el frontend

El frontend es HTML/CSS/JavaScript estático; no tiene un proceso de compilación definido en `package.json`. Sirve la carpeta `frontend` con un servidor estático y abre la pantalla requerida en el navegador. Las pantallas de módulos están dentro de `frontend/html/`.

**Nota para la portada:** en el estado actual, `frontend/index.html` referencia `index.js` en la raíz de `frontend`, mientras que el archivo existente está en `frontend/js/index.js`. Además, los destinos de acceso se expresan como `login.html`, aunque la pantalla está en `frontend/html/login.html`. Para que esos controles funcionen en un despliegue estático, configura las rutas/reescrituras del hosting o ajusta esas referencias.

## 9. Límites y alcance actual

- El backend conecta a una instancia PostgreSQL mediante `DATABASE_URL`; el esquema de tablas debe existir en esa base. El servidor añade automáticamente las columnas de papelera a `archivos` y `anuncios`.
- Los módulos del frontend apuntan a la URL de API de producción, por lo que un backend local requiere cambiar esa configuración o adaptar el entorno.
- El calendario organiza tareas por fecha; en las rutas revisadas no hay un recurso independiente de eventos de calendario.
- `frontend/html/test/test2.html` es una pantalla de prueba visual, no una prueba automatizada del backend o frontend.

### Integraciones que conviene corregir antes de presentar el flujo como terminado

Las siguientes diferencias se observan al comparar los scripts del frontend con las rutas declaradas en `backend/server.js`. Se documentan para distinguir la intención de una pantalla de las rutas que el backend realmente ofrece.

| Código frontend | Diferencia observada |
|---|---|
| `inicio.js` y `docentes.js` | Algunos consultan `GET /login`, pero el backend ofrece los listados en `GET /usuarios` y `GET /docentes`. |
| `docentes.js` | El borrado se solicita como `DELETE /login/:id`; el backend declara `DELETE /usuarios/:id`. |
| `inicio.js` | Solicita `GET /calendario`; el backend no tiene esa ruta. Las fechas del calendario se gestionan como tareas mediante `/tareas`. |
| `bienvenida.js` | Envía el código a `POST /departamentos/unirse`, ruta que no está declarada en el servidor actual. |
| `archivos.js` | La descarga espera `GET /archivos/:id`, pero esa ruta tampoco aparece en el backend revisado. |
| `registro.html` | No incluye `ocid-core.js`, aunque `registro.js` espera `window.OCID`. |
| `frontend/index.html` | Carga `index.js` desde la raíz de `frontend`; el archivo está en `frontend/js/index.js`. También navega a `login.html` aunque el documento está bajo `frontend/html/`. |

Además, varias pantallas hacen llamadas directas con `fetch` a rutas protegidas sin agregar `Authorization: Bearer`. En una petición entre dominios, el navegador tampoco adjunta cookies por defecto. Esto afecta especialmente las operaciones de `crear-departamento.js`, `archivos.js`, `tareas.js`, `calendario.js`, `docentes.js` y `perfil.js`. `mi-departamento.js` usa `OCID.apiFetch`, que agrega el token. `anuncios.js`, `inicio.js` y `papelera.js` también tienen helpers que agregan el token para parte de sus llamadas, aunque conservan las diferencias de rutas indicadas arriba.

## 10. Presentación breve del proyecto

> “OCID está dividido en una interfaz y una API. La interfaz usa páginas HTML con estilos por módulo y scripts JavaScript que consultan el backend con `fetch`. El backend está construido con Express, valida JWT en las rutas privadas y usa PostgreSQL para guardar la información. `ocid-core.js` concentra las funciones comunes de sesión, peticiones, mensajes y navegación; los demás scripts implementan las operaciones de cada pantalla, como consultar anuncios, filtrar tareas o restaurar elementos de la papelera. Así se mantiene separada la presentación, la lógica del navegador y el acceso a los datos.”


## 11. Funciones de JavaScript usadas en OCID (resumen)

Guía rápida. Los ejemplos ejecutables están en `GUIA_JS.js` (`node GUIA_JS.js`).

- **Esperar respuestas:** `Promise`, `async`/`await`, `fetch`, `Promise.all` y `try`/`catch`. Viven en `api.js` y en los controladores.
- **Guardar y empaquetar:** `localStorage`, `JSON.stringify`/`parse` y `session.js`.
- **Datos y seguridad:** `Pool` + `pool.query()` en `database.js`; `jwt.sign/verify` y `bcrypt.hash/compare` en `auth.js`.
- **Servidor:** `express.Router()`, middleware y `app.use`.
- **Pantalla:** `createElement`, `appendChild`, `replaceChildren`, `addEventListener`, `DOMContentLoaded`, `WeakSet` y `new URL()`.
- **Escritura corta:** funciones flecha, template literals, destructuring, spread, `?.`/`??` y `map`/`filter`/`find`/`some`/`forEach`.

Idea clave: JavaScript espera respuestas, guarda la sesión, habla con la base de datos y pinta la pantalla. Cada pieza hace una parte pequeña y por eso es más fácil de arreglar.
