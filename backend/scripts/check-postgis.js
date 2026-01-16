#!/usr/bin/env node

require('dotenv').config({ path: '.env.staging' });
const { Pool } = require('pg');

async function checkPostGIS() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check if PostGIS extension exists
    const extCheck = await pool.query("SELECT * FROM pg_extension WHERE extname = 'postgis'");
    
    if (extCheck.rows.length > 0) {
      console.log('✅ PostGIS extension IS installed');
      console.log('Extension details:', extCheck.rows[0]);
      
      // Get version
      const versionCheck = await pool.query('SELECT postgis_version()');
      console.log('Version:', versionCheck.rows[0].postgis_version);
    } else {
      console.log('❌ PostGIS extension is NOT installed');
      
      // Try to install it
      console.log('\nAttempting to install PostGIS...');
      try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
        console.log('✅ PostGIS extension installed successfully!');
        
        // Verify
        const versionCheck = await pool.query('SELECT postgis_version()');
        console.log('Version:', versionCheck.rows[0].postgis_version);
      } catch (installErr) {
        console.log('❌ Cannot install PostGIS:', installErr.message);
      }
    }
    
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkPostGIS();
