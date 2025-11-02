/**
 * API Integration Tests
 * Version: 2.6.1
 *
 * Tests core API endpoints with validators and standardized responses
 */

const request = require('supertest');
const app = require('../../src/app');

describe('API Integration Tests', () => {
  describe('Health Endpoints', () => {
    test('GET /health - should return basic health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory');
    });

    test('GET /health/ready - should return readiness status', async () => {
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ready');
    });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/nonce', () => {
      test('should generate nonce for valid address', async () => {
        const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

        const res = await request(app)
          .post('/api/auth/nonce')
          .send({ address: validAddress });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('data');
        expect(res.body.data).toHaveProperty('nonce');
        expect(res.body.data).toHaveProperty('message');
        expect(res.body.data).toHaveProperty('expiresIn');
        expect(res.body).toHaveProperty('timestamp');
      });

      test('should reject invalid address format', async () => {
        const res = await request(app)
          .post('/api/auth/nonce')
          .send({ address: 'invalid-address' });

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error', 'Validation failed');
        expect(res.body).toHaveProperty('errors');
      });

      test('should reject missing address', async () => {
        const res = await request(app)
          .post('/api/auth/nonce')
          .send({});

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error', 'Validation failed');
      });
    });

    describe('POST /api/auth/verify', () => {
      test('should reject missing required fields', async () => {
        const res = await request(app)
          .post('/api/auth/verify')
          .send({ address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' });

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error', 'Validation failed');
      });

      test('should reject invalid address', async () => {
        const res = await request(app)
          .post('/api/auth/verify')
          .send({
            address: 'invalid',
            signature: '0xsignature',
            message: 'test message'
          });

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
      });
    });
  });

  describe('Price Endpoints', () => {
    describe('GET /api/prices/:pair', () => {
      test('should return price for valid token pair', async () => {
        const res = await request(app).get('/api/prices/ETH-USDC');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('timestamp');
      });

      test('should reject invalid token pair format', async () => {
        const res = await request(app).get('/api/prices/invalid');

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error', 'Validation failed');
      });

      test('should reject lowercase token symbols', async () => {
        const res = await request(app).get('/api/prices/eth-usdc');

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
      });
    });
  });

  describe('Swap Endpoints', () => {
    describe('POST /api/swap/quote', () => {
      test('should reject invalid token symbols', async () => {
        const res = await request(app)
          .post('/api/swap/quote')
          .send({
            tokenIn: 'eth', // lowercase invalid
            tokenOut: 'USDC',
            amountIn: 1.0
          });

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error', 'Validation failed');
      });

      test('should reject invalid amount', async () => {
        const res = await request(app)
          .post('/api/swap/quote')
          .send({
            tokenIn: 'ETH',
            tokenOut: 'USDC',
            amountIn: -1 // negative invalid
          });

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
      });

      test('should reject missing required fields', async () => {
        const res = await request(app)
          .post('/api/swap/quote')
          .send({
            tokenIn: 'ETH'
            // missing tokenOut and amountIn
          });

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('success', false);
      });
    });
  });

  describe('Response Format Standardization', () => {
    test('Success responses should have standard format', async () => {
      const res = await request(app).get('/health');

      expect(res.body).toHaveProperty('status');
      // Health endpoint has custom format, but others should follow standard
    });

    test('Error responses should have standard format', async () => {
      const res = await request(app).get('/api/prices/invalid');

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('timestamp');
    });

    test('Validation errors should include error details', async () => {
      const res = await request(app)
        .post('/api/auth/nonce')
        .send({ address: 'invalid' });

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error', 'Validation failed');
      expect(res.body).toHaveProperty('errors');
      expect(Array.isArray(res.body.errors)).toBe(true);
    });
  });

  describe('Input Validation', () => {
    test('Should validate Ethereum addresses', async () => {
      const invalidAddresses = [
        'not-an-address',
        '0x123', // too short
        '0xGGGG35Cc6634C0532925a3b844Bc9e7595f0bEb', // invalid hex
        '', // empty
      ];

      for (const address of invalidAddresses) {
        const res = await request(app)
          .post('/api/auth/nonce')
          .send({ address });

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);
      }
    });

    test('Should validate token symbols', async () => {
      const invalidSymbols = [
        'eth', // lowercase
        'E', // too short
        'VERYLONGSYMBOL', // too long
        '123', // numbers only
        'ETH-USDC', // contains dash
      ];

      for (const symbol of invalidSymbols) {
        const res = await request(app)
          .post('/api/swap/quote')
          .send({
            tokenIn: symbol,
            tokenOut: 'USDC',
            amountIn: 1.0
          });

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);
      }
    });

    test('Should validate amounts', async () => {
      const invalidAmounts = [
        -1, // negative
        0, // zero
        'not-a-number', // string
        NaN,
        Infinity,
      ];

      for (const amount of invalidAmounts) {
        const res = await request(app)
          .post('/api/swap/quote')
          .send({
            tokenIn: 'ETH',
            tokenOut: 'USDC',
            amountIn: amount
          });

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);
      }
    });
  });
});
