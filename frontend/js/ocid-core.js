/* ==========================================================================
   OCID — Core Module Compartido (Auth, API, UI helpers, Toast)
   Se carga en TODAS las páginas del sistema. Sin innerHTML.
   ========================================================================== */

(function () {
  'use strict';

  const API_BASE = 'https://ocid.onrender.com';
  const TOKEN_KEY = 'token_ocid';
  const USER_KEY = 'usuario_ocid';

  function crearElemento(tag, opciones = {}) {
    const el = document.createElement(tag);
    if (opciones.className) el.className = opciones.className;
    if (opciones.id) el.id = opciones.id;
    if (opciones.textContent) el.textContent = opciones.textContent;
    if (opciones.htmlFor) el.htmlFor = opciones.htmlFor;
    if (opciones.href) el.href = opciones.href;
    if (opciones.src) el.src = opciones.src;
    if (opciones.type) el.type = opciones.type;
    if (opciones.required !== undefined) el.required = opciones.required;
    if (opciones.placeholder) el.placeholder = opciones.placeholder;
    if (opciones.disabled !== undefined) el.disabled = opciones.disabled;
    if (opciones.value !== undefined) el.value = opciones.value;
    if (opciones.onclick) el.addEventListener('click', opciones.onclick);
    if (opciones.oninput) el.addEventListener('input', opciones.oninput);
    if (opciones.attributes) {
      Object.entries(opciones.attributes).forEach(([k, v]) => el.setAttribute(k, v));
    }
    return el;
  }

  function escaparHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
  }

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

  function guardarSesion(usuario, tokenJwt = null) {
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
    const tokenFinal = tokenJwt || usuario.token;
    if (tokenFinal) {
      localStorage.setItem(TOKEN_KEY, tokenFinal);
    }
  }

  function limpiarSesion() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('ocid_token');
    sessionStorage.clear();
  }

  async function apiFetch(path, opciones = {}) {
    const token = obtenerToken();
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
      limpiarSesion();
      window.location.href = 'login.html';
      throw new Error('Sesión expirada o no autorizada.');
    }

    if (!respuesta.ok) throw new Error(datos.error || datos.message || `Error HTTP ${respuesta.status}`);
    return datos;
  }

  async function apiPublico(path, opciones = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
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

  function mostrarToast(texto, esError = false, duracion = 3500) {
    let contenedor = document.getElementById('contenedor_toast');
    if (!contenedor) {
      contenedor = crearElemento('div', { id: 'contenedor_toast', className: 'contenedor_toast_flotante' });
      document.body.appendChild(contenedor);
    }
    const toast = crearElemento('div', { className: `toast ${esError ? 'error' : 'exito'} visible` });
    const icono = crearElemento('i', { className: `fa-solid ${esError ? 'fa-circle-exclamation' : 'fa-circle-check'}`, attributes: { 'aria-hidden': 'true' } });
    icono.style.color = esError ? '#dc2626' : '#16a34a';
    const textoEl = crearElemento('span', { textContent: texto });
    toast.appendChild(icono);
    toast.appendChild(textoEl);
    contenedor.appendChild(toast);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, duracion);
  }

  function configurarCierreSesion() {
    document.querySelectorAll('#boton_cerrar_sesion, .boton_cerrar_sesion').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        limpiarSesion();
        window.location.href = 'login.html';
      });
    });
  }

  function actualizarCabeceraUsuario() {
    const usuario = obtenerUsuarioSesion();
    const nombreEl = document.getElementById('nombreUsuario');
    const rolEl = document.getElementById('etiqueta_rol_usuario');
    const avatarEl = document.getElementById('avatar_usuario_circulo');
    if (usuario) {
      if (nombreEl) nombreEl.textContent = usuario.nombre || usuario.correo || 'Usuario';
      if (rolEl) rolEl.textContent = usuario.rol || 'Docente';
      if (avatarEl && (usuario.nombre || usuario.correo)) {
        const iniciales = (usuario.nombre || usuario.correo).split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase();
        avatarEl.textContent = iniciales;
      }
    } else {
      if (nombreEl) nombreEl.textContent = 'Invitado';
      if (rolEl) rolEl.textContent = '';
    }
  }

  function configurarMenuMovil() {
    const barraSuperior = document.querySelector('.barra_superior');
    const barraLateral = document.querySelector('.barra_lateral');
    if (!barraSuperior || !barraLateral) return;
    let btnMenu = barraSuperior.querySelector('.boton_menu_hamburguesa');
    if (!btnMenu) {
      btnMenu = crearElemento('button', {
        type: 'button', className: 'boton_menu_hamburguesa',
        attributes: { 'aria-label': 'Abrir menú de navegación', 'aria-expanded': 'false' },
        textContent: '',
      });
      btnMenu.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
      const seccionIzq = barraSuperior.querySelector('.seccion_superior_izquierda') || barraSuperior;
      seccionIzq.prepend(btnMenu);
    }
    if (btnMenu.dataset.ocidMenuConfigured === 'true') return;
    btnMenu.dataset.ocidMenuConfigured = 'true';
    btnMenu.type = 'button';
    btnMenu.setAttribute('aria-label', 'Abrir menú de navegación');
    btnMenu.setAttribute('aria-expanded', 'false');
    btnMenu.title = 'Abrir menú de navegación';
    btnMenu.innerHTML = '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
    if (!barraLateral.id) barraLateral.id = 'barra_lateral_principal';
    btnMenu.setAttribute('aria-controls', barraLateral.id);

    let fondo = document.querySelector('.fondo_menu_movil');
    if (!fondo) {
      fondo = crearElemento('button', { type: 'button', className: 'fondo_menu_movil', attributes: { 'aria-label': 'Cerrar menú de navegación' } });
      document.body.appendChild(fondo);
    } else if (fondo.tagName !== 'BUTTON') {
      const botonFondo = crearElemento('button', {
        type: 'button',
        className: 'fondo_menu_movil',
        attributes: { 'aria-label': 'Cerrar menú de navegación' },
      });
      fondo.replaceWith(botonFondo);
      fondo = botonFondo;
    }
    fondo.type = 'button';
    fondo.setAttribute('aria-label', 'Cerrar menú de navegación');
    function alternar(abierto) {
      document.body.classList.toggle('menu_movil_abierto', abierto);
      barraLateral.classList.toggle('activo', abierto);
      fondo.classList.toggle('activo', abierto);
      btnMenu.setAttribute('aria-expanded', String(abierto));
    }
    btnMenu.addEventListener('click', () => alternar(!document.body.classList.contains('menu_movil_abierto')));
    fondo.addEventListener('click', () => alternar(false));
    barraLateral.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => alternar(false)));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') alternar(false); });
  }

  function iniciarNavegacionCompartida() {
    actualizarCabeceraUsuario();
    configurarMenuMovil();
  }

  function actualizarContadorNotificaciones() {
    const usuario = obtenerUsuarioSesion();
    if (!usuario || !usuario.id) return;
    apiFetch(`/notificaciones?usuario_id=${encodeURIComponent(usuario.id)}`)
      .then((datos) => {
        const lista = datos.notificaciones || datos;
        const noLeidas = Array.isArray(lista) ? lista.filter((n) => !n.leida).length : 0;
        document.querySelectorAll('.insignia_notificacion, #indicador_notificaciones, .badge_campana').forEach((insignia) => {
          insignia.textContent = noLeidas;
          insignia.style.display = noLeidas === 0 ? 'none' : '';
        });
      })
      .catch(() => {});
  }

  window.OCID = {
    API_BASE,
    obtenerUsuarioSesion,
    obtenerToken,
    guardarSesion,
    limpiarSesion,
    apiFetch,
    apiPublico,
    mostrarToast,
    crearElemento,
    escaparHTML,
    configurarCierreSesion,
    actualizarCabeceraUsuario,
    configurarMenuMovil,
    actualizarContadorNotificaciones,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarNavegacionCompartida);
  } else {
    iniciarNavegacionCompartida();
  }
})();