/* Controlador HTTP del modulo archivos. */
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

async function getArchivospapelera(req, res) {
  const usuarioId = Number(req.usuario && req.usuario.id);
  try {
    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
      return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
    }
    const contexto = await obtenerContextoPapelera(usuarioId);
    const resultado = await consultar(
      `SELECT a.id, a.nombre, a.tipo, a.tamano, a.autor_id, a.departamento_id,
              a.departamento_emisor_id, a.fecha, a.fecha_eliminacion, a.eliminado_por,
              u.nombre AS autor_nombre, d.nombre AS departamento_nombre,
              em.nombre AS departamento_emisor_nombre,
              el.nombre AS eliminado_por_nombre
       FROM archivos a
       LEFT JOIN usuarios u ON u.id = a.autor_id
       LEFT JOIN departamentos d ON d.id = a.departamento_id
       LEFT JOIN departamentos em ON em.id = a.departamento_emisor_id
       LEFT JOIN usuarios el ON el.id = a.eliminado_por
       WHERE COALESCE(a.eliminado, FALSE) = TRUE
         AND (
           a.autor_id = $1
           OR (
             $2::INTEGER IN (a.departamento_id, a.departamento_emisor_id)
             AND (
               $3::BOOLEAN
               OR a.eliminado_por = $4::INTEGER
               OR EXISTS (
                 SELECT 1 FROM usuarios jefe
                 WHERE jefe.id = a.eliminado_por
                   AND LOWER(BTRIM(COALESCE(jefe.es_jefe::TEXT, ''))) IN ('t', 'true', '1', 's', 'si', 'y', 'yes')
                   AND jefe.departamento_id = $2::INTEGER
               )
             )
           )
         )
       ORDER BY a.fecha_eliminacion DESC NULLS LAST, a.id DESC`,
      [usuarioId, contexto.departamentoId, contexto.esJefe, contexto.jefeId]
    );
    return res.json({ success: true, archivos: resultado.rows });
  } catch (error) {
    console.error('[papelera/archivos] Error al cargar la papelera:', {
      mensaje: error.message, codigo: error.code, detalle: error.detail,
      hint: error.hint, statement: error.statement, stack: error.stack, usuarioId
    });
    return res.status(500).json({ success: false, error: 'No se pudo cargar la papelera de archivos' });
  }
}

async function getArchivos(req, res) {
  try {
    // Marca como vistos los archivos propios e identifica al autor
    const resultado = await consultar(
      `SELECT a.id, a.nombre, a.tipo, a.tamano, a.autor_id, a.departamento_id,
              a.departamento_emisor_id, a.anuncio_id, a.fecha,
              u.nombre AS autor_nombre, d.nombre AS departamento_nombre,
              em.nombre AS departamento_emisor_nombre,
              a.autor_id = $1 AS es_autor,
              (a.autor_id = $1 OR EXISTS (
                SELECT 1 FROM elementos_vistos v
                WHERE v.tipo = 'archivo' AND v.elemento_id = a.id AND v.usuario_id = $1
              )) AS visto
       FROM archivos a
       LEFT JOIN usuarios u ON u.id = a.autor_id
       LEFT JOIN departamentos d ON d.id = a.departamento_id
       LEFT JOIN departamentos em ON em.id = a.departamento_emisor_id
       WHERE COALESCE(a.eliminado, FALSE) = FALSE
         AND (
           a.autor_id = $1
           OR EXISTS (
             SELECT 1 FROM usuarios lector
             WHERE lector.id = $1
               AND (
                 lector.departamento_id IN (a.departamento_id, a.departamento_emisor_id)
                 OR LOWER(BTRIM(COALESCE(lector.rol, ''))) IN ('administrador', 'administrador general')
               )
           )
         )
       ORDER BY a.fecha DESC, a.id DESC`
      , [Number(req.usuario.id)]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los archivos' });
  }
}

async function getArchivosid(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'ID de archivo inválido' });
  }

  try {
    const acceso = await obtenerAccesoContenido(pool, 'archivo', id, Number(req.usuario.id));
    if (!acceso.existe || acceso.eliminado) {
      return res.status(404).json({ success: false, error: 'El archivo no existe o fue eliminado' });
    }
    if (!acceso.visible) return res.status(403).json({ success: false, error: 'No tienes acceso a este archivo' });
    const resultado = await consultar(
      `SELECT id, nombre, ruta, tipo
       FROM archivos
       WHERE id = $1 AND COALESCE(eliminado, FALSE) = FALSE`,
      [id]
    );
    if (resultado.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'El archivo no existe o fue eliminado' });
    }
    res.json({ success: true, archivo: resultado.rows[0] });
  } catch (error) {
    console.error('Error al obtener el archivo para descargar:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo descargar el archivo' });
  }
}

