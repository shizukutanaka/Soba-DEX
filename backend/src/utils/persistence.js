const fs = require('fs').promises;
const path = require('path');

class LightweightPersistence {
  constructor(options = {}) {
    this.dataDir = options.dataDir || './data';
    this.enableCompression = options.enableCompression || false;
    this.enableEncryption = options.enableEncryption || false;
    this.encryptionKey = options.encryptionKey || null;
    this.cache = new Map();
    this.syncInterval = options.syncInterval || 5000;
    this.maxCacheSize = options.maxCacheSize || 1000;
    this.isDirty = new Set();

    this.initializeStorage();
    this.startAutoSync();
  }

  async initializeStorage() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize storage:', error);
    }
  }

  // Key-value storage
  async set(collection, key, value, options = {}) {
    const { persist = true, ttl = null } = options;

    const collectionCache = this.getCollectionCache(collection);
    const item = {
      value,
      timestamp: Date.now(),
      ttl: ttl ? Date.now() + ttl : null
    };

    collectionCache.set(key, item);

    if (persist) {
      this.isDirty.add(collection);
    }

    this.enforceMaxCacheSize(collection);
    return true;
  }

  async get(collection, key, defaultValue = null) {
    const collectionCache = this.getCollectionCache(collection);

    if (collectionCache.has(key)) {
      const item = collectionCache.get(key);

      // Check TTL
      if (item.ttl && Date.now() > item.ttl) {
        collectionCache.delete(key);
        return defaultValue;
      }

      return item.value;
    }

    // Try to load from disk
    try {
      await this.loadCollection(collection);
      if (collectionCache.has(key)) {
        const item = collectionCache.get(key);
        return item.ttl && Date.now() > item.ttl ? defaultValue : item.value;
      }
    } catch (error) {
      console.warn(`Failed to load collection ${collection}:`, error.message);
    }

    return defaultValue;
  }

  async delete(collection, key) {
    const collectionCache = this.getCollectionCache(collection);
    const deleted = collectionCache.delete(key);

    if (deleted) {
      this.isDirty.add(collection);
    }

    return deleted;
  }

  async has(collection, key) {
    const value = await this.get(collection, key);
    return value !== null;
  }

  async keys(collection) {
    const collectionCache = this.getCollectionCache(collection);
    await this.loadCollection(collection);

    const validKeys = [];
    const now = Date.now();

    for (const [key, item] of collectionCache) {
      if (!item.ttl || now <= item.ttl) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  async size(collection) {
    const keys = await this.keys(collection);
    return keys.length;
  }

  async clear(collection) {
    const collectionCache = this.getCollectionCache(collection);
    collectionCache.clear();
    this.isDirty.add(collection);

    // Also remove from disk
    try {
      const filePath = this.getCollectionPath(collection);
      await fs.unlink(filePath);
    } catch (_error) {
      // File might not exist, ignore
    }

    return true;
  }

  // Collection management
  getCollectionCache(collection) {
    if (!this.cache.has(collection)) {
      this.cache.set(collection, new Map());
    }
    return this.cache.get(collection);
  }

  getCollectionPath(collection) {
    return path.join(this.dataDir, `${collection}.json`);
  }

  async loadCollection(collection) {
    if (this.cache.has(collection)) {
      return; // Already loaded
    }

    try {
      const filePath = this.getCollectionPath(collection);
      let data = await fs.readFile(filePath, 'utf8');

      if (this.enableEncryption && this.encryptionKey) {
        data = this.decrypt(data);
      }

      if (this.enableCompression) {
        data = this.decompress(data);
      }

      const items = JSON.parse(data);
      const collectionCache = this.getCollectionCache(collection);

      for (const [key, item] of Object.entries(items)) {
        collectionCache.set(key, item);
      }
    } catch (_error) {
      // Collection doesn't exist or is corrupted, start fresh
      this.getCollectionCache(collection);
    }
  }

  async saveCollection(collection) {
    try {
      const collectionCache = this.getCollectionCache(collection);
      const items = {};
      const now = Date.now();

      // Filter out expired items
      for (const [key, item] of collectionCache) {
        if (!item.ttl || now <= item.ttl) {
          items[key] = item;
        }
      }

      let data = JSON.stringify(items);

      if (this.enableCompression) {
        data = this.compress(data);
      }

      if (this.enableEncryption && this.encryptionKey) {
        data = this.encrypt(data);
      }

      const filePath = this.getCollectionPath(collection);
      await fs.writeFile(filePath, data);

      this.isDirty.delete(collection);
      return true;
    } catch (error) {
      console.error(`Failed to save collection ${collection}:`, error);
      return false;
    }
  }

  // Batch operations
  async batch(collection, operations) {
    const results = [];

    for (const op of operations) {
      try {
        let result;
        switch (op.type) {
        case 'set':
          result = await this.set(collection, op.key, op.value, {
            persist: false
          });
          break;
        case 'get':
          result = await this.get(collection, op.key, op.defaultValue);
          break;
        case 'delete':
          result = await this.delete(collection, op.key);
          break;
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
        }
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    // Mark as dirty to persist changes
    this.isDirty.add(collection);
    return results;
  }

  // Query operations
  async find(collection, predicate) {
    await this.loadCollection(collection);
    const collectionCache = this.getCollectionCache(collection);
    const results = [];
    const now = Date.now();

    for (const [key, item] of collectionCache) {
      if (item.ttl && now > item.ttl) {
        continue;
      }

      if (predicate(item.value, key)) {
        results.push({ key, value: item.value });
      }
    }

    return results;
  }

  async findOne(collection, predicate) {
    const results = await this.find(collection, predicate);
    return results.length > 0 ? results[0] : null;
  }

  async count(collection, predicate = null) {
    if (!predicate) {
      return await this.size(collection);
    }

    const results = await this.find(collection, predicate);
    return results.length;
  }

  // Auto-sync and cleanup
  startAutoSync() {
    setInterval(async () => {
      await this.syncAll();
    }, this.syncInterval);
  }

  async syncAll() {
    const promises = [];
    for (const collection of this.isDirty) {
      promises.push(this.saveCollection(collection));
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    // Cleanup expired items
    this.cleanupExpired();
  }

  cleanupExpired() {
    const now = Date.now();

    for (const [collection, collectionCache] of this.cache) {
      const expiredKeys = [];

      for (const [key, item] of collectionCache) {
        if (item.ttl && now > item.ttl) {
          expiredKeys.push(key);
        }
      }

      if (expiredKeys.length > 0) {
        expiredKeys.forEach(key => collectionCache.delete(key));
        this.isDirty.add(collection);
      }
    }
  }

  enforceMaxCacheSize(collection) {
    const collectionCache = this.getCollectionCache(collection);

    if (collectionCache.size > this.maxCacheSize) {
      // Remove oldest items (LRU-like behavior)
      const entries = Array.from(collectionCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
      toRemove.forEach(([key]) => collectionCache.delete(key));

      this.isDirty.add(collection);
    }
  }

  // Compression (simple Base64 for demonstration)
  compress(data) {
    return Buffer.from(data, 'utf8').toString('base64');
  }

  decompress(data) {
    return Buffer.from(data, 'base64').toString('utf8');
  }

  // Encryption (simple XOR for demonstration)
  encrypt(data) {
    if (!this.encryptionKey) {
      return data;
    }

    let result = '';
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(
        data.charCodeAt(i) ^
          this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
      );
    }
    return Buffer.from(result, 'binary').toString('base64');
  }

  decrypt(data) {
    if (!this.encryptionKey) {
      return data;
    }

    const binary = Buffer.from(data, 'base64').toString('binary');
    let result = '';
    for (let i = 0; i < binary.length; i++) {
      result += String.fromCharCode(
        binary.charCodeAt(i) ^
          this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
      );
    }
    return result;
  }

  // Statistics and monitoring
  getStats() {
    const stats = {
      collections: this.cache.size,
      totalItems: 0,
      dirtyCollections: this.isDirty.size,
      memoryUsage: process.memoryUsage().heapUsed
    };

    for (const collectionCache of this.cache.values()) {
      stats.totalItems += collectionCache.size;
    }

    return stats;
  }

  async getCollectionStats(collection) {
    await this.loadCollection(collection);
    const collectionCache = this.getCollectionCache(collection);
    const now = Date.now();

    let expired = 0;
    let active = 0;

    for (const item of collectionCache.values()) {
      if (item.ttl && now > item.ttl) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: collectionCache.size,
      active,
      expired,
      isDirty: this.isDirty.has(collection)
    };
  }

  // Manual operations
  async forceSync() {
    return await this.syncAll();
  }

  async backup(backupPath) {
    await this.syncAll();

    const backup = {
      timestamp: Date.now(),
      collections: {}
    };

    for (const collection of this.cache.keys()) {
      const filePath = this.getCollectionPath(collection);
      try {
        backup.collections[collection] = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        console.warn(
          `Failed to backup collection ${collection}:`,
          error.message
        );
      }
    }

    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
    return true;
  }

  async restore(backupPath) {
    try {
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));

      for (const [collection, data] of Object.entries(backupData.collections)) {
        const filePath = this.getCollectionPath(collection);
        await fs.writeFile(filePath, data);
      }

      // Clear cache to force reload
      this.cache.clear();
      this.isDirty.clear();

      return true;
    } catch (error) {
      console.error('Failed to restore backup:', error);
      return false;
    }
  }

  // Cleanup
  async close() {
    await this.syncAll();
  }
}

// Create default instance
const persistence = new LightweightPersistence({
  dataDir: process.env.DATA_DIR || './data',
  enableCompression: process.env.ENABLE_COMPRESSION === 'true',
  enableEncryption: process.env.ENABLE_ENCRYPTION === 'true',
  encryptionKey: process.env.ENCRYPTION_KEY
});

module.exports = {
  LightweightPersistence,
  persistence
};
