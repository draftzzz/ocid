const OCID_API_BASE = 'https://ocid.onrender.com';
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

// Control del Menú Lateral con el botón hamburguesa
const btnHamburguesa = document.getElementById('btn_hamburguesa');
const fondoMenu = document.getElementById('fondo_menu');

function alternarMenu() {
    document.body.classList.toggle('menu_movil_abierto');
}

if (btnHamburguesa) btnHamburguesa.addEventListener('click', alternarMenu);
if (fondoMenu) fondoMenu.addEventListener('click', alternarMenu);

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
        const resp = await fetch(`${OCID_API_BASE}/departamentos/unirse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: usuario.id, codigo })
        });
        const datos = await resp.json();
        if (!resp.ok) throw new Error(datos.error || 'Código incorrecto');

        localStorage.setItem('usuario_ocid', JSON.stringify(datos.usuario));
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