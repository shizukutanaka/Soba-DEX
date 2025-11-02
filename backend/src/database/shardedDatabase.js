/**
 * Sharded Database Service
 * Horizontal scaling with sharding and N+1 query prevention
 */

const { PrismaClient } = require('@prisma/client');
const DataLoader = require('dataloader');
const { logger } = require('../utils/productionLogger');
const crypto = require('crypto');

/**
 * Sharded Database with DataLoader for N+1 prevention
 */
class ShardedDatabaseService {
  constructor() {
    this.shards = new Map();
    this.dataloaders = new Map();
    this.shardCount = parseInt(process.env.SHARD_COUNT || '4');
    this.replicationFactor = parseInt(process.env.REPLICATION_FACTOR || '2');
    this.config = {
      shardingStrategy: process.env.SHARDING_STRATEGY || 'hash', // hash, range, geo
      readPreference: process.env.READ_PREFERENCE || 'primary', // primary, secondary, nearest
      consistencyLevel: process.env.CONSISTENCY_LEVEL || 'eventual', // strong, eventual
      connectionPoolSize: parseInt(process.env.POOL_SIZE || '20'),
      maxRetries: 3,
      retryDelay: 1000
    };
    this.metrics = {
      queries: 0,
      shardHits: new Map(),
      cacheHits: 0,
      cacheMisses: 0,
      n1Prevented: 0
    };
  }

