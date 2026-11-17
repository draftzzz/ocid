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
    const codigo = document.getElementById('input_codigo_acceso').value.trim();
    try {
        const resultado = await window.OCID.apiFetch(`/departamentos/codigo/${encodeURIComponent(codigo)}`);
        const datos = await window.OCID.apiFetch(`/usuarios/${usuario.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                nombre: usuario.nombre,
                correo: usuario.correo,
                departamento_id: resultado.departamento.id,
                rol: usuario.rol
            })
        });
        if (!datos.success || !datos.usuario) throw new Error(datos.error || 'No se pudo actualizar el departamento');

        localStorage.setItem('usuario_ocid', JSON.stringify({ ...usuario, ...datos.usuario }));
        window.location.href = 'inicio.html';
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById('boton_cerrar_sesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('usuario_ocid');
    window.location.href = 'login.html';
});