/**
 * Unit Tests for Gas Routes
 */

const request = require('supertest');
const express = require('express');
const gasRouter = require('../gas');

describe('Gas Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/gas', gasRouter);
  });

  describe('GET /api/gas/prices', () => {
    it('should return gas prices for all speed tiers', async () => {
      const response = await request(app)
        .get('/api/gas/prices')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('prices');
      expect(response.body.data.prices).toHaveProperty('slow');
      expect(response.body.data.prices).toHaveProperty('standard');
      expect(response.body.data.prices).toHaveProperty('fast');
      expect(response.body.data.prices).toHaveProperty('instant');
    });

    it('should include congestion level', async () => {
      const response = await request(app)
        .get('/api/gas/prices')
        .expect(200);

      expect(response.body.data).toHaveProperty('congestion');
      expect(typeof response.body.data.congestion).toBe('number');
      expect(response.body.data.congestion).toBeGreaterThanOrEqual(0);
      expect(response.body.data.congestion).toBeLessThanOrEqual(100);
    });

    it('should include ETH price', async () => {
      const response = await request(app)
        .get('/api/gas/prices')
        .expect(200);

      expect(response.body.data).toHaveProperty('ethPrice');
      expect(typeof response.body.data.ethPrice).toBe('number');
      expect(response.body.data.ethPrice).toBeGreaterThan(0);
    });

    it('should have valid gas price values', async () => {
      const response = await request(app)
        .get('/api/gas/prices')
        .expect(200);

      const { slow, standard, fast, instant } = response.body.data.prices;
      expect(slow).toBeLessThan(standard);
      expect(standard).toBeLessThan(fast);
      expect(fast).toBeLessThan(instant);
    });
  });

  describe('POST /api/gas/estimate', () => {
    it('should estimate gas cost for swap', async () => {
      const response = await request(app)
        .post('/api/gas/estimate')
        .send({ type: 'swap', gasPrice: 30 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('gasLimit');
      expect(response.body.data).toHaveProperty('gasPriceGwei');
      expect(response.body.data).toHaveProperty('estimatedCostEth');
      expect(response.body.data).toHaveProperty('estimatedCostUsd');
    });

    it('should handle different transaction types', async () => {
      const types = ['swap', 'approval', 'liquidity', 'transfer'];

      for (const type of types) {
        const response = await request(app)
          .post('/api/gas/estimate')
          .send({ type, gasPrice: 25 })
          .expect(200);

        expect(response.body.data.transactionType).toBe(type);
      }
    });

    it('should return 400 for missing gasPrice', async () => {
      const response = await request(app)
        .post('/api/gas/estimate')
        .send({ type: 'swap' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_GAS_PRICE');
    });

    it('should return 400 for invalid gasPrice', async () => {
      const response = await request(app)
        .post('/api/gas/estimate')
        .send({ type: 'swap', gasPrice: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should include estimated time', async () => {
      const response = await request(app)
        .post('/api/gas/estimate')
        .send({ type: 'swap', gasPrice: 30 })
        .expect(200);

      expect(response.body.data).toHaveProperty('estimatedTime');
      expect(typeof response.body.data.estimatedTime).toBe('string');
    });

    it('should calculate costs correctly', async () => {
      const gasPrice = 30;
      const response = await request(app)
        .post('/api/gas/estimate')
        .send({ type: 'swap', gasPrice })
        .expect(200);

      const { gasPriceGwei, estimatedCostEth } = response.body.data;
      expect(gasPriceGwei).toBe(gasPrice);
      expect(parseFloat(estimatedCostEth)).toBeGreaterThan(0);
    });
  });

  describe('GET /api/gas/history', () => {
    it('should return gas price history', async () => {
      const response = await request(app)
        .get('/api/gas/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('history');
      expect(Array.isArray(response.body.data.history)).toBe(true);
    });

    it('should accept hours parameter', async () => {
      const hours = 12;
      const response = await request(app)
        .get(`/api/gas/history?hours=${hours}`)
        .expect(200);

      expect(response.body.data.hours).toBe(hours);
    });

    it('should limit data points to 168 (1 week)', async () => {
      const response = await request(app)
        .get('/api/gas/history?hours=200')
        .expect(200);

      expect(response.body.data.dataPoints).toBeLessThanOrEqual(168);
    });

    it('should return historical data with timestamps', async () => {
      const response = await request(app)
        .get('/api/gas/history')
        .expect(200);

      const history = response.body.data.history;
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('baseFee');
    });
  });

  describe('GET /api/gas/optimal-time', () => {
    it('should return optimal transaction time recommendations', async () => {
      const response = await request(app)
        .get('/api/gas/optimal-time')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('current');
      expect(response.body.data).toHaveProperty('bestTimes');
      expect(response.body.data).toHaveProperty('worstTimes');
    });

    it('should include next optimal window', async () => {
      const response = await request(app)
        .get('/api/gas/optimal-time')
        .expect(200);

      expect(response.body.data).toHaveProperty('nextOptimalWindow');
      expect(response.body.data.nextOptimalWindow).toHaveProperty('start');
      expect(response.body.data.nextOptimalWindow).toHaveProperty('duration');
    });

    it('should have valid time recommendations', async () => {
      const response = await request(app)
        .get('/api/gas/optimal-time')
        .expect(200);

      const { bestTimes, worstTimes } = response.body.data;
      expect(Array.isArray(bestTimes)).toBe(true);
      expect(Array.isArray(worstTimes)).toBe(true);
      expect(bestTimes.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/gas/alert', () => {
    it('should create gas price alert', async () => {
      const response = await request(app)
        .post('/api/gas/alert')
        .send({
          targetGasPrice: 20,
          email: 'test@example.com'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('targetGasPrice', 20);
    });

    it('should return 400 for missing targetGasPrice', async () => {
      const response = await request(app)
        .post('/api/gas/alert')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TARGET');
    });

    it('should return 400 for missing notification method', async () => {
      const response = await request(app)
        .post('/api/gas/alert')
        .send({ targetGasPrice: 20 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('MISSING_NOTIFICATION');
    });

    it('should accept webhook as notification method', async () => {
      const response = await request(app)
        .post('/api/gas/alert')
        .send({
          targetGasPrice: 25,
          webhook: 'https://example.com/webhook'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Data Validation', () => {
    it('should return valid number types', async () => {
      const response = await request(app)
        .get('/api/gas/prices')
        .expect(200);

      const { slow, standard, fast, instant } = response.body.data.prices;
      expect(typeof slow).toBe('number');
      expect(typeof standard).toBe('number');
      expect(typeof fast).toBe('number');
      expect(typeof instant).toBe('number');
    });

    it('should have consistent data structure', async () => {
      const response = await request(app)
        .get('/api/gas/prices')
        .expect(200);

      expect(response.body.data).toMatchObject({
        prices: {
          slow: expect.any(Number),
          standard: expect.any(Number),
          fast: expect.any(Number),
          instant: expect.any(Number)
        },
        baseFee: expect.any(Number),
        congestion: expect.any(Number),
        ethPrice: expect.any(Number)
      });
    });
  });
});
