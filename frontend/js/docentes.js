/* Lógica propia de docentes.html */
(function () {
  window.listaDepartamentosOCID = [];

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
      '.rol_usuario, .cargo_perfil, .rol_usuario_superior, .cargo_usuario, #etiqueta_rol_usuario'
    );
    const avatar = document.querySelector(
      '.avatar_usuario, .avatar_perfil, .avatar_superior, #avatar_usuario_circulo'
    );

    if (nombre && etiquetaNombre) etiquetaNombre.textContent = nombre;
    if (usuario && usuario.rol && etiquetaRol) etiquetaRol.textContent = usuario.rol;
    if (nombre && avatar) {
      const iniciales = nombre.split(/\s+/)
        .slice(0, 2)
        .map(parte => parte.charAt(0))
        .join('')
        .toUpperCase();
      avatar.textContent = iniciales;
      avatar.style.fontSize = '14px';
      avatar.style.fontWeight = '700';
    }

    if (usuario && usuario.id) {
      window.OCID.apiFetch('/notificaciones?usuario_id=' + encodeURIComponent(usuario.id))
        .then(datos => {
          const noLeidas = Array.isArray(datos) ? datos.filter(notificacion => !notificacion.leida).length : 0;
          document.querySelectorAll(
            '.badge_campana, .insignia_notificacion, .etiqueta_notificaciones, .insignia_notificacion_lateral, #indicador_notificaciones'
          ).forEach(insignia => {
            insignia.textContent = noLeidas;
            insignia.style.display = noLeidas === 0 ? 'none' : '';
          });
        })
        .catch(error => console.error('Error al actualizar el contador de notificaciones:', error));
    }

    document.querySelectorAll('.boton_campana').forEach(boton => {
      boton.addEventListener('click', () => {
        window.location.href = 'notificaciones.html';
      });
    });

    barraLateral.querySelectorAll('a[href="#"]').forEach(enlace => {
      if (enlace.textContent.toLowerCase().includes('cerrar sesión')) {
        enlace.href = 'login.html';
        enlace.addEventListener('click', evento => {
          evento.preventDefault();
          localStorage.removeItem('usuario_ocid');
          window.location.href = 'login.html';
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarInterfaz);
  } else {
    iniciarInterfaz();
  }
})();

function abrirModalDocente() {
  const modal = document.getElementById('modal_registro_docente');
  if (modal) modal.classList.add('modal_activo');
}

function cerrarModalDocente() {
  const modal = document.getElementById('modal_registro_docente');
  if (modal) modal.classList.remove('modal_activo');
  const formulario = document.getElementById('formulario_docente');
  if (formulario) formulario.reset();
}

window.addEventListener('click', function(evento) {
  const modal = document.getElementById('modal_registro_docente');
  if (evento.target === modal) {
    cerrarModalDocente();
  }
});

/* Notificaciones Toast Flotantes */
function mostrarAvisoDocentes(mensaje, error = false) {
  let contenedor = document.getElementById('contenedor_toast');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'contenedor_toast';
    contenedor.className = 'contenedor_toast_flotante';
    document.body.appendChild(contenedor);
  }

  let avisoAntiguo = document.getElementById('aviso_docentes');
  if (avisoAntiguo) avisoAntiguo.style.display = 'none';

  let textoFinal = mensaje;
  if (mensaje && (mensaje.toLowerCase().includes('failed to fetch') || mensaje.toLowerCase().includes('networkerror'))) {
    textoFinal = 'No se pudo conectar con el servidor';
  }

  const toast = document.createElement('div');
  let claseTipo = error ? 'toast_error' : 'toast_exito';
  let iconoSVG = error
    ? '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
    : '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';

  toast.className = `toast_mensaje ${claseTipo}`;
  toast.innerHTML = `
    <div class="toast_icono">${iconoSVG}</div>
    <div class="toast_texto">${String(textoFinal)}</div>
  `;

  contenedor.appendChild(toast);
  setTimeout(() => toast.classList.add('toast_visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast_visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

async function cargarDocentes() {
  const cuerpo = document.getElementById('cuerpo_tabla_docentes');
  cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="6">Cargando docentes...</td></tr>';
  const grupoPaginacion = document.querySelector('.botones_paginacion_grupo');
  if (grupoPaginacion) grupoPaginacion.replaceChildren();

  try {
    const datos = await window.OCID.apiFetch('/docentes');
    if (!Array.isArray(datos)) throw new Error('La respuesta del servidor no es válida.');

    cuerpo.replaceChildren();
    datos.forEach(agregarFilaDocente);
    if (datos.length === 0) {
      cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="6">No hay docentes registrados.</td></tr>';
    }
    filtrarTablaDocentes();
  } catch (error) {
    cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="6">No se pudo cargar. Intenta recargar.</td></tr>';
    mostrarAvisoDocentes('No se pudo cargar los docentes', true);
    filtrarTablaDocentes();
  }
}

async function cargarDepartamentosDocentes() {
  try {
    const datos = await window.OCID.apiFetch('/departamentos');

    window.listaDepartamentosOCID = Array.isArray(datos) ? datos : [];

    const filtroDepto = document.getElementById('filtro_departamento');
    if (filtroDepto) {
      filtroDepto.replaceChildren(new Option('Todos los departamentos', 'todos'));
      window.listaDepartamentosOCID.forEach(departamento => {
        filtroDepto.add(new Option(departamento.nombre, departamento.nombre));
      });
    }

    const selectorModal = document.getElementById('departamento_select');
    if (selectorModal) {
      selectorModal.replaceChildren();
      
      const optDefault = document.createElement('option');
      optDefault.value = '';
      optDefault.textContent = 'Sin departamento';
      selectorModal.appendChild(optDefault);

      window.listaDepartamentosOCID.forEach(departamento => {
        const opcion = document.createElement('option');
        opcion.value = String(departamento.id);
        opcion.dataset.nombre = departamento.nombre;
        opcion.textContent = departamento.nombre;
        selectorModal.appendChild(opcion);
      });
    }

    await cargarDocentes();
  } catch (error) {
    mostrarAvisoDocentes('Error al cargar departamentos', true);
  }
}

function obtenerRolAutomatico(docente) {
  if (docente.es_jefe) return 'Jefe';
  if (docente.rol) return docente.rol;
  return 'Docente';
}

function agregarFilaDocente(docente) {
  const nombre = docente.nombre || 'Sin nombre';
  const deptoIdDocente = (docente.departamento_id !== null && docente.departamento_id !== undefined && docente.departamento_id !== '')
    ? Number(docente.departamento_id)
    : null;

  let deptoNombreDocente = docente.departamento_nombre || docente.departamento || '';

  // Coincidencia inteligente por ID o Nombre
  let deptoEncontrado = null;
  if (Array.isArray(window.listaDepartamentosOCID)) {
    deptoEncontrado = window.listaDepartamentosOCID.find(d =>
      (deptoIdDocente !== null && Number(d.id) === deptoIdDocente) ||
      (deptoNombreDocente && String(d.nombre).trim().toLowerCase() === String(deptoNombreDocente).trim().toLowerCase())
    );
  }

  if (deptoEncontrado) {
    deptoNombreDocente = deptoEncontrado.nombre;
  } else if (!deptoNombreDocente) {
    deptoNombreDocente = 'Sin departamento';
  }

  const rolCalculado = obtenerRolAutomatico(docente);
  const iniciales = nombre.split(/\s+/).slice(0, 2).map(parte => parte[0]).join('').toUpperCase();
  
  const fila = document.createElement('tr');
  fila.className = 'fila_docente';
  fila.dataset.id = String(docente.id);
  fila.dataset.nombre = nombre;
  fila.dataset.departamento = deptoNombreDocente;
  fila.dataset.estado = 'Activo';

  // Celda Nombre y Avatar
  const celdaNombre = document.createElement('td');
  celdaNombre.className = 'celda_docente';
  const columnaNombre = document.createElement('div');
  columnaNombre.className = 'columna_nombre_info';
  const avatar = document.createElement('div');
  avatar.className = 'avatar_docente avatar_azul';
  avatar.textContent = iniciales;
  const textoNombre = document.createElement('span');
  textoNombre.className = 'texto_nombre_docente';
  textoNombre.textContent = nombre;
  columnaNombre.append(avatar, textoNombre);
  celdaNombre.appendChild(columnaNombre);
  fila.appendChild(celdaNombre);

  // Celda Correo
  const celdaCorreo = document.createElement('td');
  celdaCorreo.className = 'celda_docente';
  celdaCorreo.textContent = docente.correo || '';
  fila.appendChild(celdaCorreo);

  // Celda Selector de Departamento
  const celdaDepto = document.createElement('td');
  celdaDepto.className = 'celda_docente';
  const selectDepto = document.createElement('select');
  selectDepto.className = 'select_modal';
  selectDepto.style.padding = '4px 8px';
  selectDepto.style.fontSize = '13px';

  const optionSinDepto = document.createElement('option');
  optionSinDepto.value = '';
  optionSinDepto.textContent = 'Sin departamento';
  if (!deptoEncontrado && deptoIdDocente === null) {
    optionSinDepto.selected = true;
  }
  selectDepto.appendChild(optionSinDepto);

  if (Array.isArray(window.listaDepartamentosOCID)) {
    window.listaDepartamentosOCID.forEach(dep => {
      const opt = document.createElement('option');
      opt.value = String(dep.id);
      opt.textContent = dep.nombre;
      if (deptoEncontrado && Number(dep.id) === Number(deptoEncontrado.id)) {
        opt.selected = true;
      }
      selectDepto.appendChild(opt);
    });
  }

  selectDepto.addEventListener('change', async () => {
    const nuevoDeptoId = selectDepto.value ? Number(selectDepto.value) : null;
    try {
      const datos = await window.OCID.apiFetch(`/usuarios/${docente.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: docente.nombre,
          correo: docente.correo,
          departamento_id: nuevoDeptoId,
          rol: selectRol.value
        })
      });
      if (!datos.success) {
        throw new Error(datos.error || 'No se pudo actualizar el departamento');
      }
      mostrarAvisoDocentes('Departamento actualizado correctamente.', false);
      const deptoSeleccionadoObj = window.listaDepartamentosOCID.find(d => Number(d.id) === Number(nuevoDeptoId));
      const nuevoNombreDepto = deptoSeleccionadoObj ? deptoSeleccionadoObj.nombre : 'Sin departamento';
      fila.dataset.departamento = nuevoNombreDepto;
      docente.departamento_id = nuevoDeptoId;
    } catch (error) {
      mostrarAvisoDocentes('No se pudo actualizar el departamento', true);
    }
  });

  celdaDepto.appendChild(selectDepto);
  fila.appendChild(celdaDepto);

  // Celda Selector de Rol
  const celdaRol = document.createElement('td');
  celdaRol.className = 'celda_docente';

  const selectRol = document.createElement('select');
  selectRol.className = 'select_modal';
  selectRol.style.padding = '4px 8px';
  selectRol.style.fontSize = '13px';

  ['Docente', 'Jefe', 'Administrador'].forEach(opcionRol => {
    const opt = document.createElement('option');
    opt.value = opcionRol;
    opt.textContent = opcionRol;
    if (rolCalculado.toLowerCase() === opcionRol.toLowerCase()) {
      opt.selected = true;
    }
    selectRol.appendChild(opt);
  });

  selectRol.addEventListener('change', async () => {
    const nuevoRol = selectRol.value;
    try {
      const datos = await window.OCID.apiFetch(`/usuarios/${docente.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: docente.nombre,
          correo: docente.correo,
          departamento_id: docente.departamento_id ? Number(docente.departamento_id) : null,
          rol: nuevoRol
        })
      });
      if (!datos.success) {
        throw new Error(datos.error || 'No se pudo actualizar el rol');
      }
      mostrarAvisoDocentes('Rol actualizado correctamente.', false);
      docente.rol = nuevoRol;
    } catch (error) {
      mostrarAvisoDocentes('No se pudo actualizar el rol', true);
    }
  });

  celdaRol.appendChild(selectRol);
  fila.appendChild(celdaRol);

  // Celda Estado
  const celdaEstado = document.createElement('td');
  celdaEstado.className = 'celda_docente';
  celdaEstado.innerHTML = '<span class="badge_estado badge_estado_activo"><span class="punto_estado punto_activo"></span>Activo</span>';
  fila.appendChild(celdaEstado);

  // Celda Acción (Eliminar)
  const celdaAccion = document.createElement('td');
  celdaAccion.className = 'celda_docente';
  celdaAccion.style.textAlign = 'right';
  const botonEliminar = document.createElement('button');
  botonEliminar.className = 'boton_accion_fila';
  botonEliminar.type = 'button';
  botonEliminar.title = 'Eliminar docente';
  botonEliminar.setAttribute('aria-label', `Eliminar a ${nombre}`);
  botonEliminar.textContent = '×';
  botonEliminar.addEventListener('click', () => eliminarDocente(docente.id));
  celdaAccion.appendChild(botonEliminar);
  fila.appendChild(celdaAccion);

  document.getElementById('cuerpo_tabla_docentes').appendChild(fila);
}

async function procesarRegistroDocente(evento) {
  evento.preventDefault();
  const formulario = document.getElementById('formulario_docente');
  const botonGuardar = formulario.querySelector('[type="submit"]');
  botonGuardar.disabled = true;

  const selectDepto = document.getElementById('departamento_select');
  const deptoVal = selectDepto ? selectDepto.value : '';
  const textoDepto = (selectDepto && selectDepto.selectedIndex >= 0) 
    ? selectDepto.options[selectDepto.selectedIndex].text 
    : '';

  let departamentoId = null;
  let departamentoNombre = null;

  if (deptoVal && !isNaN(Number(deptoVal))) {
    departamentoId = Number(deptoVal);
    departamentoNombre = textoDepto !== 'Sin departamento' ? textoDepto : null;
  } else if (deptoVal) {
    departamentoNombre = deptoVal;
  }

  const rolVal = document.getElementById('rol_select') ? document.getElementById('rol_select').value : 'Docente';

  try {
    const datos = await window.OCID.apiFetch('/registro', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('nombre_docente_input').value.trim(),
        correo: document.getElementById('correo_docente_input').value.trim(),
        password: document.getElementById('password_docente_input').value,
        departamento_id: departamentoId,
        departamento: departamentoNombre,
        rol: rolVal
      })
    });
    if (!datos.success) {
      throw new Error(datos.error || 'No se pudo registrar el docente');
    }

    formulario.reset();
    cerrarModalDocente();
    mostrarAvisoDocentes('Docente registrado correctamente.', false);
    await cargarDocentes();
  } catch (error) {
    mostrarAvisoDocentes(error.message || 'No se pudo guardar el docente', true);
  } finally {
    botonGuardar.disabled = false;
  }
}

