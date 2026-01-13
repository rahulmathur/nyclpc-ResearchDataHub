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
    
    // Get project's selected attributes
    const attrsResult = await getPool().query(`
      SELECT ra.attribute_id, ra.attribute_nm, ra.attribute_text, ra.attribute_type
      FROM sat_project_site_attributes psa
      JOIN ref_attributes ra ON psa.attribute_id = ra.attribute_id
      WHERE psa.hub_project_id = $1
      ORDER BY ra.attribute_nm
    `, [projectId]);
    const attributes = attrsResult.rows;
    
    // Get all sites (hub_sites only has hub_site_id and create_dt)
    const sitesResult = await getPool().query(`
      SELECT hub_site_id FROM hub_sites ORDER BY hub_site_id
    `);
    const sites = sitesResult.rows.map(s => ({ hub_site_id: s.hub_site_id, id: s.hub_site_id }));
    
    // For each site, get attribute values
    for (const site of sites) {
      for (const attr of attributes) {
        const values = await getAttributeValues(site.hub_site_id, attr);
        site[`attr_${attr.attribute_id}`] = values;
      }
    }
    
    res.json({ 
      success: true, 
      data: sites,
      attributes: attributes.map(a => ({
        id: a.attribute_id,
        name: a.attribute_nm,
        key: `attr_${a.attribute_id}`
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Helper to get attribute values for a site
async function getAttributeValues(siteId, attr) {
  const pool = getPool();
  const attrText = attr.attribute_text;
  const attrType = attr.attribute_type;
  
  try {
    let values = [];
    
    // Handle different attribute types
    if (attrType === 'int' || attrType === 'txt' || attrType === 'num' || attrType === 'ts') {
      // Generic attributes stored in sat_site_attributes
      const result = await pool.query(`
        SELECT attribute_value_text, attribute_value_int, attribute_value_number, attribute_value_ts
        FROM sat_site_attributes
        WHERE hub_site_id = $1 AND attribute_id = $2
        ORDER BY start_dt
      `, [siteId, attr.attribute_id]);
      
      for (const row of result.rows) {
        if (attrType === 'int' && row.attribute_value_int != null) {
          values.push(String(row.attribute_value_int));
        } else if (attrType === 'txt' && row.attribute_value_text != null) {
          values.push(row.attribute_value_text);
        } else if (attrType === 'num' && row.attribute_value_number != null) {
          values.push(String(row.attribute_value_number));
        } else if (attrType === 'ts' && row.attribute_value_ts != null) {
          values.push(new Date(row.attribute_value_ts).toLocaleDateString());
        }
      }
    } else if (attrType === 'tbl') {
      // Table-based attributes (bbl, built, alteration)
      if (attrText === 'bbl') {
        const result = await pool.query(`
          SELECT bbl FROM sat_site_bbl WHERE hub_site_id = $1 ORDER BY start_dt
        `, [siteId]);
        values = result.rows.map(r => r.bbl).filter(Boolean);
      } else if (attrText === 'built') {
        const result = await pool.query(`
          SELECT date_combo FROM sat_site_built WHERE hub_site_id = $1 ORDER BY start_dt
        `, [siteId]);
        values = result.rows.map(r => r.date_combo).filter(Boolean);
      } else if (attrText === 'alteration') {
        const result = await pool.query(`
          SELECT a.alteration_nm
          FROM sat_site_alteration sa
          JOIN ref_alteration a ON sa.alteration_id = a.alteration_id
          WHERE sa.hub_site_id = $1
          ORDER BY sa.sort_order
        `, [siteId]);
        values = result.rows.map(r => r.alteration_nm).filter(Boolean);
      }
    } else if (attrType === 'refs' || attrType === 'ref') {
      // Reference table attributes (material, style, type, use)
      if (attrText === 'material') {
        const result = await pool.query(`
          SELECT m.material_nm
          FROM sat_site_material sm
          JOIN ref_material m ON sm.material_id = m.material_id
          WHERE sm.hub_site_id = $1
          ORDER BY sm.sort_order
        `, [siteId]);
        values = result.rows.map(r => r.material_nm).filter(Boolean);
      } else if (attrText === 'style') {
        const result = await pool.query(`
          SELECT s.style_nm
          FROM sat_site_style ss
          JOIN ref_style s ON ss.style_id = s.style_id
          WHERE ss.hub_site_id = $1
          ORDER BY ss.sort_order
        `, [siteId]);
        values = result.rows.map(r => r.style_nm).filter(Boolean);
      } else if (attrText === 'type') {
        const result = await pool.query(`
          SELECT t.type_nm
          FROM sat_site_type st
          JOIN ref_type t ON st.type_id = t.type_id
          WHERE st.hub_site_id = $1
          ORDER BY st.sort_order
        `, [siteId]);
        values = result.rows.map(r => r.type_nm).filter(Boolean);
      } else if (attrText === 'use') {
        const result = await pool.query(`
          SELECT u.use_nm
          FROM sat_site_use su
          JOIN ref_use u ON su.use_id = u.use_id
          WHERE su.hub_site_id = $1
          ORDER BY su.sort_order
        `, [siteId]);
        values = result.rows.map(r => r.use_nm).filter(Boolean);
      }
    }
    
    // Return pipe-separated values or empty string
    return values.length > 0 ? values.join(' | ') : '';
  } catch (err) {
    console.error(`Error getting attribute ${attr.attribute_nm} for site ${siteId}:`, err.message);
    return '';
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
