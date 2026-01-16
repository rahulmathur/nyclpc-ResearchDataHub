// Only load .env in development/local environments
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

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
app.use(express.json());

// Database connection based on DB_TYPE in .env
let db;

const initializeDatabase = async () => {
  try {
    console.log('Connecting to PostgreSQL...');
    console.log('DB_HOST:', process.env.DB_HOST);
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
    if (!db) return res.status(500).json({ error: 'Database not connected' });
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
app.put('/api/projects/:projectId', projectsController.updateProject);
app.delete('/api/projects/:projectId', projectsController.deleteProject);
app.get('/api/projects/:projectId/sites', projectsController.getProjectSites);
app.put('/api/projects/:projectId/sites', projectsController.updateProjectSites);
app.get('/api/projects/:projectId/site-attributes', projectsController.getProjectSiteAttributes);
app.put('/api/projects/:projectId/site-attributes', projectsController.updateProjectSiteAttributes);
app.get('/api/projects/:projectId/sites-with-attributes', projectsController.getSitesWithAttributes);
app.get('/api/site-attributes', projectsController.getSiteAttributes);
app.get('/api/sites', projectsController.getAllSites);

// Table/columns/projects routes are now implemented in separate controllers (see ./controllers/*)


// Sites for a project handled by projectsController.getProjectSites

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
