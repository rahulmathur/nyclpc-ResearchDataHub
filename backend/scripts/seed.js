#!/usr/bin/env node
/**
 * Database seeding script for staging environment
 * 
 * Usage:
 *   npm run seed
 * 
 * Environment:
 *   Set DB_* variables in .env or pass via Railway environment
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

async function seed() {
  console.log('🌱 Starting database seed...');
  
  // Create database connection
  const poolConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  // Optional SSL for Railway/AWS
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

    // ========================================
    // 1. Create tables (if they don't exist)
    // ========================================
    console.log('\n📋 Creating tables...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_projects (
        hub_project_id SERIAL PRIMARY KEY,
        project_name VARCHAR(255) NOT NULL,
        project_description TEXT,
        project_status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ hub_projects');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_sites (
        hub_site_id SERIAL PRIMARY KEY,
        site_name VARCHAR(255) NOT NULL,
        site_address TEXT,
        site_type VARCHAR(100),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ hub_sites');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lnk_project_site (
        hub_project_id INTEGER REFERENCES hub_projects(hub_project_id) ON DELETE CASCADE,
        hub_site_id INTEGER REFERENCES hub_sites(hub_site_id) ON DELETE CASCADE,
        linked_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (hub_project_id, hub_site_id)
      );
    `);
    console.log('  ✓ lnk_project_site');

    // ========================================
    // 2. Clear existing data (optional - comment out if you want to keep data)
    // ========================================
    console.log('\n🧹 Clearing existing data...');
    await pool.query('TRUNCATE TABLE lnk_project_site, hub_sites, hub_projects RESTART IDENTITY CASCADE;');
    console.log('  ✓ Tables cleared');

    // ========================================
    // 3. Insert seed data
    // ========================================
    console.log('\n📦 Inserting seed data...');

    // Projects
    const projectsResult = await pool.query(`
      INSERT INTO hub_projects (project_name, project_description, project_status)
      VALUES 
        ('NYC Landmarks Survey 2026', 'Comprehensive survey of historic landmarks across NYC boroughs', 'active'),
        ('Brooklyn Bridge Conservation', 'Documentation and preservation of Brooklyn Bridge architectural details', 'active'),
        ('Greenwich Village Historic District', 'Research project for Greenwich Village historic preservation', 'planning'),
        ('Art Deco Buildings Study', 'Catalog of Art Deco architecture in Manhattan', 'completed')
      RETURNING hub_project_id, project_name;
    `);
    console.log(`  ✓ Inserted ${projectsResult.rows.length} projects`);

    // Sites
    const sitesResult = await pool.query(`
      INSERT INTO hub_sites (site_name, site_address, site_type, latitude, longitude)
      VALUES 
        ('Empire State Building', '350 5th Ave, New York, NY 10118', 'Landmark', 40.748817, -73.985428),
        ('Chrysler Building', '405 Lexington Ave, New York, NY 10174', 'Landmark', 40.751652, -73.975311),
        ('Brooklyn Bridge', 'Brooklyn Bridge, New York, NY 10038', 'Bridge', 40.706086, -73.996864),
        ('Grand Central Terminal', '89 E 42nd St, New York, NY 10017', 'Transportation', 40.752726, -73.977229),
        ('Flatiron Building', '175 5th Ave, New York, NY 10010', 'Landmark', 40.741112, -73.989723),
        ('Washington Square Arch', 'Washington Square Park, New York, NY 10012', 'Monument', 40.730823, -73.997332),
        ('Woolworth Building', '233 Broadway, New York, NY 10279', 'Landmark', 40.712345, -74.008432)
      RETURNING hub_site_id, site_name;
    `);
    console.log(`  ✓ Inserted ${sitesResult.rows.length} sites`);

    // Project-Site relationships
    const linksResult = await pool.query(`
      INSERT INTO lnk_project_site (hub_project_id, hub_site_id)
      VALUES 
        (1, 1), (1, 2), (1, 4), (1, 5),  -- NYC Landmarks Survey has 4 sites
        (2, 3),                            -- Brooklyn Bridge Conservation
        (3, 6),                            -- Greenwich Village
        (4, 1), (4, 2), (4, 5), (4, 7)    -- Art Deco Study has 4 sites
      RETURNING hub_project_id, hub_site_id;
    `);
    console.log(`  ✓ Linked ${linksResult.rows.length} project-site relationships`);

    // ========================================
    // 4. Verify seeded data
    // ========================================
    console.log('\n✅ Seed completed successfully!\n');
    
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM hub_projects) as projects,
        (SELECT COUNT(*) FROM hub_sites) as sites,
        (SELECT COUNT(*) FROM lnk_project_site) as links
    `);
    
    console.log('📊 Database summary:');
    console.log(`   Projects: ${stats.rows[0].projects}`);
    console.log(`   Sites: ${stats.rows[0].sites}`);
    console.log(`   Links: ${stats.rows[0].links}`);
    console.log('');

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run seed
seed();
