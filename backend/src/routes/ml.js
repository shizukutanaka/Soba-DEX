/**
 * Machine Learning & Advanced Analytics API Routes
 *
 * RESTful API endpoints for ML and analytics services:
 * - ML Anomaly Detection
 * - Predictive Scaling
 * - Advanced A/B Testing
 * - User Behavior Analytics
 * - Auto-tuning
 *
 * @version 3.4.0
 */

const express = require('express');
const router = express.Router();
const mlAnomalyDetection = require('../services/mlAnomalyDetection');
const predictiveScaling = require('../services/predictiveScaling');
const advancedABTesting = require('../services/advancedABTesting');
const userBehaviorAnalytics = require('../services/userBehaviorAnalytics');
const autoTuningService = require('../services/autoTuningService');
const logger = require('../config/logger');

/**
 * @route   GET /api/ml/health
 * @desc    Health check for ML services
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    services: {
      mlAnomalyDetection: mlAnomalyDetection.initialized,
      predictiveScaling: predictiveScaling.initialized,
      advancedABTesting: advancedABTesting.initialized,
      userBehaviorAnalytics: userBehaviorAnalytics.initialized,
      autoTuning: autoTuningService.initialized
    },
    timestamp: new Date()
  });
});

// ============================================================================
// ML Anomaly Detection Routes
// ============================================================================

/**
 * @route   POST /api/ml/anomaly-detection/detect
 * @desc    Detect anomalies in metrics
 * @access  Private
 */
