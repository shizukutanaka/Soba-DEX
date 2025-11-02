/**
 * ML Pipeline & Workflow Orchestration API Routes
 *
 * Provides RESTful endpoints for:
 * - Pipeline creation and management
 * - Pipeline execution and monitoring
 * - Workflow scheduling (cron-based)
 * - Task management and dependency tracking
 *
 * @module routes/mlPipelineRoutes
 * @version 3.7.0
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Import ML Pipeline Service
const mlPipeline = require('../services/mlPipeline');

// ============================================================================
// Pipeline Management Endpoints
// ============================================================================

/**
 * POST /api/ml-pipeline/create
 * Create a new pipeline
 */
router.post('/create', async (req, res) => {
  try {
    const {
      name,
      description,
      definition,
      triggerType = 'manual',
      triggerConfig,
      enabled = true,
    } = req.body;

    // Validate required fields
    if (!name || !definition) {
      return res.status(400).json({
        error: 'Missing required fields: name, definition',
      });
    }

    const pipeline = await mlPipeline.createPipeline({
      name,
      description,
      definition,
      triggerType,
      triggerConfig,
      enabled,
    });

    res.json({
      success: true,
      pipeline,
    });
  } catch (error) {
    logger.error('Create pipeline error:', error);
    res.status(500).json({
      error: 'Failed to create pipeline',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-pipeline/list
 * List all pipelines
 */
router.get('/list', async (req, res) => {
  try {
    const {
      status,
      limit = 50,
    } = req.query;

    const filters = {};
    if (status) filters.status = status;

    const pipelines = await mlPipeline.listPipelines({
      ...filters,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      pipelines,
      count: pipelines.length,
    });
  } catch (error) {
    logger.error('List pipelines error:', error);
    res.status(500).json({
      error: 'Failed to list pipelines',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-pipeline/:pipelineId
 * Get a pipeline by ID
 */
router.get('/:pipelineId', async (req, res) => {
  try {
    const { pipelineId } = req.params;

    const pipeline = await mlPipeline.getPipeline(pipelineId);

    if (!pipeline) {
      return res.status(404).json({
        error: 'Pipeline not found',
      });
    }

    res.json({
      success: true,
      pipeline,
    });
  } catch (error) {
    logger.error('Get pipeline error:', error);
    res.status(500).json({
      error: 'Failed to get pipeline',
      message: error.message,
    });
  }
});

/**
 * PUT /api/ml-pipeline/:pipelineId/update
 * Update a pipeline
 */
router.put('/:pipelineId/update', async (req, res) => {
  try {
    const { pipelineId } = req.params;
    const updates = req.body;

    const pipeline = await mlPipeline.updatePipeline(pipelineId, updates);

    res.json({
      success: true,
      pipeline,
    });
  } catch (error) {
    logger.error('Update pipeline error:', error);
    res.status(500).json({
      error: 'Failed to update pipeline',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ml-pipeline/:pipelineId/delete
 * Delete a pipeline
 */
router.delete('/:pipelineId/delete', async (req, res) => {
  try {
    const { pipelineId } = req.params;

    await mlPipeline.deletePipeline(pipelineId);

    res.json({
      success: true,
      message: 'Pipeline deleted successfully',
    });
  } catch (error) {
    logger.error('Delete pipeline error:', error);
    res.status(500).json({
      error: 'Failed to delete pipeline',
      message: error.message,
    });
  }
});

// ============================================================================
// Pipeline Execution Endpoints
// ============================================================================

/**
 * POST /api/ml-pipeline/:pipelineId/execute
 * Execute a pipeline
 */
router.post('/:pipelineId/execute', async (req, res) => {
  try {
    const { pipelineId } = req.params;
    const { triggerData = {} } = req.body;

    const execution = await mlPipeline.executePipeline(pipelineId, triggerData);

    res.json({
      success: true,
      execution,
    });
  } catch (error) {
    logger.error('Execute pipeline error:', error);
    res.status(500).json({
      error: 'Failed to execute pipeline',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-pipeline/:pipelineId/executions
 * Get execution history for a pipeline
 */
router.get('/:pipelineId/executions', async (req, res) => {
  try {
    const { pipelineId } = req.params;
    const {
      status,
      limit = 50,
    } = req.query;

    const filters = { pipelineId };
    if (status) filters.status = status;

    const executions = await mlPipeline.getExecutions({
      ...filters,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      pipelineId,
      executions,
      count: executions.length,
    });
  } catch (error) {
    logger.error('Get executions error:', error);
    res.status(500).json({
      error: 'Failed to get executions',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-pipeline/execution/:executionId
 * Get execution details
 */
router.get('/execution/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;

    const execution = await mlPipeline.getExecution(executionId);

    if (!execution) {
      return res.status(404).json({
        error: 'Execution not found',
      });
    }

    res.json({
      success: true,
      execution,
    });
  } catch (error) {
    logger.error('Get execution error:', error);
    res.status(500).json({
      error: 'Failed to get execution',
      message: error.message,
    });
  }
});

/**
 * GET /api/ml-pipeline/execution/:executionId/tasks
 * Get tasks for an execution
 */
router.get('/execution/:executionId/tasks', async (req, res) => {
  try {
    const { executionId } = req.params;

    const tasks = await mlPipeline.getExecutionTasks(executionId);

    res.json({
      success: true,
      executionId,
      tasks,
      count: tasks.length,
    });
  } catch (error) {
    logger.error('Get execution tasks error:', error);
    res.status(500).json({
      error: 'Failed to get execution tasks',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-pipeline/execution/:executionId/cancel
 * Cancel a running execution
 */
router.post('/execution/:executionId/cancel', async (req, res) => {
  try {
    const { executionId } = req.params;

    const execution = await mlPipeline.cancelExecution(executionId);

    res.json({
      success: true,
      execution,
      message: 'Execution cancelled successfully',
    });
  } catch (error) {
    logger.error('Cancel execution error:', error);
    res.status(500).json({
      error: 'Failed to cancel execution',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-pipeline/execution/:executionId/retry
 * Retry a failed execution
 */
router.post('/execution/:executionId/retry', async (req, res) => {
  try {
    const { executionId } = req.params;
    const { retryFailedTasksOnly = true } = req.body;

    const execution = await mlPipeline.retryExecution(executionId, retryFailedTasksOnly);

    res.json({
      success: true,
      execution,
    });
  } catch (error) {
    logger.error('Retry execution error:', error);
    res.status(500).json({
      error: 'Failed to retry execution',
      message: error.message,
    });
  }
});

// ============================================================================
// Workflow Scheduling Endpoints
// ============================================================================

/**
 * POST /api/ml-pipeline/schedule
 * Create a workflow schedule
 */
router.post('/schedule', async (req, res) => {
  try {
    const {
      name,
      pipelineId,
      cronExpression,
      timezone = 'UTC',
      enabled = true,
      maxConcurrent = 1,
      timeoutSeconds,
    } = req.body;

    if (!name || !pipelineId || !cronExpression) {
      return res.status(400).json({
        error: 'Missing required fields: name, pipelineId, cronExpression',
      });
    }

    const schedule = await mlPipeline.createSchedule({
      name,
      pipelineId,
      cronExpression,
      timezone,
      enabled,
      maxConcurrent,
      timeoutSeconds,
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
 * GET /api/ml-pipeline/schedules
 * List all schedules
 */
router.get('/schedules', async (req, res) => {
  try {
    const {
      pipelineId,
      enabled,
      limit = 50,
    } = req.query;

    const filters = {};
    if (pipelineId) filters.pipelineId = pipelineId;
    if (enabled !== undefined) filters.enabled = enabled === 'true';

    const schedules = await mlPipeline.listSchedules({
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
 * GET /api/ml-pipeline/schedule/:scheduleId
 * Get a schedule by ID
 */
router.get('/schedule/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await mlPipeline.getSchedule(scheduleId);

    if (!schedule) {
      return res.status(404).json({
        error: 'Schedule not found',
      });
    }

    res.json({
      success: true,
      schedule,
    });
  } catch (error) {
    logger.error('Get schedule error:', error);
    res.status(500).json({
      error: 'Failed to get schedule',
      message: error.message,
    });
  }
});

/**
 * PUT /api/ml-pipeline/schedule/:scheduleId
 * Update a schedule
 */
router.put('/schedule/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const updates = req.body;

    const schedule = await mlPipeline.updateSchedule(scheduleId, updates);

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
 * DELETE /api/ml-pipeline/schedule/:scheduleId
 * Delete a schedule
 */
router.delete('/schedule/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;

    await mlPipeline.deleteSchedule(scheduleId);

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

/**
 * POST /api/ml-pipeline/schedule/:scheduleId/enable
 * Enable a schedule
 */
router.post('/schedule/:scheduleId/enable', async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await mlPipeline.enableSchedule(scheduleId);

    res.json({
      success: true,
      schedule,
      message: 'Schedule enabled successfully',
    });
  } catch (error) {
    logger.error('Enable schedule error:', error);
    res.status(500).json({
      error: 'Failed to enable schedule',
      message: error.message,
    });
  }
});

/**
 * POST /api/ml-pipeline/schedule/:scheduleId/disable
 * Disable a schedule
 */
router.post('/schedule/:scheduleId/disable', async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await mlPipeline.disableSchedule(scheduleId);

    res.json({
      success: true,
      schedule,
      message: 'Schedule disabled successfully',
    });
  } catch (error) {
    logger.error('Disable schedule error:', error);
    res.status(500).json({
      error: 'Failed to disable schedule',
      message: error.message,
    });
  }
});

// ============================================================================
// Pipeline Validation Endpoint
// ============================================================================

/**
 * POST /api/ml-pipeline/validate
 * Validate a pipeline definition
 */
router.post('/validate', async (req, res) => {
  try {
    const { definition } = req.body;

    if (!definition) {
      return res.status(400).json({
        error: 'Missing required field: definition',
      });
    }

    const validation = await mlPipeline.validatePipeline(definition);

    res.json({
      success: true,
      valid: validation.valid,
      errors: validation.errors || [],
      warnings: validation.warnings || [],
    });
  } catch (error) {
    logger.error('Validate pipeline error:', error);
    res.status(500).json({
      error: 'Failed to validate pipeline',
      message: error.message,
    });
  }
});

// ============================================================================
// Statistics Endpoint
// ============================================================================

/**
 * GET /api/ml-pipeline/stats
 * Get pipeline execution statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const {
      pipelineId,
      timeRange = '7d',
    } = req.query;

    const stats = await mlPipeline.getStatistics({
      pipelineId,
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
 * GET /api/ml-pipeline/health
 * Health check for pipeline service
 */
router.get('/health', async (req, res) => {
  try {
    const health = await mlPipeline.healthCheck();

    res.json({
      status: health.status === 'healthy' ? 'healthy' : 'degraded',
      version: '3.7.0',
      service: 'ml-pipeline',
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
