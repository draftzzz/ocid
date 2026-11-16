/* ==========================================================================
   Lógica de Papelera de Reciclaje (Archivos y Anuncios Propios) - OCID
   ========================================================================== */
(function () {
  window.OCID_API_BASE = 'https://ocid.onrender.com';
  let seccionActiva = 'archivos';
  let archivosEliminados = [];
  let anunciosEliminados = [];

  function obtenerSesion() {
    try {
      return JSON.parse(localStorage.getItem('usuario_ocid') || sessionStorage.getItem('usuario_ocid') || 'null');
    } catch (e) {
      return null;
    }
  }

  // Busca el JWT en cualquier clave estándar o dentro del objeto de usuario
  function obtenerToken() {
    try {
      const clavesComunes = ['token', 'ocid_token', 'jwt', 'access_token', 'auth_token'];
      for (const clave of clavesComunes) {
        const val = localStorage.getItem(clave) || sessionStorage.getItem(clave);
        if (val && val.split('.').length === 3) return val;
      }

      const u = obtenerSesion();
      if (u && typeof u === 'object') {
        if (u.token && String(u.token).split('.').length === 3) return u.token;
        if (u.accessToken && String(u.accessToken).split('.').length === 3) return u.accessToken;
      }

      // Escaneo de respaldo en todo el almacenamiento por si tiene otro nombre
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        if (v.startsWith('eyJ') && v.split('.').length === 3) return v;
        if (v.includes('"eyJ')) {
          const parsed = JSON.parse(v);
          if (parsed && parsed.token) return parsed.token;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function fetchConAuth(url, opciones = {}) {
    const token = obtenerToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(opciones.headers || {})
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...opciones, headers });
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
    if (obtenerToken()) {
      fetchConAuth(`${window.OCID_API_BASE}/notificaciones`)
        .then(async res => {
          if (!res.ok) return;
          const datos = await res.json();
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
        localStorage.removeItem('token');
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
    const token = obtenerToken();

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
      const [resArchivos, resAnuncios] = await Promise.all([
        fetchConAuth(`${window.OCID_API_BASE}/archivos/papelera`),
        fetchConAuth(`${window.OCID_API_BASE}/anuncios/papelera`)
      ]);

      if (resArchivos.status === 401 || resArchivos.status === 403) {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="4" class="celda_estado_vacio">Tu sesión expiró. Por favor inicia sesión nuevamente.</td></tr>`;
        }
        return;
      }

      if (resArchivos.ok) {
        const dataArch = await resArchivos.json();
        archivosEliminados = Array.isArray(dataArch.archivos) ? dataArch.archivos : [];
      }

      if (resAnuncios.ok) {
        const dataAnunc = await resAnuncios.json();
        anunciosEliminados = Array.isArray(dataAnunc.anuncios) ? dataAnunc.anuncios : [];
      }

      renderizarContenidoActual();
    } catch (error) {
      console.error(error);
      mostrarToast('Error al conectar con el servidor.', true);
    }
  }

  window.restaurarArchivo = async function (id) {
    try {
      const res = await fetchConAuth(`${window.OCID_API_BASE}/archivos/${id}/restaurar`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
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
      const res = await fetchConAuth(`${window.OCID_API_BASE}/archivos/${id}/permanente`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      archivosEliminados = archivosEliminados.filter(a => Number(a.id) !== Number(id));
      renderizarContenidoActual();
      mostrarToast('Archivo eliminado permanentemente.');
    } catch (e) {
      mostrarToast('No se pudo eliminar el archivo.', true);
    }
  };

  window.restaurarAnuncio = async function (id) {
    try {
      const res = await fetchConAuth(`${window.OCID_API_BASE}/anuncios/${id}/restaurar`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
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
      const res = await fetchConAuth(`${window.OCID_API_BASE}/anuncios/${id}/permanente`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
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