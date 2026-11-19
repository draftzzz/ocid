// Sesión local del usuario sin departamento asignado
let usuario = null;
try {
    usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
} catch (error) { usuario = null; }

// Redirige a login cuando no hay una sesión válida
if (!usuario || !usuario.id) {
    window.location.href = 'login.html';
} else {
    document.getElementById('nombreUsuario').textContent = usuario.nombre || usuario.correo;
    const iniciales = (usuario.nombre || 'U').split(/\s+/).slice(0, 2).map(parte => parte.charAt(0)).join('').toUpperCase();
    document.getElementById('avatar_usuario_circulo').textContent = iniciales;
}

// El modal se abre y se cierra únicamente con clases CSS
const modalUnirse = document.getElementById('modal_unirse');
function abrirModalUnirse() { modalUnirse.classList.add('modal_unirse_visible'); }
function cerrarModalUnirse() { modalUnirse.classList.remove('modal_unirse_visible'); }

document.getElementById('btn_abrir_modal_unirse').addEventListener('click', abrirModalUnirse);
document.getElementById('btn_cerrar_modal').addEventListener('click', cerrarModalUnirse);
modalUnirse.addEventListener('click', evento => { if (evento.target === modalUnirse) cerrarModalUnirse(); });

// Valida el código y muestra con claridad la respuesta del servidor
document.getElementById('form_unirse_codigo').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const entradaCodigo = document.getElementById('input_codigo_acceso');
    const codigo = entradaCodigo.value.trim();
    const botonUnirse = document.querySelector('#form_unirse_codigo button[type="submit"]');

    if (!/^[A-Za-z0-9]{7}$/.test(codigo)) {
        window.OCID.mostrarToast('El código debe tener 7 letras o números.', 'error');
        entradaCodigo.focus();
        return;
    }

    if (botonUnirse) botonUnirse.disabled = true;
    try {
        const datos = await window.OCID.apiFetch('/departamentos/unirse', {
            method: 'POST',
            body: JSON.stringify({ codigo })
        });
        if (!datos.success || !datos.usuario || !datos.token ||
            typeof datos.usuario.es_jefe !== 'boolean' ||
            !window.OCID.tieneDepartamentoAsignado(datos.usuario)) {
            throw new Error(datos.error || 'El servidor no devolvió el perfil actualizado del departamento.');
        }

        usuario = { ...usuario, ...datos.usuario };
        window.OCID.guardarSesion(usuario, datos.token);
        cerrarModalUnirse();
        window.location.href = 'inicio.html';
    } catch (error) {
        const mensaje = /Cannot POST|Error HTTP 404/i.test(error.message)
            ? 'El servicio para unirse al departamento no está disponible. Intenta más tarde.'
            : (error.message || 'No se pudo unir al departamento.');
        window.OCID.mostrarToast(mensaje, 'error');
    } finally {
        if (botonUnirse) botonUnirse.disabled = false;
    }
});

// Cierra la sesión desde el enlace de la barra lateral
document.getElementById('boton_cerrar_sesion').addEventListener('click', (evento) => {
    evento.preventDefault();
    window.OCID.limpiarSesion();
    window.location.href = 'login.html';
});
