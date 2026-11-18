/* Lógica propia de docentes.html */
(function () {
  window.rolesDepartamentoOCID = [];
  window.puedeGestionarRolesOCID = false;

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
    if (etiquetaRol) etiquetaRol.textContent = window.OCID.obtenerEtiquetaRolUsuario(usuario);
    const rolNormalizado = String(usuario && usuario.rol || '').trim().toLocaleLowerCase('es-MX');
    window.puedeGestionarRolesOCID = Boolean(usuario && (
      usuario.es_jefe === true || usuario.es_jefe === 't' ||
      rolNormalizado === 'jefe' || rolNormalizado === 'jefe de departamento' ||
      rolNormalizado === 'administrador' || rolNormalizado === 'administrador general'
    ));
    const botonCrearRol = document.getElementById('btn_crear_rol');
    if (botonCrearRol) botonCrearRol.hidden = !window.puedeGestionarRolesOCID;
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

/* Notificaciones Toast Flotantes */
function mostrarAvisoDocentes(mensaje, error = false) {
  window.OCID.mostrarToast(mensaje, error ? 'error' : 'exito');
}

async function cargarDocentes() {
  const cuerpo = document.getElementById('cuerpo_tabla_docentes');
  cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="5">Cargando docentes...</td></tr>';
  const grupoPaginacion = document.querySelector('.botones_paginacion_grupo');
  if (grupoPaginacion) grupoPaginacion.replaceChildren();

  try {
    const datos = await window.OCID.apiFetch('/docentes');
    if (!Array.isArray(datos)) throw new Error('La respuesta del servidor no es válida.');

    cuerpo.replaceChildren();
    datos.forEach(agregarFilaDocente);
    if (datos.length === 0) {
      cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="5">No hay docentes registrados en tu departamento.</td></tr>';
    }
    filtrarTablaDocentes();
  } catch (error) {
    cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="5">No se pudo cargar. Intenta recargar.</td></tr>';
    mostrarAvisoDocentes(error.message || 'No se pudieron cargar los docentes.', true);
    filtrarTablaDocentes();
  }
}

async function cargarDepartamentosDocentes() {
  try {
    const usuario = window.OCID.obtenerUsuarioSesion();
    const departamentoId = Number(usuario && usuario.departamento_id);
    if (Number.isSafeInteger(departamentoId) && departamentoId > 0) {
      const datos = await window.OCID.apiFetch(`/departamentos/${departamentoId}/roles`);
      if (!datos.success || !Array.isArray(datos.roles)) {
        throw new Error(datos.error || 'No se pudieron cargar los roles del departamento.');
      }
      window.rolesDepartamentoOCID = datos.roles;
    } else {
      window.rolesDepartamentoOCID = ['Docente', 'Administrador General'];
    }
    await cargarDocentes();
  } catch (error) {
    mostrarAvisoDocentes(error.message || 'Error al cargar roles y docentes.', true);
  }
}

function obtenerRolAutomatico(docente) {
  if (docente.es_jefe === true || docente.es_jefe === 't') return 'Jefe de Departamento';
  if (docente.rol) return docente.rol;
  return 'Docente';
}

function agregarFilaDocente(docente) {
  const nombre = docente.nombre || 'Sin nombre';
  const rolCalculado = obtenerRolAutomatico(docente);
  const iniciales = nombre.split(/\s+/).slice(0, 2).map(parte => parte[0]).join('').toUpperCase();
  
  const fila = document.createElement('tr');
  fila.className = 'fila_docente';
  fila.dataset.id = String(docente.id);
  fila.dataset.nombre = nombre;
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

  const celdaRol = document.createElement('td');
  celdaRol.className = 'celda_docente';
  const esJefe = docente.es_jefe === true || docente.es_jefe === 't';
  if (esJefe) {
    const etiquetaRol = document.createElement('span');
    etiquetaRol.className = 'badge_rol badge_rol_jefe';
    etiquetaRol.textContent = rolCalculado;
    celdaRol.appendChild(etiquetaRol);
  } else {
    const selectRol = document.createElement('select');
    selectRol.className = 'select_modal';
    selectRol.style.padding = '4px 8px';
    selectRol.style.fontSize = '13px';
    const roles = [...new Set([...(window.rolesDepartamentoOCID || []), rolCalculado])];
    roles.forEach(rol => {
      const opcion = document.createElement('option');
      opcion.value = rol;
      opcion.textContent = rol;
      opcion.selected = rol === rolCalculado;
      selectRol.appendChild(opcion);
    });
    selectRol.disabled = !window.puedeGestionarRolesOCID;
    selectRol.addEventListener('change', async () => {
      const rolAnterior = rolCalculado;
      try {
        const datos = await window.OCID.apiFetch(`/usuarios/${Number(docente.id)}/rol`, {
          method: 'PATCH',
          body: JSON.stringify({ rol: selectRol.value })
        });
        if (!datos.success) throw new Error(datos.error || 'No se pudo actualizar el rol.');
        docente.rol = datos.usuario.rol;
        mostrarAvisoDocentes('Rol actualizado correctamente.');
        const usuarioActual = window.OCID.obtenerUsuarioSesion();
        if (Number(usuarioActual && usuarioActual.id) === Number(docente.id)) {
          localStorage.setItem('usuario_ocid', JSON.stringify({ ...usuarioActual, ...datos.usuario }));
          window.location.reload();
          return;
        }
        await cargarDocentes();
      } catch (error) {
        selectRol.value = rolAnterior;
        mostrarAvisoDocentes(error.message || 'No se pudo actualizar el rol.', true);
      }
    });
    celdaRol.appendChild(selectRol);
  }
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
  const usuarioActual = window.OCID.obtenerUsuarioSesion();
  if (window.puedeGestionarRolesOCID && !esJefe &&
      Number(usuarioActual && usuarioActual.id) !== Number(docente.id)) {
    const botonEliminar = document.createElement('button');
    botonEliminar.className = 'boton_accion_fila';
    botonEliminar.type = 'button';
    botonEliminar.title = 'Eliminar docente';
    botonEliminar.setAttribute('aria-label', `Eliminar a ${nombre}`);
    botonEliminar.textContent = '×';
    botonEliminar.addEventListener('click', () => eliminarDocente(docente.id));
    celdaAccion.appendChild(botonEliminar);
  }
  fila.appendChild(celdaAccion);

  document.getElementById('cuerpo_tabla_docentes').appendChild(fila);
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
    mostrarAvisoDocentes(error.message || 'No se pudo eliminar el docente.', true);
  }
}

function configurarCreacionRol() {
  const modal = document.getElementById('modal_rol_departamento');
  const formulario = document.getElementById('formulario_crear_rol');
  const botonAbrir = document.getElementById('btn_crear_rol');
  const cerrar = () => {
    if (modal) modal.classList.remove('modal_activo');
    if (formulario) formulario.reset();
  };
  if (botonAbrir) botonAbrir.addEventListener('click', () => {
    if (window.puedeGestionarRolesOCID && modal) modal.classList.add('modal_activo');
  });
  ['cerrar_modal_rol', 'cancelar_modal_rol'].forEach(id => {
    const boton = document.getElementById(id);
    if (boton) boton.addEventListener('click', cerrar);
  });
  if (modal) modal.addEventListener('click', evento => {
    if (evento.target === modal) cerrar();
  });
  if (formulario) formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    const usuario = window.OCID.obtenerUsuarioSesion();
    const departamentoId = Number(usuario && usuario.departamento_id);
    const nombre = document.getElementById('nombre_rol_input').value.trim();
    const botonGuardar = formulario.querySelector('[type="submit"]');
    if (!window.puedeGestionarRolesOCID || !Number.isSafeInteger(departamentoId) || departamentoId <= 0) {
      mostrarAvisoDocentes('No tienes permiso para crear roles.', true);
      return;
    }
    botonGuardar.disabled = true;
    try {
      const resultado = await window.OCID.apiFetch(`/departamentos/${departamentoId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ nombre })
      });
      if (!resultado.success) throw new Error(resultado.error || 'No se pudo crear el rol.');
      cerrar();
      mostrarAvisoDocentes('Rol creado correctamente.');
      await cargarDepartamentosDocentes();
    } catch (error) {
      mostrarAvisoDocentes(error.message || 'No se pudo crear el rol.', true);
    } finally {
      botonGuardar.disabled = false;
    }
  });
}

let paginaDocentes = 1;
const docentesPorPagina = 4;

function filtrarTablaDocentes() {
  const textoFiltro = document.getElementById('filtro_nombre_input').value.toLowerCase().trim();
  const estadoFiltro = document.getElementById('filtro_estado').value;
  const filas = document.querySelectorAll('#cuerpo_tabla_docentes .fila_docente');
  const coincidentes = [];

  filas.forEach(fila => {
    const coincide = fila.dataset.nombre.toLowerCase().includes(textoFiltro) &&
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
  configurarCreacionRol();
  cargarDepartamentosDocentes();
});

document.getElementById('filtro_nombre_input').addEventListener('input', () => {
  paginaDocentes = 1;
  filtrarTablaDocentes();
});
document.getElementById('filtro_estado').addEventListener('change', () => {
  paginaDocentes = 1;
  filtrarTablaDocentes();
});