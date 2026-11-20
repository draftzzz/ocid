/* Modelo de acceso a datos: Pool de PostgreSQL y consultas parametrizadas. */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function consultar(texto, valores) {
  return pool.query(texto, valores);
}

module.exports = { pool, consultar };
