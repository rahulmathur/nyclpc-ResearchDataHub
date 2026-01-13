require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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

    // Optional SSL bundle if available
    if (fs.existsSync('./ca_certificate_aws-rds.pem')) {
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
app.get('/api/projects/:projectId/site-attributes', projectsController.getProjectSiteAttributes);
app.put('/api/projects/:projectId/site-attributes', projectsController.updateProjectSiteAttributes);
app.get('/api/site-attributes', projectsController.getSiteAttributes);

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
