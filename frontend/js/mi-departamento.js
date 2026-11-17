(function () {
  'use strict';

  let departamentoActual = null;
  let miembrosActuales = [];
  const estadosMiembros = new Map();

  function obtenerElemento(id) {
    return document.getElementById(id);
  }

  function texto(id, valor) {
    const elemento = obtenerElemento(id);
    if (elemento) elemento.textContent = valor;
  }

  function normalizar(valor) {
    return String(valor || '').trim().toLocaleLowerCase('es-MX');
  }

  function obtenerLista(respuesta) {
    return Array.isArray(respuesta) ? respuesta : [];
  }

  function filtrarMiembros() {
    const termino = (obtenerElemento('campo_busqueda_general')?.value || '').trim().toLocaleLowerCase('es-MX');
    const visibles = miembrosActuales.filter(miembro =>
      [miembro.nombre, miembro.correo, miembro.rol].some(valor =>
        String(valor || '').toLocaleLowerCase('es-MX').includes(termino)
      )
    );
    renderizarMiembros(visibles);
  }

  function renderizarMiembros(lista) {
    const cuerpo = obtenerElemento('cuerpo_tabla_integrantes');
    if (!cuerpo) return;
    cuerpo.replaceChildren();

    if (!lista.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 4;
      celda.textContent = miembrosActuales.length
        ? 'No hay integrantes que coincidan con la búsqueda.'
        : 'No hay integrantes registrados en este departamento.';
      fila.appendChild(celda);
      cuerpo.appendChild(fila);
      return;
    }

    lista.forEach(miembro => {
      const fila = document.createElement('tr');
      const celdaNombre = document.createElement('td');
      const nombre = document.createElement('span');
      nombre.className = 'nombre_miembro';
      nombre.textContent = miembro.nombre || miembro.correo || 'Usuario';
      celdaNombre.appendChild(nombre);

      const celdaPuesto = document.createElement('td');
      celdaPuesto.textContent = miembro.rol || 'Docente';

      const celdaEstado = document.createElement('td');
      const estado = estadosMiembros.get(Number(miembro.id)) || 'Activo';
      const indicadorEstado = document.createElement('span');
      indicadorEstado.className = estado === 'Inactivo' ? 'badge_estado_inactivo' : 'badge_estado_activo';
      indicadorEstado.id = `estado_usuario_${miembro.id}`;
      indicadorEstado.textContent = estado;
      celdaEstado.appendChild(indicadorEstado);

      const celdaAcciones = document.createElement('td');
      celdaAcciones.style.textAlign = 'center';
      celdaAcciones.style.position = 'relative';
      const botonMenu = document.createElement('button');
      botonMenu.type = 'button';
      botonMenu.className = 'boton_acciones boton_menu_integrante';
      botonMenu.setAttribute('aria-label', `Acciones para ${miembro.nombre || 'integrante'}`);
      botonMenu.textContent = '⋮';

      const menu = document.createElement('div');
      menu.id = `menu_opciones_integrante_${miembro.id}`;
      menu.className = 'menu_integrante';
      menu.hidden = true;

      const botonEstado = document.createElement('button');
      botonEstado.type = 'button';
      botonEstado.className = 'btn_cambiar_estado';
      botonEstado.textContent = estado === 'Activo' ? 'Hacer inactivo' : 'Hacer activo';
      botonEstado.addEventListener('click', () => {
        const siguienteEstado = estadosMiembros.get(Number(miembro.id)) === 'Inactivo' ? 'Activo' : 'Inactivo';
        estadosMiembros.set(Number(miembro.id), siguienteEstado);
        indicadorEstado.textContent = siguienteEstado;
        indicadorEstado.className = siguienteEstado === 'Inactivo' ? 'badge_estado_inactivo' : 'badge_estado_activo';
        botonEstado.textContent = siguienteEstado === 'Activo' ? 'Hacer inactivo' : 'Hacer activo';
        menu.hidden = true;
      });

      const botonEliminar = document.createElement('button');
      botonEliminar.type = 'button';
      botonEliminar.className = 'btn_eliminar_integrante';
      botonEliminar.textContent = 'Eliminar';
      botonEliminar.addEventListener('click', async () => {
        const usuarioActual = window.OCID.obtenerUsuarioSesion();
        if (Number(usuarioActual && usuarioActual.id) === Number(miembro.id)) {
          window.OCID.mostrarToast('No puedes eliminar tu propia cuenta.', true);
          return;
        }
        if (!window.confirm(`¿Eliminar a ${miembro.nombre || 'este integrante'}?`)) return;

        try {
          const resultado = await window.OCID.apiFetch(`/usuarios/${Number(miembro.id)}`, { method: 'DELETE' });
          if (!resultado.success) throw new Error(resultado.error || 'No se pudo eliminar al integrante.');
          window.OCID.mostrarToast('Integrante eliminado correctamente.');
          await cargarDatosDepartamento();
        } catch (error) {
          console.error('Error al eliminar integrante:', error);
          window.OCID.mostrarToast(error.message || 'No se pudo eliminar al integrante.', true);
        }
      });

      botonMenu.addEventListener('click', evento => {
        evento.stopPropagation();
        document.querySelectorAll('.menu_integrante').forEach(otroMenu => {
          if (otroMenu !== menu) otroMenu.hidden = true;
        });
        menu.hidden = !menu.hidden;
      });
      menu.append(botonEstado, botonEliminar);
      celdaAcciones.append(botonMenu, menu);
      fila.append(celdaNombre, celdaPuesto, celdaEstado, celdaAcciones);
      cuerpo.appendChild(fila);
    });
  }

  function coincideDepartamento(tarea, departamento) {
    if (!departamento) return false;
    const nombreDepartamento = normalizar(departamento.nombre);
    const departamentosTarea = String(tarea.departamento || tarea.autor_departamento || '')
      .split(',')
      .map(normalizar);
    return departamentosTarea.includes(nombreDepartamento);
  }

  function renderizarDepartamento(departamento, usuarios, archivos, tareas) {
    departamentoActual = departamento;
    const departamentoId = departamento ? Number(departamento.id) : null;
    const miembros = departamento
      ? usuarios.filter(usuario => Number(usuario.departamento_id) === departamentoId)
      : [];
    miembrosActuales = miembros;

    texto('nombre_departamento_texto', departamento ? departamento.nombre : 'Sin departamento asignado');
    texto('detalle_departamento_texto', departamento && departamento.codigo
      ? `Código de acceso: ${departamento.codigo}`
      : 'Información general del departamento');
    texto('parrafo_descripcion', departamento && departamento.descripcion
      ? departamento.descripcion
      : 'Este departamento aún no tiene una descripción.');

    const jefe = departamento && usuarios.find(usuario =>
      Number(usuario.id) === Number(departamento.jefe_id)
    );
    const nombreJefe = (jefe && jefe.nombre) || (departamento && departamento.nombre_jefe) || 'Jefe no asignado';
    const correoJefe = (jefe && jefe.correo) || '';
    texto('nombre_jefe', nombreJefe);
    texto('correo_jefe', correoJefe || 'Correo no disponible');
    texto('modal_destinatario', correoJefe || 'Correo no disponible');

    const avatarJefe = obtenerElemento('avatar_jefe');
    if (avatarJefe) {
      avatarJefe.textContent = nombreJefe.split(/\s+/).slice(0, 2).map(parte => parte[0] || '').join('').toUpperCase();
    }

    texto('total_docentes', String(miembros.length));
    texto('total_documentos', String(departamento
      ? archivos.filter(archivo => Number(archivo.departamento_id) === departamentoId).length
      : 0));
    texto('total_eventos', String(tareas.filter(tarea => coincideDepartamento(tarea, departamento)).length));
    filtrarMiembros();
  }

  async function cargarDatosDepartamento() {
    const usuario = window.OCID.obtenerUsuarioSesion();
    if (!usuario || !window.OCID.obtenerToken()) {
      window.location.href = 'login.html';
      return;
    }

    try {
      const [departamentosRespuesta, usuariosRespuesta, archivosRespuesta, tareasRespuesta] = await Promise.all([
        window.OCID.apiFetch('/departamentos'),
        window.OCID.apiFetch('/usuarios'),
        window.OCID.apiFetch('/archivos'),
        window.OCID.apiFetch('/tareas')
      ]);
      const departamentos = obtenerLista(departamentosRespuesta);
      const usuarios = obtenerLista(usuariosRespuesta);
      const archivos = obtenerLista(archivosRespuesta);
      const tareas = obtenerLista(tareasRespuesta);
      let departamento = departamentos.find(item =>
        Number(item.id) === Number(usuario.departamento_id)
      );
      if (!departamento) {
        departamento = departamentos.find(item => Number(item.jefe_id) === Number(usuario.id));
      }

      renderizarDepartamento(departamento || null, usuarios, archivos, tareas);
    } catch (error) {
      console.error('Error al cargar los datos del departamento:', error);
      window.OCID.mostrarToast(error.message || 'No se pudieron cargar los datos del departamento.', true);
    }
  }

  function configurarModales() {
    const menuDepartamento = obtenerElemento('menu_opciones_departamento');
    const modalEdicion = obtenerElemento('modal_editar_departamento');
    const botonOpciones = document.querySelector('.tarjeta_general .boton_acciones');
    const opcionEditar = obtenerElemento('opcion_editar_departamento');

    if (botonOpciones && menuDepartamento) {
      botonOpciones.addEventListener('click', evento => {
        evento.stopPropagation();
        document.querySelectorAll('.menu_integrante').forEach(menu => { menu.hidden = true; });
        menuDepartamento.style.display = menuDepartamento.style.display === 'block' ? 'none' : 'block';
      });
    }

    if (opcionEditar && modalEdicion) {
      opcionEditar.addEventListener('click', () => {
        if (!departamentoActual) {
          window.OCID.mostrarToast('No hay un departamento asignado para editar.', true);
          return;
        }
        menuDepartamento.style.display = 'none';
        obtenerElemento('input_editar_nombre_depto').value = departamentoActual.nombre || '';
        obtenerElemento('input_editar_desc_depto').value = departamentoActual.descripcion || '';
        modalEdicion.style.display = 'flex';
      });
    }

    ['boton_cerrar_modal_depto', 'boton_cancelar_modal_depto'].forEach(id => {
      const boton = obtenerElemento(id);
      if (boton) boton.addEventListener('click', () => { if (modalEdicion) modalEdicion.style.display = 'none'; });
    });

    const guardar = obtenerElemento('boton_guardar_modal_depto');
    if (guardar) {
      guardar.addEventListener('click', async () => {
        const nombre = obtenerElemento('input_editar_nombre_depto').value.trim();
        const descripcion = obtenerElemento('input_editar_desc_depto').value.trim();
        if (!departamentoActual || !nombre) {
          window.OCID.mostrarToast('El nombre del departamento no puede estar vacío.', true);
          return;
        }
        try {
          const resultado = await window.OCID.apiFetch(`/departamentos/${departamentoActual.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              nombre,
              descripcion,
              jefe_id: departamentoActual.jefe_id,
              codigo: departamentoActual.codigo
            })
          });
          if (!resultado.success) throw new Error(resultado.error || 'No se pudo actualizar el departamento.');
          modalEdicion.style.display = 'none';
          window.OCID.mostrarToast('Departamento actualizado correctamente.');
          await cargarDatosDepartamento();
        } catch (error) {
          console.error('Error al actualizar el departamento:', error);
          window.OCID.mostrarToast(error.message || 'No se pudo actualizar el departamento.', true);
        }
      });
    }

    window.addEventListener('click', evento => {
      if (menuDepartamento && !menuDepartamento.contains(evento.target) && evento.target !== botonOpciones) {
        menuDepartamento.style.display = 'none';
      }
    });

    const busqueda = obtenerElemento('campo_busqueda_general');
    if (busqueda) busqueda.addEventListener('input', filtrarMiembros);
  }

  function configurarContacto() {
    const modal = obtenerElemento('modal_contacto');
    const abrir = obtenerElemento('boton_abrir_contacto');
    const cerrar = obtenerElemento('boton_cerrar_modal');
    const cancelar = obtenerElemento('boton_cancelar_modal');
    const enviar = obtenerElemento('boton_enviar_mensaje');
    const ocultar = () => { if (modal) modal.style.display = 'none'; };

    if (abrir && modal) abrir.addEventListener('click', () => { modal.style.display = 'flex'; });
    if (cerrar) cerrar.addEventListener('click', ocultar);
    if (cancelar) cancelar.addEventListener('click', ocultar);
    if (enviar) {
      enviar.addEventListener('click', () => {
        const correo = departamentoActual && departamentoActual.jefe_id
          ? obtenerElemento('correo_jefe').textContent.trim()
          : '';
        const asunto = obtenerElemento('asunto_mensaje').value.trim();
        const mensaje = obtenerElemento('cuerpo_mensaje').value.trim();
        if (!correo || !asunto || !mensaje || correo === 'Correo no disponible') {
          window.OCID.mostrarToast('Completa el asunto y el mensaje; verifica que el jefe tenga correo.', true);
          return;
        }
        window.location.href = `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
        ocultar();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.OCID.actualizarCabeceraUsuario();
    window.OCID.configurarCierreSesion();
    configurarModales();
    configurarContacto();
    cargarDatosDepartamento();
  });
})();
