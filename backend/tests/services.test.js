/**
 * DEX Platform - サービス層テストスイート
 * 軽量で効率的なテスト設計
 */

const { expect } = require('chai');
const sinon = require('sinon');
const redisCache = require('../src/services/redisCache'); // Import singleton instance
const RateLimiterService = require('../src/middleware/rateLimiter');

describe('Service Layer Tests', () => {

  describe('RedisCache Service', () => {
    let cache;
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      cache = redisCache; // Use singleton instance, not constructor
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should initialize with fallback cache', async () => {
      expect(cache.enabled).to.be.false;
      expect(cache.fallbackCache).to.be.instanceOf(Map);
      expect(cache.stats.hits).to.equal(0);
    });

    it('should cache and retrieve data', async () => {
      const testData = { symbol: 'BTC', price: 50000 };

      await cache.set('test-key', testData, 300);
      const result = await cache.get('test-key');

      expect(result).to.deep.equal(testData);
      expect(cache.stats.hits).to.equal(1);
    });

    it('should handle cache misses', async () => {
      const result = await cache.get('nonexistent-key');

      expect(result).to.be.null;
      expect(cache.stats.misses).to.equal(1);
    });

    it('should delete cached data', async () => {
      const testData = { symbol: 'BTC', price: 50000 };

      await cache.set('test-key', testData);
      await cache.del('test-key'); // Method is 'del', not 'delete'

      const result = await cache.get('test-key');
      expect(result).to.be.null;
    });

    it('should clear all cache data', async () => {
      await cache.set('key1', 'data1');
      await cache.set('key2', 'data2');

      await cache.clear();

      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');

      expect(result1).to.be.null;
      expect(result2).to.be.null;
    });
  });

  describe('Rate Limiter Service', () => {
    let rateLimiter;
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      rateLimiter = new RateLimiterService();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should create API limiter', () => {
      const limiter = rateLimiter.getApiLimiter();

      expect(limiter).to.exist;
      expect(limiter.windowMs).to.equal(15 * 60 * 1000);
      expect(limiter.max).to.equal(100);
    });

    it('should create trading limiter', () => {
      const limiter = rateLimiter.getTradingLimiter();

      expect(limiter).to.exist;
      expect(limiter.windowMs).to.equal(1 * 60 * 1000);
      expect(limiter.max).to.equal(10);
    });

    it('should create auth limiter', () => {
      const limiter = rateLimiter.getAuthLimiter();

      expect(limiter).to.exist;
      expect(limiter.windowMs).to.equal(15 * 60 * 1000);
      expect(limiter.max).to.equal(5);
    });

    it('should create user tier limiters', () => {
      const basicLimiter = rateLimiter.getUserTierLimiter('basic');
      const premiumLimiter = rateLimiter.getUserTierLimiter('premium');
      const enterpriseLimiter = rateLimiter.getUserTierLimiter('enterprise');

      expect(basicLimiter.max).to.equal(100);
      expect(premiumLimiter.max).to.equal(500);
      expect(enterpriseLimiter.max).to.equal(2000);
    });

    it('should handle rate limit status', async () => {
      const status = await rateLimiter.getRateLimitStatus('api', 'test-ip');
      expect(status).to.be.null; // Redis not available in test
    });
  });

  describe('Price Feed Service', () => {
    let priceFeed;
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      priceFeed = require('../src/services/priceFeed');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should get price data', async () => {
      const price = await priceFeed.getPrice('BTC');
      expect(price).to.have.property('symbol', 'BTC');
      expect(price).to.have.property('price');
      expect(price).to.have.property('timestamp');
    });

    it('should get multiple prices', async () => {
      const prices = await priceFeed.getPrices(['BTC', 'ETH']);
      expect(prices).to.be.an('array');
      expect(prices).to.have.length(2);
    });

    it('should handle price updates', (done) => {
      const mockCallback = sandbox.spy();

      priceFeed.subscribe('BTC', mockCallback);

      // Simulate price update
      setTimeout(() => {
        expect(mockCallback.called).to.be.true;
        priceFeed.unsubscribe('BTC', mockCallback);
        done();
      }, 100);
    });
  });

  describe('Order Matching Service', () => {
    let orderMatching;
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      orderMatching = require('../src/services/orderMatching');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should match buy and sell orders', async () => {
      const buyOrder = {
        id: 'buy-1',
        type: 'limit',
        side: 'buy',
        symbol: 'BTC/USDT',
        quantity: 1,
        price: 50000
      };

      const sellOrder = {
        id: 'sell-1',
        type: 'limit',
        side: 'sell',
        symbol: 'BTC/USDT',
        quantity: 1,
        price: 50000
      };

      const result = await orderMatching.matchOrders(buyOrder, sellOrder);

      expect(result).to.have.property('matched', true);
      expect(result).to.have.property('price', 50000);
      expect(result).to.have.property('quantity', 1);
    });

    it('should handle partial order matching', async () => {
      const buyOrder = {
        id: 'buy-2',
        type: 'limit',
        side: 'buy',
        symbol: 'BTC/USDT',
        quantity: 2,
        price: 50000
      };

      const sellOrder = {
        id: 'sell-2',
        type: 'limit',
        side: 'sell',
        symbol: 'BTC/USDT',
        quantity: 1,
        price: 50000
      };

      const result = await orderMatching.matchOrders(buyOrder, sellOrder);

      expect(result).to.have.property('matched', true);
      expect(result).to.have.property('quantity', 1);
      expect(result).to.have.property('remaining', 1);
    });
  });

  describe('Validation Service', () => {
    let validation;
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      validation = require('../src/services/validation');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should validate order data', async () => {
      const validOrder = {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        quantity: 1,
        price: 50000
      };

      const result = await validation.validateOrder(validOrder);
      expect(result).to.have.property('valid', true);
    });

    it('should reject invalid order data', async () => {
      const invalidOrder = {
        symbol: 'INVALID',
        side: 'invalid',
        quantity: -1,
        price: 0
      };

      const result = await validation.validateOrder(invalidOrder);
      expect(result).to.have.property('valid', false);
      expect(result).to.have.property('errors');
    });

    it('should validate swap data', async () => {
      const validSwap = {
        fromToken: 'BTC',
        toToken: 'ETH',
        amount: 0.001,
        minAmountOut: 0.0001
      };

      const result = await validation.validateSwap(validSwap);
      expect(result).to.have.property('valid', true);
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent requests', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          request('http://localhost:3001')
            .get('/api/health')
        );
      }

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.status).to.equal(200);
      });
    });

    it('should handle memory usage efficiently', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform memory-intensive operations
      for (let i = 0; i < 1000; i++) {
        const data = { id: i, data: 'x'.repeat(1000) };
        global.testCache = global.testCache || new Map();
        global.testCache.set(i, data);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable
      expect(memoryIncrease).to.be.below(50 * 1024 * 1024); // 50MB limit
    });
  });
});
