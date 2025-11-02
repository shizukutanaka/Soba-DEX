/**
 * RUM (Real User Monitoring) API Routes
 *
 * Provides endpoints for collecting and querying real user monitoring data.
 *
 * @module routes/rum
 * @version 3.2.0
 */

const express = require('express');
const router = express.Router();
const rumService = require('../services/rumService');
const traceCorrelationService = require('../services/traceCorrelationService');
const logger = require('../config/logger');

// ============================================================================
// Data Collection Endpoints
// ============================================================================

/**
 * POST /api/rum/pageview
 * Record page view with performance metrics
 */
router.post('/pageview', async (req, res) => {
  try {
    const result = rumService.recordPageView({
      ...req.body,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[RUM API] Error recording page view', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/rum/error
 * Record JavaScript error
 */
router.post('/error', async (req, res) => {
  try {
    const result = rumService.recordError({
      ...req.body,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[RUM API] Error recording error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/rum/webvital
 * Record Core Web Vital
 */
router.post('/webvital', async (req, res) => {
  try {
    const result = rumService.recordWebVital(req.body);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[RUM API] Error recording web vital', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/rum/span
 * Receive frontend trace span
 */
router.post('/span', async (req, res) => {
  try {
    const result = traceCorrelationService.receiveFrontendSpan(req.body);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[RUM API] Error receiving span', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/rum/batch
 * Batch upload multiple events
 */
router.post('/batch', async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events)) {
      return res.status(400).json({
        success: false,
        error: 'events must be an array'
      });
    }

    const results = {
      pageViews: 0,
      errors: 0,
      webVitals: 0,
      spans: 0,
      failed: 0
    };

    events.forEach(event => {
      try {
        switch (event.type) {
          case 'pageview':
            rumService.recordPageView({
              ...event.data,
              ip: req.ip,
              userAgent: req.headers['user-agent']
            });
            results.pageViews++;
            break;

          case 'error':
            rumService.recordError({
              ...event.data,
              userAgent: req.headers['user-agent']
            });
            results.errors++;
            break;

          case 'webvital':
            rumService.recordWebVital(event.data);
            results.webVitals++;
            break;

          case 'span':
            traceCorrelationService.receiveFrontendSpan(event.data);
            results.spans++;
            break;

          default:
            results.failed++;
        }
      } catch (error) {
        results.failed++;
        logger.error('[RUM API] Error processing batch event', {
          type: event.type,
          error: error.message
        });
      }
    });

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('[RUM API] Error processing batch', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Session Management Endpoints
// ============================================================================

/**
 * POST /api/rum/session
 * Create new session
 */
router.post('/session', async (req, res) => {
  try {
    const session = rumService.createSession({
      ...req.body,
      ip: req.ip
    });

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('[RUM API] Error creating session', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/rum/session/:id
 * Update session
 */
router.put('/session/:id', async (req, res) => {
  try {
    const session = rumService.updateSession(req.params.id, req.body);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('[RUM API] Error updating session', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/rum/session/:id/end
 * End session
 */
router.post('/session/:id/end', async (req, res) => {
  try {
    const session = rumService.endSession(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('[RUM API] Error ending session', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/session/:id
 * Get session details
 */
router.get('/session/:id', async (req, res) => {
  try {
    const session = rumService.sessions.get(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('[RUM API] Error getting session', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Analytics Endpoints
// ============================================================================

/**
 * GET /api/rum/metrics
 * Get aggregated metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const filters = {
      startTime: req.query.startTime ? parseInt(req.query.startTime) : undefined,
      endTime: req.query.endTime ? parseInt(req.query.endTime) : undefined,
      page: req.query.page,
      country: req.query.country,
      device: req.query.device,
      browser: req.query.browser,
      sessionId: req.query.sessionId,
      userId: req.query.userId
    };

    const metrics = rumService.getMetrics(filters);

    res.json({
      success: true,
      data: metrics,
      filters
    });
  } catch (error) {
    logger.error('[RUM API] Error getting metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/webvitals
 * Get Core Web Vitals summary
 */
router.get('/webvitals', async (req, res) => {
  try {
    const filters = {
      startTime: req.query.startTime ? parseInt(req.query.startTime) : undefined,
      endTime: req.query.endTime ? parseInt(req.query.endTime) : undefined,
      page: req.query.page,
      country: req.query.country,
      device: req.query.device,
      browser: req.query.browser
    };

    const webVitals = rumService.getWebVitals(filters);

    res.json({
      success: true,
      data: webVitals,
      filters
    });
  } catch (error) {
    logger.error('[RUM API] Error getting web vitals', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/apdex
 * Get Apdex score
 */
router.get('/apdex', async (req, res) => {
  try {
    const threshold = req.query.threshold
      ? parseInt(req.query.threshold)
      : rumService.config.apdexThreshold;

    const filters = {
      startTime: req.query.startTime ? parseInt(req.query.startTime) : undefined,
      endTime: req.query.endTime ? parseInt(req.query.endTime) : undefined,
      page: req.query.page
    };

    const pageViews = rumService.filterPageViews(filters);
    const loadTimes = pageViews.map(pv => pv.timing.loadComplete);
    const apdex = rumService.calculateApdex(loadTimes, threshold);

    res.json({
      success: true,
      data: {
        apdex,
        threshold,
        pageViewCount: pageViews.length
      }
    });
  } catch (error) {
    logger.error('[RUM API] Error calculating Apdex', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/pages
 * Get page performance summary
 */
router.get('/pages', async (req, res) => {
  try {
    const pageStats = new Map();

    rumService.pageViews.forEach(pageView => {
      const url = pageView.url;

      if (!pageStats.has(url)) {
        pageStats.set(url, {
          url,
          count: 0,
          totalLoadTime: 0,
          totalScore: 0,
          loadTimes: []
        });
      }

      const stats = pageStats.get(url);
      stats.count++;
      stats.totalLoadTime += pageView.timing.loadComplete;
      stats.totalScore += pageView.score;
      stats.loadTimes.push(pageView.timing.loadComplete);
    });

    const pages = Array.from(pageStats.values()).map(stats => ({
      url: stats.url,
      count: stats.count,
      avgLoadTime: Math.round(stats.totalLoadTime / stats.count),
      avgScore: Math.round(stats.totalScore / stats.count),
      p50LoadTime: rumService.percentile(stats.loadTimes, 0.50),
      p95LoadTime: rumService.percentile(stats.loadTimes, 0.95),
      p99LoadTime: rumService.percentile(stats.loadTimes, 0.99)
    }));

    // Sort by count descending
    pages.sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: pages,
      total: pages.length
    });
  } catch (error) {
    logger.error('[RUM API] Error getting page stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/pages/:url/score
 * Get page performance score
 */
router.get('/pages/:url/score', async (req, res) => {
  try {
    const url = decodeURIComponent(req.params.url);
    const pageViews = rumService.filterPageViews({ page: url });

    if (pageViews.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data for this page'
      });
    }

    const scores = pageViews.map(pv => pv.score);
    const avgScore = rumService.avg(scores);
    const rating = rumService.getRating(avgScore);

    res.json({
      success: true,
      data: {
        url,
        score: Math.round(avgScore),
        rating,
        pageViews: pageViews.length
      }
    });
  } catch (error) {
    logger.error('[RUM API] Error getting page score', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/slow-pages
 * Find slow pages
 */
router.get('/slow-pages', async (req, res) => {
  try {
    const threshold = req.query.threshold
      ? parseInt(req.query.threshold)
      : rumService.config.slowPageThreshold;

    const slowPages = [];
    const pageStats = new Map();

    rumService.pageViews.forEach(pageView => {
      const url = pageView.url;

      if (!pageStats.has(url)) {
        pageStats.set(url, {
          url,
          count: 0,
          slowCount: 0,
          loadTimes: []
        });
      }

      const stats = pageStats.get(url);
      stats.count++;
      stats.loadTimes.push(pageView.timing.loadComplete);

      if (pageView.timing.loadComplete > threshold) {
        stats.slowCount++;
      }
    });

    pageStats.forEach(stats => {
      const slowPercentage = (stats.slowCount / stats.count) * 100;

      if (slowPercentage > 10) { // More than 10% slow
        slowPages.push({
          url: stats.url,
          count: stats.count,
          slowCount: stats.slowCount,
          slowPercentage: slowPercentage.toFixed(1) + '%',
          p95LoadTime: rumService.percentile(stats.loadTimes, 0.95),
          p99LoadTime: rumService.percentile(stats.loadTimes, 0.99)
        });
      }
    });

    // Sort by slow percentage descending
    slowPages.sort((a, b) => parseFloat(b.slowPercentage) - parseFloat(a.slowPercentage));

    res.json({
      success: true,
      data: slowPages,
      threshold,
      total: slowPages.length
    });
  } catch (error) {
    logger.error('[RUM API] Error finding slow pages', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/errors
 * Get error summary
 */
router.get('/errors', async (req, res) => {
  try {
    const errors = Array.from(rumService.errors.values());

    // Filter by time if provided
    const startTime = req.query.startTime ? parseInt(req.query.startTime) : 0;
    const endTime = req.query.endTime ? parseInt(req.query.endTime) : Date.now();

    const filteredErrors = errors.filter(err =>
      err.timestamp >= startTime && err.timestamp <= endTime
    );

    // Group by type
    const errorsByType = {};
    filteredErrors.forEach(err => {
      const type = err.type || 'unknown';
      if (!errorsByType[type]) {
        errorsByType[type] = {
          type,
          count: 0,
          errors: []
        };
      }
      errorsByType[type].count++;
      errorsByType[type].errors.push({
        id: err.id,
        message: err.message,
        url: err.url,
        timestamp: err.timestamp
      });
    });

    res.json({
      success: true,
      data: {
        total: filteredErrors.length,
        byType: errorsByType
      }
    });
  } catch (error) {
    logger.error('[RUM API] Error getting errors', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/errors/rate
 * Get error rate
 */
router.get('/errors/rate', async (req, res) => {
  try {
    const window = req.query.window ? parseInt(req.query.window) : 3600000; // 1 hour default
    const now = Date.now();
    const startTime = now - window;

    const errors = Array.from(rumService.errors.values()).filter(err =>
      err.timestamp >= startTime
    );

    const pageViews = rumService.filterPageViews({ startTime });

    const errorRate = pageViews.length > 0
      ? (errors.length / pageViews.length * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        errorRate: errorRate + '%',
        errors: errors.length,
        pageViews: pageViews.length,
        window,
        startTime
      }
    });
  } catch (error) {
    logger.error('[RUM API] Error calculating error rate', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/devices
 * Device breakdown
 */
router.get('/devices', async (req, res) => {
  try {
    const deviceStats = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
      unknown: 0
    };

    rumService.pageViews.forEach(pv => {
      const device = pv.deviceType || 'unknown';
      deviceStats[device] = (deviceStats[device] || 0) + 1;
    });

    const total = Object.values(deviceStats).reduce((sum, count) => sum + count, 0);

    const breakdown = Object.keys(deviceStats).map(device => ({
      device,
      count: deviceStats[device],
      percentage: total > 0
        ? ((deviceStats[device] / total) * 100).toFixed(1) + '%'
        : '0%'
    }));

    res.json({
      success: true,
      data: breakdown,
      total
    });
  } catch (error) {
    logger.error('[RUM API] Error getting device breakdown', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/browsers
 * Browser breakdown
 */
router.get('/browsers', async (req, res) => {
  try {
    const browserStats = {};

    rumService.pageViews.forEach(pv => {
      const browser = pv.browser || 'unknown';
      browserStats[browser] = (browserStats[browser] || 0) + 1;
    });

    const total = Object.values(browserStats).reduce((sum, count) => sum + count, 0);

    const breakdown = Object.keys(browserStats).map(browser => ({
      browser,
      count: browserStats[browser],
      percentage: total > 0
        ? ((browserStats[browser] / total) * 100).toFixed(1) + '%'
        : '0%'
    })).sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: breakdown,
      total
    });
  } catch (error) {
    logger.error('[RUM API] Error getting browser breakdown', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/countries
 * Geographic breakdown
 */
router.get('/countries', async (req, res) => {
  try {
    const countryStats = {};

    rumService.pageViews.forEach(pv => {
      const country = pv.country || 'unknown';
      countryStats[country] = (countryStats[country] || 0) + 1;
    });

    const total = Object.values(countryStats).reduce((sum, count) => sum + count, 0);

    const breakdown = Object.keys(countryStats).map(country => ({
      country,
      count: countryStats[country],
      percentage: total > 0
        ? ((countryStats[country] / total) * 100).toFixed(1) + '%'
        : '0%'
    })).sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: breakdown,
      total
    });
  } catch (error) {
    logger.error('[RUM API] Error getting country breakdown', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Trace Correlation Endpoints
// ============================================================================

/**
 * GET /api/rum/trace/:id
 * Get complete end-to-end trace
 */
router.get('/trace/:id', async (req, res) => {
  try {
    const trace = traceCorrelationService.getCompleteTrace(req.params.id);

    if (!trace) {
      return res.status(404).json({
        success: false,
        error: 'Trace not found'
      });
    }

    res.json({
      success: true,
      data: trace
    });
  } catch (error) {
    logger.error('[RUM API] Error getting trace', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/trace/:id/waterfall
 * Get waterfall visualization
 */
router.get('/trace/:id/waterfall', async (req, res) => {
  try {
    const waterfall = traceCorrelationService.generateWaterfall(req.params.id);

    if (!waterfall) {
      return res.status(404).json({
        success: false,
        error: 'Trace not found'
      });
    }

    res.json({
      success: true,
      data: waterfall
    });
  } catch (error) {
    logger.error('[RUM API] Error generating waterfall', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/trace/:id/breakdown
 * Get span breakdown
 */
router.get('/trace/:id/breakdown', async (req, res) => {
  try {
    const breakdown = traceCorrelationService.getSpanBreakdown(req.params.id);

    if (!breakdown) {
      return res.status(404).json({
        success: false,
        error: 'Trace not found'
      });
    }

    res.json({
      success: true,
      data: breakdown
    });
  } catch (error) {
    logger.error('[RUM API] Error getting breakdown', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/trace/:id/bottlenecks
 * Identify bottlenecks in trace
 */
router.get('/trace/:id/bottlenecks', async (req, res) => {
  try {
    const trace = traceCorrelationService.getCompleteTrace(req.params.id);

    if (!trace) {
      return res.status(404).json({
        success: false,
        error: 'Trace not found'
      });
    }

    res.json({
      success: true,
      data: {
        bottlenecks: trace.bottlenecks,
        totalDuration: trace.e2eLatency
      }
    });
  } catch (error) {
    logger.error('[RUM API] Error identifying bottlenecks', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Status & Health Endpoints
// ============================================================================

/**
 * GET /api/rum/status
 * Get RUM service status
 */
router.get('/status', async (req, res) => {
  try {
    const rumStatus = rumService.getStatus();
    const correlationStatus = traceCorrelationService.getStatus();

    res.json({
      success: true,
      data: {
        rum: rumStatus,
        traceCorrelation: correlationStatus
      }
    });
  } catch (error) {
    logger.error('[RUM API] Error getting status', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rum/stats
 * Get RUM statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const rumStatus = rumService.getStatus();
    const correlationStats = traceCorrelationService.getStatistics();

    res.json({
      success: true,
      data: {
        pageViews: rumStatus.pageViews,
        sessions: rumStatus.sessions,
        errors: rumStatus.errors,
        webVitals: rumStatus.webVitals,
        frontendTraces: correlationStats.frontendTraces,
        correlatedTraces: correlationStats.correlatedTraces,
        initialized: rumStatus.initialized && correlationStats.initialized
      }
    });
  } catch (error) {
    logger.error('[RUM API] Error getting stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
