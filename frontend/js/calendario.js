/* Lógica interactiva y de backend para calendario.html usando la tabla 'tareas' */
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

    const nombre = usuario && (usuario.nombre || usuario.correo);
    const etiquetaNombre = document.querySelector(
      '.nombre_usuario, .nombre_perfil, .nombre_usuario_superior, #nombreUsuario'
    );
    const etiquetaRol = document.querySelector(
      '.rol_usuario, .cargo_perfil, .rol_usuario_superior, #etiqueta_rol_usuario'
    );
    const avatar = document.querySelector(
      '.avatar_usuario, .avatar_perfil, .avatar_superior, #avatar_usuario_circulo'
    );

    if (nombre && etiquetaNombre) etiquetaNombre.textContent = nombre;
    if (etiquetaRol) etiquetaRol.textContent = window.OCID.obtenerEtiquetaRolUsuario(usuario);
    if (nombre && avatar) {
      const iniciales = nombre.split(/\s+/)
        .slice(0, 2)
        .map(parte => parte.charAt(0))
        .join('')
        .toUpperCase();
      avatar.textContent = iniciales;
      // Iniciales con estilo definido en CSS
      avatar.classList.add('avatar_usuario_iniciales');
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarInterfaz);
  } else {
    iniciarInterfaz();
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const mesesCortos = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  
  let tareas = [];
  let fechaSeleccionada = new Date(2026, 8, 15);
  let vistaActual = 'mes';
  let tareaEnEdicionId = null;

  const grilla = document.getElementById('contenedor_grilla_dias');
  const listaEventos = document.getElementById('lista_eventos_contenedor');
  const modal = document.getElementById('modal_nuevo_evento');
  const campoFecha = document.getElementById('input_dia_evento');

  function mostrarToastCalendario(mensaje, tipo = 'exito') {
    window.OCID.mostrarToast(mensaje, tipo);
  }

  function fechaClave(fecha) {
    return fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');
  }

  function puedeGestionarTarea(tarea, usuario) {
    if (!tarea || !usuario) return false;
    const esJefe = usuario.es_jefe === true || usuario.es_jefe === 't';
    const esAdmin = ['administrador', 'administrador general']
      .includes(String(usuario.rol || '').trim().toLowerCase());
    const departamentoUsuarioId = Number(usuario.departamento_id);
    const enAlcance = Number(tarea.departamento_emisor_id) === departamentoUsuarioId ||
      (Array.isArray(tarea.departamentos_destino_ids) &&
        tarea.departamentos_destino_ids.some(id => Number(id) === departamentoUsuarioId));
    return Number(usuario.id) === Number(tarea.autor_id) || esAdmin || (esJefe && enAlcance);
  }

async function cargarTareasDesdeDB() {
    try {
      const datos = await window.OCID.apiFetch('/tareas');
      tareas = Array.isArray(datos) ? datos : [];
    } catch (error) {
      tareas = [];
      mostrarToastCalendario('No se pudo conectar con el servidor', 'error');
    }
    dibujarTodo();
  }

  function actualizarBadgesNavMes() {
    const badgePrevio = document.getElementById('badge_mes_previo');
    const badgeSiguiente = document.getElementById('badge_mes_siguiente');
    if (!badgePrevio || !badgeSiguiente) return;

    const mesActual = fechaSeleccionada.getMonth();
    const anioActual = fechaSeleccionada.getFullYear();

    let tienePrevio = false;
    let tieneSiguiente = false;

    tareas.forEach(tarea => {
      if (!tarea.fecha) return;
      const f = new Date(tarea.fecha.includes('T') ? tarea.fecha : tarea.fecha + 'T00:00:00');
      const tAnio = f.getFullYear();
      const tMes = f.getMonth();

      if (tAnio < anioActual || (tAnio === anioActual && tMes < mesActual)) {
        tienePrevio = true;
      }
      if (tAnio > anioActual || (tAnio === anioActual && tMes > mesActual)) {
        tieneSiguiente = true;
      }
    });

    // Indicadores de meses con clases en lugar de estilos inline
    badgePrevio.classList.toggle('oculto', !tienePrevio);
    badgeSiguiente.classList.toggle('oculto', !tieneSiguiente);
  }

  window.toggleMenuOpcionesTarea = function(evento, idTarea) {
    evento.stopPropagation();
    document.querySelectorAll('[id^="menu_opciones_tarea_"]').forEach(menu => {
      if (menu.id !== `menu_opciones_tarea_${idTarea}`) menu.classList.remove('menu_abierto');
    });

    const menu = document.getElementById(`menu_opciones_tarea_${idTarea}`);
    // Alterna la clase que controla la visibilidad del menú
    if (menu) menu.classList.toggle('menu_abierto');
  };

  window.addEventListener('click', () => {
    document.querySelectorAll('[id^="menu_opciones_tarea_"]').forEach(menu => {
      menu.classList.remove('menu_abierto');
    });
  });

  window.prepararEdicionTarea = function(id, puedeGestionar) {
    let usuarioActual = null;
    try {
      usuarioActual = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (e) {
      usuarioActual = null;
    }

    const tarea = tareas.find(t => Number(t.id) === Number(id));
    if (!tarea) return;

    if (!puedeGestionar || !puedeGestionarTarea(tarea, usuarioActual)) {
      mostrarToastCalendario('No tienes permisos para editar esta tarea.', 'error');
      return;
    }

    tareaEnEdicionId = id;
    document.getElementById('input_titulo_evento').value = tarea.titulo || '';
    const fechaFormatBD = tarea.fecha.includes('T') ? tarea.fecha.split('T')[0] : tarea.fecha;
    campoFecha.value = fechaFormatBD;
    document.getElementById('input_horario_evento').value = tarea.horario || '';
    document.getElementById('input_depto_evento').value = tarea.departamento || '';

    const tituloModal = modal.querySelector('.modal_titulo');
    if (tituloModal) tituloModal.textContent = 'Editar evento';

    // Abre el modal con clase CSS
    modal.classList.add('modal_activo');
  };

  window.eliminarTareaBD = async function(id, puedeGestionar) {
    let usuarioActual = null;
    try {
      usuarioActual = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (e) {
      usuarioActual = null;
    }

    const tarea = tareas.find(t => t.id === id);
    if (!puedeGestionar || !puedeGestionarTarea(tarea, usuarioActual)) {
      mostrarToastCalendario('No tienes permisos para eliminar esta tarea.', 'error');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas eliminar esta tarea?')) return;

    try {
      const datos = await window.OCID.apiFetch(`/tareas/${id}`, {
        method: 'DELETE'
      });
      if (!datos.success) throw new Error('No se pudo eliminar');

      mostrarToastCalendario('Evento eliminado correctamente.', 'exito');
      await cargarTareasDesdeDB();
    } catch (error) {
      mostrarToastCalendario('No se pudo cargar', 'error');
    }
  };

  function dibujarListaEventos() {
    if (!listaEventos) return;
    listaEventos.replaceChildren();

    let usuarioActual = null;
    try {
      usuarioActual = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    } catch (e) {
      usuarioActual = null;
    }

    const ordenados = tareas.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    ordenados.forEach(tarea => {
      const f = new Date((tarea.fecha.includes('T') ? tarea.fecha : tarea.fecha + 'T00:00:00'));
      const puedeGestionar = puedeGestionarTarea(tarea, usuarioActual);

      let horaCreacionTexto = '';
      if (tarea.fecha_creacion) {
        const fechaCreacionObj = new Date(tarea.fecha_creacion);
        if (!isNaN(fechaCreacionObj.getTime())) {
          horaCreacionTexto = fechaCreacionObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        }
      }

      const nombreDueño = tarea.autor_nombre || 'Coordinación';

      // Estado del evento con la misma píldora que la vista de tareas
      const estadoValor = tarea.estado || 'Pendiente';
      let claseEstado = 'etiqueta_urgente';
      if (estadoValor.toLowerCase().includes('proceso')) claseEstado = 'etiqueta_moderado';
      else if (estadoValor.toLowerCase().includes('complet')) claseEstado = 'etiqueta_general';

      const item = document.createElement('div');
      item.className = 'item_evento';

      item.innerHTML = `
        <div class="caja_fecha">
          <span class="caja_fecha_numero">${f.getDate()}</span>
          <span class="caja_fecha_mes">${mesesCortos[f.getMonth()]}</span>
        </div>
        <div class="detalles_evento">
          <div class="titulo_item_evento">${escaparHTML(tarea.titulo)}</div>
          <div class="horario_item_evento">${escaparHTML(tarea.horario || 'Horario a confirmar')}</div>
          <div class="departamento_item_evento">
            <span class="etiqueta_tipo etiqueta_departamento_calendario"><span class="punto_etiqueta"></span>${escaparHTML(tarea.departamento || 'General')}</span>
            <span class="etiqueta_tipo ${claseEstado}"><span class="punto_etiqueta"></span>${escaparHTML(estadoValor)}</span>
            <small class="texto_creador_evento">Creado por: <strong>${escaparHTML(nombreDueño)}</strong>${horaCreacionTexto ? ' a las ' + horaCreacionTexto : ''}</small>
          </div>
        </div>
        <div class="contenedor_opciones_evento">
          ${puedeGestionar ? `<button class="boton_opciones_anuncio" title="Más opciones" onclick="toggleMenuOpcionesTarea(event, ${tarea.id})">&#8942;</button>` : ''}
          ${puedeGestionar ? `
          <div id="menu_opciones_tarea_${tarea.id}" class="menu_opciones_evento">
            <button class="boton_menu_evento" onclick="prepararEdicionTarea(${tarea.id}, ${puedeGestionar})">
              <svg fill="none" height="15" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Editar
            </button>
            <button class="boton_menu_evento boton_menu_evento_eliminar" onclick="eliminarTareaBD(${tarea.id}, ${puedeGestionar})">
              <svg fill="none" height="15" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Eliminar
            </button>
          </div>
          ` : ''}
        </div>
      `;

      const botonVisto = document.createElement('button');
      botonVisto.type = 'button';
      botonVisto.className = 'boton_visto_elemento' + (tarea.visto ? ' visto' : ' pendiente');
      botonVisto.innerHTML = tarea.visto
        ? '<svg class="icono_check_visto" viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg><span>Visto</span>'
        : '<svg class="icono_check_visto" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="4 10 8 14 16 6"></polyline></svg><span>Marcar como visto</span>';
      botonVisto.disabled = Boolean(tarea.visto);
      botonVisto.setAttribute('aria-label', tarea.visto ? 'Evento visto' : 'Marcar evento como visto');
      botonVisto.addEventListener('click', async () => {
        botonVisto.disabled = true;
        try {
          await window.OCID.marcarElementoVisto('tarea', Number(tarea.id));
          tarea.visto = true;
          dibujarListaEventos();
        } catch (error) {
          mostrarToastCalendario(error.message || 'No se pudo marcar la tarea como vista.', 'error');
          botonVisto.disabled = false;
        }
      });
      item.querySelector('.detalles_evento').appendChild(botonVisto);

      listaEventos.appendChild(item);
    });

    // Estado vacío del calendario con acento correcto
    if (!ordenados.length) {
      const vacio = document.createElement('p');
      // Estado vacío con estilo en CSS
      vacio.className = 'estado_vacio_calendario';
      vacio.textContent = 'Aún no has recibido eventos.';
      listaEventos.appendChild(vacio);
    }
  }

  function dibujarGrilla() {
    if (!grilla) return;
    grilla.replaceChildren();

    document.getElementById('texto_mes_actual').textContent =
      meses[fechaSeleccionada.getMonth()] + ' ' + fechaSeleccionada.getFullYear();

    // La vista de día usa una sola columna
    grilla.classList.toggle('vista_dia', vistaActual === 'dia');

    let fechas = [];
    if (vistaActual === 'mes') {
      const primero = new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), 1);
      const desplazamiento = (primero.getDay() + 6) % 7;
      const inicio = new Date(primero);
      inicio.setDate(primero.getDate() - desplazamiento);
      fechas = Array.from({ length: 42 }, (_, i) => {
        const f = new Date(inicio);
        f.setDate(inicio.getDate() + i);
        return f;
      });
    } else if (vistaActual === 'semana') {
      const inicio = new Date(fechaSeleccionada);
      inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));
      fechas = Array.from({ length: 7 }, (_, i) => {
        const f = new Date(inicio);
        f.setDate(inicio.getDate() + i);
        return f;
      });
    } else {
      fechas = [new Date(fechaSeleccionada)];
    }

    fechas.forEach(fecha => {
      const clave = fechaClave(fecha);
      const celda = document.createElement('div');
      celda.className = 'celda_dia';
      celda.dataset.fecha = clave;

      if (vistaActual === 'mes' && fecha.getMonth() !== fechaSeleccionada.getMonth()) {
        celda.classList.add('celda_dia_fuera');
      }
      if (clave === fechaClave(fechaSeleccionada)) {
        celda.classList.add('celda_dia_seleccionada');
      }

      const numero = document.createElement('span');
      numero.className = 'numero_dia';
      numero.textContent = fecha.getDate();
      celda.appendChild(numero);

      const tareasDia = tareas.filter(item => {
        const fechaFormatBD = item.fecha.includes('T') ? item.fecha.split('T')[0] : item.fecha;
        return fechaFormatBD === clave;
      });

      if (tareasDia.length) {
        const puntos = document.createElement('div');
        puntos.className = 'contenedor_puntos_evento';
        tareasDia.forEach(item => {
          const marca = document.createElement('span');
          marca.className = 'marca_evento_item';
          marca.textContent = item.titulo;
          puntos.appendChild(marca);
        });
        celda.appendChild(puntos);
      }

      celda.addEventListener('click', () => {
        fechaSeleccionada = new Date(fecha);
        campoFecha.value = clave;
        dibujarGrilla();
        actualizarBadgesNavMes();
      });

      grilla.appendChild(celda);
    });

    actualizarBadgesNavMes();
  }

  function dibujarTodo() {
    dibujarGrilla();
    dibujarListaEventos();
  }

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  async function guardarTareaBD() {
    const titulo = document.getElementById('input_titulo_evento').value.trim();
    const fecha = campoFecha.value;
    const horario = document.getElementById('input_horario_evento').value.trim();
    const depto = document.getElementById('input_depto_evento').value.trim();

    let usuario;
    try { usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null'); } catch (e) { usuario = null; }

    if (!titulo || !fecha) {
      mostrarToastCalendario('Ingresa un título y una fecha válida.', 'advertencia');
      return;
    }

    const tareaAEditar = tareaEnEdicionId !== null
      ? tareas.find(t => Number(t.id) === Number(tareaEnEdicionId))
      : null;
    if (tareaEnEdicionId !== null && !puedeGestionarTarea(tareaAEditar, usuario)) {
      mostrarToastCalendario('No tienes permisos para editar esta tarea.', 'error');
      return;
    }

    try {
      let ruta = '/tareas';
      let metodo = 'POST';

      if (tareaEnEdicionId !== null) {
        ruta = `/tareas/${tareaEnEdicionId}`;
        metodo = 'PUT';
      }

      const datos = await window.OCID.apiFetch(ruta, {
        method: metodo,
        body: JSON.stringify({
          titulo,
          fecha,
          horario: horario || 'Horario a confirmar',
          departamento: depto || 'General',
          descripcion: tareaAEditar ? tareaAEditar.descripcion || '' : '',
          asignado: tareaAEditar ? tareaAEditar.asignado || 'General / Sin asignar' : 'General / Sin asignar',
          estado: tareaAEditar ? tareaAEditar.estado || 'Pendiente' : 'Pendiente',
          autor_id: usuario ? usuario.id : null
        })
      });

      if (!datos.success) throw new Error('No se pudo guardar el evento');

      // Cierra el modal con clase CSS
      modal.classList.remove('modal_activo');
      document.getElementById('input_titulo_evento').value = '';
      document.getElementById('input_horario_evento').value = '';
      document.getElementById('input_depto_evento').value = '';
      
      const mensajeExito = tareaEnEdicionId !== null ? 'Evento actualizado correctamente.' : 'Evento registrado correctamente.';
      tareaEnEdicionId = null;

      mostrarToastCalendario(mensajeExito, 'exito');
      await cargarTareasDesdeDB();
    } catch (error) {
      mostrarToastCalendario('No se pudo cargar', 'error');
    }
  }

  // Controles de navegación y eventos de UI
  document.getElementById('boton_mes_previo').addEventListener('click', () => {
    fechaSeleccionada.setMonth(fechaSeleccionada.getMonth() - 1);
    dibujarGrilla();
  });

  document.getElementById('boton_mes_siguiente').addEventListener('click', () => {
    fechaSeleccionada.setMonth(fechaSeleccionada.getMonth() + 1);
    dibujarGrilla();
  });

  [['vista_mes', 'mes'], ['vista_semana', 'semana'], ['vista_dia', 'dia']].forEach(([id, vista]) => {
    document.getElementById(id).addEventListener('click', () => {
      vistaActual = vista;
      document.querySelectorAll('.boton_vista').forEach(b => b.classList.remove('boton_vista_activa'));
      document.getElementById(id).classList.add('boton_vista_activa');
      dibujarGrilla();
    });
  });

  const botonAbrirModal = document.getElementById('boton_abrir_modal');
  if (botonAbrirModal) botonAbrirModal.addEventListener('click', () => {
    tareaEnEdicionId = null;
    const tituloModal = modal.querySelector('.modal_titulo');
    if (tituloModal) tituloModal.textContent = 'Registrar nuevo evento';
    campoFecha.value = fechaClave(fechaSeleccionada);
    modal.classList.add('modal_activo');
  });

  [document.getElementById('boton_cerrar_modal'), document.getElementById('boton_cancelar_modal')].forEach(b => {
    if (b) b.addEventListener('click', () => {
      modal.classList.remove('modal_activo');
      tareaEnEdicionId = null;
    });
  });

  document.getElementById('boton_guardar_evento').addEventListener('click', guardarTareaBD);

  cargarTareasDesdeDB();
});