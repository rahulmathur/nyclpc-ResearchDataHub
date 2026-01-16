#!/usr/bin/env node
/**
 * Migrate from Dev to Staging (Automated)
 * Reads credentials from .env.development and .env.staging
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse .env file
function parseEnv(filePath) {
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

async function migrate() {
  console.log('🚀 Dev to Staging Migration');
  console.log('============================\n');

  // Load environments
  const devEnv = parseEnv('.env.development');
  const stagingEnv = parseEnv('.env.staging');

  console.log('📥 Source (Dev):');
  console.log(`   Host: ${devEnv.DB_HOST}`);
  console.log(`   Database: ${devEnv.DB_NAME}`);
  console.log('');
  console.log('📤 Destination (Staging):');
  console.log(`   Host: ${stagingEnv.DB_HOST}`);
  console.log(`   Database: ${stagingEnv.DB_NAME}`);
  console.log('');

  const dumpFile = `dev-to-staging-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;

  // Export from dev
  console.log('💾 Exporting from dev database...\n');
  
  const PG_DUMP = '/usr/local/opt/postgresql@18/bin/pg_dump';
  const PG_RESTORE = '/usr/local/opt/postgresql@18/bin/pg_restore';

  await runCommand(PG_DUMP, [
    '-h', devEnv.DB_HOST,
    '-p', devEnv.DB_PORT || '5432',
    '-U', devEnv.DB_USER,
    '-d', devEnv.DB_NAME,
    '--no-owner',
    '--no-acl',
    '--clean',
    '--if-exists',
    '--format=custom',
    '-f', dumpFile
  ], { PGPASSWORD: devEnv.DB_PASSWORD });

  const stats = fs.statSync(dumpFile);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Export complete: ${dumpFile} (${fileSizeMB} MB)\n`);

  // Import to staging
  console.log('📤 Importing to staging database...\n');
  
  await runCommand(PG_RESTORE, [
    '-h', stagingEnv.DB_HOST,
    '-p', stagingEnv.DB_PORT || '5432',
    '-U', stagingEnv.DB_USER,
    '-d', stagingEnv.DB_NAME,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    dumpFile
  ], { PGPASSWORD: stagingEnv.DB_PASSWORD });

  console.log('\n✅ Migration complete!\n');
  console.log(`Backup saved: ${dumpFile}`);
}

function runCommand(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: 'inherit'
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

migrate().catch(error => {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
});
