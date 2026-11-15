"use strict";

const $ = (id) => document.getElementById(id);
const API = "https://ocid.onrender.com";

function obtenerToken() {
    try {
        const u = JSON.parse(localStorage.getItem("usuario_ocid") || "null");
        return u && u.token ? u.token : null;
    } catch (e) {
        return null;
    }
}

async function fetchConAuth(url, opciones = {}) {
    const token = obtenerToken();
    const headers = { ...(opciones.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...opciones, headers });
}

async function leerRespuesta(respuesta) {
    const tipo = respuesta.headers.get("content-type") || "";
    let datos = {};
    if (tipo.includes("application/json")) datos = await respuesta.json();
    else {
        const texto = await respuesta.text();
        datos = texto ? { message: texto } : {};
    }
    if (!respuesta.ok) throw new Error(datos.error || datos.message || `Error HTTP ${respuesta.status}`);
    return datos;
}

function mostrarMensaje(texto, esError = false) {
    const caja = $("aviso_notificacion");
    const textoCaja = $("texto_aviso_notificacion");
    const icono = $("icono_aviso_notificacion");
    if (!caja || !textoCaja) { (esError ? console.error : console.log)(texto); return; }
    textoCaja.textContent = texto;
    if (icono) {
        icono.className = esError ? "fa-solid fa-circle-exclamation" : "fa-solid fa-circle-check";
        icono.style.color = esError ? "#ef4444" : "#22c55e";
    }
    caja.classList.add("visible");
    setTimeout(() => caja.classList.remove("visible"), 3500);
}

function inicializarSesion() {
    try {
        const u = JSON.parse(localStorage.getItem("usuario_ocid") || "null");
        if (u && u.id) {
            const nombre = u.nombre || u.correo || "Usuario";
            if ($("nombreUsuario")) $("nombreUsuario").textContent = nombre;
            if ($("etiqueta_rol_usuario")) $("etiqueta_rol_usuario").textContent = u.rol || "";
            if ($("avatar_usuario_circulo")) {
                $("avatar_usuario_circulo").innerHTML = `<i class="fa-solid fa-user"></i>`;
                const inicial = (nombre.charAt(0) || "U").toUpperCase();
                $("avatar_usuario_circulo").textContent = inicial;
            }
        }
    } catch (e) {}
}

function cerrarSesion() {
    localStorage.removeItem("usuario_ocid");
    inicializarSesion();
    mostrarMensaje("Sesión cerrada.");
    setTimeout(() => { location.href = "inicio.html"; }, 1000);
}

function cerrarModal(id) { $(id)?.classList.remove("visible"); }

