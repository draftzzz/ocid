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
      avatar.style.fontSize = '14px';
      avatar.style.fontWeight = '700';
      avatar.style.display = 'flex';
      avatar.style.alignItems = 'center';
      avatar.style.justifyContent = 'center';
      avatar.style.color = '#ffffff';
      avatar.style.backgroundColor = '#2563eb';
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
  const cuerpoTabla = document.getElementById('cuerpo_tabla_tareas');
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

  const buscadorDeptosModal = document.getElementById('buscador_deptos_modal');
  const buscadorPersonasModal = document.getElementById('buscador_personas_modal');
  const contenedorPersonas = document.getElementById('contenedor_lista_personas');
  const contenedorCheckboxesDeptos = document.getElementById('lista_checkboxes_deptos_servidor');
  const checkGeneralDepto = document.getElementById('check_general_depto');

  const modalVerTarea = document.getElementById('modal_ver_tarea');
  const btnCerrarDetalleCruz = document.getElementById('cerrar_modal_detalle');
  const btnCerrarDetallePie = document.getElementById('boton_cerrar_detalle_pie');

  let tareas = [];
  let listaDepartamentos = [];
  let listaDocentesUsuarios = [];
  let paginaActual = 1;
  const elementosPorPagina = 3; 
  let tareaEnEdicionId = null;
  let alcanceActualTareas = 'todas'; // 'todas' | 'mias' | 'departamento'

  let departamentosSeleccionadosIDs = new Set();
  let personasSeleccionadasIDs = new Set();

  function obtenerFechaActualISO() {
    const ahora = new Date();
    const anio = ahora.getFullYear();
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const dia = String(ahora.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
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
      tareas = Array.isArray(datosTareas) ? datosTareas : [];
    } catch (error) {
      console.error('Error cargando catálogos:', error);
      mostrarToastTareas('Error al sincronizar datos con el servidor.', 'error');
      tareas = [];
    }
    renderizarTabla();
  }

  function poblarFiltrosYModalDepartamentos(deptos) {
    if (selectDepartamento) {
      selectDepartamento.innerHTML = '<option value="todos">Todos los departamentos</option>';
      deptos.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.nombre;
        opt.textContent = d.nombre;
        selectDepartamento.appendChild(opt);
      });
    }
    renderizarListaDepartamentosModal();
  }

  function renderizarListaDepartamentosModal() {
    if (!contenedorCheckboxesDeptos) return;
    contenedorCheckboxesDeptos.replaceChildren();

    const filtroTexto = buscadorDeptosModal ? buscadorDeptosModal.value.toLowerCase().trim() : '';

    listaDepartamentos.forEach(d => {
      const nombreDepto = d.nombre;
      const coincideBusqueda = filtroTexto.length > 0 && nombreDepto.toLowerCase().includes(filtroTexto);
      const estaSeleccionado = departamentosSeleccionadosIDs.has(nombreDepto);

      if (coincideBusqueda || estaSeleccionado) {
        const lbl = document.createElement('label');
        lbl.className = 'item_checkbox_diseno wrapper_depto_item';
        
        lbl.innerHTML = `
          <input type="checkbox" class="check_depto_item" value="${escaparHTML(nombreDepto)}" ${estaSeleccionado ? 'checked' : ''} /> 
          <span>${escaparHTML(nombreDepto)}</span>
        `;

        const inputCheck = lbl.querySelector('input');
        inputCheck.addEventListener('change', (e) => {
          if (e.target.checked) {
            departamentosSeleccionadosIDs.add(nombreDepto);
            if (checkGeneralDepto) checkGeneralDepto.checked = false;
          } else {
            departamentosSeleccionadosIDs.delete(nombreDepto);
          }
          renderizarListaPersonasModal();
        });

        contenedorCheckboxesDeptos.appendChild(lbl);
      }
    });

    if (contenedorCheckboxesDeptos.children.length === 0) {
      contenedorCheckboxesDeptos.innerHTML = '<span style="font-size: 12px; color: #94a3b8; padding: 6px;">Escribe para buscar departamentos...</span>';
    }
  }

  function renderizarListaPersonasModal() {
    if (!contenedorPersonas) return;
    contenedorPersonas.replaceChildren();

    const filtroTexto = buscadorPersonasModal ? buscadorPersonasModal.value.toLowerCase().trim() : '';
    const esGen = checkGeneralDepto && checkGeneralDepto.checked;

    const personasFiltradas = listaDocentesUsuarios.filter(persona => {
      const nombrePersona = (persona.nombre || persona.correo || persona.usuario || '').toLowerCase();
      const deptoPersona = persona.departamento || persona.departamento_nombre || '';

      const coincideTexto = filtroTexto.length > 0 && nombrePersona.includes(filtroTexto);
      const estaSeleccionada = personasSeleccionadasIDs.has(persona.nombre || persona.correo || persona.usuario);
      const coincideDepto = esGen || (departamentosSeleccionadosIDs.size > 0 && departamentosSeleccionadosIDs.has(deptoPersona));

      return (coincideTexto && (departamentosSeleccionadosIDs.size === 0 || coincideDepto)) || estaSeleccionada || (filtroTexto.length === 0 && coincideDepto);
    });

    if (personasFiltradas.length === 0) {
      contenedorPersonas.innerHTML = '<span style="font-size: 12px; color: #94a3b8; padding: 6px;">Selecciona un departamento o busca docentes por nombre...</span>';
      return;
    }

    personasFiltradas.forEach(p => {
      const nombreP = p.nombre || p.correo || p.usuario || 'Colaborador';
      const deptoP = p.departamento || p.departamento_nombre || 'General';

      const lblPersona = document.createElement('label');
      lblPersona.className = 'item_checkbox_diseno';
      
      const estaChecked = personasSeleccionadasIDs.has(nombreP);

      lblPersona.innerHTML = `
        <input type="checkbox" class="check_persona_asignada" value="${escaparHTML(nombreP)}" ${estaChecked ? 'checked' : ''} /> 
        <span>${escaparHTML(nombreP)} <small style="color: #64748b;">(${escaparHTML(deptoP)})</small></span>
      `;

      const inputCheck = lblPersona.querySelector('input');
      inputCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
          personasSeleccionadasIDs.add(nombreP);
        } else {
          personasSeleccionadasIDs.delete(nombreP);
        }
      });

      contenedorPersonas.appendChild(lblPersona);
    });
  }

  if (buscadorDeptosModal) {
    buscadorDeptosModal.addEventListener('input', renderizarListaDepartamentosModal);
  }

  if (buscadorPersonasModal) {
    buscadorPersonasModal.addEventListener('input', renderizarListaPersonasModal);
  }

  if (checkGeneralDepto) {
    checkGeneralDepto.addEventListener('change', () => {
      if (checkGeneralDepto.checked) {
        departamentosSeleccionadosIDs.clear();
        document.querySelectorAll('.check_depto_item').forEach(ch => ch.checked = false);
      }
      renderizarListaDepartamentosModal();
      renderizarListaPersonasModal();
    });
  }

  function abrir_modal() {
    if (modal) {
      if (campoFechaModal) campoFechaModal.min = obtenerFechaActualISO();
      modal.classList.add('modal_activo');
      renderizarListaDepartamentosModal();
      renderizarListaPersonasModal();
    }
  }

  function cerrar_modal() {
    if (modal) modal.classList.remove('modal_activo');
    if (formularioTarea) formularioTarea.reset();
    if (buscadorDeptosModal) buscadorDeptosModal.value = '';
    if (buscadorPersonasModal) buscadorPersonasModal.value = '';
    departamentosSeleccionadosIDs.clear();
    personasSeleccionadasIDs.clear();
    tareaEnEdicionId = null;
  }

  function cerrarModalDetalle() {
    if (modalVerTarea) modalVerTarea.classList.remove('modal_activo');
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
      departamentosSeleccionadosIDs.clear();
      personasSeleccionadasIDs.clear();
      if (tituloModalTexto) tituloModalTexto.textContent = 'Nueva Tarea';
      if (botonGuardarTexto) botonGuardarTexto.textContent = 'Guardar tarea';
      
      if (checkGeneralDepto) checkGeneralDepto.checked = false;
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

  function renderizarPaginacion(totalPaginas) {
    if (!contenedorPaginacion) return;
    contenedorPaginacion.replaceChildren();

    for (let i = 1; i <= totalPaginas; i++) {
      const btnPag = document.createElement('button');
      btnPag.type = 'button';
      btnPag.className = 'boton_pagina' + (i === paginaActual ? ' boton_pagina_activo' : '');
      btnPag.textContent = i;
      btnPag.addEventListener('click', () => {
        paginaActual = i;
        renderizarTabla();
      });
      contenedorPaginacion.appendChild(btnPag);
    }

    const btnSiguiente = document.createElement('button');
    btnSiguiente.type = 'button';
    btnSiguiente.className = 'boton_pagina';
    btnSiguiente.innerHTML = '&gt;';
    btnSiguiente.disabled = paginaActual >= totalPaginas;
    btnSiguiente.addEventListener('click', () => {
      if (paginaActual < totalPaginas) {
        paginaActual++;
        renderizarTabla();
      }
    });
    contenedorPaginacion.appendChild(btnSiguiente);
  }

  window.toggleMenuOpcionesTarea = function(evento, idTarea) {
    evento.stopPropagation();
    document.querySelectorAll('[id^="menu_opciones_tarea_"]').forEach(menu => {
      if (menu.id !== `menu_opciones_tarea_${idTarea}`) menu.style.display = 'none';
    });

    const menu = document.getElementById(`menu_opciones_tarea_${idTarea}`);
    if (menu) {
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
  };

  window.addEventListener('click', () => {
    document.querySelectorAll('[id^="menu_opciones_tarea_"]').forEach(menu => {
      menu.style.display = 'none';
    });
  });

  window.prepararEdicionTarea = function(id, esAutor, titulo, descripcion, deptoCreador, asignadoTexto, fechaISO, estadoValor) {
    if (!esAutor) {
      mostrarToastTareas('No tienes permisos para editar esta tarea porque no eres el autor.', 'error');
      return;
    }

    tareaEnEdicionId = Number(id);
    if (tituloModalTexto) tituloModalTexto.textContent = 'Editar Tarea';
    if (botonGuardarTexto) botonGuardarTexto.textContent = 'Guardar cambios';

    document.getElementById('campo_modal_titulo').value = titulo || '';
    document.getElementById('campo_modal_descripcion').value = descripcion !== '-' ? descripcion : '';

    departamentosSeleccionadosIDs.clear();
    const checkGen = document.getElementById('check_general_depto');
    const esGen = deptoCreador.includes('General');
    if (checkGen) checkGen.checked = esGen;

    if (!esGen) {
      deptoCreador.split(',').forEach(d => {
        const trimmed = d.trim();
        if (trimmed) departamentosSeleccionadosIDs.add(trimmed);
      });
    }

    personasSeleccionadasIDs.clear();
    (asignadoTexto || '').split(',').forEach(s => {
      const trimName = s.trim();
      if (trimName && trimName !== 'General / Sin asignar' && trimName !== '-') {
        personasSeleccionadasIDs.add(trimName);
      }
    });

    renderizarListaDepartamentosModal();
    renderizarListaPersonasModal();

    let fechaLimpia = fechaISO || '';
    if (fechaLimpia.includes('T')) fechaLimpia = fechaLimpia.split('T')[0];
    document.getElementById('campo_modal_fecha').value = fechaLimpia;
    document.getElementById('campo_modal_estado').value = estadoValor;

    abrir_modal();
  };

  window.cambiarEstadoTareaDirecto = async function(id, esAutor, nuevoEstado) {
    if (!esAutor) {
      mostrarToastTareas('No tienes permisos para modificar esta tarea porque no eres el autor.', 'error');
      return;
    }

    const tarea = tareas.find(t => Number(t.id) === Number(id));
    if (!tarea) return;

    try {
      const datos = await window.OCID.apiFetch(`/tareas/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...tarea, estado: nuevoEstado })
      });
      if (!datos.success) throw new Error('No se pudo actualizar el estado');

      tarea.estado = nuevoEstado;
      mostrarToastTareas(`Estado actualizado a "${nuevoEstado}".`, 'exito');
      renderizarTabla();
    } catch (err) {
      mostrarToastTareas('No se pudo actualizar el estado.', 'error');
    }
  };

  window.eliminarTareaDirecto = async function(id, esAutor) {
    if (!esAutor) {
      mostrarToastTareas('No tienes permisos para eliminar esta tarea porque no eres el autor.', 'error');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas eliminar esta tarea?')) return;

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

    tareasPagina.forEach(tarea => {
      const fila = document.createElement('tr');
      fila.dataset.id = tarea.id;

      const estadoValor = tarea.estado || 'Pendiente';
      let claseBadge = 'badge_estado ';
      if (estadoValor === 'En proceso') claseBadge += 'estado_proceso';
      else if (estadoValor === 'Completado') claseBadge += 'estado_completado';
      else claseBadge += 'estado_pendiente';

      const tituloTexto = tarea.titulo || '-';
      const descripcionTexto = tarea.descripcion || tarea.detalles || '-';
      const asignadoTexto = tarea.asignado || tarea.asignado_a || tarea.personas || 'General / Sin asignar';
      
      const nombreCreador = tarea.autor_nombre || 'Sistema';
      const deptoCreador = tarea.autor_departamento || tarea.departamento || 'General';
      const textoCreadorConDepto = `${nombreCreador} (${deptoCreador})`;

      const esAutor = usuarioActual && (Number(usuarioActual.id) === Number(tarea.autor_id));
      const esLarga = descripcionTexto.length > 80;

      fila.innerHTML = `
        <td class="texto_titulo_tarea">
          ${escaparHTML(tituloTexto)}
          <br>
          <small style="color: #64748b; font-size: 11px; font-weight: normal;">Creado por: ${escaparHTML(textoCreadorConDepto)}</small>
        </td>
        <td>
          <div class="texto_descripcion_tarea" style="max-width: 280px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; word-break: break-word;">${escaparHTML(descripcionTexto)}</div>
          ${esLarga ? `<button type="button" class="class_btn_ver_mas" style="background: transparent; border: none; color: #2563eb; font-size: 11px; font-weight: 600; cursor: pointer; padding: 0; margin-top: 4px; display: inline-block;">Ver tarea completa</button>` : ''}
        </td>
        <td>${escaparHTML(asignadoTexto)}</td>
        <td>${escaparHTML(deptoCreador)}</td>
        <td>${formatearFecha(tarea.fecha)}</td>
        <td><span class="${claseBadge}">${escaparHTML(estadoValor)}</span></td>
        <td class="columna_acciones" style="position: relative;">
          <button class="boton_opciones_anuncio" title="Más opciones" onclick="toggleMenuOpcionesTarea(event, ${tarea.id})">&#8942;</button>
          <div id="menu_opciones_tarea_${tarea.id}" style="display: none; position: absolute; right: 0; top: 35px; background: white; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0px 4px 12px rgba(0,0,0,0.15); z-index: 50; width: 140px; padding: 4px 0;">
            <button onclick="prepararEdicionTarea(${tarea.id}, ${esAutor}, '${encodeURIComponent(tituloTexto)}', '${encodeURIComponent(descripcionTexto)}', '${encodeURIComponent(deptoCreador)}', '${encodeURIComponent(asignadoTexto)}', '${tarea.fecha}', '${estadoValor}')" style="width: 100%; text-align: left; background: none; border: none; padding: 8px 12px; font-size: 13px; cursor: pointer; color: ${esAutor ? '#0f172a' : '#94a3b8'}; display: flex; align-items: center; gap: 8px;">
              <svg fill="none" height="15" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Editar
            </button>
            <button onclick="cambiarEstadoTareaDirecto(${tarea.id}, ${esAutor}, 'Pendiente')" style="width: 100%; text-align: left; background: none; border: none; padding: 8px 12px; font-size: 13px; cursor: pointer; color: #0f172a;">Pendiente</button>
            <button onclick="cambiarEstadoTareaDirecto(${tarea.id}, ${esAutor}, 'En proceso')" style="width: 100%; text-align: left; background: none; border: none; padding: 8px 12px; font-size: 13px; cursor: pointer; color: #0f172a;">En proceso</button>
            <button onclick="cambiarEstadoTareaDirecto(${tarea.id}, ${esAutor}, 'Completado')" style="width: 100%; text-align: left; background: none; border: none; padding: 8px 12px; font-size: 13px; cursor: pointer; color: #0f172a;">Completado</button>
            <button onclick="eliminarTareaDirecto(${tarea.id}, ${esAutor})" style="width: 100%; text-align: left; background: none; border: none; padding: 8px 12px; font-size: 13px; cursor: pointer; color: ${esAutor ? '#ef4444' : '#94a3b8'}; display: flex; align-items: center; gap: 8px;">
              <svg fill="none" height="15" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Eliminar
            </button>
          </div>
        </td>
      `;

      const btnVerMas = fila.querySelector('.class_btn_ver_mas');
      if (btnVerMas) {
        btnVerMas.addEventListener('click', () => {
          const elTitulo = document.getElementById('detalle_titulo_tarea');
          const elCreador = document.getElementById('detalle_creador_tarea');
          const elAsignado = document.getElementById('detalle_asignado_tarea');
          const elFecha = document.getElementById('detalle_fecha_tarea');
          const elEstado = document.getElementById('detalle_estado_tarea');
          const elDesc = document.getElementById('detalle_descripcion_tarea');

          if (elTitulo) elTitulo.textContent = tituloTexto;
          if (elCreador) elCreador.textContent = textoCreadorConDepto;
          if (elAsignado) elAsignado.textContent = asignadoTexto;
          if (elFecha) elFecha.textContent = formatearFecha(tarea.fecha);
          if (elEstado) elEstado.innerHTML = `<span class="${claseBadge}">${escaparHTML(estadoValor)}</span>`;
          if (elDesc) elDesc.textContent = descripcionTexto;

          if (modalVerTarea) modalVerTarea.classList.add('modal_activo');
        });
      }

      cuerpoTabla.appendChild(fila);
    });

    if (textoConteo) {
      textoConteo.textContent = `Mostrando ${tareasFiltradas.length > 0 ? inicio + 1 : 0} a ${Math.min(fin, tareasFiltradas.length)} de ${tareasFiltradas.length} tareas`;
    }

    renderizarPaginacion(totalPaginas);
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

      const esGeneralChecked = checkGeneralDepto && checkGeneralDepto.checked;
      let deptosSeleccionados = [];

      if (esGeneralChecked) {
        deptosSeleccionados = ['General'];
      } else {
        deptosSeleccionados = Array.from(departamentosSeleccionadosIDs);
      }

      if (deptosSeleccionados.length === 0) {
        mostrarToastTareas('Selecciona al menos un departamento o marca General.', 'advertencia');
        return;
      }

      const personasArray = Array.from(personasSeleccionadasIDs);
      const textoAsignadoFinal = personasArray.length > 0 ? personasArray.join(', ') : 'General / Sin asignar';

      const fechaSeleccionada = document.getElementById('campo_modal_fecha').value;
      const fechaActualStr = obtenerFechaActualISO();

      if (fechaSeleccionada < fechaActualStr) {
        mostrarToastTareas('La fecha límite no puede ser anterior al día de hoy.', 'advertencia');
        return;
      }

      const objetoTarea = {
        titulo: document.getElementById('campo_modal_titulo').value.trim(),
        descripcion: document.getElementById('campo_modal_descripcion').value.trim(),
        asignado: textoAsignadoFinal,
        departamentos: deptosSeleccionados,
        departamento: deptosSeleccionados.join(', '),
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

  cargarCatalogosServidor();
});