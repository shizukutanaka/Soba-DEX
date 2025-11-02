/**
 * Health Check Routes - Lightweight System Status
 * Version: 2.6.1 - Simplified and practical
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../db/prisma');
const cacheService = require('../services/cacheService');

/**
 * GET /health
 * Basic lightweight health check
 */
router.get('/', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    version: '2.6.1',
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB'
    }
  });
});

/**
 * GET /health/detailed
 * Detailed health check with DB and Cache status
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    version: '2.6.1',
    services: {}
  };

  // Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = { status: 'healthy' };
  } catch (error) {
    health.status = 'degraded';
    health.services.database = { status: 'unhealthy', error: error.message };
  }

  // Redis
  try {
    if (cacheService.isAvailable()) {
      await cacheService.client.ping();
      const stats = await cacheService.getStats();
      health.services.redis = { status: 'healthy', keys: stats.keys || 0 };
    } else {
      health.services.redis = { status: 'disconnected' };
    }
  } catch (error) {
    health.services.redis = { status: 'unhealthy', error: error.message };
  }

  // Memory
  const mem = process.memoryUsage();
  health.services.memory = {
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
    usage: Math.round((mem.heapUsed / mem.heapTotal) * 100) + '%'
  };

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

/**
 * GET /health/ready
 * Kubernetes readiness probe
 */
router.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 */
router.get('/live', (req, res) => {
  res.json({ alive: true, uptime: Math.floor(process.uptime()) });
});

module.exports = router;
