/**
 * Redis Client for Distributed Caching
 *
 * FEATURES:
 * - Connection pooling
 * - Automatic reconnection
 * - Circuit breaker pattern
 * - Fallback to memory cache
 * - Compression support
 * - Metrics tracking
 */

const Redis = require('ioredis');
const { logger } = require('../utils/productionLogger');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class RedisClient {
  constructor(options = {}) {
    this.config = {
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || process.env.REDIS_PORT || 6379,
      password: options.password || process.env.REDIS_PASSWORD,
      db: options.db || 0,
      keyPrefix: options.keyPrefix || 'dex:',

      // Connection pool
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,

      // Reconnection
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis reconnection attempt ${times}, delay: ${delay}ms`);
        return delay;
      },

      // Compression threshold (compress if > 1KB)
      compressionThreshold: options.compressionThreshold || 1024,

      // Default TTL (1 hour)
      defaultTTL: options.defaultTTL || 3600,

      // Circuit breaker
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: options.circuitBreakerTimeout || 60000
    };

    // Fallback in-memory cache
    this.memoryCache = new Map();
    this.memoryCacheMaxSize = 1000;

    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      isOpen: false,
      openedAt: null
    };

    // Metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      compressions: 0,
      fallbackHits: 0
    };

    this.initialize();
  }

  initialize() {
    try {
      this.client = new Redis(this.config);

      // Event handlers
      this.client.on('connect', () => {
        logger.info('Redis connected');
        this.resetCircuitBreaker();
      });

      this.client.on('ready', () => {
        logger.info('Redis ready');
      });

      this.client.on('error', (error) => {
        logger.error('Redis error', { error: error.message });
        this.metrics.errors++;
        this.handleError(error);
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis reconnecting');
      });

    } catch (error) {
      logger.error('Failed to initialize Redis', { error: error.message });
      this.openCircuitBreaker();
    }
  }

  /**
   * Circuit breaker management
   */
  handleError(error) {
    this.circuitBreaker.failures++;

    if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      this.openCircuitBreaker();
    }
  }

  openCircuitBreaker() {
    if (!this.circuitBreaker.isOpen) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.openedAt = Date.now();
      logger.error('Circuit breaker OPEN - using fallback cache');

      // Auto-reset after timeout
      setTimeout(() => {
        this.resetCircuitBreaker();
      }, this.config.circuitBreakerTimeout);
    }
  }

  resetCircuitBreaker() {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.openedAt = null;
    logger.info('Circuit breaker CLOSED - Redis active');
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitOpen() {
    if (!this.circuitBreaker.isOpen) return false;

    // Auto-reset after timeout
    const elapsed = Date.now() - this.circuitBreaker.openedAt;
    if (elapsed > this.config.circuitBreakerTimeout) {
      this.resetCircuitBreaker();
      return false;
    }

    return true;
  }

  /**
   * Compress data if above threshold
   */
  async compress(data) {
    const json = JSON.stringify(data);

    if (json.length > this.config.compressionThreshold) {
      const compressed = await gzip(json);
      this.metrics.compressions++;
      return {
        compressed: true,
        data: compressed.toString('base64')
      };
    }

    return {
      compressed: false,
      data: json
    };
  }

  /**
   * Decompress data
   */
  async decompress(stored) {
    if (stored.compressed) {
      const buffer = Buffer.from(stored.data, 'base64');
      const decompressed = await gunzip(buffer);
      return JSON.parse(decompressed.toString());
    }

    return JSON.parse(stored.data);
  }

  /**
   * Get value from cache
   */
  async get(key) {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      return this.getFromMemory(key);
    }

    try {
      const value = await this.client.get(key);

      if (value === null) {
        this.metrics.misses++;
        return null;
      }

      this.metrics.hits++;
      const stored = JSON.parse(value);
      return await this.decompress(stored);

    } catch (error) {
      logger.error('Redis GET error', { key, error: error.message });
      this.handleError(error);
      return this.getFromMemory(key);
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = this.config.defaultTTL) {
    // Update memory cache
    this.setInMemory(key, value);

    // Check circuit breaker
    if (this.isCircuitOpen()) {
      return true;
    }

    try {
      const compressed = await this.compress(value);
      const stored = JSON.stringify(compressed);

      if (ttl) {
        await this.client.setex(key, ttl, stored);
      } else {
        await this.client.set(key, stored);
      }

      this.metrics.sets++;
      return true;

    } catch (error) {
      logger.error('Redis SET error', { key, error: error.message });
      this.handleError(error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key) {
    this.memoryCache.delete(key);

    if (this.isCircuitOpen()) {
      return true;
    }

    try {
      await this.client.del(key);
      this.metrics.deletes++;
      return true;
    } catch (error) {
      logger.error('Redis DEL error', { key, error: error.message });
      this.handleError(error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (this.isCircuitOpen()) {
      return this.memoryCache.has(key);
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error', { key, error: error.message });
      this.handleError(error);
      return this.memoryCache.has(key);
    }
  }

  /**
   * Increment value
   */
  async incr(key, ttl = this.config.defaultTTL) {
    if (this.isCircuitOpen()) {
      const current = this.memoryCache.get(key) || 0;
      this.memoryCache.set(key, current + 1);
      return current + 1;
    }

    try {
      const value = await this.client.incr(key);
      if (ttl) {
        await this.client.expire(key, ttl);
      }
      return value;
    } catch (error) {
      logger.error('Redis INCR error', { key, error: error.message });
      this.handleError(error);
      return null;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys) {
    if (this.isCircuitOpen()) {
      return keys.map(key => this.memoryCache.get(key) || null);
    }

    try {
      const values = await this.client.mget(keys);
      return Promise.all(values.map(async (value) => {
        if (value === null) return null;
        const stored = JSON.parse(value);
        return await this.decompress(stored);
      }));
    } catch (error) {
      logger.error('Redis MGET error', { error: error.message });
      this.handleError(error);
      return keys.map(key => this.memoryCache.get(key) || null);
    }
  }

  /**
   * Fallback memory cache methods
   */
  getFromMemory(key) {
    const entry = this.memoryCache.get(key);
    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      this.metrics.misses++;
      return null;
    }

    this.metrics.fallbackHits++;
    return entry.value;
  }

  setInMemory(key, value, ttl = this.config.defaultTTL) {
    // Enforce max size
    if (this.memoryCache.size >= this.memoryCacheMaxSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: ttl ? Date.now() + (ttl * 1000) : null
    });
  }

  /**
   * Clear all cache
   */
  async flushAll() {
    this.memoryCache.clear();

    if (this.isCircuitOpen()) {
      return true;
    }

    try {
      await this.client.flushdb();
      return true;
    } catch (error) {
      logger.error('Redis FLUSHDB error', { error: error.message });
      this.handleError(error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? (this.metrics.hits / total * 100).toFixed(2) : 0;

    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        failures: this.circuitBreaker.failures
      },
      memoryCache: {
        size: this.memoryCache.size,
        maxSize: this.memoryCacheMaxSize
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.client.ping();
      return {
        status: 'healthy',
        circuitBreaker: this.circuitBreaker.isOpen ? 'open' : 'closed'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        circuitBreaker: 'open'
      };
    }
  }

  /**
   * Shutdown
   */
  async shutdown() {
    logger.info('Shutting down Redis client');
    if (this.client) {
      await this.client.quit();
    }
    this.memoryCache.clear();
  }
}

// Singleton instance
const redisClient = new RedisClient();

module.exports = {
  RedisClient,
  redisClient
};
