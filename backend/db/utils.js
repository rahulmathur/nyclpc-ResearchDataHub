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

module.exports = { getEnumMap, validateTableName, getPrimaryKey };