async function postArchivos(req, res) {
  const { nombre, contenido, tipo, tamano, departamento_id } = req.body;
  const autorId = Number(req.usuario && req.usuario.id);
  const departamentoDestinoId = Number(departamento_id);
  if (typeof nombre !== 'string' || !nombre.trim() ||
      typeof contenido !== 'string' || !Number.isSafeInteger(departamentoDestinoId) || departamentoDestinoId <= 0 ||
      !Number.isSafeInteger(autorId) || autorId <= 0) {
    return res.status(400).json({ success: false, error: 'Los datos del archivo no son válidos' });
  }
  try {
    const autor = await consultar(
      'SELECT departamento_id FROM usuarios WHERE id = $1',
      [autorId]
    );
    if (!autor.rowCount) return res.status(401).json({ success: false, error: 'El usuario de la sesión ya no existe' });
    const destino = await consultar(
      'SELECT id FROM departamentos WHERE id = $1 AND eliminado = FALSE',
      [departamentoDestinoId]
    );
    if (!destino.rowCount) return res.status(404).json({ success: false, error: 'El departamento destino no existe' });
    const resultado = await consultar(
      `INSERT INTO archivos (
         nombre, ruta, tipo, tamano, autor_id, departamento_id, departamento_emisor_id,
         anuncio_id, fecha, eliminado
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NOW(), FALSE)
       RETURNING id, nombre, tipo, tamano, autor_id, departamento_id, departamento_emisor_id, fecha`,
      [nombre.trim(), contenido, tipo || 'application/octet-stream', Number(tamano) || 0,
        autorId, departamentoDestinoId, autor.rows[0].departamento_id]
    );
    // El autor ya vio su propio archivo al subirlo
    await consultar(
      `INSERT INTO elementos_vistos (tipo, elemento_id, usuario_id)
       VALUES ('archivo', $1, $2)
       ON CONFLICT (tipo, elemento_id, usuario_id) DO NOTHING`,
      [resultado.rows[0].id, autorId]
    );
    res.status(201).json({ success: true, archivo: resultado.rows[0] });
  } catch (error) {
    console.error('Error al guardar archivo:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo guardar el archivo' });
  }
}

async function putArchivosid(req, res) {
  const id = Number(req.params.id);
  const usuarioId = Number(req.usuario && req.usuario.id);
  const { nombre, departamento_id: departamentoDestinoId } = req.body || {};
  if (!Number.isSafeInteger(id) || id <= 0 || typeof nombre !== 'string' || !nombre.trim()) {
    return res.status(400).json({ success: false, error: 'Los datos del archivo no son válidos' });
  }
  try {
    const acceso = await obtenerAccesoContenido(pool, 'archivo', id, usuarioId);
    if (!acceso.existe) return res.status(404).json({ success: false, error: 'El archivo no existe' });
    if (!acceso.permitido || acceso.eliminado) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para editar este archivo' });
    }
    const destinoId = Number(departamentoDestinoId);
    if (!Number.isSafeInteger(destinoId) || destinoId <= 0) {
      return res.status(400).json({ success: false, error: 'El departamento destino no es válido' });
    }
    const departamentoExiste = await consultar(
      'SELECT 1 FROM departamentos WHERE id = $1 AND eliminado = FALSE',
      [destinoId]
    );
    if (!departamentoExiste.rowCount) return res.status(404).json({ success: false, error: 'El departamento destino no existe' });
    const resultado = await consultar(
      `UPDATE archivos SET nombre = $1, departamento_id = $2
       WHERE id = $3 AND COALESCE(eliminado, FALSE) = FALSE
       RETURNING id, nombre, tipo, tamano, autor_id, departamento_id, departamento_emisor_id, fecha`,
      [nombre.trim(), destinoId, id]
    );
    if (!resultado.rowCount) return res.status(404).json({ success: false, error: 'El archivo no existe' });
    res.json({ success: true, archivo: resultado.rows[0] });
  } catch (error) {
    console.error('Error al actualizar archivo:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo actualizar el archivo' });
  }
}

async function deleteArchivosid(req, res) {
  try {
    const id = Number(req.params.id);
    const usuarioId = Number(req.usuario.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, error: 'ID de archivo inválido' });
    const acceso = await obtenerAccesoContenido(pool, 'archivo', id, usuarioId);
    if (!acceso.existe) return res.status(404).json({ success: false, error: 'El archivo no existe' });
    if (!acceso.permitido || acceso.eliminado) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar este archivo' });
    }
    const resultado = await consultar(
      `UPDATE archivos
       SET eliminado = TRUE, fecha_eliminacion = NOW(), eliminado_por = $2
       WHERE id = $1 AND COALESCE(eliminado, FALSE) = FALSE
       RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El archivo no existe o no te pertenece' });
    res.json({ success: true, mensaje: 'Archivo movido a la papelera de reciclaje' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo mover el archivo a la papelera' });
  }
}

async function putArchivosidrestaurar(req, res) {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const acceso = await obtenerAccesoContenido(pool, 'archivo', id, usuarioId);
    if (!acceso.existe || !acceso.eliminado) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    if (!acceso.permitido) return res.status(403).json({ success: false, error: 'No tienes permiso para restaurar este archivo' });
    const resultado = await consultar(
      `UPDATE archivos
       SET eliminado = FALSE, fecha_eliminacion = NULL, eliminado_por = NULL
       WHERE id = $1 AND eliminado = TRUE
       RETURNING id`,
      [id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    res.json({ success: true, mensaje: 'Documento restaurado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo restaurar el documento' });
  }
}

async function deleteArchivosidpermanente(req, res) {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const acceso = await obtenerAccesoContenido(pool, 'archivo', id, usuarioId);
    if (!acceso.existe || !acceso.eliminado) return res.status(404).json({ success: false, error: 'Archivo no encontrado en la papelera' });
    if (!acceso.permitido) return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar este archivo permanentemente' });
    const resultado = await consultar(
      'DELETE FROM archivos WHERE id = $1 AND eliminado = TRUE RETURNING id',
      [id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Archivo no encontrado en la papelera' });
    res.json({ success: true, mensaje: 'Archivo eliminado definitivamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar permanentemente el archivo' });
  }
}

module.exports = {
  getArchivospapelera,
  getArchivos,
  getArchivosid,
  postArchivos,
  putArchivosid,
  deleteArchivosid,
  putArchivosidrestaurar,
  deleteArchivosidpermanente,
};
