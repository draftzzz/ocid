const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();

// CORRECCIÓN OBLIGATORIA PARA RENDER: Confiar en el proxy de Render
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_jwt_muy_segura_cambiar_en_produccion';

// ==========================================
// CONFIGURACIÓN DE BASE DE DATOS
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const CODIGO_DIGITOS = '0123456789';
const CODIGO_MAYUSCULAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODIGO_MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz';

function generarCodigoDepartamento() {
  const caracteres = [
    CODIGO_DIGITOS[crypto.randomInt(CODIGO_DIGITOS.length)],
    CODIGO_MAYUSCULAS[crypto.randomInt(CODIGO_MAYUSCULAS.length)],
    CODIGO_MINUSCULAS[crypto.randomInt(CODIGO_MINUSCULAS.length)]
  ];
  const alfabeto = CODIGO_DIGITOS + CODIGO_MAYUSCULAS + CODIGO_MINUSCULAS;

  while (caracteres.length < 7) {
    caracteres.push(alfabeto[crypto.randomInt(alfabeto.length)]);
  }

  for (let indice = caracteres.length - 1; indice > 0; indice -= 1) {
    const indiceAleatorio = crypto.randomInt(indice + 1);
    [caracteres[indice], caracteres[indiceAleatorio]] =
      [caracteres[indiceAleatorio], caracteres[indice]];
  }

  return caracteres.join('');
}

// ==========================================
// CONFIGURACIÓN DE CORS
// ==========================================
const corsOptions = {
  origin(origin, callback) {
    const origenPermitido = !origin ||
      [
        'https://ocid-nine.vercel.app',
        'https://ocid.onrender.com'
      ].includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    callback(null, origenPermitido);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// ==========================================
// CONFIGURACIÓN DE SEGURIDAD Y RATE LIMITING
// ==========================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes desde esta IP, por favor intente más tarde.' }
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, error: 'Demasiados intentos de acceso. Intente nuevamente en 15 minutos.' }
});

app.use(express.json({ limit: '15mb' }));

// ==========================================
// PREPARAR EL ESQUEMA COMPARTIDO
// ==========================================
const migracionEsquema = pool.query(`
  ALTER TABLE archivos
  ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMP NULL;

  ALTER TABLE anuncios
  ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMP NULL;

  ALTER TABLE departamentos
  ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;

  UPDATE departamentos SET eliminado = FALSE WHERE eliminado IS NULL;
  ALTER TABLE departamentos ALTER COLUMN eliminado SET DEFAULT FALSE;
  ALTER TABLE departamentos ALTER COLUMN eliminado SET NOT NULL;

  CREATE TABLE IF NOT EXISTS roles_departamento (
    id SERIAL PRIMARY KEY,
    departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    nombre VARCHAR(60) NOT NULL,
    creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS roles_departamento_nombre_unico_idx
  ON roles_departamento (departamento_id, LOWER(BTRIM(nombre)));
`);

// ==========================================
// COMPROBAR SERVIDOR Y BASE DE DATOS (RAÍZ)
// ==========================================
app.get('/health', (req, res) => {
  res.json({ success: true, mensaje: 'OCID API funcionando correctamente' });
});

app.get('/db-test', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, mensaje: 'Conexión a Neon correcta' });
  } catch (error) {
    console.error('Error de base de datos:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo conectar con la base de datos' });
  }
});

// ==========================================
// RUTAS PÚBLICAS (EXENTAS DE TOKEN)
// ==========================================

