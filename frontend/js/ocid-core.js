/* ==========================================================================
   OCID — Core Module Compartido (Auth, API, UI helpers, Toast)
   Se carga en TODAS las páginas del sistema. Sin innerHTML.
   Limpieza aplicada: etiquetas visibles y clases en lugar de estilos en línea.
   ========================================================================== */

(function () {
  'use strict';

  const API_BASE = 'https://ocid.onrender.com';
  const TOKEN_KEY = 'token_ocid';
  const USER_KEY = 'usuario_ocid';
  let solicitudNotificaciones = null;
  let intervaloNotificaciones = null;
  // Estado interno de guardas por elemento (sin atributos data-*).
  const elementosBloqueoScrollConfigurados = new WeakSet();
  const botonesLogoutConfigurados = new WeakSet();
  const botonesMenuConfigurados = new WeakSet();
  const botonesCampanaConfigurados = new WeakSet();
  const panelesNotificacionesCargando = new WeakSet();

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

    const datos = await apiFetch('/perfil');
    if (!datos.success || !datos.usuario ||
        Number(datos.usuario.id) !== Number(usuarioLocal.id)) {
      throw new Error(datos.error || 'El servidor no devolvió un perfil válido.');
    }

    const usuarioActualizado = { ...usuarioLocal, ...datos.usuario };
    guardarSesion(usuarioActualizado, datos.token);
    return usuarioActualizado;
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
      toast.classList.add('toast_ocultando');
      setTimeout(() => toast.remove(), 300);
    }, duracion);
  }

  // Modal pequeño de confirmación sin bloquear el navegador
  function mostrarModalConfirmacion(mensaje, titulo = 'Confirmar acción') {
    return new Promise((resolver) => {
      const finalizar = (respuesta) => {
        document.removeEventListener('keydown', alTeclear);
        capa.remove();
        resolver(respuesta);
      };
      const alTeclear = (evento) => {
        if (evento.key === 'Escape') finalizar(false);
      };
      const capa = crearElemento('div', { className: 'modal_confirmacion_overlay' });
      const caja = crearElemento('div', {
        className: 'modal_confirmacion_caja',
        attributes: { role: 'dialog', 'aria-modal': 'true' }
      });
      const cabecera = crearElemento('div', { className: 'modal_confirmacion_cabecera' });
      const tituloEl = crearElemento('h3', {
        className: 'modal_confirmacion_titulo',
        textContent: titulo
      });
      const cerrar = crearElemento('button', {
        className: 'modal_confirmacion_cerrar',
        type: 'button',
        textContent: '×'
      });
      cabecera.append(tituloEl, cerrar);
      const cuerpo = crearElemento('div', { className: 'modal_confirmacion_cuerpo' });
      cuerpo.appendChild(crearElemento('p', {
        className: 'modal_confirmacion_texto',
        textContent: mensaje
      }));
      const pie = crearElemento('div', { className: 'modal_confirmacion_pie' });
      const cancelar = crearElemento('button', {
        className: 'modal_confirmacion_boton modal_confirmacion_boton_cancelar',
        type: 'button',
        textContent: 'Cancelar'
      });
      const aceptar = crearElemento('button', {
        className: 'modal_confirmacion_boton modal_confirmacion_boton_aceptar',
        type: 'button',
        textContent: 'Aceptar'
      });
      pie.append(cancelar, aceptar);
      caja.append(cabecera, cuerpo, pie);
      capa.appendChild(caja);
      cerrar.addEventListener('click', () => finalizar(false));
      cancelar.addEventListener('click', () => finalizar(false));
      aceptar.addEventListener('click', () => finalizar(true));
      capa.addEventListener('click', (evento) => {
        if (evento.target === capa) finalizar(false);
      });
      document.addEventListener('keydown', alTeclear);
      document.body.appendChild(capa);
      capa.classList.add('modal_activo');
      aceptar.focus();
    });
  }

  function configurarBloqueoScrollModal() {
    // Guard del body en WeakSet (sin data-*).
    if (!document.body || elementosBloqueoScrollConfigurados.has(document.body)) return;
    elementosBloqueoScrollConfigurados.add(document.body);
    const selectorModales = [
      '.modal_overlay', '.modal_fondo', '.fondo_modal', '.fondo_modal_oscuro',
      '.fondo_oscuro_modal', '.modal_contacto', '.modal_unirse_fondo'
    ].join(',');
    const sincronizarBloqueo = () => {
      const modalAbierto = Array.from(document.querySelectorAll(selectorModales)).some(modal => {
        const estilo = window.getComputedStyle(modal);
        return estilo.display !== 'none' && estilo.visibility !== 'hidden';
      });
      document.body.classList.toggle('modal_abierto', modalAbierto);
    };
    const observer = new MutationObserver(sincronizarBloqueo);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
      childList: true,
      subtree: true
    });
    sincronizarBloqueo();
  }

  function configurarCierreSesion() {
    document.querySelectorAll('#boton_cerrar_sesion, .boton_cerrar_sesion').forEach((btn) => {
      // Guard por botón en WeakSet (sin data-*).
      if (botonesLogoutConfigurados.has(btn)) return;
      botonesLogoutConfigurados.add(btn);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        limpiarSesion();
        window.location.href = btn.getAttribute('href') || 'login.html';
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
      if (rolEl) rolEl.textContent = obtenerEtiquetaRolUsuario(usuario);
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

  // Botones y overlays usan título y texto visible como única etiqueta
  function configurarMenuMovil() {
    const barraSuperior = obtenerBarraSuperiorAplicacion();
    const barraLateral = document.querySelector('.barra_lateral');
    if (!barraSuperior || !barraLateral) return;
    let btnMenu = barraSuperior.querySelector('.boton_menu_hamburguesa');
    if (!btnMenu) {
      btnMenu = crearElemento('button', {
        type: 'button', className: 'boton_menu_hamburguesa',
        attributes: { 'aria-expanded': 'false' },
        textContent: '',
      });
      btnMenu.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
      const seccionIzq = barraSuperior.querySelector('.seccion_superior_izquierda') || barraSuperior;
      seccionIzq.prepend(btnMenu);
    }
    // Guard tras crear/reemplazar el botón, como antes (sin data-*).
    if (botonesMenuConfigurados.has(btnMenu)) return;
    botonesMenuConfigurados.add(btnMenu);
    btnMenu.type = 'button';
    btnMenu.setAttribute('aria-expanded', 'false');
    btnMenu.title = 'Abrir menú de navegación';
    btnMenu.innerHTML = '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
    if (!barraLateral.id) barraLateral.id = 'barra_lateral_principal';
    btnMenu.setAttribute('aria-controls', barraLateral.id);

    let fondo = document.querySelector('.fondo_menu_movil');
    if (!fondo) {
      fondo = crearElemento('button', { type: 'button', className: 'fondo_menu_movil' });
      document.body.appendChild(fondo);
    } else if (fondo.tagName !== 'BUTTON') {
      const botonFondo = crearElemento('button', {
        type: 'button',
        className: 'fondo_menu_movil'
      });
      fondo.replaceWith(botonFondo);
      fondo = botonFondo;
    }
    fondo.type = 'button';
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
    document.querySelectorAll('.perfil_usuario_barra > .icono_dropdown, .perfil_usuario_barra > .fa-chevron-down')
      .forEach(icono => icono.remove());
    configurarCierreSesion();
    configurarMenuMovil();
    configurarBloqueoScrollModal();
    const usuario = obtenerUsuarioSesion();
    const tieneDepartamento = tieneDepartamentoAsignado(usuario);
    if (tieneDepartamento) {
      configurarCampanaGlobal();
      actualizarContadorNotificaciones();
    } else {
      document.querySelectorAll('.boton_campana, .panel_notificaciones_global')
        .forEach(elemento => elemento.remove());
    }
    if (!intervaloNotificaciones && tieneDepartamento && obtenerBarraSuperiorAplicacion()) {
      intervaloNotificaciones = setInterval(() => {
        if (document.visibilityState !== 'hidden') {
          actualizarContadorNotificaciones();
          const panel = document.querySelector('.panel_notificaciones_global:not([hidden])');
          if (panel) cargarPanelNotificaciones(panel, false);
        }
      }, 30000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') actualizarContadorNotificaciones();
      });
    }
  }

  function configurarCampanaGlobal() {
    if (!tieneDepartamentoAsignado(obtenerUsuarioSesion())) return;

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
    if (!boton.querySelector('i')) {
      boton.prepend(crearElemento('i', {
        className: 'fa-regular fa-bell',
        attributes: { 'aria-hidden': 'true' },
      }));
    }

    let panel = seccionDerecha.querySelector('.panel_notificaciones_global');
    if (!panel) {
      panel = crearElemento('section', {
        className: 'panel_notificaciones_global',
        attributes: { role: 'region' }
      });
      panel.hidden = true;
      const encabezado = crearElemento('div', { className: 'panel_notificaciones_encabezado' });
      encabezado.appendChild(crearElemento('strong', { textContent: 'Notificaciones' }));
      const cerrarPanel = crearElemento('button', {
        className: 'panel_notificaciones_cerrar',
        type: 'button',
        textContent: '×'
      });
      encabezado.appendChild(cerrarPanel);
      panel.appendChild(encabezado);
      panel.appendChild(crearElemento('div', {
        className: 'panel_notificaciones_lista',
        attributes: { 'aria-live': 'polite' }
      }));
      const verTodas = crearElemento('a', {
        className: 'panel_notificaciones_ver_todas',
        href: 'notificaciones.html',
        textContent: 'Ver todas las notificaciones'
      });
      panel.appendChild(verTodas);
      seccionDerecha.appendChild(panel);
      cerrarPanel.addEventListener('click', () => {
        panel.hidden = true;
        boton.setAttribute('aria-expanded', 'false');
      });
    }

    let indicador = boton.querySelector('#indicador_notificaciones') ||
      seccionDerecha.querySelector('#indicador_notificaciones');
    if (!indicador) {
      indicador = crearElemento('span', { className: 'punto_notificacion', id: 'indicador_notificaciones' });
    }
    indicador.classList.add('punto_notificacion');
    indicador.setAttribute('aria-live', 'polite');
    indicador.textContent = '0';
    indicador.classList.add('indicador_oculto');
    if (indicador.parentElement !== boton) boton.appendChild(indicador);

    // Guard por campana en WeakSet (sin data-*).
    if (!botonesCampanaConfigurados.has(boton)) {
      botonesCampanaConfigurados.add(boton);
      boton.setAttribute('aria-haspopup', 'true');
      boton.setAttribute('aria-expanded', 'false');
      boton.addEventListener('click', () => {
        const abierto = panel.hidden;
        panel.hidden = !abierto;
        boton.setAttribute('aria-expanded', String(abierto));
        if (abierto) cargarPanelNotificaciones(panel);
      });
      document.addEventListener('click', evento => {
        if (!panel.contains(evento.target) && evento.target !== boton && !boton.contains(evento.target)) {
          panel.hidden = true;
          boton.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape') {
          panel.hidden = true;
          boton.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  async function cargarPanelNotificaciones(panel, mostrarCarga = true) {
    const lista = panel.querySelector('.panel_notificaciones_lista');
    // Control de carga en WeakSet (sin data-*).
    if (!lista || panelesNotificacionesCargando.has(panel)) return;
    panelesNotificacionesCargando.add(panel);
    if (mostrarCarga) lista.textContent = 'Cargando notificaciones...';
    try {
      const datos = await apiFetch('/notificaciones');
      const notificaciones = Array.isArray(datos)
        ? datos
        : (Array.isArray(datos.notificaciones) ? datos.notificaciones : []);
      lista.replaceChildren();
      if (!notificaciones.length) {
        lista.textContent = 'No hay notificaciones recientes.';
        return;
      }

      notificaciones.slice(0, 5).forEach(item => {
        const tarjeta = crearElemento('article', {
          className: `panel_notificacion_item${item.leida ? '' : ' sin_leer'}`
        });
        const enlace = crearElemento('a', {
          className: 'panel_notificacion_contenido',
          href: item.tipo === 'tarea' ? 'tareas.html'
            : item.tipo === 'archivo' ? 'archivos.html' : 'anuncios.html'
        });
        enlace.appendChild(crearElemento('strong', {
          textContent: item.titulo || (item.tipo === 'tarea' ? 'Tarea pendiente' : 'Anuncio')
        }));
        enlace.appendChild(crearElemento('span', {
          textContent: item.contenido || ''
        }));
        tarjeta.appendChild(enlace);

        if (!item.visto && Number.isSafeInteger(Number(item.elemento_id))) {
          const marcarVisto = crearElemento('button', {
            className: 'panel_notificacion_marcar_leida',
            type: 'button',
            textContent: 'Marcar como visto'
          });
          marcarVisto.addEventListener('click', async () => {
            marcarVisto.disabled = true;
            try {
              await marcarElementoVisto(item.tipo, Number(item.elemento_id));
              await cargarPanelNotificaciones(panel, false);
              actualizarContadorNotificaciones();
            } catch (error) {
              mostrarToast(error.message || 'No se pudo marcar como visto.', 'error');
              marcarVisto.disabled = false;
            }
          });
          tarjeta.appendChild(marcarVisto);
        }
        lista.appendChild(tarjeta);
      });
    } catch (error) {
      console.error('Error al cargar las notificaciones recientes:', error);
      lista.textContent = 'No se pudieron cargar las notificaciones.';
    } finally {
      panelesNotificacionesCargando.delete(panel);
    }
  }

  function actualizarContadorNotificaciones() {
    const usuario = obtenerUsuarioSesion();
    if (!obtenerBarraSuperiorAplicacion() || !tieneDepartamentoAsignado(usuario)) {
      return Promise.resolve();
    }
    if (!usuario || !usuario.id || !obtenerToken()) {
      document.querySelectorAll('#indicador_notificaciones').forEach(indicador => {
        indicador.textContent = '0';
        indicador.classList.add('indicador_oculto');
      });
      return Promise.resolve();
    }
    if (solicitudNotificaciones) return solicitudNotificaciones;

    solicitudNotificaciones = apiFetch('/notificaciones')
      .then((datos) => {
        const lista = Array.isArray(datos)
          ? datos
          : (Array.isArray(datos.notificaciones) ? datos.notificaciones : []);
        const noLeidas = Array.isArray(lista) ? lista.filter(n => !n.leida && !n.visto).length : 0;
        const porTipo = lista.reduce((conteos, item) => {
          if (!item.leida && !item.visto) conteos[item.tipo] = (conteos[item.tipo] || 0) + 1;
          return conteos;
        }, {});
        document.querySelectorAll('#indicador_notificaciones, .badge_campana').forEach((indicador) => {
          indicador.textContent = String(noLeidas);
          indicador.classList.toggle('indicador_oculto', noLeidas === 0);
        });
        document.querySelectorAll('.enlace_navegacion[href]').forEach(enlace => {
          const ruta = enlace.getAttribute('href').split('/').pop();
          const tipo = ruta === 'notificaciones.html' ? 'notificacion'
            : ruta === 'anuncios.html' ? 'anuncio'
            : ruta === 'archivos.html' ? 'archivo'
              : ruta === 'tareas.html' ? 'tarea' : null;
          if (!tipo) return;
          let insignia = enlace.querySelector('.insignia_notificacion');
          if (!insignia) {
            insignia = crearElemento('span', { className: 'insignia_notificacion' });
            enlace.appendChild(insignia);
          }
          const cantidad = tipo === 'notificacion' ? noLeidas : (porTipo[tipo] || 0);
          insignia.textContent = String(cantidad);
          insignia.classList.toggle('visible', cantidad > 0);
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

  async function marcarElementoVisto(tipo, elementoId) {
    if (!DEFINICIONES_TIPOS_VISTO.has(tipo) || !Number.isSafeInteger(elementoId) || elementoId <= 0) {
      throw new Error('El elemento no es válido.');
    }
    const resultado = await apiFetch(`/elementos/${tipo}/${elementoId}/visto`, { method: 'POST' });
    await actualizarContadorNotificaciones();
    return resultado;
  }

  const DEFINICIONES_TIPOS_VISTO = new Set(['anuncio', 'archivo', 'tarea']);

  window.OCID = {
    API_BASE,
    obtenerUsuarioSesion,
    obtenerToken,
    tieneDepartamentoAsignado,
    obtenerEtiquetaRolUsuario,
    guardarSesion,
    sincronizarPerfil,
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
    marcarElementoVisto,
    confirmarAccion: mostrarModalConfirmacion,
  };

  window.mostrarMensaje = (mensaje, esError = false) => mostrarToast(mensaje, esError);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarNavegacionCompartida);
  } else {
    iniciarNavegacionCompartida();
  }
})();