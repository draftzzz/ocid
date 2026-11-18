(function () {
  'use strict';

  let notificaciones = [];
  let filtroActual = 'todas';
  let cargaNotificacionesActiva = false;

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[caracter]);
  }

  function actualizarContadores() {
    const total = notificaciones.length;
    const sinLeer = notificaciones.filter(item => !item.leida).length;
    const leidas = total - sinLeer;
    const anuncios = notificaciones.filter(item => item.tipo === 'anuncio').length;
    const tareas = notificaciones.filter(item => item.tipo === 'tarea').length;
    const valores = {
      conteo_total_notificaciones: total,
      conteo_sin_leer: sinLeer,
      conteo_leidas: leidas,
      conteo_anuncios: anuncios,
      conteo_tareas_pendientes: tareas,
      badge_notificaciones: sinLeer,
      badge_lateral: sinLeer,
      indicador_notificaciones: sinLeer,
    };

    Object.entries(valores).forEach(([id, cantidad]) => {
      const elemento = document.getElementById(id);
      if (elemento) {
        elemento.textContent = String(cantidad);
        if (id === 'indicador_notificaciones') elemento.style.display = cantidad ? '' : 'none';
      }
    });

    document.querySelectorAll('.boton_campana').forEach(boton => {
      boton.setAttribute('aria-label', `Notificaciones, ${sinLeer} sin leer`);
    });

    const botonTodas = document.getElementById('boton_marcar_leidas');
    if (botonTodas) {
      botonTodas.disabled = !notificaciones.some(item => item.tipo === 'anuncio' && !item.leida);
    }
  }

  function renderizarNotificaciones() {
    const contenedor = document.getElementById('contenedor_notificaciones');
    const vacio = document.getElementById('vacio_notificaciones');
    if (!contenedor) return;

    const visibles = notificaciones.filter(item => {
      if (filtroActual === 'no_leidas') return !item.leida;
      if (filtroActual === 'leidas') return item.leida;
      return true;
    });

    contenedor.replaceChildren();
    if (!visibles.length) {
      if (vacio) {
        vacio.textContent = filtroActual === 'todas'
          ? 'No hay notificaciones registradas.'
          : 'No hay notificaciones en esta categoría.';
        vacio.style.display = 'block';
      }
      return;
    }

    if (vacio) vacio.style.display = 'none';
    contenedor.innerHTML = visibles.map(item => {
      const esAnuncio = item.tipo === 'anuncio';
      const id = Number(item.id);
      const acciones = Number.isSafeInteger(id) && id > 0 && esAnuncio
        ? `${!item.leida ? `<button class="boton_marcar_leido" type="button" onclick="marcarLeida(${id})" title="Marcar como leída" aria-label="Marcar como leída"><i class="fa-regular fa-circle-check"></i></button>` : ''}
           <button class="boton_borrar" type="button" onclick="borrarNotificacion(${id})" title="Eliminar notificación" aria-label="Eliminar notificación"><i class="fa-regular fa-trash-can"></i></button>`
        : '';
      const fecha = item.fecha ? new Date(item.fecha) : null;
      const fechaTexto = fecha && !Number.isNaN(fecha.getTime())
        ? fecha.toLocaleDateString('es-MX')
        : '';

      return `<article class="item_notificacion ${item.leida ? 'leido' : 'no_leido'}" data-id="${id}" data-tipo="${escaparHTML(item.tipo)}">
        <div class="icono_item"><i class="${esAnuncio ? 'fa-solid fa-bullhorn' : 'fa-solid fa-list-check'}" aria-hidden="true"></i></div>
        <div class="contenido_item">
          <div class="titulo_item">${escaparHTML(item.titulo || 'Notificación')}</div>
          <div class="descripcion_item">${escaparHTML(item.contenido || '')}</div>
          <div class="meta_item">
            <span class="tipo_item">${esAnuncio ? 'Anuncio' : 'Tarea pendiente'}</span>
            ${item.departamento_nombre ? `<span class="depto_item">${escaparHTML(item.departamento_nombre)}</span>` : ''}
            ${fechaTexto ? `<span class="fecha_item">${escaparHTML(fechaTexto)}</span>` : ''}
          </div>
        </div>
        ${acciones ? `<div class="acciones_item">${acciones}</div>` : ''}
      </article>`;
    }).join('');
  }

  async function cargarNotificaciones(mostrarError = true) {
    if (cargaNotificacionesActiva) return false;
    cargaNotificacionesActiva = true;
    const contenedor = document.getElementById('contenedor_notificaciones');
    const vacio = document.getElementById('vacio_notificaciones');
    if (contenedor && mostrarError) {
      contenedor.textContent = 'Cargando notificaciones...';
    }
    if (vacio) vacio.style.display = 'none';

    try {
      const datos = await window.OCID.apiFetch('/notificaciones');
      notificaciones = Array.isArray(datos)
        ? datos
        : (Array.isArray(datos.notificaciones) ? datos.notificaciones : []);
      actualizarContadores();
      renderizarNotificaciones();
      return true;
    } catch (error) {
      console.error('Error al cargar notificaciones:', error);
      if (mostrarError) {
        window.OCID.mostrarToast(error.message || 'No se pudieron cargar las notificaciones.', 'error');
        if (contenedor) contenedor.textContent = 'No se pudieron cargar las notificaciones.';
      }
      return false;
    } finally {
      cargaNotificacionesActiva = false;
    }
  }

  function configurarFiltros() {
    const pestañas = [
      ['pestana_todas', 'todas'],
      ['pestana_no_leidas', 'no_leidas'],
      ['pestana_leidas', 'leidas'],
    ];
    pestañas.forEach(([id, filtro]) => {
      const boton = document.getElementById(id);
      if (!boton) return;
      boton.setAttribute('aria-pressed', String(filtro === filtroActual));
      boton.addEventListener('click', () => {
        filtroActual = filtro;
        pestañas.forEach(([otroId, otroFiltro]) => {
          const otraPestana = document.getElementById(otroId);
          if (otraPestana) {
            otraPestana.classList.toggle('pestana_filtro_activa', otroFiltro === filtroActual);
            otraPestana.setAttribute('aria-pressed', String(otroFiltro === filtroActual));
          }
        });
        renderizarNotificaciones();
      });
    });
  }

  window.marcarLeida = async function (id) {
    try {
      const resultado = await window.OCID.apiFetch(`/notificaciones/${Number(id)}/leer`, { method: 'PUT' });
      if (!resultado.success) throw new Error(resultado.error || 'No se pudo marcar como leída.');
      notificaciones = notificaciones.map(item =>
        item.tipo === 'anuncio' && Number(item.id) === Number(id) ? { ...item, leida: true } : item
      );
      actualizarContadores();
      renderizarNotificaciones();
      window.OCID.mostrarToast('Notificación marcada como leída.', 'exito');
    } catch (error) {
      console.error('Error al marcar notificación como leída:', error);
      window.OCID.mostrarToast(error.message || 'No se pudo marcar como leída.', 'error');
    }
  };

  window.borrarNotificacion = async function (id) {
    if (!window.confirm('¿Eliminar esta notificación?')) return;
    try {
      const resultado = await window.OCID.apiFetch(`/notificaciones/${Number(id)}`, { method: 'DELETE' });
      if (!resultado.success) throw new Error(resultado.error || 'No se pudo eliminar la notificación.');
      notificaciones = notificaciones.filter(item =>
        !(item.tipo === 'anuncio' && Number(item.id) === Number(id))
      );
      actualizarContadores();
      renderizarNotificaciones();
      window.OCID.mostrarToast('Notificación eliminada.', 'exito');
    } catch (error) {
      console.error('Error al eliminar notificación:', error);
      window.OCID.mostrarToast(error.message || 'No se pudo eliminar la notificación.', 'error');
    }
  };

  window.marcarTodasLeidas = async function () {
    const pendientes = notificaciones.filter(item => item.tipo === 'anuncio' && !item.leida);
    if (!pendientes.length) {
      window.OCID.mostrarToast('No hay anuncios sin leer.', 'advertencia');
      return;
    }

    const boton = document.getElementById('boton_marcar_leidas');
    if (boton) boton.disabled = true;
    const resultados = await Promise.allSettled(pendientes.map(item =>
      window.OCID.apiFetch(`/notificaciones/${Number(item.id)}/leer`, { method: 'PUT' })
    ));
    const recargada = await cargarNotificaciones(false);
    const fallas = resultados.filter(resultado =>
      resultado.status === 'rejected' || !resultado.value.success
    ).length;

    if (fallas) {
      const mensaje = `No se pudieron marcar ${fallas} de ${pendientes.length} notificaciones.`;
      console.error(mensaje, resultados);
      window.OCID.mostrarToast(mensaje, 'error');
    } else if (!recargada) {
      window.OCID.mostrarToast('Notificaciones marcadas, pero no se pudo actualizar la lista.', 'advertencia');
    } else {
      window.OCID.mostrarToast('Todas las notificaciones de anuncios fueron marcadas como leídas.', 'exito');
    }
    if (boton) boton.disabled = false;
  };

  document.addEventListener('DOMContentLoaded', () => {
    configurarFiltros();
    cargarNotificaciones();
    setInterval(() => {
      if (document.visibilityState === 'visible') cargarNotificaciones(false);
    }, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') cargarNotificaciones(false);
    });
  });
})();
