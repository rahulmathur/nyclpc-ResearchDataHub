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

// Get site attributes for a project
async function getProjectSiteAttributes(req, res) {
  const { projectId } = req.params;
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const result = await getPool().query(`
      SELECT psa.sat_project_site_attributes_id, psa.hub_project_id, psa.attribute_id, psa.create_dt,
             ra.attribute_nm, ra.attribute_text, ra.attribute_desc, ra.attribute_type
      FROM sat_project_site_attributes psa
      JOIN ref_attributes ra ON psa.attribute_id = ra.attribute_id
      WHERE psa.hub_project_id = $1
      ORDER BY ra.attribute_nm
    `, [projectId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update site attributes for a project (replace all)
async function updateProjectSiteAttributes(req, res) {
  const { projectId } = req.params;
  const { attributeIds } = req.body || {};
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    if (!Array.isArray(attributeIds)) {
      return res.status(400).json({ error: 'attributeIds must be an array' });
    }

    // Delete existing attributes for this project
    await getPool().query(
      'DELETE FROM sat_project_site_attributes WHERE hub_project_id = $1',
      [projectId]
    );

    // Insert new attributes
    for (const attrId of attributeIds) {
      await getPool().query(
        'INSERT INTO sat_project_site_attributes (hub_project_id, attribute_id) VALUES ($1, $2)',
        [projectId, attrId]
      );
    }

    res.json({ success: true, count: attributeIds.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get all available site attributes (attribute_p_or_s = 'S')
async function getSiteAttributes(req, res) {
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const result = await getPool().query(`
      SELECT attribute_id, attribute_nm, attribute_text, attribute_desc, attribute_type
      FROM ref_attributes
      WHERE attribute_p_or_s = 'S'
      ORDER BY attribute_nm
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get sites with attribute values for project's selected attributes
async function getSitesWithAttributes(req, res) {
  const { projectId } = req.params;
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();
    
    // Get project's selected attributes
    const attrsResult = await pool.query(`
      SELECT ra.attribute_id, ra.attribute_nm, ra.attribute_text, ra.attribute_type
      FROM sat_project_site_attributes psa
      JOIN ref_attributes ra ON psa.attribute_id = ra.attribute_id
      WHERE psa.hub_project_id = $1
      ORDER BY ra.attribute_nm
    `, [projectId]);
    const attributes = attrsResult.rows;
    
    // Get all sites
    const sitesResult = await pool.query(`
      SELECT hub_site_id FROM hub_sites ORDER BY hub_site_id
    `);
    
    // Build sites map for quick lookup
    const sitesMap = new Map();
    for (const s of sitesResult.rows) {
      sitesMap.set(s.hub_site_id, { hub_site_id: s.hub_site_id, id: s.hub_site_id });
    }
    
    // Batch fetch all attribute data and assign to sites
    for (const attr of attributes) {
      const attrKey = `attr_${attr.attribute_id}`;
      const attrData = await getBatchAttributeValues(pool, attr);
      
      // Assign values to sites
      for (const [siteId, site] of sitesMap) {
        site[attrKey] = attrData.get(siteId) || '';
      }
    }
    
    res.json({ 
      success: true, 
      data: Array.from(sitesMap.values()),
      attributes: attributes.map(a => ({
        id: a.attribute_id,
        name: a.attribute_nm,
        key: `attr_${a.attribute_id}`
      }))
    });
  } catch (error) {
    console.error('getSitesWithAttributes error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Batch fetch all values for an attribute across all sites
async function getBatchAttributeValues(pool, attr) {
  const attrText = attr.attribute_text;
  const attrType = attr.attribute_type;
  const result = new Map(); // siteId -> pipe-separated values
  
  try {
    let rows = [];
    
    if (attrType === 'int' || attrType === 'txt' || attrType === 'num' || attrType === 'ts') {
      // Generic attributes from sat_site_attributes
      const query = await pool.query(`
        SELECT hub_site_id, attribute_value_text, attribute_value_int, attribute_value_number, attribute_value_ts
        FROM sat_site_attributes
        WHERE attribute_id = $1
        ORDER BY hub_site_id, start_dt
      `, [attr.attribute_id]);
      
      const grouped = new Map();
      for (const row of query.rows) {
        let val = null;
        if (attrType === 'int' && row.attribute_value_int != null) val = String(row.attribute_value_int);
        else if (attrType === 'txt' && row.attribute_value_text != null) val = row.attribute_value_text;
        else if (attrType === 'num' && row.attribute_value_number != null) val = String(row.attribute_value_number);
        else if (attrType === 'ts' && row.attribute_value_ts != null) val = new Date(row.attribute_value_ts).toLocaleDateString();
        
        if (val) {
          if (!grouped.has(row.hub_site_id)) grouped.set(row.hub_site_id, []);
          grouped.get(row.hub_site_id).push(val);
        }
      }
      for (const [siteId, vals] of grouped) {
        result.set(siteId, vals.join(' | '));
      }
      
    } else if (attrType === 'tbl') {
      if (attrText === 'bbl') {
        const query = await pool.query(`SELECT hub_site_id, bbl FROM sat_site_bbl ORDER BY hub_site_id, start_dt`);
        groupAndSet(query.rows, result, 'bbl');
      } else if (attrText === 'built') {
        const query = await pool.query(`SELECT hub_site_id, date_combo FROM sat_site_built ORDER BY hub_site_id, start_dt`);
        groupAndSet(query.rows, result, 'date_combo');
      } else if (attrText === 'alteration') {
        const query = await pool.query(`
          SELECT sa.hub_site_id, a.alteration_nm
          FROM sat_site_alteration sa
          JOIN ref_alteration a ON sa.alteration_id = a.alteration_id
          ORDER BY sa.hub_site_id, sa.sort_order
        `);
        groupAndSet(query.rows, result, 'alteration_nm');
      }
      
    } else if (attrType === 'refs' || attrType === 'ref') {
      if (attrText === 'material') {
        const query = await pool.query(`
          SELECT sm.hub_site_id, m.material_nm
          FROM sat_site_material sm
          JOIN ref_material m ON sm.material_id = m.material_id
          ORDER BY sm.hub_site_id, sm.sort_order
        `);
        groupAndSet(query.rows, result, 'material_nm');
      } else if (attrText === 'style') {
        const query = await pool.query(`
          SELECT ss.hub_site_id, s.style_nm
          FROM sat_site_style ss
          JOIN ref_style s ON ss.style_id = s.style_id
          ORDER BY ss.hub_site_id, ss.sort_order
        `);
        groupAndSet(query.rows, result, 'style_nm');
      } else if (attrText === 'type') {
        const query = await pool.query(`
          SELECT st.hub_site_id, t.type_nm
          FROM sat_site_type st
          JOIN ref_type t ON st.type_id = t.type_id
          ORDER BY st.hub_site_id, st.sort_order
        `);
        groupAndSet(query.rows, result, 'type_nm');
      } else if (attrText === 'use') {
        const query = await pool.query(`
          SELECT su.hub_site_id, u.use_nm
          FROM sat_site_use su
          JOIN ref_use u ON su.use_id = u.use_id
          ORDER BY su.hub_site_id, su.sort_order
        `);
        groupAndSet(query.rows, result, 'use_nm');
      }
    }
  } catch (err) {
    console.error(`Error batch fetching attribute ${attr.attribute_nm}:`, err.message);
  }
  
  return result;
}

// Helper to group rows by site and set pipe-separated values
function groupAndSet(rows, resultMap, valueKey) {
  const grouped = new Map();
  for (const row of rows) {
    const val = row[valueKey];
    if (val) {
      if (!grouped.has(row.hub_site_id)) grouped.set(row.hub_site_id, []);
      grouped.get(row.hub_site_id).push(val);
    }
  }
  for (const [siteId, vals] of grouped) {
    resultMap.set(siteId, vals.join(' | '));
  }
}

module.exports = { 
  listProjects, 
  getProjectSites, 
  createProject, 
  updateProject, 
  deleteProject,
  getProjectSiteAttributes,
  updateProjectSiteAttributes,
  getSiteAttributes,
  getSitesWithAttributes
};
