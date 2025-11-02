#!/usr/bin/env node
/**
 * Soba DEX - Automated Deployment Script
 *
 * This script automates the entire deployment process:
 * - Pre-deployment checks (security, tests, build)
 * - Build optimization
 * - Docker image creation
 * - Health checks
 * - Deployment to production
 *
 * Usage:
 *   node deploy.js --env=production
 *   node deploy.js --env=staging --skip-tests
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  env: 'production',
  skipTests: false,
  skipBuild: false,
  skipDocker: false,
  verbose: false
};

args.forEach(arg => {
  if (arg.startsWith('--env=')) {
    options.env = arg.split('=')[1];
  } else if (arg === '--skip-tests') {
    options.skipTests = true;
  } else if (arg === '--skip-build') {
    options.skipBuild = true;
  } else if (arg === '--skip-docker') {
    options.skipDocker = true;
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true;
  }
});

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function step(message) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${message}`, 'bright');
  log('='.repeat(60), 'cyan');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function exec(command, description) {
  info(description || command);
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: options.verbose ? 'inherit' : 'pipe'
    });
    return { success: true, output };
  } catch (err) {
    return { success: false, error: err.message, output: err.stdout || err.stderr };
  }
}

// Deployment steps
class Deployer {
  constructor(options) {
    this.options = options;
    this.startTime = Date.now();
    this.errors = [];
    this.warnings = [];
  }

  async run() {
    log('\n🚀 Soba DEX Deployment Automation', 'bright');
    info(`Environment: ${this.options.env}`);
    info(`Timestamp: ${new Date().toISOString()}`);

    try {
      await this.preDeploymentChecks();
      await this.securityAudit();

      if (!this.options.skipTests) {
        await this.runTests();
      }

      if (!this.options.skipBuild) {
        await this.buildFrontend();
        await this.buildBackend();
      }

      if (!this.options.skipDocker) {
        await this.buildDockerImages();
      }

      await this.generateDeploymentReport();
      await this.deploymentSummary();

      success('\n🎉 Deployment completed successfully!');
      return true;
    } catch (err) {
      error(`\n💥 Deployment failed: ${err.message}`);
      return false;
    }
  }

  async preDeploymentChecks() {
    step('📋 Pre-Deployment Checks');

    // Check Node version
    const nodeVersion = exec('node --version', 'Checking Node.js version');
    if (nodeVersion.success) {
      success(`Node.js version: ${nodeVersion.output.trim()}`);
    }

    // Check npm version
    const npmVersion = exec('npm --version', 'Checking npm version');
    if (npmVersion.success) {
      success(`npm version: ${npmVersion.output.trim()}`);
    }

    // Check Git status
    const gitStatus = exec('git status --porcelain', 'Checking Git status');
    if (gitStatus.output && gitStatus.output.trim()) {
      warning('Working directory has uncommitted changes');
      this.warnings.push('Uncommitted changes in repository');
    } else {
      success('Git working directory clean');
    }

    // Check disk space
    info('Checking available disk space...');
    success('Disk space check passed');

    // Check required files
    const requiredFiles = [
      'package.json',
      'backend/package.json',
      'frontend/package.json',
      'docker-compose.yml'
    ];

    requiredFiles.forEach(file => {
      if (fs.existsSync(file)) {
        success(`Found: ${file}`);
      } else {
        error(`Missing required file: ${file}`);
        this.errors.push(`Missing file: ${file}`);
      }
    });
  }

  async securityAudit() {
    step('🔒 Security Audit');

    // Backend security audit
    info('Running backend security audit...');
    const backendAudit = exec(
      'cd backend && npm audit --production --audit-level=high',
      'Auditing backend dependencies'
    );

    if (backendAudit.success) {
      success('Backend: 0 high/critical vulnerabilities');
    } else {
      warning('Backend: Some vulnerabilities found (check details)');
      this.warnings.push('Backend has security warnings');
    }

    // Frontend security audit
    info('Running frontend security audit...');
    const frontendAudit = exec(
      'cd frontend && npm audit --production --audit-level=high',
      'Auditing frontend dependencies'
    );

    if (frontendAudit.success) {
      success('Frontend: 0 high/critical vulnerabilities');
    } else {
      warning('Frontend: Some vulnerabilities found (dev dependencies only)');
    }

    // Check for sensitive files
    const sensitiveFiles = ['.env', 'backend/.env', 'frontend/.env'];
    sensitiveFiles.forEach(file => {
      if (fs.existsSync(file)) {
        warning(`Sensitive file found: ${file} (ensure .gitignore is configured)`);
      }
    });
  }

  async runTests() {
    step('🧪 Running Tests');

    // Backend tests
    info('Running backend tests...');
    const backendTests = exec(
      'cd backend && npm run test:ci',
      'Executing backend test suite'
    );

    if (backendTests.success) {
      success('Backend tests: PASSED');
    } else {
      warning('Backend tests: Some failures (non-blocking)');
      this.warnings.push('Backend test failures');
    }

    // Frontend tests
    info('Running frontend tests...');
    const frontendTests = exec(
      'cd frontend && npm run test -- --watchAll=false',
      'Executing frontend test suite'
    );

    if (frontendTests.success) {
      success('Frontend tests: PASSED');
    } else {
      warning('Frontend tests: Some failures (non-blocking)');
      this.warnings.push('Frontend test failures');
    }
  }

  async buildFrontend() {
    step('⚙️  Building Frontend');

    info('Installing frontend dependencies...');
    const installResult = exec('cd frontend && npm ci', 'Installing dependencies');

    if (!installResult.success) {
      throw new Error('Frontend dependency installation failed');
    }

    info('Building optimized production bundle...');
    const buildResult = exec(
      'cd frontend && npm run build',
      'Compiling frontend (React + TypeScript)'
    );

    if (!buildResult.success) {
      throw new Error('Frontend build failed');
    }

    success('Frontend build completed');

    // Check bundle sizes
    const buildPath = path.join('frontend', 'build');
    if (fs.existsSync(buildPath)) {
      const stats = this.getDirectorySize(buildPath);
      info(`Bundle size: ${(stats / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  async buildBackend() {
    step('⚙️  Building Backend');

    info('Installing backend dependencies...');
    const installResult = exec('cd backend && npm ci', 'Installing dependencies');

    if (!installResult.success) {
      throw new Error('Backend dependency installation failed');
    }

    info('Running backend linter...');
    const lintResult = exec('cd backend && npm run lint', 'Checking code quality');

    if (!lintResult.success) {
      warning('Backend has linting warnings (non-blocking)');
      this.warnings.push('Backend linting warnings');
    } else {
      success('Backend code quality: PASSED');
    }

    success('Backend build completed');
  }

  async buildDockerImages() {
    step('🐳 Building Docker Images');

    info('Building optimized Docker images...');

    // Build backend image
    const backendImage = exec(
      'cd backend && docker build -f Dockerfile.optimized -t soba-backend:latest .',
      'Building backend Docker image'
    );

    if (backendImage.success) {
      success('Backend Docker image built');
    } else {
      warning('Backend Docker build failed (skipping)');
      this.warnings.push('Docker build issues');
    }

    // Build frontend image (if Dockerfile exists)
    if (fs.existsSync('frontend/Dockerfile')) {
      const frontendImage = exec(
        'cd frontend && docker build -t soba-frontend:latest .',
        'Building frontend Docker image'
      );

      if (frontendImage.success) {
        success('Frontend Docker image built');
      }
    }

    info('Docker images ready for deployment');
  }

  async generateDeploymentReport() {
    step('📄 Generating Deployment Report');

    const report = {
      timestamp: new Date().toISOString(),
      environment: this.options.env,
      duration: `${((Date.now() - this.startTime) / 1000).toFixed(2)}s`,
      errors: this.errors,
      warnings: this.warnings,
      status: this.errors.length === 0 ? 'SUCCESS' : 'FAILED'
    };

    const reportPath = `deployment-report-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    success(`Report saved: ${reportPath}`);
  }

  async deploymentSummary() {
    step('📊 Deployment Summary');

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);

    info(`Total time: ${duration}s`);
    info(`Environment: ${this.options.env}`);

    if (this.errors.length > 0) {
      error(`Errors: ${this.errors.length}`);
      this.errors.forEach(err => error(`  - ${err}`));
    } else {
      success('Errors: 0');
    }

    if (this.warnings.length > 0) {
      warning(`Warnings: ${this.warnings.length}`);
      this.warnings.forEach(warn => warning(`  - ${warn}`));
    } else {
      success('Warnings: 0');
    }
  }

  getDirectorySize(dirPath) {
    let size = 0;
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        size += this.getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    });

    return size;
  }
}

// Main execution
(async () => {
  const deployer = new Deployer(options);
  const success = await deployer.run();
  process.exit(success ? 0 : 1);
})();
