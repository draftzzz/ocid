/* Controlador HTTP del modulo sistema. */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/environment');
const { pool, consultar } = require('../config/database');
const {
  hslAHex, generarColorRol, generarCodigoDepartamento, normalizarRol,
  esFlagActivo, esRolAdministrador, normalizarNombreDepartamento,
  resolverDestinosTarea, validarFechaLimiteTarea
} = require('../models/utils');
const {
  obtenerContextoPapelera, obtenerPerfilUsuario, obtenerPermisosDepartamento,
  obtenerAccesoContenido, DEFINICIONES_CONTENIDO
} = require('../models/access');

async function getHealth(req, res) {
  res.json({ success: true, mensaje: 'OCID API funcionando correctamente' });
}

async function getDbtest(req, res) {
  try {
    await consultar('SELECT 1');
    res.json({ success: true, mensaje: 'Conexión a Neon correcta' });
  } catch (error) {
    console.error('Error de base de datos:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo conectar con la base de datos' });
  }
}

module.exports = {
  getHealth,
  getDbtest,
};