// Iniciar sesión
app.post('/login', authLimiter, async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ success: false, error: 'Correo y contraseña son obligatorios' });
  }

  try {
    const resultado = await pool.query(
      `SELECT u.id, u.nombre, u.correo, u.password,
              CASE
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
                WHEN d.id IS NOT NULL AND (u.es_jefe IS TRUE OR d.jefe_id = u.id) THEN 'Jefe de Departamento'
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
              CASE WHEN d.id IS NOT NULL AND (u.es_jefe IS TRUE OR d.jefe_id = u.id) THEN TRUE ELSE FALSE END AS es_jefe,
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
});

// Registrar usuario
app.post('/registro', authLimiter, async (req, res) => {
  const { nombre, correo, password, departamento, departamento_id } = req.body;

  if (!nombre || !correo || !password) {
    return res.status(400).json({ success: false, error: 'Nombre, correo y contraseña son obligatorios' });
  }

  try {
    const existente = await pool.query('SELECT id FROM usuarios WHERE correo = $1 LIMIT 1', [correo.trim()]);
    if (existente.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'Ese correo ya está registrado' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    let departamentoId = null;
    if (departamento_id !== undefined && departamento_id !== null && departamento_id !== '' && !isNaN(Number(departamento_id))) {
      const numId = Number(departamento_id);
      if (numId > 0) {
        const deptoExiste = await pool.query('SELECT id FROM departamentos WHERE id = $1 AND eliminado = FALSE', [numId]);
        if (deptoExiste.rowCount > 0) departamentoId = numId;
      }
    }

    if (!departamentoId && departamento && String(departamento).trim()) {
      const resDepto = await pool.query(
        'SELECT id FROM departamentos WHERE LOWER(nombre) = LOWER($1) AND eliminado = FALSE LIMIT 1',
        [String(departamento).trim()]
      );
      if (resDepto.rowCount > 0) departamentoId = resDepto.rows[0].id;
    }

    const rolFinal = 'Docente';

    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre, correo, password, rol, departamento_id, es_jefe)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING id, nombre, correo, rol, departamento_id, es_jefe`,
      [nombre.trim(), correo.trim(), hashedPassword, rolFinal, departamentoId]
    );

    res.status(201).json({ success: true, usuario: resultado.rows[0] });
  } catch (error) {
    console.error('Error al registrar usuario:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ese correo ya está registrado' });
    }
    res.status(500).json({ success: false, error: 'No se pudo registrar el usuario.' });
  }
});


// ==========================================
// MIDDLEWARE DE AUTENTICACIÓN JWT
// ==========================================
function autenticarJWT(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token de acceso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, usuario) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido o expirado' });
    }
    req.usuario = usuario;
    next();
  });
}

app.use(autenticarJWT);

const ROLES_ADMINISTRATIVOS = new Set(['administrador', 'administrador general']);

function normalizarRol(rol) {
  return String(rol || '').trim().toLocaleLowerCase('es-MX');
}

function esFlagActivo(valor) {
  return valor === true || valor === 't' || valor === 'true';
}

function esRolAdministrador(rol) {
  return ROLES_ADMINISTRATIVOS.has(normalizarRol(rol));
}

async function obtenerPermisosDepartamento(db, usuarioId, departamentoId, bloquear) {
  const bloqueo = bloquear ? 'FOR UPDATE OF d, u' : '';
  const resultado = await db.query(
    `SELECT d.id, d.nombre, d.jefe_id, u.id AS usuario_id, u.rol AS usuario_rol,
            u.es_jefe, u.departamento_id AS usuario_departamento_id
     FROM departamentos d
     JOIN usuarios u ON u.id = $2
     WHERE d.id = $1 AND d.eliminado = FALSE
     ${bloqueo}`,
    [departamentoId, usuarioId]
  );
  if (resultado.rowCount === 0) return null;

  const datos = resultado.rows[0];
  const esJefe = Number(datos.jefe_id) === Number(usuarioId) ||
    (esFlagActivo(datos.es_jefe) && Number(datos.usuario_departamento_id) === Number(departamentoId));
  const esAdministrador = esRolAdministrador(datos.usuario_rol);
  return {
    departamento: datos,
    esJefe,
    esAdministrador,
    puedeGestionar: esJefe || esAdministrador
  };
}


// ==========================================
// RUTAS PROTEGIDAS CON JWT
// ==========================================

