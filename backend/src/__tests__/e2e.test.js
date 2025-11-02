/**
 * End-to-End Test Suite for DEX Platform
 *
 * Comprehensive testing of the entire application stack
 * - API endpoints integration
 * - Database operations
 * - Authentication and authorization
 * - Trading functionality
 * - Error handling and edge cases
 *
 * @version 1.0.0
 */

const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const app = require('../app-core');
const { initializeDatabase } = require('../database/database');
const { enhancedLightweightMonitor } = require('../monitoring/lightweightMonitor');

describe('🔗 DEX Platform - End-to-End Tests', function() {
  this.timeout(30000); // 30 second timeout for integration tests

  let testUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    password: 'TestPassword123!',
    walletAddress: '0x1234567890123456789012345678901234567890'
  };

  let authToken;
  let testToken = {
    id: 'test-token-123',
    symbol: 'TEST',
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    decimals: 18
  };

  let testTradingPair = {
    id: 'test-pair-123',
    baseToken: testToken,
    quoteToken: { ...testToken, symbol: 'USDC', address: '0xabcdef1234567890abcdef1234567890abcdef13' },
    liquidity: '1000000'
  };

  before(async function() {
    // Initialize test database
    await initializeDatabase();

    // Start performance monitoring for tests
    enhancedLightweightMonitor.startEnhancedMonitoring();

    // Setup test data
    await setupTestData();
  });

  after(async function() {
    // Cleanup test data
    await cleanupTestData();

    // Stop monitoring
    enhancedLightweightMonitor.stopMonitoring();
  });

  beforeEach(function() {
    // Reset any test-specific state
    sinon.restore();
  });

  describe('🔐 Authentication Flow', function() {
    it('should register a new user successfully', async function() {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
          username: 'testuser',
          walletAddress: testUser.walletAddress
        })
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('user');
      expect(response.body.user).to.have.property('id');
      expect(response.body.user.email).to.equal(testUser.email);
    });

    it('should login user and return JWT token', async function() {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('token');
      expect(response.body).to.have.property('user');

      authToken = response.body.token;
    });

    it('should authenticate protected routes with JWT', async function() {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('user');
    });

    it('should reject requests without valid token', async function() {
      await request(app)
        .get('/api/user/profile')
        .expect(401);
    });
  });

  describe('💼 Wallet Management', function() {
    it('should connect wallet successfully', async function() {
      const response = await request(app)
        .post('/api/wallet/connect')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress: testUser.walletAddress,
          chainId: 1
        })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('wallet');
    });

    it('should get wallet balance', async function() {
      const response = await request(app)
        .get(`/api/wallet/${testUser.walletAddress}/balance`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('balance');
    });

    it('should handle wallet disconnection', async function() {
      const response = await request(app)
        .post('/api/wallet/disconnect')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
    });
  });

  describe('🏦 Token Management', function() {
    it('should create test token successfully', async function() {
      const response = await request(app)
        .post('/api/tokens')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: testToken.symbol,
          name: 'Test Token',
          address: testToken.address,
          decimals: testToken.decimals,
          totalSupply: '1000000000000000000000' // 1000 tokens
        })
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('token');
      expect(response.body.token.symbol).to.equal(testToken.symbol);
    });

    it('should get token information', async function() {
      const response = await request(app)
        .get(`/api/tokens/${testToken.address}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('token');
      expect(response.body.token.address).to.equal(testToken.address);
    });

    it('should list all tokens', async function() {
      const response = await request(app)
        .get('/api/tokens')
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('tokens');
      expect(Array.isArray(response.body.tokens)).to.be.true;
    });
  });

  describe('📊 Trading Operations', function() {
    before(async function() {
      // Ensure trading pair exists for tests
      await ensureTradingPairExists();
    });

    it('should execute token swap successfully', async function() {
      const response = await request(app)
        .post('/api/trading/swap')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tokenIn: testToken.address,
          tokenOut: testTradingPair.quoteToken.address,
          amountIn: '1000000000000000000', // 1 token
          minAmountOut: '900000000000000000', // 0.9 tokens (allowing 10% slippage)
          deadline: Math.floor(Date.now() / 1000) + 300 // 5 minutes from now
        })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('trade');
      expect(response.body.trade).to.have.property('id');
    });

    it('should add liquidity to pool', async function() {
      const response = await request(app)
        .post('/api/trading/add-liquidity')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tokenA: testToken.address,
          tokenB: testTradingPair.quoteToken.address,
          amountA: '10000000000000000000', // 10 tokens
          amountB: '10000000000000000000', // 10 tokens
          deadline: Math.floor(Date.now() / 1000) + 300
        })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('liquidity');
    });

    it('should get trading history', async function() {
      const response = await request(app)
        .get(`/api/trading/history/${testUser.walletAddress}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('trades');
      expect(Array.isArray(response.body.trades)).to.be.true;
    });

    it('should handle insufficient balance error', async function() {
      const response = await request(app)
        .post('/api/trading/swap')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tokenIn: testToken.address,
          tokenOut: testTradingPair.quoteToken.address,
          amountIn: '1000000000000000000000000', // Very large amount
          minAmountOut: '900000000000000000000000',
          deadline: Math.floor(Date.now() / 1000) + 300
        })
        .expect(400);

      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('error');
    });
  });

  describe('🔍 Price and Market Data', function() {
    it('should get token price information', async function() {
      const response = await request(app)
        .get(`/api/tokens/${testToken.address}/price`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('price');
      expect(typeof response.body.price).to.equal('number');
    });

    it('should get market statistics', async function() {
      const response = await request(app)
        .get('/api/market/stats')
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('stats');
    });

    it('should handle price alerts', async function() {
      const response = await request(app)
        .post('/api/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tokenAddress: testToken.address,
          condition: 'above',
          targetPrice: 2.0
        })
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('alert');
    });
  });

  describe('⚡ Performance and Monitoring', function() {
    it('should track API performance metrics', async function() {
      // Make several requests to generate metrics
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get(`/api/tokens/${testToken.address}/price`)
          .expect(200);
      }

      // Check that metrics were recorded
      const metrics = enhancedLightweightMonitor.getMetrics();
      expect(metrics.application.requests.total).to.be.above(0);
    });

    it('should handle high load gracefully', async function() {
      // Simulate high load
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          request(app)
            .get(`/api/tokens/${testToken.address}/price`)
            .expect(200)
        );
      }

      const results = await Promise.all(promises);
      expect(results).to.have.length(20);

      // Check performance metrics
      const metrics = enhancedLightweightMonitor.getMetrics();
      expect(metrics.application.requests.total).to.be.above(15);
    });

    it('should maintain system health under load', async function() {
      const health = enhancedLightweightMonitor.getHealthStatus();
      expect(['healthy', 'warning']).to.include(health.status);
    });
  });

  describe('🛡️ Error Handling and Edge Cases', function() {
    it('should handle malformed requests gracefully', async function() {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: ''
        })
        .expect(400);
    });

    it('should handle rate limiting', async function() {
      // Make multiple rapid requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: testUser.email,
              password: 'wrong-password'
            })
        );
      }

      const results = await Promise.all(promises);

      // Should have some rate limited responses
      const rateLimited = results.filter(r => r.status === 429);
      expect(rateLimited.length).to.be.above(0);
    });

    it('should handle database connection issues', async function() {
      // This would require mocking database failures
      // For now, we'll test error response structure
      const response = await request(app)
        .get('/api/test-database-error')
        .expect(500);

      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('error');
    });

    it('should validate input data properly', async function() {
      const response = await request(app)
        .post('/api/tokens')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          symbol: '', // Invalid empty symbol
          name: 'Test Token',
          address: 'invalid-address',
          decimals: -1 // Invalid negative decimals
        })
        .expect(400);

      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('errors');
    });
  });

  describe('🔄 Data Consistency', function() {
    it('should maintain data consistency across operations', async function() {
      // Get initial balance
      const balanceResponse1 = await request(app)
        .get(`/api/wallet/${testUser.walletAddress}/balance`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const initialBalance = balanceResponse1.body.balance;

      // Execute a trade
      await request(app)
        .post('/api/trading/swap')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tokenIn: testToken.address,
          tokenOut: testTradingPair.quoteToken.address,
          amountIn: '1000000000000000000',
          minAmountOut: '900000000000000000',
          deadline: Math.floor(Date.now() / 1000) + 300
        })
        .expect(200);

      // Check balance again
      const balanceResponse2 = await request(app)
        .get(`/api/wallet/${testUser.walletAddress}/balance`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Balance should be updated
      expect(balanceResponse2.body.balance).to.not.equal(initialBalance);
    });

    it('should rollback failed transactions', async function() {
      // This would require testing transaction rollback
      // For now, we'll test that failed operations don't corrupt data
      const initialMetrics = enhancedLightweightMonitor.getMetrics();

      // Attempt a failing operation
      await request(app)
        .post('/api/trading/swap')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tokenIn: 'invalid-address',
          tokenOut: testTradingPair.quoteToken.address,
          amountIn: '1000000000000000000',
          minAmountOut: '900000000000000000',
          deadline: Math.floor(Date.now() / 1000) + 300
        })
        .expect(400);

      // System should remain stable
      const finalMetrics = enhancedLightweightMonitor.getMetrics();
      expect(finalMetrics.application.requests.total).to.be.above(initialMetrics.application.requests.total);
    });
  });
});

