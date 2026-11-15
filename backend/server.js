require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_jwt_muy_segura_cambiar_en_produccion';

// ==========================================
// CONFIGURACIÓN DE SEGURIDAD (PRODUCCIÓN)
// ==========================================

// 1. Helmet para proteger cabeceras HTTP
app.use(helmet());

// 2. Rate Limiter general para prevenir ataques DDoS / fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Límite de 100 peticiones por IP por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes desde esta IP, por favor intente más tarde.' }
});
app.use(limiter);

// 3. Rate Limiter estricto para rutas de Autenticación (Login / Registro)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Máximo 10 intentos por IP en 15 minutos
  message: { success: false, error: 'Demasiados intentos de acceso. Intente nuevamente en 15 minutos.' }
});

app.use(cors({
  origin(origin, callback) {
    const origenPermitido = !origin ||
      [
        'https://ocid-iota.vercel.app',
        'https://ocid.onrender.com'
      ].includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    callback(null, origenPermitido);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '15mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// COMPROBAR SERVIDOR
app.get('/health', (req, res) => {
  res.json({
    success: true,
    mensaje: 'OCID API funcionando'
  });
});

// COMPROBAR BASE DE DATOS
app.get('/db-test', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      success: true,
      mensaje: 'Conexión a Neon correcta'
    });
  } catch (error) {
    console.error('Error de base de datos:', {
      name: error.name,
      code: error.code,
      message: error.message || 'Sin detalle del controlador PostgreSQL'
    });

    res.status(500).json({
      success: false,
      error: 'No se pudo conectar con la base de datos'
    });
  }
});

// ==========================================
// INICIAR SESIÓN (CON BCRYPT Y JWT)
// ==========================================
app.post('/login', authLimiter, async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({
      success: false,
      error: 'Correo y contraseña son obligatorios'
    });
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
      return res.status(401).json({
        success: false,
        error: 'Correo o contraseña incorrectos'
      });
    }

    const usuario = resultado.rows[0];

    // Verificar contraseña con bcrypt
    const passwordMatch = await bcrypt.compare(password, usuario.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Correo o contraseña incorrectos'
      });
    }

    // Generar Token JWT (expira en 8 horas)
    const token = jwt.sign(
      { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Ocultar contraseña antes de enviarla al cliente
    delete usuario.password;

    res.json({
      success: true,
      token,
      usuario
    });

  } catch (error) {
    console.error('Error en login:', error.message);

    res.status(500).json({
      success: false,
      error: 'Error al iniciar sesión'
    });
  }
});

// OBTENER USUARIOS / DOCENTES
app.get('/login', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         u.id,
         u.nombre,
         u.correo,
         u.rol,
         u.departamento_id,
         u.es_jefe,
         d.nombre AS departamento_nombre
       FROM usuarios u
       LEFT JOIN departamentos d
         ON d.id = u.departamento_id
       ORDER BY u.id DESC`
    );

    res.json(resultado.rows);

  } catch (error) {
    console.error('Error al consultar usuarios:', error.message);

    res.status(500).json({
      success: false,
      error: 'No se pudieron cargar los usuarios'
    });
  }
});

// ACTUALIZAR PERFIL / DEPARTAMENTO / ROL DE USUARIO
app.put('/usuarios/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, correo, departamento_id, departamento, rol } = req.body;

  if (!Number.isInteger(id) || id <= 0 ||
    typeof nombre !== 'string' || !nombre.trim() ||
    typeof correo !== 'string' || !correo.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Los datos del perfil no son válidos'
    });
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

// CAMBIAR CONTRASEÑA (CON BCRYPT)
app.patch('/usuarios/:id/password', async (req, res) => {
  const id = Number(req.params.id);
  const { password_actual, password_nueva } = req.body;

  if (!Number.isInteger(id) || id <= 0 || !password_actual ||
    typeof password_nueva !== 'string' || password_nueva.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Ingresa la contraseña actual y una nueva contraseña de al menos 6 caracteres'
    });
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

    const saltRounds = 10;
    const hashedNuevaPassword = await bcrypt.hash(password_nueva, saltRounds);

    await pool.query(
      `UPDATE usuarios SET password = $1 WHERE id = $2`,
      [hashedNuevaPassword, id]
    );

    res.json({ success: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo cambiar la contraseña' });
  }
});

// REGISTRAR USUARIO / DOCENTE (HASHEANDO CONTRASEÑA)
app.post('/registro', authLimiter, async (req, res) => {
  const { nombre, correo, password, rol, departamento, departamento_id } = req.body;

  if (!nombre || !correo || !password) {
    return res.status(400).json({
      success: false,
      error: 'Nombre, correo y contraseña son obligatorios'
    });
  }

  try {
    const existente = await pool.query(
      'SELECT id FROM usuarios WHERE correo = $1 LIMIT 1',
      [correo.trim()]
    );

    if (existente.rowCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'Ese correo ya está registrado'
      });
    }

    // Cifrar contraseña con bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    let departamentoId = null;
    
    if (departamento_id !== undefined && departamento_id !== null && departamento_id !== '' && !isNaN(Number(departamento_id))) {
      const numId = Number(departamento_id);
      if (numId > 0) {
        const deptoExiste = await pool.query('SELECT id FROM departamentos WHERE id = $1', [numId]);
        if (deptoExiste.rowCount > 0) {
          departamentoId = numId;
        }
      }
    }

    if (!departamentoId && departamento && String(departamento).trim()) {
      const resDepto = await pool.query(
        'SELECT id FROM departamentos WHERE LOWER(nombre) = LOWER($1) LIMIT 1',
        [String(departamento).trim()]
      );
      if (resDepto.rowCount > 0) {
        departamentoId = resDepto.rows[0].id;
      }
    }

    const rolFinal = rol || 'Docente';
    const esJefeBool = rolFinal.toLowerCase() === 'jefe';

    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre, correo, password, rol, departamento_id, es_jefe)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nombre, correo, rol, departamento_id, es_jefe`,
      [
        nombre.trim(),
        correo.trim(),
        hashedPassword,
        rolFinal,
        departamentoId,
        esJefeBool
      ]
    );

    res.status(201).json({
      success: true,
      usuario: resultado.rows[0]
    });

  } catch (error) {
    console.error('Error al registrar usuario:', error.message);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Ese correo ya está registrado'
      });
    }

    res.status(500).json({
      success: false,
      error: 'No se pudo registrar el usuario.'
    });
  }
});

