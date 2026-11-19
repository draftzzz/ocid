/* ==========================================================================
   Lógica de Papelera de Reciclaje (Archivos y Anuncios Propios) - OCID
   ========================================================================== */
(function () {
  let seccionActiva = 'archivos';
  let archivosEliminados = [];
  let anunciosEliminados = [];
  let tareasEliminadas = [];

  function mostrarToast(mensaje, esError = false) {
    window.OCID.mostrarToast(mensaje, esError);
  }

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function iniciarInterfaz() {
    window.OCID.actualizarCabeceraUsuario();
    window.OCID.configurarCierreSesion();
  }

  window.cambiarSeccionPapelera = function (seccion) {
    seccionActiva = seccion;
    const btnArchivos = document.getElementById('btn_pestana_archivos');
    const btnAnuncios = document.getElementById('btn_pestana_anuncios');
    const btnTareas = document.getElementById('btn_pestana_tareas');
    [[btnArchivos, 'archivos'], [btnAnuncios, 'anuncios'], [btnTareas, 'tareas']].forEach(([boton, tipo]) => {
      if (!boton) return;
      boton.classList.toggle('activa', seccion === tipo);
      boton.setAttribute('aria-pressed', String(seccion === tipo));
    });
    renderizarContenidoActual();
  };

  function renderizarContenidoActual() {
    const inputBusqueda = document.getElementById('campo_busqueda_general');
    const termino = inputBusqueda ? inputBusqueda.value.toLowerCase().trim() : '';

    if (seccionActiva === 'archivos') {
      const filtrados = archivosEliminados.filter(a =>
        (a.nombre || '').toLowerCase().includes(termino) ||
        (a.departamento_nombre || '').toLowerCase().includes(termino)
      );
      renderizarTablaArchivos(filtrados);
    } else if (seccionActiva === 'anuncios') {
      const filtrados = anunciosEliminados.filter(a =>
        (a.titulo || '').toLowerCase().includes(termino) ||
        (a.contenido || '').toLowerCase().includes(termino)
      );
      renderizarTablaAnuncios(filtrados);
    } else {
      const filtrados = tareasEliminadas.filter(t =>
        (t.titulo || '').toLowerCase().includes(termino) ||
        (t.departamento || '').toLowerCase().includes(termino)
      );
      renderizarTablaTareas(filtrados);
    }
  }

  function renderizarTablaArchivos(lista) {
    const thead = document.getElementById('encabezado_tabla_papelera');
    const tbody = document.getElementById('cuerpo_tabla_papelera');
    const contador = document.getElementById('contador_elementos_papelera');
    if (!tbody || !thead) return;

    if (contador) contador.textContent = `${lista.length} ${lista.length === 1 ? 'elemento' : 'elementos'}`;

    thead.innerHTML = `<tr>
      <th>Documento</th>
      <th>Departamento</th>
      <th>Eliminado el</th>
      <th class="columna_centrada">Acciones</th>
    </tr>`;

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="celda_estado_vacio">No tienes archivos propios en la papelera.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(archivo => `
      <tr>
        <td data-etiqueta="Documento">
          <div class="celda_documento">
            <div class="icono_archivo_papelera"><i class="fa-regular fa-file-lines"></i></div>
            <span>${escaparHTML(archivo.nombre)}</span>
          </div>
        </td>
        <td data-etiqueta="Departamento">${escaparHTML(archivo.departamento_nombre || 'General')}</td>
        <td data-etiqueta="Eliminado el">${archivo.fecha_eliminacion ? new Date(archivo.fecha_eliminacion).toLocaleDateString('es-MX') : 'Reciente'}</td>
        <td class="columna_centrada" data-etiqueta="Acciones">
          <div class="grupo_acciones_papelera">
            <button type="button" class="boton_restaurar" onclick="restaurarArchivo(${archivo.id})">
              <i class="fa-solid fa-arrow-rotate-left"></i>
              <span>Restaurar</span>
            </button>
            <button type="button" class="boton_eliminar_definitivo" onclick="eliminarDefinitivoArchivo(${archivo.id})">
              <i class="fa-regular fa-trash-can"></i>
              <span>Eliminar</span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderizarTablaAnuncios(lista) {
    const thead = document.getElementById('encabezado_tabla_papelera');
    const tbody = document.getElementById('cuerpo_tabla_papelera');
    const contador = document.getElementById('contador_elementos_papelera');
    if (!tbody || !thead) return;

    if (contador) contador.textContent = `${lista.length} ${lista.length === 1 ? 'elemento' : 'elementos'}`;

    thead.innerHTML = `<tr>
      <th>Título del Anuncio</th>
      <th>Prioridad</th>
      <th>Eliminado el</th>
      <th class="columna_centrada">Acciones</th>
    </tr>`;

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="celda_estado_vacio">No tienes anuncios propios en la papelera.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(anuncio => {
      const resumen = String(anuncio.contenido || '').slice(0, 60);
      return `
        <tr>
          <td data-etiqueta="Titulo del anuncio">
            <div class="celda_documento">
              <div class="icono_archivo_papelera"><i class="fa-solid fa-bullhorn"></i></div>
              <div>
                <span>${escaparHTML(anuncio.titulo)}</span>
                <span class="meta_tamano_archivo">${escaparHTML(resumen)}${anuncio.contenido && anuncio.contenido.length > 60 ? '...' : ''}</span>
              </div>
            </div>
          </td>
          <td data-etiqueta="Prioridad">${escaparHTML(anuncio.prioridad || 'Informativo')}</td>
          <td data-etiqueta="Eliminado el">${anuncio.fecha_eliminacion ? new Date(anuncio.fecha_eliminacion).toLocaleDateString('es-MX') : 'Reciente'}</td>
          <td class="columna_centrada" data-etiqueta="Acciones">
            <div class="grupo_acciones_papelera">
              <button type="button" class="boton_restaurar" onclick="restaurarAnuncio(${anuncio.id})">
                <i class="fa-solid fa-arrow-rotate-left"></i>
                <span>Restaurar</span>
              </button>
              <button type="button" class="boton_eliminar_definitivo" onclick="eliminarDefinitivoAnuncio(${anuncio.id})">
                <i class="fa-regular fa-trash-can"></i>
                <span>Eliminar</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderizarTablaTareas(lista) {
    const thead = document.getElementById('encabezado_tabla_papelera');
    const tbody = document.getElementById('cuerpo_tabla_papelera');
    const contador = document.getElementById('contador_elementos_papelera');
    if (!tbody || !thead) return;
    if (contador) contador.textContent = `${lista.length} ${lista.length === 1 ? 'elemento' : 'elementos'}`;
    thead.innerHTML = `<tr>
      <th>Tarea</th>
      <th>Departamento(s)</th>
      <th>Eliminada el</th>
      <th class="columna_centrada">Acciones</th>
    </tr>`;
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="celda_estado_vacio">No hay tareas en la papelera.</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map(tarea => `
      <tr>
        <td data-etiqueta="Tarea"><div class="celda_documento"><div class="icono_archivo_papelera"><i class="fa-solid fa-list-check"></i></div><span>${escaparHTML(tarea.titulo)}</span></div></td>
        <td data-etiqueta="Departamento(s)">${escaparHTML(tarea.departamento || 'General')}</td>
        <td data-etiqueta="Eliminada el">${tarea.fecha_eliminacion ? new Date(tarea.fecha_eliminacion).toLocaleDateString('es-MX') : 'Reciente'}</td>
        <td class="columna_centrada" data-etiqueta="Acciones">
          <div class="grupo_acciones_papelera">
            <button type="button" class="boton_restaurar" onclick="restaurarTarea(${tarea.id})"><i class="fa-solid fa-arrow-rotate-left"></i><span>Restaurar</span></button>
            <button type="button" class="boton_eliminar_definitivo" onclick="eliminarDefinitivoTarea(${tarea.id})"><i class="fa-regular fa-trash-can"></i><span>Eliminar</span></button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function cargarPapeleraGeneral() {
    const tbody = document.getElementById('cuerpo_tabla_papelera');
    const token = window.OCID.obtenerToken();

    if (!token) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="4" class="celda_estado_vacio">Tu sesión no tiene un token válido. Cierra sesión y vuelve a iniciar sesión para cargar tu papelera.</td></tr>`;
      }
      return;
    }

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" class="celda_estado_vacio">Cargando elementos eliminados...</td></tr>`;
    }

    try {
      const [dataArchivos, dataAnuncios, dataTareas] = await Promise.all([
        window.OCID.apiFetch('/archivos/papelera'),
        window.OCID.apiFetch('/anuncios/papelera'),
        window.OCID.apiFetch('/tareas/papelera')
      ]);

      if (!dataArchivos.success || !Array.isArray(dataArchivos.archivos) ||
          !dataAnuncios.success || !Array.isArray(dataAnuncios.anuncios) ||
          !dataTareas.success || !Array.isArray(dataTareas.tareas)) {
        throw new Error(dataArchivos.error || dataAnuncios.error || dataTareas.error || 'La respuesta de la papelera no es válida.');
      }
      archivosEliminados = dataArchivos.archivos;
      anunciosEliminados = dataAnuncios.anuncios;
      tareasEliminadas = dataTareas.tareas;

      renderizarContenidoActual();
    } catch (error) {
      console.error(error);
      mostrarToast(error.message || 'No se pudo cargar la papelera.', true);
    }
  }

  window.restaurarArchivo = async function (id) {
    try {
      const data = await window.OCID.apiFetch(`/archivos/${id}/restaurar`, { method: 'PUT' });
      if (!data.success) throw new Error('No se pudo restaurar el archivo.');
      archivosEliminados = archivosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Archivo restaurado con éxito.');
    } catch (error) {
      console.error('Error al restaurar archivo:', error);
      mostrarToast(error.message || 'No se pudo restaurar el archivo.', true);
    }
  };

  window.eliminarDefinitivoArchivo = async function (id) {
    // Confirmación personalizada antes de borrar el archivo de forma definitiva
    if (!await window.OCID.confirmarAccion('¿Eliminar este archivo de forma permanente?')) return;
    try {
      const data = await window.OCID.apiFetch(`/archivos/${id}/permanente`, { method: 'DELETE' });
      if (!data.success) throw new Error('No se pudo eliminar el archivo.');
      archivosEliminados = archivosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Archivo eliminado permanentemente.');
    } catch (error) {
      console.error('Error al eliminar archivo:', error);
      mostrarToast(error.message || 'No se pudo eliminar el archivo.', true);
    }
  };

  window.restaurarAnuncio = async function (id) {
    try {
      const data = await window.OCID.apiFetch(`/anuncios/${id}/restaurar`, { method: 'PUT' });
      if (!data.success) throw new Error('No se pudo restaurar el anuncio.');
      anunciosEliminados = anunciosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Anuncio restaurado con éxito.');
    } catch (error) {
      console.error('Error al restaurar anuncio:', error);
      mostrarToast(error.message || 'No se pudo restaurar el anuncio.', true);
    }
  };

  window.eliminarDefinitivoAnuncio = async function (id) {
    // Confirmación personalizada antes de borrar el anuncio de forma definitiva
    if (!await window.OCID.confirmarAccion('¿Eliminar este anuncio de forma permanente?')) return;
    try {
      const data = await window.OCID.apiFetch(`/anuncios/${id}/permanente`, { method: 'DELETE' });
      if (!data.success) throw new Error('No se pudo eliminar el anuncio.');
      anunciosEliminados = anunciosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Anuncio eliminado permanentemente.');
    } catch (error) {
      console.error('Error al eliminar anuncio:', error);
      mostrarToast(error.message || 'No se pudo eliminar el anuncio.', true);
    }
  };

  window.restaurarTarea = async function (id) {
    try {
      const data = await window.OCID.apiFetch(`/tareas/${id}/restaurar`, { method: 'PUT' });
      if (!data.success) throw new Error(data.error || 'No se pudo restaurar la tarea.');
      tareasEliminadas = tareasEliminadas.filter(item => Number(item.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Tarea restaurada con éxito.');
    } catch (error) {
      console.error('Error al restaurar tarea:', error);
      mostrarToast(error.message || 'No se pudo restaurar la tarea.', true);
    }
  };

  window.eliminarDefinitivoTarea = async function (id) {
    // Confirmación personalizada antes de borrar la tarea de forma definitiva
    if (!await window.OCID.confirmarAccion('¿Eliminar esta tarea de forma permanente?')) return;
    try {
      const data = await window.OCID.apiFetch(`/tareas/${id}/permanente`, { method: 'DELETE' });
      if (!data.success) throw new Error(data.error || 'No se pudo eliminar permanentemente la tarea.');
      tareasEliminadas = tareasEliminadas.filter(item => Number(item.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Tarea eliminada permanentemente.');
    } catch (error) {
      console.error('Error al eliminar tarea permanentemente:', error);
      mostrarToast(error.message || 'No se pudo eliminar permanentemente la tarea.', true);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    iniciarInterfaz();
    const inputBusqueda = document.getElementById('campo_busqueda_general');
    if (inputBusqueda) {
      inputBusqueda.addEventListener('input', renderizarContenidoActual);
    }
    cargarPapeleraGeneral();
  });
})();