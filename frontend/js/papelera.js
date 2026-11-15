/* ==========================================================================
   Lógica de Papelera de Reciclaje - OCID
   ========================================================================== */
(function () {
  window.OCID_API_BASE = 'https://ocid.onrender.com';

  function obtenerToken() {
    try {
      const u = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
      return u && u.token ? u.token : null;
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
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...opciones, headers });
  }

  function iniciarInterfaz() {
    const barraSuperior = document.querySelector('.barra_superior');
    const barraLateral = document.querySelector('.barra_lateral');

    if (!barraSuperior || !barraLateral) return;

    let usuario = null;
    try {
      usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (error) {
      console.error('No se pudieron leer los datos de sesión:', error);
      localStorage.removeItem('usuario_ocid');
    }

    const nombre = usuario && (usuario.nombre || usuario.correo || usuario.usuario);
    const rol = usuario && (usuario.rol || usuario.tipo || 'Jefe de Departamento');

    const etiquetaNombre = document.getElementById('nombreUsuario');
    const etiquetaRol = document.getElementById('etiqueta_rol_usuario');
    const avatar = document.getElementById('avatar_usuario_circulo');

    if (etiquetaNombre && nombre) {
      etiquetaNombre.textContent = nombre;
    }
    if (etiquetaRol) {
      etiquetaRol.textContent = rol;
    }
    if (avatar && nombre) {
      const iniciales = nombre.split(/\s+/)
        .slice(0, 2)
        .map(parte => parte.charAt(0))
        .join('')
        .toUpperCase();
      avatar.textContent = iniciales;
      avatar.style.fontSize = '14px';
      avatar.style.fontWeight = '700';
      avatar.style.display = 'flex';
      avatar.style.alignItems = 'center';
      avatar.style.justifyContent = 'center';
      avatar.style.color = '#ffffff';
      avatar.style.backgroundColor = '#2563eb';
    }

    // Contador de notificaciones en la barra superior
    if (usuario && usuario.id) {
      fetchConAuth(`${window.OCID_API_BASE}/notificaciones?usuario_id=${encodeURIComponent(usuario.id)}`)
        .then(async respuesta => {
          const datos = await respuesta.json();
          if (!respuesta.ok) throw new Error(datos.error || 'No se pudieron cargar las notificaciones');
          const noLeidas = Array.isArray(datos.notificaciones) ? datos.notificaciones.filter(n => !n.leida).length : 0;
          document.querySelectorAll('.punto_notificacion, .insignia_notificacion').forEach(insignia => {
            insignia.textContent = noLeidas;
            insignia.style.display = noLeidas === 0 ? 'none' : '';
          });
        })
        .catch(error => console.error('Error al actualizar el contador de notificaciones:', error));
    }

    document.querySelectorAll('.boton_notificaciones').forEach(boton => {
      boton.addEventListener('click', () => {
        window.location.href = 'notificaciones.html';
      });
    });

    // Menú hamburguesa responsivo
    const botonHamburguesa = document.querySelector('.boton_menu_hamburguesa');
    if (botonHamburguesa) {
      let fondo = document.querySelector('.fondo_menu_movil');
      if (!fondo) {
        fondo = document.createElement('div');
        fondo.className = 'fondo_menu_movil';
        document.body.appendChild(fondo);
      }

      function cambiarMenu(abierto) {
        document.body.classList.toggle('menu_movil_abierto', abierto);
      }

      botonHamburguesa.addEventListener('click', () => {
        cambiarMenu(!document.body.classList.contains('menu_movil_abierto'));
      });
      fondo.addEventListener('click', () => cambiarMenu(false));
      barraLateral.querySelectorAll('a').forEach(enlace => {
        enlace.addEventListener('click', () => cambiarMenu(false));
      });
    }

    const botonCerrarSesion = document.getElementById('boton_cerrar_sesion');
    if (botonCerrarSesion) {
      botonCerrarSesion.addEventListener('click', evento => {
        evento.preventDefault();
        localStorage.removeItem('usuario_ocid');
        window.location.href = 'login.html';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarInterfaz);
  } else {
    iniciarInterfaz();
  }

  // ==========================================
  // LÓGICA DE LA TABLA DE PAPELERA
  // ==========================================
  document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('cuerpo_tabla_papelera');
    const contador = document.getElementById('contador_elementos_papelera');
    const inputBusqueda = document.getElementById('campo_busqueda_general');
    let archivosEliminados = [];

    function escaparHTML(valor) {
      return String(valor ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
    }

    function mostrarToast(mensaje, esError = false) {
      let toast = document.getElementById('toast_mensaje');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast_mensaje';
        toast.className = 'notificacion_toast';
        toast.innerHTML = `<i class="fa-solid fa-circle-check" id="icono_toast_papelera"></i><span id="texto_toast"></span>`;
        document.body.appendChild(toast);
      }
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

    function renderizarTabla(lista) {
      if (!tbody) return;
      if (contador) {
        contador.textContent = `${lista.length} ${lista.length === 1 ? 'elemento' : 'elementos'}`;
      }

      if (!lista.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="celda_estado_vacio">
              No hay documentos eliminados en la papelera de reciclaje.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = lista.map(archivo => {
        const fechaElim = archivo.fecha_eliminacion
          ? new Date(archivo.fecha_eliminacion).toLocaleDateString('es-MX')
          : 'Reciente';

        return `
          <tr>
            <td>
              <div class="celda_documento">
                <div class="icono_archivo_papelera">
                  <i class="fa-regular fa-file-lines"></i>
                </div>
                <div>
                  <span>${escaparHTML(archivo.nombre)}</span>
                </div>
              </div>
            </td>
            <td>${escaparHTML(archivo.departamento_nombre || 'General')}</td>
            <td>${escaparHTML(archivo.autor_nombre || 'Sistema')}</td>
            <td>${escaparHTML(fechaElim)}</td>
            <td class="columna_centrada">
              <div class="grupo_acciones_papelera">
                <button type="button" class="boton_restaurar" onclick="restaurarDocumento(${archivo.id})">
                  <i class="fa-solid fa-arrow-rotate-left"></i>
                  <span>Restaurar</span>
                </button>
                <button type="button" class="boton_eliminar_definitivo" onclick="eliminarDefinitivamente(${archivo.id})">
                  <i class="fa-regular fa-trash-can"></i>
                  <span>Eliminar</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    async function cargarPapelera() {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="celda_estado_vacio">Cargando documentos eliminados...</td></tr>`;
      }

      try {
        const respuesta = await fetchConAuth(`${window.OCID_API_BASE}/archivos/papelera`);
        const datos = await respuesta.json();

        if (!respuesta.ok) throw new Error(datos.error || 'Error al cargar la papelera');

        archivosEliminados = Array.isArray(datos.archivos) ? datos.archivos : [];
        renderizarTabla(archivosEliminados);
      } catch (error) {
        console.error(error);
        mostrarToast('No se pudieron cargar los documentos eliminados.', true);
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="5" class="celda_estado_vacio">Error al conectar con el servidor.</td></tr>`;
        }
      }
    }

    if (inputBusqueda) {
      inputBusqueda.addEventListener('input', () => {
        const termino = inputBusqueda.value.toLowerCase().trim();
        const filtrados = archivosEliminados.filter(a =>
          (a.nombre || '').toLowerCase().includes(termino) ||
          (a.departamento_nombre || '').toLowerCase().includes(termino)
        );
        renderizarTabla(filtrados);
      });
    }

    window.restaurarDocumento = async function (id) {
      try {
        const respuesta = await fetchConAuth(`${window.OCID_API_BASE}/archivos/${id}/restaurar`, {
          method: 'PUT'
        });
        const datos = await respuesta.json();
        if (!respuesta.ok || !datos.success) throw new Error(datos.error || 'No se pudo restaurar');

        archivosEliminados = archivosEliminados.filter(a => Number(a.id) !== Number(id));
        renderizarTabla(archivosEliminados);
        mostrarToast('Documento restaurado con éxito.');
      } catch (error) {
        console.error(error);
        mostrarToast('No se pudo restaurar el documento.', true);
      }
    };

    window.eliminarDefinitivamente = async function (id) {
      if (!confirm('¿Estás seguro de eliminar este documento permanentemente? Esta acción no se puede deshacer.')) return;

      try {
        const respuesta = await fetchConAuth(`${window.OCID_API_BASE}/archivos/${id}/permanente`, {
          method: 'DELETE'
        });
        const datos = await respuesta.json();
        if (!respuesta.ok || !datos.success) throw new Error(datos.error || 'No se pudo eliminar');

        archivosEliminados = archivosEliminados.filter(a => Number(a.id) !== Number(id));
        renderizarTabla(archivosEliminados);
        mostrarToast('Documento eliminado permanentemente.');
      } catch (error) {
        console.error(error);
        mostrarToast('No se pudo eliminar definitivamente.', true);
      }
    };

    cargarPapelera();
  });
})();