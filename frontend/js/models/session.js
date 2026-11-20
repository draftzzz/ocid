/* Modelo de sesion: almacenamiento local y perfil del usuario. */
(function () {
  'use strict';

  const TOKEN_KEY = 'token_ocid';
  const USER_KEY = 'usuario_ocid';

  function obtenerUsuarioSesion() {
    try {
      const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      return u && u.id ? u : null;
    } catch (e) {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }

  function obtenerToken() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;

    try {
      const usuario = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      return usuario && usuario.token ? usuario.token : null;
    } catch (error) {
      return null;
    }
  }

  function tieneDepartamentoAsignado(usuario) {
    const departamentoId = usuario && usuario.departamento_id;
    if (departamentoId === null || departamentoId === undefined || String(departamentoId).trim() === '') {
      return false;
    }

    const idNumerico = Number(departamentoId);
    return Number.isFinite(idNumerico) && idNumerico > 0;
  }

  function obtenerEtiquetaRolUsuario(usuario) {
    if (!tieneDepartamentoAsignado(usuario) || typeof usuario.rol !== 'string') {
      return 'Sin departamento';
    }

    const rol = usuario.rol.trim();
    const rolesValidos = [
      'docente', 'jefe', 'jefe de departamento', 'administrador',
      'administrador general'
    ];
    return rolesValidos.includes(rol.toLocaleLowerCase('es-MX')) ||
      usuario.rol_personalizado_valido === true
      ? rol
      : 'Sin departamento';
  }

  function guardarSesion(usuario, tokenJwt = null) {
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
    const tokenFinal = tokenJwt || usuario.token;
    if (tokenFinal) {
      localStorage.setItem(TOKEN_KEY, tokenFinal);
    }
  }

  function limpiarSesion() {
    localStorage.clear();
    sessionStorage.clear();
  }

  async function sincronizarPerfil() {
    const usuarioLocal = obtenerUsuarioSesion();
    if (!usuarioLocal || !obtenerToken()) {
      throw new Error('No hay una sesión válida para sincronizar.');
    }

    const datos = await window.OCID.apiFetch('/perfil');
    if (!datos.success || !datos.usuario ||
        Number(datos.usuario.id) !== Number(usuarioLocal.id)) {
      throw new Error(datos.error || 'El servidor no devolvió un perfil válido.');
    }

    const usuarioActualizado = { ...usuarioLocal, ...datos.usuario };
    guardarSesion(usuarioActualizado, datos.token);
    return usuarioActualizado;
  }

  window.OCID = window.OCID || {};
  Object.assign(window.OCID, {
    obtenerUsuarioSesion,
    obtenerToken,
    tieneDepartamentoAsignado,
    obtenerEtiquetaRolUsuario,
    guardarSesion,
    sincronizarPerfil,
    limpiarSesion,
  });
})();
