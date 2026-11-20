/* Controlador de la vista anuncios. */
/* Lógica propia de anuncios.html (Refactorizado con OCID Core) */
/* Limpieza aplicada: las acciones usan texto visible y título, sin atributos extra. */
(function () {
  'use strict';

  function iniciarInterfaz() {
    if (window.OCID) {
      window.OCID.configurarCierreSesion();
      window.OCID.actualizarCabeceraUsuario();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarInterfaz);
  } else {
    iniciarInterfaz();
  }
})();

let lista_de_anuncios = [];
let departamentos_anuncios = [];
let archivos_anuncios = [];
let conteos_departamento = [];
let anuncioEnEdicionId = null;

function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[caracter]);
}

function mostrarErrorAnuncios(mensaje, tipo = 'error') {
  if (window.OCID && window.OCID.mostrarToast) {
    window.OCID.mostrarToast(mensaje, tipo);
  }
}

function usuarioEsJefeDepartamento(usuario) {
  return Boolean(usuario && (usuario.es_jefe === true || usuario.es_jefe === 't'));
}

function perteneceAlDepartamentoAnuncio(anuncio, usuario) {
  const departamentoUsuarioId = Number(usuario && usuario.departamento_id);
  return [anuncio.departamento_emisor_id, anuncio.departamento_id]
    .some(id => Number(id) === departamentoUsuarioId);
}

// Los roles administrativos solo pueden eliminar dentro de su departamento
function puedeGestionarAnuncio(anuncio, usuario = window.OCID.obtenerUsuarioSesion()) {
  if (!usuario || !anuncio) return false;
  const pertenece = perteneceAlDepartamentoAnuncio(anuncio, usuario);
  return Number(usuario.id) === Number(anuncio.autor_id) ||
    (usuarioEsJefeDepartamento(usuario) && pertenece) ||
    (window.OCID.esRolAdministrativo(usuario) && pertenece);
}

function puedeEditarAnuncio(anuncio, usuario = window.OCID.obtenerUsuarioSesion()) {
  if (!usuario || window.OCID.esRolAdministrativo(usuario)) return false;
  return Number(usuario.id) === Number(anuncio.autor_id) ||
    (usuarioEsJefeDepartamento(usuario) && perteneceAlDepartamentoAnuncio(anuncio, usuario));
}

// Detecta anuncios creados por el usuario en sesión
function esAnuncioPropio(anuncio, usuario) {
  return Boolean(anuncio && usuario &&
    (anuncio.es_autor === true || Number(usuario.id) === Number(anuncio.autor_id)));
}

// Solo anuncios propios, del departamento emisor o del destino; los generales se conservan
function esAnuncioParaMiDepartamento(anuncio, usuario) {
  const miDepartamentoId = Number(usuario && usuario.departamento_id);
  if (!Number.isSafeInteger(miDepartamentoId) || miDepartamentoId <= 0) return true;
  if (esAnuncioPropio(anuncio, usuario)) return true;
  if (Number(anuncio && anuncio.departamento_emisor_id) === miDepartamentoId) return true;
  const destinoId = Number(anuncio && anuncio.departamento_id);
  if (!Number.isSafeInteger(destinoId) || destinoId <= 0) return true;
  return destinoId === miDepartamentoId;
}

// Solo el departamento de la sesión; sin departamento se conservan todos
function esDepartamentoDelUsuario(departamento, usuario) {
  const miId = Number(usuario && usuario.departamento_id);
  if (!Number.isSafeInteger(miId) || miId <= 0) return true;
  if (Number(departamento && departamento.id) === miId) return true;
  const miNombre = String((usuario && (usuario.departamento || usuario.departamento_nombre)) || '')
    .trim().toLowerCase();
  return Boolean(miNombre &&
    String((departamento && departamento.nombre) || '').trim().toLowerCase() === miNombre);
}

