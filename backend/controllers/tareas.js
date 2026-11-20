/* Controlador HTTP del modulo tareas. */
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

async function getTareas(req, res) {
  try {
    // Marca como vistas las tareas propias e identifica al autor
    const usuarioId = Number(req.usuario.id);
    const resultado = await consultar(
      `SELECT t.id, t.titulo, t.descripcion, t.asignado, t.fecha, t.horario, t.departamento,
              t.departamentos_destino_ids, t.departamento_emisor_id, t.estado, t.autor_id, t.fecha_creacion,
              u.nombre AS autor_nombre, d.nombre AS autor_departamento,
              t.autor_id = $1 AS es_autor,
              (t.autor_id = $1 OR EXISTS (
                SELECT 1 FROM elementos_vistos v
                WHERE v.tipo = 'tarea' AND v.elemento_id = t.id AND v.usuario_id = $1
              )) AS visto
       FROM tareas t
       LEFT JOIN usuarios u ON u.id = t.autor_id
       LEFT JOIN departamentos d ON d.id = t.departamento_emisor_id
       WHERE COALESCE(t.eliminado, FALSE) = FALSE
         AND (
           t.autor_id = $1
           OR EXISTS (
             SELECT 1 FROM usuarios lector
             WHERE lector.id = $1
               AND (
                 lector.departamento_id = t.departamento_emisor_id
                 OR lector.departamento_id = ANY(COALESCE(t.departamentos_destino_ids, ARRAY[]::INTEGER[]))
                 OR LOWER(BTRIM(COALESCE(lector.rol, ''))) IN ('administrador', 'administrador general')
               )
           )
         )
       ORDER BY t.fecha DESC, t.id DESC`,
      [usuarioId]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar las tareas' });
  }
}

async function postTareas(req, res) {
  const { titulo, descripcion, asignado, fecha, horario, departamentos, departamento, estado } = req.body;
  const autorId = Number(req.usuario && req.usuario.id);
  if (typeof titulo !== 'string' || !titulo.trim() || !fecha) {
    return res.status(400).json({ success: false, error: 'El título y la fecha son obligatorios' });
  }
  if (!validarFechaLimiteTarea(fecha)) {
    return res.status(400).json({
      success: false,
      error: 'La fecha límite debe estar entre hoy y los próximos 6 meses'
    });
  }
  try {
    const usuario = await consultar('SELECT departamento_id FROM usuarios WHERE id = $1', [autorId]);
    if (!usuario.rowCount) return res.status(401).json({ success: false, error: 'El usuario de la sesión ya no existe' });
    const destinos = await resolverDestinosTarea(pool, departamentos, departamento);
    const resultado = await consultar(
      `INSERT INTO tareas (
         titulo, descripcion, asignado, fecha, horario, departamento, departamentos_destino_ids,
         departamento_emisor_id, estado, autor_id, eliminado
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE) RETURNING *`,
      [titulo.trim(), descripcion ? descripcion.trim() : null,
        asignado ? asignado.trim() : 'General / Sin asignar', fecha, horario || '',
        destinos.nombres.join(', '), destinos.ids, usuario.rows[0].departamento_id,
        estado || 'Pendiente', autorId]
    );
    // El autor ya vio su propia tarea al crearla
    await consultar(
      `INSERT INTO elementos_vistos (tipo, elemento_id, usuario_id)
       VALUES ('tarea', $1, $2)
       ON CONFLICT (tipo, elemento_id, usuario_id) DO NOTHING`,
      [resultado.rows[0].id, autorId]
    );
    res.status(201).json({ success: true, tarea: resultado.rows[0] });
  } catch (error) {
    if (error.message && /departamento(s)? destino|general o departamentos/i.test(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Error al crear tarea:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo guardar la tarea' });
  }
}

async function putTareasid(req, res) {
  const id = Number(req.params.id);
  const usuarioId = Number(req.usuario && req.usuario.id);
  const cuerpo = req.body || {};
  const { titulo, descripcion, asignado, fecha, horario, departamentos, departamento, estado } = cuerpo;
  const camposEnviados = ['titulo', 'descripcion', 'asignado', 'fecha', 'horario', 'departamentos', 'departamento', 'estado']
    .filter(campo => Object.prototype.hasOwnProperty.call(cuerpo, campo));

  if (!Number.isSafeInteger(id) || id <= 0 || camposEnviados.length === 0 ||
      (camposEnviados.includes('titulo') && (typeof titulo !== 'string' || !titulo.trim())) ||
      (camposEnviados.includes('fecha') && !validarFechaLimiteTarea(fecha))) {
    return res.status(400).json({
      success: false,
      error: 'Los datos de la tarea no son válidos o la fecha está fuera del rango permitido'
    });
  }

  try {
    const acceso = await obtenerAccesoContenido(pool, 'tarea', id, usuarioId);
    if (!acceso.existe) return res.status(404).json({ success: false, error: 'La tarea no existe' });
    if (!acceso.permitido || acceso.eliminado) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para editar esta tarea' });
    }

    // Actualización parcial: solo se escriben los campos enviados
    const asignaciones = [];
    const valores = [];
    const agregar = (columna, valor) => {
      valores.push(valor);
      asignaciones.push(`${columna} = $${valores.length}`);
    };

    if (camposEnviados.includes('titulo')) agregar('titulo', titulo.trim());
    if (camposEnviados.includes('descripcion')) agregar('descripcion', descripcion ? descripcion.trim() : null);
    if (camposEnviados.includes('asignado')) agregar('asignado', asignado ? asignado.trim() : 'General / Sin asignar');
    if (camposEnviados.includes('fecha')) agregar('fecha', fecha);
    if (camposEnviados.includes('horario')) agregar('horario', horario || '');
    if (camposEnviados.includes('departamentos') || camposEnviados.includes('departamento')) {
      const destinos = await resolverDestinosTarea(pool, departamentos, departamento);
      agregar('departamento', destinos.nombres.join(', '));
      agregar('departamentos_destino_ids', destinos.ids);
    }
    if (camposEnviados.includes('estado')) agregar('estado', estado || 'Pendiente');

    valores.push(id);
    const resultado = await consultar(
      `UPDATE tareas SET ${asignaciones.join(', ')}
       WHERE id = $${valores.length} AND COALESCE(eliminado, FALSE) = FALSE
       RETURNING *`,
      valores
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'La tarea no existe' });
    res.json({ success: true, tarea: resultado.rows[0] });
  } catch (error) {
    if (error.message && /departamento(s)? destino|general o departamentos/i.test(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Error al actualizar tarea:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo actualizar la tarea' });
  }
}

async function deleteTareasid(req, res) {
  try {
    const id = Number(req.params.id);
    const usuarioId = Number(req.usuario.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, error: 'ID de tarea inválido' });
    const acceso = await obtenerAccesoContenido(pool, 'tarea', id, usuarioId);
    if (!acceso.existe) return res.status(404).json({ success: false, error: 'La tarea no existe' });
    if (!acceso.permitido || acceso.eliminado) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar esta tarea' });
    }
    const resultado = await consultar(
      `UPDATE tareas SET eliminado = TRUE, fecha_eliminacion = NOW(), eliminado_por = $2
       WHERE id = $1 AND COALESCE(eliminado, FALSE) = FALSE RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'La tarea no existe' });
    res.json({ success: true, mensaje: 'Tarea movida a la papelera' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar la tarea' });
  }
}

async function getTareaspapelera(req, res) {
  const usuarioId = Number(req.usuario && req.usuario.id);
  try {
    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
      return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
    }
    const contexto = await obtenerContextoPapelera(usuarioId);
    const resultado = await consultar(
      `SELECT t.id, t.titulo, t.descripcion, t.asignado, t.fecha, t.horario, t.departamento,
              t.departamentos_destino_ids, t.departamento_emisor_id, t.autor_id,
              t.fecha_eliminacion, t.eliminado_por, u.nombre AS autor_nombre,
              d.nombre AS departamento_emisor_nombre,
              el.nombre AS eliminado_por_nombre
       FROM tareas t
       LEFT JOIN usuarios u ON u.id = t.autor_id
       LEFT JOIN departamentos d ON d.id = t.departamento_emisor_id
       LEFT JOIN usuarios el ON el.id = t.eliminado_por
       WHERE COALESCE(t.eliminado, FALSE) = TRUE
         AND (
           t.autor_id = $1
           OR (
             (
               $2::INTEGER = t.departamento_emisor_id
               OR $2::INTEGER = ANY(COALESCE(t.departamentos_destino_ids, ARRAY[]::INTEGER[]))
             )
             AND (
               $3::BOOLEAN
               OR t.eliminado_por = $4::INTEGER
               OR EXISTS (
                 SELECT 1 FROM usuarios jefe
                 WHERE jefe.id = t.eliminado_por
                   AND LOWER(BTRIM(COALESCE(jefe.es_jefe::TEXT, ''))) IN ('t', 'true', '1', 's', 'si', 'y', 'yes')
                   AND jefe.departamento_id = $2::INTEGER
               )
             )
           )
         )
       ORDER BY t.fecha_eliminacion DESC NULLS LAST, t.id DESC`,
      [usuarioId, contexto.departamentoId, contexto.esJefe, contexto.jefeId]
    );
    return res.json({ success: true, tareas: resultado.rows });
  } catch (error) {
    console.error('[papelera/tareas] Error al cargar la papelera:', {
      mensaje: error.message, codigo: error.code, detalle: error.detail,
      hint: error.hint, statement: error.statement, stack: error.stack, usuarioId
    });
    return res.status(500).json({ success: false, error: 'No se pudo cargar la papelera de tareas' });
  }
}

async function putTareasidrestaurar(req, res) {
  const id = Number(req.params.id);
  const usuarioId = Number(req.usuario.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, error: 'ID de tarea inválido' });
  try {
    const acceso = await obtenerAccesoContenido(pool, 'tarea', id, usuarioId);
    if (!acceso.existe || !acceso.eliminado) return res.status(404).json({ success: false, error: 'Tarea no encontrada' });
    if (!acceso.permitido) return res.status(403).json({ success: false, error: 'No tienes permiso para restaurar esta tarea' });
    await consultar(
      'UPDATE tareas SET eliminado = FALSE, fecha_eliminacion = NULL, eliminado_por = NULL WHERE id = $1',
      [id]
    );
    res.json({ success: true, mensaje: 'Tarea restaurada correctamente' });
  } catch (error) {
    console.error('Error al restaurar tarea:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo restaurar la tarea' });
  }
}

async function deleteTareasidpermanente(req, res) {
  const id = Number(req.params.id);
  const usuarioId = Number(req.usuario.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, error: 'ID de tarea inválido' });
  try {
    const acceso = await obtenerAccesoContenido(pool, 'tarea', id, usuarioId);
    if (!acceso.existe || !acceso.eliminado) return res.status(404).json({ success: false, error: 'Tarea no encontrada en la papelera' });
    if (!acceso.permitido) return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar esta tarea permanentemente' });
    await consultar('DELETE FROM tareas WHERE id = $1 AND eliminado = TRUE', [id]);
    res.json({ success: true, mensaje: 'Tarea eliminada permanentemente' });
  } catch (error) {
    console.error('Error al eliminar tarea permanentemente:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo eliminar la tarea permanentemente' });
  }
}

module.exports = {
  getTareas,
  postTareas,
  putTareasid,
  deleteTareasid,
  getTareaspapelera,
  putTareasidrestaurar,
  deleteTareasidpermanente,
};
