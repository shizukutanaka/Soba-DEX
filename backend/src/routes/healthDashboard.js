/**
 * Health Dashboard API Routes
 * Comprehensive health monitoring and metrics dashboard
 * Version: 1.0.0
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/productionLogger');

// Import monitoring services
const performanceMonitor = require('../services/performanceMonitor');
const traceAggregator = require('../services/traceAggregator');
const contractEventIndexer = require('../services/contractEventIndexer');
const { circuitBreakerManager } = require('../middleware/advancedCircuitBreaker');
const queryOptimizer = require('../services/queryOptimizer');

/**
 * @route GET /api/health/dashboard
 * @desc Get comprehensive health dashboard
 * @access Public
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const dashboard = {
    timestamp: Date.now(),
    status: 'healthy',
    uptime: process.uptime(),
    version: require('../../package.json').version,
    components: {
      performanceMonitor: await getPerformanceMonitorStatus(),
      traceAggregator: getTraceAggregatorStatus(),
      contractEventIndexer: getContractEventIndexerStatus(),
      circuitBreakers: getCircuitBreakerStatus(),
      queryOptimizer: getQueryOptimizerStatus(),
      system: getSystemStatus()
    }
  };

  // Determine overall status
  const componentStatuses = Object.values(dashboard.components)
    .map(c => c.status)
    .filter(Boolean);

  if (componentStatuses.includes('critical')) {
    dashboard.status = 'critical';
  } else if (componentStatuses.includes('degraded')) {
    dashboard.status = 'degraded';
  }

  const statusCode = dashboard.status === 'healthy' ? 200 :
                     dashboard.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json({
    success: true,
    data: dashboard
  });
}));

/**
 * @route GET /api/health/performance
 * @desc Get performance metrics
 * @access Public
 */
router.get('/performance', asyncHandler(async (req, res) => {
  const {
    category = null,
    startTime = Date.now() - 3600000,
    endTime = Date.now()
  } = req.query;

  const metrics = performanceMonitor.getMetrics({
    category,
    startTime: parseInt(startTime),
    endTime: parseInt(endTime)
  });

  res.json({
    success: true,
    data: metrics
  });
}));

/**
 * @route GET /api/health/performance/report
 * @desc Get performance report with recommendations
 * @access Public
 */
router.get('/performance/report', asyncHandler(async (req, res) => {
  const report = performanceMonitor.getReport();

  res.json({
    success: true,
    data: report
  });
}));

/**
 * @route GET /api/health/performance/anomalies
 * @desc Get performance anomalies
 * @access Public
 */
router.get('/performance/anomalies', asyncHandler(async (req, res) => {
  const {
    category = null,
    severity = null,
    limit = 100
  } = req.query;

  const anomalies = performanceMonitor.getAnomalies({
    category,
    severity,
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    data: anomalies,
    count: anomalies.length
  });
}));

/**
 * @route GET /api/health/traces
 * @desc Query distributed traces
 * @access Public
 */
router.get('/traces', asyncHandler(async (req, res) => {
  const {
    serviceName = null,
    operation = null,
    status = null,
    minDuration = null,
    maxDuration = null,
    startTime = Date.now() - 3600000,
    endTime = Date.now(),
    limit = 100
  } = req.query;

  const traces = traceAggregator.queryTraces({
    serviceName,
    operation,
    status,
    minDuration: minDuration ? parseInt(minDuration) : null,
    maxDuration: maxDuration ? parseInt(maxDuration) : null,
    startTime: parseInt(startTime),
    endTime: parseInt(endTime),
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    data: traces,
    count: traces.length
  });
}));

/**
 * @route GET /api/health/traces/:traceId
 * @desc Get detailed trace information
 * @access Public
 */
router.get('/traces/:traceId', asyncHandler(async (req, res) => {
  const { traceId } = req.params;
  const { includeSpans = 'true', includeRelated = 'false' } = req.query;

  const trace = traceAggregator.getTrace(traceId, {
    includeSpans: includeSpans === 'true',
    includeRelated: includeRelated === 'true'
  });

  if (!trace) {
    return res.status(404).json({
      success: false,
      error: 'Trace not found'
    });
  }

  res.json({
    success: true,
    data: trace
  });
}));

/**
 * @route GET /api/health/traces/analytics
 * @desc Get trace analytics
 * @access Public
 */
router.get('/traces/analytics', asyncHandler(async (req, res) => {
  const {
    startTime = Date.now() - 3600000,
    endTime = Date.now(),
    groupBy = 'service'
  } = req.query;

  const analytics = traceAggregator.getAnalytics({
    startTime: parseInt(startTime),
    endTime: parseInt(endTime),
    groupBy
  });

  res.json({
    success: true,
    data: analytics
  });
}));

