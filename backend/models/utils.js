/* Modelo: normalizacion y validacion de entidades de OCID. */
const crypto = require('crypto');

const CODIGO_DIGITOS = '0123456789';

const CODIGO_MAYUSCULAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const CODIGO_MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz';

const COLORES_ROLES = [
  '#2563EB', '#D97706', '#059669', '#7C3AED', '#DB2777', '#0891B2',
  '#65A30D', '#EA580C', '#4F46E5', '#0F766E', '#BE185D', '#9333EA',
  '#B45309', '#047857', '#C026D3', '#0369A1'
];

function hslAHex(tono, saturacion, luminosidad) {
  const c = (1 - Math.abs(2 * luminosidad - 1)) * saturacion;
  const x = c * (1 - Math.abs((tono / 60) % 2 - 1));
  const m = luminosidad - c / 2;
  let rgb;
  if (tono < 60) rgb = [c, x, 0];
  else if (tono < 120) rgb = [x, c, 0];
  else if (tono < 180) rgb = [0, c, x];
  else if (tono < 240) rgb = [0, x, c];
  else if (tono < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return `#${rgb.map(valor => Math.round((valor + m) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function generarColorRol(coloresExistentes) {
  const existentes = new Set(coloresExistentes.map(color => String(color).toUpperCase()));
  const disponibles = COLORES_ROLES.filter(color => !existentes.has(color));
  if (disponibles.length) return disponibles[crypto.randomInt(disponibles.length)];

  for (let intento = 0; intento < 360; intento += 1) {
    const color = hslAHex(crypto.randomInt(360), 0.72, 0.42);
    if (!existentes.has(color)) return color;
  }
  throw new Error('No se pudo generar un color único para el rol');
}

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

function normalizarNombreDepartamento(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/\s+/g, ' ')
    .trim();
}

// Acepta IDs o nombres de departamento y Devuelve los destinos existentes

async function resolverDestinosTarea(db, departamentos, departamento) {
  const valores = Array.isArray(departamentos)
    ? departamentos
    : String(departamento || 'General').split(',');
  const destinos = [...new Set(valores.map(valor => String(valor).trim()).filter(Boolean))];
  if (!destinos.length || destinos.some(valor => normalizarNombreDepartamento(valor) === 'general')) {
    if (destinos.length > 1) throw new Error('Selecciona General o departamentos específicos, no ambos');
    return { ids: [], nombres: ['General'] };
  }
  // Carga el catálogo y lo indexa por ID y por nombre normalizado
  const encontrados = await db.query(
    'SELECT id, nombre FROM departamentos WHERE eliminado = FALSE ORDER BY id ASC'
  );
  const porId = new Map();
  const porNombre = new Map();
  encontrados.rows.forEach(fila => {
    porId.set(Number(fila.id), fila);
    porNombre.set(normalizarNombreDepartamento(fila.nombre), fila);
  });
  const resueltos = destinos.map(valor => {
    const id = Number(valor);
    const fila = Number.isSafeInteger(id) && id > 0
      ? porId.get(id)
      : porNombre.get(normalizarNombreDepartamento(valor));
    // Incluye el valor recibido para diagnosticar departamentos inexistentes
    if (!fila) {
      throw new Error(`Uno o más departamentos destino no existen (recibido: ${JSON.stringify(destinos)})`);
    }
    return fila;
  });
  const unicos = [...new Map(resueltos.map(fila => [Number(fila.id), fila])).values()];
  return {
    ids: unicos.map(fila => Number(fila.id)),
    nombres: unicos.map(fila => fila.nombre)
  };
}

// Valida la fecha límite: desde hoy hasta seis meses después (YYYY-MM-DD)

function validarFechaLimiteTarea(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const limite = new Date(Date.UTC(anio, mes - 1, dia));
  if (limite.getUTCFullYear() !== anio || limite.getUTCMonth() !== mes - 1 || limite.getUTCDate() !== dia) return false;

  const ahora = new Date();
  const hoy = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
  const fin = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 6, hoy.getUTCDate()));
  return limite >= hoy && limite <= fin;
}

module.exports = {
  CODIGO_DIGITOS,
  CODIGO_MAYUSCULAS,
  CODIGO_MINUSCULAS,
  COLORES_ROLES,
  hslAHex,
  generarColorRol,
  generarCodigoDepartamento,
  ROLES_ADMINISTRATIVOS,
  normalizarRol,
  esFlagActivo,
  esRolAdministrador,
  normalizarNombreDepartamento,
  resolverDestinosTarea,
  validarFechaLimiteTarea,
};