function escaparHTML(texto) {
    return String(texto ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
async function cargarNotificaciones() {
    const contenedor = $("contenedor_notificaciones");
    const vacio = $("vacio_notificaciones");
    const totalEl = $("conteo_total_notificaciones");
    const sinLeerEl = $("conteo_sin_leer");
    const anunciosEl = $("conteo_anuncios");
    const tareasEl = $("conteo_tareas_pendientes");
    const badgeEl = $("badge_notificaciones");

    if (contenedor) contenedor.innerHTML = '<p style="text-align:center; color:#64748b;">Cargando notificaciones...</p>';
    if (vacio) vacio.style.display = "none";

    try {
        const datos = await leerRespuesta(await fetchConAuth(`${API}/notificaciones`));
        const notificaciones = datos.notificaciones || [];

        const total = notificaciones.length;
        const sinLeer = notificaciones.filter(n => !n.leida).length;
        const anuncios = notificaciones.filter(n => n.tipo === "anuncio").length;
        const tareas = notificaciones.filter(n => n.tipo === "tarea").length;

        if (totalEl) totalEl.textContent = total;
        if (sinLeerEl) sinLeerEl.textContent = sinLeer;
        if (anunciosEl) anunciosEl.textContent = anuncios;
        if (tareasEl) tareasEl.textContent = tareas;
        if (badgeEl) badgeEl.textContent = sinLeer > 0 ? String(sinLeer) : "0";

        if (contenedor) {
            if (!notificaciones.length) {
                contenedor.innerHTML = "";
                if (vacio) vacio.style.display = "block";
            } else {
                contenedor.innerHTML = notificaciones.map(n => `
                    <article class="item_notificacion ${n.leida ? "leido" : "no_leido"}" data-id="${n.id}" data-tipo="${n.tipo}">
                        <div class="icono_item">
                            <i class="${n.tipo === "tarea" ? "fa-solid fa-list-check" : "fa-solid fa-bullhorn"}"></i>
                        </div>
                        <div class="contenido_item">
                            <div class="titulo_item">${escaparHTML(n.titulo)}</div>
                            <div class="descripcion_item">${escaparHTML(n.contenido || "")}</div>
                            <div class="meta_item">
                                <span class="tipo_item">${n.tipo === "tarea" ? "Tarea pendiente" : "Anuncio"}</span>
                                ${n.departamento_nombre ? `<span class="depto_item">${escaparHTML(n.departamento_nombre)}</span>` : ""}
                                <span class="fecha_item">${n.fecha ? new Date(n.fecha).toLocaleDateString("es-MX") : ""}</span>
                            </div>
                        </div>
                        <div class="acciones_item">
                            ${!n.leida ? `<button class="boton_marcar_leido" onclick="marcarLeida(${n.id}, this)" title="Marcar como leída"><i class="fa-regular fa-circle-check"></i></button>` : ""}
                            <button class="boton_borrar" onclick="borrarNotificacion(${n.id}, this)" title="Borrar"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </article>
                `).join("");
            }
        }
    } catch (error) {
        console.error("Error al cargar notificaciones:", error);
        mostrarMensaje("No se pudieron cargar las notificaciones", true);
        if (contenedor) contenedor.innerHTML = '<p style="text-align:center; color:#ef4444;">No se pudieron cargar las notificaciones</p>';
    }
}

async function marcarLeida(id, boton) {
    try {
        const datos = await leerRespuesta(await fetchConAuth(`${API}/notificaciones/${id}/leer`, { method: "PUT" }));
        if (datos.success) {
            const item = document.querySelector(`[data-id="${id}"]`);
            if (item) {
                item.classList.remove("no_leido");
                item.classList.add("leido");
                const btnCheck = item.querySelector(".boton_marcar_leido");
                if (btnCheck) btnCheck.remove();
            }
            await cargarNotificaciones();
            mostrarMensaje("Notificación marcada como leída.");
        }
    } catch (error) {
        mostrarMensaje("No se pudo marcar como leída", true);
    }
}

async function borrarNotificacion(id, boton) {
    if (!confirm("¿Deseas borrar esta notificación?")) return;
    try {
        const datos = await leerRespuesta(await fetchConAuth(`${API}/notificaciones/${id}`, { method: "DELETE" }));
        if (datos.success) {
            const item = document.querySelector(`[data-id="${id}"]`);
            if (item) item.remove();
            await cargarNotificaciones();
            mostrarMensaje("Notificación eliminada.");
        }
    } catch (error) {
        mostrarMensaje("No se pudo eliminar la notificación", true);
    }
}
async function marcarTodasLeidas() {
    const items = document.querySelectorAll(".item_notificacion.no_leido");
    for (const item of items) {
        const id = Number(item.getAttribute("data-id"));
        try {
            await fetchConAuth(`${API}/notificaciones/${id}/leer`, { method: "PUT" });
        } catch (e) {}
    }
    await cargarNotificaciones();
    mostrarMensaje("Todas las notificaciones marcadas como leídas.");
}

async function borrarTodas() {
    if (!confirm("¿Deseas borrar todas las notificaciones?")) return;
    const items = document.querySelectorAll(".item_notificacion");
    for (const item of items) {
        const id = Number(item.getAttribute("data-id"));
        try {
            await fetchConAuth(`${API}/notificaciones/${id}`, { method: "DELETE" });
        } catch (e) {}
    }
    await cargarNotificaciones();
    mostrarMensaje("Todas las notificaciones eliminadas.");
}

async function refrescarNotificaciones() {
    await cargarNotificaciones();
    mostrarMensaje("Notificaciones actualizadas.");
}

document.addEventListener("DOMContentLoaded", () => {
    inicializarSesion();
    cargarNotificaciones();
});
��t e s t  
 