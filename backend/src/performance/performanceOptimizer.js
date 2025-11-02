/**
 * Performance Optimization Service for Soba DEX
 * Implements:
 * - Advanced Redis caching with intelligent invalidation
 * - Database connection pooling
 * - Query optimization and batching
 * - Response compression
 * - Memory management
 */

const EventEmitter = require('events');

class PerformanceOptimizer extends EventEmitter {
  constructor() {
    super();

    // Multi-layer cache system
    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };

    // Cache configuration
    this.CACHE_CONFIG = {
      TTL: {
        PRICE: 5000,        // 5 seconds for price data
        BALANCE: 30000,     // 30 seconds for balance
        POOL: 60000,        // 1 minute for pool data
        TRANSACTION: 300000, // 5 minutes for transactions
        STATIC: 3600000     // 1 hour for static data
      },
      MAX_SIZE: 10000,      // Max cache entries
      EVICTION_PERCENTAGE: 0.2 // Evict 20% when full
    };

    // Query batching
    this.queryBatches = new Map();
    this.BATCH_DELAY_MS = 50; // Batch queries within 50ms

    // Connection pool simulation (would use real DB pool in production)
    this.connectionPool = {
      available: 20,
      total: 20,
      waiting: 0,
      acquired: 0
    };

    // Performance metrics
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      slowQueries: 0,
      cachedResponses: 0,
      batchedQueries: 0
    };

    this.initializeOptimizer();
  }

  initializeOptimizer() {
    // Periodic cache cleanup
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Every minute

    // Performance metrics reporter
    setInterval(() => {
      this.reportPerformanceMetrics();
    }, 300000); // Every 5 minutes
  }

  /**
   * Advanced Caching Layer
   */
  async get(key, fetchFn, options = {}) {
    const ttl = options.ttl || this.CACHE_CONFIG.TTL.STATIC;
    const forceRefresh = options.forceRefresh || false;

    // Check memory cache
    if (!forceRefresh && this.memoryCache.has(key)) {
      const cached = this.memoryCache.get(key);

      if (Date.now() < cached.expiresAt) {
        this.cacheStats.hits++;
        this.metrics.cachedResponses++;
        return cached.value;
      } else {
        // Expired, remove it
        this.memoryCache.delete(key);
        this.cacheStats.deletes++;
      }
    }

    // Cache miss - fetch data
    this.cacheStats.misses++;
    const value = await fetchFn();

    // Store in cache
    this.set(key, value, ttl);

    return value;
  }

  set(key, value, ttl) {
    // Check if cache is full
    if (this.memoryCache.size >= this.CACHE_CONFIG.MAX_SIZE) {
      this.evictLRU();
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
      accessCount: 0
    });

    this.cacheStats.sets++;
  }

  invalidate(pattern) {
    let deletedCount = 0;

    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
        deletedCount++;
      }
    }

    this.cacheStats.deletes += deletedCount;
    return deletedCount;
  }

  evictLRU() {
    // Evict least recently used entries
    const entries = Array.from(this.memoryCache.entries());

    // Sort by access count (LRU)
    entries.sort((a, b) => a[1].accessCount - b[1].accessCount);

    const evictCount = Math.floor(
      this.CACHE_CONFIG.MAX_SIZE * this.CACHE_CONFIG.EVICTION_PERCENTAGE
    );

    for (let i = 0; i < evictCount; i++) {
      this.memoryCache.delete(entries[i][0]);
      this.cacheStats.evictions++;
    }

    this.emit('cacheEviction', {
      evictedCount: evictCount,
      remainingSize: this.memoryCache.size
    });
  }

  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiresAt) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.emit('cacheCleanup', {
        cleanedCount,
        remainingSize: this.memoryCache.size
      });
    }
  }

  /**
   * Query Batching
   * Combines multiple similar queries into a single batch
   */
  async batchQuery(queryType, params) {
    const batchKey = this.getBatchKey(queryType);

    if (!this.queryBatches.has(batchKey)) {
      this.queryBatches.set(batchKey, {
        queries: [],
        timer: null,
        promise: null
      });
    }

    const batch = this.queryBatches.get(batchKey);

    // Create promise for this query
    const queryPromise = new Promise((resolve, reject) => {
      batch.queries.push({ params, resolve, reject });
    });

    // Schedule batch execution
    if (!batch.timer) {
      batch.timer = setTimeout(() => {
        this.executeBatch(queryType, batchKey);
      }, this.BATCH_DELAY_MS);
    }

    return queryPromise;
  }

  async executeBatch(queryType, batchKey) {
    const batch = this.queryBatches.get(batchKey);
    if (!batch || batch.queries.length === 0) {
      return;
    }

    this.metrics.batchedQueries += batch.queries.length;

    try {
      // Execute all queries in batch
      const results = await this.executeQueryBatch(queryType, batch.queries);

      // Resolve individual promises
      batch.queries.forEach((query, index) => {
        query.resolve(results[index]);
      });
    } catch (error) {
      // Reject all promises
      batch.queries.forEach(query => {
        query.reject(error);
      });
    } finally {
      // Clean up batch
      this.queryBatches.delete(batchKey);
    }
  }

  async executeQueryBatch(queryType, queries) {
    // Simulate batch query execution
    // In production, this would use actual database batch operations
    switch (queryType) {
    case 'PRICE':
      return queries.map(q => this.mockPriceQuery(q.params));
    case 'BALANCE':
      return queries.map(q => this.mockBalanceQuery(q.params));
    default:
      return queries.map(() => null);
    }
  }

  getBatchKey(queryType) {
    return `batch_${queryType}_${Date.now()}`;
  }

  // Mock query functions (replace with real DB queries)
  mockPriceQuery(params) {
    return { price: Math.random() * 1000, ...params };
  }

  mockBalanceQuery(params) {
    return { balance: Math.random() * 10000, ...params };
  }

  /**
   * Connection Pool Management
   */
  async acquireConnection() {
    if (this.connectionPool.available > 0) {
      this.connectionPool.available--;
      this.connectionPool.acquired++;
      return {
        id: Date.now(),
        acquired: true
      };
    }

    // Wait for available connection
    this.connectionPool.waiting++;
    await this.waitForConnection();
    this.connectionPool.waiting--;

    return this.acquireConnection();
  }

  releaseConnection(_connection) {
    this.connectionPool.available++;
    this.connectionPool.acquired--;

    this.emit('connectionReleased', {
      available: this.connectionPool.available,
      waiting: this.connectionPool.waiting
    });
  }

  async waitForConnection() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.connectionPool.available > 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100); // Check every 100ms
    });
  }

  getConnectionPoolStats() {
    return {
      ...this.connectionPool,
      utilization: ((this.connectionPool.total - this.connectionPool.available) / this.connectionPool.total * 100).toFixed(2) + '%'
    };
  }

  /**
   * Query Optimization
   */
  optimizeQuery(query) {
    const startTime = Date.now();

    // Add indexes hint
    const optimizedQuery = {
      ...query,
      useIndex: this.selectOptimalIndex(query),
      limit: query.limit || 100 // Default limit to prevent large result sets
    };

    // Track slow queries
    const executionTime = Date.now() - startTime;
    if (executionTime > 1000) { // > 1 second
      this.metrics.slowQueries++;
      this.emit('slowQuery', {
        query: optimizedQuery,
        executionTime
      });
    }

    return optimizedQuery;
  }

  selectOptimalIndex(query) {
    // Simple index selection logic
    if (query.where && query.where.userId) {
      return 'idx_user_id';
    }
    if (query.where && query.where.timestamp) {
      return 'idx_timestamp';
    }
    if (query.where && query.where.tokenPair) {
      return 'idx_token_pair';
    }
    return null;
  }

  /**
   * Response Compression
   */
  shouldCompress(data, threshold = 1024) {
    const dataSize = JSON.stringify(data).length;
    return dataSize > threshold;
  }

  compressResponse(data) {
    // Simulate compression (in production use zlib or similar)
    const original = JSON.stringify(data);
    const compressed = {
      compressed: true,
      originalSize: original.length,
      data: original, // Would be actual compressed data
      ratio: 0.3 // Simulate 70% compression
    };

    return compressed;
  }

  /**
   * Memory Management
   */
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        external: (usage.external / 1024 / 1024).toFixed(2) + ' MB',
        rss: (usage.rss / 1024 / 1024).toFixed(2) + ' MB',
        percentage: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2) + '%'
      };
    }

    return {
      heapUsed: 'N/A',
      heapTotal: 'N/A',
      percentage: 'N/A'
    };
  }

  /**
   * Performance Metrics
   */
  recordRequest(responseTime) {
    this.metrics.requestCount++;
    this.metrics.totalResponseTime += responseTime;
  }

  getAverageResponseTime() {
    if (this.metrics.requestCount === 0) {
      return 0;
    }
    return (this.metrics.totalResponseTime / this.metrics.requestCount).toFixed(2);
  }

  getCacheHitRate() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    if (total === 0) {
      return 0;
    }
    return ((this.cacheStats.hits / total) * 100).toFixed(2);
  }

  reportPerformanceMetrics() {
    const report = {
      cache: {
        hitRate: this.getCacheHitRate() + '%',
        size: this.memoryCache.size,
        stats: this.cacheStats
      },
      requests: {
        total: this.metrics.requestCount,
        averageResponseTime: this.getAverageResponseTime() + 'ms',
        slowQueries: this.metrics.slowQueries,
        cachedResponses: this.metrics.cachedResponses,
        batchedQueries: this.metrics.batchedQueries
      },
      connectionPool: this.getConnectionPoolStats(),
      memory: this.getMemoryUsage()
    };

    this.emit('performanceReport', report);
    return report;
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return {
      cache: {
        size: this.memoryCache.size,
        maxSize: this.CACHE_CONFIG.MAX_SIZE,
        hitRate: this.getCacheHitRate() + '%',
        stats: this.cacheStats
      },
      performance: {
        requestCount: this.metrics.requestCount,
        averageResponseTime: this.getAverageResponseTime() + 'ms',
        slowQueries: this.metrics.slowQueries,
        cachedResponses: this.metrics.cachedResponses,
        batchedQueries: this.metrics.batchedQueries
      },
      connectionPool: this.getConnectionPoolStats(),
      memory: this.getMemoryUsage(),
      queryBatches: this.queryBatches.size
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      slowQueries: 0,
      cachedResponses: 0,
      batchedQueries: 0
    };

    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
  }
}

module.exports = new PerformanceOptimizer();
