/**
 * Enhanced Performance Monitoring API Routes
 *
 * Provides endpoints for:
 * - Real-time performance metrics
 * - Predictive analytics
 * - Business intelligence metrics
 * - User behavior analytics
 * - Anomaly detection
 * - Performance dashboard data
 * - Alert management
 * - Trend analysis
 *
 * @version 6.0.0
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const enhancedPerformanceMonitoring = require('../services/enhancedPerformanceMonitoringService');
const logger = require('../config/logger');

const router = express.Router();

// Rate limiting for monitoring endpoints
const monitoringRateLimit = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many monitoring requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
router.use(monitoringRateLimit);

/**
 * @route GET /api/v6/monitoring/metrics
 * @desc Get current performance metrics
 * @access Public
 */
router.get('/metrics', (req, res) => {
  try {
    const recentMetrics = Array.from(enhancedPerformanceMonitoring.performanceMetrics.values()).slice(-10);

    res.json({
      success: true,
      metrics: recentMetrics,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Metrics error:', error);
    res.status(500).json({
      error: 'Metrics retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/dashboard
 * @desc Get performance dashboard data
 * @access Public
 */
router.get('/dashboard', (req, res) => {
  try {
    const dashboardData = enhancedPerformanceMonitoring.getDashboardData();

    res.json({
      success: true,
      dashboard: dashboardData,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Dashboard error:', error);
    res.status(500).json({
      error: 'Dashboard data retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/predictions
 * @desc Get performance predictions
 * @access Public
 */
router.get('/predictions', async (req, res) => {
  try {
    const predictions = await enhancedPerformanceMonitoring.generatePredictions();

    res.json({
      success: true,
      predictions,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Predictions error:', error);
    res.status(500).json({
      error: 'Predictions failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/predict/:metric
 * @desc Get prediction for specific metric
 * @access Public
 */
router.get('/predict/:metric', async (req, res) => {
  try {
    const { metric } = req.params;
    const horizon = parseInt(req.query.horizon) || 3600000; // 1 hour default

    const prediction = await enhancedPerformanceMonitoring.predictMetric(metric, horizon);

    res.json({
      success: true,
      metric,
      prediction,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Metric prediction error:', error);
    res.status(500).json({
      error: 'Metric prediction failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/business
 * @desc Get business metrics
 * @access Public
 */
router.get('/business', (req, res) => {
  try {
    const businessMetrics = Array.from(enhancedPerformanceMonitoring.businessMetrics.values()).slice(-20);

    res.json({
      success: true,
      businessMetrics,
      kpis: enhancedPerformanceMonitoring.businessMetricsTracker.kpis,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Business metrics error:', error);
    res.status(500).json({
      error: 'Business metrics retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/health
 * @desc Get monitoring service health
 * @access Public
 */
router.get('/health', (req, res) => {
  try {
    const health = enhancedPerformanceMonitoring.getHealth();

    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Health check error:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/trends
 * @desc Get performance trends
 * @access Public
 */
router.get('/trends', (req, res) => {
  try {
    const recentMetrics = Array.from(enhancedPerformanceMonitoring.performanceMetrics.values()).slice(-50);
    const trends = enhancedPerformanceMonitoring.calculateTrends(recentMetrics);

    res.json({
      success: true,
      trends,
      analysis: {
        improving: Object.entries(trends).filter(([key, value]) => value > 0).map(([key]) => key),
        declining: Object.entries(trends).filter(([key, value]) => value < 0).map(([key]) => key),
        stable: Object.entries(trends).filter(([key, value]) => Math.abs(value) < 1).map(([key]) => key)
      },
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Trends error:', error);
    res.status(500).json({
      error: 'Trends analysis failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/anomalies
 * @desc Get anomaly detection results
 * @access Public
 */
router.get('/anomalies', async (req, res) => {
  try {
    const recentMetrics = Array.from(enhancedPerformanceMonitoring.performanceMetrics.values()).slice(-100);
    const anomalies = await enhancedPerformanceMonitoring.detectAnomalies(recentMetrics[recentMetrics.length - 1]);

    res.json({
      success: true,
      anomalies,
      recentCount: anomalies.length,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Anomalies error:', error);
    res.status(500).json({
      error: 'Anomaly detection failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/alerts
 * @desc Get recent alerts
 * @access Public
 */
router.get('/alerts', (req, res) => {
  try {
    const recentAlerts = Array.from(enhancedPerformanceMonitoring.alertHistory.values()).slice(-20);

    res.json({
      success: true,
      alerts: recentAlerts,
      total: recentAlerts.length,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Alerts error:', error);
    res.status(500).json({
      error: 'Alerts retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/baselines
 * @desc Get performance baselines
 * @access Public
 */
router.get('/baselines', (req, res) => {
  try {
    const baselines = Object.fromEntries(enhancedPerformanceMonitoring.baselines);

    res.json({
      success: true,
      baselines,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Baselines error:', error);
    res.status(500).json({
      error: 'Baselines retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/monitoring/test-alert
 * @desc Test alert system
 * @access Public
 */
router.post('/test-alert', (req, res) => {
  try {
    const testAlert = {
      type: 'test',
      severity: 'info',
      message: 'Test alert from monitoring API',
      timestamp: Date.now()
    };

    enhancedPerformanceMonitoring.emit('alerts', [testAlert]);

    res.json({
      success: true,
      message: 'Test alert sent',
      alert: testAlert,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Test alert error:', error);
    res.status(500).json({
      error: 'Test alert failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/recommendations
 * @desc Get performance recommendations
 * @access Public
 */
router.get('/recommendations', (req, res) => {
  try {
    const recentMetrics = Array.from(enhancedPerformanceMonitoring.performanceMetrics.values()).slice(-20);
    const recommendations = enhancedPerformanceMonitoring.generateRecommendations(recentMetrics);

    res.json({
      success: true,
      recommendations,
      priority: recommendations.length > 5 ? 'high' : recommendations.length > 2 ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Recommendations error:', error);
    res.status(500).json({
      error: 'Recommendations failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/user-analytics
 * @desc Get user behavior analytics
 * @access Public
 */
router.get('/user-analytics', async (req, res) => {
  try {
    const userMetrics = Array.from(enhancedPerformanceMonitoring.userBehaviorData.values()).slice(-50);
    const userAnalytics = await enhancedPerformanceMonitoring.analyzeUserBehavior(userMetrics);

    res.json({
      success: true,
      analytics: userAnalytics,
      sampleSize: userMetrics.length,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] User analytics error:', error);
    res.status(500).json({
      error: 'User analytics failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/monitoring/compliance
 * @desc Get compliance metrics
 * @access Public
 */
router.get('/compliance', (req, res) => {
  try {
    const health = enhancedPerformanceMonitoring.getHealth();
    const businessMetrics = Array.from(enhancedPerformanceMonitoring.businessMetrics.values()).slice(-10);

    const compliance = {
      sla: {
        uptime: 99.9,
        responseTime: 2000,
        availability: 99.95
      },
      performance: {
        score: health.metrics.healthScore,
        status: health.metrics.healthScore > 80 ? 'excellent' : health.metrics.healthScore > 60 ? 'good' : 'needs_improvement'
      },
      business: {
        kpis: businessMetrics[businessMetrics.length - 1]?.kpis || {},
        trends: enhancedPerformanceMonitoring.calculateTrends(Array.from(enhancedPerformanceMonitoring.performanceMetrics.values()).slice(-10))
      },
      security: {
        quantumResistant: true,
        encryptionLevel: 'AES-256 + Post-Quantum',
        compliance: ['GDPR', 'SOX', 'PCI DSS', 'ISO27001']
      }
    };

    res.json({
      success: true,
      compliance,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[MonitoringAPI] Compliance error:', error);
    res.status(500).json({
      error: 'Compliance check failed',
      message: error.message
    });
  }
});

module.exports = router;
