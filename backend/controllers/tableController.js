const { getPool } = require('../db');
const { getEnumMap, validateTableName, getPrimaryKey } = require('../db/utils');

async function getTableData(req, res) {
  const { tableName } = req.params;
  let { limit = 100, offset = 0, q = null, fastCount = 'false', hub_site_id: hubSiteIdParam } = req.query;
  limit = parseInt(limit, 10) || 100;
  offset = parseInt(offset, 10) || 0;
  const MAX_LIMIT = parseInt(process.env.MAX_PAGE_LIMIT || '1000', 10);
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    if (!validateTableName(tableName)) return res.status(400).json({ error: 'Invalid table name' });

    // Get geometry columns so we can convert them to GeoJSON
    const geomColRes = await getPool().query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND udt_name = 'geometry'`,
      [tableName]
    );
    const geomCols = geomColRes.rows.map(r => r.column_name);

    // Build SELECT clause and get all columns (needed early to check for hub_site_id)
    const colRes = await getPool().query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tableName]
    );
    const allCols = colRes.rows.map(r => r.column_name);
    const hasHubSiteId = allCols.includes('hub_site_id');
    const hubSiteId = hasHubSiteId && hubSiteIdParam != null && String(hubSiteIdParam).trim() !== '' ? String(hubSiteIdParam).trim() : null;

    let where = '';
    const params = [];
    if (q) {
      const textColRes = await getPool().query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND data_type IN ('character varying','text','character')`,
        [tableName]
      );
      const textCols = textColRes.rows.map(r => r.column_name);
      if (textCols.length > 0) {
        const likeClauses = textCols.map((c, i) => `${c} ILIKE $${i + 1}`);
        where = `WHERE (${likeClauses.join(' OR ')})`;
        for (let i = 0; i < textCols.length; i++) params.push(`%${q}%`);
      }
    }
    if (hubSiteId) {
      params.push(hubSiteId);
      const clause = `hub_site_id = $${params.length}`;
      where = where ? `${where} AND ${clause}` : `WHERE ${clause}`;
    }

    const pk = await getPrimaryKey(tableName);
    const orderBy = pk ? `ORDER BY ${pk} ASC` : '';

    const selectCols = allCols.map(col =>
      geomCols.includes(col) ? `ST_AsGeoJSON(${col})::text AS ${col}` : col
    ).join(', ');

    const dataQuery = `SELECT ${selectCols} FROM ${tableName} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
    // Exclude PK from updates to avoid FK violations (e.g. hub_projects -> lnk_project_site)
    const { [pk]: _ignore, ...updateData } = recordData;
    const updateKeys = Object.keys(updateData);
    if (updateKeys.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
    const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = [...updateKeys.map(k => updateData[k]), id];
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
    const pool = getPool();

    // hub_projects: remove dependent rows first to avoid lnk_project_site FK violation
    if (tableName === 'hub_projects') {
      await pool.query('DELETE FROM lnk_project_site WHERE hub_project_id = $1', [id]);
      try {
        await pool.query('DELETE FROM sat_project_site_attributes WHERE hub_project_id = $1', [id]);
      } catch (e) {
        if (e.code !== '42P01') throw e;
      }
    }

    const result = await pool.query(`DELETE FROM ${tableName} WHERE ${pk} = $1 RETURNING 1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { getTableData, insertRecord, updateRecord, deleteRecord };