// Obtener usuarios / docentes
app.get('/usuarios', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT u.id, u.nombre, u.correo,
              CASE
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
                WHEN d.id IS NOT NULL AND (u.es_jefe IS TRUE OR d.jefe_id = u.id) THEN 'Jefe de Departamento'
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
              CASE WHEN d.id IS NOT NULL AND (u.es_jefe IS TRUE OR d.jefe_id = u.id) THEN TRUE ELSE FALSE END AS es_jefe,
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
});

app.get('/docentes', async (req, res) => {
  try {
    const usuarioActual = await pool.query(
      'SELECT departamento_id FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );
    if (usuarioActual.rowCount === 0) {
      return res.status(401).json({ success: false, error: 'El usuario de la sesión ya no existe' });
    }

    const departamentoId = usuarioActual.rows[0].departamento_id;
    if (!departamentoId) return res.json([]);

    const resultado = await pool.query(
      `SELECT u.id, u.nombre, u.correo, u.departamento_id,
              CASE WHEN u.es_jefe IS TRUE OR d.jefe_id = u.id THEN TRUE ELSE FALSE END AS es_jefe,
              d.nombre AS departamento, d.nombre AS departamento_nombre,
              CASE
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
                WHEN u.es_jefe IS TRUE OR d.jefe_id = u.id THEN 'Jefe de Departamento'
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
});

app.get('/departamentos/:id/roles', async (req, res) => {
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

    const resultado = await pool.query(
      'SELECT nombre FROM roles_departamento WHERE departamento_id = $1 ORDER BY LOWER(nombre), nombre',
      [departamentoId]
    );
    res.json({
      success: true,
      roles: ['Docente', 'Administrador General', ...resultado.rows.map(fila => fila.nombre)]
    });
  } catch (error) {
    console.error('Error al cargar roles del departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los roles' });
  }
});

app.post('/departamentos/:id/roles', async (req, res) => {
  const departamentoId = Number(req.params.id);
  const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
  const nombreNormalizado = normalizarRol(nombre);
  const rolesReservados = new Set([
    'docente', 'jefe', 'jefe de departamento', 'administrador', 'administrador general'
  ]);
  if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0 || !nombre || nombre.length > 60) {
    return res.status(400).json({ success: false, error: 'El nombre del rol debe tener entre 1 y 60 caracteres' });
  }
  if (rolesReservados.has(nombreNormalizado)) {
    return res.status(400).json({ success: false, error: 'Ese nombre está reservado por el sistema' });
  }

  try {
    const acceso = await obtenerPermisosDepartamento(pool, req.usuario.id, departamentoId, false);
    if (!acceso) return res.status(404).json({ success: false, error: 'El departamento no existe' });
    if (!acceso.puedeGestionar) {
      return res.status(403).json({ success: false, error: 'Solo jefes o administradores pueden crear roles' });
    }

    const resultado = await pool.query(
      `INSERT INTO roles_departamento (departamento_id, nombre, creado_por)
       VALUES ($1, $2, $3)
       RETURNING id, nombre`,
      [departamentoId, nombre, req.usuario.id]
    );
    res.status(201).json({ success: true, rol: resultado.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe un rol con ese nombre en este departamento' });
    }
    console.error('Error al crear rol de departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo crear el rol' });
  }
});

app.patch('/usuarios/:id/rol', async (req, res) => {
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
    if (!acceso.puedeGestionar) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'No tienes permiso para asignar roles' });
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

    let rolFinal;
    if (rolNormalizado === 'docente') {
      rolFinal = 'Docente';
    } else if (ROLES_ADMINISTRATIVOS.has(rolNormalizado)) {
      rolFinal = 'Administrador General';
    } else {
      const rolPersonalizado = await client.query(
        `SELECT nombre FROM roles_departamento
         WHERE departamento_id = $1 AND LOWER(BTRIM(nombre)) = LOWER(BTRIM($2))`,
        [departamentoId, rolSolicitado]
      );
      if (rolPersonalizado.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'El rol no existe en este departamento' });
      }
      rolFinal = rolPersonalizado.rows[0].nombre;
    }

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
});

// Actualizar usuario
app.put('/usuarios/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, correo, departamento_id, departamento } = req.body;

  if (!Number.isInteger(id) || id <= 0 || !nombre || !correo) {
    return res.status(400).json({ success: false, error: 'Los datos del perfil no son válidos' });
  }
  if (id !== Number(req.usuario.id)) {
    return res.status(403).json({ success: false, error: 'Solo puedes actualizar tu propio perfil' });
  }

  try {
    let departamentoId = null;
    if (departamento_id !== null && departamento_id !== undefined && departamento_id !== '' && !isNaN(Number(departamento_id))) {
      const numId = Number(departamento_id);
      if (numId > 0) {
        const depto = await pool.query('SELECT id FROM departamentos WHERE id = $1 AND eliminado = FALSE', [numId]);
        if (depto.rowCount > 0) departamentoId = numId;
      }
    }

    if (!departamentoId && departamento && String(departamento).trim()) {
      const deptoNom = await pool.query(
        'SELECT id FROM departamentos WHERE LOWER(nombre) = LOWER($1) AND eliminado = FALSE LIMIT 1',
        [String(departamento).trim()]
      );
      if (deptoNom.rowCount > 0) departamentoId = deptoNom.rows[0].id;
    }

    const resultado = await pool.query(
      `UPDATE usuarios
       SET nombre = $1, correo = $2, departamento_id = $3
       WHERE id = $4
       RETURNING id, nombre, correo, rol, departamento_id, es_jefe`,
      [nombre.trim(), correo.trim(), departamentoId, id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'El usuario no existe' });
    }

    const perfil = await pool.query(
      `SELECT u.id, u.nombre, u.correo,
              CASE
                WHEN LOWER(BTRIM(COALESCE(u.rol, ''))) IN ('administrador', 'administrador general') THEN 'Administrador General'
                WHEN d.id IS NOT NULL AND (u.es_jefe IS TRUE OR d.jefe_id = u.id) THEN 'Jefe de Departamento'
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
              CASE WHEN d.id IS NOT NULL AND (u.es_jefe IS TRUE OR d.jefe_id = u.id) THEN TRUE ELSE FALSE END AS es_jefe,
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
});

// Cambiar contraseña
app.patch('/usuarios/:id/password', async (req, res) => {
  const id = Number(req.params.id);
  const { password_actual, password_nueva } = req.body;

  if (!Number.isInteger(id) || id <= 0 || !password_actual || !password_nueva || password_nueva.length < 6) {
    return res.status(400).json({ success: false, error: 'Datos incompletos o contraseña menor a 6 caracteres' });
  }

  try {
    const usuarioRes = await pool.query('SELECT id, password FROM usuarios WHERE id = $1', [id]);
    if (usuarioRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'El usuario no existe' });
    }

    const usuario = usuarioRes.rows[0];
    const passwordMatch = await bcrypt.compare(password_actual, usuario.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'La contraseña actual no es correcta' });
    }

    const hashedNuevaPassword = await bcrypt.hash(password_nueva, 10);
    await pool.query('UPDATE usuarios SET password = $1 WHERE id = $2', [hashedNuevaPassword, id]);

    res.json({ success: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo cambiar la contraseña' });
  }
});

// Eliminar usuario
app.delete('/usuarios/:id', async (req, res) => {
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
});

// --- ANUNCIOS Y PAPELERA DE ANUNCIOS ---
app.get('/anuncios/papelera', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      `SELECT a.id, a.titulo, a.contenido, a.prioridad, a.fecha, a.fecha_eliminacion,
              d.nombre AS departamento_nombre
       FROM anuncios a
       LEFT JOIN departamentos d ON d.id = a.departamento_id
       WHERE a.eliminado = TRUE AND a.autor_id = $1
       ORDER BY a.fecha_eliminacion DESC NULLS LAST, a.id DESC`,
      [usuarioId]
    );
    res.json({ success: true, anuncios: resultado.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo cargar la papelera de anuncios' });
  }
});

