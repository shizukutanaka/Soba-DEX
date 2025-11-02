/**
 * Automated Security Scanner
 * Scans for vulnerabilities, insecure configurations, and security best practices
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { logger } = require('./productionLogger');

class SecurityScanner {
  constructor() {
    this.scanResults = {
      vulnerabilities: [],
      insecureConfigs: [],
      missingHeaders: [],
      weakPasswords: [],
      exposedSecrets: [],
      outdatedDependencies: [],
      timestamp: new Date().toISOString(),
      score: 100
    };

    this.vulnerabilityPatterns = {
      secrets: [
        /password\s*[:=]\s*['"]([^'"]+)['"]/gi,
        /secret\s*[:=]\s*['"]([^'"]+)['"]/gi,
        /key\s*[:=]\s*['"]([^'"]+)['"]/gi,
        /token\s*[:=]\s*['"]([^'"]+)['"]/gi,
        /api[_-]?key\s*[:=]\s*['"]([^'"]+)['"]/gi
      ],
      insecureHeaders: [
        'x-powered-by',
        'server',
        'x-aspnet-version'
      ],
      weakPasswords: [
        /^password$/i,
        /^123456$/i,
        /^admin$/i,
        /^root$/i
      ]
    };
  }

  /**
   * Run complete security scan
   */
  async runFullScan() {
    logger.info('Starting comprehensive security scan...');

    try {
      await Promise.all([
        this.scanDependencies(),
        this.scanSourceCode(),
        this.scanConfiguration(),
        this.scanEnvironment(),
        this.scanNetworkSecurity(),
        this.scanAccessControls()
      ]);

      this.calculateSecurityScore();
      this.generateReport();

      logger.info(`Security scan completed. Score: ${this.scanResults.score}/100`);
      return this.scanResults;
    } catch (error) {
      logger.error('Security scan failed:', error);
      throw error;
    }
  }

  /**
   * Scan dependencies for vulnerabilities
   */
  async scanDependencies() {
    logger.info('Scanning dependencies for vulnerabilities...');

    try {
      // Run npm audit
      const auditResult = await this.runCommand('npm audit --json');
      const auditData = JSON.parse(auditResult);

      if (auditData.vulnerabilities) {
        Object.entries(auditData.vulnerabilities).forEach(([pkg, vuln]) => {
          this.scanResults.vulnerabilities.push({
            type: 'dependency',
            package: pkg,
            severity: vuln.severity,
            title: vuln.title,
            recommendation: 'Run: npm audit fix'
          });
        });
      }

      // Check for outdated packages
      const outdatedResult = await this.runCommand('npm outdated --json');
      const outdatedData = JSON.parse(outdatedResult);

      Object.entries(outdatedData).forEach(([pkg, info]) => {
        this.scanResults.outdatedDependencies.push({
          package: pkg,
          current: info.current,
          latest: info.latest,
          type: info.type
        });
      });

    } catch (error) {
      logger.warn('Dependency scan failed:', error.message);
    }
  }

  /**
   * Scan source code for security issues
   */
  async scanSourceCode() {
    logger.info('Scanning source code for security issues...');

    const scanDirectory = (dir) => {
      const files = fs.readdirSync(dir);

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          scanDirectory(filePath);
        } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.json'))) {
          this.scanFileForIssues(filePath);
        }
      });
    };

    scanDirectory(process.cwd());
  }

  /**
   * Scan individual file for security issues
   */
  scanFileForIssues(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);

      // Check for exposed secrets
      this.vulnerabilityPatterns.secrets.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          this.scanResults.exposedSecrets.push({
            file: relativePath,
            line: content.substring(0, match.index).split('\n').length,
            type: 'potential_secret',
            snippet: match[0].substring(0, 50) + '...'
          });
        }
      });

      // Check for insecure configurations
      if (content.includes('NODE_ENV=development') && !filePath.includes('example')) {
        this.scanResults.insecureConfigs.push({
          file: relativePath,
          type: 'insecure_env',
          description: 'NODE_ENV set to development in production config'
        });
      }

      // Check for hardcoded URLs
      const urlMatches = content.match(/https?:\/\/[^\s'"]+/g);
      if (urlMatches) {
        urlMatches.forEach(url => {
          if (!url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('example.com')) {
            this.scanResults.insecureConfigs.push({
              file: relativePath,
              type: 'hardcoded_url',
              url: url,
              description: 'Hardcoded URL found - consider using environment variables'
            });
          }
        });
      }

    } catch (error) {
      logger.warn(`Failed to scan file ${filePath}:`, error.message);
    }
  }

  /**
   * Scan configuration files
   */
  async scanConfiguration() {
    logger.info('Scanning configuration files...');

    const configFiles = [
      '.env',
      '.env.production',
      'config/*.js',
      'config/*.json',
      'package.json'
    ];

    configFiles.forEach(pattern => {
      const files = this.globSync(pattern);
      files.forEach(file => {
        if (fs.existsSync(file)) {
          this.scanConfigFile(file);
        }
      });
    });
  }

  /**
   * Scan environment variables
   */
  async scanEnvironment() {
    logger.info('Scanning environment variables...');

    // Check for weak passwords in environment
    Object.entries(process.env).forEach(([key, value]) => {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
        this.vulnerabilityPatterns.weakPasswords.forEach(pattern => {
          if (pattern.test(value)) {
            this.scanResults.weakPasswords.push({
              variable: key,
              type: 'weak_password',
              description: 'Weak password detected in environment variable'
            });
          }
        });
      }
    });

    // Check for missing security environment variables
    const requiredVars = ['JWT_SECRET', 'API_KEY_HMAC_SECRET'];
    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        this.scanResults.insecureConfigs.push({
          type: 'missing_env_var',
          variable: varName,
          description: 'Required security environment variable is missing'
        });
      }
    });
  }

  /**
   * Scan network security
   */
  async scanNetworkSecurity() {
    logger.info('Scanning network security...');

    try {
      // Check if HTTPS is enforced
      if (process.env.NODE_ENV === 'production' && process.env.ENFORCE_HTTPS !== 'true') {
        this.scanResults.insecureConfigs.push({
          type: 'no_https_enforcement',
          description: 'HTTPS enforcement not enabled in production'
        });
      }

      // Check CORS configuration
      const allowedOrigins = process.env.ALLOWED_ORIGINS;
      if (allowedOrigins && allowedOrigins.includes('*')) {
        this.scanResults.insecureConfigs.push({
          type: 'wildcard_cors',
          description: 'CORS allows all origins (*) - consider restricting'
        });
      }

    } catch (error) {
      logger.warn('Network security scan failed:', error.message);
    }
  }

  /**
   * Scan access controls
   */
  async scanAccessControls() {
    logger.info('Scanning access controls...');

    // This would integrate with the actual access control system
    // For now, check for basic RBAC configuration
    const configFiles = this.globSync('**/config/*.js');
    configFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (!content.includes('roles') && !content.includes('permissions')) {
          this.scanResults.insecureConfigs.push({
            file: path.relative(process.cwd(), file),
            type: 'missing_rbac',
            description: 'No role-based access control configuration found'
          });
        }
      } catch (error) {
        // Ignore file read errors
      }
    });
  }

  /**
   * Calculate overall security score
   */
  calculateSecurityScore() {
    let deductions = 0;

    // High severity issues
    deductions += this.scanResults.vulnerabilities.filter(v => v.severity === 'high').length * 20;
    deductions += this.scanResults.vulnerabilities.filter(v => v.severity === 'moderate').length * 10;
    deductions += this.scanResults.exposedSecrets.length * 25;
    deductions += this.scanResults.insecureConfigs.length * 15;

    // Medium severity issues
    deductions += this.scanResults.weakPasswords.length * 10;
    deductions += this.scanResults.outdatedDependencies.length * 5;

    this.scanResults.score = Math.max(0, 100 - deductions);
  }

  /**
   * Generate security report
   */
  generateReport() {
    const report = {
      summary: {
        score: this.scanResults.score,
        totalIssues: this.getTotalIssues(),
        criticalIssues: this.getCriticalIssues(),
        scanTime: this.scanResults.timestamp
      },
      issues: this.scanResults,
      recommendations: this.generateRecommendations()
    };

    // Save report to file
    const reportPath = path.join(process.cwd(), 'security-scan-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    logger.info(`Security scan report saved to: ${reportPath}`);
  }

  /**
   * Generate security recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    if (this.scanResults.vulnerabilities.length > 0) {
      recommendations.push('Run "npm audit fix" to fix dependency vulnerabilities');
    }

    if (this.scanResults.exposedSecrets.length > 0) {
      recommendations.push('Move secrets to environment variables or secure key management service');
    }

    if (this.scanResults.insecureConfigs.length > 0) {
      recommendations.push('Review and fix insecure configuration settings');
    }

    if (this.scanResults.weakPasswords.length > 0) {
      recommendations.push('Use strong, unique passwords and consider password managers');
    }

    if (this.scanResults.outdatedDependencies.length > 0) {
      recommendations.push('Update outdated dependencies regularly');
    }

    return recommendations;
  }

  /**
   * Helper methods
   */
  getTotalIssues() {
    return this.scanResults.vulnerabilities.length +
           this.scanResults.insecureConfigs.length +
           this.scanResults.exposedSecrets.length +
           this.scanResults.weakPasswords.length +
           this.scanResults.outdatedDependencies.length;
  }

  getCriticalIssues() {
    return this.scanResults.vulnerabilities.filter(v => v.severity === 'high').length +
           this.scanResults.exposedSecrets.length;
  }

  runCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  globSync(pattern) {
    // Simple glob implementation for common patterns
    const results = [];
    const parts = pattern.split('/');

    const scan = (dir, index) => {
      if (index >= parts.length) {
        return;
      }

      const part = parts[index];
      const files = fs.readdirSync(dir);

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (part === '*' || file === part || (part.includes('*') && new RegExp(part.replace(/\*/g, '.*')).test(file))) {
          if (index === parts.length - 1) {
            results.push(filePath);
          } else if (stat.isDirectory()) {
            scan(filePath, index + 1);
          }
        }
      });
    };

    scan(process.cwd(), 0);
    return results;
  }

  scanConfigFile(filePath) {
    // Implementation for scanning specific config files
    // This would check for insecure settings in various config files
  }
}

module.exports = { SecurityScanner };
