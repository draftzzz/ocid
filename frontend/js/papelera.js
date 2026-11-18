/* ==========================================================================
   Lógica de Papelera de Reciclaje (Archivos y Anuncios Propios) - OCID
   ========================================================================== */
(function () {
  let seccionActiva = 'archivos';
  let archivosEliminados = [];
  let anunciosEliminados = [];

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
    if (btnArchivos) {
      btnArchivos.classList.toggle('activa', seccion === 'archivos');
      btnArchivos.setAttribute('aria-pressed', String(seccion === 'archivos'));
    }
    if (btnAnuncios) {
      btnAnuncios.classList.toggle('activa', seccion === 'anuncios');
      btnAnuncios.setAttribute('aria-pressed', String(seccion === 'anuncios'));
    }
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
    } else {
      const filtrados = anunciosEliminados.filter(a =>
        (a.titulo || '').toLowerCase().includes(termino) ||
        (a.contenido || '').toLowerCase().includes(termino)
      );
      renderizarTablaAnuncios(filtrados);
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
        <td>
          <div class="celda_documento">
            <div class="icono_archivo_papelera"><i class="fa-regular fa-file-lines"></i></div>
            <span>${escaparHTML(archivo.nombre)}</span>
          </div>
        </td>
        <td>${escaparHTML(archivo.departamento_nombre || 'General')}</td>
        <td>${archivo.fecha_eliminacion ? new Date(archivo.fecha_eliminacion).toLocaleDateString('es-MX') : 'Reciente'}</td>
        <td class="columna_centrada">
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
          <td>
            <div class="celda_documento">
              <div class="icono_archivo_papelera"><i class="fa-solid fa-bullhorn"></i></div>
              <div>
                <span>${escaparHTML(anuncio.titulo)}</span>
                <span class="meta_tamano_archivo">${escaparHTML(resumen)}${anuncio.contenido && anuncio.contenido.length > 60 ? '...' : ''}</span>
              </div>
            </div>
          </td>
          <td>${escaparHTML(anuncio.prioridad || 'Informativo')}</td>
          <td>${anuncio.fecha_eliminacion ? new Date(anuncio.fecha_eliminacion).toLocaleDateString('es-MX') : 'Reciente'}</td>
          <td class="columna_centrada">
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
      const [dataArchivos, dataAnuncios] = await Promise.all([
        window.OCID.apiFetch('/archivos/papelera'),
        window.OCID.apiFetch('/anuncios/papelera')
      ]);

      if (!dataArchivos.success || !Array.isArray(dataArchivos.archivos) ||
          !dataAnuncios.success || !Array.isArray(dataAnuncios.anuncios)) {
        throw new Error(dataArchivos.error || dataAnuncios.error || 'La respuesta de la papelera no es válida.');
      }
      archivosEliminados = dataArchivos.archivos;
      anunciosEliminados = dataAnuncios.anuncios;

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
    if (!window.confirm('¿Eliminar este archivo de forma permanente?')) return;
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
    if (!window.confirm('¿Eliminar este anuncio de forma permanente?')) return;
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

  document.addEventListener('DOMContentLoaded', () => {
    iniciarInterfaz();
    const inputBusqueda = document.getElementById('campo_busqueda_general');
    if (inputBusqueda) {
      inputBusqueda.addEventListener('input', renderizarContenidoActual);
    }
    cargarPapeleraGeneral();
  });
})();