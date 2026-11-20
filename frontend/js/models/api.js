/* Modelo de API: configuracion base y peticiones autenticadas. */
(function () {
  'use strict';

  const API_BASE = 'https://ocid.onrender.com';

  async function apiFetch(path, opciones = {}) {
    const token = window.OCID.obtenerToken();
    if (!token) throw new Error('Inicia sesión para continuar.');

    const headers = new Headers(opciones.headers || {});
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    
    let respuesta;
    try {
      respuesta = await fetch(`${API_BASE}${path}`, { ...opciones, headers });
    } catch (error) {
      throw new Error('No se pudo conectar con el servidor.');
    }

    let datos;
    const ct = respuesta.headers.get('content-type') || '';
    if (ct.includes('application/json')) datos = await respuesta.json();
    else { const t = await respuesta.text(); datos = t ? { message: t } : {}; }
    
    if (respuesta.status === 401 || respuesta.status === 403) {
      window.OCID.limpiarSesion();
      window.location.href = 'login.html';
      throw new Error('Sesión expirada o no autorizada.');
    }

    if (!respuesta.ok) throw new Error(datos.error || datos.message || `Error HTTP ${respuesta.status}`);
    return datos;
  }

  async function apiPublico(path, opciones = {}) {
    const headers = new Headers(opciones.headers || {});
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = window.OCID.obtenerToken();
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    let respuesta;
    try {
      respuesta = await fetch(`${API_BASE}${path}`, { ...opciones, headers });
    } catch (error) {
      throw new Error('No se pudo conectar con el servidor.');
    }

    let datos;
    const ct = respuesta.headers.get('content-type') || '';
    if (ct.includes('application/json')) datos = await respuesta.json();
    else { const t = await respuesta.text(); datos = t ? { message: t } : {}; }
    if (!respuesta.ok) throw new Error(datos.error || datos.message || `Error HTTP ${respuesta.status}`);
    return datos;
  }

  window.OCID = window.OCID || {};
  Object.assign(window.OCID, { API_BASE, apiFetch, apiPublico });
})();