async function cargar_anuncios_desde_servidor() {
  try {
    const [datosAnuncios, datosDepartamentos, datosConteos, datosArchivos] = await Promise.all([
      window.OCID.apiFetch('/anuncios'),
      window.OCID.apiFetch('/departamentos'),
      window.OCID.apiFetch('/api/departamentos-con-conteo'),
      window.OCID.apiFetch('/archivos')
    ]);

    if (!Array.isArray(datosAnuncios) || !Array.isArray(datosDepartamentos) ||
        !datosConteos.success || !Array.isArray(datosConteos.departamentos) ||
        !Array.isArray(datosArchivos)) {
      throw new Error('El servidor devolvió datos incompletos para los anuncios.');
    }

    const usuarioSesion = window.OCID ? window.OCID.obtenerUsuarioSesion() : null;
    lista_de_anuncios = datosAnuncios.map(anuncio => ({
      ...anuncio,
      tipo: anuncio.prioridad || 'Urgente',
      departamento: anuncio.departamento_nombre || 'General',
      departamento_emisor: anuncio.departamento_emisor_nombre || '',
      autor: anuncio.autor_nombre || 'Coordinación',
      fecha: anuncio.fecha ? new Date(anuncio.fecha).toLocaleDateString('es-MX') : ''
    }));
    // Solo se muestran los anuncios propios, del departamento emisor o del destino
    lista_de_anuncios = lista_de_anuncios.filter(anuncio =>
      esAnuncioParaMiDepartamento(anuncio, usuarioSesion));
    departamentos_anuncios = datosDepartamentos;
    // Los paneles laterales también se limitan al departamento del usuario
    conteos_departamento = datosConteos.departamentos.filter(departamento =>
      esDepartamentoDelUsuario(departamento, usuarioSesion));
    archivos_anuncios = datosArchivos;

    const selectorDepartamento = document.getElementById('campo_departamento');
    if (selectorDepartamento) {
      selectorDepartamento.replaceChildren();
      selectorDepartamento.add(new Option('General (todos los departamentos)', 'general'));
      departamentos_anuncios.forEach(departamento => {
        const opcion = document.createElement('option');
        opcion.value = String(departamento.id);
        opcion.textContent = departamento.nombre;
        selectorDepartamento.appendChild(opcion);
      });
      const usuario = window.OCID.obtenerUsuarioSesion();
      if (usuario && usuario.departamento_id) {
        selectorDepartamento.value = String(usuario.departamento_id);
      }
    }

    const filtroDepartamento = document.getElementById('filtro_departamento');
    if (filtroDepartamento) {
      filtroDepartamento.replaceChildren(new Option('Todos los departamentos', ''));
      departamentos_anuncios.forEach(departamento => {
        filtroDepartamento.add(new Option(departamento.nombre, departamento.nombre));
      });
      filtroDepartamento.add(new Option('General', 'General'));
    }
  } catch (error) {
    lista_de_anuncios = [];
    departamentos_anuncios = [];
    conteos_departamento = [];
    archivos_anuncios = [];
    mostrarErrorAnuncios(error.message || 'No se pudieron cargar los anuncios.', 'error');
  }
  renderizar_interfaz();
}

