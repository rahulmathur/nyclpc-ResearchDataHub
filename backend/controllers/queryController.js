const { getPool } = require('../db');

// Safe query runner: read-only, single statement, timeout and row-limit protections
async function runQuery(req, res) {
  const { query, params = [] } = req.body;
  const MAX_ROWS = parseInt(process.env.MAX_QUERY_ROWS || '1000', 10);
  const TIMEOUT_MS = parseInt(process.env.QUERY_TIMEOUT_MS || '5000', 10);

  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query required' });
  const q = query.trim();
  if (q.includes(';')) return res.status(400).json({ error: 'Multiple statements are not allowed' });
  if (!/^(select|with|explain|show)\b/i.test(q)) {
    return res.status(400).json({ error: 'Only read-only queries are allowed' });
  }

  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = $1', [TIMEOUT_MS]);
    await client.query('SET LOCAL transaction_read_only = on');

    const result = await client.query(query, params);
    await client.query('ROLLBACK');

    if (result.rowCount > MAX_ROWS) {
      return res.json({
        success: true,
        note: `Result truncated to ${MAX_ROWS} rows`,
        rowCount: result.rowCount,
        data: result.rows.slice(0, MAX_ROWS)
      });
    }

    res.json({ success: true, data: result.rows, rowCount: result.rowCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

module.exports = { runQuery };
