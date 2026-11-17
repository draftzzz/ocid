/* Lógica de login.html — usa OCID Core compartido */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // Mostrar / ocultar contraseña
  $('boton_clave').addEventListener('click', () => {
    const c = $('password');
    c.type = c.type === 'password' ? 'text' : 'password';
  });

  // Procesar login
  $('formulario_login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alerta = $('mensaje_estado');
    alerta.style.display = 'none';
    alerta.className = 'mensaje_alerta';
    const btn = $('loginBtn');
    btn.disabled = true;

    try {
      const datos = await window.OCID.apiPublico('/login', {
        method: 'POST',
        body: JSON.stringify({
          correo: $('correo').value.trim(),
          password: $('password').value
        })
      });

      if (datos.success && datos.usuario) {
        window.OCID.guardarSesion(datos.usuario);
        window.location.href = 'inicio.html';
      } else {
        alerta.className = 'mensaje_alerta error';
        alerta.textContent = datos.error || 'Credenciales no válidas. Revisa tu correo y contraseña.';
        alerta.style.display = 'block';
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      alerta.className = 'mensaje_alerta error';
      alerta.textContent = 'No se pudo conectar con el servidor';
      alerta.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  });
});

