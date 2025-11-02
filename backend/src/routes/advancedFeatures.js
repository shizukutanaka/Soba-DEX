/**
 * Advanced Features API Routes (v3.8.0)
 *
 * Unified routes for:
 * - Advanced Analytics (Cohorts, Funnels, Segments, Retention)
 * - Real-time Streaming (WebSocket subscriptions)
 * - Custom Alerting (Alert rules and management)
 * - Model Ensembles (Ensemble creation and prediction)
 *
 * @module routes/advancedFeatures
 * @version 3.8.0
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Import services
const advancedAnalytics = require('../services/advancedAnalytics');
const realTimeStreaming = require('../services/realTimeStreaming');
const customAlerting = require('../services/customAlerting');
const modelEnsemble = require('../services/modelEnsemble');

// ============================================================================
// ADVANCED ANALYTICS ROUTES
// ============================================================================

// Cohort Routes
router.post('/analytics/cohorts/create', async (req, res) => {
  try {
    const cohort = await advancedAnalytics.createCohort(req.body);
    res.json({ success: true, cohort });
  } catch (error) {
    logger.error('Create cohort error:', error);
    res.status(500).json({ error: 'Failed to create cohort', message: error.message });
  }
});

router.get('/analytics/cohorts/:cohortId', async (req, res) => {
  try {
    const cohort = await advancedAnalytics.getCohort(req.params.cohortId);
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }
    res.json({ success: true, cohort });
  } catch (error) {
    logger.error('Get cohort error:', error);
    res.status(500).json({ error: 'Failed to get cohort', message: error.message });
  }
});

router.get('/analytics/cohorts/:cohortId/metrics', async (req, res) => {
  try {
    const metrics = await advancedAnalytics.getCohortMetrics(req.params.cohortId, req.query);
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('Get cohort metrics error:', error);
    res.status(500).json({ error: 'Failed to get cohort metrics', message: error.message });
  }
});

router.post('/analytics/cohorts/:cohortId/refresh', async (req, res) => {
  try {
    const userCount = await advancedAnalytics.calculateCohortSize(req.params.cohortId);
    res.json({ success: true, userCount });
  } catch (error) {
    logger.error('Refresh cohort error:', error);
    res.status(500).json({ error: 'Failed to refresh cohort', message: error.message });
  }
});

// Funnel Routes
router.post('/analytics/funnels/create', async (req, res) => {
  try {
    const funnel = await advancedAnalytics.createFunnel(req.body);
    res.json({ success: true, funnel });
  } catch (error) {
    logger.error('Create funnel error:', error);
    res.status(500).json({ error: 'Failed to create funnel', message: error.message });
  }
});

router.get('/analytics/funnels/:funnelId', async (req, res) => {
  try {
    const funnel = await advancedAnalytics.getFunnel(req.params.funnelId);
    if (!funnel) {
      return res.status(404).json({ error: 'Funnel not found' });
    }
    res.json({ success: true, funnel });
  } catch (error) {
    logger.error('Get funnel error:', error);
    res.status(500).json({ error: 'Failed to get funnel', message: error.message });
  }
});

router.get('/analytics/funnels/:funnelId/metrics', async (req, res) => {
  try {
    const metrics = await advancedAnalytics.getFunnelMetrics(req.params.funnelId, req.query);
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('Get funnel metrics error:', error);
    res.status(500).json({ error: 'Failed to get funnel metrics', message: error.message });
  }
});

router.post('/analytics/funnels/:funnelId/analyze', async (req, res) => {
  try {
    const { periodStart, periodEnd } = req.body;
    const metrics = await advancedAnalytics.analyzeFunnel(
      req.params.funnelId,
      new Date(periodStart),
      new Date(periodEnd)
    );
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('Analyze funnel error:', error);
    res.status(500).json({ error: 'Failed to analyze funnel', message: error.message });
  }
});

// Retention Routes
router.get('/analytics/retention', async (req, res) => {
  try {
    const metrics = await advancedAnalytics.getRetentionMetrics(req.query);
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('Get retention error:', error);
    res.status(500).json({ error: 'Failed to get retention metrics', message: error.message });
  }
});

// Segmentation Routes
router.get('/analytics/segments', async (req, res) => {
  try {
    const segments = await advancedAnalytics.getUserSegments(req.query);
    res.json({ success: true, segments, count: segments.length });
  } catch (error) {
    logger.error('Get segments error:', error);
    res.status(500).json({ error: 'Failed to get segments', message: error.message });
  }
});

router.post('/analytics/segments/create', async (req, res) => {
  try {
    const { userId } = req.body;
    const segment = await advancedAnalytics.segmentUsersByRFM(userId);
    res.json({ success: true, segment });
  } catch (error) {
    logger.error('Create segment error:', error);
    res.status(500).json({ error: 'Failed to create segment', message: error.message });
  }
});

// Analytics Health Check
router.get('/analytics/health', async (req, res) => {
  try {
    const health = await advancedAnalytics.healthCheck();
    res.json(health);
  } catch (error) {
    logger.error('Analytics health check error:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// ============================================================================
// REAL-TIME STREAMING ROUTES
// ============================================================================

router.post('/streaming/connect', async (req, res) => {
  try {
    const { connectionId, userId, userAgent, ipAddress } = req.body;
    const connection = await realTimeStreaming.connect(connectionId, {
      userId,
      userAgent: userAgent || req.get('user-agent'),
      ipAddress: ipAddress || req.ip,
    });
    res.json({ success: true, connection });
  } catch (error) {
    logger.error('Connect error:', error);
    res.status(500).json({ error: 'Failed to connect', message: error.message });
  }
});

router.post('/streaming/disconnect', async (req, res) => {
  try {
    const { connectionId, reason } = req.body;
    await realTimeStreaming.disconnect(connectionId, reason);
    res.json({ success: true, message: 'Disconnected successfully' });
  } catch (error) {
    logger.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect', message: error.message });
  }
});

router.post('/streaming/subscribe', async (req, res) => {
  try {
    const { connectionId, channel, filters } = req.body;
    const subscription = await realTimeStreaming.subscribe(connectionId, channel, filters);
    res.json({ success: true, subscription });
  } catch (error) {
    logger.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe', message: error.message });
  }
});

router.post('/streaming/unsubscribe', async (req, res) => {
  try {
    const { connectionId, channel } = req.body;
    await realTimeStreaming.unsubscribe(connectionId, channel);
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    logger.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe', message: error.message });
  }
});

router.get('/streaming/subscriptions', async (req, res) => {
  try {
    const { connectionId } = req.query;
    const subscriptions = realTimeStreaming.getSubscriptions(connectionId);
    res.json({ success: true, subscriptions });
  } catch (error) {
    logger.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Failed to get subscriptions', message: error.message });
  }
});

router.post('/streaming/publish', async (req, res) => {
  try {
    const { channel, message, options } = req.body;
    const sent = await realTimeStreaming.publish(channel, message, options);
    res.json({ success: true, subscribersReached: sent });
  } catch (error) {
    logger.error('Publish error:', error);
    res.status(500).json({ error: 'Failed to publish', message: error.message });
  }
});

router.get('/streaming/channels', async (req, res) => {
  try {
    const channels = realTimeStreaming.getAvailableChannels();
    res.json({ success: true, channels });
  } catch (error) {
    logger.error('Get channels error:', error);
    res.status(500).json({ error: 'Failed to get channels', message: error.message });
  }
});

router.get('/streaming/stats', async (req, res) => {
  try {
    const stats = await realTimeStreaming.getStatistics();
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Get streaming stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics', message: error.message });
  }
});

router.get('/streaming/health', async (req, res) => {
  try {
    const health = await realTimeStreaming.healthCheck();
    res.json(health);
  } catch (error) {
    logger.error('Streaming health check error:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// ============================================================================
// CUSTOM ALERTING ROUTES
// ============================================================================

router.post('/alerts/rules/create', async (req, res) => {
  try {
    const rule = await customAlerting.createRule(req.body);
    res.json({ success: true, rule });
  } catch (error) {
    logger.error('Create alert rule error:', error);
    res.status(500).json({ error: 'Failed to create alert rule', message: error.message });
  }
});

router.get('/alerts/rules', async (req, res) => {
  try {
    const rules = await customAlerting.listRules(req.query);
    res.json({ success: true, rules, count: rules.length });
  } catch (error) {
    logger.error('List alert rules error:', error);
    res.status(500).json({ error: 'Failed to list alert rules', message: error.message });
  }
});

router.get('/alerts/rules/:ruleId', async (req, res) => {
  try {
    const rule = await customAlerting.getRule(req.params.ruleId);
    if (!rule) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }
    res.json({ success: true, rule });
  } catch (error) {
    logger.error('Get alert rule error:', error);
    res.status(500).json({ error: 'Failed to get alert rule', message: error.message });
  }
});

router.put('/alerts/rules/:ruleId', async (req, res) => {
  try {
    const rule = await customAlerting.updateRule(req.params.ruleId, req.body);
    res.json({ success: true, rule });
  } catch (error) {
    logger.error('Update alert rule error:', error);
    res.status(500).json({ error: 'Failed to update alert rule', message: error.message });
  }
});

router.delete('/alerts/rules/:ruleId', async (req, res) => {
  try {
    const rule = await customAlerting.deleteRule(req.params.ruleId);
    res.json({ success: true, rule, message: 'Alert rule deleted' });
  } catch (error) {
    logger.error('Delete alert rule error:', error);
    res.status(500).json({ error: 'Failed to delete alert rule', message: error.message });
  }
});

router.post('/alerts/rules/:ruleId/enable', async (req, res) => {
  try {
    const rule = await customAlerting.updateRule(req.params.ruleId, { enabled: true });
    res.json({ success: true, rule, message: 'Alert rule enabled' });
  } catch (error) {
    logger.error('Enable alert rule error:', error);
    res.status(500).json({ error: 'Failed to enable alert rule', message: error.message });
  }
});

router.post('/alerts/rules/:ruleId/disable', async (req, res) => {
  try {
    const rule = await customAlerting.updateRule(req.params.ruleId, { enabled: false });
    res.json({ success: true, rule, message: 'Alert rule disabled' });
  } catch (error) {
    logger.error('Disable alert rule error:', error);
    res.status(500).json({ error: 'Failed to disable alert rule', message: error.message });
  }
});

router.get('/alerts/history', async (req, res) => {
  try {
    const history = await customAlerting.getAlertHistory(req.query);
    res.json({ success: true, history, count: history.length });
  } catch (error) {
    logger.error('Get alert history error:', error);
    res.status(500).json({ error: 'Failed to get alert history', message: error.message });
  }
});

router.get('/alerts/active', async (req, res) => {
  try {
    const alerts = await customAlerting.getActiveAlerts();
    res.json({ success: true, alerts, count: alerts.length });
  } catch (error) {
    logger.error('Get active alerts error:', error);
    res.status(500).json({ error: 'Failed to get active alerts', message: error.message });
  }
});

router.post('/alerts/history/:alertId/acknowledge', async (req, res) => {
  try {
    const { acknowledgedBy } = req.body;
    const alert = await customAlerting.acknowledgeAlert(req.params.alertId, acknowledgedBy);
    res.json({ success: true, alert, message: 'Alert acknowledged' });
  } catch (error) {
    logger.error('Acknowledge alert error:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert', message: error.message });
  }
});

router.post('/alerts/history/:alertId/resolve', async (req, res) => {
  try {
    const { resolvedBy, resolutionNotes } = req.body;
    const alert = await customAlerting.resolveAlert(
      req.params.alertId,
      resolvedBy,
      resolutionNotes
    );
    res.json({ success: true, alert, message: 'Alert resolved' });
  } catch (error) {
    logger.error('Resolve alert error:', error);
    res.status(500).json({ error: 'Failed to resolve alert', message: error.message });
  }
});

router.get('/alerts/health', async (req, res) => {
  try {
    const health = await customAlerting.healthCheck();
    res.json(health);
  } catch (error) {
    logger.error('Alerting health check error:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// ============================================================================
// MODEL ENSEMBLE ROUTES
// ============================================================================

router.post('/ensembles/create', async (req, res) => {
  try {
    const ensemble = await modelEnsemble.createEnsemble(req.body);
    res.json({ success: true, ensemble });
  } catch (error) {
    logger.error('Create ensemble error:', error);
    res.status(500).json({ error: 'Failed to create ensemble', message: error.message });
  }
});

router.get('/ensembles', async (req, res) => {
  try {
    const ensembles = await modelEnsemble.listEnsembles(req.query);
    res.json({ success: true, ensembles, count: ensembles.length });
  } catch (error) {
    logger.error('List ensembles error:', error);
    res.status(500).json({ error: 'Failed to list ensembles', message: error.message });
  }
});

router.get('/ensembles/:ensembleId', async (req, res) => {
  try {
    const ensemble = await modelEnsemble.getEnsemble(req.params.ensembleId);
    if (!ensemble) {
      return res.status(404).json({ error: 'Ensemble not found' });
    }
    res.json({ success: true, ensemble });
  } catch (error) {
    logger.error('Get ensemble error:', error);
    res.status(500).json({ error: 'Failed to get ensemble', message: error.message });
  }
});

router.put('/ensembles/:ensembleId', async (req, res) => {
  try {
    const ensemble = await modelEnsemble.updateEnsemble(req.params.ensembleId, req.body);
    res.json({ success: true, ensemble });
  } catch (error) {
    logger.error('Update ensemble error:', error);
    res.status(500).json({ error: 'Failed to update ensemble', message: error.message });
  }
});

router.delete('/ensembles/:ensembleId', async (req, res) => {
  try {
    const ensemble = await modelEnsemble.deleteEnsemble(req.params.ensembleId);
    res.json({ success: true, ensemble, message: 'Ensemble deleted' });
  } catch (error) {
    logger.error('Delete ensemble error:', error);
    res.status(500).json({ error: 'Failed to delete ensemble', message: error.message });
  }
});

router.post('/ensembles/:ensembleId/predict', async (req, res) => {
  try {
    const { inputData } = req.body;
    const prediction = await modelEnsemble.predict(req.params.ensembleId, inputData);
    res.json({ success: true, prediction });
  } catch (error) {
    logger.error('Ensemble predict error:', error);
    res.status(500).json({ error: 'Failed to make prediction', message: error.message });
  }
});

router.post('/ensembles/:ensembleId/optimize', async (req, res) => {
  try {
    const weights = await modelEnsemble.optimizeWeights(req.params.ensembleId);
    res.json({ success: true, weights, message: 'Weights optimized' });
  } catch (error) {
    logger.error('Optimize ensemble error:', error);
    res.status(500).json({ error: 'Failed to optimize weights', message: error.message });
  }
});

router.post('/ensembles/:ensembleId/deploy', async (req, res) => {
  try {
    const ensemble = await modelEnsemble.deployEnsemble(req.params.ensembleId);
    res.json({ success: true, ensemble, message: 'Ensemble deployed' });
  } catch (error) {
    logger.error('Deploy ensemble error:', error);
    res.status(500).json({ error: 'Failed to deploy ensemble', message: error.message });
  }
});

router.post('/ensembles/:ensembleId/retire', async (req, res) => {
  try {
    const ensemble = await modelEnsemble.retireEnsemble(req.params.ensembleId);
    res.json({ success: true, ensemble, message: 'Ensemble retired' });
  } catch (error) {
    logger.error('Retire ensemble error:', error);
    res.status(500).json({ error: 'Failed to retire ensemble', message: error.message });
  }
});

router.get('/ensembles/health', async (req, res) => {
  try {
    const health = await modelEnsemble.healthCheck();
    res.json(health);
  } catch (error) {
    logger.error('Ensemble health check error:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// ============================================================================
// COMBINED HEALTH CHECK
// ============================================================================

router.get('/health', async (req, res) => {
  try {
    const [analytics, streaming, alerting, ensemble] = await Promise.all([
      advancedAnalytics.healthCheck(),
      realTimeStreaming.healthCheck(),
      customAlerting.healthCheck(),
      modelEnsemble.healthCheck(),
    ]);

    res.json({
      status: 'healthy',
      version: '3.8.0',
      services: {
        advancedAnalytics: analytics,
        realTimeStreaming: streaming,
        customAlerting: alerting,
        modelEnsemble: ensemble,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
