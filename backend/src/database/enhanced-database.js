const { Pool } = require('pg');
const Redis = require('ioredis');
const { performance } = require('perf_hooks');

class EnhancedDatabase {
  constructor(config) {
    this.config = config;
    this.primaryPool = null;
    this.replicaPools = [];
    this.redisClient = null;
    this.queryCache = new Map();
    this.preparedStatements = new Map();
    this.transactionPool = null;
    this.metrics = {
      queries: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgQueryTime: 0
    };
  }

  async initialize() {
    try {
      // Initialize primary database pool
      await this.setupPrimaryPool();

      // Initialize read replicas
      await this.setupReplicaPools();

      // Initialize Redis cache
      await this.setupRedisCache();

      // Setup connection monitoring
      this.setupMonitoring();

      // Setup automatic cleanup
      this.setupCleanup();

      console.log('Enhanced database system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database system:', error);
      throw error;
    }
  }

  async setupPrimaryPool() {
    const dbConfig = this.config.get('database.primary');

    this.primaryPool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.username,
      password: dbConfig.password,
      ssl: dbConfig.ssl ? { rejectUnauthorized: true } : false,
      max: dbConfig.pool.max,
      min: dbConfig.pool.min,
      idleTimeoutMillis: dbConfig.pool.idle,
      connectionTimeoutMillis: dbConfig.pool.acquire,
      statement_timeout: 30000,
      query_timeout: 30000,
      application_name: 'soba'
    });

    // Test connection
    const client = await this.primaryPool.connect();
    await client.query('SELECT 1');
    client.release();

    // Setup connection error handling
    this.primaryPool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
      this.handlePoolError(err);
    });

    // Setup transaction pool
    this.transactionPool = new Pool({
      ...this.primaryPool.options,
      max: 5 // Limited pool for transactions
    });
  }

  async setupReplicaPools() {
    const replicaConfig = this.config.get('database.replica');

    if (!replicaConfig?.enabled) {
      return;
    }

    const replicaPool = new Pool({
      host: replicaConfig.host,
      port: replicaConfig.port,
      database: this.config.get('database.primary.database'),
      user: this.config.get('database.primary.username'),
      password: this.config.get('database.primary.password'),
      ssl: this.config.get('database.primary.ssl'),
      max: 10,
      min: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000
    });

    this.replicaPools.push(replicaPool);
  }

  async setupRedisCache() {
    const redisConfig = this.config.get('cache.redis');

    if (!redisConfig?.enabled) {
      return;
    }

    this.redisClient = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      keyPrefix: redisConfig.keyPrefix,
      retryStrategy: (times) => {
        if (times > redisConfig.maxRetriesPerRequest) {
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      lazyConnect: false
    });

    await this.redisClient.ping();
  }

  // Query execution with caching and optimization
  async query(sql, params = [], options = {}) {
    const startTime = performance.now();

    try {
      // Check if query can use read replica
      const useReplica = options.replica !== false && this.isReadQuery(sql);
      const pool = useReplica && this.replicaPools.length > 0
        ? this.getReplicaPool()
        : this.primaryPool;

      // Check cache for read queries
      if (useReplica && options.cache !== false) {
        const cached = await this.getFromCache(sql, params);
        if (cached) {
          this.metrics.cacheHits++;
          return cached;
        }
        this.metrics.cacheMisses++;
      }

      // Optimize query
      const optimizedSql = this.optimizeQuery(sql);

      // Execute query
      const result = await pool.query(optimizedSql, params);

      // Cache result if applicable
      if (useReplica && options.cache !== false && result.rows) {
        await this.saveToCache(sql, params, result.rows, options.ttl);
      }

      // Update metrics
      this.updateMetrics(performance.now() - startTime);

      return {
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields
      };
    } catch (error) {
      this.metrics.errors++;
      this.handleQueryError(error, sql, params);
      throw error;
    }
  }

  // Transaction handling with proper isolation
  async transaction(callback, options = {}) {
    const client = await this.transactionPool.connect();

    try {
      const isolationLevel = options.isolationLevel || 'READ COMMITTED';
      await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);

      const result = await callback({
        query: (sql, params) => client.query(sql, params),
        queryOne: async (sql, params) => {
          const res = await client.query(sql, params);
          return res.rows[0];
        },
        queryMany: async (sql, params) => {
          const res = await client.query(sql, params);
          return res.rows;
        }
      });

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Batch insert optimization
  async batchInsert(table, columns, values, options = {}) {
    if (!values || values.length === 0) {
      return { rowCount: 0 };
    }

    const chunkSize = options.chunkSize || 1000;
    const chunks = [];

    for (let i = 0; i < values.length; i += chunkSize) {
      chunks.push(values.slice(i, i + chunkSize));
    }

    const results = [];

    for (const chunk of chunks) {
      const placeholders = chunk.map((_, rowIndex) => {
        const rowPlaceholders = columns.map((_, colIndex) => {
          return `$${rowIndex * columns.length + colIndex + 1}`;
        });
        return `(${rowPlaceholders.join(', ')})`;
      }).join(', ');

      const sql = `
        INSERT INTO ${this.escapeIdentifier(table)}
        (${columns.map(col => this.escapeIdentifier(col)).join(', ')})
        VALUES ${placeholders}
        ${options.onConflict ? `ON CONFLICT ${options.onConflict}` : ''}
        ${options.returning ? `RETURNING ${options.returning}` : ''}
      `;

      const flatValues = chunk.flat();
      const result = await this.query(sql, flatValues);
      results.push(result);
    }

    return {
      rowCount: results.reduce((sum, r) => sum + r.rowCount, 0),
      rows: results.flatMap(r => r.rows || [])
    };
  }

  // Prepared statements for performance
  async prepare(name, sql, options = {}) {
    if (!this.preparedStatements.has(name)) {
      const client = await this.primaryPool.connect();
      try {
        await client.query({
          name,
          text: sql,
          values: []
        });
        this.preparedStatements.set(name, { sql, options });
      } finally {
        client.release();
      }
    }
    return name;
  }

  async execute(name, params = []) {
    if (!this.preparedStatements.has(name)) {
      throw new Error(`Prepared statement ${name} not found`);
    }

    const { sql } = this.preparedStatements.get(name);
    return this.query(sql, params);
  }

  // Query optimization
  optimizeQuery(sql) {
    let optimized = sql;

    // Add EXPLAIN ANALYZE for development
    if (process.env.NODE_ENV === 'development' && sql.trim().toUpperCase().startsWith('SELECT')) {
      // Log query plan in development
      this.explainQuery(sql).catch(() => {});
    }

    // Basic optimizations
    optimized = optimized
      .replace(/\s+/g, ' ') // Remove extra whitespace
      .trim();

    // Add index hints if applicable
    if (optimized.includes('WHERE') && !optimized.includes('/*+')) {
      // Analyze and suggest indexes
      this.suggestIndexes(optimized);
    }

    return optimized;
  }

  async explainQuery(sql) {
    try {
      const result = await this.primaryPool.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
      const plan = result.rows.map(r => r['QUERY PLAN']).join('\n');

      // Log slow queries
      const executionTime = parseFloat(plan.match(/Execution Time: (\d+\.\d+) ms/)?.[1] || '0');
      if (executionTime > 100) {
        console.warn(`Slow query detected (${executionTime}ms):\n${sql}\n${plan}`);
      }
    } catch {
      // Ignore explain errors
    }
  }

  suggestIndexes(sql) {
    // Simple index suggestion logic
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=/i);
    const joinMatch = sql.match(/JOIN\s+\w+\s+ON\s+\w+\.(\w+)\s*=/i);

    const suggestions = [];
    if (whereMatch) {
      suggestions.push(`Consider index on ${whereMatch[1]}`);
    }
    if (joinMatch) {
      suggestions.push(`Consider index on ${joinMatch[1]}`);
    }

    if (suggestions.length > 0 && process.env.NODE_ENV === 'development') {
      console.log(`Index suggestions for query: ${suggestions.join(', ')}`);
    }
  }

  // Cache management
  async getFromCache(sql, params) {
    if (!this.redisClient) {
      // Use in-memory cache as fallback
      const key = this.getCacheKey(sql, params);
      return this.queryCache.get(key);
    }

    try {
      const key = this.getCacheKey(sql, params);
      const cached = await this.redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache retrieval error:', error);
      return null;
    }
  }

  async saveToCache(sql, params, data, ttl = 300) {
    const key = this.getCacheKey(sql, params);

    if (!this.redisClient) {
      // Use in-memory cache as fallback
      this.queryCache.set(key, data);

      // Limit cache size
      if (this.queryCache.size > 1000) {
        const firstKey = this.queryCache.keys().next().value;
        this.queryCache.delete(firstKey);
      }
      return;
    }

    try {
      await this.redisClient.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      console.error('Cache save error:', error);
    }
  }

  getCacheKey(sql, params) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5');
    hash.update(sql);
    hash.update(JSON.stringify(params));
    return `query:${hash.digest('hex')}`;
  }

  async invalidateCache(pattern) {
    if (!this.redisClient) {
      // Clear in-memory cache
      for (const key of this.queryCache.keys()) {
        if (key.includes(pattern)) {
          this.queryCache.delete(key);
        }
      }
      return;
    }

    try {
      const keys = await this.redisClient.keys(`${this.config.get('cache.redis.keyPrefix')}query:*${pattern}*`);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  // Connection pool management
  getReplicaPool() {
    // Round-robin selection
    const index = Math.floor(Math.random() * this.replicaPools.length);
    return this.replicaPools[index];
  }

  isReadQuery(sql) {
    const trimmed = sql.trim().toUpperCase();
    return trimmed.startsWith('SELECT') && !trimmed.includes('FOR UPDATE');
  }

  // Health checks
  async healthCheck() {
    const health = {
      primary: false,
      replicas: [],
      cache: false,
      metrics: this.metrics
    };

    try {
      // Check primary
      const primaryResult = await this.primaryPool.query('SELECT 1');
      health.primary = primaryResult.rowCount === 1;

      // Check replicas
      for (const pool of this.replicaPools) {
        try {
          const result = await pool.query('SELECT 1');
          health.replicas.push(result.rowCount === 1);
        } catch {
          health.replicas.push(false);
        }
      }

      // Check cache
      if (this.redisClient) {
        await this.redisClient.ping();
        health.cache = true;
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }

    return health;
  }

  // Monitoring and metrics
  setupMonitoring() {
    setInterval(async () => {
      const poolStats = {
        total: this.primaryPool.totalCount,
        idle: this.primaryPool.idleCount,
        waiting: this.primaryPool.waitingCount
      };

      if (poolStats.waiting > 5) {
        console.warn('High database connection wait count:', poolStats.waiting);
      }

      // Log metrics
      if (this.metrics.queries > 0) {
        console.log('Database metrics:', {
          ...this.metrics,
          poolStats
        });
      }
    }, 60000); // Every minute
  }

  updateMetrics(queryTime) {
    this.metrics.queries++;
    this.metrics.avgQueryTime =
      (this.metrics.avgQueryTime * (this.metrics.queries - 1) + queryTime) /
      this.metrics.queries;
  }

  // Error handling
  handleQueryError(error, sql, params) {
    console.error('Query error:', {
      message: error.message,
      sql: sql.substring(0, 200),
      params: params?.slice(0, 5),
      stack: error.stack
    });

    // Specific error handling
    if (error.code === '23505') {
      throw new Error('Duplicate key violation');
    }
    if (error.code === '23503') {
      throw new Error('Foreign key violation');
    }
    if (error.code === '42P01') {
      throw new Error('Table does not exist');
    }
    if (error.code === '08P01') {
      throw new Error('Protocol violation');
    }
  }

  handlePoolError(error) {
    console.error('Pool error:', error);
    // Attempt to recreate pool if necessary
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      this.reconnect();
    }
  }

  async reconnect() {
    console.log('Attempting database reconnection...');
    try {
      await this.cleanup();
      await this.initialize();
      console.log('Database reconnection successful');
    } catch (error) {
      console.error('Database reconnection failed:', error);
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  // Cleanup
  setupCleanup() {
    // Periodic cleanup
    setInterval(() => {
      // Clear old cache entries
      if (this.queryCache.size > 500) {
        const entriesToDelete = this.queryCache.size - 500;
        const keys = Array.from(this.queryCache.keys()).slice(0, entriesToDelete);
        keys.forEach(key => this.queryCache.delete(key));
      }
    }, 300000); // Every 5 minutes

    // Graceful shutdown
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
  }

  async cleanup() {
    console.log('Cleaning up database connections...');

    try {
      if (this.primaryPool) {
        await this.primaryPool.end();
      }

      for (const pool of this.replicaPools) {
        await pool.end();
      }

      if (this.transactionPool) {
        await this.transactionPool.end();
      }

      if (this.redisClient) {
        this.redisClient.disconnect();
      }

      this.queryCache.clear();
      this.preparedStatements.clear();

      console.log('Database cleanup completed');
    } catch (error) {
      console.error('Error during database cleanup:', error);
    }
  }

  // Helper methods
  escapeIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  formatDate(date) {
    return date.toISOString();
  }

  parseJson(value) {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  }
}

module.exports = EnhancedDatabase;