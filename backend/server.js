require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_jwt_muy_segura_cambiar_en_produccion';

// ==========================================
// CONFIGURACIÓN DE BASE DE DATOS
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==========================================
// CONFIGURACIÓN DE SEGURIDAD (PRODUCCIÓN)
// ==========================================
app.use(helmet());
app.use(cookieParser());

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

app.use(cors({
  origin(origin, callback) {
    const origenPermitido = !origin ||
      [
        'https://ocid-nine.vercel.app',
        'https://ocid.onrender.com'
      ].includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); // <- Esto permite cualquier puerto local (como el 5500)

    callback(null, origenPermitido);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Importante para responder correctamente a las peticiones preflight (OPTIONS)
app.options('*', cors());

app.use(express.json({ limit: '15mb' }));

// ==========================================
// MIGRACIÓN AUTOMÁTICA PARA PAPELERA (ARCHIVOS Y ANUNCIOS)
// ==========================================
pool.query(`
  ALTER TABLE archivos
  ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMP NULL;

  ALTER TABLE anuncios
  ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMP NULL;
`).catch(err => console.error('Aviso migración papelera:', err.message));

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
// MIDDLEWARE DE AUTENTICACIÓN JWT
// ==========================================
function autenticarJWT(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token_ocid) {
    token = req.cookies.token_ocid;
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

// ==========================================
// RUTAS PÚBLICAS
// ==========================================

// Iniciar sesión
app.post('/login', authLimiter, async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ success: false, error: 'Correo y contraseña son obligatorios' });
  }

  try {
    const resultado = await pool.query(
      `SELECT id, nombre, correo, password, rol, departamento_id, es_jefe
       FROM usuarios
       WHERE correo = $1
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

    const esProduccion = process.env.NODE_ENV === 'production';

    res.cookie('token_ocid', token, {
      httpOnly: true,
      secure: esProduccion,
      sameSite: esProduccion ? 'Strict' : 'Lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({ success: true, token, usuario });
  } catch (error) {
    console.error('Error en login:', error.message);
    res.status(500).json({ success: false, error: 'Error al iniciar sesión' });
  }
});

// Registrar usuario
app.post('/registro', authLimiter, async (req, res) => {
  const { nombre, correo, password, rol, departamento, departamento_id } = req.body;

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
        const deptoExiste = await pool.query('SELECT id FROM departamentos WHERE id = $1', [numId]);
        if (deptoExiste.rowCount > 0) departamentoId = numId;
      }
    }

    if (!departamentoId && departamento && String(departamento).trim()) {
      const resDepto = await pool.query(
        'SELECT id FROM departamentos WHERE LOWER(nombre) = LOWER($1) LIMIT 1',
        [String(departamento).trim()]
      );
      if (resDepto.rowCount > 0) departamentoId = resDepto.rows[0].id;
    }

    const rolFinal = rol || 'Docente';
    const esJefeBool = rolFinal.toLowerCase() === 'jefe';

    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre, correo, password, rol, departamento_id, es_jefe)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nombre, correo, rol, departamento_id, es_jefe`,
      [nombre.trim(), correo.trim(), hashedPassword, rolFinal, departamentoId, esJefeBool]
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
// RUTAS PROTEGIDAS CON JWT
// ==========================================
app.use(autenticarJWT);

// Obtener usuarios / docentes
app.get('/usuarios', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, u.es_jefe, d.nombre AS departamento_nombre
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id
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
    const resultado = await pool.query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, u.es_jefe,
              d.nombre AS departamento, d.nombre AS departamento_nombre
       FROM usuarios u LEFT JOIN departamentos d ON d.id = u.departamento_id ORDER BY u.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al cargar docentes' });
  }
});

// Actualizar usuario
app.put('/usuarios/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, correo, departamento_id, departamento, rol } = req.body;

  if (!Number.isInteger(id) || id <= 0 || !nombre || !correo) {
    return res.status(400).json({ success: false, error: 'Los datos del perfil no son válidos' });
  }

  try {
    let departamentoId = null;
    if (departamento_id !== null && departamento_id !== undefined && departamento_id !== '' && !isNaN(Number(departamento_id))) {
      const numId = Number(departamento_id);
      if (numId > 0) {
        const depto = await pool.query('SELECT id FROM departamentos WHERE id = $1', [numId]);
        if (depto.rowCount > 0) departamentoId = numId;
      }
    }

    if (!departamentoId && departamento && String(departamento).trim()) {
      const deptoNom = await pool.query(
        'SELECT id FROM departamentos WHERE LOWER(nombre) = LOWER($1) LIMIT 1',
        [String(departamento).trim()]
      );
      if (deptoNom.rowCount > 0) departamentoId = deptoNom.rows[0].id;
    }

    const rolUsuario = rol ? String(rol).trim() : 'Docente';
    const esJefeBool = rolUsuario.toLowerCase() === 'jefe';

    const resultado = await pool.query(
      `UPDATE usuarios
       SET nombre = $1, correo = $2, departamento_id = $3, rol = $4, es_jefe = $5
       WHERE id = $6
       RETURNING id, nombre, correo, rol, departamento_id, es_jefe`,
      [nombre.trim(), correo.trim(), departamentoId, rolUsuario, esJefeBool, id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'El usuario no existe' });
    }

    res.json({ success: true, usuario: resultado.rows[0] });
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

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const usuarioExiste = await client.query('SELECT id FROM usuarios WHERE id = $1 FOR UPDATE', [id]);
    if (usuarioExiste.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'El usuario no existe' });
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

// --- ANUNCIOS Y PAPELERA DE ANUNCIOS (SOLO TUYOS) ---
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

// Borrado lógico de anuncios (Solo si te pertenecen)
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

// Restaurar anuncio propio
app.put('/anuncios/:id/restaurar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      `UPDATE anuncios
       SET eliminado = FALSE, fecha_eliminacion = NULL
       WHERE id = $1 AND autor_id = $2
       RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Anuncio no encontrado' });
    res.json({ success: true, mensaje: 'Anuncio restaurado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo restaurar el anuncio' });
  }
});

