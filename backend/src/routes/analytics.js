/**
 * Analytics API Routes
 *
 * Endpoints for trace analytics, SLO monitoring, alerting, and baselines.
 *
 * @version 3.1.0
 */

const express = require('express');
const router = express.Router();
const traceAnalytics = require('../services/traceAnalyticsService');
const sloMonitoring = require('../services/sloMonitoringService');
const alerting = require('../services/alertingService');
const baseline = require('../services/baselineService');
const logger = require('../config/logger');

// ============================================================================
// Trace Analytics Endpoints
// ============================================================================

/**
 * GET /api/analytics/anomalies
 * Get detected anomalies
 */
router.get('/anomalies', (req, res) => {
  try {
    const options = {
      service: req.query.service,
      severity: req.query.severity,
      type: req.query.type,
      limit: parseInt(req.query.limit) || 100,
    };

    const anomalies = traceAnalytics.getAnomalies(options);

    res.json({
      success: true,
      count: anomalies.length,
      anomalies,
    });
  } catch (error) {
    logger.error('[Analytics API] Get anomalies failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/analytics/regressions
 * Get detected performance regressions
 */
router.get('/regressions', (req, res) => {
  try {
    const options = {
      service: req.query.service,
      limit: parseInt(req.query.limit) || 100,
    };

    const regressions = traceAnalytics.getRegressions(options);

    res.json({
      success: true,
      count: regressions.length,
      regressions,
    });
  } catch (error) {
    logger.error('[Analytics API] Get regressions failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/analytics/service/:service
 * Get service statistics
 */
router.get('/service/:service', (req, res) => {
  try {
    const service = req.params.service;
    const stats = traceAnalytics.getServiceStatistics(service);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Service not found or no data available',
      });
    }

    res.json({
      success: true,
      statistics: stats,
    });
  } catch (error) {
    logger.error('[Analytics API] Get service stats failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/analytics/stats
 * Get overall analytics statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = traceAnalytics.getStatistics();

    res.json({
      success: true,
      statistics: stats,
    });
  } catch (error) {
    logger.error('[Analytics API] Get stats failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/analytics/baselines/update
 * Manually trigger baseline update
 */
router.post('/baselines/update', async (req, res) => {
  try {
    await traceAnalytics.updateBaselines();

    res.json({
      success: true,
      message: 'Baselines updated successfully',
    });
  } catch (error) {
    logger.error('[Analytics API] Baseline update failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// SLO Monitoring Endpoints
// ============================================================================

/**
 * GET /api/slo
 * Get all SLOs
 */
router.get('/slo', (req, res) => {
  try {
    const slos = sloMonitoring.getAllSLOs();

    res.json({
      success: true,
      count: slos.length,
      slos,
    });
  } catch (error) {
    logger.error('[SLO API] Get SLOs failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/slo
 * Create a new SLO
 */
router.post('/slo', (req, res) => {
  try {
    const config = req.body;
    const slo = sloMonitoring.createSLO(config);

    res.status(201).json({
      success: true,
      slo,
    });
  } catch (error) {
    logger.error('[SLO API] Create SLO failed:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/slo/:id
 * Get SLO by ID
 */
router.get('/slo/:id', (req, res) => {
  try {
    const slo = sloMonitoring.getSLO(req.params.id);

    if (!slo) {
      return res.status(404).json({
        success: false,
        error: 'SLO not found',
      });
    }

    res.json({
      success: true,
      slo,
    });
  } catch (error) {
    logger.error('[SLO API] Get SLO failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/slo/:id/status
 * Get SLO compliance status
 */
router.get('/slo/:id/status', (req, res) => {
  try {
    const status = sloMonitoring.getSLOStatus(req.params.id);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'SLO not found',
      });
    }

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    logger.error('[SLO API] Get SLO status failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/slo/:id/error-budget
 * Get error budget details
 */
router.get('/slo/:id/error-budget', (req, res) => {
  try {
    const errorBudget = sloMonitoring.getErrorBudget(req.params.id);

    if (!errorBudget) {
      return res.status(404).json({
        success: false,
        error: 'SLO not found',
      });
    }

    res.json({
      success: true,
      errorBudget,
    });
  } catch (error) {
    logger.error('[SLO API] Get error budget failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/slo/:id/measurement
 * Record a measurement for SLO
 */
router.post('/slo/:id/measurement', (req, res) => {
  try {
    const sloId = req.params.id;
    const measurement = req.body;

    sloMonitoring.recordMeasurement(sloId, measurement);

    res.json({
      success: true,
      message: 'Measurement recorded',
    });
  } catch (error) {
    logger.error('[SLO API] Record measurement failed:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/slo/:id
 * Delete SLO
 */
router.delete('/slo/:id', (req, res) => {
  try {
    const deleted = sloMonitoring.deleteSLO(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'SLO not found',
      });
    }

    res.json({
      success: true,
      message: 'SLO deleted',
    });
  } catch (error) {
    logger.error('[SLO API] Delete SLO failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/slo/:id/violations
 * Get SLO violations
 */
router.get('/slo/:id/violations', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const violations = sloMonitoring.getViolations(req.params.id, limit);

    res.json({
      success: true,
      count: violations.length,
      violations,
    });
  } catch (error) {
    logger.error('[SLO API] Get violations failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Alerting Endpoints
// ============================================================================

/**
 * GET /api/alerts
 * Get active alerts
 */
router.get('/alerts', (req, res) => {
  try {
    const options = {
      severity: req.query.severity,
      ruleId: req.query.ruleId,
    };

    const alerts = alerting.getActiveAlerts(options);

    res.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    logger.error('[Alerts API] Get alerts failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/alerts/history
 * Get alert history
 */
router.get('/alerts/history', (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 100,
    };

    const history = alerting.getAlertHistory(options);

    res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    logger.error('[Alerts API] Get history failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/alerts/rules
 * Get all alert rules
 */
router.get('/alerts/rules', (req, res) => {
  try {
    const rules = alerting.getAllRules();

    res.json({
      success: true,
      count: rules.length,
      rules,
    });
  } catch (error) {
    logger.error('[Alerts API] Get rules failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/alerts/rules
 * Create alert rule
 */
router.post('/alerts/rules', (req, res) => {
  try {
    const ruleConfig = req.body;
    const rule = alerting.createRule(ruleConfig);

    res.status(201).json({
      success: true,
      rule,
    });
  } catch (error) {
    logger.error('[Alerts API] Create rule failed:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/alerts/rules/:id
 * Update alert rule
 */
router.put('/alerts/rules/:id', (req, res) => {
  try {
    const rule = alerting.updateRule(req.params.id, req.body);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
    }

    res.json({
      success: true,
      rule,
    });
  } catch (error) {
    logger.error('[Alerts API] Update rule failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/alerts/rules/:id
 * Delete alert rule
 */
router.delete('/alerts/rules/:id', (req, res) => {
  try {
    const deleted = alerting.deleteRule(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
    }

    res.json({
      success: true,
      message: 'Rule deleted',
    });
  } catch (error) {
    logger.error('[Alerts API] Delete rule failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:id/acknowledge', (req, res) => {
  try {
    const acknowledgedBy = req.body.acknowledgedBy || 'api';
    const alert = alerting.acknowledgeAlert(req.params.id, acknowledgedBy);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    res.json({
      success: true,
      alert,
    });
  } catch (error) {
    logger.error('[Alerts API] Acknowledge alert failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/alerts/:id/resolve
 * Resolve an alert
 */
router.post('/alerts/:id/resolve', (req, res) => {
  try {
    const resolvedBy = req.body.resolvedBy || 'api';
    const alert = alerting.resolveAlert(req.params.id, resolvedBy);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    res.json({
      success: true,
      alert,
    });
  } catch (error) {
    logger.error('[Alerts API] Resolve alert failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/alerts/rules/:id/silence
 * Silence alert rule
 */
router.post('/alerts/rules/:id/silence', (req, res) => {
  try {
    const duration = parseInt(req.body.duration) || 60 * 60 * 1000; // Default 1 hour
    alerting.silenceRule(req.params.id, duration);

    res.json({
      success: true,
      message: `Rule silenced for ${duration}ms`,
    });
  } catch (error) {
    logger.error('[Alerts API] Silence rule failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Baseline Endpoints
// ============================================================================

/**
 * GET /api/baselines
 * Get all baselines
 */
router.get('/baselines', (req, res) => {
  try {
    const baselines = baseline.getAllBaselines();

    res.json({
      success: true,
      count: baselines.length,
      baselines,
    });
  } catch (error) {
    logger.error('[Baseline API] Get baselines failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/baselines/calculate
 * Calculate baseline for a service metric
 */
router.post('/baselines/calculate', async (req, res) => {
  try {
    const { service, metric, type, options } = req.body;

    if (!service || !metric) {
      return res.status(400).json({
        success: false,
        error: 'service and metric are required',
      });
    }

    const result = await baseline.calculateBaseline(service, metric, {
      type: type || 'rolling',
      ...options,
    });

    if (!result) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient data for baseline calculation',
      });
    }

    res.json({
      success: true,
      baseline: result,
    });
  } catch (error) {
    logger.error('[Baseline API] Calculate baseline failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselines/:service/:metric
 * Get baseline for a service metric
 */
router.get('/baselines/:service/:metric', (req, res) => {
  try {
    const result = baseline.getBaseline(req.params.service, req.params.metric);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Baseline not found',
      });
    }

    res.json({
      success: true,
      baseline: result,
    });
  } catch (error) {
    logger.error('[Baseline API] Get baseline failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/baselines/compare
 * Compare current value against baseline
 */
router.post('/baselines/compare', (req, res) => {
  try {
    const { service, metric, value } = req.body;

    if (!service || !metric || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'service, metric, and value are required',
      });
    }

    const comparison = baseline.compareToBaseline(service, metric, value);

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    logger.error('[Baseline API] Compare baseline failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselines/:service/:metric/trend
 * Analyze trend for a service metric
 */
router.get('/baselines/:service/:metric/trend', (req, res) => {
  try {
    const windowDays = parseInt(req.query.windowDays) || 7;
    const trend = baseline.analyzeTrend(
      req.params.service,
      req.params.metric,
      windowDays
    );

    res.json({
      success: true,
      trend,
    });
  } catch (error) {
    logger.error('[Baseline API] Analyze trend failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselines/:service
 * Get all baselines for a service
 */
router.get('/baselines/:service', (req, res) => {
  try {
    const baselines = baseline.getServiceBaselines(req.params.service);

    res.json({
      success: true,
      count: baselines.length,
      baselines,
    });
  } catch (error) {
    logger.error('[Baseline API] Get service baselines failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Health & Statistics
// ============================================================================

/**
 * GET /api/analytics/health
 * Get health status of all analytics services
 */
router.get('/health', (req, res) => {
  try {
    const health = {
      traceAnalytics: traceAnalytics.getStatistics(),
      sloMonitoring: sloMonitoring.getStatistics(),
      alerting: alerting.getStatistics(),
      baseline: baseline.getStatistics(),
      timestamp: Date.now(),
    };

    res.json({
      success: true,
      health,
    });
  } catch (error) {
    logger.error('[Analytics API] Health check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
