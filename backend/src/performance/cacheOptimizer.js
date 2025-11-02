// ============================================================================
// Advanced Cache Optimizer
// Multi-layer caching with intelligent invalidation and preloading
// ============================================================================

const LRU = require('lru-cache');
const EventEmitter = require('events');

/**
 * CacheOptimizer - Advanced multi-layer caching system
 *
 * Features:
 * - L1: In-memory LRU cache (fastest)
 * - L2: Redis distributed cache (shared across instances)
 * - Smart cache warming and preloading
 * - Intelligent cache invalidation
 * - Cache hit/miss metrics
 * - Automatic cache compression
 * - Time-based expiration
 * - Pattern-based invalidation
 */
class CacheOptimizer extends EventEmitter {
  constructor(redisClient, options = {}) {
    super();

    this.redis = redisClient;
    this.options = {
      l1MaxSize: options.l1MaxSize || 500, // L1 cache entries
      l1TTL: options.l1TTL || 5 * 60 * 1000, // 5 minutes
      l2TTL: options.l2TTL || 30 * 60, // 30 minutes (seconds for Redis)
      compressionThreshold: options.compressionThreshold || 1024, // 1KB
      enableCompression: options.enableCompression !== false,
      warmupInterval: options.warmupInterval || 5 * 60 * 1000, // 5 minutes
      ...options
    };

    // L1 Cache (in-memory LRU)
    this.l1Cache = new LRU({
      max: this.options.l1MaxSize,
      ttl: this.options.l1TTL,
      updateAgeOnGet: true,
      allowStale: false
    });

    // Metrics
    this.metrics = {
      l1: { hits: 0, misses: 0, sets: 0, deletes: 0 },
      l2: { hits: 0, misses: 0, sets: 0, deletes: 0 },
      compressions: 0,
      decompressions: 0,
      errors: 0
    };

    // Cache key patterns for invalidation
    this.keyPatterns = new Map();

    // Warmup timer
    this.warmupTimer = null;
  }

  /**
   * Initialize cache optimizer
   */
  async initialize() {
    console.log('[CacheOptimizer] Initializing cache optimization system...');

    // Start cache warmup if enabled
    if (this.options.warmupInterval > 0) {
      this.startCacheWarmup();
    }

    console.log('[CacheOptimizer] Cache optimizer initialized');
    this.emit('initialized');
  }

  /**
   * Get value from cache (tries L1 first, then L2)
   */
  async get(key) {
    try {
      // Try L1 cache first
      const l1Value = this.l1Cache.get(key);
      if (l1Value !== undefined) {
        this.metrics.l1.hits++;
        this.emit('cache-hit', { layer: 'L1', key });
        return l1Value;
      }

      this.metrics.l1.misses++;

      // Try L2 cache (Redis)
      if (this.redis) {
        const l2Value = await this.redis.get(key);
        if (l2Value !== null) {
          this.metrics.l2.hits++;
          this.emit('cache-hit', { layer: 'L2', key });

          // Parse and decompress if needed
          let parsed = JSON.parse(l2Value);
          if (parsed._compressed) {
            parsed = await this.decompress(parsed.data);
            this.metrics.decompressions++;
          }

          // Promote to L1 cache
          this.l1Cache.set(key, parsed);
          this.metrics.l1.sets++;

          return parsed;
        }

        this.metrics.l2.misses++;
      }

      this.emit('cache-miss', { key });
      return null;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'get', key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache (writes to both L1 and L2)
   */
  async set(key, value, options = {}) {
    try {
      const ttl = options.ttl || this.options.l2TTL;

      // Set in L1 cache
      this.l1Cache.set(key, value);
      this.metrics.l1.sets++;

      // Set in L2 cache (Redis) with optional compression
      if (this.redis) {
        let toStore = value;
        const stringified = JSON.stringify(value);

        // Compress if above threshold
        if (this.options.enableCompression && stringified.length > this.options.compressionThreshold) {
          toStore = {
            _compressed: true,
            data: await this.compress(stringified)
          };
          this.metrics.compressions++;
        }

        await this.redis.set(key, JSON.stringify(toStore), 'EX', ttl);
        this.metrics.l2.sets++;
      }

      this.emit('cache-set', { key, size: JSON.stringify(value).length });
      return true;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'set', key, error: error.message });
      return false;
    }
  }

