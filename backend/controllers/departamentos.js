/* Controlador HTTP del modulo departamentos. */
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

async function getDepartamentosidroles(req, res) {
  const departamentoId = Number(req.params.id);
  if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0) {
    return res.status(400).json({ success: false, error: 'ID de departamento inválido' });
  }

  try {
    const acceso = await obtenerPermisosDepartamento(pool, req.usuario.id, departamentoId, false);
    if (!acceso) return res.status(404).json({ success: false, error: 'El departamento no existe' });
    const esIntegrante = Number(acceso.departamento.usuario_departamento_id) === departamentoId;
    if (!esIntegrante && !acceso.esAdministrador) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a los roles de este departamento' });
    }

    const [resultado, detalles] = await Promise.all([
      consultar(
        'SELECT nombre FROM roles_departamento WHERE departamento_id = $1 ORDER BY LOWER(nombre), nombre',
        [departamentoId]
      ),
      consultar(
        `SELECT rd.id, rd.nombre, rd.color,
                COALESCE(
                  JSON_AGG(
                    JSON_BUILD_OBJECT(
                      'id', u.id,
                      'nombre', u.nombre,
                      'correo', u.correo,
                      'estado', COALESCE(u.estado, 'Activo')
                    )
                    ORDER BY LOWER(u.nombre), u.id
                  ) FILTER (WHERE u.id IS NOT NULL),
                  '[]'::JSON
                ) AS integrantes
         FROM roles_departamento rd
         LEFT JOIN usuarios u
           ON u.departamento_id = rd.departamento_id
          AND LOWER(BTRIM(COALESCE(u.rol, ''))) = LOWER(BTRIM(rd.nombre))
         WHERE rd.departamento_id = $1
         GROUP BY rd.id, rd.nombre, rd.color
         ORDER BY LOWER(rd.nombre), rd.nombre`,
        [departamentoId]
      )
    ]);
    res.json({
      success: true,
      roles: resultado.rows.map(fila => fila.nombre),
      roles_detalle: detalles.rows
    });
  } catch (error) {
    console.error('Error al cargar roles del departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los roles' });
  }
}

async function postDepartamentosidroles(req, res) {
  const departamentoId = Number(req.params.id);
  const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
  const nombreNormalizado = normalizarRol(nombre);
  const rolesReservados = new Set(['jefe', 'jefe de departamento']);
  if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0 || !nombre || nombre.length > 60) {
    return res.status(400).json({ success: false, error: 'El nombre del rol debe tener entre 1 y 60 caracteres' });
  }
  if (rolesReservados.has(nombreNormalizado)) {
    return res.status(400).json({ success: false, error: 'Ese nombre está reservado por el sistema' });
  }

  try {
    const acceso = await obtenerPermisosDepartamento(pool, req.usuario.id, departamentoId, false);
    if (!acceso) return res.status(404).json({ success: false, error: 'El departamento no existe' });
    if (!acceso.esJefe) {
      return res.status(403).json({ success: false, error: 'Solo el jefe del departamento puede crear roles' });
    }

    const coloresUsados = await consultar(
      'SELECT color FROM roles_departamento WHERE departamento_id = $1',
      [departamentoId]
    );
    const color = generarColorRol(coloresUsados.rows.map(fila => fila.color));
    const resultado = await consultar(
      `INSERT INTO roles_departamento (departamento_id, nombre, color, creado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, color`,
      [departamentoId, nombre, color, req.usuario.id]
    );
    res.status(201).json({ success: true, rol: resultado.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      try {
        const duplicado = await consultar(
          `SELECT 1 FROM roles_departamento
           WHERE departamento_id = $1 AND LOWER(BTRIM(nombre)) = LOWER(BTRIM($2))
           LIMIT 1`,
          [departamentoId, nombre]
        );
        if (duplicado.rowCount) {
          return res.status(409).json({ success: false, error: 'Ya existe un rol con ese nombre en este departamento' });
        }
      } catch (consultaError) {
        console.error('Error al comprobar el rol duplicado:', consultaError.message);
        return res.status(500).json({ success: false, error: 'No se pudo comprobar si el rol ya existe' });
      }
      console.error('Colisión al guardar el color del rol:', error.message);
      return res.status(409).json({ success: false, error: 'No se pudo asignar un color único al rol. Intenta de nuevo.' });
    }
    console.error('Error al crear rol de departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo crear el rol' });
  }
}

