/**
 * ML Management API Routes
 * API endpoints for ML model management, retraining, drift detection, and A/B testing
 * @version 3.5.0
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Import ML management services
const mlModelPersistence = require('../services/mlModelPersistence');
const mlRetrainingService = require('../services/mlRetrainingService');
const mlFeatureEngineering = require('../services/mlFeatureEngineering');
const mlDriftDetection = require('../services/mlDriftDetection');
const mlModelABTesting = require('../services/mlModelABTesting');

// ==================== Model Persistence Routes ====================

/**
 * Save a model to the registry
 * POST /api/ml-management/models
 */
router.post('/models', async (req, res) => {
  try {
    const modelData = req.body;
    const result = await mlModelPersistence.saveModel(modelData);

    res.status(201).json({
      success: true,
      model: result,
    });
  } catch (error) {
    logger.error('Error saving model:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Load a model from the registry
 * GET /api/ml-management/models/:modelId
 */
router.get('/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const model = await mlModelPersistence.loadModel(modelId);

    res.json({
      success: true,
      model,
    });
  } catch (error) {
    logger.error('Error loading model:', error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get model versions
 * GET /api/ml-management/models/:modelName/versions
 */
router.get('/models/:modelName/versions', async (req, res) => {
  try {
    const { modelName } = req.params;
    const versions = await mlModelPersistence.getModelVersions(modelName);

    res.json({
      success: true,
      modelName,
      versions,
    });
  } catch (error) {
    logger.error('Error getting model versions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * List all models
 * GET /api/ml-management/models
 */
router.get('/models', async (req, res) => {
  try {
    const { type, status, name, limit } = req.query;
    const filters = { type, status, name, limit: parseInt(limit) || 50 };

    const models = await mlModelPersistence.listModels(filters);

    res.json({
      success: true,
      count: models.length,
      models,
    });
  } catch (error) {
    logger.error('Error listing models:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Archive a model
 * POST /api/ml-management/models/:modelId/archive
 */
router.post('/models/:modelId/archive', async (req, res) => {
  try {
    const { modelId } = req.params;
    const result = await mlModelPersistence.archiveModel(modelId);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error('Error archiving model:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Rollback to a previous model version
 * POST /api/ml-management/models/:modelName/rollback
 */
router.post('/models/:modelName/rollback', async (req, res) => {
  try {
    const { modelName } = req.params;
    const { targetVersion } = req.body;

    const result = await mlModelPersistence.rollbackModel(modelName, targetVersion);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error('Error rolling back model:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get model registry statistics
 * GET /api/ml-management/registry/stats
 */
router.get('/registry/stats', async (req, res) => {
  try {
    const stats = await mlModelPersistence.getRegistryStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error('Error getting registry stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== Model Retraining Routes ====================

/**
 * Schedule a retraining job
 * POST /api/ml-management/retraining/schedule
 */
router.post('/retraining/schedule', async (req, res) => {
  try {
    const jobConfig = req.body;
    const result = await mlRetrainingService.scheduleRetraining(jobConfig);

    res.status(201).json({
      success: true,
      job: result,
    });
  } catch (error) {
    logger.error('Error scheduling retraining:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get retraining job status
 * GET /api/ml-management/retraining/jobs/:jobId
 */
router.get('/retraining/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await mlRetrainingService.getJobStatus(jobId);

    res.json({
      success: true,
      job: status,
    });
  } catch (error) {
    logger.error('Error getting job status:', error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get retraining history
 * GET /api/ml-management/retraining/history
 */
router.get('/retraining/history', async (req, res) => {
  try {
    const { modelId, status, triggerType, limit } = req.query;
    const filters = { modelId, status, triggerType, limit: parseInt(limit) || 100 };

    const history = await mlRetrainingService.getHistory(filters);

    res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    logger.error('Error getting retraining history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Cancel a pending retraining job
 * DELETE /api/ml-management/retraining/jobs/:jobId
 */
router.delete('/retraining/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await mlRetrainingService.cancelJob(jobId);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error('Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get retraining service summary
 * GET /api/ml-management/retraining/summary
 */
router.get('/retraining/summary', (req, res) => {
  try {
    const summary = mlRetrainingService.getSummary();

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    logger.error('Error getting retraining summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== Feature Engineering Routes ====================

/**
 * Extract features from data
 * POST /api/ml-management/features/extract
 */
router.post('/features/extract', (req, res) => {
  try {
    const { data, options } = req.body;
    const features = mlFeatureEngineering.extractFeatures(data, options);

    res.json({
      success: true,
      features,
    });
  } catch (error) {
    logger.error('Error extracting features:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Transform features
 * POST /api/ml-management/features/transform
 */
router.post('/features/transform', (req, res) => {
  try {
    const { features, options } = req.body;
    const transformed = mlFeatureEngineering.transformFeatures(features, options);

    res.json({
      success: true,
      features: transformed,
    });
  } catch (error) {
    logger.error('Error transforming features:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Select features
 * POST /api/ml-management/features/select
 */
router.post('/features/select', async (req, res) => {
  try {
    const { features, options } = req.body;
    const selected = await mlFeatureEngineering.selectFeatures(features, options);

    res.json({
      success: true,
      features: selected,
    });
  } catch (error) {
    logger.error('Error selecting features:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Save feature metadata
 * POST /api/ml-management/features
 */
router.post('/features', async (req, res) => {
  try {
    const featureData = req.body;
    const result = await mlFeatureEngineering.saveFeature(featureData);

    res.status(201).json({
      success: true,
      feature: result,
    });
  } catch (error) {
    logger.error('Error saving feature:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get feature engineering summary
 * GET /api/ml-management/features/summary
 */
router.get('/features/summary', (req, res) => {
  try {
    const summary = mlFeatureEngineering.getSummary();

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    logger.error('Error getting feature summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== Drift Detection Routes ====================

/**
 * Detect data drift
 * POST /api/ml-management/drift/detect
 */
router.post('/drift/detect', async (req, res) => {
  try {
    const params = req.body;
    const result = await mlDriftDetection.detectDrift(params);

    res.json({
      success: true,
      drift: result,
    });
  } catch (error) {
    logger.error('Error detecting drift:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Set baseline data for drift detection
 * POST /api/ml-management/drift/baseline
 */
router.post('/drift/baseline', async (req, res) => {
  try {
    const params = req.body;
    const result = await mlDriftDetection.setBaseline(params);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error('Error setting baseline:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get drift history for a model
 * GET /api/ml-management/drift/:modelId/history
 */
router.get('/drift/:modelId/history', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { limit } = req.query;
    const options = { limit: parseInt(limit) || 100 };

    const history = await mlDriftDetection.getDriftHistory(modelId, options);

    res.json({
      success: true,
      modelId,
      count: history.length,
      history,
    });
  } catch (error) {
    logger.error('Error getting drift history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get drift detection summary
 * GET /api/ml-management/drift/summary
 */
router.get('/drift/summary', (req, res) => {
  try {
    const summary = mlDriftDetection.getSummary();

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    logger.error('Error getting drift summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== Model A/B Testing Routes ====================

/**
 * Create a model A/B test
 * POST /api/ml-management/ab-tests
 */
router.post('/ab-tests', async (req, res) => {
  try {
    const testConfig = req.body;
    const result = await mlModelABTesting.createTest(testConfig);

    res.status(201).json({
      success: true,
      test: result,
    });
  } catch (error) {
    logger.error('Error creating A/B test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Start an A/B test
 * POST /api/ml-management/ab-tests/:testId/start
 */
router.post('/ab-tests/:testId/start', async (req, res) => {
  try {
    const { testId } = req.params;
    const result = await mlModelABTesting.startTest(testId);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error('Error starting A/B test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Make a prediction using A/B test
 * POST /api/ml-management/ab-tests/:testId/predict
 */
router.post('/ab-tests/:testId/predict', async (req, res) => {
  try {
    const { testId } = req.params;
    const { input, userId } = req.body;

    const result = await mlModelABTesting.predict(testId, input, userId);

    res.json({
      success: true,
      prediction: result,
    });
  } catch (error) {
    logger.error('Error making A/B prediction:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Record actual outcome for a prediction
 * POST /api/ml-management/ab-tests/:testId/outcome
 */
router.post('/ab-tests/:testId/outcome', async (req, res) => {
  try {
    const { testId } = req.params;
    const { inputHash, actualOutcome } = req.body;

    await mlModelABTesting.recordOutcome(testId, inputHash, actualOutcome);

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error('Error recording outcome:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Analyze A/B test results
 * GET /api/ml-management/ab-tests/:testId/analyze
 */
router.get('/ab-tests/:testId/analyze', async (req, res) => {
  try {
    const { testId } = req.params;
    const analysis = await mlModelABTesting.analyzeTest(testId);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    logger.error('Error analyzing A/B test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Stop an A/B test
 * POST /api/ml-management/ab-tests/:testId/stop
 */
router.post('/ab-tests/:testId/stop', async (req, res) => {
  try {
    const { testId } = req.params;
    const result = await mlModelABTesting.stopTest(testId);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error('Error stopping A/B test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Promote a model from A/B test
 * POST /api/ml-management/ab-tests/:testId/promote
 */
router.post('/ab-tests/:testId/promote', async (req, res) => {
  try {
    const { testId } = req.params;
    const { modelVersion } = req.body;

    const result = await mlModelABTesting.promoteModel(testId, modelVersion);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error('Error promoting model:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get A/B test details
 * GET /api/ml-management/ab-tests/:testId
 */
router.get('/ab-tests/:testId', async (req, res) => {
  try {
    const { testId } = req.params;
    const test = await mlModelABTesting.getTest(testId);

    res.json({
      success: true,
      test,
    });
  } catch (error) {
    logger.error('Error getting A/B test:', error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * List all A/B tests
 * GET /api/ml-management/ab-tests
 */
router.get('/ab-tests', async (req, res) => {
  try {
    const { status, limit } = req.query;
    const filters = { status, limit: parseInt(limit) || 50 };

    const tests = await mlModelABTesting.listTests(filters);

    res.json({
      success: true,
      count: tests.length,
      tests,
    });
  } catch (error) {
    logger.error('Error listing A/B tests:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get A/B testing summary
 * GET /api/ml-management/ab-tests/summary
 */
router.get('/ab-tests/summary', (req, res) => {
  try {
    const summary = mlModelABTesting.getSummary();

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    logger.error('Error getting A/B testing summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== Health Check Routes ====================

/**
 * Health check for all ML management services
 * GET /api/ml-management/health
 */
router.get('/health', (req, res) => {
  try {
    const health = {
      modelPersistence: mlModelPersistence.getHealth(),
      retraining: mlRetrainingService.getHealth(),
      featureEngineering: mlFeatureEngineering.getHealth(),
      driftDetection: mlDriftDetection.getHealth(),
      modelABTesting: mlModelABTesting.getHealth(),
    };

    const allHealthy = Object.values(health).every(service => service.initialized);

    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      services: health,
    });
  } catch (error) {
    logger.error('Error checking health:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
