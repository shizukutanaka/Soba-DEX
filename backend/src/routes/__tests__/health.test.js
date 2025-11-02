const request = require('supertest');
const express = require('express');

describe('Health Endpoint', () => {
  let app;

  beforeAll(() => {
    app = express();

    // Health endpoint
    app.get('/health', (req, res) => {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      res.json({
        status: 'healthy',
        uptime: Math.floor(uptime),
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024)
        },
        timestamp: new Date().toISOString()
      });
    });
  });

  describe('GET /health', () => {
    it('should return 200 status', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
    });

    it('should return uptime information', async () => {
      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return memory usage', async () => {
      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('memory');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('rss');

      expect(typeof response.body.memory.heapUsed).toBe('number');
      expect(typeof response.body.memory.heapTotal).toBe('number');
      expect(typeof response.body.memory.rss).toBe('number');
    });

    it('should return timestamp', async () => {
      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it('should have correct response structure', async () => {
      const response = await request(app).get('/health');

      expect(Object.keys(response.body)).toEqual(
        expect.arrayContaining(['status', 'uptime', 'memory', 'timestamp'])
      );
    });
  });
});