function renderizar_interfaz() {
  const termino_busqueda = document.getElementById('filtro_busqueda_titulo').value.toLowerCase().trim();
  const depto_seleccionado = document.getElementById('filtro_departamento').value;
  const tipo_seleccionado = document.getElementById('filtro_tipo').value;

  const usuarioActual = window.OCID ? window.OCID.obtenerUsuarioSesion() : null;

  const anuncios_filtrados = lista_de_anuncios.filter(item => {
    const coincide_titulo = String(item.titulo || '').toLowerCase().includes(termino_busqueda);
    const coincide_depto = !depto_seleccionado || item.departamento === depto_seleccionado ||
      item.departamento_emisor === depto_seleccionado;
    const coincide_tipo = !tipo_seleccionado || item.tipo === tipo_seleccionado;
    return coincide_titulo && coincide_depto && coincide_tipo;
  });

  const contenedor = document.getElementById('contenedor_tarjetas_anuncios');
  if (!contenedor) return;
  contenedor.replaceChildren();

  // Tarjeta vacía centrada con ícono y texto gris suave
  if (anuncios_filtrados.length === 0) {
    const divVacio = document.createElement('div');
    divVacio.className = 'estado_vacio';
    const iconoVacio = document.createElement('i');
    iconoVacio.className = 'fa-solid fa-bullhorn icono_estado_vacio';
    const textoVacio = document.createElement('span');
    textoVacio.textContent = 'Aún no has recibido anuncios.';
    divVacio.append(iconoVacio, textoVacio);
    contenedor.appendChild(divVacio);
  } else {
    anuncios_filtrados.forEach(anuncio => {
      let clase_etiqueta = 'etiqueta_general';
      if (anuncio.tipo === 'Urgente') clase_etiqueta = 'etiqueta_urgente';
      if (anuncio.tipo === 'Moderado') clase_etiqueta = 'etiqueta_moderado';

      const puedeGestionar = puedeGestionarAnuncio(anuncio, usuarioActual);
      const puedeEditar = puedeEditarAnuncio(anuncio, usuarioActual);

      const tarjeta = document.createElement('article');
      tarjeta.className = 'tarjeta_anuncio';

      // El menú de opciones usa clases CSS, sin estilos inline

      // Creación estructurada de elementos sin usar innerHTML masivo por seguridad
      const filaEtiqueta = document.createElement('div');
      filaEtiqueta.className = 'fila_etiqueta_anuncio';

      const spanTipo = document.createElement('span');
      spanTipo.className = `etiqueta_tipo ${clase_etiqueta}`;
      const punto = document.createElement('span');
      punto.className = 'punto_etiqueta';
      spanTipo.appendChild(punto);
      spanTipo.appendChild(document.createTextNode(` ${anuncio.tipo}`));
      filaEtiqueta.appendChild(spanTipo);

      if (puedeGestionar) {
        const contenedorOpciones = document.createElement('div');
        contenedorOpciones.className = 'contenedor_opciones_anuncio';

        const btnOpciones = document.createElement('button');
        btnOpciones.className = 'boton_opciones_anuncio';
        btnOpciones.type = 'button';
        btnOpciones.title = 'Más opciones';
        btnOpciones.innerHTML = '&#8942;';
        btnOpciones.addEventListener('click', (e) => toggleMenuOpciones(e, anuncio.id));
        contenedorOpciones.appendChild(btnOpciones);

        const menuDesplegable = document.createElement('div');
        menuDesplegable.id = `menu_opciones_${anuncio.id}`;
        menuDesplegable.className = 'menu_opciones_anuncio';

        if (puedeEditar) {
          const btnEditar = document.createElement('button');
          btnEditar.type = 'button';
          btnEditar.className = 'boton_menu_opcion';
          btnEditar.innerHTML = '<svg fill="none" height="15" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Editar';
          btnEditar.addEventListener('click', () => prepararEdicionAnuncio(anuncio.id, puedeEditar));
          menuDesplegable.appendChild(btnEditar);
        }

        const btnEliminar = document.createElement('button');
        btnEliminar.type = 'button';
        btnEliminar.className = 'boton_menu_opcion boton_menu_opcion_eliminar';
        btnEliminar.innerHTML = '<svg fill="none" height="15" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Eliminar';
        btnEliminar.addEventListener('click', () => eliminarAnuncio(anuncio.id, puedeGestionar));

        menuDesplegable.appendChild(btnEliminar);
        contenedorOpciones.appendChild(menuDesplegable);
        filaEtiqueta.appendChild(contenedorOpciones);
      }
      tarjeta.appendChild(filaEtiqueta);

      const h3Titulo = document.createElement('h3');
      h3Titulo.className = 'titulo_anuncio';
      h3Titulo.textContent = anuncio.titulo;
      tarjeta.appendChild(h3Titulo);

      const pDesc = document.createElement('p');
      pDesc.className = 'descripcion_anuncio';
      pDesc.textContent = anuncio.contenido;
      tarjeta.appendChild(pDesc);

      const filaMeta = document.createElement('div');
      filaMeta.className = 'fila_metadatos_anuncio';

      const crearMeta = (svgPath, texto) => {
        const span = document.createElement('span');
        span.className = 'item_metadato';
        span.innerHTML = `<svg class="icono_metadato" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${svgPath}"/></svg> ${escaparHTML(texto)}`;
        return span;
      };

      filaMeta.appendChild(crearMeta('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5', anuncio.departamento));
      filaMeta.appendChild(crearMeta('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', anuncio.autor || 'Coordinación'));
      filaMeta.appendChild(crearMeta('M8 7V3m8 7V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', anuncio.fecha));

      tarjeta.appendChild(filaMeta);

      // El autor ya tiene su anuncio como visto y no puede marcarlo
      const esPropio = esAnuncioPropio(anuncio, usuarioActual);
      if (esPropio) anuncio.visto = true;
      const botonVisto = document.createElement('button');
      botonVisto.type = 'button';
      botonVisto.className = 'boton_visto_elemento' + (anuncio.visto ? ' visto' : ' pendiente') +
        (esPropio ? ' boton_visto_propio' : '');
      botonVisto.innerHTML = anuncio.visto
        ? '<svg class="icono_check_visto" viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg><span>Visto</span>'
        : '<svg class="icono_check_visto" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="4 10 8 14 16 6"></polyline></svg><span>Marcar como visto</span>';
      botonVisto.disabled = Boolean(anuncio.visto);
      botonVisto.title = esPropio ? 'Anuncio propio, ya visto'
        : (anuncio.visto ? 'Anuncio visto' : 'Marcar anuncio como visto');
      if (!esPropio) {
        botonVisto.addEventListener('click', async () => {
          botonVisto.disabled = true;
          try {
            await window.OCID.marcarElementoVisto('anuncio', Number(anuncio.id));
            anuncio.visto = true;
            renderizar_interfaz();
          } catch (error) {
            mostrarErrorAnuncios(error.message || 'No se pudo marcar el anuncio como visto.', 'error');
            botonVisto.disabled = false;
          }
        });
      }
      tarjeta.appendChild(botonVisto);
      contenedor.appendChild(tarjeta);
    });
  }

  actualizar_panel_lateral();
}

