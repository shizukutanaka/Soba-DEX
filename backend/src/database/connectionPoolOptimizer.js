const { logger } = require('../utils/productionLogger');

/**
 * Database Connection Pool Optimizer
 * National-grade connection management with automatic tuning
 */

class ConnectionPoolOptimizer {
  constructor(poolInstance) {
    this.pool = poolInstance;
    this.metrics = {
      totalQueries: 0,
      slowQueries: 0,
      failedQueries: 0,
      connectionResets: 0,
      poolExhausted: 0,
      avgResponseTime: 0,
      peakConnections: 0,
      idleTimeout: 0
    };

    this.config = {
      slowQueryThreshold: 1000, // ms
      maxPoolSize: 20,
      minPoolSize: 2,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 5000,
      queryTimeoutMs: 30000,
      enableAutoTuning: true,
      tuningInterval: 60000, // 1 minute
      healthCheckInterval: 30000 // 30 seconds
    };

    this.responseTimes = [];
    this.maxResponseTimesSamples = 1000;

    this.connectionPool = new Map();
    this.queryQueue = [];
    this.isOptimizing = false;

    if (this.config.enableAutoTuning) {
      this.startAutoTuning();
    }

    this.startHealthCheck();
  }

  /**
   * Execute optimized query with connection pooling
   */
  async executeQuery(query, params = [], options = {}) {
    const startTime = Date.now();
    const queryId = this.generateQueryId();

    try {
      // Check pool health
      if (!await this.checkPoolHealth()) {
        logger.warn('[ConnectionPool] Pool health check failed, attempting recovery');
        await this.recoverPool();
      }

      // Get connection from pool
      const connection = await this.getConnection(options.priority || 'normal');

      // Set query timeout
      const timeoutMs = options.timeout || this.config.queryTimeoutMs;
      const result = await this.executeWithTimeout(
        connection,
        query,
        params,
        timeoutMs
      );

      // Record metrics
      const responseTime = Date.now() - startTime;
      this.recordMetrics(responseTime, true);

      // Log slow queries
      if (responseTime > this.config.slowQueryThreshold) {
        logger.warn('[ConnectionPool] Slow query detected', {
          queryId,
          responseTime,
          query: query.substring(0, 100)
        });
        this.metrics.slowQueries++;
      }

      // Release connection back to pool
      this.releaseConnection(connection);

      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordMetrics(responseTime, false);
      this.metrics.failedQueries++;

      logger.error('[ConnectionPool] Query failed', {
        queryId,
        error: error.message,
        responseTime,
        query: query.substring(0, 100)
      });

      throw error;
    }
  }

