#!/usr/bin/env node

/**
 * Frontend Bundle Optimization Script
 * Analyzes and optimizes React bundle size and performance
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class BundleOptimizer {
  constructor() {
    this.frontendDir = path.resolve(__dirname, '../frontend');
    this.buildDir = path.join(this.frontendDir, 'build');
  }

  /**
   * Run complete bundle optimization
   */
  async optimize() {
    console.log('📦 Starting frontend bundle optimization...\n');

    try {
      await this.analyzeCurrentBundle();
      await this.identifyLargeDependencies();
      await this.checkForUnusedCode();
      await this.optimizeImports();
      await this.generateOptimizationReport();

      console.log('\n✅ Bundle optimization analysis completed');
    } catch (error) {
      console.error('\n❌ Bundle optimization failed:', error.message);
    }
  }

  /**
   * Analyze current bundle size
   */
  async analyzeCurrentBundle() {
    console.log('📊 Analyzing current bundle...');

    if (!fs.existsSync(this.buildDir)) {
      console.log('  ℹ️  No build directory found. Run build first.');
      return;
    }

    try {
      // Get bundle stats
      const statsPath = path.join(this.buildDir, 'asset-manifest.json');
      if (fs.existsSync(statsPath)) {
        const manifest = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        console.log('  📄 Bundle files:');
        Object.entries(manifest.files || {}).forEach(([key, file]) => {
          if (file && fs.existsSync(path.join(this.buildDir, file))) {
            const stats = fs.statSync(path.join(this.buildDir, file));
            const sizeKB = (stats.size / 1024).toFixed(1);
            console.log(`    ${key}: ${sizeKB} KB`);
          }
        });
      }

      // Check for source maps
      const hasSourceMaps = fs.readdirSync(this.buildDir).some(file => file.endsWith('.map'));
      if (hasSourceMaps) {
        console.log('  ⚠️  Source maps found in production build');
        console.log('     Consider removing them for production deployment');
      }

    } catch (error) {
      console.log('  ⚠️  Could not analyze bundle:', error.message);
    }
  }

  /**
   * Identify large dependencies
   */
  async identifyLargeDependencies() {
    console.log('\n🔍 Analyzing dependencies...');

    const packageJsonPath = path.join(this.frontendDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      console.log('  📦 Large dependencies to review:');

      // Common large libraries to flag
      const largeLibs = [
        'lodash', 'moment', 'jquery', 'bootstrap',
        'react-icons', 'antd', 'material-ui', '@mui',
        'react-bootstrap', 'styled-components'
      ];

      largeLibs.forEach(lib => {
        if (dependencies[lib]) {
          console.log(`    ⚠️  ${lib}: Consider tree-shaking or alternatives`);
        }
      });

      // Check for multiple UI libraries
      const uiLibs = ['antd', 'material-ui', '@mui', 'react-bootstrap', 'semantic-ui', 'chakra-ui'];
      const usedUiLibs = uiLibs.filter(lib => dependencies[lib]);
      if (usedUiLibs.length > 1) {
        console.log(`    ⚠️  Multiple UI libraries detected: ${usedUiLibs.join(', ')}`);
        console.log('       Consider using only one for better bundle size');
      }

    } catch (error) {
      console.log('  ⚠️  Could not analyze dependencies:', error.message);
    }
  }

  /**
   * Check for unused code
   */
  async checkForUnusedCode() {
    console.log('\n🧹 Checking for unused code...');

    try {
      // Use depcheck to find unused dependencies
      console.log('  🔍 Running dependency check...');
      execSync('npx depcheck --json > depcheck-results.json', {
        cwd: this.frontendDir,
        stdio: 'pipe'
      });

      if (fs.existsSync(path.join(this.frontendDir, 'depcheck-results.json'))) {
        const results = JSON.parse(fs.readFileSync(path.join(this.frontendDir, 'depcheck-results.json'), 'utf8'));

        if (results.dependencies && results.dependencies.length > 0) {
          console.log(`  🚨 ${results.dependencies.length} unused dependencies found:`);
          results.dependencies.slice(0, 10).forEach(dep => {
            console.log(`    - ${dep}`);
          });
          if (results.dependencies.length > 10) {
            console.log(`    ... and ${results.dependencies.length - 10} more`);
          }
        } else {
          console.log('  ✅ No unused dependencies found');
        }

        // Clean up
        fs.unlinkSync(path.join(this.frontendDir, 'depcheck-results.json'));
      }
    } catch (error) {
      console.log('  ⚠️  Could not check for unused dependencies');
      console.log('     Install depcheck globally: npm install -g depcheck');
    }
  }

  /**
   * Optimize imports and suggest improvements
   */
  async optimizeImports() {
    console.log('\n⚡ Analyzing import patterns...');

    const srcDir = path.join(this.frontendDir, 'src');
    if (!fs.existsSync(srcDir)) {
      return;
    }

    const issues = {
      fullLodash: [],
      fullMoment: [],
      largeLibraries: []
    };

    function scanDirectory(dir) {
      const files = fs.readdirSync(dir);

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory() && !file.startsWith('.')) {
          scanDirectory(filePath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js')) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const relativePath = path.relative(srcDir, filePath);

            // Check for full lodash imports
            if (content.includes("from 'lodash'") || content.includes('from "lodash"')) {
              issues.fullLodash.push(relativePath);
            }

            // Check for full moment imports
            if (content.includes("from 'moment'") || content.includes('from "moment"')) {
              issues.fullMoment.push(relativePath);
            }

            // Check for potentially large libraries
            const largeImports = content.match(/from ['"](react-icons|@ant-design|antd|@mui)[^'"]*['"]/g);
            if (largeImports) {
              issues.largeLibraries.push(...largeImports.map(imp => `${relativePath}: ${imp}`));
            }

          } catch (error) {
            // Skip files that can't be read
          }
        }
      });
    }

    scanDirectory(srcDir);

    if (issues.fullLodash.length > 0) {
      console.log(`  ⚠️  Full lodash imports found in ${issues.fullLodash.length} files:`);
      console.log('     Consider: import { specificFunction } from "lodash/specificFunction"');
    }

    if (issues.fullMoment.length > 0) {
      console.log(`  ⚠️  Full moment imports found in ${issues.fullMoment.length} files:`);
      console.log('     Consider: import moment from "moment/src/moment" or use date-fns');
    }

    if (issues.largeLibraries.length > 0) {
      console.log(`  ℹ️  Large library imports detected in ${issues.largeLibraries.length} locations`);
    }
  }

  /**
   * Generate optimization report
   */
  async generateOptimizationReport() {
    console.log('\n📋 Generating optimization recommendations...');

    const recommendations = [
      '🔍 Run bundle analyzer: npm install --save-dev webpack-bundle-analyzer',
      '📦 Use dynamic imports for code splitting',
      '🗜️  Enable gzip compression on server',
      '⚡ Implement proper caching headers',
      '🔧 Consider using Preact instead of React for smaller bundle',
      '📱 Implement lazy loading for routes and components',
      '🗑️  Remove unused dependencies regularly',
      '🎯 Use tree-shaking friendly imports'
    ];

    console.log('  💡 Recommendations:');
    recommendations.forEach(rec => console.log(`    ${rec}`));

    const report = {
      timestamp: new Date().toISOString(),
      recommendations,
      analysis: 'completed'
    };

    const reportPath = path.join(this.frontendDir, 'bundle-optimization-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n📄 Report saved to: ${path.relative(process.cwd(), reportPath)}`);
  }
}

// Run optimization if called directly
if (require.main === module) {
  const optimizer = new BundleOptimizer();
  optimizer.optimize().catch(console.error);
}

module.exports = { BundleOptimizer };
