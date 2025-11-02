/**
 * Advanced Database Connection Pool - PostgreSQL
 * Enterprise-grade connection management with intelligent optimization
 */

const { Pool } = require('pg');
const { logger } = require('../utils/productionLogger');

class AdvancedDatabasePool {
  constructor() {
    this.pool = null;
    this.queryCache = new Map();
    this.maxCacheSize = 1000;
    this.stats = {
      queries: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      slowQueries: 0,
      connectionResets: 0,
      poolExhausted: 0,
      avgResponseTime: 0,
      peakConnections: 0
    };

    // Advanced configuration
    this.config = {
      max: this.getOptimalPoolSize(),
      min: Math.max(2, Math.floor(this.getOptimalPoolSize() / 4)),
      idleTimeoutMillis: 60000, // 1 minute
      connectionTimeoutMillis: 10000, // 10 seconds
      acquireTimeoutMillis: 30000, // 30 seconds
      maxUses: 1000, // Connection reuse limit
      maxLifetime: 3600000, // 1 hour max lifetime
      allowExitOnIdle: false,
      keepAlive: true,
      keepAliveInitialDelayMillis: 0
    };

    this.responseTimes = [];
    this.maxResponseTimesSamples = 1000;
    this.autoTuningInterval = null;
    this.healthCheckInterval = null;
  }

