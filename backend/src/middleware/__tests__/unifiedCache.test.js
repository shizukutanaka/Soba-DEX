const { UnifiedCacheService, createCacheMiddleware } = require('../unifiedCache');

describe('UnifiedCacheService', () => {
  let cache;

  beforeEach(() => {
    cache = new UnifiedCacheService();
  });

  afterEach(() => {
    cache.flush();
  });

  describe('Basic Operations', () => {
    test('should set and get value', () => {
      cache.set('key1', 'value1');
      const value = cache.get('key1');

      expect(value).toBe('value1');
    });

    test('should return undefined for non-existent key', () => {
      const value = cache.get('nonexistent');
      expect(value).toBeUndefined();
    });

    test('should delete value', () => {
      cache.set('key1', 'value1');
      cache.del('key1');
      const value = cache.get('key1');

      expect(value).toBeUndefined();
    });

    test('should set value with TTL', (done) => {
      cache.set('key1', 'value1', 1); // 1 second TTL

      setTimeout(() => {
        const value = cache.get('key1');
        expect(value).toBeUndefined();
        done();
      }, 1100);
    });
  });

  describe('Price Cache', () => {
    test('should set and get price', () => {
      cache.setPrice('BTC/USD', 50000);
      const price = cache.getPrice('BTC/USD');

      expect(price).toBe(50000);
    });

    test('should expire price after TTL', (done) => {
      cache.setPrice('BTC/USD', 50000, 1);

      setTimeout(() => {
        const price = cache.getPrice('BTC/USD');
        expect(price).toBeUndefined();
        done();
      }, 1100);
    });
  });

  describe('Pool Cache', () => {
    test('should set and get pool data', () => {
      const poolData = { reserve0: 1000, reserve1: 2000 };
      cache.setPool('pool1', poolData);
      const retrieved = cache.getPool('pool1');

      expect(retrieved).toEqual(poolData);
    });
  });

  describe('Stats Cache', () => {
    test('should set and get stats', () => {
      const stats = { totalVolume: 10000 };
      cache.setStats('daily', stats);
      const retrieved = cache.getStats('daily');

      expect(retrieved).toEqual(stats);
    });
  });

  describe('Flush', () => {
    test('should clear all caches', () => {
      cache.set('key1', 'value1');
      cache.setPrice('BTC/USD', 50000);
      cache.setPool('pool1', { data: 'test' });
      cache.setStats('daily', { volume: 100 });

      cache.flush();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.getPrice('BTC/USD')).toBeUndefined();
      expect(cache.getPool('pool1')).toBeUndefined();
      expect(cache.getStats('daily')).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    test('should return accurate cache statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.setPrice('BTC/USD', 50000);
      cache.setPool('pool1', {});

      const stats = cache.getStats();

      expect(stats.keys).toBe(2);
      expect(stats.priceKeys).toBe(1);
      expect(stats.poolKeys).toBe(1);
    });
  });
});

describe('createCacheMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      originalUrl: '/api/test'
    };
    res = {
      set: jest.fn(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('should skip caching for non-GET requests', () => {
    req.method = 'POST';
    const middleware = createCacheMiddleware();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.set).not.toHaveBeenCalled();
  });

  test('should return cached response on cache hit', () => {
    const middleware = createCacheMiddleware();
    const cachedData = { success: true, data: 'cached' };

    // First request - cache miss
    middleware(req, res, next);
    expect(res.set).toHaveBeenCalledWith('X-Cache', 'MISS');

    // Simulate caching
    const _originalJson = res.json;
    res.json(cachedData);

    // Second request - cache hit
    const req2 = { ...req };
    const res2 = {
      set: jest.fn(),
      json: jest.fn()
    };
    const next2 = jest.fn();

    middleware(req2, res2, next2);

    expect(res2.set).toHaveBeenCalledWith('X-Cache', 'HIT');
    expect(res2.json).toHaveBeenCalledWith(cachedData);
    expect(next2).not.toHaveBeenCalled();
  });

  test('should use custom key generator', () => {
    const keyGenerator = jest.fn((req) => `custom-${req.originalUrl}`);
    const middleware = createCacheMiddleware({ keyGenerator });

    middleware(req, res, next);

    expect(keyGenerator).toHaveBeenCalledWith(req);
  });

  test('should respect custom TTL', () => {
    const middleware = createCacheMiddleware({ ttl: 10 });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('should respect shouldCache condition', () => {
    const shouldCache = jest.fn(() => false);
    const middleware = createCacheMiddleware({ shouldCache });

    middleware(req, res, next);

    // Override json to trigger caching logic
    const _jsonOverride = res.json;
    expect(next).toHaveBeenCalled();
  });
});
