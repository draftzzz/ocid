(function () {
  'use strict';

  const obtenerElemento = (id) => document.getElementById(id);
  let anunciosCargados = [];

  function obtenerLista(respuesta, propiedad) {
    if (Array.isArray(respuesta)) return respuesta;
    return respuesta && Array.isArray(respuesta[propiedad]) ? respuesta[propiedad] : [];
  }

  function establecerTexto(id, valor) {
    const elemento = obtenerElemento(id);
    if (elemento) elemento.textContent = valor;
  }

  function actualizarUsuario(usuario) {
    const nombre = usuario.nombre || usuario.correo || 'Usuario';
    const nombreElemento = obtenerElemento('nombreUsuario');
    const rolElemento = obtenerElemento('etiqueta_rol_usuario');
    const avatar = obtenerElemento('avatar_usuario_circulo');
    const saludo = obtenerElemento('texto_bienvenida_saludo');

    if (nombreElemento) nombreElemento.textContent = nombre;
    if (rolElemento) rolElemento.textContent = usuario.rol || 'Docente';
    if (avatar) {
      avatar.textContent = nombre.split(/\s+/).slice(0, 2).map(parte => parte[0] || '').join('').toUpperCase();
    }
    if (saludo) saludo.textContent = `¡Hola, ${nombre.split(/\s+/)[0]}!`;
  }

  function renderizarAnuncios(anuncios) {
    const contenedor = obtenerElemento('contenedor_lista_anuncios');
    if (!contenedor) return;
    contenedor.replaceChildren();

    if (!anuncios.length) {
      const vacio = document.createElement('p');
      vacio.className = 'texto_vacio';
      vacio.textContent = 'No hay anuncios disponibles.';
      contenedor.appendChild(vacio);
      return;
    }

    anuncios.slice(0, 5).forEach(anuncio => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'tarjeta_item_anuncio';

      const contenido = document.createElement('div');
      contenido.className = 'contenido_item_anuncio';

      const prioridad = String(anuncio.prioridad || 'General');
      const etiqueta = document.createElement('span');
      etiqueta.className = 'etiqueta_prioridad';
      const prioridadClave = prioridad.toLowerCase();
      etiqueta.classList.add(prioridadClave.includes('import') || prioridadClave.includes('urgent')
        ? 'etiqueta_importante'
        : prioridadClave.includes('aviso') || prioridadClave.includes('media')
          ? 'etiqueta_aviso'
          : 'etiqueta_general');
      etiqueta.textContent = prioridad;

      const detalles = document.createElement('div');
      detalles.className = 'detalles_texto_anuncio';
      const titulo = document.createElement('span');
      titulo.className = 'titulo_item_anuncio';
      titulo.textContent = anuncio.titulo || 'Anuncio';
      const meta = document.createElement('span');
      meta.className = 'meta_item_anuncio';
      const fecha = anuncio.fecha ? new Date(anuncio.fecha).toLocaleDateString('es-MX') : '';
      meta.textContent = [anuncio.autor_nombre || 'Coordinación', fecha].filter(Boolean).join(' · ');
      detalles.append(titulo, meta);
      contenido.append(etiqueta, detalles);

      const texto = document.createElement('p');
      texto.className = 'contenido_resumen_anuncio';
      texto.textContent = anuncio.contenido || '';
      tarjeta.append(contenido, texto);
      contenedor.appendChild(tarjeta);
    });
  }

  function actualizarDepartamentos(departamentos, usuario) {
    const selector = obtenerElemento('campo_departamento_anuncio');
    if (selector) {
      selector.replaceChildren(new Option('Selecciona un departamento', ''));
      departamentos.forEach(departamento => {
        selector.add(new Option(departamento.nombre, String(departamento.id)));
      });
      if (usuario.departamento_id) selector.value = String(usuario.departamento_id);
    }

    const departamento = departamentos.find(item =>
      Number(item.id) === Number(usuario.departamento_id)
    );
    establecerTexto(
      'etiqueta_nombre_departamento',
      departamento ? departamento.nombre : (usuario.departamento_nombre || usuario.departamento || 'Sin asignar')
    );
    return departamento || null;
  }

  function actualizarIndicadoresNotificaciones(notificaciones) {
    const avisosNuevos = notificaciones.filter(n => n.tipo === 'anuncio' && !n.leida).length;
    const notificacionesNuevas = notificaciones.filter(n => !n.leida).length;
    establecerTexto('conteo_anu', String(avisosNuevos));

    ['badge_conteo_anuncios', 'indicador_notificaciones'].forEach(id => {
      const badge = obtenerElemento(id);
      if (!badge) return;
      const cantidad = id === 'badge_conteo_anuncios' ? avisosNuevos : notificacionesNuevas;
      badge.textContent = String(cantidad);
      badge.style.display = cantidad ? '' : 'none';
    });
  }

  function actualizarProximoEvento(tareas) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const proximas = tareas
      .filter(tarea => tarea.fecha && new Date(`${String(tarea.fecha).slice(0, 10)}T00:00:00`) >= hoy)
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    establecerTexto('metrica_conteo_eventos', String(proximas.length));
    const capa = document.querySelector('.capa_gradiente_plantel');
    if (!capa) return;

    capa.replaceChildren();
    const titulo = document.createElement('div');
    titulo.className = 'titulo_plantel_superpuesto';
    const detalle = document.createElement('div');
    detalle.className = 'lema_plantel_superpuesto';

    if (proximas.length) {
      const proximo = proximas[0];
      titulo.textContent = 'Próximo evento';
      detalle.textContent = `${proximo.titulo || 'Evento escolar'}${proximo.fecha ? ` · ${new Date(`${String(proximo.fecha).slice(0, 10)}T00:00:00`).toLocaleDateString('es-MX')}` : ''}`;
    } else {
      titulo.textContent = 'CBTIS 258';
      detalle.textContent = 'Sin eventos próximos registrados.';
    }
    capa.append(titulo, detalle);
  }

  async function cargarInicio() {
    const usuario = window.OCID.obtenerUsuarioSesion();
    if (!usuario || !window.OCID.obtenerToken()) {
      window.location.href = 'login.html';
      return;
    }
    actualizarUsuario(usuario);

    const rutas = [
      ['/anuncios', 'anuncios'],
      ['/docentes', 'docentes'],
      ['/departamentos', 'departamentos'],
      ['/archivos', 'archivos'],
      ['/tareas', 'tareas'],
      ['/notificaciones', 'notificaciones']
    ];
    const resultados = await Promise.allSettled(rutas.map(([ruta]) => window.OCID.apiFetch(ruta)));
    const datos = resultados.map((resultado, indice) => {
      if (resultado.status === 'fulfilled') return resultado.value;
      console.error(`No se pudo cargar ${rutas[indice][0]}:`, resultado.reason);
      return null;
    });

    const anuncios = obtenerLista(datos[0], 'anuncios');
    const docentes = obtenerLista(datos[1], 'docentes');
    const departamentos = obtenerLista(datos[2], 'departamentos');
    const archivos = obtenerLista(datos[3], 'archivos');
    const tareas = obtenerLista(datos[4], 'tareas');
    const notificaciones = obtenerLista(datos[5], 'notificaciones');
    const departamento = actualizarDepartamentos(departamentos, usuario);
    const departamentoId = departamento ? Number(departamento.id) : Number(usuario.departamento_id);

    const usuariosDelDepartamento = docentes.filter(item =>
      Number(item.departamento_id) === departamentoId
    );
    const cantidadDocentes = usuariosDelDepartamento.filter(item =>
      String(item.rol || '').toLowerCase().includes('docente')
    ).length;
    const cantidadArchivos = archivos.filter(item =>
      Number(item.departamento_id) === departamentoId
    ).length;

    establecerTexto('conteo_usr', String(cantidadDocentes));
    establecerTexto('conteo_dep', String(cantidadArchivos));
    if (datos[5]) actualizarIndicadoresNotificaciones(notificaciones);
    else establecerTexto('conteo_anu', '—');

    anunciosCargados = anuncios;
    renderizarAnuncios(anunciosCargados);
    actualizarProximoEvento(tareas);
  }

  window.filtrarAnunciosEnTiempoReal = function () {
    const termino = (obtenerElemento('campo_busqueda_general')?.value || '').trim().toLowerCase();
    renderizarAnuncios(anunciosCargados.filter(anuncio =>
      [anuncio.titulo, anuncio.contenido, anuncio.autor_nombre, anuncio.prioridad]
        .some(valor => String(valor || '').toLowerCase().includes(termino))
    ));
  };

  window.abrirModalCrearAnuncio = function () {
    obtenerElemento('modal_nuevo_anuncio')?.classList.add('visible');
  };

  window.abrirModalLogin = function () {
    obtenerElemento('modal_login_sesion')?.classList.add('visible');
  };

  window.abrirModalSubirArchivo = function () {
    window.location.href = 'archivos.html';
  };

  window.abrirModalDocentes = function () {
    window.location.href = 'docentes.html';
  };

  window.cerrarModal = function (id) {
    obtenerElemento(id)?.classList.remove('visible');
  };

  window.mostrarMensaje = function (mensaje, esError) {
    window.OCID.mostrarToast(mensaje, Boolean(esError));
  };

  window.publicarAnuncio = async function (evento) {
    evento.preventDefault();
    const usuario = window.OCID.obtenerUsuarioSesion();
    const formulario = obtenerElemento('formulario_crear_anuncio');
    const boton = obtenerElemento('btn_guardar_anuncio');
    const titulo = obtenerElemento('campo_titulo_anuncio')?.value.trim();
    const contenido = obtenerElemento('campo_contenido_anuncio')?.value.trim();
    const departamentoId = Number(obtenerElemento('campo_departamento_anuncio')?.value);

    if (!usuario || !titulo || !contenido || !departamentoId) {
      window.OCID.mostrarToast('Completa el anuncio y selecciona un departamento.', true);
      return;
    }

    if (boton) boton.disabled = true;
    try {
      const respuesta = await window.OCID.apiFetch('/anuncios', {
        method: 'POST',
        body: JSON.stringify({
          titulo,
          contenido,
          prioridad: obtenerElemento('campo_prioridad_anuncio')?.value || 'Aviso',
          autor_id: Number(usuario.id),
          departamento_id: departamentoId
        })
      });
      if (!respuesta.success) throw new Error(respuesta.error || 'No se pudo publicar el anuncio.');
      formulario?.reset();
      window.cerrarModal('modal_nuevo_anuncio');
      window.OCID.mostrarToast('Anuncio publicado correctamente.');
      await cargarInicio();
    } catch (error) {
      console.error('Error al publicar el anuncio:', error);
      window.OCID.mostrarToast(error.message || 'No se pudo publicar el anuncio.', true);
    } finally {
      if (boton) boton.disabled = false;
    }
  };

  window.ejecutarAutenticacion = async function (evento) {
    evento.preventDefault();
    try {
      const datos = await window.OCID.apiPublico('/login', {
        method: 'POST',
        body: JSON.stringify({
          correo: obtenerElemento('campo_login_correo').value.trim(),
          password: obtenerElemento('campo_login_password').value
        })
      });
      if (!datos.success || !datos.usuario || !datos.token) {
        throw new Error(datos.error || 'No se pudo iniciar sesión.');
      }
      window.OCID.guardarSesion(datos.usuario, datos.token);
      window.cerrarModal('modal_login_sesion');
      actualizarUsuario(datos.usuario);
      await cargarInicio();
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      window.OCID.mostrarToast(error.message || 'No se pudo iniciar sesión.', true);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.OCID.configurarCierreSesion();
    cargarInicio();
  });
})();