  /**
   * Get connection with priority queue
   */
  async getConnection(priority = 'normal') {
    // If pool has available connections, return immediately
    const availableConnection = await this.findAvailableConnection();
    if (availableConnection) {
      return availableConnection;
    }

    // If pool is exhausted, add to queue
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout: No available connections'));
        this.metrics.poolExhausted++;
      }, this.config.connectionTimeoutMs);

      this.queryQueue.push({
        priority,
        resolve: (conn) => {
          clearTimeout(timeout);
          resolve(conn);
        },
        reject,
        timestamp: Date.now()
      });

      // Sort queue by priority
      this.queryQueue.sort((a, b) => {
        const priorityMap = { high: 3, normal: 2, low: 1 };
        return priorityMap[b.priority] - priorityMap[a.priority];
      });
    });
  }

  /**
   * Find available connection in pool
   */
  async findAvailableConnection() {
    const client = await this.pool.connect();

    // Track connection usage
    const connId = this.generateConnId();
    this.connectionPool.set(connId, {
      client,
      inUse: true,
      acquiredAt: Date.now(),
      queryCount: 0
    });

    // Update peak connections metric
    if (this.connectionPool.size > this.metrics.peakConnections) {
      this.metrics.peakConnections = this.connectionPool.size;
    }

    return { id: connId, client };
  }

  /**
   * Release connection back to pool
   */
  releaseConnection(connection) {
    const conn = this.connectionPool.get(connection.id);
    if (conn) {
      conn.inUse = false;
      conn.releasedAt = Date.now();

      // Actually release to pg pool
      connection.client.release();

      // Process queue if there are waiting requests
      if (this.queryQueue.length > 0) {
        const next = this.queryQueue.shift();
        this.findAvailableConnection().then(next.resolve).catch(next.reject);
      }

      // Clean up from tracking
      this.connectionPool.delete(connection.id);
    }
  }

  /**
   * Execute query with timeout
   */
  async executeWithTimeout(connection, query, params, timeoutMs) {
    return Promise.race([
      connection.client.query(query, params),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Record query metrics
   */
  recordMetrics(responseTime, _success) {
    this.metrics.totalQueries++;

    // Track response times
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > this.maxResponseTimesSamples) {
      this.responseTimes.shift();
    }

    // Calculate average
    this.metrics.avgResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) /
      this.responseTimes.length;
  }

  /**
   * Auto-tune pool size based on metrics
   */
  async autoTunePool() {
    if (this.isOptimizing) {
      return;
    }

    this.isOptimizing = true;

    try {
      const currentSize = this.pool.totalCount;
      const idleCount = this.pool.idleCount;
      const waitingCount = this.pool.waitingCount;

      logger.info('[ConnectionPool] Auto-tuning analysis', {
        currentSize,
        idleCount,
        waitingCount,
        avgResponseTime: this.metrics.avgResponseTime,
        poolExhausted: this.metrics.poolExhausted
      });

      // Increase pool size if frequently exhausted
      if (this.metrics.poolExhausted > 10 && currentSize < this.config.maxPoolSize) {
        const newSize = Math.min(currentSize + 2, this.config.maxPoolSize);
        logger.info('[ConnectionPool] Increasing pool size', {
          from: currentSize,
          to: newSize
        });
        await this.resizePool(newSize);
      }

      // Decrease pool size if too many idle connections
      if (idleCount > currentSize * 0.7 && currentSize > this.config.minPoolSize) {
        const newSize = Math.max(currentSize - 1, this.config.minPoolSize);
        logger.info('[ConnectionPool] Decreasing pool size', {
          from: currentSize,
          to: newSize
        });
        await this.resizePool(newSize);
      }

      // Reset exhausted counter
      this.metrics.poolExhausted = 0;

    } catch (error) {
      logger.error('[ConnectionPool] Auto-tuning failed', { error: error.message });
    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * Resize pool
   */
  async resizePool(newSize) {
    // Note: pg Pool doesn't support dynamic resizing
    // This is a placeholder for future implementation with dynamic pool
    logger.info('[ConnectionPool] Pool resize requested', {
      newSize,
      note: 'Dynamic resizing requires pool restart in pg'
    });
  }

  /**
   * Check pool health
   */
  async checkPoolHealth() {
    try {
      // Simple health check query
      const result = await this.pool.query('SELECT 1 as health');
      return result.rows[0].health === 1;
    } catch (error) {
      logger.error('[ConnectionPool] Health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Recover pool from error state
   */
  async recoverPool() {
    logger.info('[ConnectionPool] Attempting pool recovery');
    this.metrics.connectionResets++;

    try {
      // Clear waiting queue
      this.queryQueue.forEach(item => {
        item.reject(new Error('Pool recovery in progress'));
      });
      this.queryQueue = [];

      // Wait a bit before recovery
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify pool is healthy
      const isHealthy = await this.checkPoolHealth();
      if (isHealthy) {
        logger.info('[ConnectionPool] Pool recovery successful');
      } else {
        logger.error('[ConnectionPool] Pool recovery failed');
      }

      return isHealthy;

    } catch (error) {
      logger.error('[ConnectionPool] Pool recovery error', { error: error.message });
      return false;
    }
  }

  /**
   * Start auto-tuning interval
   */
  startAutoTuning() {
    setInterval(() => {
      this.autoTunePool().catch(error => {
        logger.error('[ConnectionPool] Auto-tuning error', { error: error.message });
      });
    }, this.config.tuningInterval);

    logger.info('[ConnectionPool] Auto-tuning enabled');
  }

  /**
   * Start health check interval
   */
  startHealthCheck() {
    setInterval(() => {
      this.checkPoolHealth().then(isHealthy => {
        if (!isHealthy) {
          logger.warn('[ConnectionPool] Health check failed, triggering recovery');
          this.recoverPool();
        }
      });
    }, this.config.healthCheckInterval);

    logger.info('[ConnectionPool] Health check enabled');
  }

  /**
   * Get connection pool statistics
   */
  getStatistics() {
    return {
      metrics: this.metrics,
      pool: {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount
      },
      queue: {
        length: this.queryQueue.length,
        oldest: this.queryQueue.length > 0 ?
          Date.now() - this.queryQueue[0].timestamp : 0
      },
      performance: {
        avgResponseTime: Math.round(this.metrics.avgResponseTime),
        p95ResponseTime: this.calculatePercentile(0.95),
        p99ResponseTime: this.calculatePercentile(0.99),
        slowQueryRate: (this.metrics.slowQueries / this.metrics.totalQueries * 100).toFixed(2) + '%',
        errorRate: (this.metrics.failedQueries / this.metrics.totalQueries * 100).toFixed(2) + '%'
      },
      health: {
        isOptimizing: this.isOptimizing,
        lastAutoTune: this.lastAutoTuneTime,
        poolExhaustionCount: this.metrics.poolExhausted,
        connectionResets: this.metrics.connectionResets
      }
    };
  }

  /**
   * Calculate response time percentile
   */
  calculatePercentile(percentile) {
    if (this.responseTimes.length === 0) {
      return 0;
    }

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return Math.round(sorted[index]);
  }

  /**
   * Generate unique query ID
   */
  generateQueryId() {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique connection ID
   */
  generateConnId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close all connections and cleanup
   */
  async close() {
    logger.info('[ConnectionPool] Closing connection pool');

    // Reject all waiting queries
    this.queryQueue.forEach(item => {
      item.reject(new Error('Connection pool is closing'));
    });
    this.queryQueue = [];

    // Clear connection tracking
    this.connectionPool.clear();

    await this.pool.end();
    logger.info('[ConnectionPool] Connection pool closed');
  }
}

module.exports = ConnectionPoolOptimizer;
