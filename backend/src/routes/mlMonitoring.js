/**
 * ML Monitoring & Explainability API Routes
 *
 * Provides RESTful endpoints for:
 * - Model explainability (SHAP, LIME, counterfactual)
 * - Performance monitoring and alerting
 * - Data quality validation
 * - Model comparison
 *
 * @module routes/mlMonitoring
 * @version 3.6.0
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Import services
const mlExplainability = require('../services/mlExplainability');
const mlPerformanceMonitoring = require('../services/mlPerformanceMonitoring');
const mlDataQuality = require('../services/mlDataQuality');
const mlModelComparison = require('../services/mlModelComparison');

// ============================================================================
// ML Explainability Endpoints
// ============================================================================

/**
 * POST /api/ml-monitoring/explainability/explain
 * Generate explanation for a prediction
 */
router.post('/explainability/explain', async (req, res) => {
  try {
    const {
      modelId,
      input,
      prediction,
      predictionId,
      explanationType = 'shap',
      desiredOutput,
    } = req.body;

    // Validate required fields
    if (!modelId || !input || prediction === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: modelId, input, prediction',
      });
    }

    // Mock model predict function (in production, this would call the actual model)
    const modelPredict = async (inputData) => {
      // Placeholder - replace with actual model prediction
      return prediction;
    };

    const explanation = await mlExplainability.explain({
      modelId,
      input,
      prediction,
      predictionId: predictionId || `pred_${Date.now()}`,
      explanationType,
      desiredOutput,
      modelPredict,
    });

    res.json({
      success: true,
      explanation,
    });
  } catch (error) {
    logger.error('Explainability error:', error);
    res.status(500).json({
      error: 'Failed to generate explanation',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/explainability/global-importance/:modelId
 * Get global feature importance
 */
router.get('/explainability/global-importance/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    const importance = await mlExplainability.getGlobalImportance(modelId);

    res.json({
      success: true,
      modelId,
      importance,
    });
  } catch (error) {
    logger.error('Global importance error:', error);
    res.status(500).json({
      error: 'Failed to get global importance',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/explainability/prediction/:predictionId
 * Get explanation for specific prediction
 */
router.get('/explainability/prediction/:predictionId', async (req, res) => {
  try {
    const { predictionId } = req.params;

    const explanation = await mlExplainability.getExplanation(predictionId);

    if (!explanation) {
      return res.status(404).json({
        error: 'Explanation not found',
      });
    }

    res.json({
      success: true,
      explanation,
    });
  } catch (error) {
    logger.error('Get explanation error:', error);
    res.status(500).json({
      error: 'Failed to get explanation',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/explainability/summary/:modelId
 * Get explainability summary
 */
router.get('/explainability/summary/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    const summary = await mlExplainability.getSummary(modelId);

    res.json({
      success: true,
      modelId,
      summary,
    });
  } catch (error) {
    logger.error('Explainability summary error:', error);
    res.status(500).json({
      error: 'Failed to get summary',
      message: error.message,
    });
  }
});

// ============================================================================
// ML Performance Monitoring Endpoints
// ============================================================================

/**
 * POST /api/ml-monitoring/performance/record
 * Record a prediction for monitoring
 */
router.post('/performance/record', async (req, res) => {
  try {
    const { modelId, prediction, actual, latency, metadata } = req.body;

    if (!modelId || prediction === undefined || !latency) {
      return res.status(400).json({
        error: 'Missing required fields: modelId, prediction, latency',
      });
    }

    await mlPerformanceMonitoring.recordPrediction({
      modelId,
      prediction,
      actual,
      latency,
      metadata,
    });

    res.json({
      success: true,
      message: 'Prediction recorded',
    });
  } catch (error) {
    logger.error('Record prediction error:', error);
    res.status(500).json({
      error: 'Failed to record prediction',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/performance/:modelId
 * Get current performance metrics
 */
router.get('/performance/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    const performance = await mlPerformanceMonitoring.getCurrentPerformance(modelId);

    if (!performance) {
      return res.status(404).json({
        error: 'No performance data found',
      });
    }

    res.json({
      success: true,
      modelId,
      performance,
    });
  } catch (error) {
    logger.error('Get performance error:', error);
    res.status(500).json({
      error: 'Failed to get performance',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/performance/:modelId/history
 * Get performance history
 */
router.get('/performance/:modelId/history', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { timeRange = '24h', metrics, limit } = req.query;

    const options = {
      timeRange,
      metrics: metrics ? metrics.split(',') : undefined,
      limit: limit ? parseInt(limit) : undefined,
    };

    const history = await mlPerformanceMonitoring.getPerformanceHistory(modelId, options);

    res.json({
      success: true,
      modelId,
      history,
      count: history.length,
    });
  } catch (error) {
    logger.error('Get performance history error:', error);
    res.status(500).json({
      error: 'Failed to get performance history',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/performance/alerts/:modelId
 * Get active alerts
 */
router.get('/performance/alerts/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    const alerts = await mlPerformanceMonitoring.getActiveAlerts(modelId);

    res.json({
      success: true,
      modelId,
      alerts,
      count: alerts.length,
    });
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({
      error: 'Failed to get alerts',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-monitoring/performance/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post('/performance/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { acknowledgedBy = 'system' } = req.body;

    const alert = await mlPerformanceMonitoring.acknowledgeAlert(alertId, acknowledgedBy);

    res.json({
      success: true,
      alert,
    });
  } catch (error) {
    logger.error('Acknowledge alert error:', error);
    res.status(500).json({
      error: 'Failed to acknowledge alert',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-monitoring/performance/alerts/:alertId/resolve
 * Resolve an alert
 */
router.post('/performance/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { resolutionNote = '' } = req.body;

    const alert = await mlPerformanceMonitoring.resolveAlert(alertId, resolutionNote);

    res.json({
      success: true,
      alert,
    });
  } catch (error) {
    logger.error('Resolve alert error:', error);
    res.status(500).json({
      error: 'Failed to resolve alert',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-monitoring/performance/thresholds/:modelId
 * Set performance threshold
 */
router.post('/performance/thresholds/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { metricName, operator, value, severity, alertMessage, cooldownMinutes, enabled } = req.body;

    if (!metricName || !operator || value === undefined || !severity) {
      return res.status(400).json({
        error: 'Missing required fields: metricName, operator, value, severity',
      });
    }

    const threshold = await mlPerformanceMonitoring.setThreshold({
      modelId,
      metricName,
      operator,
      value,
      severity,
      alertMessage,
      cooldownMinutes,
      enabled,
    });

    res.json({
      success: true,
      threshold,
    });
  } catch (error) {
    logger.error('Set threshold error:', error);
    res.status(500).json({
      error: 'Failed to set threshold',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/performance/dashboard/:modelId
 * Get complete dashboard data
 */
router.get('/performance/dashboard/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    const dashboard = await mlPerformanceMonitoring.getDashboard(modelId);

    res.json({
      success: true,
      modelId,
      dashboard,
    });
  } catch (error) {
    logger.error('Get dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard',
      message: error.message,
    });
  }
});

// ============================================================================
// ML Data Quality Endpoints
// ============================================================================

/**
 * POST /api/ml-monitoring/quality/validate
 * Validate data quality
 */
router.post('/quality/validate', async (req, res) => {
  try {
    const { modelId, data, predictionId, schema } = req.body;

    if (!modelId || !data) {
      return res.status(400).json({
        error: 'Missing required fields: modelId, data',
      });
    }

    const validation = await mlDataQuality.validate({
      modelId,
      data,
      predictionId,
      schema,
    });

    res.json({
      success: true,
      validation,
    });
  } catch (error) {
    logger.error('Validation error:', error);
    res.status(500).json({
      error: 'Failed to validate data',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/quality/stats/:modelId
 * Get quality statistics
 */
router.get('/quality/stats/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { timeRange = '24h' } = req.query;

    const stats = await mlDataQuality.getStatistics(modelId, timeRange);

    res.json({
      success: true,
      modelId,
      stats,
    });
  } catch (error) {
    logger.error('Get quality stats error:', error);
    res.status(500).json({
      error: 'Failed to get quality statistics',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/quality/report/:modelId
 * Get quality report
 */
router.get('/quality/report/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { timeRange = '7d' } = req.query;

    const report = await mlDataQuality.getReport(modelId, timeRange);

    res.json({
      success: true,
      modelId,
      report,
    });
  } catch (error) {
    logger.error('Get quality report error:', error);
    res.status(500).json({
      error: 'Failed to get quality report',
      message: error.message,
    });
  }
});

// ============================================================================
// ML Model Comparison Endpoints
// ============================================================================

/**
 * POST /api/ml-monitoring/comparison/compare
 * Compare multiple models
 */
router.post('/comparison/compare', async (req, res) => {
  try {
    const { modelIds, name, description, metrics, sampleData, comparisonType } = req.body;

    if (!modelIds || modelIds.length < 2) {
      return res.status(400).json({
        error: 'At least 2 model IDs are required',
      });
    }

    if (!name) {
      return res.status(400).json({
        error: 'Comparison name is required',
      });
    }

    const comparison = await mlModelComparison.compareModels({
      modelIds,
      name,
      description,
      metrics,
      sampleData,
      comparisonType,
    });

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    logger.error('Comparison error:', error);
    res.status(500).json({
      error: 'Failed to compare models',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/comparison/:comparisonId
 * Get comparison results
 */
router.get('/comparison/:comparisonId', async (req, res) => {
  try {
    const { comparisonId } = req.params;

    const comparison = await mlModelComparison.getComparison(comparisonId);

    if (!comparison) {
      return res.status(404).json({
        error: 'Comparison not found',
      });
    }

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    logger.error('Get comparison error:', error);
    res.status(500).json({
      error: 'Failed to get comparison',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/comparison/list
 * List all comparisons
 */
router.get('/comparison/list', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const comparisons = await mlModelComparison.listComparisons(parseInt(limit));

    res.json({
      success: true,
      comparisons,
      count: comparisons.length,
    });
  } catch (error) {
    logger.error('List comparisons error:', error);
    res.status(500).json({
      error: 'Failed to list comparisons',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-monitoring/comparison/:comparisonId/visualization
 * Get visualization data
 */
router.get('/comparison/:comparisonId/visualization', async (req, res) => {
  try {
    const { comparisonId } = req.params;

    const visualization = await mlModelComparison.getVisualizationData(comparisonId);

    if (!visualization) {
      return res.status(404).json({
        error: 'Comparison not found',
      });
    }

    res.json({
      success: true,
      visualization,
    });
  } catch (error) {
    logger.error('Get visualization error:', error);
    res.status(500).json({
      error: 'Failed to get visualization data',
      message: error.message,
    });
  }
});

// ============================================================================
// Health Check Endpoint
// ============================================================================

/**
 * GET /api/ml-monitoring/health
 * Health check for all services
 */
router.get('/health', async (req, res) => {
  try {
    const [explainability, performance, quality, comparison] = await Promise.all([
      mlExplainability.healthCheck(),
      mlPerformanceMonitoring.healthCheck(),
      mlDataQuality.healthCheck(),
      mlModelComparison.healthCheck(),
    ]);

    const allHealthy = [explainability, performance, quality, comparison]
      .every(h => h.status === 'healthy');

    res.json({
      status: allHealthy ? 'healthy' : 'degraded',
      version: '3.6.0',
      services: {
        explainability,
        performance,
        quality,
        comparison,
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
