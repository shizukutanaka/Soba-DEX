/**
 * Comprehensive Testing Utilities and Helpers
 * Test data generators, mocks, and assertion helpers
 * Version: 1.0.0
 */

const crypto = require('crypto');

/**
 * Test Data Generator
 */
class TestDataGenerator {
  constructor() {
    this.sequences = new Map();
  }

  /**
   * Generate random string
   */
  randomString(length = 10, charset = 'alphanumeric') {
    const charsets = {
      alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      numeric: '0123456789',
      hex: '0123456789abcdef'
    };

    const chars = charsets[charset] || charset;
    let result = '';

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * Generate random number
   */
  randomNumber(min = 0, max = 100) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate random decimal
   */
  randomDecimal(min = 0, max = 100, decimals = 2) {
    const num = Math.random() * (max - min) + min;
    return parseFloat(num.toFixed(decimals));
  }

  /**
   * Generate random boolean
   */
  randomBoolean() {
    return Math.random() < 0.5;
  }

  /**
   * Generate random email
   */
  randomEmail(domain = 'test.com') {
    const username = this.randomString(8, 'alpha').toLowerCase();
    return `${username}@${domain}`;
  }

  /**
   * Generate random Ethereum address
   */
  randomEthereumAddress() {
    return '0x' + this.randomString(40, 'hex');
  }

  /**
   * Generate random transaction hash
   */
  randomTxHash() {
    return '0x' + this.randomString(64, 'hex');
  }

  /**
   * Generate random UUID
   */
  randomUUID() {
    return crypto.randomUUID();
  }

  /**
   * Generate sequential ID
   */
  sequentialId(namespace = 'default', prefix = '') {
    if (!this.sequences.has(namespace)) {
      this.sequences.set(namespace, 0);
    }

    const id = this.sequences.get(namespace) + 1;
    this.sequences.set(namespace, id);

    return prefix ? `${prefix}${id}` : id;
  }

  /**
   * Generate random date
   */
  randomDate(start = new Date(2020, 0, 1), end = new Date()) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  }

  /**
   * Generate timestamp
   */
  randomTimestamp(start, end) {
    const date = this.randomDate(start, end);
    return date.getTime();
  }

  /**
   * Pick random item from array
   */
  randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Pick random items from array
   */
  randomItems(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Generate mock user
   */
  mockUser(overrides = {}) {
    return {
      id: this.sequentialId('users', 'user-'),
      email: this.randomEmail(),
      username: this.randomString(8, 'alpha').toLowerCase(),
      address: this.randomEthereumAddress(),
      createdAt: this.randomDate(),
      isActive: this.randomBoolean(),
      ...overrides
    };
  }

  /**
   * Generate mock trade
   */
  mockTrade(overrides = {}) {
    const tokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WBTC'];

    return {
      id: this.sequentialId('trades', 'trade-'),
      txHash: this.randomTxHash(),
      from: this.randomEthereumAddress(),
      to: this.randomEthereumAddress(),
      tokenIn: this.randomItem(tokens),
      tokenOut: this.randomItem(tokens.filter(t => t !== overrides.tokenIn)),
      amountIn: this.randomDecimal(1, 1000, 6).toString(),
      amountOut: this.randomDecimal(1, 1000, 6).toString(),
      price: this.randomDecimal(0.1, 10, 4),
      timestamp: this.randomTimestamp(),
      status: this.randomItem(['pending', 'completed', 'failed']),
      ...overrides
    };
  }

  /**
   * Generate mock transaction
   */
  mockTransaction(overrides = {}) {
    return {
      hash: this.randomTxHash(),
      from: this.randomEthereumAddress(),
      to: this.randomEthereumAddress(),
      value: this.randomDecimal(0, 10, 18).toString(),
      gasPrice: this.randomNumber(20, 100).toString(),
      gasLimit: '21000',
      nonce: this.randomNumber(0, 1000),
      blockNumber: this.randomNumber(1000000, 2000000),
      timestamp: this.randomTimestamp(),
      status: this.randomItem(['pending', 'confirmed', 'failed']),
      ...overrides
    };
  }

  /**
   * Generate mock token
   */
  mockToken(overrides = {}) {
    return {
      address: this.randomEthereumAddress(),
      symbol: this.randomString(3, 'alpha').toUpperCase(),
      name: this.randomString(10, 'alpha'),
      decimals: 18,
      totalSupply: this.randomNumber(1000000, 1000000000).toString(),
      price: this.randomDecimal(0.1, 1000, 2),
      ...overrides
    };
  }

  /**
   * Generate array of mock data
   */
  mockArray(generator, count, overrides = {}) {
    return Array.from({ length: count }, (_, i) =>
      generator.call(this, { ...overrides, index: i })
    );
  }

  /**
   * Reset sequences
   */
  resetSequences() {
    this.sequences.clear();
  }
}

/**
 * Mock Factory
 */
class MockFactory {
  /**
   * Create mock request object
   */
  static mockRequest(options = {}) {
    return {
      method: options.method || 'GET',
      path: options.path || '/',
      url: options.url || options.path || '/',
      headers: options.headers || {},
      query: options.query || {},
      params: options.params || {},
      body: options.body || {},
      ip: options.ip || '127.0.0.1',
      user: options.user || null,
      get: function(header) {
        return this.headers[header.toLowerCase()];
      },
      ...options
    };
  }

