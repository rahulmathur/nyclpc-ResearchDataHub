#!/usr/bin/env node

/**
 * Schema Comparison Script
 * Compares PostgreSQL schemas between development and staging databases
 * 
 * Usage: node scripts/compare-schemas.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function log(message, color = '') {
  console.log(color ? `${color}${message}${colors.reset}` : message);
}

function success(message) { log(`✓ ${message}`, colors.green); }
function warning(message) { log(`⚠ ${message}`, colors.yellow); }
function error(message) { log(`✗ ${message}`, colors.red); }
function header(message) { log(`\n${colors.bold}${message}${colors.reset}`); }
function subheader(message) { log(`${colors.cyan}${message}${colors.reset}`); }

/**
 * Load environment variables from a specific .env file
 */
function loadEnv(envFile) {
  const envPath = path.join(__dirname, '..', envFile);
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  
  return env;
}

/**
 * Create a database pool from environment config
 */
function createPool(env, name) {
  return new Pool({
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT) || 5432,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });
}

/**
 * Get all tables in the public schema
 */
async function getTables(pool) {
  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map(r => r.table_name);
}

/**
 * Get all columns with metadata
 */
async function getColumns(pool) {
  const result = await pool.query(`
    SELECT 
      table_name,
      column_name,
      data_type,
      udt_name,
      is_nullable,
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  
  // Group by table
  const columns = {};
  result.rows.forEach(row => {
    if (!columns[row.table_name]) {
      columns[row.table_name] = [];
    }
    columns[row.table_name].push(row);
  });
  return columns;
}

/**
 * Get all enum types and their values
 */
async function getEnums(pool) {
  const result = await pool.query(`
    SELECT t.typname as enum_name, e.enumlabel as enum_value
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid 
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);
  
  // Group by enum name
  const enums = {};
  result.rows.forEach(row => {
    if (!enums[row.enum_name]) {
      enums[row.enum_name] = [];
    }
    enums[row.enum_name].push(row.enum_value);
  });
  return enums;
}

/**
 * Get all indexes
 */
