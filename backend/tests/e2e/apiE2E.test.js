// ============================================================================
// API End-to-End Tests
// Complete API workflow testing
// ============================================================================

const axios = require('axios');
const { expect } = require('chai');

describe('API E2E Tests', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
  let authToken;
  let testUserId;

  before(async () => {
    await waitForSystem();
  });

  describe('Authentication Flow', () => {
    it('should register new user', async () => {
      const userData = {
        username: `testuser_${Date.now()}`,
        email: `test${Date.now()}@example.com`,
        password: 'TestPass123!'
      };

      const response = await axios.post(`${BASE_URL}/api/auth/register`, userData);
      expect(response.status).to.equal(201);
      expect(response.data).to.have.property('userId');
      testUserId = response.data.userId;
    });

    it('should login user', async () => {
      const loginData = {
        username: `testuser_${Date.now()}`,
        password: 'TestPass123!'
      };

      const response = await axios.post(`${BASE_URL}/api/auth/login`, loginData);
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('token');
      authToken = response.data.token;
    });

    it('should access protected route with token', async () => {
      const response = await axios.get(`${BASE_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(200);
    });
  });

  describe('Trading Flow', () => {
    it('should get market data', async () => {
      const response = await axios.get(`${BASE_URL}/api/market/tickers`);
      expect(response.status).to.equal(200);
      expect(response.data).to.be.an('array');
    });

    it('should place order', async () => {
      const orderData = {
        symbol: 'ETH/USDT',
        type: 'limit',
        side: 'buy',
        amount: 1,
        price: 2500
      };

      const response = await axios.post(`${BASE_URL}/api/orders`, orderData, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(201);
      expect(response.data).to.have.property('orderId');
    });

    it('should get order status', async () => {
      const response = await axios.get(`${BASE_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(200);
      expect(response.data).to.be.an('array');
    });
  });

  describe('A/B Testing Flow', () => {
    it('should create experiment', async () => {
      const experimentData = {
        name: 'Test Experiment',
        description: 'E2E Test Experiment',
        hypothesis: 'New UI improves conversion',
        variants: [
          { name: 'control', trafficPercentage: 0.5, isControl: true },
          { name: 'variant_a', trafficPercentage: 0.5, isControl: false }
        ],
        primaryMetric: 'conversion_rate',
        confidenceLevel: 0.95,
        minimumSampleSize: 1000
      };

      const response = await axios.post(`${BASE_URL}/api/ab-testing/experiments`, experimentData, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(201);
      expect(response.data).to.have.property('id');
    });

    it('should assign user to variant', async () => {
      const assignmentData = {
        experimentId: 'test-experiment-id',
        userId: `user_${Date.now()}`,
        userSegment: 'premium'
      };

      const response = await axios.post(`${BASE_URL}/api/ab-testing/assign`, assignmentData, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('variantId');
    });

    it('should track event', async () => {
      const eventData = {
        experimentId: 'test-experiment-id',
        variantId: 'control',
        userId: `user_${Date.now()}`,
        eventType: 'impression',
        eventName: 'page_view'
      };

      const response = await axios.post(`${BASE_URL}/api/ab-testing/events`, eventData, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(201);
    });

    it('should get experiment results', async () => {
      const response = await axios.get(`${BASE_URL}/api/ab-testing/experiments/test-experiment-id/results`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(200);
      expect(response.data).to.be.an('array');
    });
  });

  describe('Portfolio Flow', () => {
    it('should get portfolio summary', async () => {
      const response = await axios.get(`${BASE_URL}/api/portfolio`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('totalValue');
    });

    it('should get transaction history', async () => {
      const response = await axios.get(`${BASE_URL}/api/portfolio/transactions`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(200);
      expect(response.data).to.be.an('array');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid token', async () => {
      try {
        await axios.get(`${BASE_URL}/api/user/profile`, {
          headers: { Authorization: 'Bearer invalid-token' }
        });
      } catch (error) {
        expect(error.response.status).to.equal(401);
      }
    });

    it('should handle rate limiting', async () => {
      const requests = [];
      for (let i = 0; i < 110; i++) {
        requests.push(axios.get(`${BASE_URL}/api/market/tickers`));
      }

      try {
        await Promise.all(requests);
      } catch (error) {
        // Should hit rate limit
        expect(error.response.status).to.equal(429);
      }
    });
  });
});

// Helper functions
async function waitForSystem() {
  let retries = 0;
  while (retries < 30) {
    try {
      await axios.get(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/health`);
      return;
    } catch (error) {
      retries++;
      await sleep(1000);
    }
  }
  throw new Error('System not ready');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
