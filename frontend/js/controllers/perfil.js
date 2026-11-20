/* Controlador de la vista perfil. */
/* ==========================================================================
   Lógica de Configuración y Perfil - OCID
   Limpieza aplicada: estilos de iniciales definidos por clase, no en línea.
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
  if (etiquetaRol) {
    etiquetaRol.textContent = window.OCID.obtenerEtiquetaRolUsuario(usuario);
  }
  if (nombre && avatar) {
    const iniciales = nombre.split(/\s+/)
      .slice(0, 2)
      .map(parte => parte.charAt(0))
      .join('')
      .toUpperCase();
    avatar.textContent = iniciales;
    avatar.classList.add('avatar_iniciales');
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
  configurarSalirDepartamento();
});

function obtenerUsuarioSesion() {
  try {
    return JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
  } catch (error) {
    return null;
  }
}

function perfilTieneDepartamento(usuario) {
  const id = Number(usuario && usuario.departamento_id);
  return Number.isSafeInteger(id) && id > 0;
}

function perfilEsJefe(usuario) {
  return Boolean(usuario &&
    (usuario.es_jefe === true || usuario.es_jefe === 't' || usuario.es_jefe === 'true'));
}

async function peticionServidor(ruta, opciones) {
  return window.OCID.apiFetch(ruta, opciones);
}

function configurarSalirDepartamento() {
  const botonAbrir = document.getElementById('boton_salir_departamento');
  const modal = document.getElementById('modal_salir_departamento');
  const botonCerrar = document.getElementById('cerrar_modal_salir_departamento');
  const botonCancelar = document.getElementById('cancelar_salir_departamento');
  const botonConfirmar = document.getElementById('confirmar_salir_departamento');
  if (!botonAbrir || !modal || !botonConfirmar) return;

  const cerrar = () => {
    if (modal.hidden || modal.classList.contains('modal_cerrando')) return;
    modal.classList.add('modal_cerrando');
    modal.classList.remove('visible');
    window.setTimeout(() => {
      modal.hidden = true;
      modal.classList.remove('modal_cerrando');
      botonAbrir.focus();
    }, 300);
  };
  modal.__ocidCerrar = cerrar;

  botonAbrir.addEventListener('click', () => {
    const usuario = obtenerUsuarioSesion();
    if (!usuario || !perfilTieneDepartamento(usuario) || perfilEsJefe(usuario)) return;
    modal.hidden = false;
    window.OCID.prepararAperturaModal(modal);
    window.requestAnimationFrame(() => modal.classList.add('visible'));
    botonCancelar?.focus();
  });
  if (botonCerrar) botonCerrar.addEventListener('click', cerrar);
  if (botonCancelar) botonCancelar.addEventListener('click', cerrar);
  modal.addEventListener('click', evento => {
    if (evento.target === modal) cerrar();
  });

  botonConfirmar.addEventListener('click', async () => {
    const usuario = obtenerUsuarioSesion();
    if (!usuario || !usuario.id || !perfilTieneDepartamento(usuario)) {
      mostrarAviso('No tienes un departamento asignado para salir.', true);
      return;
    }
    if (perfilEsJefe(usuario)) {
      mostrarAviso('El jefe debe transferir la propiedad antes de salir del departamento.', true);
      return;
    }

    botonConfirmar.disabled = true;
    try {
      const resultado = await peticionServidor(
        `/usuarios/${encodeURIComponent(usuario.id)}/salir-departamento`,
        { method: 'PATCH' }
      );
      if (!resultado.success || !resultado.usuario) {
        throw new Error(resultado.error || 'No se pudo salir del departamento.');
      }
      window.OCID.guardarSesion({ ...usuario, ...resultado.usuario });
      window.location.href = 'bienvenida.html';
    } catch (error) {
      mostrarAviso(error.message || 'No se pudo salir del departamento.', true);
      botonConfirmar.disabled = false;
    }
  });
}

// Sistema de avisos insertado exactamente debajo de la cabecera ("Administra tu cuenta...")
function mostrarAviso(mensaje, esError = true) {
  window.OCID.mostrarToast(mensaje, esError ? 'error' : 'exito');
}

// Cargar campos de perfil y selector de departamentos
async function cargarDatosPerfil() {
  const usuario = obtenerUsuarioSesion();
  if (!usuario) return;

  const campoNombre = document.getElementById('campo_nombre_completo');
  const campoCorreo = document.getElementById('campo_correo_electronico');
  const campoDepartamento = document.getElementById('campo_departamento');
  const botonSalirDepartamento = document.getElementById('boton_salir_departamento');

  if (campoNombre) campoNombre.value = usuario.nombre || '';
  if (campoCorreo) campoCorreo.value = usuario.correo || '';
  if (campoDepartamento) {
    campoDepartamento.value = usuario.departamento_nombre ||
      (usuario.departamento_objeto && usuario.departamento_objeto.nombre) ||
      (typeof usuario.departamento === 'string' ? usuario.departamento : 'Sin departamento');
    campoDepartamento.disabled = true;
  }
  if (botonSalirDepartamento) {
    botonSalirDepartamento.hidden = !perfilTieneDepartamento(usuario) || perfilEsJefe(usuario);
  }

  try {
    const departamentos = await peticionServidor('/departamentos');
    if (campoDepartamento && Array.isArray(departamentos)) {
      const departamentoActual = departamentos.find(dep =>
        Number(dep.id) === Number(usuario.departamento_id)
      );
      campoDepartamento.value = departamentoActual
        ? departamentoActual.nombre
        : 'Sin departamento';
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

    if (nombre === (usuario.nombre || '') && correo === (usuario.correo || '')) {
      mostrarAviso('No se realizaron cambios porque los datos son exactamente iguales.', true);
      return;
    }

    try {
      const respuesta = await peticionServidor(`/usuarios/${encodeURIComponent(usuario.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, correo })
      });

      const usuarioActualizado = { ...usuario, ...respuesta.usuario };
      localStorage.setItem('usuario_ocid', JSON.stringify(usuarioActualizado));

      const etiquetaNombre = document.getElementById('nombreUsuario');
      const etiquetaRol = document.getElementById('etiqueta_rol_usuario');
      if (etiquetaNombre) etiquetaNombre.textContent = usuarioActualizado.nombre;
      if (etiquetaRol) etiquetaRol.textContent = window.OCID.obtenerEtiquetaRolUsuario(usuarioActualizado);
      if (document.getElementById('campo_departamento')) {
        document.getElementById('campo_departamento').value =
          usuarioActualizado.departamento_nombre ||
          (usuarioActualizado.departamento_objeto && usuarioActualizado.departamento_objeto.nombre) ||
          'Sin departamento';
      }

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

      formContrasena.reset();
      window.OCID.limpiarSesion();
      sessionStorage.setItem('ocid_password_changed', 'true');
      window.location.href = 'login.html';
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