// ELIMINAR USUARIO
app.delete('/login/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
  }

  let client;
  let transaccionIniciada = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transaccionIniciada = true;

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
    if (client && transaccionIniciada) await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: 'No se pudo eliminar el usuario' });
  } finally {
    if (client) client.release();
  }
});

// OBTENER ANUNCIOS
app.get('/anuncios', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         a.id, a.titulo, a.contenido, a.prioridad, a.fecha, a.autor_id, a.departamento_id,
         u.nombre AS autor_nombre, d.nombre AS departamento_nombre
       FROM anuncios a
       LEFT JOIN usuarios u ON u.id = a.autor_id
       LEFT JOIN departamentos d ON d.id = a.departamento_id
       ORDER BY a.fecha DESC, a.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los anuncios' });
  }
});

// PUBLICAR ANUNCIO
app.post('/anuncios', async (req, res) => {
  const { titulo, contenido, prioridad, autor_id, departamento_id } = req.body;
  if (!titulo || !contenido) return res.status(400).json({ success: false, error: 'Título y contenido obligatorios' });
  
  const autorId = Number(autor_id);
  try {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await cliente.query(
        `INSERT INTO anuncios (titulo, contenido, prioridad, autor_id, departamento_id, fecha)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [titulo.trim(), contenido.trim(), prioridad || 'Informativo', autorId, departamento_id || null]
      );

      await cliente.query(
        `INSERT INTO notificaciones (usuario_id, anuncio_id, leida, fecha)
         SELECT id, $1, FALSE, NOW() FROM usuarios WHERE id <> $2`,
        [resultado.rows[0].id, autorId]
      );
      await cliente.query('COMMIT');
      res.status(201).json({ success: true, anuncio: resultado.rows[0] });
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw err;
    } finally {
      cliente.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo publicar el anuncio' });
  }
});

// ACTUALIZAR ANUNCIO
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

// OBTENER ARCHIVOS
app.get('/archivos', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT a.id, a.nombre, a.tipo, a.tamano, a.autor_id, a.departamento_id, a.anuncio_id, a.fecha,
              u.nombre AS autor_nombre, d.nombre AS departamento_nombre
       FROM archivos a
       LEFT JOIN usuarios u ON u.id = a.autor_id
       LEFT JOIN departamentos d ON d.id = a.departamento_id
       ORDER BY a.fecha DESC, a.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudieron cargar los archivos' });
  }
});

// SUBIR ARCHIVO
app.post('/archivos', async (req, res) => {
  const { nombre, contenido, tipo, tamano, autor_id, departamento_id } = req.body;
  try {
    const resultado = await pool.query(
      `INSERT INTO archivos (nombre, ruta, tipo, tamano, autor_id, departamento_id, anuncio_id, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW()) RETURNING id, nombre, tipo, tamano, autor_id, departamento_id, fecha`,
      [nombre.trim(), contenido, tipo, Number(tamano), Number(autor_id), Number(departamento_id)]
    );
    res.status(201).json({ success: true, archivo: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo guardar el archivo' });
  }
});

// ELIMINAR ARCHIVO
app.delete('/archivos/:id', async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM archivos WHERE id = $1 RETURNING id', [Number(req.params.id)]);
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'El archivo no existe' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar el archivo' });
  }
});

// ==========================================
// SECCIÓN DE TAREAS
// ==========================================

// OBTENER TAREAS
app.get('/tareas', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         t.id,
         t.titulo,
         t.descripcion,
         t.asignado,
         t.fecha,
         t.horario,
         t.departamento,
         t.estado,
         t.autor_id,
         t.fecha_creacion,
         u.nombre AS autor_nombre,
         d.nombre AS autor_departamento
       FROM tareas t
       LEFT JOIN usuarios u ON u.id = t.autor_id
       LEFT JOIN departamentos d ON d.id = u.departamento_id
       ORDER BY t.fecha ASC, t.id DESC`
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al consultar tareas:', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudieron cargar las tareas'
    });
  }
});

