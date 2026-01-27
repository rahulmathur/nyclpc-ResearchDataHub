const { getPool } = require('../db');
const { getEnumMap, getPrimaryKey } = require('../db/utils');
const shapefile = require('shapefile');
const AdmZip = require('adm-zip');
const { from: copyFrom } = require('pg-copy-streams');
const { Readable } = require('stream');

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

// Get clustered/simplified geometries for project sites (for map display)
async function getProjectSitesClustered(req, res) {
  const { projectId } = req.params;
  const gridSize = parseFloat(req.query.gridSize) || 500; // Grid size in feet (State Plane units)
  
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();

    // Get geometry column name
    const geomColRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = 'sat_site_geometry' AND udt_name = 'geometry'`
    );
    const geomCol = geomColRes.rows[0]?.column_name || 'shape';

    // Cluster sites using ST_SnapToGrid and aggregate
    // Returns cluster centroid (in WGS84), count, and sample site IDs
    // Optimized: compute grid cell directly without intermediate centroid CTE
    const result = await pool.query(`
      SELECT 
        ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_MakePoint(
          (floor(ST_X(ST_Centroid(g."${geomCol}")) / $2) * $2) + ($2 / 2),
          (floor(ST_Y(ST_Centroid(g."${geomCol}")) / $2) * $2) + ($2 / 2)
        ), 2263), 4326))::json as geometry,
        COUNT(*) as site_count,
        (array_agg(g.hub_site_id ORDER BY g.hub_site_id))[1:5] as sample_site_ids
      FROM sat_site_geometry g
      JOIN lnk_project_site l ON g.hub_site_id = l.hub_site_id
      WHERE l.hub_project_id = $1
        AND g."${geomCol}" IS NOT NULL
      GROUP BY 
        floor(ST_X(ST_Centroid(g."${geomCol}")) / $2),
        floor(ST_Y(ST_Centroid(g."${geomCol}")) / $2)
      ORDER BY site_count DESC
    `, [projectId, gridSize]);

    // Also get total count and bounding box
    const statsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT g.hub_site_id) as total_sites,
        ST_AsGeoJSON(ST_Transform(ST_Envelope(ST_Collect(g."${geomCol}")), 4326))::json as bounds
      FROM sat_site_geometry g
      JOIN lnk_project_site l ON g.hub_site_id = l.hub_site_id
      WHERE l.hub_project_id = $1
        AND g."${geomCol}" IS NOT NULL
    `, [projectId]);

    const clusters = result.rows.map(r => ({
      geometry: r.geometry,
      count: parseInt(r.site_count) || 0,
      sampleSiteIds: r.sample_site_ids?.slice(0, 5) || []
    }));

    res.json({
      success: true,
      data: {
        clusters,
        totalSites: parseInt(statsResult.rows[0]?.total_sites) || 0,
        bounds: statsResult.rows[0]?.bounds,
        clusterCount: clusters.length,
        gridSize
      }
    });
  } catch (error) {
    console.error('getProjectSitesClustered error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function getProjectSites(req, res) {
  const { projectId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();
    
    // Find the BIN attribute_id from ref_attributes
    let binAttrId = null;
    try {
      const binAttrRes = await pool.query(
        `SELECT attribute_id, attribute_type FROM ref_attributes 
         WHERE attribute_p_or_s = 'S' AND (LOWER(attribute_nm) = 'bin' OR LOWER(attribute_text) = 'bin') 
         LIMIT 1`
      );
      if (binAttrRes.rows.length > 0) {
        binAttrId = binAttrRes.rows[0].attribute_id;
      }
    } catch (e) {
      // ref_attributes may not exist; skip BIN lookup
    }
    
    // Get total count first
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM lnk_project_site WHERE hub_project_id = $1`,
      [projectId]
    );
    const total = parseInt(countResult.rows[0].total) || 0;
    
    // Build the query with LEFT JOINs for BBL and BIN, with pagination
    // BBL comes from sat_site_bbl, BIN comes from sat_site_attributes
    const result = await pool.query(`
      SELECT 
        s.*,
        (SELECT string_agg(DISTINCT bbl::text, ' | ' ORDER BY bbl::text) 
         FROM sat_site_bbl 
         WHERE hub_site_id = s.hub_site_id) AS bbl,
        ${binAttrId ? `(SELECT string_agg(DISTINCT COALESCE(attribute_value_text, attribute_value_int::text), ' | ')
         FROM sat_site_attributes 
         WHERE hub_site_id = s.hub_site_id AND attribute_id = ${binAttrId}) AS bin` : 'NULL AS bin'}
      FROM hub_sites s
      JOIN lnk_project_site l ON s.hub_site_id = l.hub_site_id
      WHERE l.hub_project_id = $1
      ORDER BY s.hub_site_id
      LIMIT $2 OFFSET $3
    `, [projectId, limit, offset]);
    
    const sites = result.rows.map(r => ({ ...r, id: r.hub_site_id }));
    res.json({ 
      success: true, 
      data: sites,
      pagination: {
        total,
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(total / limit)
      }
    });
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

    // Ensure hub_project_guid is generated if not provided
    // Check if hub_project_guid column exists
    const columnCheck = await getPool().query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = $1 
        AND column_name = 'hub_project_guid'
    `, [tableName]);

    if (columnCheck.rows.length > 0 && !data.hub_project_guid) {
      // Column exists but GUID not provided - let database generate it via DEFAULT
      // Don't include hub_project_guid in INSERT, let DEFAULT handle it
    } else if (columnCheck.rows.length > 0 && data.hub_project_guid) {
      // GUID provided, use it
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
    const { [pk]: _pk, hub_project_guid: _guid, ...updateData } = data; // Exclude hub_project_guid from updates
    const keys = Object.keys(updateData);
    if (keys.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(updateData), projectId];
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
// Must remove dependent rows in lnk_project_site and sat_project_site_attributes first
// (works even when DB does not have ON DELETE CASCADE on these FKs)
async function deleteProject(req, res) {
  const { projectId } = req.params;
  const tableName = 'hub_projects';
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();

    // 1. Delete project-site links (avoids lnk_project_site_hub_project_id_fkey violation)
    await pool.query('DELETE FROM lnk_project_site WHERE hub_project_id = $1', [projectId]);

    // 2. Delete project's selected site attributes (if table exists)
    try {
      await pool.query('DELETE FROM sat_project_site_attributes WHERE hub_project_id = $1', [projectId]);
    } catch (e) {
      if (e.code !== '42P01') throw e; // 42P01 = undefined_table; ignore if table missing
    }

    // 3. Delete the project
    const pk = await getPrimaryKey(tableName) || 'hub_project_id';
    const del = await pool.query(`DELETE FROM ${tableName} WHERE ${pk} = $1 RETURNING 1`, [projectId]);
    if (del.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
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
             psa.sort_order,
             ra.attribute_nm, ra.attribute_text, ra.attribute_desc, ra.attribute_type
      FROM sat_project_site_attributes psa
      JOIN ref_attributes ra ON psa.attribute_id = ra.attribute_id
      WHERE psa.hub_project_id = $1
      ORDER BY psa.sort_order, ra.attribute_nm
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

    // Insert new attributes with sort_order based on array position
    for (let i = 0; i < attributeIds.length; i++) {
      const attrId = attributeIds[i];
      await getPool().query(
        'INSERT INTO sat_project_site_attributes (hub_project_id, attribute_id, sort_order) VALUES ($1, $2, $3)',
        [projectId, attrId, i]
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

// Get sites with attribute values for project's selected attributes (paginated)
async function getSitesWithAttributes(req, res) {
  const { projectId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();
    
    // Get project's selected attributes ordered by sort_order
    const attrsResult = await pool.query(`
      SELECT ra.attribute_id, ra.attribute_nm, ra.attribute_text, ra.attribute_type, psa.sort_order
      FROM sat_project_site_attributes psa
      JOIN ref_attributes ra ON psa.attribute_id = ra.attribute_id
      WHERE psa.hub_project_id = $1
      ORDER BY psa.sort_order, ra.attribute_nm
    `, [projectId]);
    const attributes = attrsResult.rows;
    
    // Get total count first
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM lnk_project_site WHERE hub_project_id = $1`,
      [projectId]
    );
    const total = parseInt(countResult.rows[0].total) || 0;
    
    // Get paginated sites linked to this project
    const sitesResult = await pool.query(`
      SELECT hs.hub_site_id 
      FROM hub_sites hs
      JOIN lnk_project_site lps ON hs.hub_site_id = lps.hub_site_id
      WHERE lps.hub_project_id = $1
      ORDER BY hs.hub_site_id
      LIMIT $2 OFFSET $3
    `, [projectId, limit, offset]);
    
    // Build sites map for quick lookup
    const sitesMap = new Map();
    const siteIds = [];
    for (const s of sitesResult.rows) {
      sitesMap.set(s.hub_site_id, { hub_site_id: s.hub_site_id, id: s.hub_site_id });
      siteIds.push(s.hub_site_id);
    }
    
    // Batch fetch attribute data only for current page's sites
    for (const attr of attributes) {
      const attrKey = `attr_${attr.attribute_id}`;
      const attrData = await getBatchAttributeValues(pool, attr, siteIds);
      
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
      })),
      pagination: {
        total,
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('getSitesWithAttributes error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Batch fetch values for an attribute, optionally filtered by site IDs
async function getBatchAttributeValues(pool, attr, siteIds = null) {
  const attrText = attr.attribute_text;
  const attrType = attr.attribute_type;
  const result = new Map(); // siteId -> pipe-separated values
  
  // Build WHERE clause for filtering by site IDs
  const siteFilter = siteIds && siteIds.length > 0 
    ? `AND hub_site_id = ANY($2)` 
    : '';
  const siteFilterNoAlias = siteIds && siteIds.length > 0 
    ? `WHERE hub_site_id = ANY($1)` 
    : '';
  const params = siteIds && siteIds.length > 0 ? [siteIds] : [];
  
  try {
    if (attrType === 'int' || attrType === 'txt' || attrType === 'num' || attrType === 'ts') {
      // Generic attributes from sat_site_attributes
      const queryParams = [attr.attribute_id, ...(siteIds?.length ? [siteIds] : [])];
      const query = await pool.query(`
        SELECT hub_site_id, attribute_value_text, attribute_value_int, attribute_value_number, attribute_value_ts
        FROM sat_site_attributes
        WHERE attribute_id = $1 ${siteFilter}
        ORDER BY hub_site_id, start_dt
      `, queryParams);
      
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
        const query = await pool.query(`SELECT hub_site_id, bbl FROM sat_site_bbl ${siteFilterNoAlias} ORDER BY hub_site_id, start_dt`, params);
        groupAndSet(query.rows, result, 'bbl');
      } else if (attrText === 'built') {
        const query = await pool.query(`SELECT hub_site_id, date_combo FROM sat_site_built ${siteFilterNoAlias} ORDER BY hub_site_id, start_dt`, params);
        groupAndSet(query.rows, result, 'date_combo');
      // Note: ref_alteration table does not exist in current schema
      // } else if (attrText === 'alteration') {
      //   const query = await pool.query(`
      //     SELECT sa.hub_site_id, a.alteration_nm
      //     FROM sat_site_alteration sa
      //     JOIN ref_alteration a ON sa.alteration_id = a.alteration_id
      //     ${siteIds?.length ? 'WHERE sa.hub_site_id = ANY($1)' : ''}
      //     ORDER BY sa.hub_site_id, sa.sort_order
      //   `, params);
      //   groupAndSet(query.rows, result, 'alteration_nm');
      // }
      }
      
    } else if (attrType === 'refs' || attrType === 'ref') {
      if (attrText === 'material') {
        const query = await pool.query(`
          SELECT sm.hub_site_id, m.material_nm
          FROM sat_site_material sm
          JOIN ref_material m ON sm.material_id = m.material_id
          ${siteIds?.length ? 'WHERE sm.hub_site_id = ANY($1)' : ''}
          ORDER BY sm.hub_site_id, sm.sort_order
        `, params);
        groupAndSet(query.rows, result, 'material_nm');
      } else if (attrText === 'style') {
        const query = await pool.query(`
          SELECT ss.hub_site_id, s.style_nm
          FROM sat_site_style ss
          JOIN ref_style s ON ss.style_id = s.style_id
          ${siteIds?.length ? 'WHERE ss.hub_site_id = ANY($1)' : ''}
          ORDER BY ss.hub_site_id, ss.sort_order
        `, params);
        groupAndSet(query.rows, result, 'style_nm');
      } else if (attrText === 'type') {
        const query = await pool.query(`
          SELECT st.hub_site_id, t.type_nm
          FROM sat_site_type st
          JOIN ref_type t ON st.type_id = t.type_id
          ${siteIds?.length ? 'WHERE st.hub_site_id = ANY($1)' : ''}
          ORDER BY st.hub_site_id, st.sort_order
        `, params);
        groupAndSet(query.rows, result, 'type_nm');
      } else if (attrText === 'use') {
        const query = await pool.query(`
          SELECT su.hub_site_id, u.use_nm
          FROM sat_site_use su
          JOIN ref_use u ON su.use_id = u.use_id
          ${siteIds?.length ? 'WHERE su.hub_site_id = ANY($1)' : ''}
          ORDER BY su.hub_site_id, su.sort_order
        `, params);
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

// Get sites list for Sites list page: full hub_sites rows with filters and pagination.
// Query params: siteId, bin, material, style, use, type (all optional), limit (default 500, max 1000), offset (default 0).
async function getSitesList(req, res) {
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();

    const siteId = (req.query.siteId || '').trim();
    const bin = (req.query.bin || '').trim();
    const material = (req.query.material || '').trim();
    const style = (req.query.style || '').trim();
    const use = (req.query.use || '').trim();
    const type = (req.query.type || '').trim();
    let limit = parseInt(req.query.limit, 10) || 500;
    const maxLimit = parseInt(process.env.MAX_PAGE_LIMIT || '1000', 10);
    if (limit > maxLimit) limit = maxLimit;
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    // Resolve BIN attribute from ref_attributes when bin filter is used
    let binAttr = null;
    if (bin) {
      try {
        const ar = await pool.query(
          `SELECT attribute_id, attribute_type FROM ref_attributes WHERE attribute_p_or_s = 'S' AND (attribute_nm = 'bin' OR attribute_text = 'bin') LIMIT 1`,
          []
        );
        const row = ar.rows[0];
        if (row && ['int', 'txt', 'num', 'ts'].includes(row.attribute_type)) {
          binAttr = { attribute_id: row.attribute_id, attribute_type: row.attribute_type };
        }
      } catch (e) {
        // ref_attributes or sat_site_attributes may not exist; skip BIN filter
      }
    }

    const conditions = [];
    const params = [];
    if (siteId) {
      conditions.push(`h.hub_site_id::text ILIKE $${params.length + 1}`);
      params.push(`%${siteId}%`);
    }
    if (bin && binAttr) {
      const valueCol = { int: 'attribute_value_int', txt: 'attribute_value_text', num: 'attribute_value_number', ts: 'attribute_value_ts' }[binAttr.attribute_type];
      conditions.push(`EXISTS (SELECT 1 FROM sat_site_attributes ssa WHERE ssa.hub_site_id = h.hub_site_id AND ssa.attribute_id = $${params.length + 1} AND ssa.${valueCol}::text ILIKE $${params.length + 2})`);
      params.push(binAttr.attribute_id, `%${bin}%`);
    }
    if (material) {
      conditions.push(`EXISTS (SELECT 1 FROM sat_site_material sm JOIN ref_material m ON sm.material_id = m.material_id WHERE sm.hub_site_id = h.hub_site_id AND m.material_nm ILIKE $${params.length + 1})`);
      params.push(`%${material}%`);
    }
    if (style) {
      conditions.push(`EXISTS (SELECT 1 FROM sat_site_style ss JOIN ref_style s ON ss.style_id = s.style_id WHERE ss.hub_site_id = h.hub_site_id AND s.style_nm ILIKE $${params.length + 1})`);
      params.push(`%${style}%`);
    }
    if (use) {
      conditions.push(`EXISTS (SELECT 1 FROM sat_site_use su JOIN ref_use u ON su.use_id = u.use_id WHERE su.hub_site_id = h.hub_site_id AND u.use_nm ILIKE $${params.length + 1})`);
      params.push(`%${use}%`);
    }
    if (type) {
      conditions.push(`EXISTS (SELECT 1 FROM sat_site_type st JOIN ref_type t ON st.type_id = t.type_id WHERE st.hub_site_id = h.hub_site_id AND t.type_nm ILIKE $${params.length + 1})`);
      params.push(`%${type}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Geometry columns on hub_sites (convert to GeoJSON)
    const geomColRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'hub_sites' AND udt_name = 'geometry'`,
      []
    );
    const geomCols = geomColRes.rows.map(r => r.column_name);

    const allColsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'hub_sites' ORDER BY ordinal_position`,
      []
    );
    const allCols = allColsRes.rows.map(r => r.column_name);
    const selectList = allCols.map(col =>
      geomCols.includes(col) ? `ST_AsGeoJSON(h.${col})::text AS ${col}` : `h.${col}`
    ).join(', ');

    const pk = await getPrimaryKey('hub_sites') || 'hub_site_id';

    // Count
    const countRes = await pool.query(`SELECT COUNT(*) AS count FROM hub_sites h ${whereClause}`, params);
    const count = parseInt(countRes.rows[0].count, 10);

    // Data
    const dataParams = [...params, limit, offset];
    const dataQuery = `SELECT ${selectList} FROM hub_sites h ${whereClause} ORDER BY h.${pk} ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const dataRes = await pool.query(dataQuery, dataParams);
    const data = dataRes.rows.map(r => ({ ...r, id: r.hub_site_id }));

    res.json({ success: true, data, count });
  } catch (error) {
    console.error('getSitesList error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get all available sites (for adding to projects)
// Query params: limit (default 100, max 500, 0 = count only), offset (default 0), q (optional search on hub_site_id)
async function getAllSites(req, res) {
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();
    const limit = Math.min(Math.max(0, parseInt(req.query.limit, 10) || 100), 500);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const q = (req.query.q || '').trim();

    const hasSearch = q.length > 0;

    const searchPattern = `%${q}%`;
    if (limit === 0) {
      // Count-only request (e.g. for splash stats)
      const countQuery = hasSearch
        ? `SELECT COUNT(*) AS total FROM hub_sites WHERE hub_site_id::text ILIKE $1`
        : `SELECT COUNT(*) AS total FROM hub_sites`;
      const countParams = hasSearch ? [searchPattern] : [];
      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total, 10);
      return res.json({ success: true, data: [], total });
    }

    const selectQuery = hasSearch
      ? `SELECT hub_site_id, COUNT(*) OVER() AS _total FROM hub_sites
         WHERE hub_site_id::text ILIKE $1
         ORDER BY hub_site_id
         LIMIT $2 OFFSET $3`
      : `SELECT hub_site_id, COUNT(*) OVER() AS _total FROM hub_sites
         ORDER BY hub_site_id
         LIMIT $1 OFFSET $2`;
    const selectParams = hasSearch ? [searchPattern, limit, offset] : [limit, offset];
    const result = await pool.query(selectQuery, selectParams);
    const total = result.rows[0] ? parseInt(result.rows[0]._total, 10) : 0;
    const sites = result.rows.map(r => ({ hub_site_id: r.hub_site_id, id: r.hub_site_id }));
    res.json({ success: true, data: sites, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update sites for a project (replace all linked sites)
async function updateProjectSites(req, res) {
  const { projectId } = req.params;
  const { siteIds } = req.body || {};
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    if (!Array.isArray(siteIds)) {
      return res.status(400).json({ error: 'siteIds must be an array' });
    }

    // Delete existing site links for this project
    await getPool().query(
      'DELETE FROM lnk_project_site WHERE hub_project_id = $1',
      [projectId]
    );

    // Insert new site links
    for (const siteId of siteIds) {
      await getPool().query(
        'INSERT INTO lnk_project_site (hub_project_id, hub_site_id) VALUES ($1, $2)',
        [projectId, siteId]
      );
    }

    res.json({ success: true, count: siteIds.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Parse shapefile buffer and return GeoJSON
async function parseShapefile(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    
    // Find .shp and .dbf files (case-insensitive)
    const shpEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.shp'));
    const dbfEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.dbf'));
    
    if (!shpEntry) {
      throw new Error('No .shp file found in the uploaded zip');
    }
    
    // Get the buffers
    const shpBuffer = shpEntry.getData();
    const dbfBuffer = dbfEntry ? dbfEntry.getData() : null;
    
    // shapefile.read() accepts ArrayBuffers or Node Buffers
    const geojson = await shapefile.read(shpBuffer, dbfBuffer);
    
    return geojson;
  } catch (err) {
    throw new Error(`Failed to parse shapefile: ${err.message}`);
  }
}

// Combine all features into a single geometry (union/collect)
function combineGeometries(geojson) {
  // Handle FeatureCollection
  if (geojson.type === 'FeatureCollection' && geojson.features) {
    if (geojson.features.length === 0) {
      throw new Error('Shapefile contains no features');
    }
    // If single feature, return its geometry
    if (geojson.features.length === 1) {
      return geojson.features[0].geometry;
    }
    // Multiple features - create a GeometryCollection
    return {
      type: 'GeometryCollection',
      geometries: geojson.features.map(f => f.geometry).filter(g => g)
    };
  }
  
  // Handle array of FeatureCollections (multiple layers)
  if (Array.isArray(geojson)) {
    const allFeatures = geojson.flatMap(fc => fc.features || []);
    if (allFeatures.length === 0) {
      throw new Error('Shapefile contains no features');
    }
    if (allFeatures.length === 1) {
      return allFeatures[0].geometry;
    }
    return {
      type: 'GeometryCollection',
      geometries: allFeatures.map(f => f.geometry).filter(g => g)
    };
  }
  
  // Single Feature
  if (geojson.type === 'Feature' && geojson.geometry) {
    return geojson.geometry;
  }
  
  // Direct geometry
  if (geojson.type && ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'].includes(geojson.type)) {
    return geojson;
  }
  
  throw new Error('Could not extract geometry from shapefile');
}

// Find sites that intersect with the given GeoJSON geometry
async function findSitesFromShapefile(req, res) {
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    
    if (!req.file) {
      return res.status(400).json({ error: 'No shapefile uploaded. Please upload a .zip file containing .shp, .shx, and .dbf files.' });
    }
    
    const pool = getPool();
    
    // Parse the shapefile
    let geojson;
    try {
      geojson = await parseShapefile(req.file.buffer);
    } catch (parseErr) {
      return res.status(400).json({ error: parseErr.message });
    }
    
    // Combine all geometries into one
    let geometry;
    try {
      geometry = combineGeometries(geojson);
    } catch (combineErr) {
      return res.status(400).json({ error: combineErr.message });
    }
    
    const geometryJson = JSON.stringify(geometry);
    
    // Get the geometry column name from sat_site_geometry
    const geomColRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = 'sat_site_geometry' AND udt_name = 'geometry'`
    );
    const geomCol = geomColRes.rows[0]?.column_name;
    
    if (!geomCol || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(geomCol)) {
      return res.status(500).json({ error: 'Could not find geometry column in sat_site_geometry table' });
    }
    
    // Query for intersecting sites
    // We need to handle different SRIDs - transform site geometries to 4326 for comparison
    const result = await pool.query(`
      SELECT DISTINCT sg.hub_site_id
      FROM sat_site_geometry sg
      WHERE ST_Intersects(
        CASE 
          WHEN ST_SRID(sg."${geomCol}") IS NOT NULL AND ST_SRID(sg."${geomCol}") > 0
          THEN ST_Transform(sg."${geomCol}", 4326)
          ELSE sg."${geomCol}"
        END,
        ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
      )
      ORDER BY sg.hub_site_id
    `, [geometryJson]);
    
    const siteIds = result.rows.map(r => r.hub_site_id);
    
    res.json({ 
      success: true, 
      data: siteIds,
      count: siteIds.length
    });
  } catch (error) {
    console.error('findSitesFromShapefile error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Create project with optional shapefile to auto-link sites
async function createProjectWithShapefile(req, res) {
  const tableName = 'hub_projects';
  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();
    
    // Parse form data - fields come as strings in multipart
    let data = {};
    if (req.body) {
      // If projectData is sent as JSON string (from FormData)
      if (req.body.projectData) {
        try {
          data = JSON.parse(req.body.projectData);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid projectData JSON' });
        }
      } else {
        // Regular fields
        data = { ...req.body };
        // Convert numeric strings back to numbers for lat/lng
        if (data.latitude) data.latitude = parseFloat(data.latitude);
        if (data.longitude) data.longitude = parseFloat(data.longitude);
      }
    }

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
    
    // Create the project
    const result = await pool.query(
      `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const row = result.rows[0];
    row.id = row.hub_project_id;
    const projectId = row.hub_project_id;
    
    let linkedSitesCount = 0;
    
    // If shapefile was uploaded, find and link intersecting sites
    if (req.file) {
      try {
        // Parse the shapefile
        const geojson = await parseShapefile(req.file.buffer);
        const geometry = combineGeometries(geojson);
        const geometryJson = JSON.stringify(geometry);
        
        // Get the geometry column name
        const geomColRes = await pool.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_schema = 'public' AND table_name = 'sat_site_geometry' AND udt_name = 'geometry'`
        );
        const geomCol = geomColRes.rows[0]?.column_name;
        
        if (geomCol && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(geomCol)) {
          // Find intersecting sites
          const sitesResult = await pool.query(`
            SELECT DISTINCT sg.hub_site_id
            FROM sat_site_geometry sg
            WHERE ST_Intersects(
              CASE 
                WHEN ST_SRID(sg."${geomCol}") IS NOT NULL AND ST_SRID(sg."${geomCol}") > 0
                THEN ST_Transform(sg."${geomCol}", 4326)
                ELSE sg."${geomCol}"
              END,
              ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
            )
          `, [geometryJson]);
          
          const siteIds = sitesResult.rows.map(r => r.hub_site_id);
          
          // Link sites to project
          for (const siteId of siteIds) {
            await pool.query(
              'INSERT INTO lnk_project_site (hub_project_id, hub_site_id) VALUES ($1, $2)',
              [projectId, siteId]
            );
          }
          
          linkedSitesCount = siteIds.length;
        }
      } catch (shapeErr) {
        // Project was created but shapefile processing failed
        console.error('Shapefile processing error:', shapeErr);
        return res.json({ 
          success: true, 
          data: row,
          linkedSitesCount: 0,
          shapefileError: shapeErr.message
        });
      }
    }
    
    res.json({ success: true, data: row, linkedSitesCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Detect attribute type from JavaScript value
function detectAttributeType(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'num';
  }
  if (typeof value === 'boolean') return 'int'; // Store as 0/1
  if (value instanceof Date) return 'ts';
  if (typeof value === 'string') {
    // Try to detect date strings
    const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (dateMatch && !isNaN(Date.parse(value))) return 'ts';
    return 'txt';
  }
  return 'txt';
}

// Get or create an attribute by name
async function getOrCreateAttribute(pool, fieldName, sampleValue, usedAttributes) {
  // Check cache first
  const cacheKey = fieldName.toLowerCase();
  if (usedAttributes.has(cacheKey)) {
    return usedAttributes.get(cacheKey);
  }

  // Look for existing attribute (case-insensitive)
  const existing = await pool.query(
    `SELECT attribute_id, attribute_type FROM ref_attributes 
     WHERE LOWER(attribute_nm) = LOWER($1) AND attribute_p_or_s = 'S'
     LIMIT 1`,
    [fieldName]
  );

  if (existing.rows.length > 0) {
    const attr = existing.rows[0];
    usedAttributes.set(cacheKey, attr);
    return attr;
  }

  // Create new attribute
  const attrType = detectAttributeType(sampleValue) || 'txt';
  try {
    const insertResult = await pool.query(
      `INSERT INTO ref_attributes (attribute_nm, attribute_text, attribute_p_or_s, attribute_type, create_dt)
       VALUES ($1, $1, 'S', $2, NOW())
       RETURNING attribute_id, attribute_type`,
      [fieldName, attrType]
    );
    const newAttr = insertResult.rows[0];
    usedAttributes.set(cacheKey, newAttr);
    return newAttr;
  } catch (insertErr) {
    // If insert fails (e.g., duplicate from race condition), try to fetch existing
    const retry = await pool.query(
      `SELECT attribute_id, attribute_type FROM ref_attributes 
       WHERE LOWER(attribute_nm) = LOWER($1) LIMIT 1`,
      [fieldName]
    );
    if (retry.rows.length > 0) {
      const attr = retry.rows[0];
      usedAttributes.set(cacheKey, attr);
      return attr;
    }
    throw insertErr;
  }
}

// Helper: Stream data to COPY
function streamToCopy(client, copyQuery, dataGenerator) {
  return new Promise((resolve, reject) => {
    const stream = client.query(copyFrom(copyQuery));
    stream.on('error', reject);
    stream.on('finish', resolve);
    
    for (const line of dataGenerator) {
      stream.write(line + '\n');
    }
    stream.end();
  });
}

// Helper: Escape CSV value
function escapeCsv(val) {
  if (val === null || val === undefined) return '\\N';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\\')) {
    return '"' + str.replace(/"/g, '""').replace(/\\/g, '\\\\') + '"';
  }
  return str;
}

// Import project from shapefile - OPTIMIZED with COPY for bulk loading
async function importProjectFromShapefile(req, res) {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: 'Database not connected' });

  if (!req.file) {
    return res.status(400).json({ error: 'No shapefile uploaded. Please upload a .zip file containing .shp, .shx, and .dbf files.' });
  }

  // Get a dedicated client for transaction
  const client = await pool.connect();
  
  try {
    // Parse the shapefile
    let geojson;
    try {
      geojson = await parseShapefile(req.file.buffer);
    } catch (parseErr) {
      client.release();
      return res.status(400).json({ error: parseErr.message });
    }

    if (!geojson.features || geojson.features.length === 0) {
      client.release();
      return res.status(400).json({ error: 'Shapefile contains no features' });
    }

    const features = geojson.features;
    const filename = req.file.originalname || 'shapefile.zip';
    const projectName = req.body?.projectName || `Import_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const startTime = Date.now();

    console.log(`[BULK IMPORT] Starting import of ${features.length} features from ${filename}`);

    // Begin transaction
    await client.query('BEGIN');

    // Get geometry column name
    const geomColRes = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = 'sat_site_geometry' AND udt_name = 'geometry'`
    );
    const geomCol = geomColRes.rows[0]?.column_name || 'shape';

    // Step 1: Create record source
    const recordSourceResult = await client.query(
      `INSERT INTO ref_record_source (source_system, source_app, source_process, source_owner, create_dt)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING record_source_id`,
      ['shapefile_import', 'ResearchDataHub', 'importProjectFromShapefile', filename]
    );
    const recordSourceId = recordSourceResult.rows[0].record_source_id;

    // Step 2: Create project
    const projectResult = await client.query(
      `INSERT INTO hub_projects (project_nm, project_desc, record_source_id, create_dt)
       VALUES ($1, $2, $3, NOW()) RETURNING hub_project_id`,
      [projectName, `Imported from shapefile: ${filename}`, recordSourceId]
    );
    const projectId = projectResult.rows[0].hub_project_id;

    console.log(`[BULK IMPORT] Created project ${projectId}, extracting field names...`);

    // Step 3: Pre-process - extract all unique field names and their types
    const fieldTypes = new Map(); // fieldName -> detected type
    const validFeatures = [];
    
    for (const feature of features) {
      if (!feature.geometry) continue;
      validFeatures.push(feature);
      
      const props = feature.properties || {};
      for (const [key, val] of Object.entries(props)) {
        if (val === null || val === undefined || val === '') continue;
        if (!fieldTypes.has(key)) {
          fieldTypes.set(key, detectAttributeType(val) || 'txt');
        }
      }
    }

    const skippedFeatures = features.length - validFeatures.length;
    console.log(`[BULK IMPORT] Found ${fieldTypes.size} unique fields, ${validFeatures.length} valid features`);

    // Step 4: Pre-create all attributes
    const attributeMap = new Map(); // fieldName.toLowerCase() -> { attribute_id, attribute_type }
    
    for (const [fieldName, attrType] of fieldTypes) {
      const cacheKey = fieldName.toLowerCase();
      
      // Check if exists
      const existing = await client.query(
        `SELECT attribute_id, attribute_type FROM ref_attributes 
         WHERE LOWER(attribute_nm) = LOWER($1) AND attribute_p_or_s = 'S' LIMIT 1`,
        [fieldName]
      );
      
      if (existing.rows.length > 0) {
        attributeMap.set(cacheKey, existing.rows[0]);
      } else {
        // Create new
        try {
          const insertRes = await client.query(
            `INSERT INTO ref_attributes (attribute_nm, attribute_text, attribute_p_or_s, attribute_type, create_dt)
             VALUES ($1, $1, 'S', $2, NOW()) RETURNING attribute_id, attribute_type`,
            [fieldName, attrType]
          );
          attributeMap.set(cacheKey, insertRes.rows[0]);
        } catch (e) {
          // May already exist from race condition, fetch it
          const retry = await client.query(
            `SELECT attribute_id, attribute_type FROM ref_attributes WHERE LOWER(attribute_nm) = LOWER($1) LIMIT 1`,
            [fieldName]
          );
          if (retry.rows.length > 0) {
            attributeMap.set(cacheKey, retry.rows[0]);
          }
        }
      }
    }

    console.log(`[BULK IMPORT] Pre-created ${attributeMap.size} attributes, reserving site IDs...`);

    // Step 5: Reserve site IDs in bulk
    const siteIdResult = await client.query(
      `SELECT nextval('hub_sites_hub_site_id_seq') as id FROM generate_series(1, $1)`,
      [validFeatures.length]
    );
    const siteIds = siteIdResult.rows.map(r => parseInt(r.id, 10));

    console.log(`[BULK IMPORT] Reserved ${siteIds.length} site IDs, bulk inserting sites...`);

    // Step 6: COPY hub_sites
    const now = new Date().toISOString();
    const sitesData = siteIds.map(id => `${id},${now}`);
    await streamToCopy(client, 
      `COPY hub_sites (hub_site_id, create_dt) FROM STDIN WITH (FORMAT csv)`,
      sitesData
    );

    console.log(`[BULK IMPORT] Inserted ${siteIds.length} sites, bulk inserting project links...`);

    // Step 7: COPY lnk_project_site
    const linksData = siteIds.map(siteId => `${projectId},${siteId},${now}`);
    await streamToCopy(client,
      `COPY lnk_project_site (hub_project_id, hub_site_id, create_dt) FROM STDIN WITH (FORMAT csv)`,
      linksData
    );

    console.log(`[BULK IMPORT] Inserted ${siteIds.length} project links, preparing geometries...`);

    // Step 8: Insert geometries via temp table (for PostGIS transformation)
    await client.query(`
      CREATE TEMP TABLE temp_geom_import (
        hub_site_id INTEGER,
        geom_json TEXT,
        is_state_plane BOOLEAN,
        record_source_id INTEGER
      ) ON COMMIT DROP
    `);

    // Prepare geometry data
    const geomData = [];
    for (let i = 0; i < validFeatures.length; i++) {
      const feature = validFeatures[i];
      const siteId = siteIds[i];
      const geomJson = JSON.stringify(feature.geometry);
      
      // Detect CRS from coordinates
      const coords = feature.geometry.coordinates;
      let firstCoord;
      try {
        firstCoord = Array.isArray(coords[0]) 
          ? (Array.isArray(coords[0][0]) ? coords[0][0][0] : coords[0][0])
          : coords[0];
      } catch (e) {
        firstCoord = 0;
      }
      const isStatePlane = typeof firstCoord === 'number' && Math.abs(firstCoord) > 1000;
      
      geomData.push(`${siteId},${escapeCsv(geomJson)},${isStatePlane ? 't' : 'f'},${recordSourceId}`);
    }

    await streamToCopy(client,
      `COPY temp_geom_import (hub_site_id, geom_json, is_state_plane, record_source_id) FROM STDIN WITH (FORMAT csv)`,
      geomData
    );

    console.log(`[BULK IMPORT] Loaded ${geomData.length} geometries to temp table, transforming...`);

    // Insert geometries with proper transformation
    const geomInsertResult = await client.query(`
      INSERT INTO sat_site_geometry (hub_site_id, "${geomCol}", record_source_id, start_dt)
      SELECT 
        hub_site_id,
        CASE 
          WHEN is_state_plane THEN ST_SetSRID(ST_GeomFromGeoJSON(geom_json), 2263)
          ELSE ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geom_json), 4326), 2263)
        END,
        record_source_id,
        NOW()
      FROM temp_geom_import
      WHERE geom_json IS NOT NULL AND geom_json != ''
    `);

    console.log(`[BULK IMPORT] Inserted ${geomInsertResult.rowCount} geometries, preparing attributes...`);

    // Step 9: Use temp table for attributes (faster than direct COPY for large datasets)
    await client.query(`
      CREATE TEMP TABLE temp_attr_import (
        hub_site_id INTEGER,
        attribute_id INTEGER,
        attribute_value_text TEXT,
        attribute_value_int INTEGER,
        attribute_value_number NUMERIC,
        attribute_value_ts TIMESTAMP,
        record_source_id INTEGER,
        start_dt TIMESTAMP
      ) ON COMMIT DROP
    `);

    // Process attributes in batches of 100K rows
    const BATCH_SIZE = 100000;
    let attrBatch = [];
    let totalAttrs = 0;
    
    for (let i = 0; i < validFeatures.length; i++) {
      const feature = validFeatures[i];
      const siteId = siteIds[i];
      const props = feature.properties || {};
      
      for (const [fieldName, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === '') continue;
        
        const attr = attributeMap.get(fieldName.toLowerCase());
        if (!attr) continue;
        
        let valText = '\\N', valInt = '\\N', valNum = '\\N', valTs = '\\N';
        
        switch (attr.attribute_type) {
          case 'int':
            const intVal = typeof value === 'boolean' ? (value ? 1 : 0) : parseInt(value, 10);
            if (!isNaN(intVal)) valInt = intVal;
            break;
          case 'num':
            const numVal = parseFloat(value);
            if (!isNaN(numVal)) valNum = numVal;
            break;
          case 'ts':
            const tsVal = new Date(value);
            if (!isNaN(tsVal.getTime())) valTs = tsVal.toISOString();
            break;
          default:
            valText = escapeCsv(String(value));
        }
        
        attrBatch.push(`${siteId},${attr.attribute_id},${valText},${valInt},${valNum},${valTs},${recordSourceId},${now}`);
        totalAttrs++;
        
        // Flush batch when full
        if (attrBatch.length >= BATCH_SIZE) {
          await streamToCopy(client,
            `COPY temp_attr_import (hub_site_id, attribute_id, attribute_value_text, attribute_value_int, attribute_value_number, attribute_value_ts, record_source_id, start_dt) FROM STDIN WITH (FORMAT csv, NULL '\\N')`,
            attrBatch
          );
          console.log(`[BULK IMPORT] Loaded ${totalAttrs} attributes to temp table...`);
          attrBatch = [];
        }
      }
    }
    
    // Flush remaining batch
    if (attrBatch.length > 0) {
      await streamToCopy(client,
        `COPY temp_attr_import (hub_site_id, attribute_id, attribute_value_text, attribute_value_int, attribute_value_number, attribute_value_ts, record_source_id, start_dt) FROM STDIN WITH (FORMAT csv, NULL '\\N')`,
        attrBatch
      );
    }

    console.log(`[BULK IMPORT] Loaded ${totalAttrs} attributes to temp table, inserting to final table...`);

    // Bulk insert from temp table to final table
    const attrInsertResult = await client.query(`
      INSERT INTO sat_site_attributes (hub_site_id, attribute_id, attribute_value_text, attribute_value_int, attribute_value_number, attribute_value_ts, record_source_id, start_dt)
      SELECT hub_site_id, attribute_id, attribute_value_text, attribute_value_int, attribute_value_number, attribute_value_ts, record_source_id, start_dt
      FROM temp_attr_import
    `);

    console.log(`[BULK IMPORT] Inserted ${attrInsertResult.rowCount} attribute values`);

    // Step 10: Link attributes to project
    console.log(`[BULK IMPORT] Linking ${attributeMap.size} attributes to project...`);
    
    let sortOrder = 0;
    for (const [, attr] of attributeMap) {
      await client.query(
        `INSERT INTO sat_project_site_attributes (hub_project_id, attribute_id, sort_order, create_dt)
         VALUES ($1, $2, $3, NOW()) ON CONFLICT (hub_project_id, attribute_id) DO NOTHING`,
        [projectId, attr.attribute_id, sortOrder++]
      );
    }

    // Commit transaction
    await client.query('COMMIT');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[BULK IMPORT] Complete! ${siteIds.length} sites, ${totalAttrs} attributes in ${elapsed}s`);

    res.json({
      success: true,
      data: {
        projectId,
        projectName,
        recordSourceId,
        sitesCreated: siteIds.length,
        sitesSkipped: skippedFeatures,
        attributesUsed: attributeMap.size,
        attributeNames: Array.from(attributeMap.keys()),
        elapsedSeconds: parseFloat(elapsed)
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('importProjectFromShapefile error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

module.exports = { 
  listProjects, 
  getProjectSites,
  getProjectSitesClustered,
  createProject, 
  updateProject, 
  deleteProject,
  getProjectSiteAttributes,
  updateProjectSiteAttributes,
  getSiteAttributes,
  getSitesWithAttributes,
  getSitesList,
  getAllSites,
  updateProjectSites,
  findSitesFromShapefile,
  createProjectWithShapefile,
  importProjectFromShapefile
};
