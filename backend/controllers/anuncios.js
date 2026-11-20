/* Controlador HTTP del modulo anuncios. */
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

async function getAnunciospapelera(req, res) {
  const usuarioId = Number(req.usuario && req.usuario.id);
  try {
    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
      return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
    }
    const contexto = await obtenerContextoPapelera(usuarioId);
    const resultado = await consultar(
      `SELECT a.id, a.titulo, a.contenido, a.prioridad, a.fecha, a.fecha_eliminacion,
              a.autor_id, a.departamento_id, a.departamento_emisor_id, a.eliminado_por,
              u.nombre AS autor_nombre, d.nombre AS departamento_nombre,
              em.nombre AS departamento_emisor_nombre,
              el.nombre AS eliminado_por_nombre
       FROM anuncios a
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
    return res.json({ success: true, anuncios: resultado.rows });
  } catch (error) {
    console.error('[papelera/anuncios] Error al cargar la papelera:', {
      mensaje: error.message, codigo: error.code, detalle: error.detail,
      hint: error.hint, statement: error.statement, stack: error.stack, usuarioId
    });
    return res.status(500).json({ success: false, error: 'No se pudo cargar la papelera de anuncios' });
  }
}

async function getAnuncios(req, res) {
  try {
    // Marca como vistos los anuncios propios e identifica al autor
    const resultado = await consultar(
      `SELECT a.id, a.titulo, a.contenido, a.prioridad, a.fecha, a.autor_id, a.departamento_id,
              a.departamento_emisor_id, u.nombre AS autor_nombre,
              d.nombre AS departamento_nombre, em.nombre AS departamento_emisor_nombre,
              a.autor_id = $1 AS es_autor,
              (a.autor_id = $1 OR EXISTS (
                SELECT 1 FROM elementos_vistos v
                WHERE v.tipo = 'anuncio' AND v.elemento_id = a.id AND v.usuario_id = $1
              )) AS visto
       FROM anuncios a
       LEFT JOIN usuarios u ON u.id = a.autor_id
       LEFT JOIN departamentos d ON d.id = a.departamento_id AND d.eliminado = FALSE
       LEFT JOIN departamentos em ON em.id = a.departamento_emisor_id AND em.eliminado = FALSE
       WHERE COALESCE(a.eliminado, FALSE) = FALSE
         AND (
           a.autor_id = $1
           OR EXISTS (
             SELECT 1 FROM usuarios lector
             WHERE lector.id = $1
               AND (
                 lector.departamento_id IN (a.departamento_id, a.departamento_emisor_id)
               )
           )
         )
       ORDER BY a.fecha DESC, a.id DESC`,
      [req.usuario.id]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los anuncios' });
  }
}

async function postAnuncios(req, res) {
  const { titulo, contenido, prioridad } = req.body;
  const departamentoRecibido = req.body.departamento_id;
  const autorId = Number(req.usuario && req.usuario.id);
  let departamentoId = null;
  if (departamentoRecibido !== undefined && departamentoRecibido !== null &&
      departamentoRecibido !== '' && departamentoRecibido !== 'general') {
    departamentoId = Number(departamentoRecibido);
    if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0) {
      return res.status(400).json({ success: false, error: 'El departamento destino no es válido' });
    }
  }
  if (typeof titulo !== 'string' || !titulo.trim() ||
      typeof contenido !== 'string' || !contenido.trim()) {
    return res.status(400).json({ success: false, error: 'Título y contenido obligatorios' });
  }
  if (!Number.isSafeInteger(autorId) || autorId <= 0) {
    return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
  }

  let cliente;
  try {
    cliente = await pool.connect();
    await cliente.query('BEGIN');
    if (departamentoId !== null) {
      const departamento = await cliente.query(
        'SELECT id FROM departamentos WHERE id = $1 AND eliminado = FALSE',
        [departamentoId]
      );
      if (departamento.rowCount === 0) {
        await cliente.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'El departamento destino no existe' });
      }
    }

    const autor = await cliente.query(
      'SELECT departamento_id FROM usuarios WHERE id = $1 FOR KEY SHARE',
      [autorId]
    );
    if (!autor.rowCount) {
      await cliente.query('ROLLBACK');
      return res.status(401).json({ success: false, error: 'El usuario de la sesión ya no existe' });
    }
    const departamentoEmisorId = autor.rows[0].departamento_id;
    const resultado = await cliente.query(
      `INSERT INTO anuncios (
         titulo, contenido, prioridad, autor_id, departamento_id, departamento_emisor_id, fecha, eliminado
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), FALSE) RETURNING *`,
      [titulo.trim(), contenido.trim(), prioridad || 'Informativo', autorId, departamentoId, departamentoEmisorId]
    );

    await cliente.query(
      `INSERT INTO notificaciones (usuario_id, anuncio_id, leida, fecha)
       SELECT id, $1, FALSE, NOW()
       FROM usuarios
       WHERE departamento_id = ANY($2::INTEGER[])
       ON CONFLICT DO NOTHING`,
      [resultado.rows[0].id, [...new Set([departamentoEmisorId, departamentoId].filter(Boolean))]]
    );
    // El autor ya vio su propio anuncio al publicarlo
    await cliente.query(
      `INSERT INTO elementos_vistos (tipo, elemento_id, usuario_id)
       VALUES ('anuncio', $1, $2)
       ON CONFLICT (tipo, elemento_id, usuario_id) DO NOTHING`,
      [resultado.rows[0].id, autorId]
    );
    await cliente.query('COMMIT');
    res.status(201).json({ success: true, anuncio: resultado.rows[0] });
  } catch (error) {
    if (cliente) await cliente.query('ROLLBACK');
    console.error('Error al publicar anuncio:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo publicar el anuncio' });
  } finally {
    if (cliente) cliente.release();
  }
}

async function putAnunciosid(req, res) {
  const id = Number(req.params.id);
  const { titulo, contenido, prioridad, departamento_id } = req.body;
  const usuarioId = Number(req.usuario && req.usuario.id);
  if (!Number.isSafeInteger(id) || id <= 0 ||
      typeof titulo !== 'string' || !titulo.trim() ||
      typeof contenido !== 'string' || !contenido.trim()) {
    return res.status(400).json({ success: false, error: 'Los datos del anuncio no son válidos' });
  }
  try {
    const acceso = await obtenerAccesoContenido(pool, 'anuncio', id, usuarioId);
    if (!acceso.existe) return res.status(404).json({ success: false, error: 'El anuncio no existe' });
    if (!acceso.permitido || acceso.eliminado) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para editar este anuncio' });
    }

    let departamentoId = null;
    if (departamento_id !== undefined && departamento_id !== null &&
        departamento_id !== '' && departamento_id !== 'general') {
      departamentoId = Number(departamento_id);
      if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0) {
        return res.status(400).json({ success: false, error: 'El departamento destino no es válido' });
      }
    }
    if (departamentoId !== null) {
      const destino = await consultar(
        'SELECT id FROM departamentos WHERE id = $1 AND eliminado = FALSE',
        [departamentoId]
      );
      if (!destino.rowCount) {
        return res.status(404).json({ success: false, error: 'El departamento destino no existe' });
      }
    }
    const client = await pool.connect();
    let resultado;
    try {
      await client.query('BEGIN');
      resultado = await client.query(
        `UPDATE anuncios
         SET titulo = $1, contenido = $2, prioridad = $3, departamento_id = $4
         WHERE id = $5 AND COALESCE(eliminado, FALSE) = FALSE
         RETURNING *`,
        [titulo.trim(), contenido.trim(), prioridad || 'Informativo', departamentoId, id]
      );
      if (resultado.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'El anuncio no existe' });
      }
      await client.query('DELETE FROM notificaciones WHERE anuncio_id = $1', [id]);
      await client.query(
        `INSERT INTO notificaciones (usuario_id, anuncio_id, leida, fecha)
         SELECT id, $1, FALSE, NOW()
         FROM usuarios
         WHERE departamento_id = ANY($2::INTEGER[])
         ON CONFLICT DO NOTHING`,
        [id, [...new Set([acceso.departamentosRelacionados[0], departamentoId].filter(Boolean))]]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    res.json({ success: true, anuncio: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo actualizar el anuncio' });
  }
}

async function deleteAnunciosid(req, res) {
  try {
    const id = Number(req.params.id);
    const usuarioId = Number(req.usuario && req.usuario.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID de anuncio inválido' });
    }
    const acceso = await obtenerAccesoContenido(pool, 'anuncio', id, usuarioId);
    if (!acceso.existe) return res.status(404).json({ success: false, error: 'El anuncio no existe' });
    if (!acceso.permitido || acceso.eliminado) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar este anuncio' });
    }
    const resultado = await consultar(
      `UPDATE anuncios
       SET eliminado = TRUE, fecha_eliminacion = NOW(), eliminado_por = $2
       WHERE id = $1 AND COALESCE(eliminado, FALSE) = FALSE
       RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El anuncio no existe o no te pertenece' });
    res.json({ success: true, mensaje: 'Anuncio movido a la papelera' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo mover el anuncio a la papelera' });
  }
}

async function putAnunciosidrestaurar(req, res) {
  try {
    const id = Number(req.params.id);
    const usuarioId = Number(req.usuario.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID de anuncio inválido' });
    }
    const acceso = await obtenerAccesoContenido(pool, 'anuncio', id, usuarioId);
    if (!acceso.existe || !acceso.eliminado) return res.status(404).json({ success: false, error: 'Anuncio no encontrado' });
    if (!acceso.permitido) return res.status(403).json({ success: false, error: 'No tienes permiso para restaurar este anuncio' });
    // Al restaurar se fecha de nuevo para que reaparezca entre los anuncios recientes
    const resultado = await consultar(
      `UPDATE anuncios
       SET eliminado = FALSE, fecha_eliminacion = NULL, eliminado_por = NULL, fecha = NOW()
       WHERE id = $1 AND eliminado = TRUE
       RETURNING id`,
      [id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Anuncio no encontrado' });
    res.json({ success: true, mensaje: 'Anuncio restaurado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo restaurar el anuncio' });
  }
}

async function deleteAnunciosidpermanente(req, res) {
  try {
    const id = Number(req.params.id);
    const usuarioId = Number(req.usuario.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID de anuncio inválido' });
    }
    const acceso = await obtenerAccesoContenido(pool, 'anuncio', id, usuarioId);
    if (!acceso.existe || !acceso.eliminado) return res.status(404).json({ success: false, error: 'Anuncio no encontrado en la papelera' });
    if (!acceso.permitido) return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar este anuncio permanentemente' });
    const resultado = await consultar(
      'DELETE FROM anuncios WHERE id = $1 AND eliminado = TRUE RETURNING id',
      [id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Anuncio no encontrado en la papelera' });
    res.json({ success: true, mensaje: 'Anuncio eliminado definitivamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar permanentemente el anuncio' });
  }
}

module.exports = {
  getAnunciospapelera,
  getAnuncios,
  postAnuncios,
  putAnunciosid,
  deleteAnunciosid,
  putAnunciosidrestaurar,
  deleteAnunciosidpermanente,
};
