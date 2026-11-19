/* ==========================================================================
   Lógica Módulo de Tareas - OCID (Sesión, Toast, Buscadores y Servidor)
   ========================================================================== */
(function () {
  function iniciarInterfaz() {
    const barraSuperior = document.querySelector('.barra_superior');
    const barraLateral = document.querySelector('.barra_lateral');

    if (!barraSuperior || !barraLateral) return;

    let usuario = null;
    try {
      usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (error) {
      console.error('No se pudieron leer los datos de sesión:', error);
      localStorage.removeItem('usuario_ocid');
    }

    const nombre = usuario && (usuario.nombre || usuario.correo || usuario.usuario);
    const rol = window.OCID.obtenerEtiquetaRolUsuario(usuario);

    const etiquetaNombre = document.getElementById('nombreUsuario');
    const etiquetaRol = document.getElementById('etiqueta_rol_usuario');
    const avatar = document.getElementById('avatar_usuario_circulo');

    if (etiquetaNombre && nombre) {
      etiquetaNombre.textContent = nombre;
    }
    if (etiquetaRol) {
      etiquetaRol.textContent = rol;
    }
    if (avatar && nombre) {
      const iniciales = nombre.split(/\s+/)
        .slice(0, 2)
        .map(parte => parte.charAt(0))
        .join('')
        .toUpperCase();
      avatar.textContent = iniciales;
      // Iniciales con estilo definido en tareas.css
      avatar.classList.add('avatar_usuario_iniciales');
    }

    const botonCerrarSesion = document.getElementById('boton_cerrar_sesion');
    if (botonCerrarSesion) {
      botonCerrarSesion.addEventListener('click', evento => {
        evento.preventDefault();
        localStorage.removeItem('usuario_ocid');
        window.location.href = 'login.html';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarInterfaz);
  } else {
    iniciarInterfaz();
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const cuerpoTabla = document.getElementById('contenedor_tarjetas_tareas') || document.getElementById('cuerpo_tabla_tareas');
  const formularioTarea = document.getElementById('formulario_crear_tarea');
  const modal = document.getElementById('modal_nueva_tarea');
  const botonAbrir = document.getElementById('boton_abrir_modal');
  const botonCerrarCruz = document.getElementById('boton_cerrar_cruz');
  const botonCancelar = document.getElementById('boton_cancelar_modal');
  const textoConteo = document.getElementById('texto_resumen_conteo');
  const contenedorPaginacion = document.getElementById('contenedor_botones_paginacion');

  const tituloModalTexto = document.getElementById('titulo_modal_texto');
  const botonGuardarTexto = document.getElementById('boton_guardar_modal_texto');

  const inputTexto = document.getElementById('campo_filtro_texto');
  const selectDepartamento = document.getElementById('filtro_departamento');
  const selectEstado = document.getElementById('filtro_estado');
  const campoFechaModal = document.getElementById('campo_modal_fecha');
  const buscadorPersonasModal = document.getElementById('buscador_personas_modal');
  const listaPersonasDatalist = document.getElementById('lista_personas_tarea');
  const textoDeptoPersona = document.getElementById('depto_persona_seleccionada');

  const modalVerTarea = document.getElementById('modal_ver_tarea');
  const btnCerrarDetalleCruz = document.getElementById('cerrar_modal_detalle');
  const btnCerrarDetallePie = document.getElementById('boton_cerrar_detalle_pie');

  let tareas = [];
  let listaDepartamentos = [];
  let listaDocentesUsuarios = [];
  let paginaActual = 1;
  // Máximo de cuatro tareas por página
  const elementosPorPagina = 4;
  let tareaEnEdicionId = null;
  let alcanceActualTareas = 'todas'; // 'todas' | 'mias' | 'departamento'

  // Una sola persona por tarea
  let personaSeleccionada = null;

  // Convierte una fecha local a texto YYYY-MM-DD
  function formatearISO(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  // Rango permitido: desde hoy hasta seis meses después
  function obtenerLimitesFecha() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 6, hoy.getDate());
    return { min: formatearISO(hoy), max: formatearISO(fin) };
  }

  // Valida formato estricto y rango de la fecha límite
  function fechaLimiteEsValida(valor) {
    const textoFecha = String(valor || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(textoFecha)) return false;
    const fecha = new Date(`${textoFecha}T00:00:00`);
    if (Number.isNaN(fecha.getTime()) || formatearISO(fecha) !== textoFecha) return false;
    const limites = obtenerLimitesFecha();
    return textoFecha >= limites.min && textoFecha <= limites.max;
  }

  function escaparHTML(valor) {
    if (valor === null || valor === undefined || String(valor).trim() === '') return '-';
    return String(valor).replace(/[&<>"']/g, caracter => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[caracter]);
  }

  function mostrarToastTareas(mensaje, tipo = 'exito') {
    window.OCID.mostrarToast(mensaje, tipo);
  }

  function puedeGestionarTarea(tarea, usuario = window.OCID.obtenerUsuarioSesion()) {
    if (!usuario || !tarea) return false;
    const esJefe = usuario.es_jefe === true || usuario.es_jefe === 't';
    const esAdministrador = ['administrador', 'administrador general']
      .includes(String(usuario.rol || '').trim().toLowerCase());
    const departamentoUsuarioId = Number(usuario.departamento_id);
    const perteneceAlDepartamento = Number(tarea.departamento_emisor_id) === departamentoUsuarioId ||
      (Array.isArray(tarea.departamentos_destino_ids) &&
        tarea.departamentos_destino_ids.some(id => Number(id) === departamentoUsuarioId));
    return Number(usuario.id) === Number(tarea.autor_id) ||
      esAdministrador ||
      (esJefe && perteneceAlDepartamento);
  }

  // Detecta tareas creadas por el usuario en sesión
  function esTareaPropio(tarea, usuario) {
    return Boolean(tarea && usuario &&
      (tarea.es_autor === true || Number(usuario.id) === Number(tarea.autor_id)));
  }

  async function cargarCatalogosServidor() {
    try {
      const [departamentos, docentes, datosTareas] = await Promise.all([
        window.OCID.apiFetch('/departamentos'),
        window.OCID.apiFetch('/docentes'),
        window.OCID.apiFetch('/tareas')
      ]);

      listaDepartamentos = Array.isArray(departamentos) ? departamentos : [];
      poblarFiltrosYModalDepartamentos(listaDepartamentos);
      listaDocentesUsuarios = Array.isArray(docentes) ? docentes : [];
      // Las tareas más nuevas aparecen primero
      tareas = Array.isArray(datosTareas)
        ? datosTareas.slice().sort((a, b) =>
            new Date(b.fecha || b.fecha_creacion || 0) - new Date(a.fecha || a.fecha_creacion || 0))
        : [];
    } catch (error) {
      console.error('Error cargando catálogos:', error);
      mostrarToastTareas('Error al sincronizar datos con el servidor.', 'error');
      tareas = [];
    }
    renderizarTabla();
  }

  // Pobla únicamente el filtro de departamentos de la lista
  function poblarFiltrosYModalDepartamentos(deptos) {
    if (!selectDepartamento) return;
    selectDepartamento.replaceChildren(new Option('Todos los departamentos', 'todos'));
    deptos.forEach(d => selectDepartamento.appendChild(new Option(d.nombre, d.nombre)));
  }

  // Llena el datalist con las personas disponibles
  function poblarListaPersonasModal() {
    if (!listaPersonasDatalist) return;
    listaPersonasDatalist.replaceChildren();
    listaDocentesUsuarios.forEach(persona => {
      const nombre = persona.nombre || persona.correo || persona.usuario;
      if (!nombre) return;
      const opcion = document.createElement('option');
      opcion.value = nombre;
      opcion.label = persona.departamento || persona.departamento_nombre || 'General';
      listaPersonasDatalist.appendChild(opcion);
    });
  }

  // Resuelve la persona elegida y muestra su departamento
  function resolverPersonaSeleccionada() {
    const valor = buscadorPersonasModal ? buscadorPersonasModal.value.trim().toLowerCase() : '';
    personaSeleccionada = valor
      ? listaDocentesUsuarios.find(persona =>
          String(persona.nombre || persona.correo || persona.usuario || '').toLowerCase() === valor) || null
      : null;
    if (textoDeptoPersona) {
      textoDeptoPersona.textContent = personaSeleccionada
        ? `Departamento destino: ${personaSeleccionada.departamento || personaSeleccionada.departamento_nombre || 'General'}`
        : 'Se asignará una sola persona.';
    }
  }

  // Bloquea la entrada manual inválida en el selector de fecha
  function configurarCampoFecha() {
    if (!campoFechaModal) return;
    const limites = obtenerLimitesFecha();
    campoFechaModal.min = limites.min;
    campoFechaModal.max = limites.max;
    // Si escriben una fecha fuera de rango, se descarta y se avisa
    const validarEntrada = () => {
      if (campoFechaModal.value && !fechaLimiteEsValida(campoFechaModal.value)) {
        campoFechaModal.value = '';
        mostrarToastTareas('La fecha debe estar entre hoy y los próximos 6 meses.', 'advertencia');
      }
    };
    campoFechaModal.addEventListener('input', validarEntrada);
    campoFechaModal.addEventListener('change', validarEntrada);
    campoFechaModal.addEventListener('blur', validarEntrada);
  }

  function abrir_modal() {
    if (!modal) return;
    const limites = obtenerLimitesFecha();
    if (campoFechaModal) {
      campoFechaModal.min = limites.min;
      campoFechaModal.max = limites.max;
    }
    poblarListaPersonasModal();
    modal.classList.add('modal_activo');
  }

  function cerrar_modal() {
    if (modal) modal.classList.remove('modal_activo');
    if (formularioTarea) formularioTarea.reset();
    if (buscadorPersonasModal) buscadorPersonasModal.value = '';
    personaSeleccionada = null;
    if (textoDeptoPersona) textoDeptoPersona.textContent = 'Se asignará una sola persona.';
    tareaEnEdicionId = null;
  }

  function cerrarModalDetalle() {
    if (modalVerTarea) modalVerTarea.classList.remove('modal_activo');
  }

  // Sincroniza la persona al escribir o elegir del datalist
  if (buscadorPersonasModal) {
    buscadorPersonasModal.addEventListener('input', resolverPersonaSeleccionada);
    buscadorPersonasModal.addEventListener('change', resolverPersonaSeleccionada);
  }

  if (btnCerrarDetalleCruz) btnCerrarDetalleCruz.addEventListener('click', cerrarModalDetalle);
  if (btnCerrarDetallePie) btnCerrarDetallePie.addEventListener('click', cerrarModalDetalle);
  if (modalVerTarea) {
    modalVerTarea.addEventListener('click', (e) => {
      if (e.target === modalVerTarea) cerrarModalDetalle();
    });
  }

  if (botonAbrir) {
    botonAbrir.addEventListener('click', () => {
      tareaEnEdicionId = null;
      if (tituloModalTexto) tituloModalTexto.textContent = 'Nueva Tarea';
      if (botonGuardarTexto) botonGuardarTexto.textContent = 'Guardar tarea';
      abrir_modal();
    });
  }

  if (botonCerrarCruz) botonCerrarCruz.addEventListener('click', cerrar_modal);
  if (botonCancelar) botonCancelar.addEventListener('click', cerrar_modal);

  if (modal) {
    modal.addEventListener('click', evento => {
      if (evento.target === modal) cerrar_modal();
    });
  }

  function formatearFecha(fechaStr) {
    if (!fechaStr) return '-';
    const soloFecha = fechaStr.includes('T') ? fechaStr.split('T')[0] : fechaStr;
    if (soloFecha.includes('-')) {
      const partes = soloFecha.split('-');
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return soloFecha;
  }

  // LOGICA DE FILTRADO RÁPIDO Y BÚSQUEDA
  window.cambiarAlcanceTareas = function(nuevoAlcance, boton) {
    alcanceActualTareas = nuevoAlcance;
    document.querySelectorAll('.pestana_tarea').forEach(btn => btn.classList.remove('activa'));
    if (boton) boton.classList.add('activa');
    paginaActual = 1;
    renderizarTabla();
  };

  function obtenerTareasFiltradas() {
    const textoBusqueda = inputTexto ? inputTexto.value.toLowerCase().trim() : '';
    const depFiltro = selectDepartamento ? selectDepartamento.value : 'todos';
    const estFiltro = selectEstado ? selectEstado.value : 'todos';

    let usuarioActual = null;
    try {
      usuarioActual = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (e) {
      usuarioActual = null;
    }

    const miId = usuarioActual && usuarioActual.id ? String(usuarioActual.id) : '';
    const miNombre = usuarioActual && (usuarioActual.nombre || usuarioActual.correo || usuarioActual.usuario || '').toLowerCase().trim();
    const miDepto = usuarioActual && (usuarioActual.departamento || usuarioActual.departamento_nombre || '').toLowerCase().trim();

    return tareas.filter(tarea => {
      // 1. Filtro rápido de alcance (Pestañas superiores)
      if (alcanceActualTareas === 'mias') {
        const asignadoTexto = (tarea.asignado || tarea.asignado_a || tarea.personas || '').toLowerCase();
        const coincideNombre = miNombre && asignadoTexto.includes(miNombre);
        const coincideId = miId && String(tarea.usuario_id) === miId;
        if (!coincideNombre && !coincideId) return false;
      } else if (alcanceActualTareas === 'departamento') {
        const deptoTarea = (tarea.departamento || tarea.departamento_nombre || '').toLowerCase();
        const esGeneral = deptoTarea.includes('general');
        const coincideDepto = miDepto && deptoTarea.includes(miDepto);
        if (!esGeneral && !coincideDepto) return false;
      }

      // 2. Filtros de texto, select departamento y select estado
      const tituloT = (tarea.titulo || '').toLowerCase();
      const descT = (tarea.descripcion || tarea.detalles || '').toLowerCase();
      const asigT = (tarea.asignado || tarea.asignado_a || tarea.personas || '').toLowerCase();
      const deptoTexto = (tarea.departamento || tarea.departamento_nombre || 'General').toLowerCase();
      const estadoT = tarea.estado || 'Pendiente';

      const coincideTexto = [tituloT, descT, asigT].join(' ').includes(textoBusqueda);
      const coincideDep = depFiltro === 'todos' || deptoTexto.includes(depFiltro.toLowerCase());
      const coincideEst = estFiltro === 'todos' || estadoT === estFiltro;

      return coincideTexto && coincideDep && coincideEst;
    });
  }

  // Devuelve hasta cuatro números de página con elipsis si hay más de diez
  function obtenerPaginasVisibles(actual, total) {
    if (total <= 4) return Array.from({ length: total }, (_, indice) => indice + 1);
    if (total > 10) {
      if (actual <= 4) return [1, 2, 3, '...', total];
      if (actual >= total - 3) return [1, '...', total - 2, total - 1, total];
      return [1, '...', actual - 1, actual, '...', total];
    }
    const inicio = Math.min(Math.max(actual - 1, 1), total - 3);
    return [inicio, inicio + 1, inicio + 2, inicio + 3];
  }

  // Paginación con flechas y máximo cuatro números visibles
  function renderizarPaginacion(totalPaginas) {
    if (!contenedorPaginacion) return;
    contenedorPaginacion.replaceChildren();

    const agregarBoton = (texto, pagina, etiqueta, deshabilitado = false, clase = '') => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = `boton_pagina ${clase} ${pagina === paginaActual && !deshabilitado ? 'boton_pagina_activo' : ''}`.trim();
      boton.textContent = texto;
      boton.setAttribute('aria-label', etiqueta);
      boton.disabled = deshabilitado;
      if (!deshabilitado) {
        boton.addEventListener('click', () => {
          paginaActual = pagina;
          renderizarTabla();
        });
      }
      contenedorPaginacion.appendChild(boton);
    };

    // Flecha izquierda siempre visible
    agregarBoton('<', Math.max(1, paginaActual - 1), 'Página anterior', paginaActual === 1, 'boton_pagina_flecha');

    // Números y puntos suspensivos
    obtenerPaginasVisibles(paginaActual, totalPaginas).forEach(valor => {
      if (valor === '...') {
        const puntos = document.createElement('span');
        puntos.className = 'elipsis_paginacion';
        puntos.textContent = '…';
        contenedorPaginacion.appendChild(puntos);
      } else {
        agregarBoton(String(valor), valor, `Página ${valor}`);
      }
    });

    // Flecha derecha siempre visible
    agregarBoton('>', Math.min(totalPaginas, paginaActual + 1), 'Página siguiente', paginaActual === totalPaginas, 'boton_pagina_flecha');
  }

  // Abre o cierra el menú de opciones de una tarea
  window.toggleMenuOpcionesTarea = function(evento, idTarea) {
    evento.stopPropagation();
    document.querySelectorAll('[id^="menu_opciones_tarea_"]').forEach(menu => {
      if (menu.id !== `menu_opciones_tarea_${idTarea}`) menu.classList.remove('menu_abierto');
    });
    const menu = document.getElementById(`menu_opciones_tarea_${idTarea}`);
    if (menu) menu.classList.toggle('menu_abierto');
  };

  // Cierra los menús al hacer clic fuera
  window.addEventListener('click', () => {
    document.querySelectorAll('[id^="menu_opciones_tarea_"]').forEach(menu => {
      menu.classList.remove('menu_abierto');
    });
  });

  window.prepararEdicionTarea = function(id, puedeGestionar, titulo, descripcion, departamentoDestino, asignadoTexto, fechaISO, estadoValor) {
    const tarea = tareas.find(item => Number(item.id) === Number(id));
    if (!puedeGestionar || !puedeGestionarTarea(tarea)) {
      mostrarToastTareas('No tienes permisos para editar esta tarea.', 'error');
      return;
    }

    tareaEnEdicionId = Number(id);
    if (tituloModalTexto) tituloModalTexto.textContent = 'Editar Tarea';
    if (botonGuardarTexto) botonGuardarTexto.textContent = 'Guardar cambios';

    document.getElementById('campo_modal_titulo').value = decodeURIComponent(titulo || '');
    const descripcionDecodificada = decodeURIComponent(descripcion || '');
    document.getElementById('campo_modal_descripcion').value = descripcionDecodificada !== '-' ? descripcionDecodificada : '';

    // Edición con una sola persona asignada
    asignadoTexto = decodeURIComponent(asignadoTexto || '');
    const primerNombre = (asignadoTexto || '').split(',')[0].trim();
    if (buscadorPersonasModal) {
      buscadorPersonasModal.value = primerNombre === 'General / Sin asignar' ? '' : primerNombre;
    }
    resolverPersonaSeleccionada();

    let fechaLimpia = fechaISO || '';
    if (fechaLimpia.includes('T')) fechaLimpia = fechaLimpia.split('T')[0];
    if (fechaLimpia && !fechaLimiteEsValida(fechaLimpia)) {
      fechaLimpia = '';
      mostrarToastTareas('La fecha límite debe estar entre hoy y los próximos 6 meses.', 'advertencia');
    }
    document.getElementById('campo_modal_fecha').value = fechaLimpia;
    document.getElementById('campo_modal_estado').value = estadoValor;

    abrir_modal();
  };

  window.cambiarEstadoTareaDirecto = async function(id, puedeGestionar, nuevoEstado) {
    const tarea = tareas.find(t => Number(t.id) === Number(id));
    if (!tarea) return;
    if (!puedeGestionar || !puedeGestionarTarea(tarea)) {
      mostrarToastTareas('No tienes permisos para modificar esta tarea.', 'error');
      return;
    }

    try {
      const datos = await window.OCID.apiFetch(`/tareas/${id}`, {
        method: 'PUT',
        // Actualización parcial: no reenvía una fecha antigua que ya no sería válida
        body: JSON.stringify({ estado: nuevoEstado })
      });
      if (!datos.success) throw new Error('No se pudo actualizar el estado');

      tarea.estado = nuevoEstado;
      mostrarToastTareas(`Estado actualizado a "${nuevoEstado}".`, 'exito');
      renderizarTabla();
    } catch (err) {
      mostrarToastTareas('No se pudo actualizar el estado.', 'error');
    }
  };

  window.eliminarTareaDirecto = async function(id, puedeGestionar) {
    const tarea = tareas.find(item => Number(item.id) === Number(id));
    if (!tarea || !puedeGestionar || !puedeGestionarTarea(tarea)) {
      mostrarToastTareas('No tienes permisos para eliminar esta tarea.', 'error');
      return;
    }

    // Confirmación personalizada antes de eliminar la tarea
    if (!await window.OCID.confirmarAccion('¿Estás seguro de que deseas eliminar esta tarea?')) return;

    try {
      const datos = await window.OCID.apiFetch(`/tareas/${id}`, {
        method: 'DELETE'
      });
      if (!datos.success) throw new Error('No se pudo eliminar');

      tareas = tareas.filter(t => Number(t.id) !== Number(id));
      mostrarToastTareas('Tarea eliminada con éxito.', 'exito');
      renderizarTabla();
    } catch (error) {
      mostrarToastTareas('No se pudo eliminar la tarea.', 'error');
    }
  };

  function actualizarPanelesLaterales() {
    // 1. Panel Por Estado
    const contenedorEstados = document.getElementById('lista_conteo_estados');
    if (contenedorEstados) {
      contenedorEstados.replaceChildren();
      const estadosDef = [
        { nombre: 'Pendiente', color: 'punto_departamento_0' },
        { nombre: 'En proceso', color: 'punto_departamento_1' },
        { nombre: 'Completado', color: 'punto_departamento_2' }
      ];

      estadosDef.forEach(est => {
        const cantidad = tareas.filter(t => (t.estado || 'Pendiente').toLowerCase() === est.nombre.toLowerCase()).length;
        const fila = document.createElement('div');
        fila.className = 'fila_conteo_departamento';
        fila.classList.add('fila_conteo_clicable');

        const etiqueta = document.createElement('span');
        etiqueta.className = 'indicador_con_nombre';
        const punto = document.createElement('span');
        punto.className = `punto_departamento ${est.color}`;
        const nombre = document.createElement('span');
        nombre.textContent = est.nombre;
        etiqueta.append(punto, nombre);

        const cifra = document.createElement('span');
        cifra.className = 'cifra_departamento';
        cifra.textContent = String(cantidad);

        fila.append(etiqueta, cifra);
        fila.addEventListener('click', () => {
          if (selectEstado) selectEstado.value = est.nombre;
          paginaActual = 1;
          renderizarTabla();
        });
        contenedorEstados.appendChild(fila);
      });

      const btnVerTodoEstados = document.getElementById('boton_ver_todo_estados');
      if (btnVerTodoEstados) {
        btnVerTodoEstados.onclick = () => {
          if (selectEstado) selectEstado.value = 'todos';
          paginaActual = 1;
          renderizarTabla();
        };
      }
    }

    // 2. Panel Por Departamento
    const contenedorDeptos = document.getElementById('lista_conteo_departamentos');
    if (contenedorDeptos) {
      contenedorDeptos.replaceChildren();
      const deptosMap = new Map();
      tareas.forEach(t => {
        const depto = t.departamento || 'General';
        deptosMap.set(depto, (deptosMap.get(depto) || 0) + 1);
      });

      let idx = 0;
      deptosMap.forEach((cantidad, deptoNombre) => {
        const fila = document.createElement('div');
        fila.className = 'fila_conteo_departamento';
        fila.classList.add('fila_conteo_clicable');

        const etiqueta = document.createElement('span');
        etiqueta.className = 'indicador_con_nombre';
        const punto = document.createElement('span');
        punto.className = `punto_departamento punto_departamento_${idx % 5}`;
        const nombre = document.createElement('span');
        nombre.textContent = deptoNombre;
        etiqueta.append(punto, nombre);

        const cifra = document.createElement('span');
        cifra.className = 'cifra_departamento';
        cifra.textContent = String(cantidad);

        fila.append(etiqueta, cifra);
        fila.addEventListener('click', () => {
          if (selectDepartamento) {
            const match = Array.from(selectDepartamento.options).find(opt => opt.text.toLowerCase() === deptoNombre.toLowerCase() || opt.value.toLowerCase() === deptoNombre.toLowerCase());
            if (match) selectDepartamento.value = match.value;
          }
          paginaActual = 1;
          renderizarTabla();
        });
        contenedorDeptos.appendChild(fila);
        idx++;
      });

      // Estado vacío con texto UTF-8 correcto
      if (!deptosMap.size) {
        const vacio = document.createElement('p');
        vacio.className = 'estado_conteo_vacio';
        vacio.textContent = 'Aún no has recibido tareas.';
        contenedorDeptos.appendChild(vacio);
      }

      const btnVerTodoDeptos = document.getElementById('boton_ver_todo_departamentos');
      if (btnVerTodoDeptos) {
        btnVerTodoDeptos.onclick = () => {
          if (selectDepartamento) selectDepartamento.value = 'todos';
          paginaActual = 1;
          renderizarTabla();
        };
      }
    }
  }

  function renderizarTabla() {
    if (!cuerpoTabla) return;
    cuerpoTabla.replaceChildren();

    let usuarioActual = null;
    try {
      usuarioActual = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (e) {
      usuarioActual = null;
    }

    const tareasFiltradas = obtenerTareasFiltradas();
    const totalPaginas = Math.ceil(tareasFiltradas.length / elementosPorPagina) || 1;

    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    const inicio = (paginaActual - 1) * elementosPorPagina;
    const fin = inicio + elementosPorPagina;
    const tareasPagina = tareasFiltradas.slice(inicio, fin);

    // Estado vacío de la tabla con acento correcto
    if (!tareasFiltradas.length) {
      // Tarjeta vacía centrada con ícono y texto gris suave
      const vacio = document.createElement('div');
      vacio.className = 'tarjeta_anuncio estado_vacio_tareas';
      const iconoVacio = document.createElement('i');
      iconoVacio.className = 'fa-solid fa-list-check icono_estado_vacio';
      const textoVacio = document.createElement('span');
      textoVacio.textContent = 'Aún no has recibido tareas.';
      vacio.append(iconoVacio, textoVacio);
      cuerpoTabla.appendChild(vacio);
    }

    tareasPagina.forEach(tarea => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'tarjeta_anuncio tarjeta_tarea';
      // El id vive en el objeto tarea del closure, sin atributos personalizados

      const estadoValor = tarea.estado || 'Pendiente';
      let claseBadge = 'etiqueta_urgente';
      if (estadoValor.toLowerCase().includes('proceso')) claseBadge = 'etiqueta_moderado';
      else if (estadoValor.toLowerCase().includes('complet')) claseBadge = 'etiqueta_general';

      const tituloTexto = tarea.titulo || '-';
      const descripcionTexto = tarea.descripcion || tarea.detalles || '-';
      const asignadoTexto = tarea.asignado || tarea.asignado_a || tarea.personas || 'General / Sin asignar';
      const nombreCreador = tarea.autor_nombre || 'Sistema';
      const deptoDestino = tarea.departamento || 'General';

      const puedeGestionar = puedeGestionarTarea(tarea, usuarioActual);
      const esLarga = descripcionTexto.length > 120;

      // 1. Fila de Estado y Menú de Opciones
      const filaEtiqueta = document.createElement('div');
      filaEtiqueta.className = 'fila_etiqueta_anuncio';

      const spanEstado = document.createElement('span');
      spanEstado.className = `etiqueta_tipo ${claseBadge}`;
      const punto = document.createElement('span');
      punto.className = 'punto_etiqueta';
      spanEstado.appendChild(punto);
      spanEstado.appendChild(document.createTextNode(` ${estadoValor}`));
      filaEtiqueta.appendChild(spanEstado);

      if (puedeGestionar) {
        const contenedorOpciones = document.createElement('div');
        contenedorOpciones.className = 'contenedor_opciones_tarea';

        const btnOpciones = document.createElement('button');
        btnOpciones.className = 'boton_opciones_anuncio';
        btnOpciones.type = 'button';
        btnOpciones.title = 'Más opciones';
        btnOpciones.setAttribute('aria-label', 'Opciones de tarea');
        btnOpciones.innerHTML = '&#8942;';
        btnOpciones.addEventListener('click', (e) => toggleMenuOpcionesTarea(e, tarea.id));
        contenedorOpciones.appendChild(btnOpciones);

        const menuDesplegable = document.createElement('div');
        menuDesplegable.id = `menu_opciones_tarea_${tarea.id}`;
        menuDesplegable.className = 'menu_opciones_tarea';

        const btnEditar = document.createElement('button');
        btnEditar.type = 'button';
        btnEditar.className = 'boton_menu_tarea';
        btnEditar.innerHTML = '<svg fill="none" height="15" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Editar';
        btnEditar.addEventListener('click', () => prepararEdicionTarea(tarea.id, puedeGestionar, encodeURIComponent(tituloTexto), encodeURIComponent(descripcionTexto), encodeURIComponent(deptoDestino), encodeURIComponent(asignadoTexto), tarea.fecha, estadoValor));

        const btnPendiente = document.createElement('button');
        btnPendiente.type = 'button';
        btnPendiente.className = 'boton_menu_tarea boton_menu_tarea_pendiente';
        btnPendiente.textContent = 'Marcar Pendiente';
        btnPendiente.addEventListener('click', () => cambiarEstadoTareaDirecto(tarea.id, puedeGestionar, 'Pendiente'));

        const btnProceso = document.createElement('button');
        btnProceso.type = 'button';
        btnProceso.className = 'boton_menu_tarea boton_menu_tarea_proceso';
        btnProceso.textContent = 'Marcar En proceso';
        btnProceso.addEventListener('click', () => cambiarEstadoTareaDirecto(tarea.id, puedeGestionar, 'En proceso'));

        const btnCompletado = document.createElement('button');
        btnCompletado.type = 'button';
        btnCompletado.className = 'boton_menu_tarea boton_menu_tarea_completado';
        btnCompletado.textContent = 'Marcar Completado';
        btnCompletado.addEventListener('click', () => cambiarEstadoTareaDirecto(tarea.id, puedeGestionar, 'Completado'));

        const btnEliminar = document.createElement('button');
        btnEliminar.type = 'button';
        btnEliminar.className = 'boton_menu_tarea boton_menu_tarea_eliminar';
        btnEliminar.innerHTML = '<svg fill="none" height="15" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Eliminar';
        btnEliminar.addEventListener('click', () => eliminarTareaDirecto(tarea.id, puedeGestionar));

        menuDesplegable.append(btnEditar, btnPendiente, btnProceso, btnCompletado, btnEliminar);
        contenedorOpciones.appendChild(menuDesplegable);
        filaEtiqueta.appendChild(contenedorOpciones);
      }
      tarjeta.appendChild(filaEtiqueta);

      // 2. Título de la tarea
      const h3Titulo = document.createElement('h3');
      h3Titulo.className = 'titulo_anuncio';
      h3Titulo.textContent = tituloTexto;
      tarjeta.appendChild(h3Titulo);

      // 3. Subtítulo de autoría simplificado: Únicamente "Creado por: [Nombre]" (sin departamento)
      const subtituloAutor = document.createElement('div');
      subtituloAutor.className = 'subtitulo_autor_tarea';
      subtituloAutor.textContent = `Creado por: ${nombreCreador}`;
      tarjeta.appendChild(subtituloAutor);

      // 4. Descripción
      const pDesc = document.createElement('p');
      pDesc.className = 'descripcion_anuncio';
      pDesc.textContent = descripcionTexto;
      tarjeta.appendChild(pDesc);

      if (esLarga) {
        const btnVerMas = document.createElement('button');
        btnVerMas.type = 'button';
        btnVerMas.className = 'class_btn_ver_mas';
        btnVerMas.textContent = 'Ver tarea completa';
        btnVerMas.addEventListener('click', () => {
          const elTitulo = document.getElementById('detalle_titulo_tarea');
          const elCreador = document.getElementById('detalle_creador_tarea');
          const elAsignado = document.getElementById('detalle_asignado_tarea');
          const elFecha = document.getElementById('detalle_fecha_tarea');
          const elEstado = document.getElementById('detalle_estado_tarea');
          const elDesc = document.getElementById('detalle_descripcion_tarea');

          if (elTitulo) elTitulo.textContent = tituloTexto;
          if (elCreador) elCreador.textContent = `Creado por: ${nombreCreador}`;
          if (elAsignado) elAsignado.textContent = asignadoTexto;
          if (elFecha) elFecha.textContent = formatearFecha(tarea.fecha);
          if (elEstado) elEstado.innerHTML = `<span class="etiqueta_tipo ${claseBadge}"><span class="punto_etiqueta"></span> ${escaparHTML(estadoValor)}</span>`;
          if (elDesc) elDesc.textContent = descripcionTexto;

          if (modalVerTarea) modalVerTarea.classList.add('modal_activo');
        });
        tarjeta.appendChild(btnVerMas);
      }

      // 5. Metadatos (Asignado a, Departamento, Fecha límite)
      const filaMeta = document.createElement('div');
      filaMeta.className = 'fila_metadatos_anuncio';

      const crearMeta = (svgPath, texto) => {
        const span = document.createElement('span');
        span.className = 'item_metadato';
        span.innerHTML = `<svg class="icono_metadato" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${svgPath}"/></svg> ${escaparHTML(texto)}`;
        return span;
      };

      filaMeta.appendChild(crearMeta('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', `Asignado: ${asignadoTexto}`));
      filaMeta.appendChild(crearMeta('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5', deptoDestino));
      filaMeta.appendChild(crearMeta('M8 7V3m8 7V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', `Vence: ${formatearFecha(tarea.fecha)}`));
      tarjeta.appendChild(filaMeta);

      // 6. Botón "Visto" deshabilitado cuando la tarea es propia
      const esPropio = esTareaPropio(tarea, usuarioActual);
      if (esPropio) tarea.visto = true;
      const botonVisto = document.createElement('button');
      botonVisto.type = 'button';
      botonVisto.className = 'boton_visto_elemento' + (tarea.visto ? ' visto' : ' pendiente') +
        (esPropio ? ' boton_visto_propio' : '');
      botonVisto.innerHTML = tarea.visto
        ? '<svg class="icono_check_visto" viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg><span>Visto</span>'
        : '<svg class="icono_check_visto" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="4 10 8 14 16 6"></polyline></svg><span>Marcar como visto</span>';
      botonVisto.disabled = Boolean(tarea.visto);
      botonVisto.setAttribute('aria-label', esPropio ? 'Tarea propia, ya vista' :
        (tarea.visto ? 'Tarea vista' : 'Marcar tarea como vista'));
      if (!esPropio) {
        botonVisto.addEventListener('click', async (e) => {
          e.stopPropagation();
          botonVisto.disabled = true;
          try {
            await window.OCID.marcarElementoVisto('tarea', Number(tarea.id));
            tarea.visto = true;
            renderizarTabla();
          } catch (error) {
            mostrarToastTareas(error.message || 'No se pudo marcar la tarea como vista.', 'error');
            botonVisto.disabled = false;
          }
        });
      }
      tarjeta.appendChild(botonVisto);

      cuerpoTabla.appendChild(tarjeta);
    });

    if (textoConteo) {
      // Formato solicitado: Mostrando X de 4 por página
      textoConteo.textContent = `Mostrando ${tareasPagina.length} de ${elementosPorPagina}`;
    }

    renderizarPaginacion(totalPaginas);
    actualizarPanelesLaterales();
  }

  if (inputTexto) inputTexto.addEventListener('input', () => { paginaActual = 1; renderizarTabla(); });
  if (selectDepartamento) selectDepartamento.addEventListener('change', () => { paginaActual = 1; renderizarTabla(); });
  if (selectEstado) selectEstado.addEventListener('change', () => { paginaActual = 1; renderizarTabla(); });

  if (formularioTarea) {
    formularioTarea.addEventListener('submit', async evento => {
      evento.preventDefault();

      let usuario;
      try {
        usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
      } catch (e) {
        usuario = null;
      }

      if (!usuario || !usuario.id) {
        mostrarToastTareas('Inicia sesión para realizar esta acción.', 'advertencia');
        return;
      }

      // Validación de la persona única asignada
      resolverPersonaSeleccionada();
      if (!personaSeleccionada) {
        mostrarToastTareas('Selecciona una persona de la lista desplegable.', 'advertencia');
        return;
      }

      const fechaSeleccionada = campoFechaModal ? campoFechaModal.value : '';
      if (!fechaLimiteEsValida(fechaSeleccionada)) {
        mostrarToastTareas('La fecha límite debe estar entre hoy y los próximos 6 meses.', 'advertencia');
        return;
      }

      const deptoDestino = personaSeleccionada.departamento || personaSeleccionada.departamento_nombre || 'General';

      const objetoTarea = {
        titulo: document.getElementById('campo_modal_titulo').value.trim(),
        descripcion: document.getElementById('campo_modal_descripcion').value.trim(),
        asignado: personaSeleccionada.nombre || personaSeleccionada.correo || personaSeleccionada.usuario,
        departamento: deptoDestino,
        fecha: fechaSeleccionada,
        estado: document.getElementById('campo_modal_estado').value,
        autor_id: Number(usuario.id)
      };

      try {
        let ruta = '/tareas';
        let metodo = 'POST';
        let esEdicion = tareaEnEdicionId !== null;

        if (esEdicion) {
          ruta = `/tareas/${tareaEnEdicionId}`;
          metodo = 'PUT';
        }

        const datos = await window.OCID.apiFetch(ruta, {
          method: metodo,
          body: JSON.stringify(objetoTarea)
        });

        if (!datos.success) {
          throw new Error('No se pudo guardar la tarea');
        }

        cerrar_modal();
        const mensajeExito = esEdicion ? 'Tarea actualizada con éxito.' : 'Tarea creada con éxito.';
        mostrarToastTareas(mensajeExito, 'exito');

        await cargarCatalogosServidor();
      } catch (error) {
        mostrarToastTareas('Ocurrió un error al guardar la tarea.', 'error');
      }
    });
  }

  // Rango de fecha y carga inicial
  configurarCampoFecha();
  cargarCatalogosServidor();
});