/* Controlador de sesion inicial de la portada publica. */
try {
    const usuario = JSON.parse(localStorage.getItem('usuario_ocid') || 'null');
    const departamentoId = Number(usuario && usuario.departamento_id);
    if (usuario && usuario.id && Number.isSafeInteger(departamentoId) && departamentoId > 0) {
        window.location.replace('html/inicio.html');
    }
} catch (error) {
    localStorage.removeItem('usuario_ocid');
}
