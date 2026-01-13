const { getPool } = require('../db');
const { getEnumMap, validateTableName, getPrimaryKey } = require('../db/utils');

async function getTableData(req, res) {
  const { tableName } = req.params;
  let { limit = 100, offset = 0, q = null, fastCount = 'false' } = req.query;
  limit = parseInt(limit, 10) || 100;
  offset = parseInt(offset, 10) || 0;
  const MAX_LIMIT = parseInt(process.env.MAX_PAGE_LIMIT || '1000', 10);
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    if (!validateTableName(tableName)) return res.status(400).json({ error: 'Invalid table name' });

    let where = '';
    const params = [];
    if (q) {
      const colRes = await getPool().query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND data_type IN ('character varying','text','character')`,
        [tableName]
      );
      const textCols = colRes.rows.map(r => r.column_name);
      if (textCols.length > 0) {
        const likeClauses = textCols.map((c, i) => `${c} ILIKE $${i + 1}`);
        where = `WHERE (${likeClauses.join(' OR ')})`;
        for (let i = 0; i < textCols.length; i++) params.push(`%${q}%`);
      }
    }

    const pk = await getPrimaryKey(tableName);
    const orderBy = pk ? `ORDER BY ${pk} ASC` : '';

    const dataQuery = `SELECT * FROM ${tableName} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const dataParams = [...params, limit, offset];
    const result = await getPool().query(dataQuery, dataParams);
    const data = result.rows;

    let count = 0;
    if (fastCount === 'true') {
      const estRes = await getPool().query(`SELECT reltuples::bigint AS estimate FROM pg_class WHERE oid = $1::regclass`, [`public.${tableName}`]);
      count = parseInt(estRes.rows[0]?.estimate || 0, 10);
    } else if (where) {
      const countQuery = `SELECT COUNT(*) FROM ${tableName} ${where}`;
      const countRes = await getPool().query(countQuery, params);
      count = parseInt(countRes.rows[0].count, 10);
    } else {
      const countResult = await getPool().query(`SELECT COUNT(*) FROM ${tableName}`);
      count = parseInt(countResult.rows[0].count);
    }

    res.json({ success: true, data, count, limit: parseInt(limit), offset: parseInt(offset), count_estimated: fastCount === 'true' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function insertRecord(req, res) {
  const { tableName } = req.params;
  const recordData = req.body;

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    if (!validateTableName(tableName)) return res.status(400).json({ error: 'Invalid table name' });

    const enumMap = await getEnumMap(tableName);
    for (const [k, v] of Object.entries(recordData)) {
      if (v == null) continue;
      const allowed = enumMap[k];
      if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(String(v))) {
        return res.status(400).json({ error: `Invalid value for ${k}: ${v}. Allowed values: ${allowed.join(', ')}` });
      }
    }

    const columns = Object.keys(recordData).join(', ');
    const values = Object.values(recordData);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const result = await getPool().query(
      `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateRecord(req, res) {
  const { tableName, id } = req.params;
  const recordData = req.body;

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    if (!validateTableName(tableName)) return res.status(400).json({ error: 'Invalid table name' });

    const enumMap = await getEnumMap(tableName);
    for (const [k, v] of Object.entries(recordData)) {
      if (v == null) continue;
      const allowed = enumMap[k];
      if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(String(v))) {
        return res.status(400).json({ error: `Invalid value for ${k}: ${v}. Allowed values: ${allowed.join(', ')}` });
      }
    }

    const pk = await getPrimaryKey(tableName) || 'id';
    const setClause = Object.keys(recordData).map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = [...Object.values(recordData), id];
    const result = await getPool().query(
      `UPDATE ${tableName} SET ${setClause} WHERE ${pk} = $${values.length} RETURNING *`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteRecord(req, res) {
  const { tableName, id } = req.params;

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    if (!validateTableName(tableName)) return res.status(400).json({ error: 'Invalid table name' });
    const pk = await getPrimaryKey(tableName) || 'id';
    await getPool().query(`DELETE FROM ${tableName} WHERE ${pk} = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { getTableData, insertRecord, updateRecord, deleteRecord };
