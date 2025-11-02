#!/usr/bin/env node

/**
 * Automated Dependency Management Script
 * Updates dependencies, checks for vulnerabilities, and optimizes bundle
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DependencyManager {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.backendDir = path.join(this.rootDir, 'backend');
    this.frontendDir = path.join(this.rootDir, 'frontend');
    this.contractsDir = path.join(this.rootDir, 'contracts');
  }

  /**
   * Run complete dependency maintenance
   */
  async runMaintenance() {
    console.log('🔧 Starting automated dependency maintenance...\n');

    try {
      await this.checkOutdatedDependencies();
      await this.updateDependencies();
      await this.auditSecurity();
      await this.optimizeBundleSize();
      await this.generateReports();

      console.log('\n✅ Dependency maintenance completed successfully');
    } catch (error) {
      console.error('\n❌ Dependency maintenance failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Check for outdated dependencies
   */
  async checkOutdatedDependencies() {
    console.log('📦 Checking for outdated dependencies...');

    const dirs = [this.rootDir, this.backendDir, this.frontendDir, this.contractsDir];

    for (const dir of dirs) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        console.log(`\nChecking ${path.relative(this.rootDir, dir) || 'root'}:`);
        try {
          const result = execSync('npm outdated --json', {
            cwd: dir,
            encoding: 'utf8',
            stdio: 'pipe'
          });

          const outdated = JSON.parse(result);
          const count = Object.keys(outdated).length;

          if (count > 0) {
            console.log(`  ⚠️  ${count} outdated packages`);
            Object.entries(outdated).slice(0, 5).forEach(([pkg, info]) => {
              console.log(`    - ${pkg}: ${info.current} → ${info.latest}`);
            });
            if (count > 5) {
              console.log(`    ... and ${count - 5} more`);
            }
          } else {
            console.log('  ✅ All packages up to date');
          }
        } catch (error) {
          console.log(`  ⚠️  Could not check outdated packages: ${error.message}`);
        }
      }
    }
  }

  /**
   * Update dependencies safely
   */
  async updateDependencies() {
    console.log('\n⬆️  Updating dependencies...');

    // Update patch and minor versions only (safe updates)
    const updateCommands = [
      { dir: this.backendDir, cmd: 'npm update' },
      { dir: this.frontendDir, cmd: 'npm update' },
      { dir: this.contractsDir, cmd: 'npm update' }
    ];

    for (const { dir, cmd } of updateCommands) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        console.log(`Updating ${path.relative(this.rootDir, dir) || 'root'}...`);
        try {
          execSync(cmd, { cwd: dir, stdio: 'inherit' });
          console.log(`  ✅ Updated successfully`);
        } catch (error) {
          console.log(`  ⚠️  Update failed: ${error.message}`);
        }
      }
    }
  }

  /**
   * Run security audits
   */
  async auditSecurity() {
    console.log('\n🔒 Running security audits...');

    const dirs = [this.rootDir, this.backendDir, this.frontendDir, this.contractsDir];
    let totalVulnerabilities = 0;

    for (const dir of dirs) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        console.log(`\nAuditing ${path.relative(this.rootDir, dir) || 'root'}:`);
        try {
          const result = execSync('npm audit --json', {
            cwd: dir,
            encoding: 'utf8',
            stdio: 'pipe'
          });

          const audit = JSON.parse(result);
          const vulnCount = audit.metadata?.vulnerabilities?.total || 0;

          if (vulnCount > 0) {
            console.log(`  🚨 ${vulnCount} vulnerabilities found`);
            totalVulnerabilities += vulnCount;

            // Try to fix automatically
            console.log('  🔧 Attempting automatic fixes...');
            try {
              execSync('npm audit fix', { cwd: dir, stdio: 'pipe' });
              console.log('  ✅ Some vulnerabilities fixed automatically');
            } catch (fixError) {
              console.log('  ⚠️  Manual fixes may be required');
            }
          } else {
            console.log('  ✅ No vulnerabilities found');
          }
        } catch (error) {
          console.log(`  ⚠️  Audit failed: ${error.message}`);
        }
      }
    }

    if (totalVulnerabilities > 0) {
      console.log(`\n⚠️  Total vulnerabilities across all packages: ${totalVulnerabilities}`);
      console.log('Consider running: npm audit fix --force (may include breaking changes)');
    }
  }

  /**
   * Optimize bundle size (frontend only)
   */
  async optimizeBundleSize() {
    console.log('\n📦 Optimizing bundle size...');

    if (fs.existsSync(path.join(this.frontendDir, 'package.json'))) {
      console.log('Analyzing frontend bundle...');

      // Check for bundle analyzer
      const packageJson = JSON.parse(fs.readFileSync(path.join(this.frontendDir, 'package.json'), 'utf8'));

      if (packageJson.dependencies && packageJson.dependencies['webpack-bundle-analyzer']) {
        console.log('  📊 Running bundle analyzer...');
        try {
          execSync('npm run build --if-present && npm run analyze --if-present', {
            cwd: this.frontendDir,
            stdio: 'pipe'
          });
          console.log('  ✅ Bundle analysis completed');
        } catch (error) {
          console.log('  ⚠️  Bundle analysis not available or failed');
        }
      } else {
        console.log('  ℹ️  Consider adding webpack-bundle-analyzer for bundle analysis');
      }

      // Check for unused dependencies
      console.log('  🔍 Checking for unused dependencies...');
      try {
        execSync('npx depcheck --json', {
          cwd: this.frontendDir,
          stdio: 'pipe'
        });
        console.log('  ✅ Dependency check completed');
      } catch (error) {
        console.log('  ⚠️  Could not check for unused dependencies');
      }
    }
  }

  /**
   * Generate maintenance reports
   */
  async generateReports() {
    console.log('\n📋 Generating maintenance reports...');

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        lastMaintenance: new Date().toISOString(),
        status: 'completed'
      },
      recommendations: [
        'Run this script regularly (weekly/monthly)',
        'Review breaking changes before major updates',
        'Monitor bundle size for performance impact',
        'Keep security vulnerabilities at zero'
      ]
    };

    const reportPath = path.join(this.rootDir, 'dependency-maintenance-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`  📄 Report saved to: ${path.relative(process.cwd(), reportPath)}`);
  }
}

// Run maintenance if called directly
if (require.main === module) {
  const manager = new DependencyManager();
  manager.runMaintenance().catch(console.error);
}

module.exports = { DependencyManager };
