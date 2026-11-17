/* ==========================================================================
   Lógica de Configuración y Perfil - OCID
   ========================================================================== */


// Inicialización global de la interfaz, sesión y menú móvil
document.addEventListener('DOMContentLoaded', () => {
  const barraSuperior = document.querySelector('.barra_superior');
  const barraLateral = document.querySelector('.barra_lateral');

  if (!barraSuperior || !barraLateral) return;

  let usuario = null;
  try {
    usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
  } catch (error) {
    console.error('Error al leer la sesión:', error);
    localStorage.removeItem('usuario_ocid');
  }

  // Cargar datos de usuario en la barra superior
  const nombre = usuario && (usuario.nombre || usuario.correo);
  const etiquetaNombre = document.getElementById('nombreUsuario') || document.querySelector('.nombre_usuario, .nombre_perfil');
  const etiquetaRol = document.getElementById('etiqueta_rol_usuario') || document.querySelector('.rol_usuario, .cargo_perfil');
  const avatar = document.getElementById('avatar_usuario_circulo') || document.querySelector('.avatar_usuario, .avatar_perfil');

  if (nombre && etiquetaNombre) {
    etiquetaNombre.textContent = nombre;
  }
  if (usuario && usuario.rol && etiquetaRol) {
    etiquetaRol.textContent = usuario.rol;
  }
  if (nombre && avatar) {
    const iniciales = nombre.split(/\s+/)
      .slice(0, 2)
      .map(parte => parte.charAt(0))
      .join('')
      .toUpperCase();
    avatar.textContent = iniciales;
    avatar.style.fontSize = '14px';
    avatar.style.fontWeight = '700';
  }

  // Notificaciones de la barra superior
  if (usuario && usuario.id) {
    window.OCID.apiFetch(`/notificaciones?usuario_id=${encodeURIComponent(usuario.id)}`)
      .then(datos => {
        const noLeidas = Array.isArray(datos) ? datos.filter(n => !n.leida).length : 0;
        const indicador = document.getElementById('indicador_notificaciones') || document.querySelector('.insignia_notificacion');
        if (indicador) {
          indicador.textContent = noLeidas;
          indicador.style.display = noLeidas === 0 ? 'none' : '';
        }
      })
      .catch(error => console.error('Error al cargar notificaciones:', error));
  }

  // Cerrar sesión
  barraLateral.querySelectorAll('a[href="#"]').forEach(enlace => {
    if (enlace.textContent.toLowerCase().includes('cerrar sesión')) {
      enlace.href = 'login.html';
      enlace.addEventListener('click', evento => {
        evento.preventDefault();
        localStorage.removeItem('usuario_ocid');
        window.location.href = 'login.html';
      });
    }
  });

  // Cargar datos de perfil y departamentos al iniciar
  cargarDatosPerfil();
});

function obtenerUsuarioSesion() {
  try {
    return JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
  } catch (error) {
    return null;
  }
}

async function peticionServidor(ruta, opciones) {
  return window.OCID.apiFetch(ruta, opciones);
}

// Sistema de avisos insertado exactamente debajo de la cabecera ("Administra tu cuenta...")
function mostrarAviso(mensaje, esError = true) {
  let aviso = document.getElementById('aviso_configuracion');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'aviso_configuracion';
    aviso.setAttribute('role', 'alert');
    
    // Buscar la cabecera de la página para colocarlo justo abajo
    const cabeceraPagina = document.querySelector('.cabecera_pagina');
    if (cabeceraPagina) {
      cabeceraPagina.after(aviso);
    } else {
      const contenedorPrincipal = document.querySelector('.contenido_principal');
      if (contenedorPrincipal) contenedorPrincipal.prepend(aviso);
    }
  }

  // Limpiar temporizador anterior para reiniciar los 7 segundos correctamente
  if (window.temporizadorAviso) {
    clearTimeout(window.temporizadorAviso);
    window.temporizadorAviso = null;
  }

  if (esError) {
    aviso.className = 'aviso_docentes aviso_docentes_error';
  } else {
    aviso.className = 'aviso_docentes aviso_docentes_exito';
  }

  aviso.textContent = mensaje;
  aviso.style.display = 'flex';
  aviso.hidden = false;

  window.temporizadorAviso = setTimeout(() => {
    aviso.hidden = true;
    aviso.style.display = 'none';
  }, 7000);
}