  /**
   * Initialize sharded database
   */
  async initialize() {
    try {
      logger.info('[ShardedDB] Initializing sharded database', {
        shards: this.shardCount,
        replication: this.replicationFactor
      });

      // Initialize shards
      await this.initializeShards();

      // Initialize DataLoaders
      this.initializeDataLoaders();

      // Setup monitoring
      this.startMonitoring();

      // Test connections
      await this.testConnections();

      logger.info('[ShardedDB] Initialization complete');
    } catch (error) {
      logger.error('[ShardedDB] Initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize database shards
   */
  async initializeShards() {
    for (let i = 0; i < this.shardCount; i++) {
      const shard = {
        id: i,
        primary: null,
        replicas: [],
        status: 'initializing',
        metrics: {
          queries: 0,
          errors: 0,
          latency: []
        }
      };

      // Create primary connection
      shard.primary = new PrismaClient({
        datasources: {
          db: {
            url: this.getShardUrl(i, 'primary')
          }
        },
        log: ['error', 'warn'],
        errorFormat: 'minimal'
      });

      // Create replica connections
      for (let j = 0; j < this.replicationFactor - 1; j++) {
        const replica = new PrismaClient({
          datasources: {
            db: {
              url: this.getShardUrl(i, `replica-${j}`)
            }
          },
          log: ['error'],
          errorFormat: 'minimal'
        });

        shard.replicas.push(replica);
      }

      shard.status = 'active';
      this.shards.set(i, shard);
      this.metrics.shardHits.set(i, 0);
    }
  }

  /**
   * Initialize DataLoaders for N+1 prevention
   */
  initializeDataLoaders() {
    // User loader
    this.dataloaders.set('user', new DataLoader(
      async (userIds) => {
        this.metrics.n1Prevented++;
        return this.batchLoadUsers(userIds);
      },
      {
        cache: true,
        maxBatchSize: 100,
        batchScheduleFn: (callback) => setTimeout(callback, 10)
      }
    ));

    // Order loader
    this.dataloaders.set('order', new DataLoader(
      async (orderIds) => {
        this.metrics.n1Prevented++;
        return this.batchLoadOrders(orderIds);
      },
      {
        cache: true,
        maxBatchSize: 100
      }
    ));

    // Transaction loader
    this.dataloaders.set('transaction', new DataLoader(
      async (txIds) => {
        this.metrics.n1Prevented++;
        return this.batchLoadTransactions(txIds);
      },
      {
        cache: true,
        maxBatchSize: 100
      }
    ));

    // Portfolio loader (composite key)
    this.dataloaders.set('portfolio', new DataLoader(
      async (keys) => {
        this.metrics.n1Prevented++;
        return this.batchLoadPortfolios(keys);
      },
      {
        cache: true,
        cacheKeyFn: (key) => `${key.userId}:${key.tokenAddress}`
      }
    ));

    // Price loader with TTL
    this.dataloaders.set('price', new DataLoader(
      async (pairs) => {
        this.metrics.n1Prevented++;
        return this.batchLoadPrices(pairs);
      },
      {
        cache: true,
        maxBatchSize: 50,
        cacheMap: new TimedCache(5000) // 5 second TTL
      }
    ));
  }

  /**
   * Get shard for a given key
   */
  getShardId(key, strategy = this.config.shardingStrategy) {
    switch (strategy) {
      case 'hash':
        return this.hashSharding(key);

      case 'range':
        return this.rangeSharding(key);

      case 'geo':
        return this.geoSharding(key);

      case 'consistent':
        return this.consistentHashSharding(key);

      default:
        return 0;
    }
  }

  /**
   * Hash-based sharding
   */
  hashSharding(key) {
    const hash = crypto.createHash('md5').update(String(key)).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    return hashValue % this.shardCount;
  }

  /**
   * Range-based sharding
   */
  rangeSharding(key) {
    // For numeric keys, distribute based on range
    if (typeof key === 'number') {
      const rangeSize = Number.MAX_SAFE_INTEGER / this.shardCount;
      return Math.floor(key / rangeSize);
    }

    // Fallback to hash for non-numeric
    return this.hashSharding(key);
  }

  /**
   * Geo-based sharding
   */
  geoSharding(key) {
    // Implement geo-based sharding for location data
    // This would use geographic regions
    return 0; // Placeholder
  }

  /**
   * Consistent hash sharding
   */
  consistentHashSharding(key) {
    // Implement consistent hashing for better distribution
    // when adding/removing shards
    const hash = crypto.createHash('sha256').update(String(key)).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    return hashValue % this.shardCount;
  }

  /**
   * Get connection for a shard
   */
  getConnection(shardId, preferReplica = false) {
    const shard = this.shards.get(shardId);

    if (!shard) {
      throw new Error(`Shard ${shardId} not found`);
    }

    // Use replica for read operations if configured
    if (preferReplica && shard.replicas.length > 0) {
      if (this.config.readPreference === 'secondary') {
        // Round-robin replicas
        const replicaIndex = Math.floor(Math.random() * shard.replicas.length);
        return shard.replicas[replicaIndex];
      } else if (this.config.readPreference === 'nearest') {
        // Choose nearest replica (would need latency monitoring)
        return this.getNearestReplica(shard);
      }
    }

    return shard.primary;
  }

  /**
   * Execute query on appropriate shard
   */
  async executeOnShard(key, operation, preferReplica = false) {
    const shardId = this.getShardId(key);
    const connection = this.getConnection(shardId, preferReplica);

    this.metrics.queries++;
    this.metrics.shardHits.set(shardId, this.metrics.shardHits.get(shardId) + 1);

    const startTime = Date.now();

    try {
      const result = await operation(connection);

      // Track latency
      const shard = this.shards.get(shardId);
      shard.metrics.latency.push(Date.now() - startTime);
      shard.metrics.queries++;

      return result;
    } catch (error) {
      const shard = this.shards.get(shardId);
      shard.metrics.errors++;

      logger.error('[ShardedDB] Query execution failed', {
        shardId,
        error: error.message
      });

      // Retry logic
      if (this.shouldRetry(error)) {
        return this.retryOperation(key, operation, preferReplica);
      }

      throw error;
    }
  }

  /**
   * Execute query across all shards (scatter-gather)
   */
  async executeOnAllShards(operation, aggregate = true) {
    const promises = [];

    for (const [shardId, shard] of this.shards) {
      promises.push(
        operation(shard.primary).catch(error => {
          logger.error('[ShardedDB] Shard query failed', {
            shardId,
            error: error.message
          });
          return null;
        })
      );
    }

    const results = await Promise.all(promises);

    if (aggregate) {
      return this.aggregateResults(results);
    }

    return results;
  }

  /**
   * Cross-shard transaction
   */
  async executeTransaction(operations) {
    const shardOperations = new Map();

    // Group operations by shard
    for (const op of operations) {
      const shardId = this.getShardId(op.key);

      if (!shardOperations.has(shardId)) {
        shardOperations.set(shardId, []);
      }

      shardOperations.get(shardId).push(op);
    }

    // Execute transactions on each shard
    const promises = [];

    for (const [shardId, ops] of shardOperations) {
      const connection = this.getConnection(shardId);

      promises.push(
        connection.$transaction(async (tx) => {
          const results = [];

          for (const op of ops) {
            const result = await op.operation(tx);
            results.push(result);
          }

          return results;
        })
      );
    }

    // Wait for all transactions
    const results = await Promise.all(promises);

    return results.flat();
  }

  /**
   * Batch load users (DataLoader)
   */
  async batchLoadUsers(userIds) {
    // Group user IDs by shard
    const shardGroups = new Map();

    for (const userId of userIds) {
      const shardId = this.getShardId(userId);

      if (!shardGroups.has(shardId)) {
        shardGroups.set(shardId, []);
      }

      shardGroups.get(shardId).push(userId);
    }

    // Query each shard
    const promises = [];

    for (const [shardId, ids] of shardGroups) {
      const connection = this.getConnection(shardId, true);

      promises.push(
        connection.user.findMany({
          where: {
            id: { in: ids }
          },
          include: {
            sessions: false, // Prevent N+1 on relations
            orders: false
          }
        })
      );
    }

    const results = await Promise.all(promises);
    const users = results.flat();

    // Map results to maintain order
    const userMap = new Map(users.map(u => [u.id, u]));

    return userIds.map(id => userMap.get(id) || null);
  }

  /**
   * Batch load orders
   */
  async batchLoadOrders(orderIds) {
    const shardGroups = new Map();

    for (const orderId of orderIds) {
      const shardId = this.getShardId(orderId);

      if (!shardGroups.has(shardId)) {
        shardGroups.set(shardId, []);
      }

      shardGroups.get(shardId).push(orderId);
    }

    const promises = [];

    for (const [shardId, ids] of shardGroups) {
      const connection = this.getConnection(shardId, true);

      promises.push(
        connection.order.findMany({
          where: {
            id: { in: ids }
          },
          include: {
            user: false, // Use DataLoader for user
            transactions: false // Use separate loader
          }
        })
      );
    }

    const results = await Promise.all(promises);
    const orders = results.flat();
    const orderMap = new Map(orders.map(o => [o.id, o]));

    return orderIds.map(id => orderMap.get(id) || null);
  }

  /**
   * Batch load transactions
   */
  async batchLoadTransactions(txIds) {
    const shardGroups = new Map();

    for (const txId of txIds) {
      const shardId = this.getShardId(txId);

      if (!shardGroups.has(shardId)) {
        shardGroups.set(shardId, []);
      }

      shardGroups.get(shardId).push(txId);
    }

    const promises = [];

    for (const [shardId, ids] of shardGroups) {
      const connection = this.getConnection(shardId, true);

      promises.push(
        connection.transaction.findMany({
          where: {
            id: { in: ids }
          }
        })
      );
    }

    const results = await Promise.all(promises);
    const transactions = results.flat();
    const txMap = new Map(transactions.map(t => [t.id, t]));

    return txIds.map(id => txMap.get(id) || null);
  }

  /**
   * Batch load portfolios (composite key)
   */
  async batchLoadPortfolios(keys) {
    const shardGroups = new Map();

    for (const key of keys) {
      const shardId = this.getShardId(key.userId);

      if (!shardGroups.has(shardId)) {
        shardGroups.set(shardId, []);
      }

      shardGroups.get(shardId).push(key);
    }

    const promises = [];

    for (const [shardId, shardKeys] of shardGroups) {
      const connection = this.getConnection(shardId, true);

      const conditions = shardKeys.map(k => ({
        userId: k.userId,
        tokenAddress: k.tokenAddress
      }));

      promises.push(
        connection.portfolio.findMany({
          where: {
            OR: conditions
          }
        })
      );
    }

    const results = await Promise.all(promises);
    const portfolios = results.flat();

    const portfolioMap = new Map(
      portfolios.map(p => [`${p.userId}:${p.tokenAddress}`, p])
    );

    return keys.map(k => portfolioMap.get(`${k.userId}:${k.tokenAddress}`) || null);
  }

  /**
   * Batch load prices
   */
  async batchLoadPrices(pairs) {
    // Prices might be in a single shard or cache
    const prices = await this.executeOnShard(0,
      async (connection) => {
        return connection.price.findMany({
          where: {
            pair: { in: pairs }
          },
          orderBy: {
            timestamp: 'desc'
          },
          distinct: ['pair']
        });
      },
      true
    );

    const priceMap = new Map(prices.map(p => [p.pair, p]));

    return pairs.map(pair => priceMap.get(pair) || null);
  }

  /**
   * Optimized queries with DataLoader
   */

  async getUserWithOrders(userId) {
    // Use DataLoader to prevent N+1
    const user = await this.dataloaders.get('user').load(userId);

    if (!user) return null;

    // Load orders separately using DataLoader
    const orders = await this.executeOnShard(userId,
      async (connection) => {
        return connection.order.findMany({
          where: { userId }
        });
      },
      true
    );

    return {
      ...user,
      orders
    };
  }

  async getOrdersWithUsers(orderIds) {
    // Batch load orders
    const orders = await Promise.all(
      orderIds.map(id => this.dataloaders.get('order').load(id))
    );

    // Extract unique user IDs
    const userIds = [...new Set(orders.filter(o => o).map(o => o.userId))];

    // Batch load users
    const users = await Promise.all(
      userIds.map(id => this.dataloaders.get('user').load(id))
    );

    const userMap = new Map(users.map(u => [u.id, u]));

    // Combine results
    return orders.map(order => {
      if (!order) return null;

      return {
        ...order,
        user: userMap.get(order.userId)
      };
    });
  }

  /**
   * Aggregate results from multiple shards
   */
  aggregateResults(results) {
    // Filter out null results
    const validResults = results.filter(r => r !== null);

    // If results are arrays, flatten them
    if (validResults.length > 0 && Array.isArray(validResults[0])) {
      return validResults.flat();
    }

    // If results are numbers, sum them
    if (validResults.length > 0 && typeof validResults[0] === 'number') {
      return validResults.reduce((sum, val) => sum + val, 0);
    }

    return validResults;
  }

  /**
   * Retry operation on failure
   */
  async retryOperation(key, operation, preferReplica, attempt = 1) {
    if (attempt > this.config.maxRetries) {
      throw new Error(`Max retries (${this.config.maxRetries}) exceeded`);
    }

    await new Promise(resolve =>
      setTimeout(resolve, this.config.retryDelay * attempt)
    );

    logger.info('[ShardedDB] Retrying operation', {
      attempt,
      key
    });

    return this.executeOnShard(key, operation, preferReplica);
  }

  /**
   * Should retry based on error type
   */
  shouldRetry(error) {
    const retryableErrors = [
      'P2002', // Unique constraint
      'P2014', // Relation violation
      'P2024', // Timed out
      'P2034'  // Transaction failed
    ];

    return retryableErrors.includes(error.code);
  }

  /**
   * Get nearest replica based on latency
   */
  getNearestReplica(shard) {
    // This would use actual latency measurements
    // For now, return random replica
    if (shard.replicas.length === 0) {
      return shard.primary;
    }

    return shard.replicas[Math.floor(Math.random() * shard.replicas.length)];
  }

  /**
   * Get shard URL
   */
  getShardUrl(shardId, type) {
    const baseUrl = process.env.DATABASE_URL;

    // Parse base URL and modify for sharding
    const url = new URL(baseUrl);

    if (type === 'primary') {
      url.hostname = `shard-${shardId}-primary.${url.hostname}`;
    } else {
      url.hostname = `shard-${shardId}-${type}.${url.hostname}`;
    }

    return url.toString();
  }

  /**
   * Test connections to all shards
   */
  async testConnections() {
    for (const [shardId, shard] of this.shards) {
      try {
        await shard.primary.$queryRaw`SELECT 1`;

        for (const replica of shard.replicas) {
          await replica.$queryRaw`SELECT 1`;
        }

        logger.info('[ShardedDB] Shard connection test passed', { shardId });
      } catch (error) {
        logger.error('[ShardedDB] Shard connection test failed', {
          shardId,
          error: error.message
        });

        throw error;
      }
    }
  }

  /**
   * Monitoring
   */
  startMonitoring() {
    setInterval(() => {
      const metrics = {
        totalQueries: this.metrics.queries,
        cacheHitRate: this.metrics.cacheHits /
          (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
        n1QueriesPrevented: this.metrics.n1Prevented,
        shardDistribution: {}
      };

      for (const [shardId, hits] of this.metrics.shardHits) {
        metrics.shardDistribution[`shard-${shardId}`] = hits;
      }

      logger.info('[ShardedDB] Database metrics', metrics);

      // Check shard health
      for (const [shardId, shard] of this.shards) {
        if (shard.metrics.errors > 10) {
          logger.warn('[ShardedDB] Shard has high error rate', {
            shardId,
            errors: shard.metrics.errors
          });
        }

        // Calculate average latency
        if (shard.metrics.latency.length > 0) {
          const avgLatency = shard.metrics.latency.reduce((a, b) => a + b, 0) /
            shard.metrics.latency.length;

          if (avgLatency > 100) {
            logger.warn('[ShardedDB] Shard has high latency', {
              shardId,
              avgLatency
            });
          }

          // Reset latency array to prevent memory growth
          shard.metrics.latency = [];
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('[ShardedDB] Shutting down sharded database');

    for (const [shardId, shard] of this.shards) {
      await shard.primary.$disconnect();

      for (const replica of shard.replicas) {
        await replica.$disconnect();
      }

      logger.info('[ShardedDB] Shard disconnected', { shardId });
    }

    this.shards.clear();
    this.dataloaders.clear();

    logger.info('[ShardedDB] Shutdown complete');
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      shards: {}
    };

    for (const [shardId, shard] of this.shards) {
      try {
        await shard.primary.$queryRaw`SELECT 1`;

        health.shards[`shard-${shardId}`] = {
          status: 'healthy',
          queries: shard.metrics.queries,
          errors: shard.metrics.errors
        };
      } catch (error) {
        health.status = 'degraded';
        health.shards[`shard-${shardId}`] = {
          status: 'unhealthy',
          error: error.message
        };
      }
    }

    return health;
  }
}

/**
 * Timed cache for DataLoader
 */
class TimedCache {
  constructor(ttl) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key) {
    const entry = this.cache.get(key);

    if (!entry) return undefined;

    if (Date.now() - entry.time > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      time: Date.now()
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

// Create singleton instance
const shardedDB = new ShardedDatabaseService();

// Initialize on module load
(async () => {
  try {
    await shardedDB.initialize();
  } catch (error) {
    logger.error('[ShardedDB] Failed to initialize on module load', {
      error: error.message
    });
  }
})();

module.exports = {
  ShardedDatabaseService,
  shardedDB,

  // DataLoader access
  loadUser: (id) => shardedDB.dataloaders.get('user').load(id),
  loadOrder: (id) => shardedDB.dataloaders.get('order').load(id),
  loadTransaction: (id) => shardedDB.dataloaders.get('transaction').load(id),
  loadPortfolio: (key) => shardedDB.dataloaders.get('portfolio').load(key),
  loadPrice: (pair) => shardedDB.dataloaders.get('price').load(pair),

  // Query methods
  executeOnShard: (key, operation, preferReplica) =>
    shardedDB.executeOnShard(key, operation, preferReplica),
  executeOnAllShards: (operation, aggregate) =>
    shardedDB.executeOnAllShards(operation, aggregate),
  executeTransaction: (operations) =>
    shardedDB.executeTransaction(operations),

  // Optimized queries
  getUserWithOrders: (userId) => shardedDB.getUserWithOrders(userId),
  getOrdersWithUsers: (orderIds) => shardedDB.getOrdersWithUsers(orderIds),

  // Health
  healthCheck: () => shardedDB.healthCheck(),
  shutdown: () => shardedDB.shutdown()
};