/**
 * @route GET /api/health/blockchain/events
 * @desc Query blockchain events
 * @access Public
 */
router.get('/blockchain/events', asyncHandler(async (req, res) => {
  const {
    contractId = null,
    chainId = null,
    category = null,
    eventName = null,
    confirmed = null,
    limit = 100
  } = req.query;

  const events = contractEventIndexer.queryEvents({
    contractId,
    chainId: chainId ? parseInt(chainId) : null,
    category,
    eventName,
    confirmed: confirmed !== null ? confirmed === 'true' : null,
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    data: events,
    count: events.length
  });
}));

/**
 * @route GET /api/health/blockchain/contracts/:contractId
 * @desc Get contract statistics
 * @access Public
 */
router.get('/blockchain/contracts/:contractId', asyncHandler(async (req, res) => {
  const { contractId } = req.params;

  const stats = contractEventIndexer.getContractStats(contractId);

  if (!stats) {
    return res.status(404).json({
      success: false,
      error: 'Contract not found'
    });
  }

  res.json({
    success: true,
    data: stats
  });
}));

/**
 * @route GET /api/health/blockchain/chains
 * @desc Get blockchain network statistics
 * @access Public
 */
router.get('/blockchain/chains', asyncHandler(async (req, res) => {
  const { chainId = null } = req.query;

  const stats = contractEventIndexer.getChainStats(
    chainId ? parseInt(chainId) : null
  );

  res.json({
    success: true,
    data: stats
  });
}));

/**
 * @route GET /api/health/circuit-breakers
 * @desc Get all circuit breaker statuses
 * @access Public
 */
router.get('/circuit-breakers', asyncHandler(async (req, res) => {
  const status = circuitBreakerManager.getAllStatus();

  res.json({
    success: true,
    data: status
  });
}));

/**
 * @route GET /api/health/circuit-breakers/:name
 * @desc Get specific circuit breaker status
 * @access Public
 */
router.get('/circuit-breakers/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;

  const status = circuitBreakerManager.getStatus(name);

  if (!status) {
    return res.status(404).json({
      success: false,
      error: 'Circuit breaker not found'
    });
  }

  res.json({
    success: true,
    data: status
  });
}));

/**
 * @route POST /api/health/circuit-breakers/:name/reset
 * @desc Reset specific circuit breaker
 * @access Admin
 */
router.post('/circuit-breakers/:name/reset', asyncHandler(async (req, res) => {
  const { name } = req.params;

  circuitBreakerManager.reset(name);

  logger.info('Circuit breaker reset', { name });

  res.json({
    success: true,
    message: `Circuit breaker ${name} reset successfully`
  });
}));

/**
 * @route GET /api/health/queries/slow
 * @desc Get slow queries
 * @access Public
 */
router.get('/queries/slow', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const slowQueries = queryOptimizer.getTopSlowQueries(parseInt(limit));

  res.json({
    success: true,
    data: slowQueries,
    count: slowQueries.length
  });
}));

/**
 * @route GET /api/health/queries/patterns
 * @desc Get query patterns
 * @access Public
 */
router.get('/queries/patterns', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const patterns = queryOptimizer.getTopPatterns(parseInt(limit));

  res.json({
    success: true,
    data: patterns,
    count: patterns.length
  });
}));

/**
 * @route GET /api/health/queries/report
 * @desc Get query optimization report
 * @access Public
 */
router.get('/queries/report', asyncHandler(async (req, res) => {
  const report = queryOptimizer.generateOptimizationReport();

  res.json({
    success: true,
    data: report
  });
}));

/**
 * @route GET /api/health/system
 * @desc Get system metrics
 * @access Public
 */
router.get('/system', asyncHandler(async (req, res) => {
  const systemMetrics = getSystemStatus();

  res.json({
    success: true,
    data: systemMetrics
  });
}));

/**
 * @route GET /api/health/statistics
 * @desc Get all component statistics
 * @access Public
 */
router.get('/statistics', asyncHandler(async (req, res) => {
  const statistics = {
    performanceMonitor: performanceMonitor.getStatistics(),
    traceAggregator: traceAggregator.getStatistics(),
    contractEventIndexer: contractEventIndexer.getStatistics(),
    circuitBreakers: circuitBreakerManager.getStatistics(),
    queryOptimizer: queryOptimizer.getStatistics()
  };

  res.json({
    success: true,
    data: statistics
  });
}));

