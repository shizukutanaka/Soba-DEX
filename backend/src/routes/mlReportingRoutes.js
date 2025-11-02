/**
 * ML Reporting API Routes
 *
 * Provides RESTful endpoints for:
 * - Automated report generation (performance, quality, health)
 * - Report scheduling and management
 * - Report export (JSON, Markdown, HTML, PDF)
 * - Insight generation and recommendations
 *
 * @module routes/mlReportingRoutes
 * @version 3.7.0
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Import ML Reporting Service
const mlReporting = require('../services/mlReporting');

// ============================================================================
// Report Generation Endpoints
// ============================================================================

/**
 * POST /api/ml-reports/generate
 * Generate a new report
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      name,
      type = 'performance',
      modelIds,
      periodStart,
      periodEnd,
      format = 'json',
      includeVisualizations = true,
    } = req.body;

    // Validate required fields
    if (!name || !modelIds || modelIds.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: name, modelIds',
      });
    }

    const report = await mlReporting.generateReport({
      name,
      type,
      modelIds,
      periodStart,
      periodEnd,
      format,
      includeVisualizations,
    });

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error('Generate report error:', error);
    res.status(500).json({
      error: 'Failed to generate report',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-reports/performance
 * Generate performance report
 */
router.post('/performance', async (req, res) => {
  try {
    const {
      modelIds,
      periodStart,
      periodEnd,
      includeVisualizations = true,
    } = req.body;

    if (!modelIds || modelIds.length === 0) {
      return res.status(400).json({
        error: 'Missing required field: modelIds',
      });
    }

    const report = await mlReporting.generatePerformanceReport(
      modelIds,
      periodStart,
      periodEnd,
      includeVisualizations
    );

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error('Performance report error:', error);
    res.status(500).json({
      error: 'Failed to generate performance report',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-reports/quality
 * Generate data quality report
 */
router.post('/quality', async (req, res) => {
  try {
    const {
      modelIds,
      periodStart,
      periodEnd,
      includeVisualizations = true,
    } = req.body;

    if (!modelIds || modelIds.length === 0) {
      return res.status(400).json({
        error: 'Missing required field: modelIds',
      });
    }

    const report = await mlReporting.generateQualityReport(
      modelIds,
      periodStart,
      periodEnd,
      includeVisualizations
    );

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error('Quality report error:', error);
    res.status(500).json({
      error: 'Failed to generate quality report',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-reports/health
 * Generate system health report
 */
router.post('/health', async (req, res) => {
  try {
    const { modelIds } = req.body;

    const report = await mlReporting.generateHealthReport(modelIds);

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error('Health report error:', error);
    res.status(500).json({
      error: 'Failed to generate health report',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-reports/comparison
 * Generate model comparison report
 */
router.post('/comparison', async (req, res) => {
  try {
    const {
      comparisonId,
      includeVisualizations = true,
    } = req.body;

    if (!comparisonId) {
      return res.status(400).json({
        error: 'Missing required field: comparisonId',
      });
    }

    const report = await mlReporting.generateComparisonReport(
      comparisonId,
      includeVisualizations
    );

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error('Comparison report error:', error);
    res.status(500).json({
      error: 'Failed to generate comparison report',
      message: error.message,
    });
  }
});

// ============================================================================
// Report Management Endpoints
// ============================================================================

/**
 * GET /api/ml-reports/:reportId
 * Get a report by ID
 */
router.get('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await mlReporting.getReport(reportId);

    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
      });
    }

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error('Get report error:', error);
    res.status(500).json({
      error: 'Failed to get report',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-reports/list
 * List reports with optional filters
 */
router.get('/list', async (req, res) => {
  try {
    const {
      type,
      modelId,
      startDate,
      endDate,
      limit = 50,
    } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (modelId) filters.modelId = modelId;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    const reports = await mlReporting.listReports({
      ...filters,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      reports,
      count: reports.length,
    });
  } catch (error) {
    logger.error('List reports error:', error);
    res.status(500).json({
      error: 'Failed to list reports',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ml-reports/:reportId
 * Delete a report
 */
router.delete('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    await mlReporting.deleteReport(reportId);

    res.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    logger.error('Delete report error:', error);
    res.status(500).json({
      error: 'Failed to delete report',
      message: error.message,
    });
  }
});

// ============================================================================
// Report Export Endpoints
// ============================================================================

/**
 * POST /api/ml-reports/:reportId/export
 * Export report in different formats
 */
router.post('/:reportId/export', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { format = 'json' } = req.body;

    const exported = await mlReporting.exportReport(reportId, format);

    if (format === 'json') {
      res.json({
        success: true,
        format,
        data: exported,
      });
    } else {
      // For non-JSON formats, return as downloadable content
      const contentTypes = {
        markdown: 'text/markdown',
        html: 'text/html',
        pdf: 'application/pdf',
      };

      res.setHeader('Content-Type', contentTypes[format] || 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}.${format}"`);
      res.send(exported);
    }
  } catch (error) {
    logger.error('Export report error:', error);
    res.status(500).json({
      error: 'Failed to export report',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-reports/:reportId/download
 * Download report file
 */
router.get('/:reportId/download', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { format = 'json' } = req.query;

    const report = await mlReporting.getReport(reportId);

    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
      });
    }

    // If report has a file path, serve that file
    if (report.file_path) {
      return res.download(report.file_path);
    }

    // Otherwise, export on-the-fly
    const exported = await mlReporting.exportReport(reportId, format);

    const contentTypes = {
      json: 'application/json',
      markdown: 'text/markdown',
      html: 'text/html',
      pdf: 'application/pdf',
    };

    res.setHeader('Content-Type', contentTypes[format] || 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}.${format}"`);

    if (format === 'json') {
      res.json(exported);
    } else {
      res.send(exported);
    }
  } catch (error) {
    logger.error('Download report error:', error);
    res.status(500).json({
      error: 'Failed to download report',
      message: error.message,
    });
  }
});

// ============================================================================
// Report Scheduling Endpoints
// ============================================================================

/**
 * POST /api/ml-reports/schedule
 * Create a scheduled report
 */
router.post('/schedule', async (req, res) => {
  try {
    const {
      name,
      type,
      modelIds,
      cronExpression,
      format = 'json',
      enabled = true,
      recipients,
    } = req.body;

    if (!name || !type || !modelIds || !cronExpression) {
      return res.status(400).json({
        error: 'Missing required fields: name, type, modelIds, cronExpression',
      });
    }

    const schedule = await mlReporting.createSchedule({
      name,
      type,
      modelIds,
      cronExpression,
      format,
      enabled,
      recipients,
    });

    res.json({
      success: true,
      schedule,
    });
  } catch (error) {
    logger.error('Create schedule error:', error);
    res.status(500).json({
      error: 'Failed to create schedule',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-reports/schedules
 * List all report schedules
 */
router.get('/schedules', async (req, res) => {
  try {
    const {
      type,
      enabled,
      limit = 50,
    } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (enabled !== undefined) filters.enabled = enabled === 'true';

    const schedules = await mlReporting.listSchedules({
      ...filters,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      schedules,
      count: schedules.length,
    });
  } catch (error) {
    logger.error('List schedules error:', error);
    res.status(500).json({
      error: 'Failed to list schedules',
      message: error.message,
    });
  }
});

/**
 * PUT /api/ml-reports/schedule/:scheduleId
 * Update a report schedule
 */
router.put('/schedule/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const updates = req.body;

    const schedule = await mlReporting.updateSchedule(scheduleId, updates);

    res.json({
      success: true,
      schedule,
    });
  } catch (error) {
    logger.error('Update schedule error:', error);
    res.status(500).json({
      error: 'Failed to update schedule',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ml-reports/schedule/:scheduleId
 * Delete a report schedule
 */
router.delete('/schedule/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;

    await mlReporting.deleteSchedule(scheduleId);

    res.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  } catch (error) {
    logger.error('Delete schedule error:', error);
    res.status(500).json({
      error: 'Failed to delete schedule',
      message: error.message,
    });
  }
});

// ============================================================================
// Insights Endpoints
// ============================================================================

/**
 * GET /api/ml-reports/:reportId/insights
 * Get insights from a report
 */
router.get('/:reportId/insights', async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await mlReporting.getReport(reportId);

    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
      });
    }

    res.json({
      success: true,
      reportId,
      insights: report.insights || [],
      count: (report.insights || []).length,
    });
  } catch (error) {
    logger.error('Get insights error:', error);
    res.status(500).json({
      error: 'Failed to get insights',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-reports/:reportId/recommendations
 * Get recommendations from a report
 */
router.get('/:reportId/recommendations', async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await mlReporting.getReport(reportId);

    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
      });
    }

    res.json({
      success: true,
      reportId,
      recommendations: report.recommendations || [],
      count: (report.recommendations || []).length,
    });
  } catch (error) {
    logger.error('Get recommendations error:', error);
    res.status(500).json({
      error: 'Failed to get recommendations',
      message: error.message,
    });
  }
});

// ============================================================================
// Statistics Endpoint
// ============================================================================

/**
 * GET /api/ml-reports/stats
 * Get reporting statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const {
      modelId,
      timeRange = '30d',
    } = req.query;

    const stats = await mlReporting.getStatistics({
      modelId,
      timeRange,
    });

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message,
    });
  }
});

// ============================================================================
// Health Check Endpoint
// ============================================================================

/**
 * GET /api/ml-reports/health
 * Health check for reporting service
 */
router.get('/health', async (req, res) => {
  try {
    const health = await mlReporting.healthCheck();

    res.json({
      status: health.status === 'healthy' ? 'healthy' : 'degraded',
      version: '3.7.0',
      service: 'ml-reporting',
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
