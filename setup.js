#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║     DEX Trading Platform - Automated Setup             ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, description) {
  try {
    log(`\n➤ ${description}...`, 'blue');
    execSync(command, { stdio: 'inherit' });
    log(`✓ ${description} completed`, 'green');
    return true;
  } catch (error) {
    log(`✗ ${description} failed`, 'red');
    return false;
  }
}

function generateSecureSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function createEnvFile() {
  const envPath = path.join(__dirname, 'backend', '.env');

  if (fs.existsSync(envPath)) {
    log('\n⚠ .env file already exists. Skipping...', 'yellow');
    return true;
  }

  const jwtSecret = generateSecureSecret(32);
  const envContent = `# DEX Trading Platform - Environment Configuration
# Generated: ${new Date().toISOString()}

# Server Configuration
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# Security (REQUIRED)
JWT_SECRET=${jwtSecret}
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Optional Settings
LOG_LEVEL=info
RATE_LIMIT_MAX=100

# Database (configure if needed)
# DATABASE_URL=postgresql://user:password@localhost:5432/dex
# REDIS_URL=redis://localhost:6379

# Production Settings (uncomment for production)
# NODE_ENV=production
# ALLOWED_ORIGINS=https://yourdomain.com
# LOG_LEVEL=warn
`;

  try {
    fs.writeFileSync(envPath, envContent);
    log('\n✓ Created .env file with secure JWT_SECRET', 'green');
    log(`  JWT_SECRET: ${jwtSecret.substring(0, 16)}...`, 'blue');
    return true;
  } catch (error) {
    log('\n✗ Failed to create .env file', 'red');
    console.error(error);
    return false;
  }
}

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.split('.')[0].substring(1));

  if (major < 18) {
    log('\n✗ Node.js version 18.0.0 or higher is required', 'red');
    log(`  Current version: ${version}`, 'yellow');
    return false;
  }

  log(`✓ Node.js version check passed (${version})`, 'green');
  return true;
}

function createDirectories() {
  const dirs = [
    path.join(__dirname, 'backend', 'logs'),
    path.join(__dirname, 'backend', 'src', 'archive'),
    path.join(__dirname, 'frontend', 'src', 'archive')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`✓ Created directory: ${path.relative(__dirname, dir)}`, 'green');
    }
  });

  return true;
}

async function main() {
  log('Starting automated setup...\n', 'blue');

  // Step 1: Check Node.js version
  if (!checkNodeVersion()) {
    process.exit(1);
  }

  // Step 2: Create necessary directories
  log('\n[1/5] Creating directories...', 'blue');
  createDirectories();

  // Step 3: Install backend dependencies
  log('\n[2/5] Installing backend dependencies...', 'blue');
  if (!execCommand('cd backend && npm install', 'Backend installation')) {
    log('\n⚠ Backend installation had issues. Please check and run manually.', 'yellow');
  }

  // Step 4: Install frontend dependencies
  log('\n[3/5] Installing frontend dependencies...', 'blue');
  if (!execCommand('cd frontend && npm install', 'Frontend installation')) {
    log('\n⚠ Frontend installation had issues. Please check and run manually.', 'yellow');
  }

  // Step 5: Create .env file
  log('\n[4/5] Creating environment configuration...', 'blue');
  createEnvFile();

  // Step 6: Run security audit
  log('\n[5/5] Running security audit...', 'blue');
  execCommand('cd backend && npm audit --audit-level=moderate', 'Security audit');

  // Final summary
  log('\n╔════════════════════════════════════════════════════════╗', 'green');
  log('║            Setup completed successfully!               ║', 'green');
  log('╚════════════════════════════════════════════════════════╝', 'green');

  log('\n📋 Next steps:', 'blue');
  log('  1. Review backend/.env and update if needed', 'yellow');
  log('  2. Start backend: cd backend && npm run dev', 'yellow');
  log('  3. Start frontend: cd frontend && npm start', 'yellow');
  log('  4. Access: http://localhost:3000\n', 'yellow');

  log('📚 Documentation:', 'blue');
  log('  - README.md - Complete user guide', 'yellow');
  log('  - PRODUCTION_IMPROVEMENTS.md - Technical details\n', 'yellow');

  log('🔒 Security notes:', 'blue');
  log('  - JWT_SECRET has been generated securely', 'yellow');
  log('  - For production, update ALLOWED_ORIGINS in .env', 'yellow');
  log('  - Run "npm audit" regularly\n', 'yellow');
}

main().catch(error => {
  log('\n✗ Setup failed with error:', 'red');
  console.error(error);
  process.exit(1);
});