async function deleteDepartamentosidrolesrolId(req, res) {
  const departamentoId = Number(req.params.id);
  const rolId = Number(req.params.rolId);
  const usuarioId = Number(req.usuario && req.usuario.id);
  if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0 ||
      !Number.isSafeInteger(rolId) || rolId <= 0) {
    return res.status(400).json({ success: false, error: 'El departamento o rol no es válido' });
  }
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const acceso = await obtenerPermisosDepartamento(client, usuarioId, departamentoId, true);
    if (!acceso) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    if (!acceso.esJefe) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Solo el jefe del departamento puede eliminar roles' });
    }

    const rol = await client.query(
      `SELECT id, departamento_id, nombre
       FROM roles_departamento
       WHERE id = $1 AND departamento_id = $2
       FOR UPDATE`,
      [rolId, departamentoId]
    );
    if (!rol.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El rol no existe en este departamento' });
    }
    if (['jefe', 'jefe de departamento'].includes(normalizarRol(rol.rows[0].nombre))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'El rol Jefe de Departamento está protegido' });
    }

    const asignaciones = await client.query(
      `SELECT 1
       FROM usuarios
       WHERE departamento_id = $1
         AND LOWER(BTRIM(COALESCE(rol, ''))) = LOWER(BTRIM($2))
       LIMIT 1`,
      [departamentoId, rol.rows[0].nombre]
    );
    if (asignaciones.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Reasigna a los integrantes antes de eliminar este rol'
      });
    }

    const eliminado = await client.query(
      `DELETE FROM roles_departamento
       WHERE id = $1 AND departamento_id = $2
       RETURNING id, nombre, color`,
      [rolId, departamentoId]
    );
    await client.query('COMMIT');
    res.json({ success: true, rol: eliminado.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al eliminar rol de departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo eliminar el rol' });
  } finally {
    if (client) client.release();
  }
}

