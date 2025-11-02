// Backup manager for data persistence and recovery

const fs = require('fs').promises;
const path = require('path');
const { createWriteStream, createReadStream } = require('fs');
const { createGzip, createGunzip } = require('zlib');
const { pipeline } = require('stream/promises');

class BackupManager {
  constructor(options = {}) {
    this.backupDir = options.backupDir || path.join(__dirname, '../../backups');
    this.maxBackups = options.maxBackups || 10;
    this.compression = options.compression !== false;
    this.autoBackup = options.autoBackup !== false;
    this.backupInterval = options.backupInterval || 86400000; // 24 hours

    if (this.autoBackup) {
      this.startAutoBackup();
    }
  }

  // Ensure backup directory exists
  async ensureBackupDir() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error('[BACKUP] Failed to create backup directory:', error.message);
    }
  }

  // Create backup
  async createBackup(data, name = 'backup') {
    await this.ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.json${this.compression ? '.gz' : ''}`;
    const filepath = path.join(this.backupDir, filename);

    try {
      const jsonData = JSON.stringify(data, null, 2);

      if (this.compression) {
        // Compress backup
        const gzip = createGzip();
        const source = Buffer.from(jsonData);
        const destination = createWriteStream(filepath);

        await pipeline(
          async function* () {
            yield source;
          }(),
          gzip,
          destination
        );
      } else {
        // Write without compression
        await fs.writeFile(filepath, jsonData, 'utf8');
      }

      console.log(`[BACKUP] Created: ${filename}`);

      // Clean old backups
      await this.cleanOldBackups(name);

      return {
        success: true,
        filename,
        filepath,
        size: (await fs.stat(filepath)).size,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[BACKUP] Failed to create backup:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Restore from backup
  async restoreBackup(filename) {
    const filepath = path.join(this.backupDir, filename);

    try {
      let data;

      if (filename.endsWith('.gz')) {
        // Decompress backup
        const gunzip = createGunzip();
        const source = createReadStream(filepath);
        const chunks = [];

        await pipeline(
          source,
          gunzip,
          async function* (source) {
            for await (const chunk of source) {
              chunks.push(chunk);
              yield; // Generator must yield
            }
          }
        );

        data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } else {
        // Read without decompression
        const content = await fs.readFile(filepath, 'utf8');
        data = JSON.parse(content);
      }

      console.log(`[BACKUP] Restored: ${filename}`);

      return {
        success: true,
        data,
        filename,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[BACKUP] Failed to restore backup:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // List all backups
  async listBackups(name = null) {
    await this.ensureBackupDir();

    try {
      const files = await fs.readdir(this.backupDir);

      let backupFiles = files.filter(file =>
        file.endsWith('.json') || file.endsWith('.json.gz')
      );

      // Filter by name if provided
      if (name) {
        backupFiles = backupFiles.filter(file => file.startsWith(name));
      }

      // Get file stats
      const backups = await Promise.all(
        backupFiles.map(async (file) => {
          const filepath = path.join(this.backupDir, file);
          const stats = await fs.stat(filepath);

          return {
            filename: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            compressed: file.endsWith('.gz')
          };
        })
      );

      // Sort by creation time (newest first)
      backups.sort((a, b) => b.created - a.created);

      return backups;
    } catch (error) {
      console.error('[BACKUP] Failed to list backups:', error.message);
      return [];
    }
  }

  // Clean old backups
  async cleanOldBackups(name = null) {
    const backups = await this.listBackups(name);

    if (backups.length <= this.maxBackups) {
      return;
    }

    // Delete oldest backups
    const toDelete = backups.slice(this.maxBackups);

    for (const backup of toDelete) {
      try {
        const filepath = path.join(this.backupDir, backup.filename);
        await fs.unlink(filepath);
        console.log(`[BACKUP] Deleted old backup: ${backup.filename}`);
      } catch (error) {
        console.error(`[BACKUP] Failed to delete ${backup.filename}:`, error.message);
      }
    }
  }

  // Delete specific backup
  async deleteBackup(filename) {
    const filepath = path.join(this.backupDir, filename);

    try {
      await fs.unlink(filepath);
      console.log(`[BACKUP] Deleted: ${filename}`);
      return { success: true };
    } catch (error) {
      console.error('[BACKUP] Failed to delete backup:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Get latest backup
  async getLatestBackup(name = null) {
    const backups = await this.listBackups(name);
    return backups.length > 0 ? backups[0] : null;
  }

  // Start automatic backups
  startAutoBackup() {
    this.backupTimer = setInterval(() => {
      console.log('[BACKUP] Running automatic backup...');
      // This should be called with actual data from the application
      // Example: this.createBackup(dataToBackup, 'auto-backup');
    }, this.backupInterval);

    console.log(`[BACKUP] Automatic backup enabled (every ${this.backupInterval / 1000}s)`);
  }

  // Stop automatic backups
  stopAutoBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
      console.log('[BACKUP] Automatic backup disabled');
    }
  }

  // Get backup statistics
  async getStats() {
    const backups = await this.listBackups();

    if (backups.length === 0) {
      return {
        totalBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null
      };
    }

    const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);

    return {
      totalBackups: backups.length,
      totalSize: totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      oldestBackup: backups[backups.length - 1],
      newestBackup: backups[0],
      compressionEnabled: this.compression,
      maxBackups: this.maxBackups,
      autoBackupEnabled: this.autoBackup
    };
  }

  // Format bytes to human readable
  formatBytes(bytes) {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = BackupManager;