router.post('/anomaly-detection/detect', async (req, res) => {
  try {
    const { metrics, context } = req.body;

    if (!metrics) {
      return res.status(400).json({ error: 'Metrics required' });
    }

    const detection = await mlAnomalyDetection.detectAnomalies(metrics, context);

    res.json(detection);
  } catch (error) {
    logger.error('[ML API] Anomaly detection error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/anomaly-detection/train
 * @desc    Trigger model training
 * @access  Private
 */
router.post('/anomaly-detection/train', async (req, res) => {
  try {
    const result = await mlAnomalyDetection.trainModels();

    res.json(result);
  } catch (error) {
    logger.error('[ML API] Training error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/anomaly-detection/history
 * @desc    Get anomaly history
 * @access  Private
 */
router.get('/anomaly-detection/history', (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const history = mlAnomalyDetection.getAnomalyHistory(parseInt(limit));

    res.json({
      total: history.length,
      anomalies: history
    });
  } catch (error) {
    logger.error('[ML API] History error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/anomaly-detection/stats
 * @desc    Get model statistics
 * @access  Private
 */
router.get('/anomaly-detection/stats', (req, res) => {
  try {
    const stats = mlAnomalyDetection.getModelStats();

    res.json(stats);
  } catch (error) {
    logger.error('[ML API] Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/anomaly-detection/feedback
 * @desc    Provide feedback on detection
 * @access  Private
 */
router.post('/anomaly-detection/feedback', (req, res) => {
  try {
    const { detectionId, isTrueAnomaly } = req.body;

    mlAnomalyDetection.provideFeedback(detectionId, isTrueAnomaly);

    res.json({ success: true });
  } catch (error) {
    logger.error('[ML API] Feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Predictive Scaling Routes
// ============================================================================

/**
 * @route   POST /api/ml/scaling/record
 * @desc    Record metrics for prediction
 * @access  Private
 */
router.post('/scaling/record', async (req, res) => {
  try {
    const { metrics } = req.body;

    if (!metrics) {
      return res.status(400).json({ error: 'Metrics required' });
    }

    const dataPoint = await predictiveScaling.recordMetrics(metrics);

    res.json(dataPoint);
  } catch (error) {
    logger.error('[ML API] Record metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/scaling/predict
 * @desc    Predict future utilization
 * @access  Private
 */
router.get('/scaling/predict', async (req, res) => {
  try {
    const { horizon = 3600000 } = req.query;

    const prediction = await predictiveScaling.predictUtilization(parseInt(horizon));

    res.json(prediction);
  } catch (error) {
    logger.error('[ML API] Predict error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/scaling/execute
 * @desc    Execute scaling recommendation
 * @access  Private
 */
router.post('/scaling/execute', async (req, res) => {
  try {
    const { recommendation } = req.body;

    if (!recommendation) {
      return res.status(400).json({ error: 'Recommendation required' });
    }

    const result = await predictiveScaling.executeScaling(recommendation);

    res.json(result);
  } catch (error) {
    logger.error('[ML API] Execute scaling error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/scaling/history
 * @desc    Get scaling history
 * @access  Private
 */
router.get('/scaling/history', (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const history = predictiveScaling.getScalingHistory(parseInt(limit));

    res.json({
      total: history.length,
      actions: history
    });
  } catch (error) {
    logger.error('[ML API] Scaling history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/scaling/state
 * @desc    Get current scaling state
 * @access  Private
 */
router.get('/scaling/state', (req, res) => {
  try {
    const state = predictiveScaling.getCurrentState();

    res.json(state);
  } catch (error) {
    logger.error('[ML API] Scaling state error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Advanced A/B Testing Routes
// ============================================================================

/**
 * @route   POST /api/ml/ab-testing/experiments
 * @desc    Create new A/B test experiment
 * @access  Private
 */
router.post('/ab-testing/experiments', async (req, res) => {
  try {
    const config = req.body;

    const experiment = await advancedABTesting.createExperiment(config);

    res.status(201).json(experiment);
  } catch (error) {
    logger.error('[ML API] Create experiment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/ab-testing/experiments
 * @desc    Get all experiments
 * @access  Private
 */
router.get('/ab-testing/experiments', (req, res) => {
  try {
    const experiments = advancedABTesting.getAllExperiments();

    res.json({
      total: experiments.length,
      experiments
    });
  } catch (error) {
    logger.error('[ML API] Get experiments error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/ab-testing/experiments/:id
 * @desc    Get experiment by ID
 * @access  Private
 */
router.get('/ab-testing/experiments/:id', (req, res) => {
  try {
    const { id } = req.params;

    const experiment = advancedABTesting.getExperiment(id);

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    res.json(experiment);
  } catch (error) {
    logger.error('[ML API] Get experiment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/ab-testing/experiments/:id/assign
 * @desc    Assign user to variant
 * @access  Public
 */
router.post('/ab-testing/experiments/:id/assign', (req, res) => {
  try {
    const { id } = req.params;
    const { userId, context } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const assignment = advancedABTesting.assignVariant(id, userId, context);

    res.json(assignment);
  } catch (error) {
    logger.error('[ML API] Assign variant error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/ab-testing/experiments/:id/events
 * @desc    Record conversion event
 * @access  Public
 */
router.post('/ab-testing/experiments/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const { variantId, value, metadata } = req.body;

    if (!variantId) {
      return res.status(400).json({ error: 'Variant ID required' });
    }

    const result = await advancedABTesting.recordEvent(id, variantId, value, metadata);

    res.json(result);
  } catch (error) {
    logger.error('[ML API] Record event error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/ab-testing/experiments/:id/analyze
 * @desc    Analyze experiment results
 * @access  Private
 */
router.get('/ab-testing/experiments/:id/analyze', async (req, res) => {
  try {
    const { id } = req.params;

    const analysis = await advancedABTesting.analyzeExperiment(id);

    res.json(analysis);
  } catch (error) {
    logger.error('[ML API] Analyze experiment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/ab-testing/experiments/:id/stop
 * @desc    Stop experiment
 * @access  Private
 */
router.post('/ab-testing/experiments/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await advancedABTesting.stopExperiment(id, reason);

    res.json(result);
  } catch (error) {
    logger.error('[ML API] Stop experiment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// User Behavior Analytics Routes
// ============================================================================

/**
 * @route   POST /api/ml/behavior/events
 * @desc    Track user event
 * @access  Public
 */
router.post('/behavior/events', async (req, res) => {
  try {
    const { userId, eventName, properties, context } = req.body;

    if (!userId || !eventName) {
      return res.status(400).json({ error: 'User ID and event name required' });
    }

    const event = await userBehaviorAnalytics.trackEvent(userId, eventName, properties, context);

    res.json(event);
  } catch (error) {
    logger.error('[ML API] Track event error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/behavior/journey/:userId
 * @desc    Analyze user journey
 * @access  Private
 */
router.get('/behavior/journey/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeRange, groupBy } = req.query;

    const journey = await userBehaviorAnalytics.analyzeJourney(userId, {
      timeRange: timeRange ? parseInt(timeRange) : undefined,
      groupBy
    });

    res.json(journey);
  } catch (error) {
    logger.error('[ML API] Journey analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/behavior/cohorts
 * @desc    Analyze cohorts
 * @access  Private
 */
router.get('/behavior/cohorts', async (req, res) => {
  try {
    const { cohortBy, metric, periods } = req.query;

    const analysis = await userBehaviorAnalytics.analyzeCohorts({
      cohortBy,
      metric,
      periods: periods ? periods.split(',').map(Number) : undefined
    });

    res.json(analysis);
  } catch (error) {
    logger.error('[ML API] Cohort analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/behavior/funnels
 * @desc    Create funnel
 * @access  Private
 */
router.post('/behavior/funnels', (req, res) => {
  try {
    const { name, steps, options } = req.body;

    if (!name || !steps || steps.length < 2) {
      return res.status(400).json({ error: 'Name and at least 2 steps required' });
    }

    const funnel = userBehaviorAnalytics.createFunnel(name, steps, options);

    res.status(201).json(funnel);
  } catch (error) {
    logger.error('[ML API] Create funnel error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/behavior/funnels/:id
 * @desc    Analyze funnel
 * @access  Private
 */
router.get('/behavior/funnels/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const analysis = await userBehaviorAnalytics.analyzeFunnel(id);

    res.json(analysis);
  } catch (error) {
    logger.error('[ML API] Funnel analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/behavior/churn/:userId
 * @desc    Predict user churn
 * @access  Private
 */
router.get('/behavior/churn/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const prediction = await userBehaviorAnalytics.predictChurn(userId);

    res.json(prediction);
  } catch (error) {
    logger.error('[ML API] Churn prediction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/behavior/segments
 * @desc    Get user segments
 * @access  Private
 */
router.get('/behavior/segments', async (req, res) => {
  try {
    const segments = await userBehaviorAnalytics.segmentUsers(req.query);

    res.json(segments);
  } catch (error) {
    logger.error('[ML API] Segmentation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/behavior/summary
 * @desc    Get analytics summary
 * @access  Private
 */
router.get('/behavior/summary', (req, res) => {
  try {
    const summary = userBehaviorAnalytics.getAnalyticsSummary();

    res.json(summary);
  } catch (error) {
    logger.error('[ML API] Summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Auto-tuning Routes
// ============================================================================

/**
 * @route   POST /api/ml/tuning/collect
 * @desc    Collect performance metrics
 * @access  Private
 */
router.post('/tuning/collect', async (req, res) => {
  try {
    const { metrics } = req.body;

    if (!metrics) {
      return res.status(400).json({ error: 'Metrics required' });
    }

    const result = await autoTuningService.collectMetrics(metrics);

    res.json(result);
  } catch (error) {
    logger.error('[ML API] Collect metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/tuning/analyze
 * @desc    Analyze and apply tuning
 * @access  Private
 */
router.post('/tuning/analyze', async (req, res) => {
  try {
    const analysis = await autoTuningService.analyzeAndTune();

    res.json(analysis);
  } catch (error) {
    logger.error('[ML API] Tuning analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/tuning/config
 * @desc    Get current configuration
 * @access  Private
 */
router.get('/tuning/config', (req, res) => {
  try {
    const config = autoTuningService.getCurrentConfig();

    res.json(config);
  } catch (error) {
    logger.error('[ML API] Get config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/ml/tuning/config
 * @desc    Set configuration parameter
 * @access  Private
 */
router.post('/tuning/config', async (req, res) => {
  try {
    const { parameter, value } = req.body;

    if (!parameter || value === undefined) {
      return res.status(400).json({ error: 'Parameter and value required' });
    }

    const result = await autoTuningService.setParameter(parameter, value);

    res.json(result);
  } catch (error) {
    logger.error('[ML API] Set config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/tuning/history
 * @desc    Get tuning history
 * @access  Private
 */
router.get('/tuning/history', (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const history = autoTuningService.getTuningHistory(parseInt(limit));

    res.json({
      total: history.length,
      history
    });
  } catch (error) {
    logger.error('[ML API] Tuning history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/ml/tuning/summary
 * @desc    Get performance summary
 * @access  Private
 */
router.get('/tuning/summary', (req, res) => {
  try {
    const summary = autoTuningService.getPerformanceSummary();

    res.json(summary);
  } catch (error) {
    logger.error('[ML API] Performance summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
