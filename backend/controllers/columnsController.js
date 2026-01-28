const { getPool } = require('../db');
const { validateTableName } = require('../db/utils');

async function getColumns(req, res) {
  const { tableName } = req.params;
  try {
    if (!validateTableName(tableName)) return res.status(400).json({ error: 'Invalid table name' });

    const cols = await getPool().query(
      `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );

    const columns = [];
    for (const row of cols.rows) {
      const col = { column_name: row.column_name, data_type: row.data_type, udt_name: row.udt_name };
      if (row.data_type === 'USER-DEFINED') {
        const enumRes = await getPool().query(
          `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`,
          [row.udt_name]
        );
        col.enum_values = enumRes.rows.map(r => r.enumlabel);
      }
      columns.push(col);
    }

    res.json({ success: true, columns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { getColumns };
