/* Configuracion global del backend sin cambios de comportamiento. */
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_jwt_muy_segura_cambiar_en_produccion';

module.exports = { PORT, JWT_SECRET };
