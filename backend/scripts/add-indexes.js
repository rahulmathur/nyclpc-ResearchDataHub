#!/usr/bin/env node

/**
 * Add Performance Indexes Script
 *
 * This script reads and executes the add-indexes.sql file against the database.
 * It creates performance indexes based on OPTIMIZATION_RECOMMENDATIONS.md.
 *
 * Usage:
 *   node scripts/add-indexes.js                  # Uses default .env
 *   node scripts/add-indexes.js --env staging    # Uses .env.staging
 *   node scripts/add-indexes.js --env development # Uses .env.development
 *   node scripts/add-indexes.js --dry-run        # Show SQL without executing
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Parse command line arguments
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const dryRun = args.includes('--dry-run');

// Determine which .env file to use
let envFile = '.env';
if (envIndex !== -1 && args[envIndex + 1]) {
  envFile = `.env.${args[envIndex + 1]}`;
}

const envPath = path.join(__dirname, '..', envFile);

// Load environment variables
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log(`Loaded environment from: ${envFile}`);
} else {
  // Fallback to default .env in backend directory
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  console.log('Loaded environment from default .env');
}

/**
 * Create database connection pool
 */
function createPool() {
  const config = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  // Add SSL for non-localhost connections (e.g., RDS)
  if (process.env.DB_HOST && !process.env.DB_HOST.includes('localhost')) {
    config.ssl = { rejectUnauthorized: false };
  }

  return new Pool(config);
}

/**
 * Read and parse the SQL file
 */
function readSqlFile() {
  const sqlPath = path.join(__dirname, 'add-indexes.sql');

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`);
  }

  return fs.readFileSync(sqlPath, 'utf8');
}

/**
 * Parse SQL file into individual statements
 * Handles comments and multi-line statements
 */
function parseSqlStatements(sql) {
  // Remove single-line comments
  const withoutComments = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  // Split by semicolons and filter empty statements
  const statements = withoutComments
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  return statements;
}

/**
 * Execute a single SQL statement with error handling
 */
async function executeStatement(pool, statement, index) {
  // Extract index name from statement for logging
  const indexMatch = statement.match(/CREATE INDEX.*?(\w+)\s+ON/i);
  const indexName = indexMatch ? indexMatch[1] : `statement_${index + 1}`;

  try {
    const startTime = Date.now();
    await pool.query(statement);
    const duration = Date.now() - startTime;

    console.log(`  [OK] ${indexName} (${duration}ms)`);
    return { success: true, indexName, duration };
  } catch (error) {
    // Check if error is because table doesn't exist
    if (error.code === '42P01') {
      console.log(`  [SKIP] ${indexName} - table does not exist`);
      return { success: false, indexName, skipped: true, error: 'Table does not exist' };
    }

    // Check if index already exists (shouldn't happen with IF NOT EXISTS, but just in case)
    if (error.code === '42P07') {
      console.log(`  [SKIP] ${indexName} - index already exists`);
      return { success: false, indexName, skipped: true, error: 'Index already exists' };
    }

    console.error(`  [FAIL] ${indexName} - ${error.message}`);
    return { success: false, indexName, error: error.message };
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('\n========================================');
  console.log('  Add Performance Indexes');
  console.log('========================================\n');

  // Read SQL file
  let sql;
  try {
    sql = readSqlFile();
    console.log('SQL file loaded successfully\n');
  } catch (error) {
    console.error(`Error reading SQL file: ${error.message}`);
    process.exit(1);
  }

  // Parse statements
  const statements = parseSqlStatements(sql);
  console.log(`Found ${statements.length} CREATE INDEX statements\n`);

  // Dry run mode - just show the statements
  if (dryRun) {
    console.log('--- DRY RUN MODE ---\n');
    console.log('Would execute the following statements:\n');
    statements.forEach((stmt, i) => {
      console.log(`${i + 1}. ${stmt};\n`);
    });
    console.log('--- END DRY RUN ---');
    return;
  }

  // Create database connection
  console.log('Connecting to database...');
  console.log(`  Host: ${process.env.DB_HOST}`);
  console.log(`  Database: ${process.env.DB_NAME}`);
  console.log(`  User: ${process.env.DB_USER}\n`);

  const pool = createPool();

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('Database connection successful\n');

    // Execute each statement
    console.log('Creating indexes...\n');

    const results = [];
    for (let i = 0; i < statements.length; i++) {
      const result = await executeStatement(pool, statements[i], i);
      results.push(result);
    }

    // Summary
    console.log('\n========================================');
    console.log('  Summary');
    console.log('========================================\n');

    const successful = results.filter(r => r.success);
    const skipped = results.filter(r => r.skipped);
    const failed = results.filter(r => !r.success && !r.skipped);

    console.log(`  Created: ${successful.length}`);
    console.log(`  Skipped: ${skipped.length}`);
    console.log(`  Failed:  ${failed.length}`);

    if (successful.length > 0) {
      const totalTime = successful.reduce((sum, r) => sum + r.duration, 0);
      console.log(`\n  Total index creation time: ${totalTime}ms`);
    }

    if (failed.length > 0) {
      console.log('\n  Failed indexes:');
      failed.forEach(r => {
        console.log(`    - ${r.indexName}: ${r.error}`);
      });
    }

    console.log('\nDone!\n');

  } catch (error) {
    console.error(`\nDatabase error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