app.get('/anuncios', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT a.id, a.titulo, a.contenido, a.prioridad, a.fecha, a.autor_id, a.departamento_id,
              u.nombre AS autor_nombre, d.nombre AS departamento_nombre
       FROM anuncios a
       LEFT JOIN usuarios u ON u.id = a.autor_id
       LEFT JOIN departamentos d ON d.id = a.departamento_id
       WHERE COALESCE(a.eliminado, FALSE) = FALSE
       ORDER BY a.fecha DESC, a.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los anuncios' });
  }
});

app.post('/anuncios', async (req, res) => {
  const { titulo, contenido, prioridad, autor_id, departamento_id } = req.body;
  if (!titulo || !contenido) return res.status(400).json({ success: false, error: 'Título y contenido obligatorios' });
  
  const autorId = Number(autor_id);
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await cliente.query(
      `INSERT INTO anuncios (titulo, contenido, prioridad, autor_id, departamento_id, fecha, eliminado)
       VALUES ($1, $2, $3, $4, $5, NOW(), FALSE) RETURNING *`,
      [titulo.trim(), contenido.trim(), prioridad || 'Informativo', autorId, departamento_id || null]
    );

    await cliente.query(
      `INSERT INTO notificaciones (usuario_id, anuncio_id, leida, fecha)
       SELECT id, $1, FALSE, NOW() FROM usuarios WHERE id <> $2`,
      [resultado.rows[0].id, autorId]
    );
    await cliente.query('COMMIT');
    res.status(201).json({ success: true, anuncio: resultado.rows[0] });
  } catch (error) {
    await cliente.query('ROLLBACK');
    console.error('Error al publicar anuncio:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo publicar el anuncio' });
  } finally {
    cliente.release();
  }
});

