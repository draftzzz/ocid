(function () {
  'use strict';

  // Limpieza aplicada: menús por clases y atributos nativos, sin estilos en línea.
  let departamentoActual = null;
  let miembrosActuales = [];
  let rolesDepartamento = [];
  let rolesDepartamentoDetalle = [];
  let codigoAccesoActual = ''; // Código compartido sin atributos personalizados
  const COLOR_ROL_JEFE = '#4b1cb9';
  const FRASE_CONFIRMACION_BAJA = 'Confirmar eliminacion';
  const FRASE_CONFIRMACION_TRANSFERENCIA = 'Transferir propiedad';

  function esMiembroJefe(miembro) {
    return Boolean(miembro && departamentoActual &&
      (Number(miembro.id) === Number(departamentoActual.jefe_id) ||
        miembro.es_jefe === true || miembro.es_jefe === 't'));
  }

  function nombreRolMiembro(miembro) {
    return esMiembroJefe(miembro) ? 'Jefe de Departamento' : (miembro.rol || 'Docente');
  }

  // Devuelve una variante de color estable para cada rol
  function obtenerIndiceColorRol(nombreRol) {
    const norm = normalizar(nombreRol);
    if (norm.includes('jefe')) return 0;
    if (norm === 'docente') return 1;
    let hash = 0;
    for (let i = 0; i < norm.length; i++) {
      hash = norm.charCodeAt(i) + ((hash << 5) - hash);
    }
    return 2 + (Math.abs(hash) % 8);
  }

  function crearEtiquetaRol(nombre) {
    const etiqueta = document.createElement('span');
    // Píldora estándar con punto de color para el rol
    etiqueta.className = `etiqueta_tipo badge_rol_departamento badge_rol_variante_${obtenerIndiceColorRol(nombre)}`;
    const punto = document.createElement('span');
    punto.className = 'punto_etiqueta';
    etiqueta.append(punto, document.createTextNode(nombre));
    return etiqueta;
  }

  function esJefeDepartamento(usuario) {
    return Boolean(usuario && departamentoActual &&
      (usuario.es_jefe === true || usuario.es_jefe === 't') &&
      Number(usuario.departamento_id) === Number(departamentoActual.id));
  }

  function puedeGestionarDepartamento(usuario) {
    const rol = normalizar(usuario && usuario.rol);
    return esJefeDepartamento(usuario) ||
      rol === 'administrador' || rol === 'administrador general';
  }

  function puedeEditarDepartamento() {
    const usuario = window.OCID.obtenerUsuarioSesion();
    if (!usuario || !departamentoActual) return false;
    return puedeGestionarDepartamento(usuario);
  }

  function actualizarControlesEdicion() {
    const puedeEditar = puedeEditarDepartamento();
    const usuario = window.OCID.obtenerUsuarioSesion();
    const esJefe = esJefeDepartamento(usuario);
    const botonOpciones = obtenerElemento('boton_opciones_departamento');
    const opcionEditar = obtenerElemento('opcion_editar_departamento');
    const menu = obtenerElemento('menu_opciones_departamento');
    const panelGestion = obtenerElemento('panel_gestion_departamento');
    const panelRoles = obtenerElemento('gestion_roles_departamento');
    const botonBaja = obtenerElemento('boton_abrir_baja_departamento');
    const selectorJefe = obtenerElemento('select_nuevo_jefe');

    if (botonOpciones) botonOpciones.hidden = !puedeEditar;
    if (opcionEditar) opcionEditar.hidden = !puedeEditar;
    if (!puedeEditar && menu) {
      menu.hidden = true;
      botonOpciones?.setAttribute('aria-expanded', 'false');
    }
    if (panelGestion) panelGestion.hidden = !puedeEditar;
    if (panelRoles) panelRoles.hidden = !esJefe;
    if (botonBaja) botonBaja.hidden = !esJefe;
    if (selectorJefe && departamentoActual) {
      selectorJefe.replaceChildren(new Option('Selecciona un integrante', ''));
      const candidatos = miembrosActuales
        .filter(miembro =>
          Number(miembro.id) !== Number(departamentoActual.jefe_id) &&
          Number(miembro.id) !== Number(usuario && usuario.id) &&
          miembro.estado !== 'Inactivo'
        );
      candidatos
        .forEach(miembro => selectorJefe.add(new Option(miembro.nombre || miembro.correo, String(miembro.id))));
      selectorJefe.disabled = candidatos.length === 0;
      const botonTransferir = obtenerElemento('form_transferir_jefatura')?.querySelector('[type="submit"]');
      if (botonTransferir) botonTransferir.disabled = selectorJefe.disabled || !puedeEditar;
    } else if (selectorJefe) {
      selectorJefe.replaceChildren(new Option('Sin departamento', ''));
      selectorJefe.disabled = true;
    }
  }

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

  function renderizarTodosIntegrantes() {
    const lista = obtenerElemento('lista_todos_integrantes');
    if (!lista) return;
    lista.replaceChildren();

    if (!miembrosActuales.length) {
      const vacio = document.createElement('li');
      vacio.className = 'elemento_integrante_vacio';
      vacio.textContent = 'No hay integrantes registrados en este departamento.';
      lista.appendChild(vacio);
      return;
    }

    miembrosActuales.forEach(miembro => {
      const elemento = document.createElement('li');
      elemento.className = 'elemento_integrante_modal';
      const nombre = document.createElement('strong');
      nombre.textContent = miembro.nombre || miembro.correo || 'Usuario';
      const correo = document.createElement('span');
      correo.textContent = miembro.correo || 'Correo no disponible';
      const rol = crearEtiquetaRol(nombreRolMiembro(miembro));
      rol.classList.add('rol_integrante_modal');
      elemento.append(nombre, correo, rol);
      lista.appendChild(elemento);
    });
  }

  function renderizarModalRoles() {
    const lista = obtenerElemento('lista_roles_asignacion');
    if (!lista) return;
    lista.replaceChildren();

    const puedeEliminarRoles = esJefeDepartamento(window.OCID.obtenerUsuarioSesion());
    const grupos = [
      {
        nombre: 'Jefe de Departamento',
        integrantes: miembrosActuales.filter(esMiembroJefe)
      },
      ...rolesDepartamentoDetalle
        .filter(rol => !['jefe', 'jefe de departamento'].includes(normalizar(rol.nombre)))
        .map(rol => ({
        ...rol,
        integrantes: miembrosActuales.filter(miembro =>
          !esMiembroJefe(miembro) && normalizar(miembro.rol) === normalizar(rol.nombre)
        )
        }))
    ];

    grupos.forEach(rol => {
      const tarjeta = document.createElement('section');
      tarjeta.className = 'tarjeta_rol_asignacion';
      const cabecera = document.createElement('div');
      cabecera.className = 'cabecera_rol_asignacion';
      const etiqueta = crearEtiquetaRol(rol.nombre);
      const conteo = document.createElement('span');
      conteo.className = 'conteo_rol_asignacion';
      conteo.textContent = `${rol.integrantes.length} integrante${rol.integrantes.length === 1 ? '' : 's'}`;
      cabecera.append(etiqueta, conteo);
      if (rol.id && puedeEliminarRoles &&
          !['jefe', 'jefe de departamento'].includes(normalizar(rol.nombre))) {
        const botonEliminar = document.createElement('button');
        botonEliminar.className = 'boton_eliminar_rol';
        botonEliminar.type = 'button';
        botonEliminar.textContent = 'Eliminar rol';
        botonEliminar.addEventListener('click', () => eliminarRolDepartamento(rol, botonEliminar));
        cabecera.appendChild(botonEliminar);
      }

      const integrantes = document.createElement('ul');
      integrantes.className = 'integrantes_rol_asignacion';
      if (rol.integrantes.length) {
        rol.integrantes.forEach(miembro => {
          const fila = document.createElement('li');
          const nombre = document.createElement('strong');
          nombre.textContent = miembro.nombre || miembro.correo || 'Usuario';
          const correo = document.createElement('span');
          correo.textContent = miembro.correo || 'Correo no disponible';
          fila.append(nombre, correo);
          integrantes.appendChild(fila);
        });
      } else {
        const vacio = document.createElement('li');
        vacio.className = 'vacio_rol_asignacion';
        vacio.textContent = 'Sin integrantes asignados';
        integrantes.appendChild(vacio);
      }
      tarjeta.append(cabecera, integrantes);
      lista.appendChild(tarjeta);
    });
  }

  async function eliminarRolDepartamento(rol, boton) {
    if (!esJefeDepartamento(window.OCID.obtenerUsuarioSesion()) || !departamentoActual) {
      window.OCID.mostrarToast('Solo el jefe del departamento puede eliminar roles.', 'error');
      return;
    }
    // Confirmación personalizada antes de eliminar el rol del departamento
    if (!await window.OCID.confirmarAccion(`¿Deseas eliminar el rol "${rol.nombre}"? Los roles con integrantes asignados no se pueden eliminar.`)) {
      return;
    }

    boton.disabled = true;
    try {
      const resultado = await window.OCID.apiFetch(
        `/departamentos/${Number(departamentoActual.id)}/roles/${Number(rol.id)}`,
        { method: 'DELETE' }
      );
      if (!resultado.success || !resultado.rol) {
        throw new Error(resultado.error || 'No se pudo eliminar el rol.');
      }
      rolesDepartamento = rolesDepartamento.filter(nombre => normalizar(nombre) !== normalizar(rol.nombre));
      rolesDepartamentoDetalle = rolesDepartamentoDetalle.filter(detalle => Number(detalle.id) !== Number(rol.id));
      renderizarMiembros(miembrosActuales);
      renderizarModalRoles();
      window.OCID.mostrarToast('Rol eliminado correctamente.', 'exito');
    } catch (error) {
      console.error('Error al eliminar rol:', error);
      window.OCID.mostrarToast(error.message || 'No se pudo eliminar el rol.', 'error');
    } finally {
      boton.disabled = false;
    }
  }

  function filtrarMiembros() {
    const termino = (obtenerElemento('campo_busqueda_general')?.value || '').trim().toLocaleLowerCase('es-MX');
    const visibles = miembrosActuales.filter(miembro =>
      String(miembro.nombre || '').toLocaleLowerCase('es-MX').includes(termino)
    );
    renderizarMiembros(visibles);
  }

  function renderizarMiembros(lista) {
    const cuerpo = obtenerElemento('cuerpo_tabla_integrantes');
    if (!cuerpo) return;
    cuerpo.replaceChildren();
    const usuarioActual = window.OCID.obtenerUsuarioSesion();
    const esJefeActual = esJefeDepartamento(usuarioActual);

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
      celdaPuesto.appendChild(crearEtiquetaRol(nombreRolMiembro(miembro)));

      const celdaEstado = document.createElement('td');
      const estado = miembro.estado === 'Inactivo' ? 'Inactivo' : 'Activo';
      const indicadorEstado = document.createElement('span');
      // Estado con la misma píldora estándar
      indicadorEstado.className = `etiqueta_tipo ${estado === 'Inactivo' ? 'badge_estado_inactivo' : 'badge_estado_activo'}`;
      indicadorEstado.id = `estado_usuario_${miembro.id}`;
      const puntoEstado = document.createElement('span');
      puntoEstado.className = 'punto_etiqueta';
      indicadorEstado.append(puntoEstado, document.createTextNode(estado));
      celdaEstado.appendChild(indicadorEstado);

      const celdaAcciones = document.createElement('td');
      celdaAcciones.className = 'celda_acciones_integrante';
      if (esJefeActual) {
        const botonMenu = document.createElement('button');
        botonMenu.type = 'button';
        botonMenu.className = 'boton_acciones boton_menu_integrante';
        botonMenu.title = `Acciones para ${miembro.nombre || 'integrante'}`;
        botonMenu.setAttribute('aria-haspopup', 'true');
        botonMenu.setAttribute('aria-expanded', 'false');
        botonMenu.textContent = '⋮';

        const menu = document.createElement('div');
        menu.id = `menu_opciones_integrante_${miembro.id}`;
        menu.className = 'menu_integrante';
        menu.hidden = true;

        const esJefeIntegrante = Number(departamentoActual && departamentoActual.jefe_id) === Number(miembro.id) ||
          miembro.es_jefe === true || miembro.es_jefe === 't';
        const botonEstado = document.createElement('button');
        botonEstado.type = 'button';
        botonEstado.className = 'btn_cambiar_estado';
        botonEstado.textContent = estado === 'Activo' ? 'Hacer inactivo' : 'Activar';
        botonEstado.disabled = esJefeIntegrante;
        if (esJefeIntegrante) botonEstado.title = 'No se puede cambiar el estado del jefe del departamento';
        botonEstado.addEventListener('click', async () => {
          if (botonEstado.disabled) return;
          const siguienteEstado = miembro.estado === 'Inactivo' ? 'Activo' : 'Inactivo';
          botonEstado.disabled = true;
          try {
            const resultado = await window.OCID.apiFetch(`/usuarios/${Number(miembro.id)}/estado`, {
              method: 'PATCH',
              body: JSON.stringify({ estado: siguienteEstado })
            });
            if (!resultado.success || !resultado.usuario) {
              throw new Error(resultado.error || 'No se pudo cambiar el estado del integrante.');
            }
            if (!['Activo', 'Inactivo'].includes(resultado.usuario.estado)) {
              throw new Error('El servidor no devolvió un estado válido para el integrante.');
            }
            miembro.estado = resultado.usuario.estado;
            renderizarTodosIntegrantes();
            filtrarMiembros();
            window.OCID.mostrarToast('Estado actualizado correctamente.', 'exito');
          } catch (error) {
            console.error('Error al cambiar el estado del integrante:', error);
            window.OCID.mostrarToast(error.message || 'No se pudo cambiar el estado del integrante.', 'error');
          } finally {
            botonEstado.disabled = false;
          }
        });
        menu.appendChild(botonEstado);

        if (!esJefeIntegrante) {
          const etiquetaRol = document.createElement('label');
          etiquetaRol.className = 'menu_integrante_rol';
          etiquetaRol.appendChild(document.createTextNode('Rol'));
          const selectorRol = document.createElement('select');
          selectorRol.className = 'select_rol_integrante';
          [...new Set([...rolesDepartamento, miembro.rol || 'Docente'])].forEach(rol => {
            selectorRol.add(new Option(rol, rol));
          });
          selectorRol.value = miembro.rol || 'Docente';
          selectorRol.addEventListener('change', async () => {
            const rolAnterior = miembro.rol || 'Docente';
            selectorRol.disabled = true;
            try {
              const resultado = await window.OCID.apiFetch(`/usuarios/${Number(miembro.id)}/rol`, {
                method: 'PATCH',
                body: JSON.stringify({ rol: selectorRol.value })
              });
              if (!resultado.success || !resultado.usuario) {
                throw new Error(resultado.error || 'No se pudo asignar el rol.');
              }
              miembro.rol = resultado.usuario.rol;
              renderizarTodosIntegrantes();
              filtrarMiembros();
              window.OCID.mostrarToast('Rol actualizado correctamente.', 'exito');
            } catch (error) {
              selectorRol.value = rolAnterior;
              window.OCID.mostrarToast(error.message || 'No se pudo asignar el rol.', 'error');
            } finally {
              selectorRol.disabled = false;
            }
          });
          etiquetaRol.appendChild(selectorRol);
          menu.appendChild(etiquetaRol);
        }

        botonMenu.addEventListener('click', evento => {
          evento.stopPropagation();
          document.querySelectorAll('.menu_integrante').forEach(otroMenu => {
            if (otroMenu !== menu) {
              otroMenu.hidden = true;
              otroMenu.parentElement.querySelector('.boton_menu_integrante')?.setAttribute('aria-expanded', 'false');
            }
          });
          menu.hidden = !menu.hidden;
          botonMenu.setAttribute('aria-expanded', String(!menu.hidden));
        });
        celdaAcciones.append(botonMenu, menu);
      }
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
    if (departamento) {
      const jefeId = Number(departamento.jefe_id);
      miembros.sort((a, b) => {
        const aEsJefe = Number.isSafeInteger(jefeId) && jefeId > 0
          ? Number(a.id) === jefeId
          : a.es_jefe === true || a.es_jefe === 't';
        const bEsJefe = Number.isSafeInteger(jefeId) && jefeId > 0
          ? Number(b.id) === jefeId
          : b.es_jefe === true || b.es_jefe === 't';
        return Number(bEsJefe) - Number(aEsJefe);
      });
    }
    miembrosActuales = miembros;
    actualizarControlesEdicion();
    renderizarTodosIntegrantes();

    texto('nombre_departamento_texto', departamento ? departamento.nombre : 'Sin departamento asignado');
    const botonCodigo = obtenerElemento('boton_codigo_acceso');
    const textoCodigo = obtenerElemento('detalle_departamento_texto');
    if (botonCodigo && textoCodigo) {
      botonCodigo.hidden = !(departamento && departamento.codigo);
      textoCodigo.textContent = departamento && departamento.codigo
        ? `Código de acceso: ${departamento.codigo}`
        : '';
      codigoAccesoActual = departamento && departamento.codigo ? departamento.codigo : '';
    }
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
      avatarJefe.textContent = jefe
        ? nombreJefe.split(/\s+/).slice(0, 2).map(parte => parte[0] || '').join('').toUpperCase()
        : '';
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
      if (departamento) {
        const datosRoles = await window.OCID.apiFetch(`/departamentos/${Number(departamento.id)}/roles`);
        if (!datosRoles.success || !Array.isArray(datosRoles.roles)) {
          throw new Error(datosRoles.error || 'No se pudieron cargar los roles del departamento.');
        }
        rolesDepartamento = datosRoles.roles;
        rolesDepartamentoDetalle = Array.isArray(datosRoles.roles_detalle)
          ? datosRoles.roles_detalle
          : [];
      } else {
        rolesDepartamento = [];
        rolesDepartamentoDetalle = [];
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
    const botonOpciones = obtenerElemento('boton_opciones_departamento');
    const opcionEditar = obtenerElemento('opcion_editar_departamento');
    const modalIntegrantes = obtenerElemento('modal_todos_integrantes');
    const enlaceVerTodos = document.querySelector('.enlace_ver_todos[aria-controls="modal_todos_integrantes"]');
    const botonCerrarIntegrantes = obtenerElemento('cerrar_modal_todos_integrantes');
    const modalRoles = obtenerElemento('modal_roles_departamento');
    const botonVerRoles = obtenerElemento('boton_ver_roles_departamento');
    const botonCerrarRoles = obtenerElemento('cerrar_modal_roles_departamento');
    const cerrarModalEdicion = () => {
      if (modalEdicion) modalEdicion.classList.remove('modal_activo');
    };
    const cerrarModalRoles = () => {
      if (modalRoles) modalRoles.classList.remove('modal_activo');
    };

    const cerrarModalIntegrantes = () => {
      if (!modalIntegrantes || modalIntegrantes.hidden) return;
      modalIntegrantes.classList.remove('visible');
      window.setTimeout(() => {
        modalIntegrantes.hidden = true;
        if (enlaceVerTodos) enlaceVerTodos.focus();
      }, 300);
    };

    if (enlaceVerTodos && modalIntegrantes) {
      enlaceVerTodos.addEventListener('click', evento => {
        evento.preventDefault();
        renderizarTodosIntegrantes();
        modalIntegrantes.hidden = false;
        window.requestAnimationFrame(() => modalIntegrantes.classList.add('visible'));
        if (botonCerrarIntegrantes) botonCerrarIntegrantes.focus();
      });
      modalIntegrantes.addEventListener('click', evento => {
        if (evento.target === modalIntegrantes) cerrarModalIntegrantes();
      });
      document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && !modalIntegrantes.hidden) cerrarModalIntegrantes();
      });
    }
    if (botonCerrarIntegrantes) botonCerrarIntegrantes.addEventListener('click', cerrarModalIntegrantes);

    if (botonVerRoles && modalRoles) {
      botonVerRoles.addEventListener('click', () => {
        renderizarModalRoles();
        modalRoles.classList.add('modal_activo');
        botonCerrarRoles?.focus();
      });
      modalRoles.addEventListener('click', evento => {
        if (evento.target === modalRoles) cerrarModalRoles();
      });
      document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && modalRoles.classList.contains('modal_activo')) cerrarModalRoles();
      });
    }
    if (botonCerrarRoles) botonCerrarRoles.addEventListener('click', cerrarModalRoles);

    const cerrarMenuDepartamento = () => {
      if (menuDepartamento) menuDepartamento.hidden = true;
      if (botonOpciones) botonOpciones.setAttribute('aria-expanded', 'false');
    };

    if (botonOpciones && menuDepartamento) {
      botonOpciones.setAttribute('aria-haspopup', 'menu');
      botonOpciones.setAttribute('aria-expanded', 'false');
      botonOpciones.addEventListener('click', evento => {
        if (!puedeEditarDepartamento()) return;
        evento.stopPropagation();
        document.querySelectorAll('.menu_integrante').forEach(menu => { menu.hidden = true; });
        if (!menuDepartamento.hidden) {
          cerrarMenuDepartamento();
          return;
        }

        menuDepartamento.hidden = false;
        botonOpciones.setAttribute('aria-expanded', 'true');
      });
    }

    if (opcionEditar && modalEdicion) {
      opcionEditar.addEventListener('click', () => {
        if (!puedeEditarDepartamento()) {
          window.OCID.mostrarToast('No tienes permiso para editar este departamento.', 'error');
          return;
        }
        if (!departamentoActual) {
          window.OCID.mostrarToast('No hay un departamento asignado para editar.', true);
          return;
        }
        cerrarMenuDepartamento();
        obtenerElemento('input_editar_nombre_depto').value = departamentoActual.nombre || '';
        obtenerElemento('input_editar_desc_depto').value = departamentoActual.descripcion || '';
        modalEdicion.classList.add('modal_activo');
      });
    }

    ['boton_cerrar_modal_depto', 'boton_cancelar_modal_depto'].forEach(id => {
      const boton = obtenerElemento(id);
      if (boton) boton.addEventListener('click', cerrarModalEdicion);
    });
    if (modalEdicion) {
      modalEdicion.addEventListener('click', evento => {
        if (evento.target === modalEdicion) cerrarModalEdicion();
      });
      document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && modalEdicion.classList.contains('modal_activo')) cerrarModalEdicion();
      });
    }

    const guardar = obtenerElemento('boton_guardar_modal_depto');
    if (guardar) {
      guardar.addEventListener('click', async () => {
        const nombre = obtenerElemento('input_editar_nombre_depto').value.trim();
        const descripcion = obtenerElemento('input_editar_desc_depto').value.trim();
        if (!puedeEditarDepartamento()) {
          window.OCID.mostrarToast('No tienes permiso para editar este departamento.', 'error');
          return;
        }
        if (!departamentoActual || !nombre) {
          window.OCID.mostrarToast('El nombre del departamento no puede estar vacío.', true);
          return;
        }
        guardar.disabled = true;
        try {
          const resultado = await window.OCID.apiFetch(`/departamentos/${departamentoActual.id}`, {
            method: 'PUT',
            body: JSON.stringify({ nombre, descripcion })
          });
          if (!resultado.success || !resultado.departamento) {
            throw new Error(resultado.error || 'El servidor no devolvió el departamento actualizado.');
          }
          departamentoActual = resultado.departamento;
          texto('nombre_departamento_texto', departamentoActual.nombre || '');
          texto('parrafo_descripcion', departamentoActual.descripcion || 'Sin descripción disponible.');
          cerrarModalEdicion();
          window.OCID.mostrarToast('Departamento actualizado correctamente.');
        } catch (error) {
          console.error('Error al actualizar el departamento:', error);
          window.OCID.mostrarToast(error.message || 'No se pudo actualizar el departamento.', true);
        } finally {
          guardar.disabled = false;
        }
      });
    }

    window.addEventListener('click', evento => {
      if (menuDepartamento && !menuDepartamento.contains(evento.target) && evento.target !== botonOpciones) {
        cerrarMenuDepartamento();
      }
      if (!evento.target.closest('.menu_integrante, .boton_menu_integrante')) {
        document.querySelectorAll('.menu_integrante').forEach(menu => {
          menu.hidden = true;
          menu.parentElement.querySelector('.boton_menu_integrante')?.setAttribute('aria-expanded', 'false');
        });
      }
    });
    window.addEventListener('keydown', evento => {
      if (evento.key === 'Escape' && menuDepartamento && !menuDepartamento.hidden) {
        cerrarMenuDepartamento();
        botonOpciones?.focus();
      }
    });
    window.addEventListener('scroll', cerrarMenuDepartamento, true);

    const busqueda = obtenerElemento('campo_busqueda_general');
    if (busqueda) busqueda.addEventListener('input', filtrarMiembros);

    const botonCodigo = obtenerElemento('boton_codigo_acceso');
    if (botonCodigo) {
      botonCodigo.addEventListener('click', async () => {
        // Lee el código de la variable de módulo, sin atributos personalizados
        const codigo = codigoAccesoActual || '';
        if (!codigo) return;
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(codigo);
          } else {
            const campoTemporal = document.createElement('textarea');
            campoTemporal.value = codigo;
            campoTemporal.className = 'campo_copia_temporal';
            campoTemporal.setAttribute('readonly', '');
            document.body.appendChild(campoTemporal);
            campoTemporal.select();
            const copiado = document.execCommand('copy');
            campoTemporal.remove();
            if (!copiado) throw new Error('El navegador no permitió copiar el código.');
          }
          window.OCID.mostrarToast('Código de acceso copiado.', 'exito');
        } catch (error) {
          console.error('Error al copiar el código del departamento:', error);
          window.OCID.mostrarToast(error.message || 'No se pudo copiar el código.', 'error');
        }
      });
    }
  }

  function configurarGestionDepartamento() {
    const formTransferencia = obtenerElemento('form_transferir_jefatura');
    const formCrearRol = obtenerElemento('form_crear_rol_departamento');
    const modalTransferencia = obtenerElemento('modal_confirmar_transferencia');
    const formConfirmacionTransferencia = obtenerElemento('form_confirmar_transferencia');
    const inputConfirmacionTransferencia = obtenerElemento('confirmacion_transferencia_texto');
    const botonConfirmarTransferencia = obtenerElemento('confirmar_transferencia');
    const selectNuevoJefe = obtenerElemento('select_nuevo_jefe');
    const integranteTransferencia = obtenerElemento('integrante_transferencia_seleccionado');
    const modalBaja = obtenerElemento('modal_baja_departamento');
    const inputConfirmacion = obtenerElemento('confirmacion_baja_texto');
    const inputNombre = obtenerElemento('nombre_baja_texto');
    const botonConfirmarBaja = obtenerElemento('confirmar_baja_departamento');

    const validarConfirmacionTransferencia = () => {
      if (!botonConfirmarTransferencia || !selectNuevoJefe || !inputConfirmacionTransferencia) return;
      const nuevoJefeId = Number(selectNuevoJefe.value);
      botonConfirmarTransferencia.disabled =
        !Number.isSafeInteger(nuevoJefeId) ||
        nuevoJefeId <= 0 ||
        inputConfirmacionTransferencia.value !== FRASE_CONFIRMACION_TRANSFERENCIA;
    };

    const actualizarIntegranteTransferencia = () => {
      if (integranteTransferencia && selectNuevoJefe) {
        const opcion = selectNuevoJefe.selectedOptions[0];
        integranteTransferencia.textContent = opcion && opcion.value
          ? opcion.textContent
          : 'Sin integrante seleccionado';
      }
      validarConfirmacionTransferencia();
    };

    const cerrarModalTransferencia = () => {
      if (modalTransferencia) modalTransferencia.classList.remove('modal_activo');
      if (inputConfirmacionTransferencia) inputConfirmacionTransferencia.value = '';
      validarConfirmacionTransferencia();
    };

    if (formTransferencia) formTransferencia.addEventListener('submit', evento => {
      evento.preventDefault();
      if (!departamentoActual || !puedeGestionarDepartamento(window.OCID.obtenerUsuarioSesion())) {
        window.OCID.mostrarToast('No tienes permiso para transferir la jefatura.', 'error');
        return;
      }
      actualizarIntegranteTransferencia();
      if (modalTransferencia) {
        modalTransferencia.classList.add('modal_activo');
        inputConfirmacionTransferencia?.focus();
      }
    });

    if (selectNuevoJefe) selectNuevoJefe.addEventListener('change', actualizarIntegranteTransferencia);
    if (inputConfirmacionTransferencia) {
      inputConfirmacionTransferencia.addEventListener('input', validarConfirmacionTransferencia);
    }
    if (modalTransferencia) {
      modalTransferencia.addEventListener('click', evento => {
        if (evento.target === modalTransferencia) cerrarModalTransferencia();
      });
      document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && modalTransferencia.classList.contains('modal_activo')) {
          cerrarModalTransferencia();
        }
      });
    }
    ['cerrar_modal_transferencia', 'cancelar_transferencia'].forEach(id => {
      const boton = obtenerElemento(id);
      if (boton) boton.addEventListener('click', cerrarModalTransferencia);
    });

    if (formConfirmacionTransferencia) formConfirmacionTransferencia.addEventListener('submit', async evento => {
      evento.preventDefault();
      const usuario = window.OCID.obtenerUsuarioSesion();
      const nuevoJefeId = Number(selectNuevoJefe && selectNuevoJefe.value);
      if (!departamentoActual || !puedeGestionarDepartamento(usuario) ||
          !Number.isSafeInteger(nuevoJefeId) || nuevoJefeId <= 0 ||
          inputConfirmacionTransferencia.value !== FRASE_CONFIRMACION_TRANSFERENCIA) {
        validarConfirmacionTransferencia();
        window.OCID.mostrarToast('Selecciona un integrante y escribe exactamente “Transferir propiedad”.', 'advertencia');
        return;
      }

      botonConfirmarTransferencia.disabled = true;
      try {
        const resultado = await window.OCID.apiFetch(
          `/departamentos/${departamentoActual.id}/transferir-jefatura`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              nuevo_jefe_id: nuevoJefeId,
              confirmacion: inputConfirmacionTransferencia.value
            })
          }
        );
        if (!resultado.success || !resultado.usuario || !resultado.departamento) {
          throw new Error(resultado.error || 'El servidor no confirmó la transferencia de jefatura.');
        }
        window.OCID.guardarSesion({ ...usuario, ...resultado.usuario });
        window.OCID.mostrarToast('La jefatura se transfirió correctamente.');
        window.setTimeout(() => window.location.reload(), 600);
      } catch (error) {
        console.error('Error al transferir la jefatura:', error);
        window.OCID.mostrarToast(error.message || 'No se pudo transferir la jefatura.', 'error');
        validarConfirmacionTransferencia();
      }
    });

    if (formCrearRol) formCrearRol.addEventListener('submit', async evento => {
      evento.preventDefault();
      const usuario = window.OCID.obtenerUsuarioSesion();
      const nombre = obtenerElemento('nombre_rol_departamento').value.trim();
      const boton = formCrearRol.querySelector('[type="submit"]');
      if (!esJefeDepartamento(usuario) || !departamentoActual) {
        window.OCID.mostrarToast('Solo el jefe del departamento puede crear roles.', 'error');
        return;
      }
      if (!nombre) {
        window.OCID.mostrarToast('Escribe el nombre del rol.', 'advertencia');
        return;
      }
      if (rolesDepartamento.some(rol => normalizar(rol) === normalizar(nombre))) {
        window.OCID.mostrarToast('Ya existe un rol con ese nombre en este departamento.', 'advertencia');
        obtenerElemento('nombre_rol_departamento').focus();
        return;
      }
      boton.disabled = true;
      try {
        const resultado = await window.OCID.apiFetch(`/departamentos/${Number(departamentoActual.id)}/roles`, {
          method: 'POST',
          body: JSON.stringify({ nombre })
        });
        if (!resultado.success || !resultado.rol) {
          throw new Error(resultado.error || 'No se pudo crear el rol.');
        }
        rolesDepartamento = [...new Set([...rolesDepartamento, resultado.rol.nombre])];
        rolesDepartamentoDetalle = [...rolesDepartamentoDetalle, {
          ...resultado.rol,
          integrantes: []
        }];
        obtenerElemento('nombre_rol_departamento').value = '';
        renderizarMiembros(miembrosActuales);
        window.OCID.mostrarToast('Rol creado correctamente.', 'exito');
      } catch (error) {
        const esDuplicado = /ya existe/i.test(error.message || '');
        window.OCID.mostrarToast(
          esDuplicado ? 'Ya existe un rol con ese nombre en este departamento.' : (error.message || 'No se pudo crear el rol.'),
          esDuplicado ? 'advertencia' : 'error'
        );
        if (esDuplicado) obtenerElemento('nombre_rol_departamento').focus();
      } finally {
        boton.disabled = false;
      }
    });

    const cerrarModalBaja = () => {
      if (modalBaja) modalBaja.classList.remove('modal_activo');
      if (inputConfirmacion) inputConfirmacion.value = '';
      if (inputNombre) inputNombre.value = '';
      if (botonConfirmarBaja) botonConfirmarBaja.disabled = true;
    };

    const botonAbrirBaja = obtenerElemento('boton_abrir_baja_departamento');
    if (botonAbrirBaja) botonAbrirBaja.addEventListener('click', () => {
      if (!esJefeDepartamento(window.OCID.obtenerUsuarioSesion()) || !departamentoActual) return;
      if (modalBaja) modalBaja.classList.add('modal_activo');
    });
    if (modalBaja) {
      modalBaja.addEventListener('click', evento => {
        if (evento.target === modalBaja) cerrarModalBaja();
      });
      document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && modalBaja.classList.contains('modal_activo')) cerrarModalBaja();
      });
    }
    ['cerrar_modal_baja', 'cancelar_baja_departamento'].forEach(id => {
      const boton = obtenerElemento(id);
      if (boton) boton.addEventListener('click', cerrarModalBaja);
    });

    const validarConfirmacionBaja = () => {
      if (!botonConfirmarBaja || !departamentoActual) return;
      botonConfirmarBaja.disabled =
        inputConfirmacion.value !== FRASE_CONFIRMACION_BAJA ||
        inputNombre.value !== departamentoActual.nombre;
    };
    if (inputConfirmacion) inputConfirmacion.addEventListener('input', validarConfirmacionBaja);
    if (inputNombre) inputNombre.addEventListener('input', validarConfirmacionBaja);

    if (botonConfirmarBaja) botonConfirmarBaja.addEventListener('click', async () => {
      if (botonConfirmarBaja.disabled || !departamentoActual || !esJefeDepartamento(window.OCID.obtenerUsuarioSesion())) return;
      botonConfirmarBaja.disabled = true;
      try {
        const resultado = await window.OCID.apiFetch(`/departamentos/${departamentoActual.id}`, {
          method: 'DELETE',
          body: JSON.stringify({
            confirmacion: inputConfirmacion.value,
            nombre_departamento: inputNombre.value
          })
        });
        if (!resultado.success) throw new Error(resultado.error || 'No se pudo borrar el departamento.');
        const usuario = window.OCID.obtenerUsuarioSesion();
        if (usuario) {
          localStorage.setItem('usuario_ocid', JSON.stringify({
            ...usuario,
            departamento_id: null,
            departamento: null,
            departamento_nombre: null,
            departamento_objeto: null,
            es_jefe: false,
            rol: 'Docente'
          }));
        }
        window.OCID.mostrarToast('Departamento dado de baja correctamente.');
        window.location.href = 'bienvenida.html';
      } catch (error) {
        console.error('Error al borrar el departamento:', error);
        window.OCID.mostrarToast(error.message || 'No se pudo borrar el departamento.', true);
        validarConfirmacionBaja();
      }
    });

  }

  function configurarContacto() {
    const modal = obtenerElemento('modal_contacto');
    const abrir = obtenerElemento('boton_abrir_contacto');
    const cerrar = obtenerElemento('boton_cerrar_modal');
    const cancelar = obtenerElemento('boton_cancelar_modal');
    const enviar = obtenerElemento('boton_enviar_mensaje');
    const ocultar = () => { if (modal) modal.classList.remove('modal_activo'); };

    if (abrir && modal) abrir.addEventListener('click', () => { modal.classList.add('modal_activo'); });
    if (cerrar) cerrar.addEventListener('click', ocultar);
    if (cancelar) cancelar.addEventListener('click', ocultar);
    if (modal) {
      modal.addEventListener('click', evento => {
        if (evento.target === modal) ocultar();
      });
      document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && modal.classList.contains('modal_activo')) ocultar();
      });
    }
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
    configurarGestionDepartamento();
    configurarContacto();
    cargarDatosDepartamento();
  });
})();