// Abre o cierra el menú de opciones alternando una clase CSS
function toggleMenuOpciones(evento, idAnuncio) {
  evento.stopPropagation();
  document.querySelectorAll('[id^="menu_opciones_"]').forEach(menu => {
    if (menu.id !== `menu_opciones_${idAnuncio}`) menu.classList.remove('menu_abierto');
  });

  const menu = document.getElementById(`menu_opciones_${idAnuncio}`);
  if (menu) menu.classList.toggle('menu_abierto');
}

// Cierra cualquier menú abierto al hacer clic fuera
window.addEventListener('click', () => {
  document.querySelectorAll('[id^="menu_opciones_"]').forEach(menu => {
    menu.classList.remove('menu_abierto');
  });
});

function prepararEdicionAnuncio(id) {
  const anuncio = lista_de_anuncios.find(a => a.id === id);
  if (!anuncio) return;
  if (!puedeEditarAnuncio(anuncio)) {
    mostrarErrorAnuncios('No tienes permiso para editar este anuncio.', 'error');
    return;
  }

  anuncioEnEdicionId = id;
  document.getElementById('campo_titulo').value = anuncio.titulo;
  document.getElementById('campo_tipo').value = anuncio.prioridad || anuncio.tipo;
  document.getElementById('campo_contenido').value = anuncio.contenido;
  
  document.getElementById('campo_departamento').value = anuncio.departamento_id
    ? String(anuncio.departamento_id)
    : 'general';

  abrir_modal();
}

async function eliminarAnuncio(id) {
  const anuncio = lista_de_anuncios.find(item => Number(item.id) === Number(id));
  if (!anuncio || !puedeGestionarAnuncio(anuncio)) {
    mostrarErrorAnuncios('No tienes permiso para eliminar este anuncio.', 'error');
    return;
  }

  // Confirmación personalizada antes de eliminar el anuncio
  if (!await window.OCID.confirmarAccion('¿Estás seguro de que deseas eliminar este anuncio?')) return;

  try {
    const datos = await window.OCID.apiFetch(`/anuncios/${id}`, {
      method: 'DELETE'
    });

    if (!datos.success) {
      throw new Error('No se pudo borrar el anuncio en el servidor');
    }

    mostrarErrorAnuncios('Anuncio eliminado con éxito.', 'exito');
    await cargar_anuncios_desde_servidor();

  } catch (error) {
    mostrarErrorAnuncios('No se pudo eliminar el anuncio.', 'error');
  }
}