// CREAR TAREA
app.post('/tareas', async (req, res) => {
  const { titulo, descripcion, asignado, fecha, horario, departamento, estado, autor_id } = req.body;

  if (!titulo || !fecha) {
    return res.status(400).json({
      success: false,
      error: 'El título y la fecha son obligatorios'
    });
  }

  let autorId = autor_id ? Number(autor_id) : null;

  try {
    const resultado = await pool.query(
      `INSERT INTO tareas (titulo, descripcion, asignado, fecha, horario, departamento, estado, autor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, titulo, descripcion, asignado, fecha, horario, departamento, estado, autor_id, fecha_creacion`,
      [
        titulo.trim(),
        descripcion ? descripcion.trim() : null,
        asignado ? asignado.trim() : 'General / Sin asignar',
        fecha,
        horario || 'Horario a confirmar',
        departamento || 'General',
        estado || 'Pendiente',
        autorId
      ]
    );

    res.status(201).json({
      success: true,
      tarea: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al crear tarea:', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo guardar la tarea'
    });
  }
});

// ACTUALIZAR TAREA
app.put('/tareas/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { titulo, descripcion, asignado, fecha, horario, departamento, estado } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'ID de tarea inválido' });
  }

  if (!titulo || !fecha) {
    return res.status(400).json({ success: false, error: 'El título y la fecha son obligatorios' });
  }

  try {
    const resultado = await pool.query(
      `UPDATE tareas
       SET titulo = $1, descripcion = $2, asignado = $3, fecha = $4, horario = $5, departamento = $6, estado = $7
       WHERE id = $8
       RETURNING *`,
      [
        titulo.trim(),
        descripcion ? descripcion.trim() : null,
        asignado ? asignado.trim() : 'General / Sin asignar',
        fecha,
        horario || 'Horario a confirmar',
        departamento || 'General',
        estado || 'Pendiente',
        id
      ]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'La tarea no existe' });
    }

    res.json({
      success: true,
      tarea: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar tarea:', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo actualizar la tarea'
    });
  }
});

// ELIMINAR TAREA
app.delete('/tareas/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const resultado = await pool.query('DELETE FROM tareas WHERE id = $1 RETURNING id', [id]);
    if (resultado.rowCount === 0) return res.status(404).json({ success: false, error: 'La tarea no existe' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo eliminar la tarea' });
  }
});

// OBTENER NOTIFICACIONES
app.get('/notificaciones', async (req, res) => {
  const usuarioId = Number(req.query.usuario_id);
  try {
    const resultado = await pool.query(
      `SELECT n.id, n.usuario_id, n.anuncio_id, n.leida, n.fecha, a.titulo AS anuncio_titulo
       FROM notificaciones n
       LEFT JOIN anuncios a ON a.id = n.anuncio_id
       WHERE n.usuario_id = $1 ORDER BY n.fecha DESC`,
      [usuarioId]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al cargar notificaciones' });
  }
});

// ==========================================
// SECCIÓN DE DEPARTAMENTOS
// ==========================================

// OBTENER TODOS LOS DEPARTAMENTOS
app.get('/departamentos', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT d.id, d.nombre, d.descripcion, d.jefe_id, d.codigo, u.nombre AS nombre_jefe
       FROM departamentos d
       LEFT JOIN usuarios u ON u.id = d.jefe_id
       ORDER BY d.id ASC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al cargar departamentos' });
  }
});

