#!/usr/bin/env node
/**
 * PostGIS Intersection Test
 * 
 * Imports GeoJSON building footprints and boundary polygons into PostGIS,
 * runs a spatial intersection query, and outputs matching records to a new table.
 * 
 * Supports both GeoJSON and Shapefile for boundaries (shapefile requires ogr2ogr/GDAL).
 * 
 * Usage:
 *   node scripts/intersect-test.js \
 *     --geojson /path/to/buildings.geojson \
 *     --boundaries /path/to/boundaries.geojson \
 *     --output-table intersection_results
 * 
 * Options:
 *   --geojson       Path to GeoJSON file with building footprints
 *   --boundaries    Path to boundaries file (GeoJSON or Shapefile)
 *   --shapefile     Alias for --boundaries (for shapefile input)
 *   --output-table  Name of output table (default: intersection_results)
 *   --env           Environment file to use: development or staging (default: development)
 *   --keep-temp     Keep temporary tables after completion
 *   --batch-size    Batch size for GeoJSON import (default: 1000)
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { Pool } = require('pg');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    geojson: null,
    boundaries: null,
    outputTable: 'intersection_results',
    env: 'development',
    keepTemp: false,
    batchSize: 1000
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--geojson':
        options.geojson = args[++i];
        break;
      case '--boundaries':
      case '--shapefile':
        options.boundaries = args[++i];
        break;
      case '--output-table':
        options.outputTable = args[++i];
        break;
      case '--env':
        options.env = args[++i];
        break;
      case '--keep-temp':
        options.keepTemp = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return options;
}

function printUsage() {
  console.log(`
PostGIS Intersection Test
=========================

Usage:
  node scripts/intersect-test.js --geojson <path> --boundaries <path> [options]

Required:
  --geojson <path>       Path to GeoJSON file with building footprints
  --boundaries <path>    Path to boundaries file (GeoJSON or Shapefile)
                         (alias: --shapefile)

Options:
  --output-table <name>  Name of output table (default: intersection_results)
  --env <env>            Environment: development or staging (default: development)
  --keep-temp            Keep temporary tables after completion
  --batch-size <n>       Batch size for GeoJSON import (default: 1000)
  --help, -h             Show this help message

Examples:
  # Using GeoJSON for both inputs (no GDAL required):
  node scripts/intersect-test.js \\
    --geojson ~/data/buildings.geojson \\
    --boundaries ~/data/boundaries.geojson \\
    --output-table my_results

  # Using Shapefile for boundaries (requires ogr2ogr/GDAL):
  node scripts/intersect-test.js \\
    --geojson ~/data/buildings.geojson \\
    --boundaries ~/data/boundaries.shp \\
    --output-table my_results
`);
}

// Parse .env file
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Environment file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim();
    }
  });
  return env;
}

// Check if ogr2ogr is available
function checkOgr2ogr() {
  try {
    execSync('which ogr2ogr', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Create database pool
function createPool(envConfig) {
  const poolConfig = {
    host: envConfig.DB_HOST,
    port: envConfig.DB_PORT || 5432,
    database: envConfig.DB_NAME,
    user: envConfig.DB_USER,
    password: envConfig.DB_PASSWORD
  };

  // Add SSL for non-localhost connections
  if (envConfig.DB_HOST !== 'localhost' && envConfig.DB_HOST !== '127.0.0.1') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  return new Pool(poolConfig);
}

// Check PostGIS is installed
async function checkPostGIS(pool) {
  const result = await pool.query("SELECT * FROM pg_extension WHERE extname = 'postgis'");
  if (result.rows.length === 0) {
    console.log('⚠️  PostGIS not found, attempting to install...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
    console.log('✅ PostGIS extension installed');
  }
  const version = await pool.query('SELECT postgis_version()');
  return version.rows[0].postgis_version;
}

// Import GeoJSON file into a temporary table
async function importGeoJSON(pool, geojsonPath, tableName, batchSize) {
  console.log(`\n📥 Importing GeoJSON: ${geojsonPath}`);
  console.log(`   Target table: ${tableName}`);

  // Read and parse GeoJSON
  const fileContent = fs.readFileSync(geojsonPath, 'utf8');
  const geojson = JSON.parse(fileContent);

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error('Invalid GeoJSON: expected FeatureCollection with features array');
  }

  const features = geojson.features;
  const totalFeatures = features.length;
  console.log(`   Total features: ${totalFeatures.toLocaleString()}`);

  // Determine properties schema from first feature
  const sampleProps = features[0]?.properties || {};
  const propColumns = Object.keys(sampleProps);

  // Build column definitions for properties
  const propColumnDefs = propColumns.map(col => {
    const val = sampleProps[col];
    let type = 'TEXT';
    if (typeof val === 'number') {
      type = Number.isInteger(val) ? 'BIGINT' : 'DOUBLE PRECISION';
    } else if (typeof val === 'boolean') {
      type = 'BOOLEAN';
    }
    return `"${col}" ${type}`;
  }).join(', ');

  // Drop existing table and create new one
  await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  
  const createSQL = `
    CREATE TABLE ${tableName} (
      id SERIAL PRIMARY KEY,
      geom GEOMETRY(Geometry, 4326)
      ${propColumnDefs ? ', ' + propColumnDefs : ''}
    )
  `;
  await pool.query(createSQL);
  console.log(`   ✅ Created table ${tableName}`);

  // Import features in batches
  let imported = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < features.length; i += batchSize) {
    const batch = features.slice(i, i + batchSize);
    
    // Build batch insert
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const feature of batch) {
      if (!feature.geometry) {
        skipped++;
        continue;
      }

      const geomJson = JSON.stringify(feature.geometry);
      const props = feature.properties || {};
      
      const rowPlaceholders = [`ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex++}), 4326)`];
      values.push(geomJson);

      for (const col of propColumns) {
        rowPlaceholders.push(`$${paramIndex++}`);
        values.push(props[col] ?? null);
      }

      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    if (placeholders.length > 0) {
      const insertSQL = `
        INSERT INTO ${tableName} (geom${propColumns.length ? ', "' + propColumns.join('", "') + '"' : ''})
        VALUES ${placeholders.join(', ')}
      `;
      await pool.query(insertSQL, values);
      imported += placeholders.length;
    }

    // Progress report
    const progress = Math.min(100, Math.round((i + batch.length) / totalFeatures * 100));
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r   Progress: ${progress}% (${imported.toLocaleString()} imported, ${elapsed}s)`);
  }

  console.log(`\n   ✅ Imported ${imported.toLocaleString()} features (${skipped} skipped)`);
  return imported;
}

// Import shapefile using ogr2ogr
async function importShapefile(pool, shapefilePath, tableName, envConfig) {
  console.log(`\n📥 Importing Shapefile: ${shapefilePath}`);
  console.log(`   Target table: ${tableName}`);

  // Build connection string for ogr2ogr
  const pgConnStr = `PG:host=${envConfig.DB_HOST} port=${envConfig.DB_PORT || 5432} dbname=${envConfig.DB_NAME} user=${envConfig.DB_USER} password=${envConfig.DB_PASSWORD}`;

  // Drop existing table first
  await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);

  // Build ogr2ogr command
  const args = [
    '-f', 'PostgreSQL',
    pgConnStr,
    shapefilePath,
    '-nln', tableName,
    '-overwrite',
    '-t_srs', 'EPSG:4326',  // Transform to WGS84
    '-lco', 'GEOMETRY_NAME=geom',
    '-lco', 'FID=ogc_fid'
  ];

  console.log('   Running ogr2ogr...');
  
  const result = spawnSync('ogr2ogr', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024  // 50MB buffer
  });

  if (result.status !== 0) {
    console.error('   ogr2ogr stderr:', result.stderr);
    throw new Error(`ogr2ogr failed with exit code ${result.status}`);
  }

  // Get count
  const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
  const count = parseInt(countResult.rows[0].cnt, 10);
  console.log(`   ✅ Imported ${count.toLocaleString()} boundary features`);

  return count;
}

// Create spatial indexes
async function createSpatialIndexes(pool, buildingsTable, boundariesTable) {
  console.log('\n🔧 Creating spatial indexes...');

  const startTime = Date.now();

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_${buildingsTable}_geom ON ${buildingsTable} USING GIST(geom)`);
  console.log(`   ✅ Index on ${buildingsTable}.geom`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_${boundariesTable}_geom ON ${boundariesTable} USING GIST(geom)`);
  console.log(`   ✅ Index on ${boundariesTable}.geom`);

  // Analyze tables for query planner
  await pool.query(`ANALYZE ${buildingsTable}`);
  await pool.query(`ANALYZE ${boundariesTable}`);
  console.log('   ✅ Tables analyzed');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   Indexing completed in ${elapsed}s`);
}

// Run intersection query
async function runIntersection(pool, buildingsTable, boundariesTable, outputTable) {
  console.log('\n🔍 Running intersection query...');
  console.log(`   Buildings: ${buildingsTable}`);
  console.log(`   Boundaries: ${boundariesTable}`);
  console.log(`   Output: ${outputTable}`);

  // Drop existing output table
  await pool.query(`DROP TABLE IF EXISTS ${outputTable} CASCADE`);

  const startTime = Date.now();

  // Run intersection query with DISTINCT to avoid duplicates if a building
  // intersects multiple boundary polygons
  const intersectSQL = `
    CREATE TABLE ${outputTable} AS
    SELECT DISTINCT ON (b.id) b.*
    FROM ${buildingsTable} b
    JOIN ${boundariesTable} bnd ON ST_Intersects(b.geom, bnd.geom)
  `;

  await pool.query(intersectSQL);

  // Get result count
  const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM ${outputTable}`);
  const count = parseInt(countResult.rows[0].cnt, 10);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ Found ${count.toLocaleString()} intersecting features in ${elapsed}s`);

  // Create spatial index on output
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_${outputTable}_geom ON ${outputTable} USING GIST(geom)`);
  console.log(`   ✅ Created spatial index on output table`);

  return count;
}

// Clean up temporary tables
async function cleanupTempTables(pool, tables) {
  console.log('\n🧹 Cleaning up temporary tables...');
  for (const table of tables) {
    await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    console.log(`   ✅ Dropped ${table}`);
  }
}

// Detect file type from extension
function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.geojson' || ext === '.json') return 'geojson';
  if (ext === '.shp') return 'shapefile';
  return 'unknown';
}

// Import boundaries (auto-detect GeoJSON or Shapefile)
async function importBoundaries(pool, boundariesPath, tableName, envConfig, batchSize) {
  const fileType = getFileType(boundariesPath);
  
  if (fileType === 'geojson') {
    return await importGeoJSON(pool, boundariesPath, tableName, batchSize);
  } else if (fileType === 'shapefile') {
    // Check ogr2ogr for shapefile
    if (!checkOgr2ogr()) {
      console.error('\n❌ Error: Shapefile import requires ogr2ogr (GDAL)');
      console.error('   Install GDAL: brew install gdal (macOS) or apt install gdal-bin (Ubuntu)');
      console.error('   Or convert your shapefile to GeoJSON and use --boundaries with the .geojson file');
      process.exit(1);
    }
    return await importShapefile(pool, boundariesPath, tableName, envConfig);
  } else {
    throw new Error(`Unknown file type for boundaries: ${boundariesPath}. Use .geojson or .shp`);
  }
}

// Main function
async function main() {
  const options = parseArgs();

  // Validate required options
  if (!options.geojson || !options.boundaries) {
    console.error('❌ Error: --geojson and --boundaries are required');
    printUsage();
    process.exit(1);
  }

  // Check files exist
  if (!fs.existsSync(options.geojson)) {
    console.error(`❌ Error: GeoJSON file not found: ${options.geojson}`);
    process.exit(1);
  }
  if (!fs.existsSync(options.boundaries)) {
    console.error(`❌ Error: Boundaries file not found: ${options.boundaries}`);
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           PostGIS Intersection Test                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Load environment
  const envFile = `.env.${options.env}`;
  console.log(`📋 Loading environment: ${envFile}`);
  const envConfig = parseEnv(envFile);
  console.log(`   Host: ${envConfig.DB_HOST}`);
  console.log(`   Database: ${envConfig.DB_NAME}`);

  // Create database pool
  const pool = createPool(envConfig);

  try {
    // Check connection and PostGIS
    console.log('\n🔌 Checking database connection...');
    const postgisVersion = await checkPostGIS(pool);
    console.log(`   ✅ Connected, PostGIS version: ${postgisVersion}`);

    // Define table names
    const buildingsTable = 'temp_buildings';
    const boundariesTable = 'temp_boundaries';
    const outputTable = options.outputTable;

    // Step 1: Import GeoJSON (buildings)
    await importGeoJSON(pool, options.geojson, buildingsTable, options.batchSize);

    // Step 2: Import Boundaries (auto-detect GeoJSON or Shapefile)
    await importBoundaries(pool, options.boundaries, boundariesTable, envConfig, options.batchSize);

    // Step 3: Create spatial indexes
    await createSpatialIndexes(pool, buildingsTable, boundariesTable);

    // Step 4: Run intersection
    const intersectionCount = await runIntersection(pool, buildingsTable, boundariesTable, outputTable);

    // Step 5: Cleanup (optional)
    if (!options.keepTemp) {
      await cleanupTempTables(pool, [buildingsTable, boundariesTable]);
    } else {
      console.log('\n📌 Keeping temporary tables (--keep-temp flag set)');
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                    Summary                               ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`   Output table: ${outputTable}`);
    console.log(`   Intersecting features: ${intersectionCount.toLocaleString()}`);
    console.log('\n✅ Intersection test complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
