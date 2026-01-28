const { getPool } = require('./index');

async function getEnumMap(tableName) {
  const db = getPool();
  const map = {};
  const colsRes = await db.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );

  for (const row of colsRes.rows) {
    if (row.data_type === 'USER-DEFINED' && row.udt_name) {
      const enumRes = await db.query(
        `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`,
        [row.udt_name]
      );
      map[row.column_name] = enumRes.rows.map(r => r.enumlabel);
    }
  }

  return map;
}

function validateTableName(tableName) {
  return typeof tableName === 'string' && /^[a-zA-Z0-9_]+$/.test(tableName);
}

async function getPrimaryKey(tableName) {
  const db = getPool();
  const res = await db.query(
    `SELECT a.attname as column_name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    [tableName]
  );
  if (res.rows.length > 0) return res.rows[0].column_name;
  return null;
}

/**
 * Gets all geometry column names for a table
 * @param {string} tableName - The name of the table
 * @returns {Promise<string[]>} Array of geometry column names
 */
async function getGeometryColumns(tableName) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND udt_name = 'geometry'`,
    [tableName]
  );
  return result.rows.map(r => r.column_name);
}

/**
 * Gets the first geometry column for a table, or null if none exists
 * @param {string} tableName - The name of the table
 * @returns {Promise<string|null>} The geometry column name or null
 */
async function getGeometryColumn(tableName) {
  const columns = await getGeometryColumns(tableName);
  return columns[0] || null;
}

/**
 * Normalizes a record by adding an `id` property from the primary key column
 * @param {Object} record - The database record
 * @param {string} pkColumn - The name of the primary key column
 * @returns {Object} The record with an added `id` property
 */
function normalizeRecord(record, pkColumn) {
  if (!record || !pkColumn) return record;
  return { ...record, id: record[pkColumn] };
}

/**
 * Normalizes an array of records by adding `id` property from the primary key column
 * @param {Object[]} records - Array of database records
 * @param {string} pkColumn - The name of the primary key column
 * @returns {Object[]} Array of records with added `id` properties
 */
function normalizeRecords(records, pkColumn) {
  return records.map(r => normalizeRecord(r, pkColumn));
}

module.exports = {
  getEnumMap,
  validateTableName,
  getPrimaryKey,
  getGeometryColumns,
  getGeometryColumn,
  normalizeRecord,
  normalizeRecords
};
