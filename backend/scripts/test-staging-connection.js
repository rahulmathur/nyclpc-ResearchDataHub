#!/usr/bin/env node

require('dotenv').config({ path: '.env.staging' });
const { Pool } = require('pg');

async function testStagingConnection() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Testing staging database connection...');
    console.log('Host:', process.env.DB_HOST);
    console.log('Database:', process.env.DB_NAME);
    console.log('');
    
    const result = await pool.query('SELECT version(), current_database()');
    console.log('✅ Connected successfully!');
    console.log('PostgreSQL Version:', result.rows[0].version.split(',')[0]);
    console.log('Current Database:', result.rows[0].current_database);
    console.log('');
    
    // Check if database is empty
    const tableCount = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('📊 Tables in database:', tableCount.rows[0].count);
    
    if (tableCount.rows[0].count === '0') {
      console.log('✅ Database is empty and ready for migration!');
    } else {
      console.log('⚠️  Database already has tables');
    }
    
    await pool.end();
    console.log('');
    console.log('Ready to migrate from dev to staging!');
  } catch (e) {
    console.error('❌ Connection failed:', e.message);
    process.exit(1);
  }
}

testStagingConnection();
