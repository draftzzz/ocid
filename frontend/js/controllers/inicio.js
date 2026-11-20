/* Controlador de la vista inicio. */
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
    if (rolElemento) rolElemento.textContent = window.OCID.obtenerEtiquetaRolUsuario(usuario);
    if (avatar) {
      avatar.textContent = nombre.split(/\s+/).slice(0, 2).map(parte => parte[0] || '').join('').toUpperCase();
    }
    if (saludo) saludo.textContent = `¡Hola, ${nombre.split(/\s+/)[0]}!`;
  }

  // Clasifica la prioridad en verde, ámbar o rojo según el valor recibido
  function clasePrioridadAnuncio(valor) {
    const clave = String(valor || 'general')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/urgent|alta|import/.test(clave)) return 'etiqueta_importante';
    if (/moderad|media|aviso/.test(clave)) return 'etiqueta_aviso';
    return 'etiqueta_general';
  }

  function renderizarAnuncios(anuncios) {
    const contenedor = obtenerElemento('contenedor_lista_anuncios');
    if (!contenedor) return;
    contenedor.replaceChildren();

    // Máximo cuatro anuncios en el inicio; si no hay, la lista queda vacía
    anuncios.slice(0, 4).forEach(anuncio => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'tarjeta_item_anuncio';

      const cabecera = document.createElement('div');
      cabecera.className = 'cabecera_item_anuncio';

      const prioridad = String(anuncio.prioridad || 'General');
      const etiqueta = document.createElement('span');
      // Insignia de prioridad con el color que corresponde a su valor
      etiqueta.className = `etiqueta_tipo etiqueta_prioridad ${clasePrioridadAnuncio(prioridad)}`;
      const puntoPrioridad = document.createElement('span');
      puntoPrioridad.className = 'punto_etiqueta';
      etiqueta.append(puntoPrioridad, document.createTextNode(` ${prioridad}`));

      const titulo = document.createElement('span');
      titulo.className = 'titulo_item_anuncio';
      titulo.textContent = anuncio.titulo || 'Anuncio';
      cabecera.append(etiqueta, titulo);

      const resumen = document.createElement('p');
      resumen.className = 'contenido_resumen_anuncio';
      resumen.textContent = anuncio.contenido || '';

      const meta = document.createElement('div');
      meta.className = 'meta_item_anuncio';
      const fecha = anuncio.fecha ? new Date(anuncio.fecha).toLocaleDateString('es-MX') : '';
      meta.textContent = [anuncio.autor_nombre || 'Coordinación', fecha].filter(Boolean).join(' · ');

      tarjeta.append(cabecera, resumen, meta);
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

  // Actualiza contadores e insignias sin estilos inline
  function actualizarIndicadoresNotificaciones(notificaciones) {
    const avisosNuevos = notificaciones.filter(n => n.tipo === 'anuncio' && !n.leida).length;
    const notificacionesNuevas = notificaciones.filter(n => !n.leida).length;
    establecerTexto('conteo_anu', String(avisosNuevos));

    ['badge_conteo_anuncios', 'indicador_notificaciones'].forEach(id => {
      const badge = obtenerElemento(id);
      if (!badge) return;
      const cantidad = id === 'badge_conteo_anuncios' ? avisosNuevos : notificacionesNuevas;
      badge.textContent = String(cantidad);
      badge.classList.toggle('oculto', !cantidad);
    });
  }

  function actualizarProximoEvento(tareas) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const proximas = tareas
      .filter(tarea => tarea.fecha && new Date(`${String(tarea.fecha).slice(0, 10)}T00:00:00`) >= hoy)
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    establecerTexto('metrica_conteo_eventos', String(proximas.length));
  }

  // Muestra las tareas recientes del departamento del usuario
  function renderizarTareas(tareas, usuario) {
    const contenedor = obtenerElemento('contenedor_lista_tareas');
    if (!contenedor) return;
    contenedor.replaceChildren();

    const normalizarTexto = valor => String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    const departamentoClave = normalizarTexto(usuario.departamento_nombre || usuario.departamento);
    const departamentoId = Number(usuario.departamento_id);
    const tareasDelDepartamento = tareas.filter(tarea => {
      if (Number.isSafeInteger(departamentoId) && departamentoId > 0) {
        return Number(tarea.departamento_emisor_id) === departamentoId ||
          (Array.isArray(tarea.departamentos_destino_ids) &&
            tarea.departamentos_destino_ids.some(id => Number(id) === departamentoId));
      }
      const departamentosTarea = normalizarTexto(tarea.departamento || tarea.departamento_nombre)
        .split(',')
        .map(nombre => nombre.trim())
        .filter(Boolean);
      return departamentosTarea.includes('general') ||
        (departamentoClave && departamentosTarea.includes(departamentoClave));
    });
    const estaCompletada = tarea => /completad|terminad/.test(normalizarTexto(tarea.estado));
    const fechaTarea = tarea => {
      const valor = tarea.fecha || tarea.fecha_creacion;
      const fecha = valor
        ? new Date(tarea.fecha ? `${String(valor).slice(0, 10)}T00:00:00` : valor).getTime()
        : Number.NaN;
      return Number.isFinite(fecha) ? fecha : null;
    };
    const pendientes = tareasDelDepartamento
      .filter(tarea => !estaCompletada(tarea))
      .sort((a, b) => (fechaTarea(a) ?? Number.MAX_SAFE_INTEGER) - (fechaTarea(b) ?? Number.MAX_SAFE_INTEGER));
    const mostrarPendientes = pendientes.length > 0;
    const tareasVisibles = (mostrarPendientes
      ? pendientes
      : tareasDelDepartamento.slice().sort((a, b) => (fechaTarea(b) ?? 0) - (fechaTarea(a) ?? 0))
    ).slice(0, 3);

    // Sin tareas visibles el inicio no muestra tarjeta ni icono
    tareasVisibles.forEach(tarea => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'tarjeta_item_tarea';

      const encabezado = document.createElement('div');
      encabezado.className = 'encabezado_item_tarea';
      const titulo = document.createElement('h3');
      titulo.className = 'titulo_item_tarea';
      titulo.textContent = tarea.titulo || 'Tarea sin título';

      const estado = document.createElement('span');
      const estadoTexto = String(tarea.estado || 'Pendiente');
      const estadoClave = estaCompletada(tarea)
        ? 'completada'
        : /proceso/.test(normalizarTexto(estadoTexto)) ? 'en_proceso' : 'pendiente';
      estado.className = `estado_item_tarea estado_item_tarea_${estadoClave}`;
      estado.textContent = estadoTexto;
      encabezado.append(titulo, estado);

      const descripcion = document.createElement('p');
      descripcion.className = 'descripcion_item_tarea';
      descripcion.textContent = tarea.descripcion || 'Sin descripción adicional.';

      const meta = document.createElement('span');
      meta.className = 'meta_item_tarea';
      const fecha = fechaTarea(tarea);
      meta.textContent = fecha ? `Fecha: ${new Date(fecha).toLocaleDateString('es-MX')}` : 'Sin fecha asignada';

      tarjeta.append(encabezado, descripcion, meta);
      contenedor.appendChild(tarjeta);
    });
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
    const nombreDepartamento = departamento
      ? departamento.nombre
      : (usuario.departamento_nombre || (typeof usuario.departamento === 'string' ? usuario.departamento : ''));
    renderizarTareas(tareas, usuario);
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

  window.mostrarMensaje = function (mensaje, tipo = 'exito') {
    window.OCID.mostrarToast(mensaje, tipo);
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
      const usuarioSesion = window.OCID.obtenerUsuarioSesion() || datos.usuario;
      window.location.href = window.OCID.tieneDepartamentoAsignado(usuarioSesion)
        ? 'inicio.html'
        : 'bienvenida.html';
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
