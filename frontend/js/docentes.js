/* Lógica propia de docentes.html */
(function () {
  window.rolesDepartamentoOCID = [];
  window.puedeGestionarRolesOCID = false;
  window.departamentoDocentesSeleccionado = null;

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
    window.puedeGestionarRolesOCID = Boolean(usuario &&
      (usuario.es_jefe === true || usuario.es_jefe === 't') &&
      Number.isSafeInteger(Number(usuario.departamento_id)) &&
      Number(usuario.departamento_id) > 0);
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

async function cargarDocentes(departamentoId) {
  const cuerpo = document.getElementById('cuerpo_tabla_docentes');
  cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="4">Cargando integrantes...</td></tr>';
  const grupoPaginacion = document.querySelector('.botones_paginacion_grupo');
  if (grupoPaginacion) grupoPaginacion.replaceChildren();

  try {
    const datos = await window.OCID.apiFetch(`/docentes?departamento_id=${Number(departamentoId)}`);
    if (!Array.isArray(datos)) throw new Error('La respuesta del servidor no es válida.');

    cuerpo.replaceChildren();
    datos.forEach(agregarFilaDocente);
    if (datos.length === 0) {
      cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="4">No hay integrantes activos en este departamento.</td></tr>';
    }
    filtrarTablaDocentes();
  } catch (error) {
    cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="4">No se pudo cargar. Intenta recargar.</td></tr>';
    mostrarAvisoDocentes(error.message || 'No se pudieron cargar los docentes.', true);
    filtrarTablaDocentes();
  }
}

async function cargarDepartamentosDocentes() {
  try {
    const departamentos = await window.OCID.apiFetch('/departamentos');
    if (!Array.isArray(departamentos)) throw new Error('No se pudieron cargar los departamentos.');
    renderizarTarjetasDepartamentos(departamentos);
  } catch (error) {
    const contenedor = document.getElementById('tarjetas_departamento_docentes');
    if (contenedor) contenedor.textContent = 'No se pudieron cargar los departamentos.';
    mostrarAvisoDocentes(error.message || 'Error al cargar los departamentos.', true);
  }
}

const PALETA_ROLES_PASTEL = [
  { bg: '#ede9fe', text: '#6d28d9', border: '#ddd6fe' }, // Jefe de Departamento (Lila pastel / Morado)
  { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' }, // Docente (Azul cielo pastel / Azul)
  { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' }, // Verde menta pastel / Esmeralda
  { bg: '#fef3c7', text: '#b45309', border: '#fde68a' }, // Ámbar pastel / Ocre
  { bg: '#ffe4e6', text: '#be123c', border: '#fecdd3' }, // Rosa pastel / Carmesí
  { bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe' }, // Índigo pastel / Azul marino
  { bg: '#ccfbf1', text: '#0f766e', border: '#99f6e4' }, // Turquesa pastel / Teal
  { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' }, // Naranja melocotón / Naranja
  { bg: '#fae8ff', text: '#a21caf', border: '#f5d0fe' }, // Fucsia orquídea / Magenta
  { bg: '#cffafe', text: '#0e7490', border: '#a5f3fc' }, // Cian pastel / Azul verdoso
];

function obtenerColoresRol(nombreRol) {
  const norm = String(nombreRol || '').trim().toLowerCase();
  if (norm.includes('jefe')) {
    return PALETA_ROLES_PASTEL[0];
  }
  if (norm === 'docente') {
    return PALETA_ROLES_PASTEL[1];
  }
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = norm.charCodeAt(i) + ((hash << 5) - hash);
  }
  const indice = 2 + (Math.abs(hash) % (PALETA_ROLES_PASTEL.length - 2));
  return PALETA_ROLES_PASTEL[indice];
}

function renderizarTarjetasDepartamentos(departamentos) {
  const contenedor = document.getElementById('tarjetas_departamento_docentes');
  const selectDepto = document.getElementById('filtro_departamento');

  if (selectDepto) {
    selectDepto.replaceChildren();
    const optDefault = document.createElement('option');
    optDefault.value = '';
    optDefault.textContent = 'Seleccionar departamento';
    selectDepto.appendChild(optDefault);

    departamentos.forEach(dep => {
      const opt = document.createElement('option');
      opt.value = String(dep.id);
      opt.textContent = dep.nombre;
      selectDepto.appendChild(opt);
    });

    selectDepto.addEventListener('change', () => {
      const deptoId = selectDepto.value;
      if (!deptoId) {
        window.departamentoDocentesSeleccionado = null;
        if (contenedor) {
          contenedor.querySelectorAll('.tarjeta_departamento_docentes').forEach(tarjeta => {
            tarjeta.setAttribute('aria-pressed', 'false');
          });
        }
        const cuerpo = document.getElementById('cuerpo_tabla_docentes');
        if (cuerpo) {
          cuerpo.innerHTML = '<tr><td class="ayuda_seleccion_departamento" colspan="4">Selecciona un departamento para ver sus integrantes.</td></tr>';
        }
        return;
      }
      const depObj = departamentos.find(d => Number(d.id) === Number(deptoId));
      window.departamentoDocentesSeleccionado = depObj || null;
      if (contenedor) {
        contenedor.querySelectorAll('.tarjeta_departamento_docentes').forEach(tarjeta => {
          tarjeta.setAttribute('aria-pressed', String(tarjeta.dataset.departamentoId === String(deptoId)));
        });
      }
      cargarDocentes(deptoId);
    });
  }

  if (!contenedor) return;
  contenedor.replaceChildren();
  if (!departamentos.length) {
    const estado = document.createElement('p');
    estado.className = 'estado_departamentos_docentes';
    estado.textContent = 'No hay departamentos activos.';
    contenedor.appendChild(estado);
    return;
  }

  departamentos.forEach(departamento => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'tarjeta_departamento_docentes';
    boton.dataset.departamentoId = String(departamento.id);
    boton.setAttribute('aria-pressed', 'false');
    boton.append(
      Object.assign(document.createElement('strong'), { textContent: departamento.nombre || 'Departamento' }),
      Object.assign(document.createElement('span'), { textContent: 'Ver integrantes activos' })
    );
    boton.addEventListener('click', () => {
      window.departamentoDocentesSeleccionado = departamento;
      if (selectDepto) selectDepto.value = String(departamento.id);
      contenedor.querySelectorAll('.tarjeta_departamento_docentes').forEach(tarjeta => {
        tarjeta.setAttribute('aria-pressed', String(tarjeta === boton));
      });
      cargarDocentes(departamento.id);
    });
    contenedor.appendChild(boton);
  });

  const usuario = window.OCID.obtenerUsuarioSesion();
  const propio = departamentos.find(departamento =>
    Number(departamento.id) === Number(usuario && usuario.departamento_id)
  );
  if (propio) {
    const botonPropio = Array.from(contenedor.querySelectorAll('.tarjeta_departamento_docentes'))
      .find(boton => Number(boton.dataset.departamentoId) === Number(propio.id));
    if (botonPropio) botonPropio.click();
  }
  else {
    const cuerpo = document.getElementById('cuerpo_tabla_docentes');
    if (cuerpo) {
      cuerpo.innerHTML = '<tr><td class="ayuda_seleccion_departamento" colspan="4">Selecciona un departamento para ver sus integrantes.</td></tr>';
    }
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

  // Celda Rol con etiqueta uniforme y colores pastel automáticos
  const celdaRol = document.createElement('td');
  celdaRol.className = 'celda_docente';
  const etiquetaRol = document.createElement('span');
  etiquetaRol.className = 'badge_rol';
  etiquetaRol.textContent = rolCalculado;
  const colores = obtenerColoresRol(rolCalculado);
  etiquetaRol.style.backgroundColor = colores.bg;
  etiquetaRol.style.color = colores.text;
  etiquetaRol.style.borderColor = colores.border;
  celdaRol.appendChild(etiquetaRol);
  fila.appendChild(celdaRol);

  // Celda Estado
  const celdaEstado = document.createElement('td');
  celdaEstado.className = 'celda_docente';
  celdaEstado.innerHTML = '<span class="badge_estado badge_estado_activo"><span class="punto_estado punto_activo"></span>Activo</span>';
  fila.appendChild(celdaEstado);

  document.getElementById('cuerpo_tabla_docentes').appendChild(fila);
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