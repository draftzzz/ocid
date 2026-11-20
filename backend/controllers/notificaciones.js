/* Controlador HTTP del modulo notificaciones. */
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

async function getNotificaciones(req, res) {
  try {
    const usuarioId = req.usuario.id;
    const usuarioResult = await consultar(
      `SELECT u.departamento_id, u.rol, NULLIF(BTRIM(d.nombre), '') AS departamento_nombre
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id AND d.eliminado = FALSE
       WHERE u.id = $1`,
      [usuarioId]
    );
    if (usuarioResult.rowCount === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const departamentoId = usuarioResult.rows[0].departamento_id;
    const [anuncios, tareas, archivos] = await Promise.all([
      consultar(
        `SELECT n.id, a.id AS elemento_id, a.fecha, 'anuncio' AS tipo, a.titulo,
                a.contenido, d.nombre AS departamento_nombre,
                (COALESCE(v.usuario_id IS NOT NULL, FALSE) OR COALESCE(n.leida, FALSE)) AS leida,
                (v.usuario_id IS NOT NULL OR COALESCE(n.leida, FALSE)) AS visto
         FROM anuncios a
         LEFT JOIN LATERAL (
           SELECT id, leida FROM notificaciones
           WHERE anuncio_id = a.id AND usuario_id = $1
           ORDER BY id DESC LIMIT 1
         ) n ON TRUE
         LEFT JOIN elementos_vistos v
           ON v.tipo = 'anuncio' AND v.elemento_id = a.id AND v.usuario_id = $1
         LEFT JOIN departamentos d ON d.id = a.departamento_id
         WHERE COALESCE(a.eliminado, FALSE) = FALSE
           AND (
             a.autor_id = $1
             OR $2::INTEGER IN (a.departamento_id, a.departamento_emisor_id)
           )`,
        [usuarioId, departamentoId]
      ),
      consultar(
        `SELECT NULL::INTEGER AS id, t.id AS elemento_id, t.fecha_creacion AS fecha,
                'tarea' AS tipo, t.titulo, t.descripcion AS contenido,
                t.departamento AS departamento_nombre,
                (v.usuario_id IS NOT NULL) AS leida, (v.usuario_id IS NOT NULL) AS visto
         FROM tareas t
         LEFT JOIN elementos_vistos v
           ON v.tipo = 'tarea' AND v.elemento_id = t.id AND v.usuario_id = $1
         WHERE COALESCE(t.eliminado, FALSE) = FALSE
           AND (
             t.autor_id = $1
             OR $2::INTEGER = t.departamento_emisor_id
             OR $2::INTEGER = ANY(COALESCE(t.departamentos_destino_ids, ARRAY[]::INTEGER[]))
           )`,
        [usuarioId, departamentoId]
      ),
      consultar(
        `SELECT NULL::INTEGER AS id, f.id AS elemento_id, f.fecha,
                'archivo' AS tipo, f.nombre AS titulo, f.tipo AS contenido,
                d.nombre AS departamento_nombre,
                (v.usuario_id IS NOT NULL) AS leida, (v.usuario_id IS NOT NULL) AS visto
         FROM archivos f
         LEFT JOIN elementos_vistos v
           ON v.tipo = 'archivo' AND v.elemento_id = f.id AND v.usuario_id = $1
         LEFT JOIN departamentos d ON d.id = f.departamento_id
         WHERE COALESCE(f.eliminado, FALSE) = FALSE
           AND (
             f.autor_id = $1
             OR $2::INTEGER IN (f.departamento_id, f.departamento_emisor_id)
           )`,
        [usuarioId, departamentoId]
      )
    ]);

    const notificaciones = [...anuncios.rows, ...tareas.rows, ...archivos.rows]
      .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

    res.json({ success: true, notificaciones });
  } catch (error) {
    console.error('Error al cargar notificaciones:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar las notificaciones' });
  }
}

async function postElementostipoidvisto(req, res) {
  const { tipo } = req.params;
  const id = Number(req.params.id);
  const usuarioId = Number(req.usuario && req.usuario.id);
  if (!DEFINICIONES_CONTENIDO[tipo] || !Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'El elemento no es válido' });
  }
  try {
    const acceso = await obtenerAccesoContenido(pool, tipo, id, usuarioId);
    if (!acceso.existe || acceso.eliminado) return res.status(404).json({ success: false, error: 'El elemento no existe o fue eliminado' });
    if (!acceso.visible) return res.status(403).json({ success: false, error: 'No tienes acceso a este elemento' });
    await consultar(
      `INSERT INTO elementos_vistos (tipo, elemento_id, usuario_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tipo, elemento_id, usuario_id)
       DO UPDATE SET visto_en = NOW()`,
      [tipo, id, usuarioId]
    );
    if (tipo === 'anuncio') {
      await consultar('UPDATE notificaciones SET leida = TRUE WHERE anuncio_id = $1 AND usuario_id = $2', [id, usuarioId]);
    }
    res.json({ success: true, visto: true });
  } catch (error) {
    console.error('Error al registrar visto:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo registrar como visto' });
  }
}

async function putNotificacionesidleer(req, res) {
  try {
    const resultado = await consultar(
      'UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [Number(req.params.id), req.usuario.id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Notificación no encontrada' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo marcar como leída' });
  }
}

async function deleteNotificacionesid(req, res) {
  try {
    const resultado = await consultar(
      'DELETE FROM notificaciones WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [Number(req.params.id), req.usuario.id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Notificación no encontrada' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar la notificación' });
  }
}

module.exports = {
  getNotificaciones,
  postElementostipoidvisto,
  putNotificacionesidleer,
  deleteNotificacionesid,
};
