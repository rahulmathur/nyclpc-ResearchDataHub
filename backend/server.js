// Only load .env in development/local environments
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { requireDatabaseConnection } = require('./middleware/dbConnection');

const app = express();

// Configure multer for file uploads (memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only .zip files
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files containing shapefiles are allowed'), false);
    }
  }
});

// Configure multer for Box.com uploads (accepts all file types)
const uploadBox = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for Box.com
  },
});
const PORT = process.env.PORT || 5001;

// Middleware
// CORS configuration - restrict origins in production
const corsOptions = {
  origin: process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',')
    : process.env.NODE_ENV === 'production'
      ? false // Deny all in production if not configured
      : true, // Allow all in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Database connection middleware - ensures DB is connected for all API routes except /health
app.use('/api', requireDatabaseConnection);

// Database connection based on DB_TYPE in .env
let db;

const initializeDatabase = async () => {
  try {
    console.log('Connecting to PostgreSQL...');
    const { Pool } = require('pg');

    const poolConfig = {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

    // SSL configuration: Railway uses self-signed certs; AWS RDS can use CA bundle when present
    if (process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('rlwy'))) {
      console.log('Using Railway SSL (self-signed)');
      poolConfig.ssl = { rejectUnauthorized: false };
    } else if (fs.existsSync('./ca_certificate_aws-rds.pem')) {
      console.log('Using AWS RDS SSL certificate');
      poolConfig.ssl = { rejectUnauthorized: true, ca: fs.readFileSync('./ca_certificate_aws-rds.pem').toString() };
    }

    const pool = new Pool(poolConfig);
    await pool.query('SELECT NOW()');
    // expose pool to controllers via db/index.js
    require('./db').setPool(pool);
    db = pool;
    console.log('✅ Connected to PostgreSQL');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('Server will start but database operations will fail');
  }
};

// Generic query endpoint (PostgreSQL only)
const { runQuery } = require('./controllers/queryController');
app.post('/api/query', runQuery);

// Get all tables (PostgreSQL only)
app.get('/api/tables', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = result.rows.map(row => row.table_name);
    res.json({ success: true, tables });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch site geometries: fetch from sat_site_geometry for given hub_site_ids (used by project map; avoids limit/ordering of generic table API)
app.post('/api/sites/geometries', async (req, res) => {
  const { siteIds } = req.body || {};
  const { getPool } = require('./db');
  try {
    const pool = getPool();
    if (!Array.isArray(siteIds) || siteIds.length === 0) return res.json({ success: true, data: [] });
    const ids = siteIds.map((id) => parseInt(String(id), 10)).filter((n) => !isNaN(n));
    if (ids.length === 0) return res.json({ success: true, data: [] });

    const geomColRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sat_site_geometry' AND udt_name = 'geometry'`
    );
    const geomCol = geomColRes.rows[0]?.column_name;
    if (!geomCol || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(geomCol)) return res.json({ success: true, data: [] });

    const result = await pool.query(
      `SELECT hub_site_id,
        CASE WHEN ST_SRID("${geomCol}") IS NOT NULL AND ST_SRID("${geomCol}") > 0
          THEN ST_AsGeoJSON(ST_Transform("${geomCol}", 4326))::text
          ELSE ST_AsGeoJSON("${geomCol}")::text
        END AS geometry
       FROM sat_site_geometry WHERE hub_site_id = ANY($1)`,
      [ids]
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error('POST /api/sites/geometries', e);
    res.status(500).json({ error: e.message });
  }
});

// Site geometry: fetch from sat_site_geometry by hub_site_id (avoids limit/offset of generic table API)
app.get('/api/sites/:siteId/geometry', async (req, res) => {
  const { siteId } = req.params;
  const { getPool } = require('./db');
  try {
    const pool = getPool();
    const geomColRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sat_site_geometry' AND udt_name = 'geometry'`
    );
    const geomCol = geomColRes.rows[0]?.column_name;
    if (!geomCol || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(geomCol)) return res.json({ success: true, data: [] });
    const result = await pool.query(
      `SELECT hub_site_id,
        CASE WHEN ST_SRID("${geomCol}") IS NOT NULL AND ST_SRID("${geomCol}") > 0
          THEN ST_AsGeoJSON(ST_Transform("${geomCol}", 4326))::text
          ELSE ST_AsGeoJSON("${geomCol}")::text
        END AS geometry
       FROM sat_site_geometry WHERE hub_site_id = $1`,
      [siteId]
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error('GET /api/sites/:siteId/geometry', e);
    res.status(500).json({ error: e.message });
  }
});

// Table CRUD & listing endpoints
const tableController = require('./controllers/tableController');
app.get('/api/table/:tableName', tableController.getTableData);
app.post('/api/table/:tableName', tableController.insertRecord);
app.put('/api/table/:tableName/:id', tableController.updateRecord);
app.delete('/api/table/:tableName/:id', tableController.deleteRecord);

// Columns metadata
const columnsController = require('./controllers/columnsController');
app.get('/api/columns/:tableName', columnsController.getColumns);

// Projects endpoints
const projectsController = require('./controllers/projectsController');
app.get('/api/projects', projectsController.listProjects);
app.post('/api/projects', projectsController.createProject);
// Create project with shapefile upload (multipart form) - links existing sites
app.post('/api/projects/with-shapefile', upload.single('shapefile'), projectsController.createProjectWithShapefile);
// Import project from shapefile - creates new sites from shapefile features
app.post('/api/projects/import-shapefile', upload.single('shapefile'), projectsController.importProjectFromShapefile);
app.put('/api/projects/:projectId', projectsController.updateProject);
app.delete('/api/projects/:projectId', projectsController.deleteProject);
app.get('/api/projects/:projectId/sites', projectsController.getProjectSites);
app.get('/api/projects/:projectId/sites/clustered', projectsController.getProjectSitesClustered);
app.put('/api/projects/:projectId/sites', projectsController.updateProjectSites);
app.get('/api/projects/:projectId/site-attributes', projectsController.getProjectSiteAttributes);
app.put('/api/projects/:projectId/site-attributes', projectsController.updateProjectSiteAttributes);
app.get('/api/projects/:projectId/sites-with-attributes', projectsController.getSitesWithAttributes);
app.get('/api/site-attributes', projectsController.getSiteAttributes);
app.get('/api/sites/list', projectsController.getSitesList);
app.get('/api/sites', projectsController.getAllSites);
// Find sites from shapefile (standalone endpoint)
app.post('/api/sites/from-shapefile', upload.single('shapefile'), projectsController.findSitesFromShapefile);

// Box.com file management endpoints
const boxController = require('./controllers/boxController');
app.get('/api/box/verify', boxController.verifyBoxToken);
app.get('/api/projects/:projectId/files', boxController.getProjectFiles);
app.get('/api/projects/:projectId/folder-info', boxController.getProjectFolderInfo);
app.post('/api/projects/:projectId/files', uploadBox.single('file'), boxController.uploadFile);
app.post('/api/projects/:projectId/folders', boxController.createFolder);
app.delete('/api/projects/:projectId/files/:fileId', boxController.deleteFile);

// Health check
app.get('/api/health', async (req, res) => {
  const dbStatus = db ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok', 
    database: dbStatus,
    dbType: process.env.DB_TYPE || 'none'
  });
});

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
