/**
 * Optimized Database Configuration
 * Performance-tuned database setup with connection pooling, indexing, and query optimization
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/productionLogger');
const Redis = require('ioredis');
const { performance } = require('perf_hooks');

/**
 * Enhanced Prisma Client with performance monitoring
 */
class OptimizedDatabaseClient {
  constructor() {
    this.prisma = null;
    this.redis = null;
    this.queryCache = new Map();
    this.connectionPool = null;
    this.metrics = {
      queries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgQueryTime: 0,
      slowQueries: []
    };
  }

  /**
   * Initialize database with optimizations
   */
  async initialize() {
    try {
      logger.info('[OptimizedDB] Initializing database connections');

      // Initialize Prisma with connection pooling
      this.prisma = new PrismaClient({
        log: [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' }
        ],
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        },
        // Connection pool configuration
        connectionLimit: parseInt(process.env.DB_POOL_SIZE || '20'),
        pool: {
          min: parseInt(process.env.DB_POOL_MIN || '5'),
          max: parseInt(process.env.DB_POOL_MAX || '20'),
          acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT || '30000'),
          createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT || '30000'),
          destroyTimeoutMillis: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT || '5000'),
          idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
          reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL || '1000'),
          createRetryIntervalMillis: parseInt(process.env.DB_POOL_RETRY_INTERVAL || '200')
        }
      });

      // Set up query event listeners
      this.setupQueryMonitoring();

      // Initialize Redis for query caching
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3
      });

      // Create optimized indexes
      await this.createOptimizedIndexes();

      // Warm up connection pool
      await this.warmUpConnectionPool();

      // Start metrics collection
      this.startMetricsCollection();

      logger.info('[OptimizedDB] Database initialized successfully');
    } catch (error) {
      logger.error('[OptimizedDB] Initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create optimized indexes for common queries
   */
  async createOptimizedIndexes() {
    const indexes = [
      // User table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_email ON "User"(email) WHERE deleted_at IS NULL',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_wallet ON "User"(wallet_address) WHERE deleted_at IS NULL',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_created ON "User"(created_at DESC)',

      // Transaction table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_user ON "Transaction"(user_id, created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_status ON "Transaction"(status) WHERE status != \'completed\'',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_hash ON "Transaction"(transaction_hash)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_pair ON "Transaction"(token_from, token_to, created_at DESC)',

      // Order table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_user_status ON "Order"(user_id, status, created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_pair ON "Order"(token_a, token_b, order_type)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_price ON "Order"(price) WHERE status = \'open\'',

      // Portfolio table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_user_token ON "Portfolio"(user_id, token_address)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_balance ON "Portfolio"(balance) WHERE balance > 0',

      // Analytics table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_timestamp ON "Analytics"(timestamp DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_metric ON "Analytics"(metric_name, timestamp DESC)',

      // Session table indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_user ON "Session"(user_id, expires_at)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_token ON "Session"(session_token) WHERE expires_at > NOW()',

      // Audit log indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_user ON "AuditLog"(user_id, timestamp DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_action ON "AuditLog"(action, timestamp DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_resource ON "AuditLog"(resource, timestamp DESC)',

      // Composite indexes for complex queries
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_composite ON "Transaction"(user_id, status, created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_composite ON "Order"(user_id, token_a, token_b, status)',

      // Partial indexes for specific conditions
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_transactions ON "Transaction"(created_at) WHERE status = \'pending\'',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_orders ON "Order"(created_at) WHERE status IN (\'open\', \'partially_filled\')',

      // Full-text search indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_search ON "User" USING GIN(to_tsvector(\'english\', username || \' \' || email))',

      // BRIN indexes for time-series data
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_time_brin ON "Analytics" USING BRIN(timestamp) WITH (pages_per_range = 128)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_time_brin ON "Transaction" USING BRIN(created_at) WITH (pages_per_range = 128)'
    ];

    logger.info('[OptimizedDB] Creating optimized indexes');

    for (const index of indexes) {
      try {
        await this.prisma.$executeRawUnsafe(index);
      } catch (error) {
        // Index might already exist
        if (!error.message.includes('already exists')) {
          logger.warn('[OptimizedDB] Failed to create index', {
            index: index.substring(0, 50),
            error: error.message
          });
        }
      }
    }

    // Analyze tables for query planner
    await this.analyzeTable();

    logger.info('[OptimizedDB] Indexes created successfully');
  }

  /**
   * Analyze tables for query optimization
   */
  async analyzeTable() {
    const tables = [
      'User', 'Transaction', 'Order', 'Portfolio',
      'Analytics', 'Session', 'AuditLog'
    ];

    for (const table of tables) {
      try {
        await this.prisma.$executeRawUnsafe(`ANALYZE "${table}"`);
      } catch (error) {
        logger.warn('[OptimizedDB] Failed to analyze table', {
          table,
          error: error.message
        });
      }
    }
  }

  /**
   * Setup query monitoring
   */
  setupQueryMonitoring() {
    // Monitor query performance
    this.prisma.$on('query', async (e) => {
      this.metrics.queries++;

      const duration = e.duration;
      this.metrics.avgQueryTime =
        (this.metrics.avgQueryTime * (this.metrics.queries - 1) + duration) / this.metrics.queries;

      // Track slow queries
      if (duration > 1000) { // Over 1 second
        this.metrics.slowQueries.push({
          query: e.query,
          duration,
          timestamp: new Date()
        });

        logger.warn('[OptimizedDB] Slow query detected', {
          duration,
          query: e.query.substring(0, 100)
        });

        // Keep only last 100 slow queries
        if (this.metrics.slowQueries.length > 100) {
          this.metrics.slowQueries.shift();
        }
      }
    });

    // Monitor errors
    this.prisma.$on('error', async (e) => {
      logger.error('[OptimizedDB] Database error', {
        error: e.message
      });
    });
  }

  /**
   * Execute query with caching
   */
  async cachedQuery(key, queryFn, ttl = 300) {
    try {
      // Check Redis cache first
      const cached = await this.redis.get(key);
      if (cached) {
        this.metrics.cacheHits++;
        return JSON.parse(cached);
      }

      this.metrics.cacheMisses++;

      // Execute query
      const startTime = performance.now();
      const result = await queryFn();
      const duration = performance.now() - startTime;

      // Cache result
      if (result) {
        await this.redis.set(key, JSON.stringify(result), 'EX', ttl);
      }

      // Log slow queries
      if (duration > 500) {
        logger.warn('[OptimizedDB] Slow cached query', {
          key,
          duration
        });
      }

      return result;
    } catch (error) {
      logger.error('[OptimizedDB] Cached query failed', {
        key,
        error: error.message
      });

      // Fallback to direct query on cache error
      return await queryFn();
    }
  }

  /**
   * Batch operations for better performance
   */
  async batchOperation(operations) {
    return await this.prisma.$transaction(operations, {
      maxWait: 5000,
      timeout: 10000,
      isolationLevel: 'Serializable'
    });
  }

  /**
   * Optimized findMany with cursor pagination
   */
  async findManyOptimized(model, options = {}) {
    const {
      where = {},
      orderBy = { id: 'desc' },
      take = 20,
      cursor = null,
      include = {}
    } = options;

    const query = {
      where,
      orderBy,
      take: take + 1, // Fetch one extra to check for more
      include
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    const items = await this.prisma[model].findMany(query);
    const hasMore = items.length > take;
    const edges = hasMore ? items.slice(0, -1) : items;

    return {
      edges,
      pageInfo: {
        hasNextPage: hasMore,
        endCursor: edges.length > 0 ? edges[edges.length - 1].id : null
      }
    };
  }

  /**
   * Connection pool management
   */
  async warmUpConnectionPool() {
    logger.info('[OptimizedDB] Warming up connection pool');

    // Execute simple queries to establish connections
    const warmUpQueries = Array(5).fill(null).map(() =>
      this.prisma.$queryRaw`SELECT 1`
    );

    await Promise.all(warmUpQueries);

    logger.info('[OptimizedDB] Connection pool warmed up');
  }

  /**
   * Query optimization helpers
   */
  async explainQuery(query) {
    try {
      const explanation = await this.prisma.$queryRaw`EXPLAIN ANALYZE ${query}`;
      return explanation;
    } catch (error) {
      logger.error('[OptimizedDB] Failed to explain query', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Bulk insert with optimization
   */
  async bulkInsert(model, data, chunkSize = 1000) {
    const chunks = [];

    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }

    const results = [];

    for (const chunk of chunks) {
      const result = await this.prisma[model].createMany({
        data: chunk,
        skipDuplicates: true
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Vacuum and maintenance operations
   */
  async performMaintenance() {
    logger.info('[OptimizedDB] Starting maintenance operations');

    try {
      // Vacuum analyze
      await this.prisma.$executeRawUnsafe('VACUUM ANALYZE');

      // Reindex
      await this.prisma.$executeRawUnsafe('REINDEX DATABASE CONCURRENTLY');

      // Update statistics
      await this.analyzeTable();

      logger.info('[OptimizedDB] Maintenance completed successfully');
    } catch (error) {
      logger.error('[OptimizedDB] Maintenance failed', {
        error: error.message
      });
    }
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      const cacheHitRate = this.metrics.cacheHits /
        (this.metrics.cacheHits + this.metrics.cacheMisses) || 0;

      logger.info('[OptimizedDB] Database metrics', {
        queries: this.metrics.queries,
        avgQueryTime: this.metrics.avgQueryTime,
        cacheHitRate: (cacheHitRate * 100).toFixed(2) + '%',
        slowQueries: this.metrics.slowQueries.length
      });

      // Reset counters
      this.metrics.queries = 0;
      this.metrics.cacheHits = 0;
      this.metrics.cacheMisses = 0;
      this.metrics.avgQueryTime = 0;
    }, 60000); // Every minute
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('[OptimizedDB] Shutting down database connections');

    try {
      await this.prisma.$disconnect();
      this.redis.disconnect();

      logger.info('[OptimizedDB] Database connections closed');
    } catch (error) {
      logger.error('[OptimizedDB] Error during shutdown', {
        error: error.message
      });
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Check Prisma connection
      await this.prisma.$queryRaw`SELECT 1`;

      // Check Redis connection
      await this.redis.ping();

      return {
        status: 'healthy',
        database: 'connected',
        cache: 'connected',
        metrics: this.metrics
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

// Create singleton instance
const optimizedDB = new OptimizedDatabaseClient();

// Initialize on module load
(async () => {
  try {
    await optimizedDB.initialize();
  } catch (error) {
    logger.error('[OptimizedDB] Failed to initialize on module load', {
      error: error.message
    });
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  await optimizedDB.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await optimizedDB.shutdown();
  process.exit(0);
});

module.exports = {
  optimizedDB,
  prisma: optimizedDB.prisma,
  redis: optimizedDB.redis,
  cachedQuery: (key, fn, ttl) => optimizedDB.cachedQuery(key, fn, ttl),
  batchOperation: (ops) => optimizedDB.batchOperation(ops),
  findManyOptimized: (model, options) => optimizedDB.findManyOptimized(model, options),
  bulkInsert: (model, data, chunkSize) => optimizedDB.bulkInsert(model, data, chunkSize),
  healthCheck: () => optimizedDB.healthCheck()
};