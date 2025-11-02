// SAND Memory Pool Manager - Optimized memory allocation
class MemoryPool {
  constructor(options = {}) {
    this.pools = new Map();
    this.maxPoolSize = options.maxPoolSize || 100;
    this.maxObjectSize = options.maxObjectSize || 1024 * 10; // 10KB
    this.gcInterval = options.gcInterval || 60000;
    this.stats = {
      allocations: 0,
      deallocations: 0,
      reuses: 0,
      gcRuns: 0
    };

    this.startGC();
  }

  // Get object from pool or create new
  acquire(type, factory) {
    const pool = this.pools.get(type) || [];
    this.stats.allocations++;

    if (pool.length > 0) {
      this.stats.reuses++;
      return pool.pop();
    }

    return factory ? factory() : {};
  }

  // Return object to pool
  release(type, obj) {
    if (!obj || this.getObjectSize(obj) > this.maxObjectSize) {
      return;
    }

    let pool = this.pools.get(type);
    if (!pool) {
      pool = [];
      this.pools.set(type, pool);
    }

    if (pool.length < this.maxPoolSize) {
      this.reset(obj);
      pool.push(obj);
      this.stats.deallocations++;
    }
  }

  // Reset object properties
  reset(obj) {
    if (Array.isArray(obj)) {
      obj.length = 0;
    } else if (obj instanceof Map || obj instanceof Set) {
      obj.clear();
    } else if (typeof obj === 'object') {
      for (const key in obj) {
        delete obj[key];
      }
    }
    return obj;
  }

  // Estimate object size
  getObjectSize(obj) {
    const seen = new WeakSet();
    const calculate = (o) => {
      if (o === null || o === undefined) {
        return 0;
      }
      if (typeof o !== 'object') {
        return 8;
      }
      if (seen.has(o)) {
        return 0;
      }
      seen.add(o);

      let size = 0;
      if (Array.isArray(o)) {
        size = o.length * 8;
        o.forEach(item => size += calculate(item));
      } else {
        for (const key in o) {
          size += key.length * 2 + calculate(o[key]);
        }
      }
      return size;
    };

    return calculate(obj);
  }

  // Clear specific pool
  clearPool(type) {
    const pool = this.pools.get(type);
    if (pool) {
      pool.length = 0;
      this.pools.delete(type);
    }
  }

  // Clear all pools
  clearAll() {
    this.pools.clear();
  }

  // Get pool statistics
  getStats() {
    const poolStats = {};
    this.pools.forEach((pool, type) => {
      poolStats[type] = pool.length;
    });

    return {
      ...this.stats,
      pools: poolStats,
      totalPooled: Array.from(this.pools.values()).reduce((sum, pool) => sum + pool.length, 0),
      reuseRate: this.stats.allocations > 0
        ? ((this.stats.reuses / this.stats.allocations) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  // Garbage collection
  gc() {
    this.stats.gcRuns++;

    // Remove empty pools
    for (const [type, pool] of this.pools.entries()) {
      if (pool.length === 0) {
        this.pools.delete(type);
      }
    }

    // Trim oversized pools
    this.pools.forEach(pool => {
      if (pool.length > this.maxPoolSize) {
        pool.splice(0, pool.length - this.maxPoolSize);
      }
    });

    // Force Node.js garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  // Start automatic garbage collection
  startGC() {
    this.gcTimer = setInterval(() => this.gc(), this.gcInterval);
  }

  // Stop automatic garbage collection
  stopGC() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  // Destroy pool manager
  destroy() {
    this.stopGC();
    this.clearAll();
  }
}

// Buffer Pool for binary data
class BufferPool {
  constructor(bufferSize = 1024, maxBuffers = 50) {
    this.bufferSize = bufferSize;
    this.maxBuffers = maxBuffers;
    this.available = [];
    this.inUse = new Set();
  }

  acquire() {
    let buffer;

    if (this.available.length > 0) {
      buffer = this.available.pop();
    } else if (this.inUse.size < this.maxBuffers) {
      buffer = Buffer.allocUnsafe(this.bufferSize);
    } else {
      throw new Error('Buffer pool exhausted');
    }

    this.inUse.add(buffer);
    return buffer;
  }

  release(buffer) {
    if (this.inUse.has(buffer)) {
      this.inUse.delete(buffer);
      buffer.fill(0); // Clear buffer
      this.available.push(buffer);
    }
  }

  resize(newSize) {
    if (newSize !== this.bufferSize) {
      this.available = [];
      this.bufferSize = newSize;
    }
  }

  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.available.length + this.inUse.size,
      bufferSize: this.bufferSize
    };
  }
}

// Connection Pool
class ConnectionPool {
  constructor(options = {}) {
    this.min = options.min || 2;
    this.max = options.max || 10;
    this.idleTimeout = options.idleTimeout || 30000;
    this.connections = [];
    this.active = new Set();
    this.waiting = [];
  }

  async acquire() {
    // Return existing idle connection
    const idle = this.connections.find(c => !this.active.has(c) && c.isAlive());
    if (idle) {
      this.active.add(idle);
      idle.lastUsed = Date.now();
      return idle;
    }

    // Create new connection if under limit
    if (this.connections.length < this.max) {
      const conn = await this.createConnection();
      this.connections.push(conn);
      this.active.add(conn);
      return conn;
    }

    // Wait for available connection
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(connection) {
    this.active.delete(connection);

    // Fulfill waiting request
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      this.active.add(connection);
      resolve(connection);
    }

    // Check idle timeout
    setTimeout(() => {
      if (!this.active.has(connection) &&
          Date.now() - connection.lastUsed > this.idleTimeout &&
          this.connections.length > this.min) {
        this.removeConnection(connection);
      }
    }, this.idleTimeout);
  }

  createConnection() {
    // Simulate connection creation
    return Promise.resolve({
      id: Math.random().toString(36).substr(2, 9),
      created: Date.now(),
      lastUsed: Date.now(),
      isAlive: () => true,
      close: () => {}
    });
  }

  removeConnection(connection) {
    const index = this.connections.indexOf(connection);
    if (index !== -1) {
      this.connections.splice(index, 1);
      connection.close();
    }
  }

  getStats() {
    return {
      total: this.connections.length,
      active: this.active.size,
      idle: this.connections.length - this.active.size,
      waiting: this.waiting.length
    };
  }

  async drain() {
    for (const conn of this.connections) {
      conn.close();
    }
    this.connections = [];
    this.active.clear();
    this.waiting = [];
  }
}

module.exports = {
  MemoryPool,
  BufferPool,
  ConnectionPool
};