async function getDepartamentos(req, res) {
  try {
    const resultado = await consultar(
      `SELECT d.id, d.nombre, d.descripcion, d.jefe_id, d.codigo, u.nombre AS nombre_jefe
       FROM departamentos d
       LEFT JOIN usuarios u ON u.id = d.jefe_id
       WHERE d.eliminado = FALSE
       ORDER BY d.id ASC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al cargar departamentos' });
  }
}

async function getDepartamentoscodigocodigo(req, res) {
  const { codigo } = req.params;
  try {
    const resultado = await consultar(
      `SELECT d.id, d.nombre, d.descripcion, d.jefe_id, d.codigo, u.nombre AS nombre_jefe
       FROM departamentos d LEFT JOIN usuarios u ON u.id = d.jefe_id
       WHERE LOWER(BTRIM(d.codigo)) = LOWER(BTRIM($1)) AND d.eliminado = FALSE
       LIMIT 1`,
      [codigo.trim()]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Departamento no encontrado' });
    res.json({ success: true, departamento: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al buscar el departamento' });
  }
}

async function postDepartamentosunirse(req, res) {
  const usuarioId = Number(req.usuario && req.usuario.id);
  const codigo = req.body && typeof req.body.codigo === 'string' ? req.body.codigo.trim() : '';
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
  }
  if (!/^[A-Za-z0-9]{7}$/.test(codigo)) {
    return res.status(400).json({ success: false, error: 'El código debe tener 7 letras o números y respetar sus mayúsculas y minúsculas' });
  }

  let client;
  let transaccionAbierta = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transaccionAbierta = true;

    const usuarioActual = await client.query(
      'SELECT id, departamento_id FROM usuarios WHERE id = $1 FOR UPDATE',
      [usuarioId]
    );
    if (!usuarioActual.rowCount) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;
      return res.status(401).json({ success: false, error: 'Tu sesión ya no es válida. Inicia sesión nuevamente.' });
    }
    if (usuarioActual.rows[0].departamento_id) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;
      return res.status(409).json({ success: false, error: 'Ya perteneces a un departamento' });
    }

    const departamento = await client.query(
      `SELECT id FROM departamentos
       WHERE LOWER(BTRIM(codigo)) = LOWER($1) AND eliminado = FALSE
       FOR KEY SHARE`,
      [codigo]
    );
    if (!departamento.rowCount) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;
      return res.status(404).json({ success: false, error: 'El código no existe o no pertenece a un departamento activo.' });
    }

    await client.query(
      `UPDATE usuarios
       SET departamento_id = $1, es_jefe = FALSE
       WHERE id = $2`,
      [departamento.rows[0].id, usuarioId]
    );
    const usuario = await obtenerPerfilUsuario(client, usuarioId);
    if (!usuario || !usuario.departamento_id) {
      throw new Error('No se pudo cargar el perfil actualizado del usuario');
    }

    await client.query('COMMIT');
    transaccionAbierta = false;

    const token = jwt.sign(
      { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ success: true, usuario, token });
  } catch (error) {
    if (client && transaccionAbierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error al revertir la unión al departamento:', rollbackError.message);
      }
    }
    console.error('Error al unirse al departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo unir al departamento' });
  } finally {
    if (client) client.release();
  }
}

async function postDepartamentos(req, res) {
  const { nombre, descripcion } = req.body;
  const nombreFinal = typeof nombre === 'string' ? nombre.trim() : '';
  const descripcionFinal = typeof descripcion === 'string' && descripcion.trim()
    ? descripcion.trim()
    : null;
  const jefeId = Number(req.usuario && req.usuario.id);
  if (!nombreFinal) {
    return res.status(400).json({ success: false, error: 'El nombre del departamento es obligatorio' });
  }
  if (!Number.isSafeInteger(jefeId) || jefeId <= 0) {
    return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
  }

  let client;
  let transaccionAbierta = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transaccionAbierta = true;
    await client.query('SELECT pg_advisory_xact_lock(72653145)');

    const usuarioExistente = await client.query(
      'SELECT id, departamento_id FROM usuarios WHERE id = $1 FOR UPDATE',
      [jefeId]
    );
    if (usuarioExistente.rowCount === 0) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;
      return res.status(404).json({ success: false, error: 'El usuario creador no existe' });
    }
    if (usuarioExistente.rows[0].departamento_id) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;
      return res.status(409).json({ success: false, error: 'El usuario ya pertenece a un departamento' });
    }

    let departamento = null;
    for (let intento = 0; intento < 10 && !departamento; intento += 1) {
      const codigoFinal = generarCodigoDepartamento();
      const codigoExistente = await client.query(
        'SELECT 1 FROM departamentos WHERE LOWER(BTRIM(codigo)) = LOWER($1) LIMIT 1',
        [codigoFinal]
      );
      if (codigoExistente.rowCount > 0) continue;

      const resultado = await client.query(
        `INSERT INTO departamentos (id, nombre, descripcion, codigo, jefe_id)
         VALUES (COALESCE((SELECT MAX(id) FROM departamentos), 0) + 1, $1, $2, $3, $4)
         RETURNING *`,
        [nombreFinal, descripcionFinal, codigoFinal, jefeId]
      );
      departamento = resultado.rows[0];
    }

    if (!departamento) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;
      return res.status(503).json({ success: false, error: 'No se pudo generar un código único. Intenta de nuevo.' });
    }

    await client.query(
      `INSERT INTO roles_departamento (departamento_id, nombre, color, creado_por)
       VALUES ($1, 'Docente', '#475569', $2),
              ($1, 'Administrador General', '#6D28D9', $2)`,
      [departamento.id, jefeId]
    );
    await client.query(
      'UPDATE departamentos SET roles_base_inicializados = TRUE WHERE id = $1',
      [departamento.id]
    );

    await client.query(
      `UPDATE usuarios
       SET departamento_id = $1, rol = 'Jefe de Departamento', es_jefe = TRUE
       WHERE id = $2`,
      [departamento.id, jefeId]
    );
    const perfil = await client.query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, u.es_jefe,
              d.nombre AS departamento, d.nombre AS departamento_nombre,
              json_build_object(
                'id', d.id, 'nombre', d.nombre, 'descripcion', d.descripcion,
                'jefe_id', d.jefe_id, 'codigo', d.codigo
              ) AS departamento_objeto
       FROM usuarios u
       JOIN departamentos d ON d.id = u.departamento_id
       WHERE u.id = $1`,
      [jefeId]
    );

    await client.query('COMMIT');
    transaccionAbierta = false;
    res.status(201).json({
      success: true,
      departamento,
      usuario: perfil.rows[0]
    });
  } catch (error) {
    if (client && transaccionAbierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error al revertir la creación del departamento:', rollbackError.message);
      }
    }
    console.error('Error al crear el departamento:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe un departamento con esos datos' });
    }
    res.status(500).json({ success: false, error: 'No se pudo crear el departamento' });
  } finally {
    if (client) client.release();
  }
}

