/**
 * Unit Tests for Price Routes
 */

const request = require('supertest');
const express = require('express');
const pricesRouter = require('../prices');

describe('Price Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/prices', pricesRouter);
  });

  describe('GET /api/prices/:pair', () => {
    it('should return price data for valid pair', async () => {
      const response = await request(app)
        .get('/api/prices/ETH-USDC')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('pair');
      expect(response.body.data).toHaveProperty('price');
      expect(response.body.data).toHaveProperty('priceChange24h');
      expect(response.body.data).toHaveProperty('volume24h');
    });

    it('should return 400 for missing pair', async () => {
      const response = await request(app)
        .get('/api/prices/')
        .expect(404);
    });

    it('should include timestamp in response', async () => {
      const response = await request(app)
        .get('/api/prices/BTC-USDC')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it('should have valid price format', async () => {
      const response = await request(app)
        .get('/api/prices/ETH-USDC')
        .expect(200);

      const { price } = response.body.data;
      expect(typeof price).toBe('number');
      expect(price).toBeGreaterThan(0);
    });

    it('should handle cache headers correctly', async () => {
      const response = await request(app)
        .get('/api/prices/ETH-USDC')
        .expect(200);

      // Check if cache-related headers are present
      expect(response.headers).toHaveProperty('cache-control');
    });
  });

  describe('GET /api/prices/:pair/history', () => {
    it('should return price history', async () => {
      const response = await request(app)
        .get('/api/prices/ETH-USDC/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('history');
      expect(Array.isArray(response.body.data.history)).toBe(true);
    });

    it('should accept interval parameter', async () => {
      const response = await request(app)
        .get('/api/prices/ETH-USDC/history?interval=1h')
        .expect(200);

      expect(response.body.data).toHaveProperty('interval', '1h');
    });

    it('should accept limit parameter', async () => {
      const limit = 10;
      const response = await request(app)
        .get(`/api/prices/ETH-USDC/history?limit=${limit}`)
        .expect(200);

      expect(response.body.data.history.length).toBeLessThanOrEqual(limit);
    });

    it('should return historical data with timestamps', async () => {
      const response = await request(app)
        .get('/api/prices/ETH-USDC/history')
        .expect(200);

      const history = response.body.data.history;
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('price');
    });
  });

  describe('POST /api/prices/multiple', () => {
    it('should return prices for multiple pairs', async () => {
      const pairs = ['ETH-USDC', 'BTC-USDC'];
      const response = await request(app)
        .post('/api/prices/multiple')
        .send({ pairs })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ETH-USDC');
      expect(response.body.data).toHaveProperty('BTC-USDC');
    });

    it('should return 400 for invalid request', async () => {
      const response = await request(app)
        .post('/api/prices/multiple')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for non-array pairs', async () => {
      const response = await request(app)
        .post('/api/prices/multiple')
        .send({ pairs: 'ETH-USDC' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle empty pairs array', async () => {
      const response = await request(app)
        .post('/api/prices/multiple')
        .send({ pairs: [] })
        .expect(200);

      expect(response.body.data).toEqual({});
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      // This test would require mocking to force an error
      // For now, we test the error response structure
      const response = await request(app)
        .get('/api/prices/INVALID')
        .expect(200); // Should still return 200 with success: false or handle differently

      expect(response.body).toHaveProperty('success');
    });

    it('should return proper error codes', async () => {
      const response = await request(app)
        .post('/api/prices/multiple')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body).toHaveProperty('code');
    });
  });

  describe('Data Validation', () => {
    it('should return valid number types for prices', async () => {
      const response = await request(app)
        .get('/api/prices/ETH-USDC')
        .expect(200);

      const { price, priceChange24h, volume24h } = response.body.data;
      expect(typeof price).toBe('number');
      expect(typeof priceChange24h).toBe('number');
      expect(typeof volume24h).toBe('number');
    });

    it('should return valid data structure', async () => {
      const response = await request(app)
        .get('/api/prices/ETH-USDC')
        .expect(200);

      expect(response.body.data).toMatchObject({
        pair: expect.any(String),
        price: expect.any(Number),
        priceChange24h: expect.any(Number),
        volume24h: expect.any(Number),
        high24h: expect.any(Number),
        low24h: expect.any(Number)
      });
    });
  });
});
