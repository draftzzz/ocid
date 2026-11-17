/* ==========================================================================
   Correcciones para inicio.js — Autenticación y Carga de Datos Corregida
   ========================================================================== */

// Función segura para obtener el token desde la clave unificada 'token_ocid' o 'usuario_ocid'
function obtenerToken() {
    try {
        // Busca primero la clave directa del token, luego dentro del objeto de sesión
        const tokenDirecto = localStorage.getItem("token_ocid") || localStorage.getItem("token");
        if (tokenDirecto) return tokenDirecto;

        const u = JSON.parse(localStorage.getItem("usuario_ocid") || "null");
        return u && (u.token || u.token_ocid) ? (u.token || u.token_ocid) : null;
    } catch (e) {
        return null;
    }
}

// Petición con autenticación JWT garantizada
async function fetchConAuth(url, opciones = {}) {
    const token = obtenerToken();
    const headers = { 
        "Content-Type": "application/json",
        ...(opciones.headers || {}) 
    };
    
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    
    return fetch(url, { ...opciones, headers });
}

// 1. Cargar Anuncios correctamente
async function cargarAnuncios() {
    const contenedor = $("contenedor_lista_anuncios");
    if (contenedor) contenedor.innerHTML = '<p class="texto_vacio">Cargando anuncios...</p>';
    try {
        const respuesta = await fetchConAuth(`${API}/anuncios`);
        const datos = await leerRespuesta(respuesta);
        listaAnunciosGlobal = obtenerLista(datos).map(a => ({
            id: a.id, titulo: a.titulo || "", contenido: a.contenido || "",
            prioridad: normalizarPrioridad(a.prioridad), autor: a.autor_nombre || "Usuario",
            fecha: a.fecha || ""
        }));
        renderizarAnunciosUI(listaAnunciosGlobal);
    } catch (error) {
        console.error("Error al cargar anuncios:", error);
        listaAnunciosGlobal = [];
        if (contenedor) contenedor.innerHTML = '<p class="texto_vacio">No se pudieron cargar los anuncios</p>';
        actualizarContadorAnuncios(null);
    }
}

// 2. Cargar Docentes / Usuarios (Ruta correcta /docentes en lugar de /login)
async function cargarUsuarios() {
    try {
        const respuesta = await fetchConAuth(`${API}/docentes`);
        const datos = await leerRespuesta(respuesta);
        listaUsuariosGlobal = obtenerLista(datos);
        const docentes = listaUsuariosGlobal.filter(u => String(u.rol || "").toLowerCase().includes("docente"));
        if ($("conteo_usr")) $("conteo_usr").textContent = docentes.length ? String(docentes.length) : "—";
        return listaUsuariosGlobal;
    } catch (error) {
        console.error("Error al cargar docentes:", error);
        if ($("conteo_usr")) $("conteo_usr").textContent = "—";
        return [];
    }
}

// 3. Cargar Departamentos correctamente
async function cargarDepartamentos() {
    try {
        const respuesta = await fetchConAuth(`${API}/departamentos`);
        const datos = await leerRespuesta(respuesta);
        listaDepartamentosGlobal = obtenerLista(datos);
        
        const selector = $("campo_departamento_anuncio");
        if (selector) {
            selector.innerHTML = '<option value="">Selecciona un departamento</option>' + listaDepartamentosGlobal.map(d => {
                const id = Number(d.id);
                return Number.isFinite(id) && d.nombre ? `<option value="${id}">${escaparHTML(d.nombre)}</option>` : "";
            }).join("");
        }

        if (usuario && usuario.departamento_id) {
            const deptoActual = listaDepartamentosGlobal.find(d => Number(d.id) === Number(usuario.departamento_id));
            if (deptoActual && deptoActual.nombre) {
                if ($("etiqueta_nombre_departamento")) $("etiqueta_nombre_departamento").textContent = deptoActual.nombre;
            } else if (usuario.departamento_nombre || usuario.departamento) {
                if ($("etiqueta_nombre_departamento")) $("etiqueta_nombre_departamento").textContent = usuario.departamento_nombre || usuario.departamento;
            }
        } else {
            if ($("etiqueta_nombre_departamento")) $("etiqueta_nombre_departamento").textContent = "Sin asignar";
        }
        return listaDepartamentosGlobal;
    } catch (error) {
        console.error("Error al cargar departamentos:", error);
        const selector = $("campo_departamento_anuncio");
        if (selector) selector.innerHTML = '<option value="">—</option>';
        if ($("etiqueta_nombre_departamento")) $("etiqueta_nombre_departamento").textContent = "—";
        return [];
    }
}

// 4. Cargar Calendario / Eventos Próximos
async function cargarEventosProximos() {
    try {
        // Nota: Asegúrate de que tu backend tenga la ruta /calendario o /tareas configurada
        const respuesta = await fetchConAuth(`${API}/calendario`);
        const datos = await leerRespuesta(respuesta);
        const listaEventos = obtenerLista(datos);
        
        if ($("metrica_conteo_eventos")) {
            $("metrica_conteo_eventos").textContent = listaEventos.length ? String(listaEventos.length) : "0";
        }

        const contenedorPlantel = document.querySelector(".capa_gradiente_plantel");
        if (contenedorPlantel) {
            if (listaEventos.length > 0) {
                const proximo = listaEventos[0];
                const tituloEvento = proximo.titulo || proximo.nombre || "Evento escolar";
                const fechaEvento = proximo.fecha ? ` (${new Date(proximo.fecha).toLocaleDateString("es-MX")})` : "";

                contenedorPlantel.innerHTML = `
                    <div class="titulo_plantel_superpuesto" style="font-size: 18px;">Próximo Evento</div>
                    <div class="lema_plantel_superpuesto" style="font-weight: 700; color: #ffffff; font-style: normal; margin-top: 4px; font-size: 14px;">${escaparHTML(tituloEvento)}${fechaEvento}</div>
                `;
            } else {
                contenedorPlantel.innerHTML = `
                    <div class="titulo_plantel_superpuesto">CBTIS 258</div>
                    <div class="lema_plantel_superpuesto">"Sin eventos próximos registrados."</div>
                `;
            }
        }
    } catch (error) {
        console.error("Error al cargar eventos del calendario:", error);
        if ($("metrica_conteo_eventos")) $("metrica_conteo_eventos").textContent = "—";
    }
}