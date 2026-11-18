let usuario = null;
try {
    usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
} catch (e) { usuario = null; }

if (!usuario || !usuario.id) {
    window.location.href = 'login.html';
} else {
    document.getElementById('nombreUsuario').textContent = usuario.nombre || usuario.correo;
    const iniciales = (usuario.nombre || 'U').split(/\s+/).slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
    document.getElementById('avatar_usuario_circulo').textContent = iniciales;
}

// Control del Modal Unirse
const modalUnirse = document.getElementById('modal_unirse');
document.getElementById('btn_abrir_modal_unirse').addEventListener('click', () => { modalUnirse.style.display = 'flex'; });
document.getElementById('btn_cerrar_modal').addEventListener('click', () => { modalUnirse.style.display = 'none'; });
modalUnirse.addEventListener('click', (e) => { if (e.target === modalUnirse) modalUnirse.style.display = 'none'; });

// Enviar código para unirse
document.getElementById('form_unirse_codigo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('input_codigo_acceso').value;
    const botonUnirse = document.querySelector('#form_unirse_codigo button[type="submit"]');
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
        window.location.href = 'inicio.html';
    } catch (err) {
        window.OCID.mostrarToast(err.message || 'No se pudo unir al departamento.', 'error');
    } finally {
        if (botonUnirse) botonUnirse.disabled = false;
    }
});

document.getElementById('boton_cerrar_sesion').addEventListener('click', (e) => {
    e.preventDefault();
    window.OCID.limpiarSesion();
    window.location.href = 'login.html';
});