const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.development' });

async function addProjectGuid() {
  console.log('🔧 Adding hub_project_guid column to hub_projects...');
  
  // Create database connection
  const poolConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  // Optional SSL for AWS
  if (fs.existsSync('./ca_certificate_aws-rds.pem')) {
    poolConfig.ssl = { 
      rejectUnauthorized: true, 
      ca: fs.readFileSync('./ca_certificate_aws-rds.pem').toString() 
    };
  }

  const pool = new Pool(poolConfig);

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // Check if column already exists
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'hub_projects' 
        AND column_name = 'hub_project_guid'
    `);

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Column hub_project_guid already exists. Skipping migration.');
      await pool.end();
      return;
    }

    // Add column with default UUID generation
    console.log('📝 Adding hub_project_guid column...');
    await pool.query(`
      ALTER TABLE hub_projects 
      ADD COLUMN hub_project_guid UUID DEFAULT gen_random_uuid()
    `);
    console.log('✅ Column added with default UUID generation');

    // Backfill existing projects that might not have UUIDs
    console.log('🔄 Backfilling UUIDs for existing projects...');
    await pool.query(`
      UPDATE hub_projects 
      SET hub_project_guid = gen_random_uuid() 
      WHERE hub_project_guid IS NULL
    `);
    
    const countResult = await pool.query('SELECT COUNT(*) as count FROM hub_projects');
    console.log(`✅ Backfilled ${countResult.rows[0].count} projects`);

    // Make column NOT NULL
    console.log('🔒 Making column NOT NULL...');
    await pool.query(`
      ALTER TABLE hub_projects 
      ALTER COLUMN hub_project_guid SET NOT NULL
    `);
    console.log('✅ Column is now NOT NULL');

    // Create index for faster lookups
    console.log('📊 Creating index on hub_project_guid...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_hub_projects_hub_project_guid 
      ON hub_projects(hub_project_guid)
    `);
    console.log('✅ Index created');

    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
addProjectGuid().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