  /**
   * Delete value from cache (both L1 and L2)
   */
  async delete(key) {
    try {
      // Delete from L1
      this.l1Cache.delete(key);
      this.metrics.l1.deletes++;

      // Delete from L2
      if (this.redis) {
        await this.redis.del(key);
        this.metrics.l2.deletes++;
      }

      this.emit('cache-delete', { key });
      return true;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'delete', key, error: error.message });
      return false;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern) {
    try {
      let deleted = 0;

      // L1 cache - delete matching keys
      for (const key of this.l1Cache.keys()) {
        if (this.matchesPattern(key, pattern)) {
          this.l1Cache.delete(key);
          deleted++;
        }
      }

      // L2 cache - use Redis SCAN for pattern matching
      if (this.redis) {
        let cursor = '0';
        do {
          const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = newCursor;

          if (keys.length > 0) {
            await this.redis.del(...keys);
            deleted += keys.length;
          }
        } while (cursor !== '0');
      }

      this.emit('pattern-invalidated', { pattern, deleted });
      return deleted;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'invalidatePattern', pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet(key, fetchFn, options = {}) {
    // Try to get from cache first
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch data
    try {
      const value = await fetchFn();
      if (value !== null && value !== undefined) {
        await this.set(key, value, options);
      }
      return value;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'getOrSet', key, error: error.message });
      throw error;
    }
  }

  /**
   * Batch get multiple keys
   */
  async mget(keys) {
    const results = {};

    for (const key of keys) {
      results[key] = await this.get(key);
    }

    return results;
  }

  /**
   * Batch set multiple keys
   */
  async mset(entries, options = {}) {
    const promises = Object.entries(entries).map(([key, value]) =>
      this.set(key, value, options)
    );

    return Promise.all(promises);
  }

  /**
   * Clear all caches
   */
  async clear() {
    try {
      // Clear L1
      this.l1Cache.clear();

      // Clear L2
      if (this.redis) {
        await this.redis.flushdb();
      }

      this.emit('cache-cleared');
      return true;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', { operation: 'clear', error: error.message });
      return false;
    }
  }

  /**
   * Start cache warmup process
   */
  startCacheWarmup() {
    if (this.warmupTimer) {
      clearInterval(this.warmupTimer);
    }

    this.warmupTimer = setInterval(() => {
      this.performCacheWarmup().catch(error => {
        console.error('[CacheOptimizer] Cache warmup error:', error);
      });
    }, this.options.warmupInterval);

    console.log(`[CacheOptimizer] Cache warmup started (interval: ${this.options.warmupInterval}ms)`);
  }

  /**
   * Perform cache warmup
   */
  async performCacheWarmup() {
    this.emit('warmup-start');

    // Example: Preload frequently accessed data
    // This should be customized based on your application's access patterns

    // For security monitor, we might preload:
    // - Recent attack patterns
    // - Threat intelligence for top IPs
    // - Compliance rules
    // - ML model predictions

    console.log('[CacheOptimizer] Cache warmup completed');
    this.emit('warmup-complete');
  }

  /**
   * Compress data using gzip
   */
  async compress(data) {
    const zlib = require('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(Buffer.from(data), (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed.toString('base64'));
      });
    });
  }

  /**
   * Decompress data
   */
  async decompress(data) {
    const zlib = require('zlib');
    return new Promise((resolve, reject) => {
      zlib.gunzip(Buffer.from(data, 'base64'), (err, decompressed) => {
        if (err) reject(err);
        else resolve(JSON.parse(decompressed.toString()));
      });
    });
  }

  /**
   * Check if key matches pattern
   */
  matchesPattern(key, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  }

  /**
   * Get cache metrics
   */
  getMetrics() {
    const totalL1 = this.metrics.l1.hits + this.metrics.l1.misses;
    const totalL2 = this.metrics.l2.hits + this.metrics.l2.misses;

    return {
      l1: {
        ...this.metrics.l1,
        hitRate: totalL1 > 0 ? ((this.metrics.l1.hits / totalL1) * 100).toFixed(2) : '0.00',
        size: this.l1Cache.size,
        maxSize: this.options.l1MaxSize
      },
      l2: {
        ...this.metrics.l2,
        hitRate: totalL2 > 0 ? ((this.metrics.l2.hits / totalL2) * 100).toFixed(2) : '0.00'
      },
      overall: {
        compressions: this.metrics.compressions,
        decompressions: this.metrics.decompressions,
        errors: this.metrics.errors
      }
    };
  }

  /**
   * Shutdown cache optimizer
   */
  async shutdown() {
    console.log('[CacheOptimizer] Shutting down cache optimizer...');

    if (this.warmupTimer) {
      clearInterval(this.warmupTimer);
      this.warmupTimer = null;
    }

    this.l1Cache.clear();
    this.emit('shutdown');

    console.log('[CacheOptimizer] Cache optimizer shut down');
  }
}

module.exports = CacheOptimizer;