  /**
   * Create mock response object
   */
  static mockResponse() {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.body = data;
        return this;
      },
      send: function(data) {
        this.body = data;
        return this;
      },
      setHeader: function(name, value) {
        this.headers[name] = value;
        return this;
      },
      getHeader: function(name) {
        return this.headers[name];
      }
    };

    return res;
  }

  /**
   * Create mock next function
   */
  static mockNext() {
    const next = jest.fn();
    next.error = null;
    next.called = false;

    return function(error) {
      next.called = true;
      if (error) {
        next.error = error;
      }
      next();
    };
  }

  /**
   * Create mock database
   */
  static mockDatabase() {
    const store = new Map();

    return {
      data: store,
      find: jest.fn(async (query) => {
        return Array.from(store.values()).filter(item => {
          return Object.entries(query).every(([key, value]) => item[key] === value);
        });
      }),
      findOne: jest.fn(async (query) => {
        return Array.from(store.values()).find(item => {
          return Object.entries(query).every(([key, value]) => item[key] === value);
        });
      }),
      findById: jest.fn(async (id) => {
        return store.get(id) || null;
      }),
      create: jest.fn(async (data) => {
        const id = data.id || crypto.randomUUID();
        const item = { ...data, id };
        store.set(id, item);
        return item;
      }),
      update: jest.fn(async (id, data) => {
        const existing = store.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...data };
        store.set(id, updated);
        return updated;
      }),
      delete: jest.fn(async (id) => {
        return store.delete(id);
      }),
      clear: function() {
        store.clear();
      }
    };
  }

  /**
   * Create mock cache
   */
  static mockCache() {
    const store = new Map();

    return {
      get: jest.fn(async (key) => store.get(key) || null),
      set: jest.fn(async (key, value, ttl) => {
        store.set(key, value);
        return true;
      }),
      delete: jest.fn(async (key) => store.delete(key)),
      clear: jest.fn(async () => store.clear()),
      has: jest.fn(async (key) => store.has(key)),
      size: () => store.size
    };
  }

  /**
   * Create mock logger
   */
  static mockLogger() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
  }
}

/**
 * Assertion Helpers
 */
class AssertionHelpers {
  /**
   * Assert response structure
   */
  static assertResponseStructure(response, expectedStructure) {
    expect(response).toMatchObject(expectedStructure);
  }

  /**
   * Assert successful response
   */
  static assertSuccess(response, statusCode = 200) {
    expect(response.statusCode).toBe(statusCode);
    expect(response.body).toHaveProperty('success', true);
  }

  /**
   * Assert error response
   */
  static assertError(response, statusCode = 400) {
    expect(response.statusCode).toBe(statusCode);
    expect(response.body).toHaveProperty('error');
  }

  /**
   * Assert array response
   */
  static assertArrayResponse(response, minLength = 0) {
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    if (minLength > 0) {
      expect(response.body.data.length).toBeGreaterThanOrEqual(minLength);
    }
  }

  /**
   * Assert pagination
   */
  static assertPagination(response) {
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('page');
    expect(response.body).toHaveProperty('limit');
  }

  /**
   * Assert Ethereum address
   */
  static assertEthereumAddress(address) {
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  }

  /**
   * Assert transaction hash
   */
  static assertTxHash(hash) {
    expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  }

  /**
   * Assert timestamp
   */
  static assertTimestamp(timestamp, tolerance = 60000) {
    const now = Date.now();
    expect(timestamp).toBeGreaterThan(now - tolerance);
    expect(timestamp).toBeLessThan(now + tolerance);
  }

  /**
   * Assert valid UUID
   */
  static assertUUID(uuid) {
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }
}

/**
 * Test Utilities
 */
class TestUtilities {
  /**
   * Wait for condition
   */
  static async waitFor(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await this.sleep(interval);
    }

    throw new Error('Timeout waiting for condition');
  }

  /**
   * Sleep
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Measure execution time
   */
  static async measureTime(fn) {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;

    return { result, duration };
  }

  /**
   * Retry with backoff
   */
  static async retry(fn, options = {}) {
    const {
      maxAttempts = 3,
      delay = 1000,
      backoff = 2
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          await this.sleep(delay * Math.pow(backoff, attempt - 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * Run in parallel
   */
  static async parallel(tasks) {
    return Promise.all(tasks.map(task => task()));
  }

  /**
   * Run in sequence
   */
  static async sequence(tasks) {
    const results = [];

    for (const task of tasks) {
      results.push(await task());
    }

    return results;
  }

  /**
   * Create test context
   */
  static createContext(data = {}) {
    return {
      data,
      cleanup: [],
      addCleanup: function(fn) {
        this.cleanup.push(fn);
      },
      runCleanup: async function() {
        for (const fn of this.cleanup.reverse()) {
          await fn();
        }
        this.cleanup = [];
      }
    };
  }
}

// Export all utilities
module.exports = {
  TestDataGenerator,
  MockFactory,
  AssertionHelpers,
  TestUtilities,

  // Convenience exports
  generator: new TestDataGenerator(),
  mock: MockFactory,
  assert: AssertionHelpers,
  utils: TestUtilities
};
