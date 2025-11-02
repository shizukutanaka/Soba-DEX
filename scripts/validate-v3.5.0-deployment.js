/**
 * v3.5.0 Deployment Validation Script
 *
 * Validates that all v3.5.0 ML Model Management components are properly deployed:
 * - Database migrations executed
 * - Services initialized
 * - API endpoints accessible
 * - Metrics registered
 *
 * Usage: node scripts/validate-v3.5.0-deployment.js
 */

const http = require('http');
const { Pool } = require('pg');

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'soba',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

// Validation results
const results = {
  database: { passed: 0, failed: 0, checks: [] },
  api: { passed: 0, failed: 0, checks: [] },
  services: { passed: 0, failed: 0, checks: [] },
  overall: 'PENDING'
};

// Color output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function addCheck(category, name, status, message = '') {
  results[category].checks.push({ name, status, message });
  if (status === 'PASS') {
    results[category].passed++;
  } else {
    results[category].failed++;
  }
}

// Database validation
async function validateDatabase() {
  log('\n=== Database Migration Validation ===', 'blue');

  const pool = new Pool(DB_CONFIG);

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    addCheck('database', 'Database Connection', 'PASS');
    log('✓ Database connection successful', 'green');

    // Check tables exist
    const tables = [
      'ml_models',
      'ml_model_metrics',
      'ml_retraining_jobs',
      'ml_drift_logs',
      'ml_model_ab_tests',
      'ml_model_ab_predictions',
      'ml_feature_store',
      'ml_model_deployments'
    ];

    for (const table of tables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [table]);

      if (result.rows[0].exists) {
        addCheck('database', `Table: ${table}`, 'PASS');
        log(`✓ Table ${table} exists`, 'green');
      } else {
        addCheck('database', `Table: ${table}`, 'FAIL', 'Table not found');
        log(`✗ Table ${table} missing`, 'red');
      }
    }

    // Check indexes
    const indexCheck = await pool.query(`
      SELECT COUNT(*) as count FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'ml_%'
    `);

    const indexCount = parseInt(indexCheck.rows[0].count);
    if (indexCount >= 15) {
      addCheck('database', 'Database Indexes', 'PASS', `${indexCount} indexes found`);
      log(`✓ ${indexCount} indexes created`, 'green');
    } else {
      addCheck('database', 'Database Indexes', 'FAIL', `Only ${indexCount} indexes found, expected 15+`);
      log(`✗ Only ${indexCount} indexes found`, 'red');
    }

    // Check views
    const views = ['ml_active_models', 'ml_model_health'];
    for (const view of views) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.views
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [view]);

      if (result.rows[0].exists) {
        addCheck('database', `View: ${view}`, 'PASS');
        log(`✓ View ${view} exists`, 'green');
      } else {
        addCheck('database', `View: ${view}`, 'FAIL', 'View not found');
        log(`✗ View ${view} missing`, 'red');
      }
    }

    // Check triggers
    const triggerCheck = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.triggers
      WHERE trigger_name LIKE '%ml_%'
    `);

    const triggerCount = parseInt(triggerCheck.rows[0].count);
    if (triggerCount >= 2) {
      addCheck('database', 'Database Triggers', 'PASS', `${triggerCount} triggers found`);
      log(`✓ ${triggerCount} triggers created`, 'green');
    } else {
      addCheck('database', 'Database Triggers', 'WARN', `Only ${triggerCount} triggers found`);
      log(`⚠ Only ${triggerCount} triggers found`, 'yellow');
    }

  } catch (error) {
    addCheck('database', 'Database Connection', 'FAIL', error.message);
    log(`✗ Database error: ${error.message}`, 'red');
  } finally {
    await pool.end();
  }
}

// API endpoint validation
async function validateAPI() {
  log('\n=== API Endpoint Validation ===', 'blue');

  const endpoints = [
    { method: 'GET', path: '/api/ml-management/health', expectedStatus: 200 },
    { method: 'GET', path: '/api/ml-management/models', expectedStatus: 200 },
    { method: 'GET', path: '/api/ml-management/registry/stats', expectedStatus: 200 },
    { method: 'GET', path: '/api/ml-management/retraining/summary', expectedStatus: 200 },
    { method: 'GET', path: '/api/ml-management/features/summary', expectedStatus: 200 },
    { method: 'GET', path: '/api/ml-management/drift/summary', expectedStatus: 200 },
    { method: 'GET', path: '/api/ml-management/ab-tests/summary', expectedStatus: 200 },
  ];

  for (const endpoint of endpoints) {
    try {
      const result = await makeRequest(endpoint.method, endpoint.path);

      if (result.statusCode === endpoint.expectedStatus) {
        addCheck('api', `${endpoint.method} ${endpoint.path}`, 'PASS');
        log(`✓ ${endpoint.method} ${endpoint.path} returned ${result.statusCode}`, 'green');
      } else {
        addCheck('api', `${endpoint.method} ${endpoint.path}`, 'FAIL',
                `Expected ${endpoint.expectedStatus}, got ${result.statusCode}`);
        log(`✗ ${endpoint.method} ${endpoint.path} returned ${result.statusCode}`, 'red');
      }
    } catch (error) {
      addCheck('api', `${endpoint.method} ${endpoint.path}`, 'FAIL', error.message);
      log(`✗ ${endpoint.method} ${endpoint.path} - ${error.message}`, 'red');
    }
  }
}

// Service initialization validation
async function validateServices() {
  log('\n=== Service Initialization Validation ===', 'blue');

  try {
    // Check health endpoint
    const healthResult = await makeRequest('GET', '/api/ml-management/health');

    if (healthResult.statusCode === 200) {
      const health = JSON.parse(healthResult.body);

      const services = [
        'mlModelPersistence',
        'mlRetrainingService',
        'mlFeatureEngineering',
        'mlDriftDetection',
        'mlModelABTesting'
      ];

      for (const service of services) {
        if (health.services && health.services[service]) {
          const status = health.services[service].status;
          if (status === 'healthy') {
            addCheck('services', service, 'PASS');
            log(`✓ ${service} is healthy`, 'green');
          } else {
            addCheck('services', service, 'FAIL', `Status: ${status}`);
            log(`✗ ${service} status: ${status}`, 'red');
          }
        } else {
          addCheck('services', service, 'FAIL', 'Service not found in health check');
          log(`✗ ${service} not found in health response`, 'red');
        }
      }
    } else {
      addCheck('services', 'Health Endpoint', 'FAIL', `HTTP ${healthResult.statusCode}`);
      log(`✗ Health endpoint returned ${healthResult.statusCode}`, 'red');
    }
  } catch (error) {
    addCheck('services', 'Health Check', 'FAIL', error.message);
    log(`✗ Health check failed: ${error.message}`, 'red');
  }
}

// HTTP request helper
function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Print summary
function printSummary() {
  log('\n=== Validation Summary ===', 'blue');

  const categories = ['database', 'api', 'services'];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const category of categories) {
    const cat = results[category];
    totalPassed += cat.passed;
    totalFailed += cat.failed;

    const total = cat.passed + cat.failed;
    const percentage = total > 0 ? ((cat.passed / total) * 100).toFixed(1) : 0;

    const color = cat.failed === 0 ? 'green' : cat.passed > 0 ? 'yellow' : 'red';
    log(`${category.toUpperCase()}: ${cat.passed}/${total} passed (${percentage}%)`, color);
  }

  log('');
  const overallTotal = totalPassed + totalFailed;
  const overallPercentage = overallTotal > 0 ? ((totalPassed / overallTotal) * 100).toFixed(1) : 0;

  if (totalFailed === 0) {
    results.overall = 'PASS';
    log(`OVERALL: ✓ ALL CHECKS PASSED (${totalPassed}/${overallTotal})`, 'green');
    log('v3.5.0 deployment is PRODUCTION READY', 'green');
  } else if (totalPassed > totalFailed) {
    results.overall = 'WARN';
    log(`OVERALL: ⚠ ${totalPassed}/${overallTotal} passed (${overallPercentage}%)`, 'yellow');
    log(`${totalFailed} checks failed - review required`, 'yellow');
  } else {
    results.overall = 'FAIL';
    log(`OVERALL: ✗ ${totalPassed}/${overallTotal} passed (${overallPercentage}%)`, 'red');
    log(`${totalFailed} checks failed - deployment NOT ready`, 'red');
  }

  log('');
}

// Print detailed results
function printDetails() {
  if (process.argv.includes('--verbose')) {
    log('\n=== Detailed Results ===', 'blue');

    for (const category of ['database', 'api', 'services']) {
      log(`\n${category.toUpperCase()}:`, 'blue');
      for (const check of results[category].checks) {
        const symbol = check.status === 'PASS' ? '✓' : check.status === 'WARN' ? '⚠' : '✗';
        const color = check.status === 'PASS' ? 'green' : check.status === 'WARN' ? 'yellow' : 'red';
        const message = check.message ? ` - ${check.message}` : '';
        log(`  ${symbol} ${check.name}${message}`, color);
      }
    }
  }
}

// Main execution
async function main() {
  log('╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║   Soba DEX v3.5.0 Deployment Validation                   ║', 'blue');
  log('║   ML Model Management & MLOps Platform                    ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  const startTime = Date.now();

  try {
    // Run validations
    await validateDatabase();
    await validateAPI();
    await validateServices();

    // Print results
    printSummary();
    printDetails();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`\nValidation completed in ${duration}s`, 'blue');

    // Export results if requested
    if (process.argv.includes('--json')) {
      const fs = require('fs');
      fs.writeFileSync('validation-results.json', JSON.stringify(results, null, 2));
      log('Results exported to validation-results.json', 'blue');
    }

    // Exit code
    process.exit(results.overall === 'PASS' ? 0 : 1);

  } catch (error) {
    log(`\n✗ Validation failed with error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run
if (require.main === module) {
  main();
}

module.exports = { validateDatabase, validateAPI, validateServices };
