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

// Control del Menú Lateral Móvil / Hamburguesa
const btnHamburguesa = document.getElementById('btn_hamburguesa');
const fondoMenu = document.getElementById('fondo_menu');
function alternarMenu() {
    document.body.classList.toggle('menu_movil_abierto');
}
if (btnHamburguesa) btnHamburguesa.addEventListener('click', alternarMenu);
if (fondoMenu) fondoMenu.addEventListener('click', alternarMenu);

// Envío del formulario para crear el departamento
document.getElementById('form_crear_departamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('nombre_depto').value.trim();
    const descripcion = document.getElementById('descripcion_depto').value.trim();

    try {
        const datos = await window.OCID.apiFetch('/departamentos', {
            method: 'POST',
            body: JSON.stringify({
                nombre: nombre,
                descripcion: descripcion,
                jefe_id: usuario.id
            })
        });
        if (!datos.success) throw new Error(datos.error || 'No se pudo crear el departamento');

        // Actualizar la sesión local del usuario con su nuevo departamento y rol de jefe
        usuario.departamento_id = datos.departamento.id;
        usuario.rol = 'Jefe de Departamento';
        localStorage.setItem('usuario_ocid', JSON.stringify(usuario));

        // Redirigir a inicio ya con acceso completo
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