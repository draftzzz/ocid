/* Controlador HTTP del modulo autenticacion. */
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
  obtenerAccesoContenido, DEFINICIONES_CONTENIDO,
  marcarContenidoPreexistenteComoVisto
} = require('../models/access');

async function postLogin(req, res) {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ success: false, error: 'Correo y contraseña son obligatorios' });
  }

  try {
    const resultado = await consultar(
      `SELECT u.id, u.nombre, u.correo, u.password,
              CASE
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
                WHEN d.id IS NOT NULL AND u.es_jefe IS TRUE THEN 'Jefe de Departamento'
                WHEN EXISTS (
                  SELECT 1 FROM roles_departamento rd
                  WHERE rd.departamento_id = d.id
                    AND LOWER(BTRIM(rd.nombre)) = LOWER(BTRIM(COALESCE(u.rol, '')))
                ) THEN BTRIM(u.rol)
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) = 'docente' THEN 'Docente'
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
       WHERE u.correo = $1
       LIMIT 1`,
      [correo.trim()]
    );

    if (resultado.rowCount === 0) {
      return res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos' });
    }

    const usuario = resultado.rows[0];
    const passwordMatch = await bcrypt.compare(password, usuario.password);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    delete usuario.password;

    res.json({ success: true, token, usuario });
  } catch (error) {
    console.error('Error en login:', error.message);
    res.status(500).json({ success: false, error: 'Error al iniciar sesión' });
  }
}

async function postRegistro(req, res) {
  const { nombre, correo, password, departamento, departamento_id } = req.body;

  if (!nombre || !correo || !password) {
    return res.status(400).json({ success: false, error: 'Nombre, correo y contraseña son obligatorios' });
  }

  let client;
  let transaccionAbierta = false;
  try {
    const existente = await consultar('SELECT id FROM usuarios WHERE correo = $1 LIMIT 1', [correo.trim()]);
    if (existente.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'Ese correo ya está registrado' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    let departamentoId = null;
    if (departamento_id !== undefined && departamento_id !== null && departamento_id !== '' && !isNaN(Number(departamento_id))) {
      const numId = Number(departamento_id);
      if (numId > 0) {
        const deptoExiste = await consultar('SELECT id FROM departamentos WHERE id = $1 AND eliminado = FALSE', [numId]);
        if (deptoExiste.rowCount > 0) departamentoId = numId;
      }
    }

    if (!departamentoId && departamento && String(departamento).trim()) {
      const resDepto = await consultar(
        'SELECT id FROM departamentos WHERE LOWER(nombre) = LOWER($1) AND eliminado = FALSE LIMIT 1',
        [String(departamento).trim()]
      );
      if (resDepto.rowCount > 0) departamentoId = resDepto.rows[0].id;
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transaccionAbierta = true;
    if (departamentoId) {
      const departamentoActual = await client.query(
        'SELECT id FROM departamentos WHERE id = $1 AND eliminado = FALSE FOR KEY SHARE',
        [departamentoId]
      );
      if (!departamentoActual.rowCount) {
        await client.query('ROLLBACK');
        transaccionAbierta = false;
        return res.status(409).json({ success: false, error: 'El departamento ya no está disponible' });
      }

      const rolDocenteDisponible = await client.query(
        `SELECT 1 FROM roles_departamento
         WHERE departamento_id = $1 AND LOWER(BTRIM(nombre)) = 'docente'
         FOR KEY SHARE`,
        [departamentoId]
      );
      if (!rolDocenteDisponible.rowCount) {
        await client.query('ROLLBACK');
        transaccionAbierta = false;
        return res.status(409).json({
          success: false,
          error: 'El departamento no acepta registros con el rol Docente actualmente'
        });
      }
    }

    const rolFinal = 'Docente';

    const resultado = await client.query(
      `INSERT INTO usuarios (nombre, correo, password, rol, departamento_id, es_jefe)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING id, nombre, correo, rol, departamento_id, es_jefe`,
      [nombre.trim(), correo.trim(), hashedPassword, rolFinal, departamentoId]
    );

    // El contenido previo al alta con departamento queda marcado como leído
    if (departamentoId) {
      await marcarContenidoPreexistenteComoVisto(client, resultado.rows[0].id, departamentoId);
    }

    await client.query('COMMIT');
    transaccionAbierta = false;
    res.status(201).json({ success: true, usuario: resultado.rows[0] });
  } catch (error) {
    if (client && transaccionAbierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error al revertir el registro del usuario:', rollbackError.message);
      }
    }
    console.error('Error al registrar usuario:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ese correo ya está registrado' });
    }
    res.status(500).json({ success: false, error: 'No se pudo registrar el usuario.' });
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  postLogin,
  postRegistro,
};
