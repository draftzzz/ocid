let usuario = null;
try {
    usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
} catch (e) { usuario = null; }

if (!usuario || !usuario.id) {
    window.location.href = 'login.html';
} else {
    const nombre = usuario.nombre || usuario.correo || 'Usuario';
    document.getElementById('nombreUsuario').textContent = nombre;
    const iniciales = nombre.split(/\s+/).slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
    document.getElementById('avatar_usuario_circulo').textContent = iniciales;
}

// Envío del formulario para crear el departamento
const formularioCrearDepartamento = document.getElementById('form_crear_departamento');
formularioCrearDepartamento.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('nombre_depto').value.trim();
    const descripcion = document.getElementById('descripcion_depto').value.trim();
    const botonEnviar = formularioCrearDepartamento.querySelector('button[type="submit"]');
    botonEnviar.disabled = true;

    try {
        const datos = await window.OCID.apiFetch('/departamentos', {
            method: 'POST',
            body: JSON.stringify({
                nombre: nombre,
                descripcion: descripcion
            })
        });
        if (!datos.success || !datos.departamento || !datos.usuario) {
            throw new Error(datos.error || 'No se pudo crear el departamento');
        }

        usuario = { ...usuario, ...datos.usuario };
        window.OCID.guardarSesion(usuario, window.OCID.obtenerToken());

        const codigo = datos.departamento.codigo;
        if (typeof codigo !== 'string' || !/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])[A-Za-z0-9]{7}$/.test(codigo)) {
            throw new Error('El departamento se creó, pero el código recibido no es válido.');
        }

        document.getElementById('codigo_departamento_generado').textContent = codigo;
        document.getElementById('resultado_creacion_departamento').hidden = false;
        formularioCrearDepartamento.hidden = true;
    } catch (err) {
        window.OCID.mostrarToast(err.message, 'error');
        botonEnviar.disabled = false;
    }
});

document.getElementById('boton_cerrar_sesion').addEventListener('click', (e) => {
    e.preventDefault();
    window.OCID.limpiarSesion();
    window.location.href = 'login.html';
});