/* Modelo: consultas reutilizables de contexto, permisos y acceso. */
const { pool } = require('../config/database');
const { esFlagActivo, esRolAdministrador, normalizarRol } = require('./utils');

async function obtenerContextoPapelera(usuarioId) {
  const resultado = await pool.query(
    `SELECT u.departamento_id, u.es_jefe, d.jefe_id
     FROM usuarios u
     LEFT JOIN departamentos d
       ON d.id = u.departamento_id AND COALESCE(d.eliminado, FALSE) = FALSE
     WHERE u.id = $1`,
    [usuarioId]
  );
  if (!resultado.rowCount) return { departamentoId: null, esJefe: false, jefeId: null };
  const fila = resultado.rows[0];
  const bandera = String(fila.es_jefe ?? '').trim().toLowerCase();
  return {
    departamentoId: Number(fila.departamento_id) || null,
    esJefe: bandera === 't' || bandera === 'true' || bandera === '1' ||
      bandera === 's' || bandera === 'si' || bandera === 'y' || bandera === 'yes',
    jefeId: Number(fila.jefe_id) || null
  };
}

// ==========================================
// MIDDLEWARE DE AUTENTICACIÓN JWT
// ==========================================

async function obtenerPerfilUsuario(db, usuarioId) {
  const resultado = await db.query(
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
            d.nombre AS departamento,
            d.nombre AS departamento_nombre,
            CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object(
              'id', d.id, 'nombre', d.nombre, 'descripcion', d.descripcion,
              'jefe_id', d.jefe_id, 'codigo', d.codigo
            ) END AS departamento_objeto
     FROM usuarios u
     LEFT JOIN departamentos d ON d.id = u.departamento_id AND d.eliminado = FALSE
     WHERE u.id = $1`,
    [usuarioId]
  );
  return resultado.rows[0] || null;
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
  const esJefe = esFlagActivo(datos.es_jefe) &&
    Number(datos.usuario_departamento_id) === Number(departamentoId);
  const esAdministrador = esRolAdministrador(datos.usuario_rol);
  return {
    departamento: datos,
    esJefe,
    esAdministrador,
    puedeGestionar: esJefe || esAdministrador
  };
}

const DEFINICIONES_CONTENIDO = {
  anuncio: {
    tabla: 'anuncios',
    destinos: `CASE WHEN x.departamento_id IS NULL
      THEN ARRAY[]::INTEGER[] ELSE ARRAY[x.departamento_id] END`
  },
  archivo: {
    tabla: 'archivos',
    destinos: `CASE WHEN x.departamento_id IS NULL
      THEN ARRAY[]::INTEGER[] ELSE ARRAY[x.departamento_id] END`
  },
  tarea: {
    tabla: 'tareas',
    destinos: `COALESCE(x.departamentos_destino_ids, ARRAY[]::INTEGER[])`
  }
};

async function obtenerAccesoContenido(db, tipo, elementoId, usuarioId) {
  const definicion = DEFINICIONES_CONTENIDO[tipo];
  if (!definicion) return { existe: false, permitido: false };

  const resultado = await db.query(
    `SELECT x.autor_id, x.departamento_emisor_id,
            ${definicion.destinos} AS departamentos_destino_ids,
            COALESCE(x.eliminado, FALSE) AS eliminado,
            u.departamento_id AS usuario_departamento_id, u.es_jefe, u.rol
     FROM ${definicion.tabla} x
     JOIN usuarios u ON u.id = $2
     WHERE x.id = $1`,
    [elementoId, usuarioId]
  );
  if (!resultado.rowCount) return { existe: false, permitido: false };

  const elemento = resultado.rows[0];
  const departamentoUsuarioId = Number(elemento.usuario_departamento_id) || null;
  const departamentosRelacionados = [
    Number(elemento.departamento_emisor_id) || null,
    ...(elemento.departamentos_destino_ids || []).map(Number)
  ].filter(Boolean);
  const esAdministrador = esRolAdministrador(elemento.rol);
  const esJefeDelAlcance = esFlagActivo(elemento.es_jefe) &&
    departamentoUsuarioId !== null &&
    departamentosRelacionados.includes(departamentoUsuarioId);
  const esAutor = Number(elemento.autor_id) === Number(usuarioId);

  return {
    existe: true,
    permitido: esAutor || esJefeDelAlcance || esAdministrador,
    visible: esAutor || esJefeDelAlcance || esAdministrador ||
      (departamentoUsuarioId !== null && departamentosRelacionados.includes(departamentoUsuarioId)),
    esAutor,
    esJefeDelAlcance,
    esAdministrador,
    departamentoUsuarioId,
    departamentosRelacionados,
    eliminado: esFlagActivo(elemento.eliminado)
  };
}


// ==========================================
// RUTAS PROTEGIDAS CON JWT
// ==========================================

// Obtener usuarios / docentes

module.exports = {
  obtenerContextoPapelera,
  obtenerPerfilUsuario,
  obtenerPermisosDepartamento,
  DEFINICIONES_CONTENIDO,
  obtenerAccesoContenido,
};
