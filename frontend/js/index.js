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

    if (botonVerGuia) {
      botonVerGuia.addEventListener('click', () => desplazarASeccion('como_funciona'));
    }

    if (botonHeroExplorar) {
      botonHeroExplorar.addEventListener('click', () => desplazarASeccion('modulos_sistema'));
    }

    if (sesionValida) {
      if (botonAcceder) {
        botonAcceder.replaceChildren();
        const icono = document.createElement('i');
        icono.setAttribute('data-lucide', 'layout-dashboard');
        icono.className = 'icono_16';
        const texto = document.createElement('span');
        texto.textContent = 'Ir al Sistema';
        botonAcceder.appendChild(icono);
        botonAcceder.appendChild(texto);
        botonAcceder.addEventListener('click', () => redirigirSistema(usuario));
      }

      if (botonHeroLogin) {
        const spanHero = botonHeroLogin.querySelector('span');
        if (spanHero) spanHero.textContent = 'Ir a mi Panel Docente';
        botonHeroLogin.addEventListener('click', () => redirigirSistema(usuario));
      }
    } else {
      if (botonAcceder) {
        botonAcceder.addEventListener('click', redirigirInicioSesion);
      }
      if (botonHeroLogin) {
        botonHeroLogin.addEventListener('click', redirigirInicioSesion);
      }
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarIndexPublico);
  } else {
    inicializarIndexPublico();
  }
})();