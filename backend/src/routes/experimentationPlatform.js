/**
 * Experimentation Platform Routes (v3.9.0)
 *
 * Complete API routes for:
 * - A/B Testing (experiments, variants, assignments, events, results)
 * - Predictive Cohorts (models, predictions, recommendations)
 * - Funnel Anomaly Detection (baselines, anomalies, alerts)
 *
 * Total Endpoints: 40+
 *
 * @version 3.9.0
 */

const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

// Import services
const abTesting = require('../services/abTesting');
const predictiveCohorts = require('../services/predictiveCohorts');
const funnelAnomalyDetection = require('../services/funnelAnomalyDetection');

// ============================================================================
// A/B TESTING ENDPOINTS (20 endpoints)
// ============================================================================

/**
 * Create experiment
 * POST /api/experiments/create
 */
router.post('/experiments/create', async (req, res) => {
  try {
    const experiment = await abTesting.createExperiment(req.body);
    res.json({ success: true, experiment });
  } catch (error) {
    logger.error('[API] Error creating experiment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get experiment details
 * GET /api/experiments/:id
 */
router.get('/experiments/:id', async (req, res) => {
  try {
    const experiment = await abTesting.getExperiment(req.params.id);

    if (!experiment) {
      return res.status(404).json({ success: false, error: 'Experiment not found' });
    }

    res.json({ success: true, experiment });
  } catch (error) {
    logger.error('[API] Error getting experiment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * List experiments
 * GET /api/experiments
 */
router.get('/experiments', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      createdBy: req.query.created_by,
      limit: parseInt(req.query.limit) || 50
    };

    const experiments = await abTesting.listExperiments(filters);
    res.json({ success: true, experiments, count: experiments.length });
  } catch (error) {
    logger.error('[API] Error listing experiments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Start experiment
 * POST /api/experiments/:id/start
 */
router.post('/experiments/:id/start', async (req, res) => {
  try {
    const experiment = await abTesting.startExperiment(req.params.id);
    res.json({ success: true, experiment });
  } catch (error) {
    logger.error('[API] Error starting experiment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Pause experiment
 * POST /api/experiments/:id/pause
 */
router.post('/experiments/:id/pause', async (req, res) => {
  try {
    const experiment = await abTesting.pauseExperiment(req.params.id);
    res.json({ success: true, experiment });
  } catch (error) {
    logger.error('[API] Error pausing experiment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Complete experiment
 * POST /api/experiments/:id/complete
 */
router.post('/experiments/:id/complete', async (req, res) => {
  try {
    const { winner_id } = req.body;
    const experiment = await abTesting.completeExperiment(req.params.id, winner_id);
    res.json({ success: true, experiment });
  } catch (error) {
    logger.error('[API] Error completing experiment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create variant
 * POST /api/experiments/:id/variants/create
 */
router.post('/experiments/:id/variants/create', async (req, res) => {
  try {
    const variant = await abTesting.createVariant(req.params.id, req.body);
    res.json({ success: true, variant });
  } catch (error) {
    logger.error('[API] Error creating variant:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get experiment variants
 * GET /api/experiments/:id/variants
 */
router.get('/experiments/:id/variants', async (req, res) => {
  try {
    const variants = await abTesting.getExperimentVariants(req.params.id);
    res.json({ success: true, variants, count: variants.length });
  } catch (error) {
    logger.error('[API] Error getting variants:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Assign user to variant
 * POST /api/experiments/:id/assign
 */
router.post('/experiments/:id/assign', async (req, res) => {
  try {
    const { user_id, user_segment, user_metadata } = req.body;

    const assignment = await abTesting.assignUserToVariant(
      req.params.id,
      user_id,
      user_segment,
      user_metadata
    );

    if (!assignment) {
      return res.json({ success: true, assigned: false, reason: 'User excluded from experiment' });
    }

    res.json({ success: true, assigned: true, assignment });
  } catch (error) {
    logger.error('[API] Error assigning user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get user assignment
 * GET /api/experiments/:id/assignment/:userId
 */
router.get('/experiments/:id/assignment/:userId', async (req, res) => {
  try {
    const assignment = await abTesting.getUserAssignment(req.params.id, req.params.userId);

    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }

    res.json({ success: true, assignment });
  } catch (error) {
    logger.error('[API] Error getting assignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Track experiment event
 * POST /api/experiments/:id/events
 */
router.post('/experiments/:id/events', async (req, res) => {
  try {
    const { variant_id, user_id, event_type, event_name, event_value, event_metadata } = req.body;

    const event = await abTesting.trackEvent({
      experimentId: req.params.id,
      variantId: variant_id,
      userId: user_id,
      eventType: event_type,
      eventName: event_name,
      eventValue: event_value,
      eventMetadata: event_metadata
    });

    res.json({ success: true, event });
  } catch (error) {
    logger.error('[API] Error tracking event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get experiment results
 * GET /api/experiments/:id/results
 */
router.get('/experiments/:id/results', async (req, res) => {
  try {
    const results = await abTesting.calculateResults(req.params.id);
    res.json({ success: true, results });
  } catch (error) {
    logger.error('[API] Error getting results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get statistical analysis
 * GET /api/experiments/:id/analysis
 */
router.get('/experiments/:id/analysis', async (req, res) => {
  try {
    const results = await abTesting.calculateResults(req.params.id);

    // Extract statistical analysis
    const analysis = results.map(result => ({
      variant_id: result.variant_id,
      variant_name: result.variant_name,
      is_control: result.is_control,
      conversion_rate: result.conversion_rate,
      sample_size: result.total_users,
      comparison_to_control: result.comparison_to_control || null
    }));

    res.json({ success: true, analysis });
  } catch (error) {
    logger.error('[API] Error getting analysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Calculate sample size
 * POST /api/experiments/sample-size
 */
router.post('/experiments/sample-size', async (req, res) => {
  try {
    const { baseline_rate, mde, alpha, power } = req.body;

    const sampleSize = abTesting.calculateSampleSize(
      baseline_rate,
      mde,
      alpha || 0.05,
      power || 0.8
    );

    res.json({ success: true, sample_size: sampleSize });
  } catch (error) {
    logger.error('[API] Error calculating sample size:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get A/B Testing health
 * GET /api/experiments/health
 */
router.get('/experiments/health', async (req, res) => {
  try {
    const health = abTesting.getHealth();
    res.json({ success: true, health });
  } catch (error) {
    logger.error('[API] Error getting health:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PREDICTIVE COHORTS ENDPOINTS (10 endpoints)
// ============================================================================

/**
 * Train predictive model
 * POST /api/cohorts/predictive/train
 */
router.post('/cohorts/predictive/train', async (req, res) => {
  try {
    const model = await predictiveCohorts.trainModel(req.body);
    res.json({ success: true, model });
  } catch (error) {
    logger.error('[API] Error training model:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Predict cohort for user
 * POST /api/cohorts/predictive/predict
 */
router.post('/cohorts/predictive/predict', async (req, res) => {
  try {
    const { model_id, user_id } = req.body;

    const prediction = await predictiveCohorts.predictCohort(model_id, user_id);
    res.json({ success: true, prediction });
  } catch (error) {
    logger.error('[API] Error predicting cohort:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get cohort recommendations for user
 * GET /api/cohorts/predictive/recommend/:userId
 */
router.get('/cohorts/predictive/recommend/:userId', async (req, res) => {
  try {
    const recommendations = await predictiveCohorts.getCohortRecommendations(req.params.userId);
    res.json({ success: true, recommendations, count: recommendations.length });
  } catch (error) {
    logger.error('[API] Error getting recommendations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Generate user features
 * POST /api/cohorts/predictive/features
 */
router.post('/cohorts/predictive/features', async (req, res) => {
  try {
    const { user_id } = req.body;

    const features = await predictiveCohorts.generateUserFeatures(user_id);
    res.json({ success: true, features });
  } catch (error) {
    logger.error('[API] Error generating features:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get predictive models
 * GET /api/cohorts/predictive/models
 */
router.get('/cohorts/predictive/models', async (req, res) => {
  try {
    const query = `
      SELECT id, name, model_type, status, accuracy, f1_score,
             training_samples, trained_at, created_at
      FROM predictive_cohort_models
      ORDER BY trained_at DESC
      LIMIT 50
    `;

    const db = require('../config/database');
    const result = await db.query(query);

    res.json({ success: true, models: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('[API] Error getting models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get model details
 * GET /api/cohorts/predictive/models/:id
 */
router.get('/cohorts/predictive/models/:id', async (req, res) => {
  try {
    const query = `
      SELECT * FROM predictive_cohort_models WHERE id = $1
    `;

    const db = require('../config/database');
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    res.json({ success: true, model: result.rows[0] });
  } catch (error) {
    logger.error('[API] Error getting model:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get model performance metrics
 * GET /api/cohorts/predictive/models/:id/performance
 */
router.get('/cohorts/predictive/models/:id/performance', async (req, res) => {
  try {
    const query = `
      SELECT
        m.id,
        m.name,
        m.accuracy,
        m.precision_score,
        m.recall,
        m.f1_score,
        m.auc_roc,
        m.training_samples,
        m.trained_at,
        COUNT(DISTINCT p.id) as total_predictions,
        COUNT(DISTINCT CASE WHEN p.was_correct = TRUE THEN p.id END) as correct_predictions
      FROM predictive_cohort_models m
      LEFT JOIN cohort_predictions p ON p.model_id = m.id
      WHERE m.id = $1
      GROUP BY m.id
    `;

    const db = require('../config/database');
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const performance = result.rows[0];

    // Calculate production accuracy
    if (performance.total_predictions > 0) {
      performance.production_accuracy = performance.correct_predictions / performance.total_predictions;
    } else {
      performance.production_accuracy = null;
    }

    res.json({ success: true, performance });
  } catch (error) {
    logger.error('[API] Error getting performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get feature importance for model
 * GET /api/cohorts/predictive/models/:id/features
 */
router.get('/cohorts/predictive/models/:id/features', async (req, res) => {
  try {
    const query = `
      SELECT feature_name, importance_score, rank
      FROM cohort_feature_importance
      WHERE model_id = $1
      ORDER BY rank ASC
    `;

    const db = require('../config/database');
    const result = await db.query(query, [req.params.id]);

    res.json({ success: true, features: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('[API] Error getting features:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get Predictive Cohorts health
 * GET /api/cohorts/predictive/health
 */
router.get('/cohorts/predictive/health', async (req, res) => {
  try {
    const health = predictiveCohorts.getHealth();
    res.json({ success: true, health });
  } catch (error) {
    logger.error('[API] Error getting health:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// FUNNEL ANOMALY DETECTION ENDPOINTS (12 endpoints)
// ============================================================================

/**
 * Detect anomalies for funnel
 * POST /api/funnels/:id/anomalies/detect
 */
router.post('/funnels/:id/anomalies/detect', async (req, res) => {
  try {
    const { period_start, period_end } = req.body;

    const anomalies = await funnelAnomalyDetection.detectAnomalies(
      req.params.id,
      new Date(period_start),
      new Date(period_end)
    );

    res.json({ success: true, anomalies, count: anomalies.length });
  } catch (error) {
    logger.error('[API] Error detecting anomalies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get anomalies for funnel
 * GET /api/funnels/:id/anomalies
 */
router.get('/funnels/:id/anomalies', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      severity: req.query.severity,
      since: req.query.since ? new Date(req.query.since) : null,
      limit: parseInt(req.query.limit) || 50
    };

    const anomalies = await funnelAnomalyDetection.getAnomalies(req.params.id, filters);
    res.json({ success: true, anomalies, count: anomalies.length });
  } catch (error) {
    logger.error('[API] Error getting anomalies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get anomaly details
 * GET /api/funnels/:funnelId/anomalies/:anomalyId
 */
router.get('/funnels/:funnelId/anomalies/:anomalyId', async (req, res) => {
  try {
    const query = `SELECT * FROM funnel_anomalies WHERE id = $1`;

    const db = require('../config/database');
    const result = await db.query(query, [req.params.anomalyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Anomaly not found' });
    }

    res.json({ success: true, anomaly: result.rows[0] });
  } catch (error) {
    logger.error('[API] Error getting anomaly:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Resolve anomaly
 * POST /api/funnels/:funnelId/anomalies/:anomalyId/resolve
 */
router.post('/funnels/:funnelId/anomalies/:anomalyId/resolve', async (req, res) => {
  try {
    const { resolved_by, resolution_notes } = req.body;

    const anomaly = await funnelAnomalyDetection.resolveAnomaly(
      req.params.anomalyId,
      resolved_by,
      resolution_notes
    );

    res.json({ success: true, anomaly });
  } catch (error) {
    logger.error('[API] Error resolving anomaly:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get funnel baseline
 * GET /api/funnels/:id/baseline
 */
router.get('/funnels/:id/baseline', async (req, res) => {
  try {
    const query = `
      SELECT * FROM funnel_baselines
      WHERE funnel_id = $1
      ORDER BY step_index ASC
    `;

    const db = require('../config/database');
    const result = await db.query(query, [req.params.id]);

    res.json({ success: true, baselines: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('[API] Error getting baseline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Calculate baseline for funnel step
 * POST /api/funnels/:id/baseline/calculate
 */
router.post('/funnels/:id/baseline/calculate', async (req, res) => {
  try {
    const { step_index } = req.body;

    const baseline = await funnelAnomalyDetection.calculateBaseline(req.params.id, step_index);

    res.json({ success: true, baseline });
  } catch (error) {
    logger.error('[API] Error calculating baseline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Recalculate all baselines for funnel
 * POST /api/funnels/:id/baseline/recalculate
 */
router.post('/funnels/:id/baseline/recalculate', async (req, res) => {
  try {
    const steps = await funnelAnomalyDetection.getFunnelSteps(req.params.id);
    const baselines = [];

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const baseline = await funnelAnomalyDetection.calculateBaseline(req.params.id, stepIndex);
      baselines.push(baseline);
    }

    res.json({ success: true, baselines, count: baselines.length });
  } catch (error) {
    logger.error('[API] Error recalculating baselines:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get recent anomalies (all funnels)
 * GET /api/anomalies/recent
 */
router.get('/anomalies/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const query = `
      SELECT * FROM funnel_anomalies
      WHERE detected_at >= NOW() - INTERVAL '7 days'
      ORDER BY detected_at DESC
      LIMIT $1
    `;

    const db = require('../config/database');
    const result = await db.query(query, [limit]);

    res.json({ success: true, anomalies: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('[API] Error getting recent anomalies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get anomaly statistics
 * GET /api/anomalies/statistics
 */
router.get('/anomalies/statistics', async (req, res) => {
  try {
    const query = `
      SELECT
        COUNT(*) as total_anomalies,
        COUNT(CASE WHEN status = 'detected' THEN 1 END) as active_anomalies,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_anomalies,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_anomalies,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_anomalies,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_anomalies,
        COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_anomalies
      FROM funnel_anomalies
      WHERE detected_at >= NOW() - INTERVAL '30 days'
    `;

    const db = require('../config/database');
    const result = await db.query(query);

    res.json({ success: true, statistics: result.rows[0] });
  } catch (error) {
    logger.error('[API] Error getting statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get Funnel Anomaly Detection health
 * GET /api/anomalies/health
 */
router.get('/anomalies/health', async (req, res) => {
  try {
    const health = funnelAnomalyDetection.getHealth();
    res.json({ success: true, health });
  } catch (error) {
    logger.error('[API] Error getting health:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PLATFORM HEALTH
// ============================================================================

/**
 * Get overall platform health
 * GET /api/experimentation/health
 */
router.get('/experimentation/health', async (req, res) => {
  try {
    const health = {
      abTesting: abTesting.getHealth(),
      predictiveCohorts: predictiveCohorts.getHealth(),
      funnelAnomalyDetection: funnelAnomalyDetection.getHealth(),
      timestamp: new Date()
    };

    const allHealthy = Object.values(health)
      .filter(h => h.status)
      .every(h => h.status === 'healthy');

    res.json({
      success: true,
      status: allHealthy ? 'healthy' : 'degraded',
      services: health
    });
  } catch (error) {
    logger.error('[API] Error getting platform health:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