// Cargar campos de perfil y selector de departamentos
async function cargarDatosPerfil() {
  const usuario = obtenerUsuarioSesion();
  if (!usuario) return;

  const campoNombre = document.getElementById('campo_nombre_completo');
  const campoCorreo = document.getElementById('campo_correo_electronico');
  const campoRol = document.getElementById('campo_rol_usuario');
  const selectorDepartamento = document.getElementById('campo_departamento');

  if (campoNombre) campoNombre.value = usuario.nombre || '';
  if (campoCorreo) campoCorreo.value = usuario.correo || '';
  if (campoRol) campoRol.value = usuario.rol || '';

  try {
    const departamentos = await peticionServidor('/departamentos');
    if (selectorDepartamento && Array.isArray(departamentos)) {
      selectorDepartamento.replaceChildren(new Option('Sin departamento', ''));
      departamentos.forEach(dep => {
        selectorDepartamento.add(new Option(dep.nombre, dep.id));
      });
      selectorDepartamento.value = usuario.departamento_id ? String(usuario.departamento_id) : '';
    }
  } catch (error) {
    console.error('Error al cargar departamentos:', error);
  }
}

// Actualizar Perfil con estricta validación de cambios idénticos
const formPerfil = document.getElementById('formulario_datos_perfil');
if (formPerfil) {
  formPerfil.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = obtenerUsuarioSesion();
    if (!usuario || !usuario.id) {
      mostrarAviso('Inicia sesión para actualizar tu perfil.', true);
      return;
    }

    const nombre = document.getElementById('campo_nombre_completo').value.trim();
    const correo = document.getElementById('campo_correo_electronico').value.trim();
    const departamento_id = document.getElementById('campo_departamento').value || null;
    const campoRol = document.getElementById('campo_rol_usuario');
    const rol = campoRol ? campoRol.value.trim() : (usuario.rol || '');

    // Validar si los campos son exactamente iguales a los almacenados
    const deptoActualStr = usuario.departamento_id ? String(usuario.departamento_id) : '';
    const deptoNuevoStr = departamento_id ? String(departamento_id) : '';

    if (
      nombre === (usuario.nombre || '') &&
      correo === (usuario.correo || '') &&
      deptoNuevoStr === deptoActualStr &&
      rol === (usuario.rol || '')
    ) {
      mostrarAviso('No se realizaron cambios porque los datos son exactamente iguales.', true);
      return;
    }

    try {
      const respuesta = await peticionServidor(`/usuarios/${encodeURIComponent(usuario.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, correo, departamento_id, rol })
      });

      const usuarioActualizado = { ...usuario, ...respuesta.usuario };
      localStorage.setItem('usuario_ocid', JSON.stringify(usuarioActualizado));

      const etiquetaNombre = document.getElementById('nombreUsuario');
      const etiquetaRol = document.getElementById('etiqueta_rol_usuario');
      if (etiquetaNombre) etiquetaNombre.textContent = usuarioActualizado.nombre;
      if (etiquetaRol) etiquetaRol.textContent = usuarioActualizado.rol;

      // Aviso verde de éxito que se oculta a los 7 segundos
      mostrarAviso('Perfil actualizado correctamente.', false);
    } catch (error) {
      mostrarAviso(error.message, true);
    }
  });
}

// Cambiar Contraseña
const formContrasena = document.getElementById('formulario_contrasena');
if (formContrasena) {
  formContrasena.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = obtenerUsuarioSesion();
    const password_actual = document.getElementById('campo_clave_actual').value;
    const password_nueva = document.getElementById('campo_clave_nueva').value;
    const claveConfirmacion = document.getElementById('campo_clave_confirmacion').value;

    if (!usuario || !usuario.id) {
      mostrarAviso('Inicia sesión para cambiar tu contraseña.', true);
      return;
    }
    if (password_nueva !== claveConfirmacion) {
      mostrarAviso('Las nuevas contraseñas no coinciden.', true);
      return;
    }
    if (password_nueva.length < 6) {
      mostrarAviso('La contraseña debe tener al menos 6 caracteres.', true);
      return;
    }

    try {
      await peticionServidor(`/usuarios/${encodeURIComponent(usuario.id)}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password_actual, password_nueva })
      });

      mostrarAviso('Contraseña actualizada correctamente.', false);
      formContrasena.reset();
    } catch (error) {
      let mensaje = error.message;
      if (mensaje.toLowerCase().includes('actual es incorrecta') || mensaje.toLowerCase().includes('password')) {
        mensaje = 'La contraseña actual no es correcta';
      }
      mostrarAviso(mensaje, true);
    }
  });
}

// Preferencias de Toggles locales
const switches = ['toggle_sistema', 'toggle_tareas', 'toggle_anuncios'];
let preferencias = {};
try {
  preferencias = JSON.parse(localStorage.getItem('preferencias_ocid') || '{}');
} catch (e) {
  preferencias = {};
}

switches.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof preferencias[id] === 'boolean') el.checked = preferencias[id];
  el.addEventListener('change', () => {
    preferencias[id] = el.checked;
    localStorage.setItem('preferencias_ocid', JSON.stringify(preferencias));
    mostrarAviso('Preferencia guardada.', false);
  });
});