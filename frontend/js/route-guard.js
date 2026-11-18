(function () {
  'use strict';

  const rutaActual = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  const paginaActual = rutaActual.split('/').pop() || 'index.html';
  const scriptActual = document.currentScript;
  const rutaBase = scriptActual ? scriptActual.dataset.routePrefix || '' : '';
  const paginaIndex = paginaActual === 'index.html';
  const paginaBienvenida = paginaActual === 'bienvenida.html';
  const paginaCrearDepartamento = paginaActual === 'crear-departamento.html';
  const paginasPublicas = ['index.html', 'login.html', 'registro.html', 'bienvenida.html'];

  function enrutar(usuario) {
    const tieneDepartamento = window.OCID.tieneDepartamentoAsignado(usuario);

    if (paginaIndex) {
      window.location.href = tieneDepartamento
        ? `${rutaBase}inicio.html`
        : `${rutaBase}bienvenida.html`;
      return true;
    }

    if (paginaActual === 'login.html' || paginaActual === 'registro.html') {
      window.location.replace(tieneDepartamento
        ? `${rutaBase}inicio.html`
        : `${rutaBase}bienvenida.html`);
      return true;
    }

    if (paginaBienvenida) {
      if (tieneDepartamento) {
        window.location.href = `${rutaBase}inicio.html`;
        return true;
      }
      return false;
    }

    if (tieneDepartamento && paginaCrearDepartamento) {
      window.location.href = `${rutaBase}inicio.html`;
      return true;
    }

    if (!tieneDepartamento && !paginaCrearDepartamento) {
      window.location.href = `${rutaBase}bienvenida.html`;
      return true;
    }
    return false;
  }

  function perfilCambioEstadoDepartamento(usuarioAnterior, usuarioActualizado) {
    return ['departamento_id', 'es_jefe', 'rol', 'departamento', 'departamento_nombre']
      .some(campo => String(usuarioAnterior[campo] ?? '') !== String(usuarioActualizado[campo] ?? ''));
  }

  async function protegerRuta() {
    let usuario;
    let token;
    try {
      const usuarioGuardado = localStorage.getItem('usuario_ocid');
      usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : null;
      token = localStorage.getItem('token_ocid') ||
        (usuario && typeof usuario.token === 'string' ? usuario.token : null);
    } catch (error) {
      console.error('No se pudo validar la sesión local:', error);
      if (!paginasPublicas.includes(paginaActual)) window.location.href = `${rutaBase}login.html`;
      return;
    }

    const sesionValida = Boolean(
      token &&
      usuario &&
      typeof usuario === 'object' &&
      !Array.isArray(usuario) &&
      usuario.id
    );
    if (!sesionValida) {
      if (!paginasPublicas.includes(paginaActual)) window.location.href = `${rutaBase}login.html`;
      return;
    }

    if (!window.OCID || typeof window.OCID.sincronizarPerfil !== 'function') {
      console.error('No se pudo sincronizar la sesión: OCID Core no está disponible.');
      return;
    }

    try {
      const usuarioAnterior = usuario;
      usuario = await window.OCID.sincronizarPerfil();
      const redirigido = enrutar(usuario);
      if (!redirigido && perfilCambioEstadoDepartamento(usuarioAnterior, usuario)) {
        window.location.reload();
      }
    } catch (error) {
      console.error('No se pudo verificar el perfil antes de aplicar la ruta:', error);
      window.OCID.mostrarToast('No se pudo verificar tu sesión. Comprueba tu conexión e inténtalo de nuevo.', 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', protegerRuta, { once: true });
  } else {
    protegerRuta();
  }
})();