// Helper functions

async function getPerformanceMonitorStatus() {
  try {
    const stats = performanceMonitor.getStatistics();
    const metrics = performanceMonitor.getMetrics();

    let status = 'healthy';
    const issues = [];

    // Check memory usage
    if (metrics.system?.memory?.heapUsagePercent > 90) {
      status = 'critical';
      issues.push('Critical memory usage');
    } else if (metrics.system?.memory?.heapUsagePercent > 80) {
      status = 'degraded';
      issues.push('High memory usage');
    }

    // Check for anomalies
    if (stats.totalAnomalies > 100) {
      status = status === 'critical' ? 'critical' : 'degraded';
      issues.push('High anomaly count');
    }

    return {
      name: 'Performance Monitor',
      status,
      initialized: stats.isInitialized,
      metrics: {
        snapshots: stats.totalSnapshots,
        anomalies: stats.totalAnomalies,
        categories: stats.categories?.length || 0
      },
      issues
    };
  } catch (error) {
    return {
      name: 'Performance Monitor',
      status: 'critical',
      error: error.message
    };
  }
}

function getTraceAggregatorStatus() {
  try {
    const stats = traceAggregator.getStatistics();

    return {
      name: 'Trace Aggregator',
      status: stats.isInitialized ? 'healthy' : 'degraded',
      initialized: stats.isInitialized,
      metrics: {
        totalTraces: stats.totalTraces,
        activeTraces: stats.activeTraces,
        totalSpans: stats.totalSpans,
        services: stats.totalServices
      }
    };
  } catch (error) {
    return {
      name: 'Trace Aggregator',
      status: 'critical',
      error: error.message
    };
  }
}

function getContractEventIndexerStatus() {
  try {
    const stats = contractEventIndexer.getStatistics();

    return {
      name: 'Contract Event Indexer',
      status: stats.isInitialized ? 'healthy' : 'degraded',
      initialized: stats.isInitialized,
      metrics: {
        chains: stats.totalChains,
        contracts: stats.totalContracts,
        cachedEvents: stats.cachedEvents,
        activeListeners: stats.activeListeners
      }
    };
  } catch (error) {
    return {
      name: 'Contract Event Indexer',
      status: 'critical',
      error: error.message
    };
  }
}

function getCircuitBreakerStatus() {
  try {
    const stats = circuitBreakerManager.getStatistics();
    const allStatus = circuitBreakerManager.getAllStatus();

    let status = 'healthy';
    const issues = [];

    if (allStatus.byState.open > 0) {
      status = 'degraded';
      issues.push(`${allStatus.byState.open} circuit breakers open`);
    }

    return {
      name: 'Circuit Breakers',
      status,
      initialized: stats.isInitialized,
      metrics: {
        total: stats.totalBreakers,
        open: allStatus.byState.open,
        halfOpen: allStatus.byState.half_open,
        closed: allStatus.byState.closed,
        totalRequests: stats.aggregated.totalRequests,
        rejectedRequests: stats.aggregated.totalRejected
      },
      issues
    };
  } catch (error) {
    return {
      name: 'Circuit Breakers',
      status: 'critical',
      error: error.message
    };
  }
}

function getQueryOptimizerStatus() {
  try {
    const stats = queryOptimizer.getStatistics();
    const report = queryOptimizer.generateOptimizationReport();

    let status = 'healthy';
    const issues = [];

    if (report.criticalIssues > 0) {
      status = 'degraded';
      issues.push(`${report.criticalIssues} critical optimization issues`);
    }

    if (stats.slowQueries > 20) {
      status = status === 'critical' ? 'critical' : 'degraded';
      issues.push('High slow query count');
    }

    return {
      name: 'Query Optimizer',
      status,
      initialized: stats.isInitialized,
      metrics: {
        totalQueries: stats.totalQueries,
        slowQueries: stats.slowQueries,
        patterns: stats.patterns,
        indexSuggestions: stats.indexSuggestions
      },
      issues
    };
  } catch (error) {
    return {
      name: 'Query Optimizer',
      status: 'critical',
      error: error.message
    };
  }
}

function getSystemStatus() {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();

  return {
    uptime: process.uptime(),
    memory: {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      rss: memory.rss,
      heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
      heapUsagePercent: Math.round((memory.heapUsed / memory.heapTotal) * 100)
    },
    cpu: {
      user: cpu.user,
      system: cpu.system,
      totalMs: Math.round((cpu.user + cpu.system) / 1000)
    },
    process: {
      pid: process.pid,
      version: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };
}

module.exports = router;
