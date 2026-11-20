/* Controlador HTTP del modulo identidad. */
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

async function getPerfil(req, res) {
  const usuarioId = Number(req.usuario && req.usuario.id);
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
  }

  try {
    const usuario = await obtenerPerfilUsuario(pool, usuarioId);
    if (!usuario) return res.status(404).json({ success: false, error: 'El usuario no existe' });
    res.json({ success: true, usuario });
  } catch (error) {
    console.error('Error al consultar el perfil actual:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo consultar el perfil actual' });
  }
}

async function getUsuarios(req, res) {
  try {
    const resultado = await consultar(
      `SELECT u.id, u.nombre, u.correo, COALESCE(u.estado, 'Activo') AS estado,
              CASE
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
                WHEN d.id IS NOT NULL AND u.es_jefe IS TRUE THEN 'Jefe de Departamento'
                WHEN EXISTS (
                  SELECT 1 FROM roles_departamento rd
                  WHERE rd.departamento_id = d.id
                    AND LOWER(BTRIM(rd.nombre)) = LOWER(BTRIM(COALESCE(u.rol, '')))
                ) THEN BTRIM(u.rol)
                ELSE 'Docente'
              END AS rol,
              EXISTS (
                SELECT 1 FROM roles_departamento rd
                WHERE rd.departamento_id = d.id
                  AND LOWER(BTRIM(rd.nombre)) = LOWER(BTRIM(COALESCE(u.rol, '')))
              ) AS rol_personalizado_valido,
              CASE WHEN d.id IS NULL THEN NULL ELSE u.departamento_id END AS departamento_id,
              CASE WHEN d.id IS NOT NULL AND u.es_jefe IS TRUE THEN TRUE ELSE FALSE END AS es_jefe,
              d.nombre AS departamento_nombre
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id AND d.eliminado = FALSE
       ORDER BY u.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al consultar usuarios:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los usuarios' });
  }
}

async function getDocentes(req, res) {
  try {
    let departamentoId;
    if (req.query.departamento_id !== undefined) {
      departamentoId = Number(req.query.departamento_id);
      if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0) {
        return res.status(400).json({ success: false, error: 'ID de departamento inválido' });
      }
    } else {
      const usuarioActual = await consultar(
        'SELECT departamento_id FROM usuarios WHERE id = $1',
        [req.usuario.id]
      );
      if (usuarioActual.rowCount === 0) {
        return res.status(401).json({ success: false, error: 'El usuario de la sesión ya no existe' });
      }
      departamentoId = Number(usuarioActual.rows[0].departamento_id);
      if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0) return res.json([]);
    }

    const resultado = await consultar(
      `SELECT u.id, u.nombre, u.correo, u.departamento_id,
              COALESCE(u.estado, 'Activo') AS estado,
              CASE WHEN u.es_jefe IS TRUE THEN TRUE ELSE FALSE END AS es_jefe,
              d.nombre AS departamento, d.nombre AS departamento_nombre,
              CASE
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
                WHEN u.es_jefe IS TRUE THEN 'Jefe de Departamento'
                WHEN EXISTS (
                  SELECT 1 FROM roles_departamento rd
                  WHERE rd.departamento_id = d.id
                    AND LOWER(BTRIM(rd.nombre)) = LOWER(BTRIM(COALESCE(u.rol, '')))
                ) THEN BTRIM(u.rol)
                ELSE 'Docente'
              END AS rol,
              EXISTS (
                SELECT 1 FROM roles_departamento rd
                WHERE rd.departamento_id = d.id
                  AND LOWER(BTRIM(rd.nombre)) = LOWER(BTRIM(COALESCE(u.rol, '')))
              ) AS rol_personalizado_valido
       FROM usuarios u
       JOIN departamentos d ON d.id = u.departamento_id AND d.eliminado = FALSE
       WHERE u.departamento_id = $1
       ORDER BY u.id DESC`,
      [departamentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al cargar docentes:', error.message);
    res.status(500).json({ success: false, error: 'Error al cargar docentes' });
  }
}

async function patchUsuariosidrol(req, res) {
  const id = Number(req.params.id);
  const rolSolicitado = typeof req.body.rol === 'string' ? req.body.rol.trim() : '';
  const rolNormalizado = normalizarRol(rolSolicitado);
  if (!Number.isSafeInteger(id) || id <= 0 || !rolSolicitado) {
    return res.status(400).json({ success: false, error: 'Usuario y rol son obligatorios' });
  }
  if (['jefe', 'jefe de departamento'].includes(rolNormalizado)) {
    return res.status(400).json({ success: false, error: 'La jefatura se asigna mediante la transferencia de propiedad' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const objetivoInicial = await client.query(
      'SELECT departamento_id FROM usuarios WHERE id = $1',
      [id]
    );
    if (objetivoInicial.rowCount === 0 || !objetivoInicial.rows[0].departamento_id) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El docente no pertenece a un departamento activo' });
    }
    const departamentoId = Number(objetivoInicial.rows[0].departamento_id);
    const acceso = await obtenerPermisosDepartamento(client, req.usuario.id, departamentoId, true);
    if (!acceso) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    if (!acceso.esJefe) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Solo el jefe del departamento puede asignar roles' });
    }

    const objetivo = await client.query(
      `SELECT id, departamento_id, rol, es_jefe
       FROM usuarios WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (objetivo.rowCount === 0 || Number(objetivo.rows[0].departamento_id) !== departamentoId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'La pertenencia del docente al departamento cambió' });
    }
    if (Number(acceso.departamento.jefe_id) === id || esFlagActivo(objetivo.rows[0].es_jefe)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Transfiere primero la jefatura de este docente' });
    }

    const rolCatalogo = await client.query(
      `SELECT nombre FROM roles_departamento
       WHERE departamento_id = $1 AND LOWER(BTRIM(nombre)) = LOWER(BTRIM($2))
       FOR KEY SHARE`,
      [departamentoId, rolSolicitado]
    );
    if (rolCatalogo.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'El rol no existe en este departamento' });
    }
    const rolFinal = rolCatalogo.rows[0].nombre;

    await client.query(
      `UPDATE usuarios SET rol = $1, es_jefe = FALSE
       WHERE id = $2
       RETURNING id`,
      [rolFinal, id]
    );
    const actualizado = await client.query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, u.es_jefe,
              EXISTS (
                SELECT 1 FROM roles_departamento rd
                WHERE rd.departamento_id = d.id
                  AND LOWER(BTRIM(rd.nombre)) = LOWER(BTRIM(COALESCE(u.rol, '')))
              ) AS rol_personalizado_valido
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id AND d.eliminado = FALSE
       WHERE u.id = $1`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ success: true, usuario: actualizado.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al asignar rol:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo asignar el rol' });
  } finally {
    if (client) client.release();
  }
}

async function patchUsuariosidestado(req, res) {
  const id = Number(req.params.id);
  const estadoSolicitado = typeof req.body.estado === 'string'
    ? req.body.estado.trim().toLocaleLowerCase('es-MX')
    : '';
  const estado = estadoSolicitado === 'activo'
    ? 'Activo'
    : estadoSolicitado === 'inactivo'
      ? 'Inactivo'
      : '';
  if (!Number.isSafeInteger(id) || id <= 0 ||
      !['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ success: false, error: 'El estado solicitado no es válido' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const usuarioObjetivo = await client.query(
      'SELECT departamento_id FROM usuarios WHERE id = $1',
      [id]
    );
    if (!usuarioObjetivo.rowCount || !usuarioObjetivo.rows[0].departamento_id) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El integrante no pertenece a un departamento activo' });
    }

    const departamentoId = Number(usuarioObjetivo.rows[0].departamento_id);
    const acceso = await obtenerPermisosDepartamento(client, req.usuario.id, departamentoId, true);
    if (!acceso) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    if (!acceso.esJefe) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Solo el jefe puede cambiar el estado de sus integrantes' });
    }

    const objetivoBloqueado = await client.query(
      'SELECT id, departamento_id, es_jefe FROM usuarios WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!objetivoBloqueado.rowCount ||
        Number(objetivoBloqueado.rows[0].departamento_id) !== departamentoId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'La pertenencia del integrante al departamento cambió' });
    }
    if (Number(acceso.departamento.jefe_id) === id || esFlagActivo(objetivoBloqueado.rows[0].es_jefe)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'No se puede cambiar el estado del jefe del departamento' });
    }

    const actualizado = await client.query(
      'UPDATE usuarios SET estado = $1 WHERE id = $2 RETURNING id, estado',
      [estado, id]
    );
    await client.query('COMMIT');
    res.json({ success: true, usuario: actualizado.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al cambiar el estado del integrante:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo cambiar el estado del integrante' });
  } finally {
    if (client) client.release();
  }
}

async function putUsuariosid(req, res) {
  const id = Number(req.params.id);
  const { nombre, correo } = req.body;

  if (!Number.isInteger(id) || id <= 0 || !nombre || !correo) {
    return res.status(400).json({ success: false, error: 'Los datos del perfil no son válidos' });
  }
  if (id !== Number(req.usuario.id)) {
    return res.status(403).json({ success: false, error: 'Solo puedes actualizar tu propio perfil' });
  }

  try {
    const resultado = await consultar(
      `UPDATE usuarios
       SET nombre = $1, correo = $2
       WHERE id = $3
       RETURNING id, nombre, correo, rol, departamento_id, es_jefe`,
      [nombre.trim(), correo.trim(), id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'El usuario no existe' });
    }

    const perfil = await consultar(
      `SELECT u.id, u.nombre, u.correo,
              CASE
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
                WHEN d.id IS NOT NULL AND u.es_jefe IS TRUE THEN 'Jefe de Departamento'
                WHEN EXISTS (
                  SELECT 1 FROM roles_departamento rd
                  WHERE rd.departamento_id = d.id
                    AND LOWER(BTRIM(rd.nombre)) = LOWER(BTRIM(COALESCE(u.rol, '')))
                ) THEN BTRIM(u.rol)
                ELSE 'Docente'
              END AS rol,
              EXISTS (
                SELECT 1 FROM roles_departamento rd
                WHERE rd.departamento_id = d.id
                  AND LOWER(BTRIM(rd.nombre)) = LOWER(BTRIM(COALESCE(u.rol, '')))
              ) AS rol_personalizado_valido,
              CASE WHEN d.id IS NULL THEN NULL ELSE u.departamento_id END AS departamento_id,
              CASE WHEN d.id IS NOT NULL AND u.es_jefe IS TRUE THEN TRUE ELSE FALSE END AS es_jefe,
              d.nombre AS departamento, d.nombre AS departamento_nombre,
              CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object(
                'id', d.id, 'nombre', d.nombre, 'descripcion', d.descripcion,
                'jefe_id', d.jefe_id, 'codigo', d.codigo
              ) END AS departamento_objeto
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id AND d.eliminado = FALSE
       WHERE u.id = $1`,
      [id]
    );

    res.json({ success: true, usuario: perfil.rows[0] });
  } catch (error) {
    console.error('Error al actualizar perfil:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ese correo ya está registrado' });
    }
    res.status(500).json({ success: false, error: 'No se pudo actualizar el perfil' });
  }
}

async function patchUsuariosidsalirdepartamento(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
  }
  if (id !== Number(req.usuario.id)) {
    return res.status(403).json({ success: false, error: 'Solo puedes salir de tu propio departamento' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const usuarioActual = await client.query(
      'SELECT id, departamento_id, es_jefe FROM usuarios WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (usuarioActual.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El usuario no existe' });
    }

    const usuario = usuarioActual.rows[0];
    if (!usuario.departamento_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'El usuario no pertenece a un departamento' });
    }
    if (esFlagActivo(usuario.es_jefe)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Transfiere primero la jefatura del departamento' });
    }

    const departamento = await client.query(
      'SELECT jefe_id FROM departamentos WHERE id = $1 FOR UPDATE',
      [usuario.departamento_id]
    );
    if (departamento.rowCount > 0 && Number(departamento.rows[0].jefe_id) === id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Transfiere primero la jefatura del departamento' });
    }

    await client.query(
      `UPDATE usuarios
       SET departamento_id = NULL, es_jefe = FALSE, rol = 'Docente'
       WHERE id = $1`,
      [id]
    );
    const perfil = await client.query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, u.es_jefe,
              NULLIF(BTRIM(d.nombre), '') AS departamento,
              NULLIF(BTRIM(d.nombre), '') AS departamento_nombre,
              CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object(
                'id', d.id, 'nombre', d.nombre, 'descripcion', d.descripcion,
                'jefe_id', d.jefe_id, 'codigo', d.codigo
              ) END AS departamento_objeto
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id AND d.eliminado = FALSE
       WHERE u.id = $1`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ success: true, usuario: perfil.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al salir del departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo salir del departamento' });
  } finally {
    if (client) client.release();
  }
}

