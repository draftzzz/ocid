/* Controlador de la vista archivos. */
/* Lógica propia de archivos.html */
/* Limpieza aplicada: las acciones usan texto visible y título, sin atributos extra. */
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

const modalArchivo = document.getElementById('modal_subir_archivo');
const selectorArchivo = document.getElementById('input_archivo_oculto');
const cuerpoArchivos = document.getElementById('cuerpo_tabla_archivos');
let archivosCargados = [];
let archivoEnEdicionId = null;

function sesionArchivos() {
  try {
    return JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
  } catch (error) {
    console.error('No se pudieron leer los datos de sesión:', error);
    return null;
  }
}

// Sistema unificado de Notificaciones Toast Flotantes
function mostrarToastArchivos(mensaje, tipo = 'exito') {
  window.OCID.mostrarToast(mensaje, tipo);
}

function formatearTamano(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

// Tipos reconocidos y su presentación visual
const TIPOS_ARCHIVO_CONOCIDOS = {
  pdf: { etiqueta: 'PDF', icono: 'icono_tipo_pdf', badge: 'badge_pdf' },
  xlsx: { etiqueta: 'XLSX', icono: 'icono_tipo_xlsx', badge: 'badge_xlsx' },
  docx: { etiqueta: 'DOCX', icono: 'icono_tipo_docx', badge: 'badge_docx' }
};

// Resuelve la extensión desde el nombre o el MIME; vacío significa desconocido
function obtenerClaveTipoArchivo(archivo) {
  const nombre = String(archivo.nombre || '');
  const extension = nombre.includes('.') ? nombre.split('.').pop().toLowerCase() : '';
  if (TIPOS_ARCHIVO_CONOCIDOS[extension]) return extension;

  const mime = String(archivo.tipo || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xlsx';
  if (mime.includes('wordprocessing') || mime.includes('msword')) return 'docx';
  return '';
}

function puedeGestionarArchivo(archivo) {
  const usuario = sesionArchivos();
  if (!usuario) return false;
  const esJefe = usuario.es_jefe === true || usuario.es_jefe === 't';
  const departamentoId = Number(usuario.departamento_id);
  const perteneceAlDepartamento = [archivo.departamento_emisor_id, archivo.departamento_id]
    .some(id => Number(id) === departamentoId);
  const esAdmin = ['administrador', 'administrador general']
    .includes(String(usuario.rol || '').trim().toLowerCase());
  return Number(usuario.id) === Number(archivo.autor_id) || esAdmin || (esJefe && perteneceAlDepartamento);
}

// Detecta archivos subidos por el usuario en sesión
function esArchivoPropio(archivo, usuario) {
  return Boolean(archivo && usuario &&
    (archivo.es_autor === true || Number(usuario.id) === Number(archivo.autor_id)));
}

function crearBotonVisto(tipo, elemento) {
  // El autor ya tiene su archivo como visto y no puede marcarlo
  const esPropio = esArchivoPropio(elemento, sesionArchivos());
  if (esPropio) elemento.visto = true;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton_visto_elemento' + (elemento.visto ? ' visto' : ' pendiente') +
    (esPropio ? ' boton_visto_propio' : '');
  boton.innerHTML = elemento.visto
    ? '<svg class="icono_check_visto" viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg><span>Visto</span>'
    : '<svg class="icono_check_visto" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="4 10 8 14 16 6"></polyline></svg><span>Marcar como visto</span>';
  boton.disabled = Boolean(elemento.visto);
  boton.title = esPropio ? 'Archivo propio, ya visto'
    : (elemento.visto ? 'Archivo visto' : 'Marcar archivo como visto');
  if (!esPropio) {
    boton.addEventListener('click', async () => {
      boton.disabled = true;
      try {
        await window.OCID.marcarElementoVisto(tipo, Number(elemento.id));
        elemento.visto = true;
        dibujarArchivos();
      } catch (error) {
        mostrarToastArchivos(error.message || 'No se pudo marcar el archivo como visto.', 'error');
        boton.disabled = false;
      }
    });
  }
  return boton;
}

function abrirEdicionArchivo(id) {
  const archivo = archivosCargados.find(item => Number(item.id) === Number(id));
  if (!archivo || !puedeGestionarArchivo(archivo)) {
    mostrarToastArchivos('No tienes permiso para editar este archivo.', 'error');
    return;
  }
  archivoEnEdicionId = Number(archivo.id);
  document.getElementById('titulo_modal_archivo').textContent = 'Editar documento';
  document.getElementById('zona_archivo').hidden = true;
  document.getElementById('nombre_documento').value = archivo.nombre;
  document.getElementById('departamento_seleccion').value = String(archivo.departamento_id || '');
  document.getElementById('guardar_archivo').textContent = 'Guardar cambios';
  modalArchivo.classList.add('modal_activo');
}

function prepararNuevaCarga() {
  archivoEnEdicionId = null;
  if (selectorArchivo) selectorArchivo.value = '';
  document.getElementById('titulo_modal_archivo').textContent = 'Subir nuevo documento';
  document.getElementById('zona_archivo').hidden = false;
  document.getElementById('nombre_documento').value = '';
  document.getElementById('guardar_archivo').textContent = 'Subir archivo';
}

function dibujarArchivos() {
  if (!cuerpoArchivos) return;
  cuerpoArchivos.replaceChildren();
  
  const filtroDepartamento = document.getElementById('filtro_departamento').value;
  const filtroTipo = document.getElementById('filtro_tipo').value;
  const filtroNombre = document.getElementById('filtro_nombre').value.toLowerCase().trim();

  const visibles = archivosCargados.filter(archivo => {
    const departamento = String(archivo.departamento_id || '');
    const claveTipo = obtenerClaveTipoArchivo(archivo) || 'otro';
    return (filtroDepartamento === 'todos' || filtroDepartamento === departamento) &&
      (filtroTipo === 'todos' || filtroTipo === claveTipo) &&
      String(archivo.nombre || '').toLowerCase().includes(filtroNombre);
  });

  visibles.forEach(archivo => {
    const fila = document.createElement('tr');
    
    const celdaNombre = document.createElement('td');
    const contenedorNombre = document.createElement('div');
    contenedorNombre.className = 'contenedor_nombre_archivo';
    
    // Tipo conocido o etiqueta genérica para MIME desconocido
    const claveTipo = obtenerClaveTipoArchivo(archivo);
    const tipoArchivo = TIPOS_ARCHIVO_CONOCIDOS[claveTipo];
    const etiquetaTipo = tipoArchivo ? tipoArchivo.etiqueta : 'Otro tipo de archivo';
    const iconoTipo = document.createElement('div');
    iconoTipo.className = tipoArchivo ? tipoArchivo.icono : 'icono_tipo_otro';
    iconoTipo.textContent = tipoArchivo ? etiquetaTipo.slice(0, 4) : 'OTRO';

    const textosDiv = document.createElement('div');
    const nombreDiv = document.createElement('div');
    nombreDiv.className = 'texto_nombre_archivo';
    nombreDiv.textContent = archivo.nombre;
    const tamanoDiv = document.createElement('div');
    tamanoDiv.className = 'texto_tamano_archivo';
    tamanoDiv.textContent = formatearTamano(Number(archivo.tamano) || 0);
    textosDiv.append(nombreDiv, tamanoDiv);

    contenedorNombre.append(iconoTipo, textosDiv);
    celdaNombre.appendChild(contenedorNombre);

    const celdaTipo = document.createElement('td');
    const badge = document.createElement('span');
    // Píldora estándar con punto de color para el tipo
    badge.className = `etiqueta_tipo ${tipoArchivo ? tipoArchivo.badge : 'badge_otro'}`;
    const puntoTipo = document.createElement('span');
    puntoTipo.className = 'punto_etiqueta';
    badge.append(puntoTipo, document.createTextNode(etiquetaTipo));
    celdaTipo.appendChild(badge);

    const celdaDepartamento = document.createElement('td');
    celdaDepartamento.textContent = archivo.departamento_nombre || 'Sin departamento';

    const celdaAutor = document.createElement('td');
    celdaAutor.textContent = archivo.autor_nombre || 'Usuario';

    const celdaFecha = document.createElement('td');
    celdaFecha.textContent = archivo.fecha ? new Date(archivo.fecha).toLocaleDateString('es-MX') : '';

    const celdaAcciones = document.createElement('td');
    const contenedorAcciones = document.createElement('div');
    contenedorAcciones.className = 'acciones_celda';

    const botonDescargar = document.createElement('button');
    botonDescargar.type = 'button';
    botonDescargar.className = 'boton_accion_icono';
    botonDescargar.title = 'Descargar';
    botonDescargar.innerHTML = '<svg fill="none" height="17" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="17"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x2="12" y1="15" y2="3"></line></svg>';
    botonDescargar.addEventListener('click', () => descargarArchivo(archivo.id));

    const botonEliminar = document.createElement('button');
    botonEliminar.type = 'button';
    botonEliminar.className = 'boton_accion_icono';
    botonEliminar.title = 'Eliminar';
    botonEliminar.innerHTML = '<svg fill="none" height="17" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="17"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    botonEliminar.addEventListener('click', () => eliminarArchivo(archivo.id));

    contenedorAcciones.append(botonDescargar, crearBotonVisto('archivo', archivo));
    if (puedeGestionarArchivo(archivo)) contenedorAcciones.appendChild(botonEliminar);
    celdaAcciones.appendChild(contenedorAcciones);

    fila.append(celdaNombre, celdaTipo, celdaDepartamento, celdaAutor, celdaFecha, celdaAcciones);
    cuerpoArchivos.appendChild(fila);
  });

  if (!visibles.length) {
    // Fila de estado vacío con texto UTF-8 correcto
    const filaVacia = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 6;
    // Alineación y padding del estado vacío en archivos.css
    celda.className = 'celda_estado_vacio_archivos';
    celda.textContent = 'Aún no has recibido archivos.';
    filaVacia.appendChild(celda);
    cuerpoArchivos.appendChild(filaVacia);
  }
}

async function cargarArchivos() {
  try {
    const [archivos, departamentos] = await Promise.all([
      window.OCID.apiFetch('/archivos'),
      window.OCID.apiFetch('/departamentos')
    ]);
    archivosCargados = archivos;

    const selector = document.getElementById('filtro_departamento');
    if (selector) {
      selector.replaceChildren(new Option('Todos los departamentos', 'todos'));
      departamentos.forEach(departamento => selector.add(new Option(departamento.nombre, String(departamento.id))));
    }

    const selectorDestino = document.getElementById('departamento_seleccion');
    if (selectorDestino) {
      selectorDestino.replaceChildren(new Option('Selecciona un departamento', ''));
      departamentos.forEach(departamento => selectorDestino.add(new Option(departamento.nombre, String(departamento.id))));
      const usuario = sesionArchivos();
      if (usuario && usuario.departamento_id) selectorDestino.value = String(usuario.departamento_id);
    }

    dibujarArchivos();
  } catch (error) {
    mostrarToastArchivos('No se pudo cargar', 'error');
  }
}

async function descargarArchivo(id) {
  try {
    const datos = await window.OCID.apiFetch('/archivos/' + encodeURIComponent(id));
    const archivo = datos && datos.archivo;
    if (!archivo || typeof archivo.ruta !== 'string') {
      throw new Error('El servidor no devolvió el contenido del archivo.');
    }

    const separador = archivo.ruta.indexOf(',');
    const contenidoBase64 = separador >= 0 ? archivo.ruta.slice(separador + 1) : archivo.ruta;
    if (!contenidoBase64) throw new Error('El archivo no contiene datos descargables.');

    const binario = atob(contenidoBase64);
    const bytes = new Uint8Array(binario.length);
    for (let indice = 0; indice < binario.length; indice++) bytes[indice] = binario.charCodeAt(indice);
    const url = URL.createObjectURL(new Blob([bytes], { type: archivo.tipo || 'application/octet-stream' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = archivo.nombre || `archivo-${id}`;
    enlace.hidden = true;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    mostrarToastArchivos('Archivo descargado correctamente.', 'exito');
  } catch (error) {
    console.error('Error al descargar archivo:', error);
    mostrarToastArchivos(error.message || 'No se pudo descargar el archivo.', 'error');
  }
}

async function eliminarArchivo(id, autorId) {
  const archivo = archivosCargados.find(item => Number(item.id) === Number(id));
  if (!archivo || !puedeGestionarArchivo(archivo)) {
    mostrarToastArchivos('No tienes permiso para eliminar este archivo.', 'error');
    return;
  }

  // Confirmación personalizada antes de eliminar el archivo
  if (!await window.OCID.confirmarAccion('¿Estás seguro de eliminar este archivo?')) return;
  
  try {
    await window.OCID.apiFetch('/archivos/' + encodeURIComponent(id), { method: 'DELETE' });
    mostrarToastArchivos('El archivo se eliminó correctamente.', 'exito');
    await cargarArchivos();
  } catch (error) {
    mostrarToastArchivos('No se pudo cargar', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const abrirModalBtn = document.getElementById('abrir_modal_subir');
  const cerrarModalBtn = document.getElementById('cerrar_modal_subir');
  const cancelarModalBtn = document.getElementById('cancelar_modal');
  const zonaArchivo = document.getElementById('zona_archivo');

  if (abrirModalBtn) abrirModalBtn.addEventListener('click', () => {
    prepararNuevaCarga();
    if (modalArchivo) modalArchivo.classList.add('modal_activo');
  });
  const cerrarModal = () => {
    if (modalArchivo) modalArchivo.classList.remove('modal_activo');
    prepararNuevaCarga();
  };
  if (cerrarModalBtn) cerrarModalBtn.addEventListener('click', cerrarModal);
  if (cancelarModalBtn) cancelarModalBtn.addEventListener('click', cerrarModal);
  
  if (modalArchivo) {
    modalArchivo.addEventListener('click', evento => { if (evento.target === modalArchivo) cerrarModal(); });
  }

  if (zonaArchivo && selectorArchivo) {
    zonaArchivo.addEventListener('click', () => selectorArchivo.click());
    selectorArchivo.addEventListener('change', () => {
      if (selectorArchivo.files.length) {
        document.getElementById('nombre_documento').value = selectorArchivo.files[0].name;
      }
    });
  }

  const filtroDepto = document.getElementById('filtro_departamento');
  const filtroTipo = document.getElementById('filtro_tipo');
  const filtroNombre = document.getElementById('filtro_nombre');

  if (filtroDepto) filtroDepto.addEventListener('change', dibujarArchivos);
  if (filtroTipo) filtroTipo.addEventListener('change', dibujarArchivos);
  if (filtroNombre) filtroNombre.addEventListener('input', dibujarArchivos);

  const guardarBtn = document.getElementById('guardar_archivo');
  if (guardarBtn) {
    guardarBtn.addEventListener('click', async () => {
      const esEdicion = archivoEnEdicionId !== null;
      const archivo = selectorArchivo.files[0];
      const usuario = sesionArchivos();
      const departamentoIdSelect = document.getElementById('departamento_seleccion').value;
      const departamentoId = departamentoIdSelect ? Number(departamentoIdSelect) : null;

      if ((!archivo && archivoEnEdicionId === null) || !usuario || !usuario.id || !departamentoId) {
        mostrarToastArchivos('Inicia sesión, selecciona un archivo y elige un departamento de destino.', 'advertencia');
        return;
      }
      if (archivo && archivo.size > 10 * 1024 * 1024) {
        mostrarToastArchivos('El archivo supera el límite de 10 MB.', 'advertencia');
        return;
      }

      try {
        const nombre = document.getElementById('nombre_documento').value.trim() || (archivo && archivo.name);
        if (esEdicion) {
          await window.OCID.apiFetch(`/archivos/${archivoEnEdicionId}`, {
            method: 'PUT',
            body: JSON.stringify({ nombre, departamento_id: departamentoId })
          });
        } else {
          const contenido = await new Promise((resolver, rechazar) => {
            const lector = new FileReader();
            lector.onload = () => resolver(lector.result);
            lector.onerror = () => rechazar(new Error('No se pudo leer el archivo seleccionado.'));
            lector.readAsDataURL(archivo);
          });
          await window.OCID.apiFetch('/archivos', {
            method: 'POST',
            body: JSON.stringify({
              nombre,
              contenido,
              tipo: archivo.type || 'application/octet-stream',
              tamano: archivo.size,
              autor_id: usuario.id,
              departamento_id: departamentoId
            })
          });
        }

        cerrarModal();
        mostrarToastArchivos(esEdicion ? 'Archivo actualizado.' : 'Archivo subido correctamente.', 'exito');
        await cargarArchivos();
      } catch (error) {
        console.error('Error al guardar archivo:', error);
        mostrarToastArchivos(error.message || 'No se pudo guardar el archivo.', 'error');
      }
    });
  }

  cargarArchivos().catch(error => {
    console.error(error);
  });
});