app.put('/anuncios/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { titulo, contenido, prioridad, departamento_id } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE anuncios SET titulo = $1, contenido = $2, prioridad = $3, departamento_id = $4 WHERE id = $5 RETURNING *`,
      [titulo.trim(), contenido.trim(), prioridad || 'Informativo', departamento_id || null, id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El anuncio no existe' });
    res.json({ success: true, anuncio: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo actualizar el anuncio' });
  }
});

app.delete('/anuncios/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      `UPDATE anuncios
       SET eliminado = TRUE, fecha_eliminacion = NOW()
       WHERE id = $1 AND autor_id = $2
       RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El anuncio no existe o no te pertenece' });
    res.json({ success: true, mensaje: 'Anuncio movido a la papelera' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo mover el anuncio a la papelera' });
  }
});

app.put('/anuncios/:id/restaurar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      `UPDATE anuncios
       SET eliminado = FALSE, fecha_eliminacion = NULL
       WHERE id = $1 AND autor_id = $2 AND eliminado = TRUE
       RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Anuncio no encontrado' });
    res.json({ success: true, mensaje: 'Anuncio restaurado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo restaurar el anuncio' });
  }
});

app.delete('/anuncios/:id/permanente', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      'DELETE FROM anuncios WHERE id = $1 AND eliminado = TRUE AND autor_id = $2 RETURNING id',
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Anuncio no encontrado en la papelera' });
    res.json({ success: true, mensaje: 'Anuncio eliminado definitivamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar permanentemente el anuncio' });
  }
});