function actualizar_panel_lateral() {
  const contenedorConteos = document.getElementById('lista_conteo_departamentos');
  if (contenedorConteos) {
    contenedorConteos.replaceChildren();
    conteos_departamento.slice(0, 5).forEach((departamento, indice) => {
      const anuncios = Number(departamento.anuncios_activos) || 0;
      const archivos = Number(departamento.archivos_activos) || 0;
      const fila = document.createElement('div');
      fila.className = 'fila_conteo_departamento';

      const etiqueta = document.createElement('span');
      etiqueta.className = 'indicador_con_nombre';
      const punto = document.createElement('span');
      punto.className = `punto_departamento punto_departamento_${indice % 5}`;
      const nombre = document.createElement('span');
      nombre.textContent = departamento.nombre;
      etiqueta.append(punto, nombre);

      const cifra = document.createElement('span');
      cifra.className = 'cifra_departamento';
      cifra.textContent = String(anuncios + archivos);
      cifra.title = `${anuncios} anuncios y ${archivos} archivos`;
      fila.append(etiqueta, cifra);
      contenedorConteos.appendChild(fila);
    });
    if (!conteos_departamento.length) {
      const vacio = document.createElement('p');
      vacio.className = 'estado_conteo_vacio';
      vacio.textContent = 'No hay departamentos activos.';
      contenedorConteos.appendChild(vacio);
    }
  }

  const contenedor_ultimos = document.getElementById('contenedor_ultimos_anuncios');
  if (!contenedor_ultimos) return;
  contenedor_ultimos.replaceChildren();

  // El panel lateral también avisa cuando no hay anuncios recibidos
  if (!lista_de_anuncios.length) {
    const divVacio = document.createElement('div');
    divVacio.className = 'estado_vacio';
    const iconoVacio = document.createElement('i');
    iconoVacio.className = 'fa-solid fa-bullhorn icono_estado_vacio';
    const textoVacio = document.createElement('span');
    textoVacio.textContent = 'Aún no has recibido anuncios.';
    divVacio.append(iconoVacio, textoVacio);
    contenedor_ultimos.appendChild(divVacio);
    return;
  }

  const ultimos_tres = lista_de_anuncios.slice(0, 3);
  ultimos_tres.forEach(u => {
    const item_div = document.createElement('div');
    item_div.className = 'item_ultimo_anuncio';
    
    const tituloDiv = document.createElement('div');
    tituloDiv.className = 'item_ultimo_titulo';
    tituloDiv.textContent = u.titulo;
    
    const fechaDiv = document.createElement('div');
    fechaDiv.className = 'item_ultimo_fecha';
    fechaDiv.textContent = u.fecha;

    item_div.appendChild(tituloDiv);
    item_div.appendChild(fechaDiv);
    contenedor_ultimos.appendChild(item_div);
  });
}

function mostrarTodosLosElementosDepartamento() {
  const modal = document.getElementById('modal_conteo_departamentos');
  const contenido = document.getElementById('contenido_conteo_departamentos');
  if (!modal || !contenido) return;
  contenido.replaceChildren();

  conteos_departamento.forEach(departamento => {
    const departamentoId = Number(departamento.id);
    const anuncios = lista_de_anuncios.filter(item => Number(item.departamento_id) === departamentoId);
    const archivos = archivos_anuncios.filter(item => Number(item.departamento_id) === departamentoId);
    const seccion = document.createElement('section');
    seccion.className = 'grupo_elementos_departamento';
    const titulo = document.createElement('h4');
    titulo.textContent = departamento.nombre;
    const resumen = document.createElement('p');
    resumen.className = 'resumen_elementos_departamento';
    resumen.textContent = `${anuncios.length} anuncios · ${archivos.length} archivos`;
    const lista = document.createElement('ul');
    lista.className = 'lista_elementos_departamento';

    [...anuncios.map(item => ({ tipo: 'Anuncio', nombre: item.titulo })),
      ...archivos.map(item => ({ tipo: 'Archivo', nombre: item.nombre }))]
      .forEach(item => {
        const fila = document.createElement('li');
        const tipo = document.createElement('span');
        tipo.className = 'tipo_elemento_departamento';
        tipo.textContent = item.tipo;
        const nombre = document.createElement('span');
        nombre.textContent = item.nombre || 'Sin título';
        fila.append(tipo, nombre);
        lista.appendChild(fila);
      });

    if (!lista.children.length) {
      const filaVacia = document.createElement('li');
      filaVacia.className = 'elementos_departamento_vacios';
      filaVacia.textContent = 'No hay anuncios ni archivos activos.';
      lista.appendChild(filaVacia);
    }
    seccion.append(titulo, resumen, lista);
    contenido.appendChild(seccion);
  });
  modal.classList.add('modal_activo');
}

function cerrarModalConteoDepartamentos() {
  const modal = document.getElementById('modal_conteo_departamentos');
  if (modal) modal.classList.remove('modal_activo');
}

const modal_nuevo = document.getElementById('modal_nuevo_anuncio');
const boton_abrir_modal = document.getElementById('boton_abrir_modal');
const boton_cerrar_cruz = document.getElementById('boton_cerrar_cruz');
const boton_cancelar = document.getElementById('boton_cancelar_modal');
const form_nuevo_anuncio = document.getElementById('formulario_nuevo_anuncio');

function abrir_modal() {
  if (modal_nuevo) modal_nuevo.classList.add('modal_activo');
}

function cerrar_modal() {
  if (modal_nuevo) modal_nuevo.classList.remove('modal_activo');
  if (form_nuevo_anuncio) form_nuevo_anuncio.reset();
  anuncioEnEdicionId = null;
}

