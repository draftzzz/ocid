/* ==========================================================================
   OCID — Core Module Compartido (Auth, API, UI helpers, Toast)
   Se carga en TODAS las páginas del sistema. Sin innerHTML.
   ========================================================================== */

(function () {
  'use strict';

  const API_BASE = 'https://ocid.onrender.com';
  const TOKEN_KEY = 'token_ocid';
  const USER_KEY = 'usuario_ocid';
  let solicitudNotificaciones = null;
  let intervaloNotificaciones = null;

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

  function tieneDepartamentoAsignado(usuario) {
    const departamentoId = usuario && usuario.departamento_id;
    if (departamentoId === null || departamentoId === undefined || String(departamentoId).trim() === '') {
      return false;
    }

    const idNumerico = Number(departamentoId);
    return Number.isFinite(idNumerico) && idNumerico > 0;
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
    const headers = new Headers(opciones.headers || {});
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = obtenerToken();
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

  function mostrarToast(texto, tipo = 'exito', duracion = 3500) {
    const tipoToast = typeof tipo === 'boolean'
      ? (tipo ? 'error' : 'exito')
      : (['exito', 'error', 'advertencia'].includes(tipo) ? tipo : 'exito');
    let contenedor = document.getElementById('contenedor_toast');
    if (!contenedor) {
      contenedor = crearElemento('div', { id: 'contenedor_toast', className: 'contenedor_toast_flotante' });
      document.body.appendChild(contenedor);
    }
    const iconos = {
      exito: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      advertencia: 'fa-triangle-exclamation',
    };
    const toast = crearElemento('div', {
      className: `toast toast_mensaje toast_${tipoToast}`,
      attributes: { role: tipoToast === 'error' ? 'alert' : 'status', 'aria-live': tipoToast === 'error' ? 'assertive' : 'polite' },
    });
    const icono = crearElemento('i', {
      className: `fa-solid ${iconos[tipoToast]} toast_icono`,
      attributes: { 'aria-hidden': 'true' },
    });
    const textoEl = crearElemento('span', { textContent: texto });
    toast.appendChild(icono);
    textoEl.className = 'toast_texto';
    toast.appendChild(textoEl);
    contenedor.appendChild(toast);
    setTimeout(() => toast.classList.add('visible', 'toast_visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible', 'toast_visible');
      setTimeout(() => toast.remove(), 300);
    }, duracion);
  }

  function configurarCierreSesion() {
    document.querySelectorAll('#boton_cerrar_sesion, .boton_cerrar_sesion').forEach((btn) => {
      if (btn.dataset.ocidLogoutConfigured === 'true') return;
      btn.dataset.ocidLogoutConfigured = 'true';
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

  function obtenerBarraSuperiorAplicacion() {
    return Array.from(document.querySelectorAll('.barra_superior')).find((barra) =>
      barra.querySelector('.seccion_superior_derecha, .boton_menu_hamburguesa, .perfil_usuario_barra')
    ) || null;
  }

  function configurarMenuMovil() {
    const barraSuperior = obtenerBarraSuperiorAplicacion();
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
    configurarCampanaGlobal();
    actualizarContadorNotificaciones();
    if (!intervaloNotificaciones && obtenerBarraSuperiorAplicacion()) {
      intervaloNotificaciones = setInterval(() => {
        if (document.visibilityState !== 'hidden') actualizarContadorNotificaciones();
      }, 30000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') actualizarContadorNotificaciones();
      });
    }
  }

  function configurarCampanaGlobal() {
    const barraSuperior = obtenerBarraSuperiorAplicacion();
    if (!barraSuperior) return;

    const seccionDerecha = barraSuperior.querySelector('.seccion_superior_derecha') || barraSuperior;
    let boton = seccionDerecha.querySelector('.boton_campana, .boton_notificaciones');
    if (!boton) {
      boton = crearElemento('button', { type: 'button', className: 'boton_notificaciones boton_campana' });
      seccionDerecha.prepend(boton);
    }

    boton.classList.add('boton_campana');
    boton.type = 'button';
    boton.title = 'Notificaciones';
    boton.setAttribute('aria-label', 'Abrir notificaciones');
    if (!boton.querySelector('i')) {
      boton.prepend(crearElemento('i', {
        className: 'fa-regular fa-bell',
        attributes: { 'aria-hidden': 'true' },
      }));
    }

    let indicador = boton.querySelector('#indicador_notificaciones') ||
      seccionDerecha.querySelector('#indicador_notificaciones');
    if (!indicador) {
      indicador = crearElemento('span', { className: 'punto_notificacion', id: 'indicador_notificaciones' });
    }
    indicador.classList.add('punto_notificacion');
    indicador.setAttribute('aria-live', 'polite');
    indicador.textContent = '0';
    indicador.style.display = 'none';
    if (indicador.parentElement !== boton) boton.appendChild(indicador);

    if (boton.dataset.ocidCampanaConfigured !== 'true') {
      boton.dataset.ocidCampanaConfigured = 'true';
      boton.addEventListener('click', () => {
        window.location.href = 'notificaciones.html';
      });
    }
  }

  function actualizarContadorNotificaciones() {
    const usuario = obtenerUsuarioSesion();
    if (!obtenerBarraSuperiorAplicacion()) return Promise.resolve();
    if (!usuario || !usuario.id || !obtenerToken()) {
      document.querySelectorAll('#indicador_notificaciones').forEach(indicador => {
        indicador.textContent = '0';
        indicador.style.display = 'none';
      });
      return Promise.resolve();
    }
    if (solicitudNotificaciones) return solicitudNotificaciones;

    solicitudNotificaciones = apiFetch('/notificaciones')
      .then((datos) => {
        const lista = Array.isArray(datos)
          ? datos
          : (Array.isArray(datos.notificaciones) ? datos.notificaciones : []);
        const noLeidas = Array.isArray(lista) ? lista.filter((n) => !n.leida).length : 0;
        document.querySelectorAll('#indicador_notificaciones, .badge_campana').forEach((indicador) => {
          indicador.textContent = String(noLeidas);
          indicador.style.display = noLeidas === 0 ? 'none' : '';
        });
        document.querySelectorAll('.boton_campana').forEach((boton) => {
          boton.setAttribute('aria-label', `Notificaciones, ${noLeidas} sin leer`);
        });
      })
      .catch((error) => {
        console.error('Error al actualizar el contador de notificaciones:', error);
      })
      .finally(() => {
        solicitudNotificaciones = null;
      });
    return solicitudNotificaciones;
  }

  window.OCID = {
    API_BASE,
    obtenerUsuarioSesion,
    obtenerToken,
    tieneDepartamentoAsignado,
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
    configurarCampanaGlobal,
    actualizarContadorNotificaciones,
  };

  window.mostrarMensaje = (mensaje, esError = false) => mostrarToast(mensaje, esError);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarNavegacionCompartida);
  } else {
    iniciarNavegacionCompartida();
  }
})();