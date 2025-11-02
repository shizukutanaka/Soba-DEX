/**
 * Integration Tests for Soba DEX API
 *
 * Tests the entire API flow including:
 * - Authentication
 * - User management
 * - Trading operations
 * - Order management
 * - WebSocket connections
 */

const request = require('supertest');
const assert = require('assert');

// Test configuration
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';
const TIMEOUT = 10000;

// Test data
const testUser = {
  email: `test-${Date.now()}@soba-dex.com`,
  password: 'TestPassword123!',
  username: `testuser${Date.now()}`
};

let authToken = null;
let userId = null;

// Helper function for API calls
async function apiCall(method, endpoint, data = null, token = null) {
  const req = request(BASE_URL)[method](endpoint);

  if (token) {
    req.set('Authorization', `Bearer ${token}`);
  }

  if (data) {
    req.send(data);
  }

  return req;
}

describe('Soba DEX API Integration Tests', () => {
  // Note: Jest doesn't support this.timeout() - use jest.setTimeout() in jest.config.js instead
  // or add timeout to individual tests using: test('name', async () => {}, TIMEOUT);

  describe('Health & Status', () => {
    it('should return health status', async () => {
      const response = await apiCall('get', '/api/health');
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.status, 'healthy');
    });

    it('should return API version', async () => {
      const response = await apiCall('get', '/api/version');
      assert.strictEqual(response.status, 200);
      assert.ok(response.body.version);
    });
  });

  describe('Authentication Flow', () => {
    it('should register a new user', async () => {
      const response = await apiCall('post', '/api/auth/register', {
        email: testUser.email,
        password: testUser.password,
        username: testUser.username
      });

      assert.strictEqual(response.status, 201);
      assert.ok(response.body.user);
      assert.ok(response.body.token);

      authToken = response.body.token;
      userId = response.body.user.id;
    });

    it('should not register duplicate email', async () => {
      const response = await apiCall('post', '/api/auth/register', {
        email: testUser.email,
        password: testUser.password,
        username: `${testUser.username}2`
      });

      assert.strictEqual(response.status, 409);
    });

    it('should login with correct credentials', async () => {
      const response = await apiCall('post', '/api/auth/login', {
        email: testUser.email,
        password: testUser.password
      });

      assert.strictEqual(response.status, 200);
      assert.ok(response.body.token);

      authToken = response.body.token;
    });

    it('should fail login with wrong password', async () => {
      const response = await apiCall('post', '/api/auth/login', {
        email: testUser.email,
        password: 'WrongPassword123!'
      });

      assert.strictEqual(response.status, 401);
    });

    it('should get current user with valid token', async () => {
      const response = await apiCall('get', '/api/auth/me', null, authToken);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.email, testUser.email);
    });

    it('should reject invalid token', async () => {
      const response = await apiCall('get', '/api/auth/me', null, 'invalid-token');

      assert.strictEqual(response.status, 401);
    });
  });

  describe('User Profile', () => {
    it('should get user profile', async () => {
      const response = await apiCall('get', `/api/users/${userId}`, null, authToken);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.id, userId);
    });

    it('should update user profile', async () => {
      const response = await apiCall('put', `/api/users/${userId}`, {
        displayName: 'Test User Updated'
      }, authToken);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.displayName, 'Test User Updated');
    });
  });

  describe('Trading Operations', () => {
    it('should get available trading pairs', async () => {
      const response = await apiCall('get', '/api/pairs', null, authToken);

      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(response.body));
    });

    it('should get market data for a pair', async () => {
      const response = await apiCall('get', '/api/market/ETH-USDT', null, authToken);

      assert.strictEqual(response.status, 200);
      assert.ok(response.body.price);
      assert.ok(response.body.volume);
    });

    it('should create a limit order', async () => {
      const response = await apiCall('post', '/api/orders', {
        pair: 'ETH-USDT',
        type: 'limit',
        side: 'buy',
        amount: '0.1',
        price: '2000'
      }, authToken);

      // May return 201 (created) or 400 (insufficient funds)
      assert.ok([201, 400].includes(response.status));
    });

    it('should get user orders', async () => {
      const response = await apiCall('get', '/api/orders', null, authToken);

      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(response.body));
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];

      // Make 100 rapid requests
      for (let i = 0; i < 100; i++) {
        requests.push(apiCall('get', '/api/health'));
      }

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);

      // Should have some rate limit responses
      assert.ok(tooManyRequests.length > 0, 'Rate limiting should be enforced');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await apiCall('get', '/api/nonexistent', null, authToken);

      assert.strictEqual(response.status, 404);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(BASE_URL)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      assert.strictEqual(response.status, 400);
    });

    it('should validate required fields', async () => {
      const response = await apiCall('post', '/api/orders', {
        pair: 'ETH-USDT'
        // Missing required fields
      }, authToken);

      assert.strictEqual(response.status, 400);
      assert.ok(response.body.error);
    });
  });

  describe('Security', () => {
    it('should sanitize XSS in inputs', async () => {
      const response = await apiCall('put', `/api/users/${userId}`, {
        displayName: '<script>alert("XSS")</script>'
      }, authToken);

      assert.strictEqual(response.status, 200);
      assert.ok(!response.body.displayName.includes('<script>'));
    });

    it('should prevent SQL injection', async () => {
      const response = await apiCall('get', '/api/users/1\' OR \'1\'=\'1', null, authToken);

      // Should return 404 or 400, not 200 with multiple users
      assert.ok([400, 404].includes(response.status));
    });

    it('should require authentication for protected routes', async () => {
      const response = await apiCall('get', '/api/orders');

      assert.strictEqual(response.status, 401);
    });
  });

  describe('Performance', () => {
    it('should respond to health check under 100ms', async () => {
      const start = Date.now();
      await apiCall('get', '/api/health');
      const duration = Date.now() - start;

      assert.ok(duration < 100, `Response time ${duration}ms should be < 100ms`);
    });

    it('should handle concurrent requests', async () => {
      const concurrentRequests = 50;
      const requests = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(apiCall('get', '/api/health'));
      }

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      const successCount = responses.filter(r => r.status === 200).length;

      assert.ok(successCount >= concurrentRequests * 0.95,
        'At least 95% of concurrent requests should succeed');

      console.log(`    Handled ${concurrentRequests} concurrent requests in ${duration}ms`);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain consistent user data across requests', async () => {
      const response1 = await apiCall('get', '/api/auth/me', null, authToken);
      const response2 = await apiCall('get', '/api/auth/me', null, authToken);

      assert.deepStrictEqual(response1.body, response2.body);
    });

    it('should handle race conditions in order creation', async () => {
      const orderData = {
        pair: 'ETH-USDT',
        type: 'limit',
        side: 'buy',
        amount: '0.1',
        price: '2000'
      };

      // Create two orders simultaneously
      const [order1, order2] = await Promise.all([
        apiCall('post', '/api/orders', orderData, authToken),
        apiCall('post', '/api/orders', orderData, authToken)
      ]);

      // Both should either succeed or fail consistently
      assert.strictEqual(order1.status, order2.status);
    });
  });

  describe('Cleanup', () => {
    it('should delete test user', async () => {
      const response = await apiCall('delete', `/api/users/${userId}`, null, authToken);

      // May return 204 (deleted) or 501 (not implemented)
      assert.ok([204, 501].includes(response.status));
    });
  });
});

// Export for programmatic use
module.exports = {
  testUser,
  apiCall
};