// Eliminar anuncio permanentemente
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
// ESTADÍSTICAS PARA PANEL DE INICIO
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
// DEPARTAMENTOS CON CONTEO DE ANUNCIOS ACTIVOS
// ==========================================
app.get('/api/departamentos-con-conteo', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT d.id, d.nombre,
              COUNT(a.id) FILTER (WHERE a.eliminado = FALSE) AS anuncios_activos
       FROM departamentos d
       LEFT JOIN anuncios a ON a.departamento_id = d.id AND a.eliminado = FALSE
       GROUP BY d.id, d.nombre
       ORDER BY d.nombre ASC`
    );
    res.json({ success: true, departamentos: resultado.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los departamentos' });
  }
});

// --- ARCHIVOS Y PAPELERA DE ARCHIVOS (SOLO TUYOS) ---
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

// Borrado lógico (Solo si te pertenece)
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

// Restaurar archivo propio
app.put('/archivos/:id/restaurar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const resultado = await pool.query(
      `UPDATE archivos
       SET eliminado = FALSE, fecha_eliminacion = NULL
       WHERE id = $1 AND autor_id = $2
       RETURNING id`,
      [id, usuarioId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    res.json({ success: true, mensaje: 'Documento restaurado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo restaurar el documento' });
  }
});

// Eliminación permanente
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
       FROM departamentos d LEFT JOIN usuarios u ON u.id = d.jefe_id ORDER BY d.id ASC`
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
       FROM departamentos d LEFT JOIN usuarios u ON u.id = d.jefe_id WHERE LOWER(d.codigo) = LOWER($1) LIMIT 1`,
      [codigo.trim()]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'Departamento no encontrado' });
    res.json({ success: true, departamento: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al buscar el departamento' });
  }
});

app.post('/departamentos', async (req, res) => {
  const { nombre, descripcion, jefe_id, codigo } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, error: 'El nombre del departamento es obligatorio' });

  const codigoFinal = codigo ? String(codigo).trim() : null;
  const jefeId = (jefe_id !== null && jefe_id !== undefined && jefe_id !== '') ? Number(jefe_id) : null;

  try {
    const resultado = await pool.query(
      `INSERT INTO departamentos (id, nombre, descripcion, jefe_id, codigo)
       VALUES (COALESCE((SELECT MAX(id) FROM departamentos), 0) + 1, $1, $2, $3, $4)
       RETURNING id, nombre, descripcion, jefe_id, codigo`,
      [nombre.trim(), descripcion ? descripcion.trim() : null, jefeId, codigoFinal]
    );
    res.status(201).json({ success: true, departamento: resultado.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un departamento con ese código o datos' });
    res.status(500).json({ success: false, error: 'No se pudo crear el departamento' });
  }
});

app.put('/departamentos/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, descripcion, jefe_id, codigo } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });

  try {
    const resultado = await pool.query(
      `UPDATE departamentos SET nombre = $1, descripcion = $2, jefe_id = $3, codigo = $4 WHERE id = $5 RETURNING *`,
      [nombre.trim(), descripcion ? descripcion.trim() : null, jefe_id ? Number(jefe_id) : null, codigo ? String(codigo).trim() : null, id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El departamento no existe' });
    res.json({ success: true, departamento: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo actualizar el departamento' });
  }
});

app.delete('/departamentos/:id', async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM departamentos WHERE id = $1 RETURNING id', [Number(req.params.id)]);
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El departamento no existe' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar el departamento' });
  }
});

// --- NOTIFICACIONES ---
app.get('/notificaciones', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const usuarioResult = await pool.query(
      `SELECT u.departamento_id, d.nombre AS departamento_nombre FROM usuarios u LEFT JOIN departamentos d ON d.id = u.departamento_id WHERE u.id = $1`,
      [usuarioId]
    );
    if (usuarioResult.rowCount === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const departamentoNombre = usuarioResult.rows[0].departamento_nombre || null;
    const correoUsuario = req.usuario.correo || '';

    const anunciosResult = await pool.query(
      `SELECT n.id, n.fecha, n.leida, 'anuncio' AS tipo, a.titulo, a.contenido, a.departamento_id
       FROM notificaciones n LEFT JOIN anuncios a ON a.id = n.anuncio_id WHERE n.usuario_id = $1 ORDER BY n.fecha DESC`,
      [usuarioId]
    );

    const tareasResult = await pool.query(
      `SELECT t.id, t.fecha_creacion AS fecha, FALSE AS leida, 'tarea' AS tipo, t.titulo, t.descripcion AS contenido, t.departamento AS departamento_nombre
       FROM tareas t WHERE t.estado = 'Pendiente' AND (($1 IS NOT NULL AND t.departamento = $1) OR t.asignado ILIKE $2) ORDER BY t.fecha_creacion DESC`,
      [departamentoNombre, `%${correoUsuario}%`]
    );

    const notificaciones = [
      ...anunciosResult.rows.map(n => ({ ...n, leida: Boolean(n.leida) })),
      ...tareasResult.rows
    ].sort((a, b) => new Date(b.fecha || b.fecha_creacion) - new Date(a.fecha || a.fecha_creacion));

    res.json({ success: true, notificaciones });
  } catch (error) {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor OCID funcionando en el puerto ${PORT}`);
});