async function patchUsuariosidpassword(req, res) {
  const id = Number(req.params.id);
  const { password_actual, password_nueva } = req.body;

  if (!Number.isInteger(id) || id <= 0 || !password_actual || !password_nueva || password_nueva.length < 6) {
    return res.status(400).json({ success: false, error: 'Datos incompletos o contraseña menor a 6 caracteres' });
  }

  try {
    const usuarioRes = await consultar('SELECT id, password FROM usuarios WHERE id = $1', [id]);
    if (usuarioRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'El usuario no existe' });
    }

    const usuario = usuarioRes.rows[0];
    const passwordMatch = await bcrypt.compare(password_actual, usuario.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'La contraseña actual no es correcta' });
    }

    const hashedNuevaPassword = await bcrypt.hash(password_nueva, 10);
    await consultar('UPDATE usuarios SET password = $1 WHERE id = $2', [hashedNuevaPassword, id]);

    res.json({ success: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo cambiar la contraseña' });
  }
}

async function deleteUsuariosid(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
  }
  if (id === Number(req.usuario.id)) {
    return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta desde esta vista' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const objetivoInicial = await client.query('SELECT departamento_id FROM usuarios WHERE id = $1', [id]);
    if (objetivoInicial.rowCount === 0 || !objetivoInicial.rows[0].departamento_id) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El docente no pertenece a un departamento activo' });
    }

    const departamentoId = Number(objetivoInicial.rows[0].departamento_id);
    const acceso = await obtenerPermisosDepartamento(client, req.usuario.id, departamentoId, true);
    if (!acceso) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    if (!acceso.puedeGestionar) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar docentes' });
    }

    const usuarioExiste = await client.query(
      'SELECT id, departamento_id, es_jefe FROM usuarios WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (usuarioExiste.rowCount === 0 || Number(usuarioExiste.rows[0].departamento_id) !== departamentoId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'La pertenencia del docente al departamento cambió' });
    }
    if (Number(acceso.departamento.jefe_id) === id || esFlagActivo(usuarioExiste.rows[0].es_jefe)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Transfiere primero la jefatura de este docente' });
    }

    await client.query('DELETE FROM notificaciones WHERE usuario_id = $1', [id]);
    await client.query('DELETE FROM usuarios WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al eliminar usuario:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo eliminar el usuario' });
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  getPerfil,
  getUsuarios,
  getDocentes,
  patchUsuariosidrol,
  patchUsuariosidestado,
  putUsuariosid,
  patchUsuariosidsalirdepartamento,
  patchUsuariosidpassword,
  deleteUsuariosid,
};