// BUSCAR DEPARTAMENTO POR CÓDIGO
app.get('/departamentos/codigo/:codigo', async (req, res) => {
  const { codigo } = req.params;
  if (!codigo || !codigo.trim()) {
    return res.status(400).json({ success: false, error: 'El código es obligatorio' });
  }

  try {
    const resultado = await pool.query(
      `SELECT d.id, d.nombre, d.descripcion, d.jefe_id, d.codigo, u.nombre AS nombre_jefe
       FROM departamentos d
       LEFT JOIN usuarios u ON u.id = d.jefe_id
       WHERE LOWER(d.codigo) = LOWER($1)
       LIMIT 1`,
      [codigo.trim()]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Departamento no encontrado' });
    }

    res.json({ success: true, departamento: resultado.rows[0] });
  } catch (error) {
    console.error('Error al buscar departamento por código:', error.message);
    res.status(500).json({ success: false, error: 'Error al buscar el departamento' });
  }
});

// CREAR DEPARTAMENTO
app.post('/departamentos', async (req, res) => {
  const { nombre, descripcion, jefe_id, codigo } = req.body;

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return res.status(400).json({
      success: false,
      error: 'El nombre del departamento es obligatorio'
    });
  }

  const codigoFinal = codigo ? String(codigo).trim() : null;
  const jefeId = (jefe_id !== null && jefe_id !== undefined && jefe_id !== '') ? Number(jefe_id) : null;

  try {
    if (codigoFinal) {
      const existeCodigo = await pool.query(
        'SELECT id FROM departamentos WHERE LOWER(codigo) = LOWER($1) LIMIT 1',
        [codigoFinal]
      );
      if (existeCodigo.rowCount > 0) {
        return res.status(409).json({
          success: false,
          error: 'Ya existe un departamento con ese código'
        });
      }
    }

    const resultado = await pool.query(
      `INSERT INTO departamentos (id, nombre, descripcion, jefe_id, codigo)
       VALUES (
         COALESCE((SELECT MAX(id) FROM departamentos), 0) + 1,
         $1, $2, $3, $4
       )
       RETURNING id, nombre, descripcion, jefe_id, codigo`,
      [nombre.trim(), descripcion ? descripcion.trim() : null, jefeId, codigoFinal]
    );

    try {
      await pool.query(`SELECT setval(pg_get_serial_sequence('departamentos', 'id'), (SELECT MAX(id) FROM departamentos))`);
    } catch (e) {
      // Ignorar si la tabla no posee secuencia serial asociada
    }

    res.status(201).json({
      success: true,
      departamento: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al crear departamento:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Ya existe un departamento registrado con esos datos'
      });
    }
    res.status(500).json({
      success: false,
      error: 'No se pudo crear el departamento'
    });
  }
});

// ACTUALIZAR DEPARTAMENTO
app.put('/departamentos/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, descripcion, jefe_id, codigo } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'ID de departamento inválido' });
  }

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return res.status(400).json({ success: false, error: 'El nombre del departamento es obligatorio' });
  }

  const codigoFinal = codigo ? String(codigo).trim() : null;
  const jefeId = (jefe_id !== null && jefe_id !== undefined && jefe_id !== '') ? Number(jefe_id) : null;

  try {
    if (codigoFinal) {
      const existeCodigo = await pool.query(
        'SELECT id FROM departamentos WHERE LOWER(codigo) = LOWER($1) AND id <> $2 LIMIT 1',
        [codigoFinal, id]
      );
      if (existeCodigo.rowCount > 0) {
        return res.status(409).json({ success: false, error: 'Ya existe otro departamento con ese código' });
      }
    }

    const resultado = await pool.query(
      `UPDATE departamentos
       SET nombre = $1, descripcion = $2, jefe_id = $3, codigo = $4
       WHERE id = $5
       RETURNING id, nombre, descripcion, jefe_id, codigo`,
      [nombre.trim(), descripcion ? descripcion.trim() : null, jefeId, codigoFinal, id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }

    res.json({ success: true, departamento: resultado.rows[0] });
  } catch (error) {
    console.error('Error al actualizar departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo actualizar el departamento' });
  }
});

// ELIMINAR DEPARTAMENTO
app.delete('/departamentos/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'ID de departamento inválido' });
  }

  try {
    const resultado = await pool.query('DELETE FROM departamentos WHERE id = $1 RETURNING id', [id]);
    if (resultado.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'El departamento no existe' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar departamento:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo eliminar el departamento' });
  }
});

// OBTENER DOCENTES
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

// MANEJO DE RUTAS NO ENCONTRADAS (404)
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Servidor OCID funcionando en el puerto ${PORT}`);
});