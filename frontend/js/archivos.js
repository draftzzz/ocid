/* Lógica propia de archivos.html */
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

function dibujarArchivos() {
  if (!cuerpoArchivos) return;
  cuerpoArchivos.replaceChildren();
  
  const filtroDepartamento = document.getElementById('filtro_departamento').value;
  const filtroTipo = document.getElementById('filtro_tipo').value;
  const filtroNombre = document.getElementById('filtro_nombre').value.toLowerCase().trim();

  const visibles = archivosCargados.filter(archivo => {
    const departamento = String(archivo.departamento_id || '');
    const extension = (archivo.nombre.split('.').pop() || '').toLowerCase();
    return (filtroDepartamento === 'todos' || filtroDepartamento === departamento) &&
      (filtroTipo === 'todos' || filtroTipo === extension) &&
      archivo.nombre.toLowerCase().includes(filtroNombre);
  });

  visibles.forEach(archivo => {
    const fila = document.createElement('tr');
    
    const celdaNombre = document.createElement('td');
    const contenedorNombre = document.createElement('div');
    contenedorNombre.className = 'contenedor_nombre_archivo';
    
    const extension = (archivo.nombre.split('.').pop() || '').toUpperCase();
    const iconoTipo = document.createElement('div');
    iconoTipo.className = extension === 'PDF' ? 'icono_tipo_pdf' : 'icono_tipo_xlsx';
    iconoTipo.textContent = extension.slice(0, 4);

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
    badge.className = extension === 'PDF' ? 'badge_pdf' : 'badge_xlsx';
    badge.textContent = extension;
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
    botonEliminar.addEventListener('click', () => eliminarArchivo(archivo.id, archivo.autor_id));

    contenedorAcciones.append(botonDescargar, botonEliminar);
    celdaAcciones.appendChild(contenedorAcciones);

    fila.append(celdaNombre, celdaTipo, celdaDepartamento, celdaAutor, celdaFecha, celdaAcciones);
    cuerpoArchivos.appendChild(fila);
  });

  if (!visibles.length) {
    const filaVacia = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 6;
    celda.style.textAlign = 'center';
    celda.style.padding = '20px';
    celda.textContent = archivosCargados.length ? 'No hay archivos para esos filtros.' : 'No hay archivos disponibles.';
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
    const archivo = datos.archivo;
    const partes = archivo.ruta.split(',');
    const binario = atob(partes[1]);
    const bytes = new Uint8Array(binario.length);
    for (let indice = 0; indice < binario.length; indice++) bytes[indice] = binario.charCodeAt(indice);
    const url = URL.createObjectURL(new Blob([bytes], { type: archivo.tipo }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = archivo.nombre;
    enlace.click();
    URL.revokeObjectURL(url);

    mostrarToastArchivos('Archivo descargado correctamente.', 'exito');
  } catch (error) {
    mostrarToastArchivos('No se pudo descargar el archivo.', 'error');
  }
}

async function eliminarArchivo(id, autorId) {
  const usuario = sesionArchivos();
  
  if (!usuario || Number(usuario.id) !== Number(autorId)) {
    mostrarToastArchivos('No puedes eliminar este archivo porque no te pertenece.', 'error');
    return;
  }

  if (!window.confirm('¿Estás seguro de eliminar este archivo?')) return;
  
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

  if (abrirModalBtn) abrirModalBtn.addEventListener('click', () => { if (modalArchivo) modalArchivo.classList.add('modal_activo'); });
  if (cerrarModalBtn) cerrarModalBtn.addEventListener('click', () => { if (modalArchivo) modalArchivo.classList.remove('modal_activo'); });
  if (cancelarModalBtn) cancelarModalBtn.addEventListener('click', () => { if (modalArchivo) modalArchivo.classList.remove('modal_activo'); });
  
  if (modalArchivo) {
    modalArchivo.addEventListener('click', evento => {
      if (evento.target === modalArchivo) modalArchivo.classList.remove('modal_activo');
    });
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
      const archivo = selectorArchivo.files[0];
      const usuario = sesionArchivos();
      const departamentoIdSelect = document.getElementById('departamento_seleccion').value;
      const departamentoId = departamentoIdSelect ? Number(departamentoIdSelect) : null;

      if (!archivo || !usuario || !usuario.id || !departamentoId) {
        mostrarToastArchivos('Inicia sesión, selecciona un archivo y elige un departamento de destino.', 'advertencia');
        return;
      }
      if (archivo.size > 10 * 1024 * 1024) {
        mostrarToastArchivos('El archivo supera el límite de 10 MB.', 'advertencia');
        return;
      }

      try {
        const contenido = await new Promise((resolver, rechazar) => {
          const lector = new FileReader();
          lector.onload = () => resolver(lector.result);
          lector.onerror = () => rechazar(new Error('No se pudo leer el archivo seleccionado.'));
          lector.readAsDataURL(archivo);
        });

        await window.OCID.apiFetch('/archivos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: document.getElementById('nombre_documento').value.trim() || archivo.name,
            contenido,
            tipo: archivo.type || 'application/octet-stream',
            tamano: archivo.size,
            autor_id: usuario.id,
            departamento_id: departamentoId
          })
        });

        if (modalArchivo) modalArchivo.classList.remove('modal_activo');
        selectorArchivo.value = '';
        document.getElementById('nombre_documento').value = '';
        mostrarToastArchivos('Archivo subido correctamente.', 'exito');
        await cargarArchivos();
      } catch (error) {
        mostrarToastArchivos('No se pudo cargar', 'error');
      }
    });
  }

  cargarArchivos().catch(error => {
    console.error(error);
  });
});