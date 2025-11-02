class DatabaseMigrations {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.migrationsTable = 'schema_migrations';
    this.migrationHistory = new Map();
    this.config = {
      migrationsPath: './migrations',
      maxRetries: 3,
      lockTimeout: 300000, // 5 minutes
      batchSize: 1000
    };
    this.runningMigrations = new Set();
  }

  // Initialize migrations system
  async initialize() {
    try {
      await this.createMigrationsTable();
      await this.loadMigrationHistory();
      console.log('Database migration system initialized');
    } catch (error) {
      console.error('Migration system initialization failed:', error);
      throw error;
    }
  }

  // Create migrations tracking table
  async createMigrationsTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        execution_time INTEGER NOT NULL,
        checksum VARCHAR(64),
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        rollback_sql TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_migrations_version ON ${this.migrationsTable}(version);
      CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON ${this.migrationsTable}(applied_at);
    `;

    await this.executeSQL(createTableSQL);
  }

  // Load migration history
  async loadMigrationHistory() {
    const result = await this.executeSQL(
      `SELECT * FROM ${this.migrationsTable} ORDER BY applied_at ASC`
    );

    this.migrationHistory.clear();
    for (const row of result.rows || []) {
      this.migrationHistory.set(row.version, {
        name: row.name,
        appliedAt: row.applied_at,
        executionTime: row.execution_time,
        checksum: row.checksum,
        success: row.success,
        errorMessage: row.error_message,
        rollbackSql: row.rollback_sql
      });
    }
  }

  // Create new migration
  createMigration(name, description = '') {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.]/g, '')
      .slice(0, 14);
    const version = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}`;

    const migrationTemplate = `-- Migration: ${name}
-- Version: ${version}
-- Description: ${description}
-- Created: ${new Date().toISOString()}

-- UP Migration
BEGIN;

-- Add your schema changes here
-- Example:
-- CREATE TABLE example_table (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- CREATE INDEX idx_example_name ON example_table(name);

COMMIT;

-- DOWN Migration (Rollback)
-- BEGIN;
-- DROP TABLE IF EXISTS example_table;
-- COMMIT;
`;

    return {
      version,
      filename: `${version}.sql`,
      content: migrationTemplate,
      path: `${this.config.migrationsPath}/${version}.sql`
    };
  }

  // Apply single migration
  async applyMigration(migrationData) {
    const { version, name, sql, rollbackSql } = migrationData;

    if (this.runningMigrations.has(version)) {
      throw new Error(`Migration ${version} is already running`);
    }

    if (this.migrationHistory.has(version)) {
      console.log(`Migration ${version} already applied, skipping`);
      return { success: true, skipped: true };
    }

    this.runningMigrations.add(version);
    const startTime = Date.now();

    try {
      // Acquire migration lock
      await this.acquireMigrationLock(version);

      // Calculate checksum
      const checksum = this.calculateChecksum(sql);

      // Execute migration in transaction
      await this.executeSQL('BEGIN');

      try {
        await this.executeSQL(sql);

        // Record successful migration
        await this.recordMigration({
          version,
          name,
          executionTime: Date.now() - startTime,
          checksum,
          success: true,
          rollbackSql
        });

        await this.executeSQL('COMMIT');

        // Update local history
        this.migrationHistory.set(version, {
          name,
          appliedAt: new Date(),
          executionTime: Date.now() - startTime,
          checksum,
          success: true,
          rollbackSql
        });

        console.log(`Migration ${version} applied successfully`);
        return { success: true, executionTime: Date.now() - startTime };
      } catch (migrationError) {
        await this.executeSQL('ROLLBACK');

        // Record failed migration
        await this.recordMigration({
          version,
          name,
          executionTime: Date.now() - startTime,
          checksum,
          success: false,
          errorMessage: migrationError.message,
          rollbackSql
        });

        throw migrationError;
      }
    } catch (error) {
      console.error(`Migration ${version} failed:`, error);
      throw error;
    } finally {
      await this.releaseMigrationLock(version);
      this.runningMigrations.delete(version);
    }
  }

  // Apply multiple migrations
  async migrate(options = {}) {
    const { target, dryRun = false } = options;

    try {
      const pendingMigrations = await this.getPendingMigrations(target);

      if (pendingMigrations.length === 0) {
        console.log('No pending migrations found');
        return { success: true, applied: [] };
      }

      if (dryRun) {
        console.log('Dry run - would apply these migrations:');
        pendingMigrations.forEach(m =>
          console.log(`  - ${m.version}: ${m.name}`)
        );
        return { success: true, dryRun: true, migrations: pendingMigrations };
      }

      const results = [];

      for (const migration of pendingMigrations) {
        try {
          const result = await this.applyMigration(migration);
          results.push({ ...migration, result });
        } catch (error) {
          console.error(
            `Failed to apply migration ${migration.version}:`,
            error
          );
          results.push({ ...migration, error: error.message });

          if (!options.continueOnError) {
            break;
          }
        }
      }

      return { success: true, applied: results };
    } catch (error) {
      console.error('Migration process failed:', error);
      throw error;
    }
  }

  // Rollback migration
  async rollback(version) {
    const migration = this.migrationHistory.get(version);

    if (!migration) {
      throw new Error(`Migration ${version} not found in history`);
    }

    if (!migration.success) {
      throw new Error(`Cannot rollback failed migration ${version}`);
    }

    if (!migration.rollbackSql) {
      throw new Error(`No rollback SQL available for migration ${version}`);
    }

    try {
      await this.executeSQL('BEGIN');

      // Execute rollback SQL
      await this.executeSQL(migration.rollbackSql);

      // Remove from migration history
      await this.executeSQL(
        `DELETE FROM ${this.migrationsTable} WHERE version = $1`,
        [version]
      );

      await this.executeSQL('COMMIT');

      // Update local history
      this.migrationHistory.delete(version);

      console.log(`Migration ${version} rolled back successfully`);
      return { success: true };
    } catch (error) {
      await this.executeSQL('ROLLBACK');
      console.error(`Rollback of migration ${version} failed:`, error);
      throw error;
    }
  }

  // Get pending migrations
  async getPendingMigrations(target = null) {
    const availableMigrations = await this.getAvailableMigrations();
    const applied = new Set(this.migrationHistory.keys());

    let pending = availableMigrations.filter(m => !applied.has(m.version));

    // Sort by version
    pending.sort((a, b) => a.version.localeCompare(b.version));

    // Filter by target if specified
    if (target) {
      pending = pending.filter(m => m.version <= target);
    }

    return pending;
  }

  // Get available migrations (mock - in production would read from filesystem)
  async getAvailableMigrations() {
    // Mock migrations for demonstration
    return [
      {
        version: '20241201120000_initial_schema',
        name: 'Initial database schema',
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            wallet_address VARCHAR(42) UNIQUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `,
        rollbackSql: 'DROP TABLE IF EXISTS users;'
      },
      {
        version: '20241201130000_add_tokens',
        name: 'Add tokens table',
        sql: `
          CREATE TABLE IF NOT EXISTS tokens (
            id SERIAL PRIMARY KEY,
            symbol VARCHAR(20) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            decimals INTEGER DEFAULT 18
          );
        `,
        rollbackSql: 'DROP TABLE IF EXISTS tokens;'
      }
    ];
  }

  // Record migration in database
  async recordMigration(migrationData) {
    const {
      version,
      name,
      executionTime,
      checksum,
      success,
      errorMessage = null,
      rollbackSql = null
    } = migrationData;

    await this.executeSQL(
      `INSERT INTO ${this.migrationsTable}
       (version, name, execution_time, checksum, success, error_message, rollback_sql)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        version,
        name,
        executionTime,
        checksum,
        success,
        errorMessage,
        rollbackSql
      ]
    );
  }

  // Calculate SQL checksum
  calculateChecksum(sql) {
    // Simple checksum calculation (in production, use crypto.createHash)
    return (
      sql.length.toString(16).padStart(8, '0') +
      sql
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0)
        .toString(16)
    );
  }

  // Acquire migration lock
  async acquireMigrationLock(version) {
    // In production, implement proper database locking
    console.log(`Acquired migration lock for ${version}`);
  }

  // Release migration lock
  async releaseMigrationLock(version) {
    console.log(`Released migration lock for ${version}`);
  }

  // Get migration status
  getStatus() {
    const applied = Array.from(this.migrationHistory.entries()).map(
      ([version, data]) => ({
        version,
        ...data
      })
    );

    return {
      totalApplied: applied.length,
      lastMigration: applied.length > 0 ? applied[applied.length - 1] : null,
      runningMigrations: Array.from(this.runningMigrations),
      migrations: applied
    };
  }

  // Validate migration integrity
  async validateIntegrity() {
    const issues = [];

    for (const [version, migration] of this.migrationHistory) {
      // In production, would re-read migration file and verify checksum
      if (!migration.success) {
        issues.push({
          type: 'failed_migration',
          version,
          message: migration.errorMessage || 'Migration failed'
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  // Reset migration system (for testing)
  async reset() {
    try {
      await this.executeSQL(
        `DROP TABLE IF EXISTS ${this.migrationsTable} CASCADE`
      );
      this.migrationHistory.clear();
      this.runningMigrations.clear();
      console.log('Migration system reset');
    } catch (error) {
      console.error('Migration reset failed:', error);
      throw error;
    }
  }

  // Execute SQL with error handling
  async executeSQL(sql, params = []) {
    // Mock implementation - in production would use actual database connection
    console.log(
      'Executing SQL:',
      sql.substring(0, 100) + (sql.length > 100 ? '...' : '')
    );

    if (params.length > 0) {
      console.log('Parameters:', params);
    }

    // Simulate database response
    return {
      rows: [],
      rowCount: 0
    };
  }

  // Database backup before major migrations
  async createBackup(name) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.]/g, '')
      .slice(0, 14);
    const backupName = `${name}_${timestamp}`;

    console.log(`Creating database backup: ${backupName}`);

    // In production, would create actual database backup
    return {
      name: backupName,
      timestamp: new Date(),
      size: '0MB' // Mock size
    };
  }

  // Generate migration report
  generateReport() {
    const applied = Array.from(this.migrationHistory.values());
    const totalTime = applied.reduce((sum, m) => sum + m.executionTime, 0);
    const failed = applied.filter(m => !m.success);

    return {
      summary: {
        totalMigrations: applied.length,
        successful: applied.length - failed.length,
        failed: failed.length,
        totalExecutionTime: totalTime,
        averageExecutionTime:
          applied.length > 0 ? Math.round(totalTime / applied.length) : 0
      },
      migrations: applied.map(m => ({
        version: m.version || 'unknown',
        name: m.name,
        appliedAt: m.appliedAt,
        executionTime: m.executionTime,
        success: m.success
      })),
      failedMigrations: failed.map(m => ({
        version: m.version || 'unknown',
        name: m.name,
        error: m.errorMessage
      }))
    };
  }
}

// Create singleton instance
const databaseMigrations = new DatabaseMigrations();

module.exports = databaseMigrations;
