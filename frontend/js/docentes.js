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
      // Iniciales con estilo definido en CSS
      avatar.classList.add('avatar_usuario_iniciales');
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

// Carga los docentes del departamento elegido (o del usuario si no hay filtro)
async function cargarDocentes(departamentoId) {
  const cuerpo = document.getElementById('cuerpo_tabla_docentes');
  cuerpo.innerHTML = '<tr><td class="celda_docente" colspan="4">Cargando integrantes...</td></tr>';
  const grupoPaginacion = document.querySelector('.botones_paginacion_grupo');
  if (grupoPaginacion) grupoPaginacion.replaceChildren();

  try {
    const ruta = departamentoId ? `/docentes?departamento_id=${Number(departamentoId)}` : '/docentes';
    const datos = await window.OCID.apiFetch(ruta);
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

// Pobla el selector de departamentos sin tarjetas superiores
async function cargarFiltroDepartamentos() {
  try {
    const departamentos = await window.OCID.apiFetch('/departamentos');
    if (!Array.isArray(departamentos)) throw new Error('No se pudieron cargar los departamentos.');
    const selectDepto = document.getElementById('filtro_departamento');
    if (!selectDepto) return;

    // Genera las opciones del filtro inferior
    selectDepto.replaceChildren(new Option('Seleccionar departamento', ''));
    departamentos.forEach(dep => selectDepto.appendChild(new Option(dep.nombre, String(dep.id))));

    // Selecciona por defecto el departamento del usuario en sesión
    const usuario = window.OCID.obtenerUsuarioSesion();
    const propio = departamentos.find(dep => Number(dep.id) === Number(usuario && usuario.departamento_id));
    if (propio) {
      selectDepto.value = String(propio.id);
      window.departamentoDocentesSeleccionado = propio;
    }

    // Recarga la tabla al cambiar de departamento
    selectDepto.addEventListener('change', () => {
      const deptoId = selectDepto.value;
      window.departamentoDocentesSeleccionado = departamentos.find(dep => Number(dep.id) === Number(deptoId)) || null;
      cargarDocentes(deptoId);
    });

    cargarDocentes(selectDepto.value);
  } catch (error) {
    mostrarAvisoDocentes(error.message || 'Error al cargar los departamentos.', true);
    cargarDocentes();
  }
}

// Devuelve una variante de color estable para cada rol
function obtenerIndiceColorRol(nombreRol) {
  const norm = String(nombreRol || '').trim().toLowerCase();
  if (norm.includes('jefe')) return 0;
  if (norm === 'docente') return 1;
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = norm.charCodeAt(i) + ((hash << 5) - hash);
  }
  return 2 + (Math.abs(hash) % 8);
}

function obtenerRolAutomatico(docente) {
  if (docente.es_jefe === true || docente.es_jefe === 't') return 'Jefe de Departamento';
  if (docente.rol) return docente.rol;
  return 'Docente';
}

// Nombres por fila en un WeakMap para filtrar sin atributos personalizados
const nombresPorFila = new WeakMap();

function agregarFilaDocente(docente) {
  const nombre = docente.nombre || 'Sin nombre';
  const rolCalculado = obtenerRolAutomatico(docente);
  const iniciales = nombre.split(/\s+/).slice(0, 2).map(parte => parte[0]).join('').toUpperCase();
  
  const fila = document.createElement('tr');
  fila.className = 'fila_docente';
  // Guarda el nombre en el WeakMap en lugar de atributos personalizados
  nombresPorFila.set(fila, nombre);

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
  // Píldora estándar con punto de color para el rol
  etiquetaRol.className = `etiqueta_tipo badge_rol badge_rol_variante_${obtenerIndiceColorRol(rolCalculado)}`;
  const puntoRol = document.createElement('span');
  puntoRol.className = 'punto_etiqueta';
  etiquetaRol.append(puntoRol, document.createTextNode(rolCalculado));
  celdaRol.appendChild(etiquetaRol);
  fila.appendChild(celdaRol);

  // Celda Estado
  const celdaEstado = document.createElement('td');
  celdaEstado.className = 'celda_docente';
  // Estado con la misma píldora estándar
  celdaEstado.innerHTML = '<span class="etiqueta_tipo badge_estado badge_estado_activo"><span class="punto_etiqueta"></span>Activo</span>';
  fila.appendChild(celdaEstado);

  document.getElementById('cuerpo_tabla_docentes').appendChild(fila);
}

let paginaDocentes = 1;
const docentesPorPagina = 4;

function filtrarTablaDocentes() {
  const textoFiltro = document.getElementById('filtro_nombre_input').value.toLowerCase().trim();
  const filas = document.querySelectorAll('#cuerpo_tabla_docentes .fila_docente');
  const coincidentes = [];

  // Solo se filtra por nombre dentro del departamento elegido
  filas.forEach(fila => {
    if ((nombresPorFila.get(fila) || '').toLowerCase().includes(textoFiltro)) coincidentes.push(fila);
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
    // Contador compacto: mostrados de total
    resumenPaginacion.textContent = `Mostrando ${Math.max(0, cantidadMostrados)} de ${totalDocentes}`;
  }
  renderizarPaginacionDocentes(paginas);
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

// Paginación con flechas y un máximo de cuatro números visibles
function renderizarPaginacionDocentes(paginas) {
  const grupo = document.querySelector('.botones_paginacion_grupo');
  if (!grupo) return;
  grupo.replaceChildren();

  const agregarBoton = (texto, pagina, etiqueta, deshabilitado = false, clase = '') => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `btn_pagina ${clase} ${pagina === paginaDocentes && !deshabilitado ? 'btn_pagina_activa' : ''}`.trim();
    boton.textContent = texto;
    boton.setAttribute('aria-label', etiqueta);
    boton.disabled = deshabilitado;
    if (!deshabilitado) {
      boton.addEventListener('click', () => {
        paginaDocentes = pagina;
        filtrarTablaDocentes();
      });
    }
    grupo.appendChild(boton);
  };

  // Flecha izquierda siempre disponible
  agregarBoton('<', Math.max(1, paginaDocentes - 1), 'Página anterior', paginaDocentes === 1, 'btn_pagina_flecha');

  // Números de página y puntos suspensivos
  obtenerPaginasVisibles(paginaDocentes, paginas).forEach(valor => {
    if (valor === '...') {
      const puntos = document.createElement('span');
      puntos.className = 'elipsis_paginacion';
      puntos.textContent = '…';
      grupo.appendChild(puntos);
    } else {
      agregarBoton(String(valor), valor, `Página ${valor}`);
    }
  });

  // Flecha derecha siempre disponible
  agregarBoton('>', Math.min(paginas, paginaDocentes + 1), 'Página siguiente', paginaDocentes === paginas, 'btn_pagina_flecha');
}

document.addEventListener('DOMContentLoaded', () => {
  cargarFiltroDepartamentos();
});

document.getElementById('filtro_nombre_input').addEventListener('input', () => {
  paginaDocentes = 1;
  filtrarTablaDocentes();
});
