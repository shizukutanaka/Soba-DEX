/**
 * Prometheus Metrics Routes
 * Exposes metrics in Prometheus format
 * Version: 2.9.0
 */

const express = require('express');
const router = express.Router();
const metricsService = require('../services/metricsService');

/**
 * GET /metrics
 * Get metrics in Prometheus format
 * This is the standard endpoint that Prometheus scrapes
 */
router.get('/', async (req, res) => {
  try {
    if (!metricsService.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: 'Metrics service not initialized',
      });
    }

    // Set content type for Prometheus
    res.set('Content-Type', metricsService.getContentType());

    // Get metrics in Prometheus format
    const metrics = await metricsService.getMetrics();
    res.send(metrics);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /metrics/json
 * Get metrics as JSON (for debugging/monitoring dashboards)
 */
router.get('/json', async (req, res) => {
  try {
    if (!metricsService.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: 'Metrics service not initialized',
      });
    }

    const metrics = await metricsService.getMetricsJson();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /metrics/health
 * Health check for metrics service
 */
router.get('/health', (req, res) => {
  const isInitialized = metricsService.isInitialized();
  const enabled = process.env.PROMETHEUS_ENABLED !== 'false';

  if (!enabled) {
    return res.status(200).json({
      success: true,
      status: 'disabled',
      message: 'Metrics collection is disabled',
    });
  }

  if (!isInitialized) {
    return res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: 'Metrics service not initialized',
    });
  }

  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /metrics/reset
 * Reset all metrics (admin only, use with caution)
 */
router.post('/reset', (req, res) => {
  try {
    // Check if reset is allowed
    if (process.env.PROMETHEUS_ALLOW_RESET !== 'true') {
      return res.status(403).json({
        success: false,
        error: 'Metrics reset is not allowed',
      });
    }

    if (!metricsService.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: 'Metrics service not initialized',
      });
    }

    metricsService.resetMetrics();

    res.json({
      success: true,
      message: 'Metrics reset successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
