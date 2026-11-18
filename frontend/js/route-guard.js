(function () {
  'use strict';

  const rutaActual = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  const paginaActual = rutaActual.split('/').pop() || 'index.html';
  const rutaBase = document.currentScript?.dataset.routePrefix || '';
  const paginaIndex = paginaActual === 'index.html';
  const paginaBienvenida = paginaActual === 'bienvenida.html';
  const paginaCrearDepartamento = paginaActual === 'crear-departamento.html';
  const paginasPublicas = ['index.html', 'login.html', 'registro.html', 'bienvenida.html'];
  let token;
  let usuario;

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

  const departamentoId = usuario.departamento_id;
  const tieneDepartamento = departamentoId !== null &&
    departamentoId !== undefined &&
    String(departamentoId).trim() !== '' &&
    Number.isFinite(Number(departamentoId)) &&
    Number(departamentoId) > 0;

  if (paginaIndex) {
    window.location.href = tieneDepartamento
      ? `${rutaBase}inicio.html`
      : `${rutaBase}bienvenida.html`;
    return;
  }

  if (paginaActual === 'login.html' || paginaActual === 'registro.html') return;

  if (paginaBienvenida) {
    if (tieneDepartamento) window.location.href = `${rutaBase}inicio.html`;
    return;
  }

  if (tieneDepartamento && paginaCrearDepartamento) {
    window.location.href = `${rutaBase}inicio.html`;
    return;
  }

  if (!tieneDepartamento && !paginaCrearDepartamento) {
    window.location.href = `${rutaBase}bienvenida.html`;
  }
})();