async function getIndexes(pool) {
  const result = await pool.query(`
    SELECT 
      tablename,
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  
  // Group by table
  const indexes = {};
  result.rows.forEach(row => {
    if (!indexes[row.tablename]) {
      indexes[row.tablename] = [];
    }
    indexes[row.tablename].push({
      name: row.indexname,
      definition: row.indexdef
    });
  });
  return indexes;
}

/**
 * Get all constraints (PK, FK, UNIQUE, CHECK)
 */
async function getConstraints(pool) {
  const result = await pool.query(`
    SELECT 
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
  `);
  
  // Group by table
  const constraints = {};
  result.rows.forEach(row => {
    if (!constraints[row.table_name]) {
      constraints[row.table_name] = [];
    }
    
    // Check if constraint already exists (for multi-column constraints)
    const existing = constraints[row.table_name].find(c => c.name === row.constraint_name);
    if (existing) {
      if (row.column_name && !existing.columns.includes(row.column_name)) {
        existing.columns.push(row.column_name);
      }
    } else {
      constraints[row.table_name].push({
        name: row.constraint_name,
        type: row.constraint_type,
        columns: row.column_name ? [row.column_name] : [],
        foreignTable: row.foreign_table_name,
        foreignColumn: row.foreign_column_name
      });
    }
  });
  return constraints;
}

/**
 * Compare two arrays and return differences
 */
function arrayDiff(arr1, arr2) {
  const set1 = new Set(arr1);
  const set2 = new Set(arr2);
  
  return {
    onlyInFirst: arr1.filter(x => !set2.has(x)),
    onlyInSecond: arr2.filter(x => !set1.has(x)),
    inBoth: arr1.filter(x => set2.has(x))
  };
}

/**
 * Compare column definitions
 */
function compareColumn(col1, col2) {
  const differences = [];
  
  if (col1.data_type !== col2.data_type) {
    differences.push(`data_type: ${col1.data_type} vs ${col2.data_type}`);
  }
  if (col1.udt_name !== col2.udt_name) {
    differences.push(`udt_name: ${col1.udt_name} vs ${col2.udt_name}`);
  }
  if (col1.is_nullable !== col2.is_nullable) {
    differences.push(`nullable: ${col1.is_nullable} vs ${col2.is_nullable}`);
  }
  if (col1.character_maximum_length !== col2.character_maximum_length) {
    differences.push(`max_length: ${col1.character_maximum_length} vs ${col2.character_maximum_length}`);
  }
  
  // Compare defaults (normalize nulls)
  const default1 = col1.column_default || 'NULL';
  const default2 = col2.column_default || 'NULL';
  if (default1 !== default2) {
    differences.push(`default: ${default1} vs ${default2}`);
  }
  
  return differences;
}

/**
 * Main comparison function
 */
async function compareSchemas() {
  // Load environments
  const devEnv = loadEnv('.env.development');
  const stagingEnv = loadEnv('.env.staging');
  
  log('');
  log('═══════════════════════════════════════════════════════════════', colors.cyan);
  log('              PostgreSQL Schema Comparison Tool', colors.bold);
  log('═══════════════════════════════════════════════════════════════', colors.cyan);
  log('');
  log(`Development: ${devEnv.DB_NAME} @ ${devEnv.DB_HOST}`, colors.dim);
  log(`Staging:     ${stagingEnv.DB_NAME} @ ${stagingEnv.DB_HOST}`, colors.dim);
  log('');
  
  // Create pools
  const devPool = createPool(devEnv, 'development');
  const stagingPool = createPool(stagingEnv, 'staging');
  
  let hasDifferences = false;
  
  try {
    // Test connections
    await devPool.query('SELECT 1');
    await stagingPool.query('SELECT 1');
    success('Connected to both databases');
    
    // ============================================================
    // TABLES COMPARISON
    // ============================================================
    header('TABLES');
    log('─'.repeat(60));
    
    const devTables = await getTables(devPool);
    const stagingTables = await getTables(stagingPool);
    const tableDiff = arrayDiff(devTables, stagingTables);
    
    if (tableDiff.onlyInFirst.length === 0 && tableDiff.onlyInSecond.length === 0) {
      success(`${devTables.length} tables match in both databases`);
    } else {
      hasDifferences = true;
      log(`Tables in both: ${tableDiff.inBoth.length}`, colors.dim);
      
      if (tableDiff.onlyInFirst.length > 0) {
        error(`Missing in staging (${tableDiff.onlyInFirst.length}):`);
        tableDiff.onlyInFirst.forEach(t => log(`    - ${t}`, colors.red));
      }
      
      if (tableDiff.onlyInSecond.length > 0) {
        warning(`Extra in staging (${tableDiff.onlyInSecond.length}):`);
        tableDiff.onlyInSecond.forEach(t => log(`    - ${t}`, colors.yellow));
      }
    }
    
    // ============================================================
    // COLUMNS COMPARISON
    // ============================================================
    header('COLUMNS');
    log('─'.repeat(60));
    
    const devColumns = await getColumns(devPool);
    const stagingColumns = await getColumns(stagingPool);
    
    let columnMatches = 0;
    let columnDiffs = 0;
    
    // Compare columns for tables that exist in both
    for (const tableName of tableDiff.inBoth) {
      const devCols = devColumns[tableName] || [];
      const stagingCols = stagingColumns[tableName] || [];
      
      const devColNames = devCols.map(c => c.column_name);
      const stagingColNames = stagingCols.map(c => c.column_name);
      const colDiff = arrayDiff(devColNames, stagingColNames);
      
      let tableDiffs = [];
      
      if (colDiff.onlyInFirst.length > 0) {
        tableDiffs.push(`Missing in staging: ${colDiff.onlyInFirst.join(', ')}`);
      }
      if (colDiff.onlyInSecond.length > 0) {
        tableDiffs.push(`Extra in staging: ${colDiff.onlyInSecond.join(', ')}`);
      }
      
      // Compare columns that exist in both
      for (const colName of colDiff.inBoth) {
        const devCol = devCols.find(c => c.column_name === colName);
        const stagingCol = stagingCols.find(c => c.column_name === colName);
        const diffs = compareColumn(devCol, stagingCol);
        
        if (diffs.length > 0) {
          tableDiffs.push(`Column '${colName}': ${diffs.join('; ')}`);
        } else {
          columnMatches++;
        }
      }
      
      if (tableDiffs.length > 0) {
        hasDifferences = true;
        columnDiffs++;
        subheader(`  ${tableName}:`);
        tableDiffs.forEach(d => error(`    ${d}`));
      }
    }
    
    if (columnDiffs === 0) {
      success(`All columns match across ${tableDiff.inBoth.length} tables`);
    } else {
      log(`${columnDiffs} table(s) have column differences`, colors.dim);
    }
    
    // ============================================================
    // ENUMS COMPARISON
    // ============================================================
    header('ENUM TYPES');
    log('─'.repeat(60));
    
    const devEnums = await getEnums(devPool);
    const stagingEnums = await getEnums(stagingPool);
    
    const devEnumNames = Object.keys(devEnums);
    const stagingEnumNames = Object.keys(stagingEnums);
    const enumDiff = arrayDiff(devEnumNames, stagingEnumNames);
    
    let enumMatches = 0;
    let enumDiffs = 0;
    
    if (enumDiff.onlyInFirst.length > 0) {
      hasDifferences = true;
      error(`Missing enum types in staging:`);
      enumDiff.onlyInFirst.forEach(e => log(`    - ${e}`, colors.red));
    }
    
    if (enumDiff.onlyInSecond.length > 0) {
      hasDifferences = true;
      warning(`Extra enum types in staging:`);
      enumDiff.onlyInSecond.forEach(e => log(`    - ${e}`, colors.yellow));
    }
    
    // Compare enum values for enums in both
    for (const enumName of enumDiff.inBoth) {
      const devValues = devEnums[enumName];
      const stagingValues = stagingEnums[enumName];
      const valueDiff = arrayDiff(devValues, stagingValues);
      
      if (valueDiff.onlyInFirst.length === 0 && valueDiff.onlyInSecond.length === 0) {
        enumMatches++;
      } else {
        hasDifferences = true;
        enumDiffs++;
        subheader(`  ${enumName}:`);
        if (valueDiff.onlyInFirst.length > 0) {
          error(`    Missing in staging: [${valueDiff.onlyInFirst.join(', ')}]`);
        }
        if (valueDiff.onlyInSecond.length > 0) {
          warning(`    Extra in staging: [${valueDiff.onlyInSecond.join(', ')}]`);
        }
      }
    }
    
    if (enumMatches > 0 && enumDiffs === 0 && enumDiff.onlyInFirst.length === 0 && enumDiff.onlyInSecond.length === 0) {
      success(`${enumMatches} enum types match`);
    } else if (enumMatches > 0) {
      log(`${enumMatches} enum types match`, colors.dim);
    }
    
    if (devEnumNames.length === 0 && stagingEnumNames.length === 0) {
      log('No custom enum types found', colors.dim);
    }
    
    // ============================================================
    // INDEXES COMPARISON
    // ============================================================
    header('INDEXES');
    log('─'.repeat(60));
    
    const devIndexes = await getIndexes(devPool);
    const stagingIndexes = await getIndexes(stagingPool);
    
    let indexMatches = 0;
    let indexDiffs = 0;
    
    // Get all unique table names
    const allIndexTables = new Set([...Object.keys(devIndexes), ...Object.keys(stagingIndexes)]);
    
    for (const tableName of allIndexTables) {
      const devIdx = devIndexes[tableName] || [];
      const stagingIdx = stagingIndexes[tableName] || [];
      
      const devIdxNames = devIdx.map(i => i.name);
      const stagingIdxNames = stagingIdx.map(i => i.name);
      const idxDiff = arrayDiff(devIdxNames, stagingIdxNames);
      
      let tableDiffs = [];
      
      if (idxDiff.onlyInFirst.length > 0) {
        tableDiffs.push(`Missing in staging: ${idxDiff.onlyInFirst.join(', ')}`);
      }
      if (idxDiff.onlyInSecond.length > 0) {
        tableDiffs.push(`Extra in staging: ${idxDiff.onlyInSecond.join(', ')}`);
      }
      
      // Compare index definitions for indexes in both
      for (const idxName of idxDiff.inBoth) {
        const devDef = devIdx.find(i => i.name === idxName);
        const stagingDef = stagingIdx.find(i => i.name === idxName);
        
        if (devDef.definition !== stagingDef.definition) {
          tableDiffs.push(`Index '${idxName}' definition differs`);
        } else {
          indexMatches++;
        }
      }
      
      if (tableDiffs.length > 0) {
        hasDifferences = true;
        indexDiffs++;
        subheader(`  ${tableName}:`);
        tableDiffs.forEach(d => error(`    ${d}`));
      }
    }
    
    if (indexDiffs === 0) {
      success(`All indexes match (${indexMatches} indexes)`);
    } else {
      log(`${indexMatches} indexes match, ${indexDiffs} tables have differences`, colors.dim);
    }
    
    // ============================================================
    // CONSTRAINTS COMPARISON
    // ============================================================
    header('CONSTRAINTS');
    log('─'.repeat(60));
    
    const devConstraints = await getConstraints(devPool);
    const stagingConstraints = await getConstraints(stagingPool);
    
    let constraintMatches = 0;
    let constraintDiffs = 0;
    
    // Get all unique table names
    const allConstraintTables = new Set([...Object.keys(devConstraints), ...Object.keys(stagingConstraints)]);
    
    for (const tableName of allConstraintTables) {
      const devCons = devConstraints[tableName] || [];
      const stagingCons = stagingConstraints[tableName] || [];
      
      const devConsNames = devCons.map(c => c.name);
      const stagingConsNames = stagingCons.map(c => c.name);
      const consDiff = arrayDiff(devConsNames, stagingConsNames);
      
      let tableDiffs = [];
      
      if (consDiff.onlyInFirst.length > 0) {
        tableDiffs.push(`Missing in staging: ${consDiff.onlyInFirst.join(', ')}`);
      }
      if (consDiff.onlyInSecond.length > 0) {
        tableDiffs.push(`Extra in staging: ${consDiff.onlyInSecond.join(', ')}`);
      }
      
      // Compare constraint details for constraints in both
      for (const consName of consDiff.inBoth) {
        const devCon = devCons.find(c => c.name === consName);
        const stagingCon = stagingCons.find(c => c.name === consName);
        
        const diffs = [];
        if (devCon.type !== stagingCon.type) {
          diffs.push(`type: ${devCon.type} vs ${stagingCon.type}`);
        }
        if (JSON.stringify(devCon.columns.sort()) !== JSON.stringify(stagingCon.columns.sort())) {
          diffs.push(`columns differ`);
        }
        
        if (diffs.length > 0) {
          tableDiffs.push(`Constraint '${consName}': ${diffs.join('; ')}`);
        } else {
          constraintMatches++;
        }
      }
      
      if (tableDiffs.length > 0) {
        hasDifferences = true;
        constraintDiffs++;
        subheader(`  ${tableName}:`);
        tableDiffs.forEach(d => error(`    ${d}`));
      }
    }
    
    if (constraintDiffs === 0) {
      success(`All constraints match (${constraintMatches} constraints)`);
    } else {
      log(`${constraintMatches} constraints match, ${constraintDiffs} tables have differences`, colors.dim);
    }
    
    // ============================================================
    // SUMMARY
    // ============================================================
    log('');
    log('═══════════════════════════════════════════════════════════════', colors.cyan);
    header('SUMMARY');
    log('═══════════════════════════════════════════════════════════════', colors.cyan);
    
    if (hasDifferences) {
      error('Schemas have differences - review above for details');
      log('');
      log('To sync staging with development, you may need to:', colors.dim);
      log('  1. Add missing tables/columns to staging', colors.dim);
      log('  2. Update column types or defaults', colors.dim);
      log('  3. Add missing enum values', colors.dim);
      log('  4. Create missing indexes and constraints', colors.dim);
    } else {
      success('Schemas are identical!');
    }
    
    log('');
    
  } catch (err) {
    error(`Error: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await devPool.end();
    await stagingPool.end();
  }
  
  process.exit(hasDifferences ? 1 : 0);
}

// Run the comparison
compareSchemas();