// ==========================================
// ESTADÍSTICAS
// ==========================================
app.get('/api/stats', async (req, res) => {
  try {
    const [avisos, archivos, docentes, eventos] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM anuncios WHERE eliminado = FALSE"),
      pool.query("SELECT COUNT(*) AS total FROM archivos WHERE eliminado = FALSE"),
      pool.query("SELECT COUNT(*) AS total FROM usuarios WHERE rol ILIKE 'docente'"),
      pool.query("SELECT COUNT(*) AS total FROM tareas WHERE estado = 'Pendiente'")
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
});

// ==========================================
// DEPARTAMENTOS CON CONTEO
// ==========================================
app.get('/api/departamentos-con-conteo', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT d.id, d.nombre,
              COUNT(DISTINCT a.id) FILTER (WHERE COALESCE(a.eliminado, FALSE) = FALSE) AS anuncios_activos,
              COUNT(DISTINCT f.id) FILTER (WHERE COALESCE(f.eliminado, FALSE) = FALSE) AS archivos_activos
       FROM departamentos d
       LEFT JOIN anuncios a ON a.departamento_id = d.id AND COALESCE(a.eliminado, FALSE) = FALSE
       LEFT JOIN archivos f ON f.departamento_id = d.id AND COALESCE(f.eliminado, FALSE) = FALSE
       WHERE d.eliminado = FALSE
       GROUP BY d.id, d.nombre
       ORDER BY d.nombre ASC`
    );
    res.json({ success: true, departamentos: resultado.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los departamentos' });
  }
});

// --- ARCHIVOS Y PAPELERA DE ARCHIVOS ---
app.get('/archivos/papelera', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      `SELECT a.id, a.nombre, a.tipo, a.tamano, a.autor_id, a.departamento_id, a.fecha, a.fecha_eliminacion,
              u.nombre AS autor_nombre, d.nombre AS departamento_nombre
       FROM archivos a
       LEFT JOIN usuarios u ON u.id = a.autor_id
       LEFT JOIN departamentos d ON d.id = a.departamento_id
       WHERE a.eliminado = TRUE AND a.autor_id = $1
       ORDER BY a.fecha_eliminacion DESC NULLS LAST, a.id DESC`,
      [usuarioId]
    );
    res.json({ success: true, archivos: resultado.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo cargar la papelera de archivos' });
  }
});

app.get('/archivos', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT a.id, a.nombre, a.tipo, a.tamano, a.autor_id, a.departamento_id, a.anuncio_id, a.fecha,
              u.nombre AS autor_nombre, d.nombre AS departamento_nombre
       FROM archivos a
       LEFT JOIN usuarios u ON u.id = a.autor_id
       LEFT JOIN departamentos d ON d.id = a.departamento_id
       WHERE COALESCE(a.eliminado, FALSE) = FALSE
       ORDER BY a.fecha DESC, a.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los archivos' });
  }
});

app.post('/archivos', async (req, res) => {
  const { nombre, contenido, tipo, tamano, autor_id, departamento_id } = req.body;
  try {
    const resultado = await pool.query(
      `INSERT INTO archivos (nombre, ruta, tipo, tamano, autor_id, departamento_id, anuncio_id, fecha, eliminado)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW(), FALSE)
       RETURNING id, nombre, tipo, tamano, autor_id, departamento_id, fecha`,
      [nombre.trim(), contenido, tipo, Number(tamano), Number(autor_id), Number(departamento_id)]
    );
    res.status(201).json({ success: true, archivo: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo guardar el archivo' });
  }
});

app.delete('/archivos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      `UPDATE archivos
       SET eliminado = TRUE, fecha_eliminacion = NOW()
       WHERE id = $1 AND autor_id = $2
       RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El archivo no existe o no te pertenece' });
    res.json({ success: true, mensaje: 'Archivo movido a la papelera de reciclaje' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo mover el archivo a la papelera' });
  }
});

app.put('/archivos/:id/restaurar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      `UPDATE archivos
       SET eliminado = FALSE, fecha_eliminacion = NULL
       WHERE id = $1 AND autor_id = $2 AND eliminado = TRUE
       RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    res.json({ success: true, mensaje: 'Documento restaurado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo restaurar el documento' });
  }
});

