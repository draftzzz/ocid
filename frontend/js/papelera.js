/* ==========================================================================
   Lógica de Papelera de Reciclaje (Archivos y Anuncios Propios) - OCID
   ========================================================================== */
(function () {
  let seccionActiva = 'archivos';
  let archivosEliminados = [];
  let anunciosEliminados = [];

  function obtenerSesion() {
    try {
      return JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (e) {
      return null;
    }
  }

  function mostrarToast(mensaje, esError = false) {
    const toast = document.getElementById('toast_mensaje');
    if (!toast) return;
    const texto = document.getElementById('texto_toast');
    const icono = document.getElementById('icono_toast_papelera');
    if (texto) texto.textContent = mensaje;
    if (icono) {
      icono.className = esError
        ? 'fa-solid fa-circle-exclamation icono_toast icono_toast_error'
        : 'fa-solid fa-circle-check icono_toast';
    }
    toast.classList.add('toast_visible');
    setTimeout(() => toast.classList.remove('toast_visible'), 3500);
  }

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function iniciarInterfaz() {
    const usuario = obtenerSesion();
    const nombre = usuario && (usuario.nombre || usuario.correo || usuario.usuario);
    const rol = usuario && (usuario.rol || usuario.tipo || 'Jefe de Departamento');

    const elNombre = document.getElementById('nombreUsuario');
    const elRol = document.getElementById('etiqueta_rol_usuario');
    const avatar = document.getElementById('avatar_usuario_circulo');

    if (elNombre && nombre) elNombre.textContent = nombre;
    if (elRol) elRol.textContent = rol;
    if (avatar && nombre) {
      avatar.textContent = nombre.split(/\s+/).slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
    }

    // Actualizar contador de notificaciones solo si existe token
    if (window.OCID.obtenerToken()) {
      window.OCID.apiFetch('/notificaciones')
        .then(datos => {
          const noLeidas = Array.isArray(datos.notificaciones) ? datos.notificaciones.filter(n => !n.leida).length : 0;
          document.querySelectorAll('.punto_notificacion, .insignia_notificacion').forEach(insignia => {
            insignia.textContent = noLeidas;
            insignia.style.display = noLeidas === 0 ? 'none' : '';
          });
        })
        .catch(() => {});
    }

    document.querySelectorAll('.boton_notificaciones').forEach(boton => {
      boton.addEventListener('click', () => {
        window.location.href = 'notificaciones.html';
      });
    });

    const botonHamburguesa = document.querySelector('.boton_menu_hamburguesa');
    const fondoMovil = document.querySelector('.fondo_menu_movil');
    if (botonHamburguesa) {
      botonHamburguesa.addEventListener('click', () => {
        document.body.classList.toggle('menu_movil_abierto');
      });
    }
    if (fondoMovil) {
      fondoMovil.addEventListener('click', () => {
        document.body.classList.remove('menu_movil_abierto');
      });
    }

    const botonCerrarSesion = document.getElementById('boton_cerrar_sesion');
    if (botonCerrarSesion) {
      botonCerrarSesion.addEventListener('click', evento => {
        evento.preventDefault();
        localStorage.removeItem('usuario_ocid');
        localStorage.removeItem('token_ocid');
        sessionStorage.clear();
        window.location.href = 'login.html';
      });
    }
  }

  window.cambiarSeccionPapelera = function (seccion) {
    seccionActiva = seccion;
    const btnArchivos = document.getElementById('btn_pestana_archivos');
    const btnAnuncios = document.getElementById('btn_pestana_anuncios');
    if (btnArchivos) btnArchivos.classList.toggle('activa', seccion === 'archivos');
    if (btnAnuncios) btnAnuncios.classList.toggle('activa', seccion === 'anuncios');
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

    thead.innerHTML = `
      <th>Documento</th>
      <th>Departamento</th>
      <th>Eliminado el</th>
      <th class="columna_centrada">Acciones</th>
    `;

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

    thead.innerHTML = `
      <th>Título del Anuncio</th>
      <th>Prioridad</th>
      <th>Eliminado el</th>
      <th class="columna_centrada">Acciones</th>
    `;

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

      archivosEliminados = Array.isArray(dataArchivos.archivos) ? dataArchivos.archivos : [];
      anunciosEliminados = Array.isArray(dataAnuncios.anuncios) ? dataAnuncios.anuncios : [];

      renderizarContenidoActual();
    } catch (error) {
      console.error(error);
      mostrarToast('Error al conectar con el servidor.', true);
    }
  }

  window.restaurarArchivo = async function (id) {
    try {
      const data = await window.OCID.apiFetch(`/archivos/${id}/restaurar`, { method: 'PUT' });
      if (!data.success) throw new Error('No se pudo restaurar el archivo.');
      archivosEliminados = archivosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Archivo restaurado con éxito.');
    } catch (e) {
      mostrarToast('No se pudo restaurar el archivo.', true);
    }
  };

  window.eliminarDefinitivoArchivo = async function (id) {
    if (!confirm('¿Eliminar este archivo de forma permanente?')) return;
    try {
      const data = await window.OCID.apiFetch(`/archivos/${id}/permanente`, { method: 'DELETE' });
      if (!data.success) throw new Error('No se pudo eliminar el archivo.');
      archivosEliminados = archivosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Archivo eliminado permanentemente.');
    } catch (e) {
      mostrarToast('No se pudo eliminar el archivo.', true);
    }
  };

  window.restaurarAnuncio = async function (id) {
    try {
      const data = await window.OCID.apiFetch(`/anuncios/${id}/restaurar`, { method: 'PUT' });
      if (!data.success) throw new Error('No se pudo restaurar el anuncio.');
      anunciosEliminados = anunciosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Anuncio restaurado con éxito.');
    } catch (e) {
      mostrarToast('No se pudo restaurar el anuncio.', true);
    }
  };

  window.eliminarDefinitivoAnuncio = async function (id) {
    if (!confirm('¿Eliminar este anuncio de forma permanente?')) return;
    try {
      const data = await window.OCID.apiFetch(`/anuncios/${id}/permanente`, { method: 'DELETE' });
      if (!data.success) throw new Error('No se pudo eliminar el anuncio.');
      anunciosEliminados = anunciosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Anuncio eliminado permanentemente.');
    } catch (e) {
      mostrarToast('No se pudo eliminar el anuncio.', true);
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