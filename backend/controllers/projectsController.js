const { getPool } = require('../db');
const { getEnumMap, getPrimaryKey } = require('../db/utils');

async function listProjects(req, res) {
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const result = await getPool().query('SELECT * FROM hub_projects ORDER BY hub_project_id');
    const projects = result.rows.map(r => ({ ...r, id: r.hub_project_id }));
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getProjectSites(req, res) {
  const { projectId } = req.params;
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const result = await getPool().query(`
      SELECT s.*
      FROM hub_sites s
      JOIN lnk_project_site l ON s.hub_site_id = l.hub_site_id
      WHERE l.hub_project_id = $1
      ORDER BY s.hub_site_id
    `, [projectId]);
    const sites = result.rows.map(r => ({ ...r, id: r.hub_site_id }));
    res.json({ success: true, data: sites });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create a new project
async function createProject(req, res) {
  const data = req.body || {};
  const tableName = 'hub_projects';
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });

    // Validate enum fields if present
    const enumMap = await getEnumMap(tableName);
    for (const [k, v] of Object.entries(data)) {
      if (v == null) continue;
      const allowed = enumMap[k];
      if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(String(v))) {
        return res.status(400).json({ error: `Invalid value for ${k}: ${v}. Allowed values: ${allowed.join(', ')}` });
      }
    }

    const columns = Object.keys(data).join(', ');
    if (!columns) return res.status(400).json({ error: 'No data provided' });
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const result = await getPool().query(
      `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const row = result.rows[0];
    row.id = row.hub_project_id;
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update an existing project
async function updateProject(req, res) {
  const { projectId } = req.params;
  const data = req.body || {};
  const tableName = 'hub_projects';
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });

    const enumMap = await getEnumMap(tableName);
    for (const [k, v] of Object.entries(data)) {
      if (v == null) continue;
      const allowed = enumMap[k];
      if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(String(v))) {
        return res.status(400).json({ error: `Invalid value for ${k}: ${v}. Allowed values: ${allowed.join(', ')}` });
      }
    }

    const pk = await getPrimaryKey(tableName) || 'hub_project_id';
    const keys = Object.keys(data);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(data), projectId];
    const result = await getPool().query(
      `UPDATE ${tableName} SET ${setClause} WHERE ${pk} = $${values.length} RETURNING *`,
      values
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Project not found' });
    row.id = row.hub_project_id;
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete a project
async function deleteProject(req, res) {
  const { projectId } = req.params;
  const tableName = 'hub_projects';
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pk = await getPrimaryKey(tableName) || 'hub_project_id';
    await getPool().query(`DELETE FROM ${tableName} WHERE ${pk} = $1`, [projectId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { listProjects, getProjectSites, createProject, updateProject, deleteProject };