async function putDepartamentosid(req, res) {
  const id = Number(req.params.id);
  const { nombre, descripcion } = req.body;
  const nombreFinal = typeof nombre === 'string' ? nombre.trim() : '';
  const descripcionFinal = typeof descripcion === 'string' && descripcion.trim()
    ? descripcion.trim()
    : null;
  const usuarioId = Number(req.usuario && req.usuario.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !nombreFinal) {
    return res.status(400).json({ success: false, error: 'Los datos del departamento no son válidos' });
  }
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({ success: false, error: 'La sesión no identifica a un usuario válido' });
  }

  try {
    const acceso = await obtenerPermisosDepartamento(pool, usuarioId, id, false);
    if (!acceso) {
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    if (!acceso.puedeGestionar) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para modificar este departamento'
      });
    }

    const resultado = await consultar(
      `UPDATE departamentos
       SET nombre = $1, descripcion = $2
       WHERE id = $3 AND eliminado = FALSE
       RETURNING id, nombre, descripcion, jefe_id, codigo`,
      [nombreFinal, descripcionFinal, id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El departamento no existe' });
    res.json({ success: true, departamento: resultado.rows[0] });
  } catch (error) {
    console.error('Error al actualizar el departamento:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe un departamento con ese nombre' });
    }
    res.status(500).json({ success: false, error: 'No se pudo actualizar el departamento' });
  }
}

