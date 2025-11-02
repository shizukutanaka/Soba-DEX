/**
 * Cache Core - High-Performance Caching System
 * LRU-based caching with TTL support and statistics
 */

class CacheCore {
  constructor(options = {}) {
    this.config = {
      maxSize: options.maxSize || 1000,
      defaultTTL: options.defaultTTL || 300000, // 5 minutes
      cleanupInterval: options.cleanupInterval || 60000 // 1 minute
    };

    this.cache = new Map();
    this.accessOrder = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };

    this.startCleanup();
  }

  // Set cache entry
  set(key, value, ttl = this.config.defaultTTL) {
    // Evict if at max size
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry = {
      value,
      expires: Date.now() + ttl,
      created: Date.now(),
      accessed: Date.now(),
      hits: 0
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, Date.now());
    this.stats.sets++;

    return true;
  }

  // Get cache entry
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expires) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access info
    entry.accessed = Date.now();
    entry.hits++;
    this.accessOrder.set(key, Date.now());
    this.stats.hits++;

    return entry.value;
  }

  // Check if key exists
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expires) {
      this.delete(key);
      return false;
    }

    return true;
  }

  // Delete cache entry
  delete(key) {
    const existed = this.cache.delete(key);
    this.accessOrder.delete(key);

    if (existed) {
      this.stats.deletes++;
    }

    return existed;
  }

  // Clear all cache
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.stats.deletes += size;

    return size;
  }

  // Evict least recently used entry
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
      return oldestKey;
    }

    return null;
  }

  // Delete entries matching pattern
  deletePattern(pattern) {
    const regex = new RegExp(pattern);
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.delete(key);
        count++;
      }
    }

    return count;
  }

  // Clean expired entries
  cleanExpired() {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.delete(key);
        count++;
      }
    }

    return count;
  }

  // Start automatic cleanup
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanExpired();
      if (cleaned > 0) {
        console.log(`[Cache] Cleaned ${cleaned} expired entries`);
      }
    }, this.config.cleanupInterval);
  }

  // Stop automatic cleanup
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // Get cache statistics
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      usage: ((this.cache.size / this.config.maxSize) * 100).toFixed(2) + '%',
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: hitRate + '%',
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      evictions: this.stats.evictions
    };
  }

  // Get cache info
  getInfo() {
    const entries = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        size: JSON.stringify(entry.value).length,
        ttl: Math.max(0, entry.expires - Date.now()),
        age: Date.now() - entry.created,
        hits: entry.hits,
        lastAccessed: Date.now() - entry.accessed
      });
    }

    // Sort by hits (most popular first)
    entries.sort((a, b) => b.hits - a.hits);

    return {
      entries: entries.slice(0, 20), // Top 20
      total: this.cache.size,
      stats: this.getStats()
    };
  }

  // Express middleware
  createMiddleware(options = {}) {
    const {
      ttl = this.config.defaultTTL,
      keyGenerator = (req) => req.originalUrl,
      condition = (req) => req.method === 'GET'
    } = options;

    return (req, res, next) => {
      // Check condition
      if (!condition(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const cached = this.get(key);

      // Return cached response
      if (cached) {
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', key);
        return res.json(cached);
      }

      // Override res.json to cache response
      const originalJson = res.json.bind(res);

      res.json = (data) => {
        // Cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this.set(key, data, ttl);
        }

        res.set('X-Cache', 'MISS');
        res.set('X-Cache-Key', key);
        return originalJson(data);
      };

      next();
    };
  }

  // Warmup cache with data
  warmup(data) {
    let count = 0;

    for (const [key, value] of Object.entries(data)) {
      this.set(key, value);
      count++;
    }

    return count;
  }

  // Export cache data
  export() {
    const data = {};

    for (const [key, entry] of this.cache.entries()) {
      data[key] = {
        value: entry.value,
        ttl: Math.max(0, entry.expires - Date.now())
      };
    }

    return data;
  }

  // Import cache data
  import(data) {
    let count = 0;

    for (const [key, item] of Object.entries(data)) {
      if (item.value !== undefined) {
        this.set(key, item.value, item.ttl || this.config.defaultTTL);
        count++;
      }
    }

    return count;
  }

  // Reset statistics
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
  }
}

module.exports = CacheCore;