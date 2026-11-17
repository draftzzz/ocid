/* Lógica de registro.html — usa OCID Core compartido */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // Alternar visualización de clave
  $('boton_clave').addEventListener('click', () => {
    const c = $('password');
    c.type = c.type === 'password' ? 'text' : 'password';
  });

  // Envío con mensajes explícitos para respuestas del servidor y fallos de red
  $('registro').addEventListener('submit', async (e) => {
    e.preventDefault();

    const alerta = $('mensaje_estado');
    alerta.style.display = 'none';
    alerta.className = 'mensaje_alerta';

    const btn = $('registerBtn');
    btn.disabled = true;

    try {
      const datos = await window.OCID.apiPublico('/registro', {
        method: 'POST',
        body: JSON.stringify({
          nombre: $('nombre').value.trim(),
          correo: $('correo').value.trim(),
          password: $('password').value
        })
      });

      if (datos.success) {
        location.href = 'login.html';
      } else {
        throw new Error(datos.error || 'No se pudo completar el registro.');
      }
    } catch (err) {
      alerta.className = 'mensaje_alerta error';
      alerta.textContent = err.message || 'No se pudo conectar con el servidor.';
      alerta.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  });
});