  getOptimalPoolSize() {
    const cpuCount = require('os').cpus().length;
    const memoryMB = Math.floor(require('os').totalmem() / (1024 * 1024));

    // Base calculation on CPU cores and memory
    const baseSize = Math.min(cpuCount * 2, Math.floor(memoryMB / 128));

    // Environment-based scaling
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      return Math.max(5, Math.min(baseSize, 50)); // Max 50 for production
    } else {
      return Math.max(2, Math.min(baseSize, 10)); // Max 10 for development
    }
  }

  initialize(config = {}) {
    if (this.pool) {
      return this.pool;
    }

    const poolConfig = {
      ...this.config,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'dex',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
      ...config
    };

    this.pool = new Pool(poolConfig);

    // Enhanced error handling
    this.pool.on('error', (err, client) => {
      logger.error('Database pool error', {
        error: err.message,
        code: err.code,
        client: client ? 'connected' : 'disconnected'
      });
      this.stats.errors++;
      this.stats.connectionResets++;
    });

    this.pool.on('connect', (client) => {
      logger.debug('Database client connected', {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount
      });
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Client acquired from pool', {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        waitingClients: this.pool.waitingCount
      });
    });

    this.pool.on('remove', (client) => {
      logger.debug('Client removed from pool', {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount
      });
    });

    // Start monitoring
    this.startAutoTuning();
    this.startHealthCheck();

    logger.info('Advanced database pool initialized', {
      host: poolConfig.host,
      database: poolConfig.database,
      maxConnections: poolConfig.max,
      minConnections: poolConfig.min,
      ssl: poolConfig.ssl ? 'enabled' : 'disabled'
    });

    return this.pool;
  }

  getPool() {
    if (!this.pool) {
      this.initialize();
    }
    return this.pool;
  }

  async query(text, params = [], options = {}) {
    const {
      cache = false,
      cacheTtl = 300000,
      maxRetries = 3,
      retryDelay = 1000,
      priority = 'normal',
      timeout = 30000
    } = options;

    const pool = this.getPool();
    const start = Date.now();
    const queryId = this.generateQueryId();

    // Check cache for SELECT queries
    if (cache && text.trim().toUpperCase().startsWith('SELECT')) {
      const cacheKey = this.generateCacheKey(text, params);
      const cached = this.queryCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < cacheTtl) {
        this.stats.cacheHits++;
        this.recordResponseTime(Date.now() - start);
        return cached.result;
      }
      this.stats.cacheMisses++;
    }

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = await this.acquireConnection(priority);
        const result = await this.executeWithTimeout(client, text, params, timeout);
        client.release();

        const duration = Date.now() - start;
        this.recordResponseTime(duration);
        this.stats.queries++;

        // Cache result if enabled
        if (cache && text.trim().toUpperCase().startsWith('SELECT')) {
          const cacheKey = this.generateCacheKey(text, params);
          this.queryCache.set(cacheKey, {
            result,
            timestamp: Date.now()
          });

          // Intelligent cache size management
          if (this.queryCache.size > this.maxCacheSize) {
            this.evictOldCacheEntries();
          }
        }

        // Log slow queries
        if (duration > 1000) {
          logger.warn('Slow query detected', {
            queryId,
            duration,
            query: text.substring(0, 100),
            priority,
            attempt
          });
          this.stats.slowQueries++;
        }

        return result;
      } catch (error) {
        const isRetryable = this.isRetryableError(error);

        if (attempt < maxRetries && isRetryable) {
          const delay = retryDelay * Math.pow(2, attempt - 1);
          logger.warn(`Query failed, retrying (${attempt}/${maxRetries})`, {
            queryId,
            error: error.message,
            code: error.code,
            delay,
            priority
          });
          await this.sleep(delay);
        } else {
          this.stats.errors++;
          logger.error('Query error after all retries', {
            queryId,
            error: error.message,
            code: error.code,
            query: text.substring(0, 100),
            attempts: attempt,
            priority
          });
          throw error;
        }
      }
    }
  }

  async acquireConnection(priority = 'normal') {
    const pool = this.getPool();

    // Check if pool is exhausted
    if (pool.totalCount >= pool.options.max && pool.waitingCount > 0) {
      this.stats.poolExhausted++;
      logger.warn('Connection pool exhausted', {
        totalConnections: pool.totalCount,
        waitingClients: pool.waitingCount,
        maxConnections: pool.options.max
      });
    }

    return await pool.connect();
  }

  async executeWithTimeout(client, query, params, timeoutMs) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        client.release();
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await client.query(query, params);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async transaction(callback) {
    const client = await this.getPool().connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction error', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  recordResponseTime(duration) {
    this.responseTimes.push(duration);

    // Keep only recent samples
    if (this.responseTimes.length > this.maxResponseTimesSamples) {
      this.responseTimes.shift();
    }

    // Update average
    this.stats.avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;

    // Update peak connections if needed
    if (this.pool && this.pool.totalCount > this.stats.peakConnections) {
      this.stats.peakConnections = this.pool.totalCount;
    }
  }

  generateQueryId() {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCacheKey(query, params) {
    return `${query}:${JSON.stringify(params)}`;
  }

  evictOldCacheEntries() {
    const entries = Array.from(this.queryCache.entries());
    const now = Date.now();

    // Remove expired entries first
    for (const [key, value] of entries) {
      if (now - value.timestamp > 300000) { // 5 minutes
        this.queryCache.delete(key);
      }
    }

    // If still over limit, remove oldest entries
    if (this.queryCache.size > this.maxCacheSize) {
      const sortedEntries = entries
        .filter(([key, value]) => now - value.timestamp <= 300000)
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = sortedEntries.slice(0, this.queryCache.size - this.maxCacheSize);
      for (const [key] of toRemove) {
        this.queryCache.delete(key);
      }
    }
  }

  isRetryableError(error) {
    const retryableCodes = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      '57P03', // Admin shutdown
      '53300', // Too many connections
      '57P01'  // Admin shutdown
    ];

    return retryableCodes.includes(error.code) ||
           error.message.includes('connection') ||
           error.message.includes('timeout');
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  startAutoTuning() {
    this.autoTuningInterval = setInterval(() => {
      this.performAutoTuning();
    }, 60000); // Every minute
  }

  startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Every 30 seconds
  }

  async performAutoTuning() {
    if (!this.pool) return;

    const avgResponseTime = this.stats.avgResponseTime;
    const poolUsage = this.pool.totalCount / this.pool.options.max;
    const errorRate = this.stats.errors / Math.max(this.stats.queries, 1);

    // Dynamic pool sizing based on metrics
    if (avgResponseTime > 1000 && poolUsage > 0.8 && errorRate < 0.1) {
      // Increase pool size if slow and high usage but low error rate
      const newMax = Math.min(this.pool.options.max + 2, 100);
      if (newMax !== this.pool.options.max) {
        logger.info('Auto-tuning: Increasing pool size', {
          oldMax: this.pool.options.max,
          newMax,
          avgResponseTime,
          poolUsage: `${Math.round(poolUsage * 100)}%`
        });
        this.pool.options.max = newMax;
      }
    } else if (poolUsage < 0.3 && avgResponseTime < 100 && this.pool.options.max > 5) {
      // Decrease pool size if low usage and fast responses
      const newMax = Math.max(this.pool.options.max - 1, 5);
      if (newMax !== this.pool.options.max) {
        logger.info('Auto-tuning: Decreasing pool size', {
          oldMax: this.pool.options.max,
          newMax,
          avgResponseTime,
          poolUsage: `${Math.round(poolUsage * 100)}%`
        });
        this.pool.options.max = newMax;
      }
    }
  }

  async performHealthCheck() {
    try {
      await this.query('SELECT 1 as health');
      logger.debug('Database health check passed');
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      await this.attemptPoolRecovery();
    }
  }

  async attemptPoolRecovery() {
    if (!this.pool) return;

    try {
      // Close existing pool
      await this.pool.end();
      this.pool = null;

      // Wait a bit before reinitializing
      await this.sleep(5000);

      // Reinitialize
      this.initialize();
      logger.info('Database pool recovered successfully');
    } catch (error) {
      logger.error('Database pool recovery failed', { error: error.message });
    }
  }

  async healthCheck() {
    try {
      const start = Date.now();
      const result = await this.query('SELECT 1 as health');
      const duration = Date.now() - start;

      return {
        healthy: true,
        timestamp: Date.now(),
        responseTime: duration,
        connections: {
          total: this.pool?.totalCount || 0,
          idle: this.pool?.idleCount || 0,
          waiting: this.pool?.waitingCount || 0
        }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now(),
        connections: {
          total: this.pool?.totalCount || 0,
          idle: this.pool?.idleCount || 0,
          waiting: this.pool?.waitingCount || 0
        }
      };
    }
  }

  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool?.totalCount || 0,
      idleConnections: this.pool?.idleCount || 0,
      waitingClients: this.pool?.waitingCount || 0,
      cacheSize: this.queryCache.size,
      responseTimeP95: this.getPercentile(95),
      responseTimeP99: this.getPercentile(99),
      config: this.config
    };
  }

  getPercentile(percentile) {
    if (this.responseTimes.length === 0) return 0;

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  clearCache() {
    this.queryCache.clear();
    logger.info('Database query cache cleared');
  }

  async close() {
    if (this.autoTuningInterval) {
      clearInterval(this.autoTuningInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.pool) {
      await this.pool.end();
      logger.info('Advanced database pool closed');
      this.pool = null;
    }
  }
}

// Singleton instance
const dbPool = new AdvancedDatabasePool();

module.exports = {
  AdvancedDatabasePool,
  dbPool
};
