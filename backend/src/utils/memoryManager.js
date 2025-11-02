/**
 * Memory Manager
 * Aggressive memory optimization and garbage collection
 */

const { EventEmitter } = require('events');

class MemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      gcInterval: 30000, // 30 seconds
      memoryThreshold: 0.85, // 85% of heap
      cleanupThreshold: 0.75, // 75% of heap
      maxHeapSize: 1024 * 1024 * 1024, // 1GB default
      enableAutoCleanup: true,
      enableGC: true,
      ...options
    };

    this.pools = new Map(); // Object pools
    this.watchers = new Set(); // Memory watchers
    this.gcTimer = null;
    this.stats = {
      gcCalls: 0,
      cleanupCalls: 0,
      memoryFreed: 0,
      peakUsage: 0
    };

    this.startMonitoring();
  }

  // Start memory monitoring
  startMonitoring() {
    this.gcTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, this.options.gcInterval);

    // Track peak usage
    this.updatePeakUsage();
  }

  // Check memory usage and trigger cleanup if needed
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed;
    const heapTotal = usage.heapTotal;
    const usageRatio = heapUsed / heapTotal;

    // Update peak usage
    if (heapUsed > this.stats.peakUsage) {
      this.stats.peakUsage = heapUsed;
    }

    // Trigger cleanup if threshold exceeded
    if (usageRatio > this.options.cleanupThreshold) {
      this.performCleanup();
    }

    // Force GC if critical threshold exceeded
    if (usageRatio > this.options.memoryThreshold) {
      this.forceGC();
    }

    // Emit memory usage event
    this.emit('memoryUsage', {
      heapUsed,
      heapTotal,
      usageRatio,
      rss: usage.rss,
      external: usage.external
    });
  }

  // Perform cleanup operations
  performCleanup() {
    const beforeCleanup = process.memoryUsage().heapUsed;

    // Clear object pools
    this.clearPools();

    // Notify watchers to cleanup
    for (const watcher of this.watchers) {
      try {
        if (typeof watcher.cleanup === 'function') {
          watcher.cleanup();
        }
      } catch (error) {
        console.error('Cleanup watcher failed:', error);
      }
    }

    const afterCleanup = process.memoryUsage().heapUsed;
    const freed = beforeCleanup - afterCleanup;

    this.stats.cleanupCalls++;
    this.stats.memoryFreed += Math.max(0, freed);

    console.log(`🧹 Memory cleanup: freed ${this.formatBytes(freed)}`);

    this.emit('cleanup', { freed, before: beforeCleanup, after: afterCleanup });
  }

  // Force garbage collection
  forceGC() {
    if (!this.options.enableGC || typeof global.gc !== 'function') {
      return;
    }

    const beforeGC = process.memoryUsage().heapUsed;

    try {
      global.gc();
      this.stats.gcCalls++;

      const afterGC = process.memoryUsage().heapUsed;
      const freed = beforeGC - afterGC;

      console.log(`🗑️ Forced GC: freed ${this.formatBytes(freed)}`);

      this.emit('gc', { freed, before: beforeGC, after: afterGC });
    } catch (error) {
      console.error('Forced GC failed:', error);
    }
  }

  // Object pool management
  createPool(name, factory, maxSize = 100) {
    const pool = {
      factory,
      maxSize,
      available: [],
      inUse: new Set(),
      created: 0,
      reused: 0
    };

    this.pools.set(name, pool);
    return pool;
  }

  // Get object from pool
  getFromPool(name) {
    const pool = this.pools.get(name);
    if (!pool) {
      return null;
    }

    let obj;
    if (pool.available.length > 0) {
      obj = pool.available.pop();
      pool.reused++;
    } else {
      obj = pool.factory();
      pool.created++;
    }

    pool.inUse.add(obj);
    return obj;
  }

  // Return object to pool
  returnToPool(name, obj) {
    const pool = this.pools.get(name);
    if (!pool || !pool.inUse.has(obj)) {
      return;
    }

    pool.inUse.delete(obj);

    if (pool.available.length < pool.maxSize) {
      // Reset object state if it has a reset method
      if (typeof obj.reset === 'function') {
        obj.reset();
      }
      pool.available.push(obj);
    }
  }

  // Clear all pools
  clearPools() {
    for (const [_name, pool] of this.pools) {
      pool.available.length = 0;
      pool.inUse.clear();
    }
  }

  // Memory watcher registration
  addWatcher(watcher) {
    this.watchers.add(watcher);
  }

  removeWatcher(watcher) {
    this.watchers.delete(watcher);
  }

  // Create circular buffer for memory-efficient storage
  createCircularBuffer(size) {
    return {
      buffer: new Array(size),
      size,
      index: 0,
      count: 0,

      push(item) {
        this.buffer[this.index] = item;
        this.index = (this.index + 1) % this.size;
        if (this.count < this.size) {
          this.count++;
        }
      },

      get(offset = 0) {
        if (offset >= this.count) {
          return undefined;
        }
        const idx = (this.index - 1 - offset + this.size) % this.size;
        return this.buffer[idx];
      },

      toArray() {
        if (this.count < this.size) {
          return this.buffer.slice(0, this.count);
        }
        const result = new Array(this.size);
        for (let i = 0; i < this.size; i++) {
          result[i] = this.buffer[(this.index + i) % this.size];
        }
        return result;
      },

      clear() {
        this.buffer.fill(undefined);
        this.index = 0;
        this.count = 0;
      }
    };
  }

  // Weak reference storage for automatic cleanup
  createWeakStorage() {
    const storage = new Map();
    const cleanup = new Set();

    return {
      set(key, value) {
        // Use WeakRef for automatic cleanup
        const ref = new WeakRef(value);
        storage.set(key, ref);

        // Schedule cleanup check
        cleanup.add(key);
      },

      get(key) {
        const ref = storage.get(key);
        if (!ref) {
          return undefined;
        }

        const value = ref.deref();
        if (value === undefined) {
          storage.delete(key);
          cleanup.delete(key);
        }
        return value;
      },

      cleanup() {
        for (const key of cleanup) {
          const ref = storage.get(key);
          if (ref && ref.deref() === undefined) {
            storage.delete(key);
            cleanup.delete(key);
          }
        }
      },

      size() {
        return storage.size;
      }
    };
  }

  // Memory-efficient string interning
  createStringIntern() {
    const cache = new Map();

    return {
      intern(str) {
        if (typeof str !== 'string') {
          return str;
        }

        let cached = cache.get(str);
        if (!cached) {
          cached = str;
          cache.set(str, cached);

          // Prevent cache from growing too large
          if (cache.size > 10000) {
            const keys = Array.from(cache.keys());
            const toDelete = keys.slice(0, 1000); // Remove oldest 1000
            toDelete.forEach(key => cache.delete(key));
          }
        }
        return cached;
      },

      size() {
        return cache.size;
      },

      clear() {
        cache.clear();
      }
    };
  }

  // Get current memory usage
  getMemoryUsage() {
    const usage = process.memoryUsage();
    const v8Usage = require('v8').getHeapStatistics();

    return {
      heap: {
        used: usage.heapUsed,
        total: usage.heapTotal,
        usage: (usage.heapUsed / usage.heapTotal * 100).toFixed(2) + '%'
      },
      rss: usage.rss,
      external: usage.external,
      v8: {
        totalHeapSize: v8Usage.total_heap_size,
        totalHeapSizeExecutable: v8Usage.total_heap_size_executable,
        totalPhysicalSize: v8Usage.total_physical_size,
        totalAvailableSize: v8Usage.total_available_size,
        usedHeapSize: v8Usage.used_heap_size,
        heapSizeLimit: v8Usage.heap_size_limit
      }
    };
  }

  // Get memory statistics
  getStats() {
    const usage = this.getMemoryUsage();

    return {
      current: usage,
      stats: {
        ...this.stats,
        peakUsage: this.formatBytes(this.stats.peakUsage),
        memoryFreed: this.formatBytes(this.stats.memoryFreed)
      },
      pools: this.getPoolStats(),
      watchers: this.watchers.size
    };
  }

  // Get pool statistics
  getPoolStats() {
    const stats = {};
    for (const [name, pool] of this.pools) {
      stats[name] = {
        available: pool.available.length,
        inUse: pool.inUse.size,
        created: pool.created,
        reused: pool.reused,
        reuseRate: pool.created > 0
          ? ((pool.reused / (pool.created + pool.reused)) * 100).toFixed(2) + '%'
          : '0%'
      };
    }
    return stats;
  }

  // Update peak usage tracking
  updatePeakUsage() {
    setInterval(() => {
      const current = process.memoryUsage().heapUsed;
      if (current > this.stats.peakUsage) {
        this.stats.peakUsage = current;
      }
    }, 5000); // Check every 5 seconds
  }

  // Format bytes for display
  formatBytes(bytes) {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Health check
  healthCheck() {
    const usage = this.getMemoryUsage();
    const heapUsageRatio = usage.heap.used / usage.heap.total;

    let status = 'healthy';
    if (heapUsageRatio > this.options.memoryThreshold) {
      status = 'critical';
    } else if (heapUsageRatio > this.options.cleanupThreshold) {
      status = 'warning';
    }

    return {
      status,
      heapUsage: usage.heap.usage,
      rss: this.formatBytes(usage.rss),
      gcCalls: this.stats.gcCalls,
      cleanupCalls: this.stats.cleanupCalls
    };
  }

  // Shutdown cleanup
  shutdown() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
    }

    this.clearPools();
    this.watchers.clear();

    // Final cleanup
    this.performCleanup();
    this.forceGC();

    console.log('🛑 Memory manager shutdown complete');
  }
}

// Create singleton instance
const memoryManager = new MemoryManager();

module.exports = {
  MemoryManager,
  memoryManager
};