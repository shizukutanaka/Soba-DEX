/**
 * ML Visualization API Routes
 *
 * Provides RESTful endpoints for:
 * - Chart data generation (performance, SHAP, comparison)
 * - Dashboard creation and management
 * - Visualization export (JSON, PNG, CSV)
 *
 * @module routes/mlVisualizationRoutes
 * @version 3.7.0
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Import ML Visualization Service
const mlVisualization = require('../services/mlVisualization');

// ============================================================================
// Chart Generation Endpoints
// ============================================================================

/**
 * POST /api/ml-visualization/generate
 * Generate a visualization chart
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      name,
      type,
      modelId,
      config,
      dataSource,
    } = req.body;

    // Validate required fields
    if (!name || !type) {
      return res.status(400).json({
        error: 'Missing required fields: name, type',
      });
    }

    const visualization = await mlVisualization.generateVisualization({
      name,
      type,
      modelId,
      config,
      dataSource,
    });

    res.json({
      success: true,
      visualization,
    });
  } catch (error) {
    logger.error('Generate visualization error:', error);
    res.status(500).json({
      error: 'Failed to generate visualization',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-visualization/performance-chart
 * Generate performance chart
 */
router.post('/performance-chart', async (req, res) => {
  try {
    const {
      modelId,
      timeRange = '24h',
      metrics = ['accuracy', 'latency'],
    } = req.body;

    if (!modelId) {
      return res.status(400).json({
        error: 'Missing required field: modelId',
      });
    }

    const chart = await mlVisualization.generatePerformanceChart({
      modelId,
      timeRange,
      metrics,
    });

    res.json({
      success: true,
      chart,
    });
  } catch (error) {
    logger.error('Performance chart error:', error);
    res.status(500).json({
      error: 'Failed to generate performance chart',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-visualization/shap-chart
 * Generate SHAP explanation chart
 */
router.post('/shap-chart', async (req, res) => {
  try {
    const {
      predictionId,
      chartType = 'waterfall',
    } = req.body;

    if (!predictionId) {
      return res.status(400).json({
        error: 'Missing required field: predictionId',
      });
    }

    const chart = await mlVisualization.generateSHAPChart({
      predictionId,
      chartType,
    });

    res.json({
      success: true,
      chart,
    });
  } catch (error) {
    logger.error('SHAP chart error:', error);
    res.status(500).json({
      error: 'Failed to generate SHAP chart',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-visualization/comparison-chart
 * Generate model comparison chart
 */
router.post('/comparison-chart', async (req, res) => {
  try {
    const {
      comparisonId,
      metrics = ['accuracy', 'latency', 'throughput'],
      chartType = 'bar',
    } = req.body;

    if (!comparisonId) {
      return res.status(400).json({
        error: 'Missing required field: comparisonId',
      });
    }

    const chart = await mlVisualization.generateComparisonChart({
      comparisonId,
      metrics,
      chartType,
    });

    res.json({
      success: true,
      chart,
    });
  } catch (error) {
    logger.error('Comparison chart error:', error);
    res.status(500).json({
      error: 'Failed to generate comparison chart',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-visualization/quality-chart
 * Generate data quality chart
 */
router.post('/quality-chart', async (req, res) => {
  try {
    const {
      modelId,
      timeRange = '7d',
      chartType = 'trend',
    } = req.body;

    if (!modelId) {
      return res.status(400).json({
        error: 'Missing required field: modelId',
      });
    }

    const chart = await mlVisualization.generateQualityChart({
      modelId,
      timeRange,
      chartType,
    });

    res.json({
      success: true,
      chart,
    });
  } catch (error) {
    logger.error('Quality chart error:', error);
    res.status(500).json({
      error: 'Failed to generate quality chart',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-visualization/heatmap
 * Generate correlation heatmap
 */
router.post('/heatmap', async (req, res) => {
  try {
    const {
      modelId,
      features,
    } = req.body;

    if (!modelId) {
      return res.status(400).json({
        error: 'Missing required field: modelId',
      });
    }

    const heatmap = await mlVisualization.generateHeatmap({
      modelId,
      features,
    });

    res.json({
      success: true,
      heatmap,
    });
  } catch (error) {
    logger.error('Heatmap error:', error);
    res.status(500).json({
      error: 'Failed to generate heatmap',
      message: error.message,
    });
  }
});

// ============================================================================
// Dashboard Endpoints
// ============================================================================

/**
 * POST /api/ml-visualization/dashboard/create
 * Create a dashboard
 */
router.post('/dashboard/create', async (req, res) => {
  try {
    const {
      modelId,
      name,
      description,
      widgets = [],
      layout,
    } = req.body;

    if (!modelId || !name) {
      return res.status(400).json({
        error: 'Missing required fields: modelId, name',
      });
    }

    const dashboard = await mlVisualization.createDashboard({
      modelId,
      name,
      description,
      widgets,
      layout,
    });

    res.json({
      success: true,
      dashboard,
    });
  } catch (error) {
    logger.error('Create dashboard error:', error);
    res.status(500).json({
      error: 'Failed to create dashboard',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-visualization/dashboard/:modelId
 * Get dashboard for a model
 */
router.get('/dashboard/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { timeRange = '24h' } = req.query;

    const dashboard = await mlVisualization.getDashboard(modelId, timeRange);

    if (!dashboard) {
      return res.status(404).json({
        error: 'Dashboard not found',
      });
    }

    res.json({
      success: true,
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

/**
 * PUT /api/ml-visualization/dashboard/:dashboardId
 * Update dashboard configuration
 */
router.put('/dashboard/:dashboardId', async (req, res) => {
  try {
    const { dashboardId } = req.params;
    const updates = req.body;

    const dashboard = await mlVisualization.updateDashboard(dashboardId, updates);

    res.json({
      success: true,
      dashboard,
    });
  } catch (error) {
    logger.error('Update dashboard error:', error);
    res.status(500).json({
      error: 'Failed to update dashboard',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ml-visualization/dashboard/:dashboardId
 * Delete a dashboard
 */
router.delete('/dashboard/:dashboardId', async (req, res) => {
  try {
    const { dashboardId } = req.params;

    await mlVisualization.deleteDashboard(dashboardId);

    res.json({
      success: true,
      message: 'Dashboard deleted successfully',
    });
  } catch (error) {
    logger.error('Delete dashboard error:', error);
    res.status(500).json({
      error: 'Failed to delete dashboard',
      message: error.message,
    });
  }
});

// ============================================================================
// Visualization Management Endpoints
// ============================================================================

/**
 * GET /api/ml-visualization/:vizId
 * Get a visualization by ID
 */
router.get('/:vizId', async (req, res) => {
  try {
    const { vizId } = req.params;

    const visualization = await mlVisualization.getVisualization(vizId);

    if (!visualization) {
      return res.status(404).json({
        error: 'Visualization not found',
      });
    }

    res.json({
      success: true,
      visualization,
    });
  } catch (error) {
    logger.error('Get visualization error:', error);
    res.status(500).json({
      error: 'Failed to get visualization',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-visualization/list
 * List visualizations with optional filters
 */
router.get('/list', async (req, res) => {
  try {
    const {
      modelId,
      type,
      limit = 50,
    } = req.query;

    const filters = {};
    if (modelId) filters.modelId = modelId;
    if (type) filters.type = type;

    const visualizations = await mlVisualization.listVisualizations({
      ...filters,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      visualizations,
      count: visualizations.length,
    });
  } catch (error) {
    logger.error('List visualizations error:', error);
    res.status(500).json({
      error: 'Failed to list visualizations',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ml-visualization/:vizId
 * Delete a visualization
 */
router.delete('/:vizId', async (req, res) => {
  try {
    const { vizId } = req.params;

    await mlVisualization.deleteVisualization(vizId);

    res.json({
      success: true,
      message: 'Visualization deleted successfully',
    });
  } catch (error) {
    logger.error('Delete visualization error:', error);
    res.status(500).json({
      error: 'Failed to delete visualization',
      message: error.message,
    });
  }
});

// ============================================================================
// Export Endpoints
// ============================================================================

/**
 * POST /api/ml-visualization/export
 * Export visualization in different formats
 */
router.post('/export', async (req, res) => {
  try {
    const {
      vizId,
      format = 'json',
      width,
      height,
    } = req.body;

    if (!vizId) {
      return res.status(400).json({
        error: 'Missing required field: vizId',
      });
    }

    const exported = await mlVisualization.exportVisualization({
      vizId,
      format,
      width,
      height,
    });

    res.json({
      success: true,
      format,
      data: exported,
    });
  } catch (error) {
    logger.error('Export visualization error:', error);
    res.status(500).json({
      error: 'Failed to export visualization',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-visualization/templates
 * Get available chart templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = await mlVisualization.getTemplates();

    res.json({
      success: true,
      templates,
    });
  } catch (error) {
    logger.error('Get templates error:', error);
    res.status(500).json({
      error: 'Failed to get templates',
      message: error.message,
    });
  }
});

// ============================================================================
// Health Check Endpoint
// ============================================================================

/**
 * GET /api/ml-visualization/health
 * Health check for visualization service
 */
router.get('/health', async (req, res) => {
  try {
    const health = await mlVisualization.healthCheck();

    res.json({
      status: health.status === 'healthy' ? 'healthy' : 'degraded',
      version: '3.7.0',
      service: 'ml-visualization',
      ...health,
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