async function eliminarDocente(id) {
  let usuarioActual;
  try {
    usuarioActual = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
  } catch (error) {
    usuarioActual = null;
  }
  if (Number(usuarioActual && usuarioActual.id) === Number(id)) {
    mostrarAvisoDocentes('No se puede borrar: No puedes eliminar tu propia cuenta.', true);
    return;
  }
  if (!window.confirm('¿Seguro que quieres eliminar este docente?')) return;

  try {
    const datos = await window.OCID.apiFetch(`/usuarios/${Number(id)}`, {
      method: 'DELETE'
    });
    if (!datos.success) {
      throw new Error(datos.error || 'No se pudo borrar el docente');
    }
    mostrarAvisoDocentes('Docente eliminado correctamente.', false);
    await cargarDocentes();
  } catch (error) {
    mostrarAvisoDocentes('No se pudo eliminar el docente', true);
  }
}

let paginaDocentes = 1;
const docentesPorPagina = 4;

function filtrarTablaDocentes() {
  const textoFiltro = document.getElementById('filtro_nombre_input').value.toLowerCase().trim();
  const deptoFiltro = document.getElementById('filtro_departamento').value;
  const estadoFiltro = document.getElementById('filtro_estado').value;
  const filas = document.querySelectorAll('#cuerpo_tabla_docentes .fila_docente');
  const coincidentes = [];

  filas.forEach(fila => {
    const coincide = fila.dataset.nombre.toLowerCase().includes(textoFiltro) &&
      (deptoFiltro === 'todos' || fila.dataset.departamento === deptoFiltro) &&
      (estadoFiltro === 'todos' || fila.dataset.estado === estadoFiltro);
    if (coincide) coincidentes.push(fila);
  });

  const paginas = Math.max(1, Math.ceil(coincidentes.length / docentesPorPagina));
  paginaDocentes = Math.min(paginaDocentes, paginas);
  const inicio = (paginaDocentes - 1) * docentesPorPagina;
  
  coincidentes.forEach((fila, indice) => {
    fila.hidden = indice < inicio || indice >= inicio + docentesPorPagina;
  });
  filas.forEach(fila => {
    if (!coincidentes.includes(fila)) fila.hidden = true;
  });

  const cantidadMostrados = Math.min(docentesPorPagina, coincidentes.length - inicio);
  const totalDocentes = coincidentes.length;
  const resumenPaginacion = document.getElementById('resumen_paginacion');
  if (resumenPaginacion) {
    resumenPaginacion.textContent = `Mostrando ${Math.max(0, cantidadMostrados)} de ${totalDocentes} docentes`;
  }
  renderizarPaginacionDocentes(paginas);
}

