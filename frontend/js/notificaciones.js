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
        let notificaciones = datos.notificaciones || [];

        // -------------------------------------------------------------
        // FILTRO: Mostrar solo las notificaciones realizadas a partir
        // del momento en que se cargó la página (se descartan las anteriores)
        // -------------------------------------------------------------
        notificaciones = notificaciones.filter(n => {
            const fechaNoti = new Date(n.fecha || n.fecha_creacion).getTime();
            return fechaNoti >= timestampCargaPagina;
        });

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