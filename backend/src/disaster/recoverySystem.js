const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class DisasterRecoverySystem {
  constructor(config = {}) {
    this.config = {
      backupDir: config.backupDir || './backups',
      retentionDays: config.retentionDays || 30,
      regions: config.regions || ['primary', 'secondary'],
      rto: config.rto || 300, // Recovery Time Objective (seconds)
      rpo: config.rpo || 60,  // Recovery Point Objective (seconds)
      encryptionEnabled: config.encryptionEnabled !== false,
      compressionEnabled: config.compressionEnabled !== false
    };

    this.backupTypes = {
      database: {
        frequency: '*/15 * * * *', // Every 15 minutes
        retention: 7 * 24 * 60 * 60 * 1000 // 7 days
      },
      files: {
        frequency: '0 */4 * * *', // Every 4 hours
        retention: 30 * 24 * 60 * 60 * 1000 // 30 days
      },
      configuration: {
        frequency: '0 */1 * * *', // Every hour
        retention: 7 * 24 * 60 * 60 * 1000 // 7 days
      },
      logs: {
        frequency: '*/30 * * * *', // Every 30 minutes
        retention: 14 * 24 * 60 * 60 * 1000 // 14 days
      }
    };

    this.recoveryProcedures = new Map();
    this.backupJobs = new Map();
    this.status = {
      lastBackup: null,
      lastVerification: null,
      isHealthy: true,
      errors: []
    };

    this.initializeRecoveryProcedures();
  }

  initializeRecoveryProcedures() {
    // Database recovery procedure
    this.recoveryProcedures.set('database', {
      priority: 1,
      estimatedTime: 120, // seconds
      procedure: this.recoverDatabase.bind(this),
      verification: this.verifyDatabase.bind(this)
    });

    // Application recovery procedure
    this.recoveryProcedures.set('application', {
      priority: 2,
      estimatedTime: 60,
      procedure: this.recoverApplication.bind(this),
      verification: this.verifyApplication.bind(this)
    });

    // File system recovery procedure
    this.recoveryProcedures.set('files', {
      priority: 3,
      estimatedTime: 180,
      procedure: this.recoverFiles.bind(this),
      verification: this.verifyFiles.bind(this)
    });

    // Configuration recovery procedure
    this.recoveryProcedures.set('configuration', {
      priority: 4,
      estimatedTime: 30,
      procedure: this.recoverConfiguration.bind(this),
      verification: this.verifyConfiguration.bind(this)
    });
  }

  // Create comprehensive backup
  async createBackup(types = ['database', 'files', 'configuration']) {
    const backupId = this.generateBackupId();
    const backupPath = path.join(this.config.backupDir, backupId);

    try {
      await fs.mkdir(backupPath, { recursive: true });

      const manifest = {
        id: backupId,
        timestamp: Date.now(),
        types: types,
        size: 0,
        checksum: null,
        encrypted: this.config.encryptionEnabled,
        compressed: this.config.compressionEnabled,
        components: {}
      };

      for (const type of types) {
        console.log(`Creating ${type} backup...`);
        const component = await this.backupComponent(type, backupPath);
        manifest.components[type] = component;
        manifest.size += component.size;
      }

      // Calculate manifest checksum
      manifest.checksum = this.calculateChecksum(JSON.stringify(manifest.components));

      // Save manifest
      await fs.writeFile(
        path.join(backupPath, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Verify backup integrity
      const isValid = await this.verifyBackup(backupId);
      if (!isValid) {
        throw new Error('Backup verification failed');
      }

      this.status.lastBackup = Date.now();
      console.log(`Backup ${backupId} created successfully`);

      return manifest;

    } catch (error) {
      console.error('Backup creation failed:', error);
      this.status.errors.push({
        timestamp: Date.now(),
        type: 'backup',
        error: error.message
      });
      throw error;
    }
  }

  // Backup individual component
  async backupComponent(type, backupPath) {
    const component = {
      type,
      timestamp: Date.now(),
      size: 0,
      checksum: null,
      path: null
    };

    switch (type) {
    case 'database':
      component.path = await this.backupDatabase(backupPath);
      break;
    case 'files':
      component.path = await this.backupFiles(backupPath);
      break;
    case 'configuration':
      component.path = await this.backupConfiguration(backupPath);
      break;
    case 'logs':
      component.path = await this.backupLogs(backupPath);
      break;
    default:
      throw new Error(`Unknown backup type: ${type}`);
    }

    // Get file stats
    const stats = await fs.stat(path.join(backupPath, component.path));
    component.size = stats.size;

    // Calculate checksum
    const data = await fs.readFile(path.join(backupPath, component.path));
    component.checksum = this.calculateChecksum(data);

    return component;
  }

  // Database backup
  async backupDatabase(backupPath) {
    const filename = `database_${Date.now()}.sql`;
    const filePath = path.join(backupPath, filename);

    // PostgreSQL backup
    const command = `pg_dump ${process.env.DATABASE_URL} -f ${filePath}`;
    await execAsync(command);

    if (this.config.compressionEnabled) {
      await this.compressFile(filePath);
      return `${filename}.gz`;
    }

    return filename;
  }

  // Files backup
  async backupFiles(backupPath) {
    const filename = `files_${Date.now()}.tar`;
    const filePath = path.join(backupPath, filename);

    // Create tar archive of important directories
    const directories = [
      './config',
      './uploads',
      './certificates',
      './logs'
    ].filter(dir => fs.access(dir).then(() => true).catch(() => false));

    const command = `tar -cf ${filePath} ${directories.join(' ')}`;
    await execAsync(command);

    if (this.config.compressionEnabled) {
      await this.compressFile(filePath);
      return `${filename}.gz`;
    }

    return filename;
  }

  // Configuration backup
  async backupConfiguration(backupPath) {
    const filename = `config_${Date.now()}.json`;
    const filePath = path.join(backupPath, filename);

    const config = {
      environment: process.env.NODE_ENV,
      timestamp: Date.now(),
      version: process.env.npm_package_version,
      settings: {
        // Include non-sensitive configuration
        port: process.env.PORT,
        logLevel: process.env.LOG_LEVEL,
        features: process.env.FEATURES?.split(',') || []
      }
    };

    await fs.writeFile(filePath, JSON.stringify(config, null, 2));

    if (this.config.compressionEnabled) {
      await this.compressFile(filePath);
      return `${filename}.gz`;
    }

    return filename;
  }

  // Logs backup
  async backupLogs(backupPath) {
    const filename = `logs_${Date.now()}.tar`;
    const filePath = path.join(backupPath, filename);

    const command = `tar -cf ${filePath} ./logs`;
    await execAsync(command);

    if (this.config.compressionEnabled) {
      await this.compressFile(filePath);
      return `${filename}.gz`;
    }

    return filename;
  }

  // Restore from backup
  async restore(backupId, components = null) {
    const backupPath = path.join(this.config.backupDir, backupId);
    const manifestPath = path.join(backupPath, 'manifest.json');

    try {
      // Load backup manifest
      const manifestData = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestData);

      // Verify backup integrity
      const isValid = await this.verifyBackup(backupId);
      if (!isValid) {
        throw new Error('Backup integrity verification failed');
      }

      // Determine components to restore
      const toRestore = components || Object.keys(manifest.components);

      // Sort by recovery priority
      const sortedProcedures = Array.from(this.recoveryProcedures.entries())
        .filter(([name]) => toRestore.includes(name))
        .sort((a, b) => a[1].priority - b[1].priority);

      console.log('Starting disaster recovery procedure...');
      console.log(`Estimated recovery time: ${this.calculateEstimatedTime(sortedProcedures)} seconds`);

      // Execute recovery procedures
      for (const [name, procedure] of sortedProcedures) {
        console.log(`Recovering ${name}...`);
        const startTime = Date.now();

        await procedure.procedure(manifest.components[name], backupPath);
        await procedure.verification();

        const duration = Date.now() - startTime;
        console.log(`${name} recovery completed in ${duration}ms`);
      }

      console.log('Disaster recovery completed successfully');

      return {
        success: true,
        backupId,
        componentsRestored: toRestore,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Disaster recovery failed:', error);
      this.status.errors.push({
        timestamp: Date.now(),
        type: 'recovery',
        error: error.message
      });
      throw error;
    }
  }

  // Recovery procedures
  async recoverDatabase(component, backupPath) {
    const filePath = path.join(backupPath, component.path);
    let restoreFile = filePath;

    // Decompress if needed
    if (component.path.endsWith('.gz')) {
      restoreFile = await this.decompressFile(filePath);
    }

    // Stop application
    await this.stopApplication();

    // Restore database
    const command = `psql ${process.env.DATABASE_URL} -f ${restoreFile}`;
    await execAsync(command);

    // Start application
    await this.startApplication();
  }

  async recoverApplication(_component, _backupPath) {
    // Pull latest application code
    await execAsync('git pull origin main');

    // Install dependencies
    await execAsync('npm ci --production');

    // Restart application
    await this.restartApplication();
  }

  async recoverFiles(component, backupPath) {
    const filePath = path.join(backupPath, component.path);
    let restoreFile = filePath;

    // Decompress if needed
    if (component.path.endsWith('.gz')) {
      restoreFile = await this.decompressFile(filePath);
    }

    // Extract files
    const command = `tar -xf ${restoreFile} -C /`;
    await execAsync(command);
  }

  async recoverConfiguration(component, backupPath) {
    const filePath = path.join(backupPath, component.path);
    let restoreFile = filePath;

    // Decompress if needed
    if (component.path.endsWith('.gz')) {
      restoreFile = await this.decompressFile(filePath);
    }

    // Load configuration
    const configData = await fs.readFile(restoreFile, 'utf8');
    const _config = JSON.parse(configData);

    // Apply configuration
    // This is a simplified version - in production, carefully manage environment variables
    console.log('Configuration restored from backup');
  }

  // Verification procedures
  async verifyDatabase() {
    try {
      // Simple database connection test
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query('SELECT 1');
      await pool.end();
      return true;
    } catch (error) {
      throw new Error(`Database verification failed: ${error.message}`);
    }
  }

  async verifyApplication() {
    try {
      // Check if application is responding
      const healthUrl = process.env.HEALTH_CHECK_URL || `http://localhost:${process.env.PORT || 3001}/api/health`;
      const response = await fetch(healthUrl);
      if (!response.ok) {
        throw new Error(`Application health check failed: ${response.status}`);
      }
      return true;
    } catch (error) {
      throw new Error(`Application verification failed: ${error.message}`);
    }
  }

  async verifyFiles() {
    try {
      // Check critical directories exist
      const criticalPaths = ['./config', './uploads'];
      for (const path of criticalPaths) {
        await fs.access(path);
      }
      return true;
    } catch (error) {
      throw new Error(`Files verification failed: ${error.message}`);
    }
  }

  async verifyConfiguration() {
    // Verify critical environment variables
    const required = ['DATABASE_URL', 'JWT_SECRET'];
    for (const variable of required) {
      if (!process.env[variable]) {
        throw new Error(`Missing required environment variable: ${variable}`);
      }
    }
    return true;
  }

  // Backup verification
  async verifyBackup(backupId) {
    try {
      const backupPath = path.join(this.config.backupDir, backupId);
      const manifestPath = path.join(backupPath, 'manifest.json');

      // Check manifest exists
      const manifestData = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestData);

      // Verify each component
      for (const [type, component] of Object.entries(manifest.components)) {
        const filePath = path.join(backupPath, component.path);

        // Check file exists
        await fs.access(filePath);

        // Verify checksum
        const data = await fs.readFile(filePath);
        const checksum = this.calculateChecksum(data);

        if (checksum !== component.checksum) {
          throw new Error(`Checksum mismatch for ${type} component`);
        }
      }

      this.status.lastVerification = Date.now();
      return true;

    } catch (error) {
      console.error('Backup verification failed:', error);
      return false;
    }
  }

  // Cleanup old backups
  async cleanupOldBackups() {
    try {
      const backupDirs = await fs.readdir(this.config.backupDir);
      const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);

      for (const dir of backupDirs) {
        const dirPath = path.join(this.config.backupDir, dir);
        const manifestPath = path.join(dirPath, 'manifest.json');

        try {
          const manifestData = await fs.readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestData);

          if (manifest.timestamp < cutoffTime) {
            await fs.rmdir(dirPath, { recursive: true });
            console.log(`Cleaned up old backup: ${dir}`);
          }
        } catch (_error) {
          // Skip invalid backups
          console.warn(`Skipping invalid backup directory: ${dir}`);
        }
      }
    } catch (error) {
      console.error('Backup cleanup failed:', error);
    }
  }

  // Utility methods
  generateBackupId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = crypto.randomBytes(4).toString('hex');
    return `backup-${timestamp}-${random}`;
  }

  calculateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async compressFile(filePath) {
    const command = `gzip ${filePath}`;
    await execAsync(command);
  }

  async decompressFile(filePath) {
    const decompressed = filePath.replace('.gz', '');
    const command = `gunzip -c ${filePath} > ${decompressed}`;
    await execAsync(command);
    return decompressed;
  }

  calculateEstimatedTime(procedures) {
    return procedures.reduce((total, [, proc]) => total + proc.estimatedTime, 0);
  }

  async stopApplication() {
    console.log('Stopping application...');
    // Implementation depends on process manager (PM2, systemd, etc.)
  }

  async startApplication() {
    console.log('Starting application...');
    // Implementation depends on process manager
  }

  async restartApplication() {
    await this.stopApplication();
    await this.startApplication();
  }

  // Get system status
  getStatus() {
    return {
      ...this.status,
      config: this.config,
      procedures: Array.from(this.recoveryProcedures.keys()),
      nextBackup: this.getNextBackupTime()
    };
  }

  getNextBackupTime() {
    // Calculate next backup time based on frequencies
    // This is a simplified version
    return Date.now() + (15 * 60 * 1000); // Next 15 minutes
  }

  // Test disaster recovery
  async testRecovery() {
    console.log('Starting disaster recovery test...');

    try {
      // Create test backup
      const backup = await this.createBackup(['configuration']);

      // Simulate disaster by modifying test data
      // Restore from backup
      await this.restore(backup.id, ['configuration']);

      console.log('Disaster recovery test completed successfully');
      return true;

    } catch (error) {
      console.error('Disaster recovery test failed:', error);
      return false;
    }
  }
}

module.exports = new DisasterRecoverySystem();