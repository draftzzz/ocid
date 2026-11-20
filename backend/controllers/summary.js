/* Controlador HTTP del modulo resumen. */
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

async function getApistats(req, res) {
  try {
    const [avisos, archivos, docentes, eventos] = await Promise.all([
      consultar("SELECT COUNT(*) AS total FROM anuncios WHERE eliminado = FALSE"),
      consultar("SELECT COUNT(*) AS total FROM archivos WHERE eliminado = FALSE"),
      consultar("SELECT COUNT(*) AS total FROM usuarios WHERE rol ILIKE 'docente'"),
      consultar("SELECT COUNT(*) AS total FROM tareas WHERE estado = 'Pendiente'")
    ]);
    res.json({
      success: true,
      stats: {
        avisos: parseInt(avisos.rows[0].total, 10),
        archivos: parseInt(archivos.rows[0].total, 10),
        docentes: parseInt(docentes.rows[0].total, 10),
        eventos: parseInt(eventos.rows[0].total, 10)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar las estadísticas' });
  }
}

async function getApidepartamentosconconteo(req, res) {
  try {
    const usuarioId = Number(req.usuario && req.usuario.id);
    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
      return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
    }
    const resultado = await consultar(
      `SELECT d.id, d.nombre,
              COUNT(DISTINCT a.id) FILTER (
                WHERE COALESCE(a.eliminado, FALSE) = FALSE
                  AND EXISTS (
                    SELECT 1 FROM notificaciones n
                    WHERE n.anuncio_id = a.id AND n.usuario_id = $1
                  )
              ) AS anuncios_activos,
              COUNT(DISTINCT f.id) FILTER (WHERE COALESCE(f.eliminado, FALSE) = FALSE) AS archivos_activos
       FROM departamentos d
       LEFT JOIN anuncios a ON a.departamento_id = d.id AND COALESCE(a.eliminado, FALSE) = FALSE
       LEFT JOIN archivos f ON f.departamento_id = d.id AND COALESCE(f.eliminado, FALSE) = FALSE
       WHERE d.eliminado = FALSE
       GROUP BY d.id, d.nombre
       ORDER BY d.nombre ASC`,
      [usuarioId]
    );
    res.json({ success: true, departamentos: resultado.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los departamentos' });
  }
}

module.exports = {
  getApistats,
  getApidepartamentosconconteo,
};
