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

  // Sincroniza contadores, insignias y estado del botón global
  function actualizarContadores() {
    const total = notificaciones.length;
    const sinLeer = notificaciones.filter(item => !item.leida).length;
    const leidas = total - sinLeer;
    const anuncios = notificaciones.filter(item => item.tipo === 'anuncio').length;
    const tareas = notificaciones.filter(item => item.tipo === 'tarea').length;
    const archivos = notificaciones.filter(item => item.tipo === 'archivo').length;
    const valores = {
      conteo_total_notificaciones: total,
      conteo_sin_leer: sinLeer,
      conteo_leidas: leidas,
      conteo_anuncios: anuncios,
      conteo_archivos: archivos,
      conteo_tareas_pendientes: tareas,
      badge_notificaciones: sinLeer,
      badge_lateral: sinLeer,
      indicador_notificaciones: sinLeer,
    };

    Object.entries(valores).forEach(([id, cantidad]) => {
      const elemento = document.getElementById(id);
      if (elemento) {
        elemento.textContent = String(cantidad);
        if (id === 'indicador_notificaciones') elemento.classList.toggle('oculto', !cantidad);
      }
    });

    document.querySelectorAll('.boton_campana').forEach(boton => {
      boton.setAttribute('aria-label', `Notificaciones, ${sinLeer} sin leer`);
    });

    const botonTodas = document.getElementById('boton_marcar_leidas');
    if (botonTodas) {
      botonTodas.disabled = !notificaciones.some(item => !item.visto);
    }
  }

  // Pinta la lista filtrada usando las clases definidas en notificaciones.css
  function renderizarNotificaciones() {
    const contenedor = document.getElementById('contenedor_notificaciones');
    const vacio = document.getElementById('vacio_notificaciones');
    if (!contenedor) return;
    contenedor.classList.remove('mensaje_estado_notificaciones');

    const visibles = notificaciones.filter(item => {
      if (filtroActual === 'no_leidas') return !item.leida;
      if (filtroActual === 'leidas') return item.leida;
      return true;
    });

    contenedor.replaceChildren();
    if (!visibles.length) {
      if (vacio) {
        vacio.textContent = filtroActual === 'todas'
          ? 'Aún no has recibido notificaciones.'
          : 'Aún no has recibido notificaciones en esta categoría.';
        vacio.classList.remove('oculto');
      }
      return;
    }

    if (vacio) vacio.classList.add('oculto');
    contenedor.innerHTML = visibles.map(item => {
      const esAnuncio = item.tipo === 'anuncio';
      const esArchivo = item.tipo === 'archivo';
      const id = Number(item.id);
      const elementoId = Number(item.elemento_id);
      const acciones = [
        !item.visto && Number.isSafeInteger(elementoId) && elementoId > 0
          ? `<button class="boton_marcar_leido" type="button" onclick="marcarElementoComoVisto('${escaparHTML(item.tipo)}', ${elementoId})" title="Marcar como visto" aria-label="Marcar como visto"><i class="fa-regular fa-circle-check"></i></button>`
          : '',
        esAnuncio && Number.isSafeInteger(id) && id > 0
          ? `<button class="boton_borrar" type="button" onclick="borrarNotificacion(${id})" title="Eliminar notificación" aria-label="Eliminar notificación"><i class="fa-regular fa-trash-can"></i></button>`
          : ''
      ].join('');
      const fecha = item.fecha ? new Date(item.fecha) : null;
      const fechaTexto = fecha && !Number.isNaN(fecha.getTime())
        ? fecha.toLocaleDateString('es-MX')
        : '';

      // El id y el tipo viajan en los botones, sin atributos personalizados
      return `<article class="item_notificacion ${item.leida ? 'leido' : 'no_leido'}">
        <div class="icono_item"><i class="${esAnuncio ? 'fa-solid fa-bullhorn' : esArchivo ? 'fa-regular fa-folder-open' : 'fa-solid fa-list-check'}" aria-hidden="true"></i></div>
        <div class="contenido_item">
          <div class="titulo_item">${escaparHTML(item.titulo || 'Notificación')}</div>
          <div class="descripcion_item">${escaparHTML(item.contenido || '')}</div>
          <div class="meta_item">
            <span class="tipo_item">${esAnuncio ? 'Anuncio' : esArchivo ? 'Archivo' : 'Tarea'}</span>
            ${item.departamento_nombre ? `<span class="depto_item">${escaparHTML(item.departamento_nombre)}</span>` : ''}
            ${fechaTexto ? `<span class="fecha_item">${escaparHTML(fechaTexto)}</span>` : ''}
          </div>
        </div>
        ${acciones ? `<div class="acciones_item">${acciones}</div>` : ''}
      </article>`;
    }).join('');
  }

  // Carga el listado desde la API y controla los mensajes de estado
  async function cargarNotificaciones(mostrarError = true) {
    if (cargaNotificacionesActiva) return false;
    cargaNotificacionesActiva = true;
    const contenedor = document.getElementById('contenedor_notificaciones');
    const vacio = document.getElementById('vacio_notificaciones');
    if (contenedor && mostrarError) {
      contenedor.classList.add('mensaje_estado_notificaciones');
      contenedor.textContent = 'Cargando notificaciones...';
    }
    if (vacio) vacio.classList.add('oculto');

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
        if (contenedor) {
          contenedor.classList.add('mensaje_estado_notificaciones');
          contenedor.textContent = 'No se pudieron cargar las notificaciones.';
        }
      }
      return false;
    } finally {
      cargaNotificacionesActiva = false;
    }
  }

  // Configura las pestañas Todas / No leídas / Leídas
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
      const item = notificaciones.find(notificacion =>
        notificacion.tipo === 'anuncio' && Number(notificacion.id) === Number(id)
      );
      if (!item || !item.elemento_id) throw new Error('No se encontró el anuncio relacionado.');
      await window.marcarElementoComoVisto('anuncio', Number(item.elemento_id));
    } catch (error) {
      console.error('Error al marcar notificación como leída:', error);
      window.OCID.mostrarToast(error.message || 'No se pudo marcar como leída.', 'error');
    }
  };

  window.marcarElementoComoVisto = async function (tipo, elementoId) {
    try {
      await window.OCID.marcarElementoVisto(tipo, Number(elementoId));
      notificaciones = notificaciones.map(item =>
        item.tipo === tipo && Number(item.elemento_id) === Number(elementoId)
          ? { ...item, visto: true, leida: true }
          : item
      );
      actualizarContadores();
      renderizarNotificaciones();
      window.OCID.mostrarToast('Elemento marcado como visto.', 'exito');
    } catch (error) {
      console.error('Error al marcar elemento como visto:', error);
      window.OCID.mostrarToast(error.message || 'No se pudo marcar como visto.', 'error');
    }
  };

  window.borrarNotificacion = async function (id) {
    // Confirmación personalizada antes de eliminar la notificación
    if (!await window.OCID.confirmarAccion('¿Eliminar esta notificación?')) return;
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
    const pendientes = notificaciones.filter(item => !item.visto && Number(item.elemento_id) > 0);
    if (!pendientes.length) {
      window.OCID.mostrarToast('No hay elementos sin leer.', 'advertencia');
      return;
    }

    const boton = document.getElementById('boton_marcar_leidas');
    if (boton) boton.disabled = true;
    const resultados = await Promise.allSettled(pendientes.map(item =>
      window.OCID.marcarElementoVisto(item.tipo, Number(item.elemento_id))
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
      window.OCID.mostrarToast('Todos los elementos fueron marcados como vistos.', 'exito');
    }
    if (boton) boton.disabled = false;
  };

  // Arranca la carga inicial y mantiene la lista actualizada
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
