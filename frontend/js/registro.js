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
        const correo = $('correo').value.trim();
        const password = $('password').value;
        const sesion = await window.OCID.apiPublico('/login', {
          method: 'POST',
          body: JSON.stringify({ correo, password })
        });
        if (!sesion.success || !sesion.token || !sesion.usuario) {
          throw new Error('La cuenta se creÃ³, pero no se pudo iniciar sesiÃ³n automÃ¡ticamente. Inicia sesiÃ³n desde el formulario.');
        }
        window.OCID.guardarSesion(sesion.usuario, sesion.token);
        window.location.href = 'inicio.html';
        return;
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

