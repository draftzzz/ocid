/* ==========================================================================
   Lógica de login.html — Guarda correctamente el Token JWT y la Sesión
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const cambioContrasenaExitoso = sessionStorage.getItem('ocid_password_changed');
  if (cambioContrasenaExitoso) {
    sessionStorage.removeItem('ocid_password_changed');
    const alerta = $('mensaje_estado');
    if (alerta) {
      alerta.className = 'mensaje_alerta exito';
      alerta.textContent = 'Cambio de contraseña exitoso, vuelve a iniciar sesión';
      alerta.style.display = 'block';
    }
  }

  // Mostrar / ocultar contraseña de forma segura
  const botonClave = $('boton_clave');
  if (botonClave) {
    botonClave.addEventListener('click', () => {
      const campoPassword = $('password');
      if (campoPassword) {
        campoPassword.type = campoPassword.type === 'password' ? 'text' : 'password';
      }
    });
  }

  // Procesar formulario de login
  const formularioLogin = $('formulario_login');
  if (formularioLogin) {
    formularioLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alerta = $('mensaje_estado');
      if (alerta) {
        alerta.style.display = 'none';
        alerta.className = 'mensaje_alerta';
      }

      const btn = $('loginBtn');
      if (btn) btn.disabled = true;

      try {
        const datos = await window.OCID.apiPublico('/login', {
          method: 'POST',
          body: JSON.stringify({
            correo: $('correo').value.trim(),
            password: $('password').value
          })
        });

        if (datos.success && datos.usuario) {
          // CORRECCIÓN CRÍTICA: Almacenar explícitamente el token JWT recibido del backend
          if (datos.token) {
            localStorage.setItem('token_ocid', datos.token);
          }

          // Guardar los datos del usuario en la sesión global
          window.OCID.guardarSesion(datos.usuario);

          const usuarioSesion = window.OCID.obtenerUsuarioSesion() || datos.usuario;
          window.location.href = window.OCID.tieneDepartamentoAsignado(usuarioSesion)
            ? 'inicio.html'
            : 'bienvenida.html';
        } else {
          if (alerta) {
            alerta.className = 'mensaje_alerta error';
            alerta.textContent = datos.error || 'Credenciales no válidas. Revisa tu correo y contraseña.';
            alerta.style.display = 'block';
          }
        }
      } catch (err) {
        console.error('Error al iniciar sesión:', err);
        if (alerta) {
          alerta.className = 'mensaje_alerta error';
          // Extrae el mensaje exacto que lanza el backend (ej: "Correo o contraseña incorrectos")
          alerta.textContent = err.message || 'Credenciales no válidas. Revisa tu correo y contraseña.';
          alerta.style.display = 'block';
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }
});