async function patchDepartamentosidtransferirjefatura(req, res) {
  const departamentoId = Number(req.params.id);
  const { nuevo_jefe_id: nuevoJefeRecibido, confirmacion } = req.body || {};
  const nuevoJefeId = Number(nuevoJefeRecibido);
  const usuarioId = Number(req.usuario && req.usuario.id);
  if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0 ||
      !Number.isSafeInteger(nuevoJefeId) || nuevoJefeId <= 0) {
    return res.status(400).json({ success: false, error: 'Selecciona un docente válido' });
  }
  if (confirmacion !== 'Transferir propiedad') {
    return res.status(400).json({ success: false, error: 'La frase de confirmación no coincide' });
  }
  if (nuevoJefeId === usuarioId) {
    return res.status(400).json({ success: false, error: 'El nuevo jefe debe ser otro integrante' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const acceso = await obtenerPermisosDepartamento(client, usuarioId, departamentoId, true);
    if (!acceso) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    if (!acceso.puedeGestionar) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'No tienes permiso para transferir la jefatura' });
    }

    const candidato = await client.query(
      `SELECT id, rol, estado FROM usuarios
       WHERE id = $1 AND departamento_id = $2
       FOR UPDATE`,
      [nuevoJefeId, departamentoId]
    );
    if (candidato.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'El nuevo jefe debe pertenecer al mismo departamento' });
    }
    if (candidato.rows[0].estado === 'Inactivo') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'El nuevo jefe debe ser un integrante activo' });
    }

    const rolDocente = await client.query(
      `SELECT 1 FROM roles_departamento
       WHERE departamento_id = $1 AND LOWER(BTRIM(nombre)) = 'docente'
       FOR KEY SHARE`,
      [departamentoId]
    );
    if (!rolDocente.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Crea o restablece el rol Docente antes de transferir la jefatura' });
    }

    await client.query(
      `UPDATE usuarios
       SET es_jefe = FALSE,
           rol = CASE
             WHEN LOWER(BTRIM(COALESCE(rol, ''))) IN ('jefe', 'jefe de departamento') THEN 'Docente'
             ELSE rol
           END
       WHERE departamento_id = $1 AND id <> $2`,
      [departamentoId, nuevoJefeId]
    );
    await client.query(
      `UPDATE usuarios
       SET es_jefe = TRUE,
           rol = CASE
             WHEN LOWER(BTRIM(COALESCE(rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
             ELSE 'Jefe de Departamento'
           END
       WHERE id = $1 AND departamento_id = $2`,
      [nuevoJefeId, departamentoId]
    );
    const departamentoActualizado = await client.query(
      `UPDATE departamentos SET jefe_id = $1
       WHERE id = $2 AND eliminado = FALSE
       RETURNING id, nombre, descripcion, jefe_id, codigo`,
      [nuevoJefeId, departamentoId]
    );
    if (departamentoActualizado.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    const usuarioActualizado = await client.query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, u.es_jefe
       FROM usuarios u WHERE u.id = $1`,
      [usuarioId]
    );
    const nuevoJefeActualizado = await client.query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, u.es_jefe
       FROM usuarios u WHERE u.id = $1`,
      [nuevoJefeId]
    );
    await client.query('COMMIT');
    res.json({
      success: true,
      departamento: departamentoActualizado.rows[0],
      usuario: usuarioActualizado.rows[0],
      nuevo_jefe: nuevoJefeActualizado.rows[0]
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al transferir la jefatura:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo transferir la jefatura' });
  } finally {
    if (client) client.release();
  }
}

async function deleteDepartamentosid(req, res) {
  const departamentoId = Number(req.params.id);
  const usuarioId = Number(req.usuario && req.usuario.id);
  if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0) {
    return res.status(400).json({ success: false, error: 'ID de departamento inválido' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const acceso = await obtenerPermisosDepartamento(client, usuarioId, departamentoId, true);
    if (!acceso) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    if (!acceso.esJefe) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Solo el jefe asignado puede borrar el departamento' });
    }
    if (req.body.confirmacion !== 'Confirmar eliminacion' ||
        req.body.nombre_departamento !== acceso.departamento.nombre) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'La confirmación no coincide con el departamento' });
    }

    await client.query(
      'UPDATE departamentos SET eliminado = TRUE WHERE id = $1 AND eliminado = FALSE',
      [departamentoId]
    );
    await client.query(
      `UPDATE usuarios
       SET departamento_id = NULL,
           es_jefe = FALSE,
           rol = 'Docente'
       WHERE departamento_id = $1`,
      [departamentoId]
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al borrar lógicamente el departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo eliminar el departamento' });
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  getDepartamentosidroles,
  postDepartamentosidroles,
  deleteDepartamentosidrolesrolId,
  getDepartamentos,
  getDepartamentoscodigocodigo,
  postDepartamentosunirse,
  postDepartamentos,
  putDepartamentosid,
  patchDepartamentosidtransferirjefatura,
  deleteDepartamentosid,
};
