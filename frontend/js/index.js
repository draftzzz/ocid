/* ==========================================================================
   Lógica para index.html (Página Pública / Bienvenida)
   Cero innerHTML y cero CSS inline.
   ========================================================================== */
(function () {
  'use strict';

  function desplazarASeccion(identificadorSeccion) {
    const elementoDestino = document.getElementById(identificadorSeccion);
    if (elementoDestino) {
      elementoDestino.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }

  function redirigirInicioSesion() {
    window.location.href = 'html/login.html';
  }

  function redirigirSistema(usuario) {
    const pagina = window.OCID.tieneDepartamentoAsignado(usuario)
      ? 'html/inicio.html'
      : 'html/bienvenida.html';
    window.location.href = pagina;
  }

  function inicializarIndexPublico() {
    let usuario = null;
    try {
      usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (e) {
      usuario = null;
    }
    const sesionValida = Boolean(
      usuario &&
      usuario.id &&
      window.OCID.obtenerToken()
    );

    const botonAcceder = document.getElementById('boton_acceder');
    const botonHeroLogin = document.getElementById('boton_hero_login');
    const botonVerGuia = document.getElementById('boton_ver_guia');
    const botonHeroExplorar = document.getElementById('boton_hero_explorar');

    if (sesionValida) {
      redirigirSistema(usuario);
      return;
    }

    if (botonVerGuia) {
      botonVerGuia.addEventListener('click', () => desplazarASeccion('como_funciona'));
    }

    if (botonHeroExplorar) {
      botonHeroExplorar.addEventListener('click', () => desplazarASeccion('modulos_sistema'));
    }

    if (botonAcceder) botonAcceder.href = 'html/login.html';
    if (botonHeroLogin) botonHeroLogin.addEventListener('click', redirigirInicioSesion);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  inicializarIndexPublico();
})();