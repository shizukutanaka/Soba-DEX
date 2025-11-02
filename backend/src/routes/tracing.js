/**
 * OpenTelemetry Tracing Routes
 *
 * API endpoints for tracing management and statistics
 *
 * @module routes/tracing
 * @version 3.0.0
 */

const express = require('express');
const router = express.Router();
const tracerService = require('../services/tracerService');
const logger = require('../config/logger');

/**
 * @route GET /api/tracing/health
 * @desc Check tracing service health
 * @access Public
 */
router.get('/health', (req, res) => {
  try {
    const isEnabled = tracerService.isEnabled();
    const stats = tracerService.getStats();

    res.json({
      success: true,
      status: isEnabled ? 'active' : 'inactive',
      ...stats,
    });
  } catch (error) {
    logger.error('Error checking tracing health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check tracing health',
    });
  }
});

/**
 * @route GET /api/tracing/stats
 * @desc Get tracing statistics
 * @access Public
 */
router.get('/stats', (req, res) => {
  try {
    const stats = tracerService.getStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error('Error fetching tracing stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracing stats',
    });
  }
});

/**
 * @route POST /api/tracing/flush
 * @desc Force flush pending traces
 * @access Private (Admin only)
 */
router.post('/flush', async (req, res) => {
  try {
    if (!tracerService.isEnabled()) {
      return res.status(400).json({
        success: false,
        error: 'Tracing not enabled',
      });
    }

    await tracerService.flush();

    res.json({
      success: true,
      message: 'Traces flushed successfully',
    });
  } catch (error) {
    logger.error('Error flushing traces:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flush traces',
    });
  }
});

/**
 * @route GET /api/tracing/config
 * @desc Get current tracing configuration
 * @access Public
 */
router.get('/config', (req, res) => {
  try {
    const config = {
      enabled: tracerService.isEnabled(),
      serviceName: tracerService.serviceName,
      serviceVersion: tracerService.serviceVersion,
      exporterType: process.env.OTEL_EXPORTER_TYPE || 'jaeger',
      endpoints: {
        jaeger: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
        zipkin: process.env.ZIPKIN_ENDPOINT || 'http://localhost:9411/api/v2/spans',
        otlp: process.env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      },
    };

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    logger.error('Error fetching tracing config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracing config',
    });
  }
});

/**
 * @route GET /api/tracing/active-span
 * @desc Get information about the currently active span (if any)
 * @access Public
 */
router.get('/active-span', (req, res) => {
  try {
    const span = tracerService.getCurrentSpan();

    if (!span) {
      return res.json({
        success: true,
        hasActiveSpan: false,
        message: 'No active span',
      });
    }

    // Note: We can't directly extract span details in OpenTelemetry
    // This endpoint primarily confirms span existence
    res.json({
      success: true,
      hasActiveSpan: true,
    });
  } catch (error) {
    logger.error('Error checking active span:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check active span',
    });
  }
});

/**
 * @route GET /api/tracing
 * @desc Get tracing service overview
 * @access Public
 */
router.get('/', (req, res) => {
  try {
    const stats = tracerService.getStats();
    const config = {
      exporterType: process.env.OTEL_EXPORTER_TYPE || 'jaeger',
      serviceName: tracerService.serviceName,
      serviceVersion: tracerService.serviceVersion,
    };

    res.json({
      success: true,
      message: 'OpenTelemetry Tracing Service',
      version: '3.0.0',
      stats,
      config,
      endpoints: {
        health: '/api/tracing/health',
        stats: '/api/tracing/stats',
        config: '/api/tracing/config',
        activeSpan: '/api/tracing/active-span',
        flush: '/api/tracing/flush (POST)',
      },
    });
  } catch (error) {
    logger.error('Error fetching tracing overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracing overview',
    });
  }
});

module.exports = router;