function renderizarPaginacionDocentes(paginas) {
  const grupo = document.querySelector('.botones_paginacion_grupo');
  if (!grupo) return;
  grupo.replaceChildren();

  const agregarBoton = (texto, pagina, etiqueta) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn_pagina' + (pagina === paginaDocentes ? ' btn_pagina_activa' : '');
    boton.textContent = texto;
    boton.setAttribute('aria-label', etiqueta);
    if (pagina === paginaDocentes) {
      boton.disabled = true;
    }
    boton.addEventListener('click', () => {
      paginaDocentes = pagina;
      filtrarTablaDocentes();
    });
    grupo.appendChild(boton);
  };

  if (paginaDocentes > 1) {
    agregarBoton('‹', paginaDocentes - 1, 'Página anterior');
  }
  
  for (let pagina = 1; pagina <= paginas; pagina++) {
    agregarBoton(String(pagina), pagina, `Página ${pagina}`);
  }

  if (paginaDocentes < paginas) {
    agregarBoton('›', paginaDocentes + 1, 'Página siguiente');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  cargarDepartamentosDocentes();
});

document.querySelectorAll('[data-evento-pagina="evento-1"]').forEach(function (elemento) { elemento.addEventListener('click', function (event) { abrirModalDocente() }); });
document.querySelectorAll('[data-evento-pagina="evento-2"]').forEach(function (elemento) { elemento.addEventListener('input', function (event) { paginaDocentes = 1; filtrarTablaDocentes() }); });
document.querySelectorAll('[data-evento-pagina="evento-3"]').forEach(function (elemento) { elemento.addEventListener('change', function (event) { paginaDocentes = 1; filtrarTablaDocentes() }); });
document.querySelectorAll('[data-evento-pagina="evento-4"]').forEach(function (elemento) { elemento.addEventListener('change', function (event) { paginaDocentes = 1; filtrarTablaDocentes() }); });
document.querySelectorAll('[data-evento-pagina="evento-5"]').forEach(function (elemento) { elemento.addEventListener('click', function (event) { cerrarModalDocente() }); });
document.querySelectorAll('[data-evento-pagina="evento-6"]').forEach(function (elemento) { elemento.addEventListener('submit', function (event) { procesarRegistroDocente(event) }); });
document.querySelectorAll('[data-evento-pagina="evento-7"]').forEach(function (elemento)  { elemento.addEventListener('click', function (event) { cerrarModalDocente() }); });