// El rol administrativo no puede crear anuncios
if (boton_abrir_modal && window.OCID.esRolAdministrativo(window.OCID.obtenerUsuarioSesion())) {
  boton_abrir_modal.hidden = true;
}
if (boton_abrir_modal) {
  boton_abrir_modal.addEventListener('click', () => {
    anuncioEnEdicionId = null;
    abrir_modal();
  });
}
if (boton_cerrar_cruz) boton_cerrar_cruz.addEventListener('click', cerrar_modal);
if (boton_cancelar) boton_cancelar.addEventListener('click', cerrar_modal);

if (modal_nuevo) {
  modal_nuevo.addEventListener('click', (evento) => {
    if (evento.target === modal_nuevo) cerrar_modal();
  });
}

if (form_nuevo_anuncio) {
  form_nuevo_anuncio.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuario = window.OCID ? window.OCID.obtenerUsuarioSesion() : null;
    if (!usuario || !usuario.id) {
      mostrarErrorAnuncios('Inicia sesión para publicar un anuncio.', 'advertencia');
      return;
    }

    const departamentoSeleccionado = document.getElementById('campo_departamento').value;
    const objeto_anuncio = {
      titulo: document.getElementById('campo_titulo').value.trim(),
      prioridad: document.getElementById('campo_tipo').value,
      departamento_id: departamentoSeleccionado === 'general' ? null : Number(departamentoSeleccionado),
      contenido: document.getElementById('campo_contenido').value.trim(),
      autor_id: Number(usuario.id)
    };

    const botonEnviar = form_nuevo_anuncio.querySelector('[type="submit"]');
    if (botonEnviar && botonEnviar.disabled) return;
    if (botonEnviar) botonEnviar.disabled = true;
    try {
      let url = '/anuncios';
      let metodo = 'POST';
      let esEdicion = anuncioEnEdicionId !== null;

      if (esEdicion) {
        url = `/anuncios/${anuncioEnEdicionId}`;
        metodo = 'PUT';
      }

      const datos = await window.OCID.apiFetch(url, {
        method: metodo,
        body: JSON.stringify(objeto_anuncio)
      });

      if (!datos.success) {
        throw new Error('No se pudo guardar el anuncio');
      }

      cerrar_modal();
      
      const mensajeExito = esEdicion ? 'Anuncio actualizado con éxito.' : 'Anuncio creado con éxito.';
      mostrarErrorAnuncios(mensajeExito, 'exito');

      await cargar_anuncios_desde_servidor();
    } catch (error) {
      mostrarErrorAnuncios(error.message || 'Ocurrió un error al guardar el anuncio.', 'error');
    } finally {
      if (botonEnviar) botonEnviar.disabled = false;
    }
  });
}

if (document.getElementById('filtro_busqueda_titulo')) document.getElementById('filtro_busqueda_titulo').addEventListener('input', renderizar_interfaz);
if (document.getElementById('filtro_departamento')) document.getElementById('filtro_departamento').addEventListener('change', renderizar_interfaz);
if (document.getElementById('filtro_tipo')) document.getElementById('filtro_tipo').addEventListener('change', renderizar_interfaz);

const botonVerTodoDepartamentos = document.getElementById('boton_ver_todo_departamentos');
const botonCerrarConteoDepartamentos = document.getElementById('cerrar_modal_conteo_departamentos');
const modalConteoDepartamentos = document.getElementById('modal_conteo_departamentos');
if (botonVerTodoDepartamentos) {
  botonVerTodoDepartamentos.addEventListener('click', mostrarTodosLosElementosDepartamento);
}
if (botonCerrarConteoDepartamentos) {
  botonCerrarConteoDepartamentos.addEventListener('click', cerrarModalConteoDepartamentos);
}
if (modalConteoDepartamentos) {
  modalConteoDepartamentos.addEventListener('click', evento => {
    if (evento.target === modalConteoDepartamentos) cerrarModalConteoDepartamentos();
  });
}

if (document.getElementById('boton_limpiar')) {
  document.getElementById('boton_limpiar').addEventListener('click', () => {
    document.getElementById('filtro_busqueda_titulo').value = '';
    document.getElementById('filtro_departamento').value = '';
    document.getElementById('filtro_tipo').value = '';
    renderizar_interfaz();
  });
}

window.addEventListener('DOMContentLoaded', cargar_anuncios_desde_servidor);