app.delete('/archivos/:id/permanente', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      'DELETE FROM archivos WHERE id = $1 AND eliminado = TRUE AND autor_id = $2 RETURNING id',
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Archivo no encontrado en la papelera' });
    res.json({ success: true, mensaje: 'Archivo eliminado definitivamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar permanentemente el archivo' });
  }
});

// --- TAREAS ---
app.get('/tareas', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT t.id, t.titulo, t.descripcion, t.asignado, t.fecha, t.horario, t.departamento, t.estado, t.autor_id, t.fecha_creacion,
              u.nombre AS autor_nombre, d.nombre AS autor_departamento
       FROM tareas t
       LEFT JOIN usuarios u ON u.id = t.autor_id
       LEFT JOIN departamentos d ON d.id = u.departamento_id
       ORDER BY t.fecha ASC, t.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar las tareas' });
  }
});

app.post('/tareas', async (req, res) => {
  const { titulo, descripcion, asignado, fecha, horario, departamento, estado, autor_id } = req.body;
  if (!titulo || !fecha) return res.status(400).json({ success: false, error: 'El título y la fecha son obligatorios' });

  let autorId = autor_id ? Number(autor_id) : null;
  try {
    const resultado = await pool.query(
      `INSERT INTO tareas (titulo, descripcion, asignado, fecha, horario, departamento, estado, autor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [titulo.trim(), descripcion ? descripcion.trim() : null, asignado ? asignado.trim() : 'General / Sin asignar', fecha, horario || 'Horario a confirmar', departamento || 'General', estado || 'Pendiente', autorId]
    );
    res.status(201).json({ success: true, tarea: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo guardar la tarea' });
  }
});

app.put('/tareas/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { titulo, descripcion, asignado, fecha, horario, departamento, estado } = req.body;
  if (!titulo || !fecha) return res.status(400).json({ success: false, error: 'El título y la fecha son obligatorios' });

  try {
    const resultado = await pool.query(
      `UPDATE tareas SET titulo = $1, descripcion = $2, asignado = $3, fecha = $4, horario = $5, departamento = $6, estado = $7 WHERE id = $8 RETURNING *`,
      [titulo.trim(), descripcion ? descripcion.trim() : null, asignado ? asignado.trim() : 'General / Sin asignar', fecha, horario || 'Horario a confirmar', departamento || 'General', estado || 'Pendiente', id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'La tarea no existe' });
    res.json({ success: true, tarea: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo actualizar la tarea' });
  }
});

app.delete('/tareas/:id', async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM tareas WHERE id = $1 RETURNING id', [Number(req.params.id)]);
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'La tarea no existe' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar la tarea' });
  }
});

// --- DEPARTAMENTOS ---
app.get('/departamentos', async (req, res) => {
  try {
    const resultado = await pool.query(
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
});

app.get('/departamentos/codigo/:codigo', async (req, res) => {
  const { codigo } = req.params;
  try {
    const resultado = await pool.query(
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
});

app.post('/departamentos', async (req, res) => {
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
        `INSERT INTO departamentos (id, nombre, descripcion, jefe_id, codigo)
         VALUES (COALESCE((SELECT MAX(id) FROM departamentos), 0) + 1, $1, $2, $3, $4)
         RETURNING id, nombre, descripcion, jefe_id, codigo`,
        [nombreFinal, descripcionFinal, jefeId, codigoFinal]
      );
      departamento = resultado.rows[0];
    }

    if (!departamento) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;
      return res.status(503).json({ success: false, error: 'No se pudo generar un código único. Intenta de nuevo.' });
    }

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
});

app.put('/departamentos/:id', async (req, res) => {
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

    const resultado = await pool.query(
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
    res.status(500).json({ success: false, error: 'No se pudo actualizar el departamento' });
  }
});

app.patch('/departamentos/:id/transferir-jefatura', async (req, res) => {
  const departamentoId = Number(req.params.id);
  const nuevoJefeId = Number(req.body.nuevo_jefe_id);
  const usuarioId = Number(req.usuario && req.usuario.id);
  if (!Number.isSafeInteger(departamentoId) || departamentoId <= 0 ||
      !Number.isSafeInteger(nuevoJefeId) || nuevoJefeId <= 0) {
    return res.status(400).json({ success: false, error: 'Selecciona un docente válido' });
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
      `SELECT id, rol FROM usuarios
       WHERE id = $1 AND departamento_id = $2
       FOR UPDATE`,
      [nuevoJefeId, departamentoId]
    );
    if (candidato.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'El nuevo jefe debe pertenecer al mismo departamento' });
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
    const usuarioActualizado = await client.query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, u.es_jefe
       FROM usuarios u WHERE u.id = $1`,
      [usuarioId]
    );
    await client.query('COMMIT');
    res.json({
      success: true,
      departamento: departamentoActualizado.rows[0],
      usuario: usuarioActualizado.rows[0]
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al transferir la jefatura:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo transferir la jefatura' });
  } finally {
    if (client) client.release();
  }
});

app.delete('/departamentos/:id', async (req, res) => {
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
    if (req.body.confirmacion !== 'sí' || req.body.nombre_departamento !== acceso.departamento.nombre) {
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
});

// --- NOTIFICACIONES ---
app.get('/notificaciones', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const usuarioResult = await pool.query(
      `SELECT u.departamento_id, NULLIF(BTRIM(d.nombre), '') AS departamento_nombre
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id AND d.eliminado = FALSE
       WHERE u.id = $1`,
      [usuarioId]
    );
    if (usuarioResult.rowCount === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const departamentoNombre = usuarioResult.rows[0].departamento_nombre || null;
    const correoUsuario = typeof req.usuario.correo === 'string' ? req.usuario.correo.trim() : '';

    const anunciosResult = await pool.query(
      `SELECT n.id, n.fecha, n.leida, 'anuncio' AS tipo, a.titulo, a.contenido, a.departamento_id
       FROM notificaciones n LEFT JOIN anuncios a ON a.id = n.anuncio_id WHERE n.usuario_id = $1 ORDER BY n.fecha DESC`,
      [usuarioId]
    );

    const tareasResult = await pool.query(
      `SELECT t.id, t.fecha_creacion AS fecha, FALSE AS leida, 'tarea' AS tipo, t.titulo, t.descripcion AS contenido, t.departamento AS departamento_nombre
       FROM tareas t
       WHERE t.estado = 'Pendiente'
         AND (
           ($1::text IS NOT NULL AND NULLIF(BTRIM(t.departamento), '') = $1::text)
           OR ($2::text <> '' AND t.asignado ILIKE '%' || $2::text || '%')
         )
       ORDER BY t.fecha_creacion DESC`,
      [departamentoNombre, correoUsuario]
    );

    const notificaciones = [
      ...anunciosResult.rows.map(n => ({ ...n, leida: Boolean(n.leida) })),
      ...tareasResult.rows
    ].sort((a, b) => new Date(b.fecha || b.fecha_creacion) - new Date(a.fecha || a.fecha_creacion));

    res.json({ success: true, notificaciones });
  } catch (error) {
    console.error('Error al cargar notificaciones:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar las notificaciones' });
  }
});

app.put('/notificaciones/:id/leer', async (req, res) => {
  try {
    const resultado = await pool.query(
      'UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [Number(req.params.id), req.usuario.id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Notificación no encontrada' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo marcar como leída' });
  }
});

app.delete('/notificaciones/:id', async (req, res) => {
  try {
    const resultado = await pool.query(
      'DELETE FROM notificaciones WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [Number(req.params.id), req.usuario.id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Notificación no encontrada' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar la notificación' });
  }
});

// Manejo de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

migracionEsquema
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor OCID funcionando en el puerto ${PORT}`);
    });
  })
  .catch(error => {
    console.error('No se pudo preparar el esquema de base de datos:', error.message);
    process.exit(1);
  });