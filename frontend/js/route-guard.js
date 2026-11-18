(function () {
  'use strict';

  const rutaActual = window.location.pathname.toLowerCase();
  const paginaActual = rutaActual.split('/').pop();
  const paginaBienvenida = paginaActual === 'bienvenida.html';
  const paginaCrearDepartamento = paginaActual === 'crear-departamento.html';
  const paginasPublicas = ['index.html', 'login.html', 'registro.html'];
  if (paginasPublicas.includes(paginaActual)) return;

  const rutaBase = document.currentScript?.dataset.routePrefix || '';
  let token;
  let usuario;

  try {
    token = localStorage.getItem('token_ocid');
    const usuarioGuardado = localStorage.getItem('usuario_ocid');
    usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : null;
  } catch (error) {
    console.error('No se pudo validar la sesión local:', error);
    if (!paginaBienvenida) window.location.href = `${rutaBase}login.html`;
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
    if (!paginaBienvenida) window.location.href = `${rutaBase}login.html`;
    return;
  }

  const departamentoId = usuario.departamento_id;
  const tieneDepartamento = departamentoId !== null &&
    departamentoId !== undefined &&
    String(departamentoId).trim() !== '' &&
    Number.isFinite(Number(departamentoId)) &&
    Number(departamentoId) > 0;

  if (paginaBienvenida) {
    if (tieneDepartamento) window.location.href = `${rutaBase}inicio.html`;
    return;
  }

  if (!tieneDepartamento && !paginaCrearDepartamento) {
    window.location.href = `${rutaBase}bienvenida.html`;
  }
})();