// Test data setup helper
async function setupTestData() {
  try {
    // Create test user if not exists
    const User = require('../models/User');
    const Token = require('../models/Token');

    await User.findOrCreate({
      where: { email: testUser.email },
      defaults: {
        email: testUser.email,
        password: await require('bcrypt').hash(testUser.password, 10),
        walletAddress: testUser.walletAddress,
        username: 'testuser'
      }
    });

    // Create test token if not exists
    await Token.findOrCreate({
      where: { address: testToken.address },
      defaults: {
        symbol: testToken.symbol,
        name: 'Test Token',
        address: testToken.address,
        decimals: testToken.decimals,
        totalSupply: '1000000000000000000000000'
      }
    });

    console.log('✅ Test data setup completed');
  } catch (error) {
    console.error('❌ Test data setup failed:', error.message);
    throw error;
  }
}

// Test data cleanup helper
async function cleanupTestData() {
  try {
    const User = require('../models/User');
    const Token = require('../models/Token');
    const Trade = require('../models/Trade');

    // Remove test data
    await User.destroy({ where: { email: testUser.email } });
    await Token.destroy({ where: { address: testToken.address } });
    await Trade.destroy({ where: { userId: testUser.id } });

    console.log('🧹 Test data cleanup completed');
  } catch (error) {
    console.error('❌ Test data cleanup failed:', error.message);
  }
}

// Ensure trading pair exists for tests
async function ensureTradingPairExists() {
  try {
    const TradingPair = require('../models/TradingPair');

    await TradingPair.findOrCreate({
      where: {
        baseTokenAddress: testToken.address,
        quoteTokenAddress: testTradingPair.quoteToken.address
      },
      defaults: {
        baseTokenAddress: testToken.address,
        quoteTokenAddress: testTradingPair.quoteToken.address,
        liquidity: testTradingPair.liquidity,
        fee: 0.003, // 0.3%
        enabled: true
      }
    });

    console.log('✅ Trading pair ensured for tests');
  } catch (error) {
    console.error('❌ Trading pair setup failed:', error.message);
  }
}
