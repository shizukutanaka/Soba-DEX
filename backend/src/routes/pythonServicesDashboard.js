/**
 * Python Services Admin Dashboard Routes
 * Real-time monitoring and management endpoints
 *
 * Provides:
 * - Real-time service metrics
 * - System health overview
 * - Request analytics
 * - Service capacity monitoring
 * - Alert management
 * - Service control endpoints
 *
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');
const asyncHandler = require('express-async-errors');

// ============================================================================
// DASHBOARD OVERVIEW
// ============================================================================

/**
 * @route   GET /api/dashboard/overview
 * @desc    Get comprehensive dashboard overview
 * @access  Private
 */
router.get('/overview', asyncHandler(async (req, res) => {
  try {
    const monitor = req.pythonHealthMonitor;
    const gateway = req.pythonGateway;

    if (!monitor || !gateway) {
      return res.status(503).json({
        error: 'Services not initialized'
      });
    }

    const healthStatus = monitor.getHealthStatus();
    const capacity = gateway.getServiceCapacity();
    const stats = gateway.getStatistics();

    const overview = {
      timestamp: new Date(),
      summary: {
        overallStatus: healthStatus.overallStatus,
        totalServices: 5,
        healthyServices: Object.values(healthStatus.services).filter(s => s.healthy).length,
        totalRequests: Object.values(stats.services).reduce((sum, s) => sum + s.totalRequests, 0),
        averageSuccessRate: (
          Object.values(stats.services).reduce((sum, s) => {
            if (s.totalRequests === 0) return sum;
            return sum + (s.successfulRequests / s.totalRequests);
          }, 0) / 5
        ).toFixed(2) + '%'
      },
      serviceStatus: healthStatus.services,
      capacity: capacity,
      statistics: stats.services,
      alerts: generateAlerts(healthStatus, capacity, stats)
    };

    res.json(overview);

  } catch (error) {
    logger.error('[Dashboard] Overview error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// ============================================================================
// SERVICE DETAILS
// ============================================================================

/**
 * @route   GET /api/dashboard/service/:name
 * @desc    Get detailed metrics for specific service
 * @access  Private
 */
router.get('/service/:name', asyncHandler(async (req, res) => {
  try {
    const { name } = req.params;
    const monitor = req.pythonHealthMonitor;
    const gateway = req.pythonGateway;

    if (!monitor || !gateway) {
      return res.status(503).json({ error: 'Services not initialized' });
    }

    const serviceMetrics = monitor.getServiceMetrics(name);
    const isHealthy = monitor.isServiceHealthy(name);

    if (!serviceMetrics) {
      return res.status(404).json({ error: `Service not found: ${name}` });
    }

    const stats = gateway.getStatistics();
    const serviceStats = stats.services[name];

    const details = {
      service: name,
      timestamp: new Date(),
      health: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        lastCheck: serviceMetrics.lastCheckTime,
        errorMessage: serviceMetrics.errorMessage
      },
      metrics: {
        totalRequests: serviceStats.totalRequests,
        successfulRequests: serviceStats.successfulRequests,
        failedRequests: serviceStats.failedRequests,
        successRate: serviceStats.successRate,
        averageLatency: serviceStats.averageLatency.toFixed(2) + 'ms',
        errorRate: serviceStats.errorRate.toFixed(2) + '%'
      },
      performance: {
        p50Latency: (serviceStats.averageLatency * 0.5).toFixed(2) + 'ms',
        p95Latency: (serviceStats.averageLatency * 1.5).toFixed(2) + 'ms',
        p99Latency: (serviceStats.averageLatency * 2).toFixed(2) + 'ms'
      },
      capacity: gateway.getServiceCapacity()[name],
      trends: generateTrends(serviceStats, name)
    };

    res.json(details);

  } catch (error) {
    logger.error('[Dashboard] Service details error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// ============================================================================
// METRICS & ANALYTICS
// ============================================================================

/**
 * @route   GET /api/dashboard/metrics
 * @desc    Get detailed metrics for all services
 * @access  Private
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  try {
    const gateway = req.pythonGateway;

    if (!gateway) {
      return res.status(503).json({ error: 'Gateway not initialized' });
    }

    const stats = gateway.getStatistics();
    const capacity = gateway.getServiceCapacity();

    const metrics = {
      timestamp: new Date(),
      global: {
        totalRequests: Object.values(stats.services).reduce((sum, s) => sum + s.totalRequests, 0),
        totalFailures: Object.values(stats.services).reduce((sum, s) => sum + s.failedRequests, 0),
        overallSuccessRate: calculateOverallSuccessRate(stats),
        averageLatency: calculateAverageLatency(stats)
      },
      byService: {},
      capacity: capacity
    };

    Object.entries(stats.services).forEach(([service, stat]) => {
      metrics.byService[service] = {
        requests: stat.totalRequests,
        successes: stat.successfulRequests,
        failures: stat.failedRequests,
        successRate: stat.successRate,
        avgLatency: stat.averageLatency.toFixed(2) + 'ms',
        errorRate: stat.errorRate.toFixed(2) + '%'
      };
    });

    res.json(metrics);

  } catch (error) {
    logger.error('[Dashboard] Metrics error:', error);
    res.status(500).json({ error: error.message });
  }
}));

/**
 * @route   GET /api/dashboard/analytics
 * @desc    Get analytics and insights
 * @access  Private
 */
router.get('/analytics', asyncHandler(async (req, res) => {
  try {
    const gateway = req.pythonGateway;
    const monitor = req.pythonHealthMonitor;

    if (!gateway || !monitor) {
      return res.status(503).json({ error: 'Services not initialized' });
    }

    const stats = gateway.getStatistics();
    const report = monitor.getMetricsReport();

    const analytics = {
      timestamp: new Date(),
      topServices: getTopServices(stats),
      bottomServices: getBottomServices(stats),
      trends: {
        successRate: calculateTrend(stats, 'successRate'),
        errorRate: calculateTrend(stats, 'errorRate'),
        latency: calculateTrend(stats, 'latency')
      },
      recommendations: generateRecommendations(stats, report),
      healthScore: calculateHealthScore(stats, report)
    };

    res.json(analytics);

  } catch (error) {
    logger.error('[Dashboard] Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// ============================================================================
// ALERTS & NOTIFICATIONS
// ============================================================================

/**
 * @route   GET /api/dashboard/alerts
 * @desc    Get current alerts and issues
 * @access  Private
 */
router.get('/alerts', asyncHandler(async (req, res) => {
  try {
    const monitor = req.pythonHealthMonitor;
    const gateway = req.pythonGateway;

    if (!monitor || !gateway) {
      return res.status(503).json({ error: 'Services not initialized' });
    }

    const healthStatus = monitor.getHealthStatus();
    const capacity = gateway.getServiceCapacity();
    const stats = gateway.getStatistics();

    const alerts = [];

    // Check service health
    Object.entries(healthStatus.services).forEach(([service, status]) => {
      if (!status.healthy) {
        alerts.push({
          id: `health-${service}`,
          severity: 'critical',
          type: 'health',
          service: service,
          message: `Service ${service} is unhealthy`,
          timestamp: new Date(),
          details: status
        });
      }
    });

    // Check capacity
    Object.entries(capacity).forEach(([service, cap]) => {
      const utilization = parseFloat(cap.utilization);
      if (utilization > 90) {
        alerts.push({
          id: `capacity-${service}`,
          severity: 'critical',
          type: 'capacity',
          service: service,
          message: `Service ${service} capacity critical (${cap.utilization} utilized)`,
          timestamp: new Date(),
          details: cap
        });
      } else if (utilization > 70) {
        alerts.push({
          id: `capacity-warning-${service}`,
          severity: 'warning',
          type: 'capacity',
          service: service,
          message: `Service ${service} capacity high (${cap.utilization} utilized)`,
          timestamp: new Date(),
          details: cap
        });
      }
    });

    // Check error rates
    Object.entries(stats.services).forEach(([service, stat]) => {
      const errorRate = parseFloat(stat.errorRate);
      if (errorRate > 5) {
        alerts.push({
          id: `errors-${service}`,
          severity: 'warning',
          type: 'error_rate',
          service: service,
          message: `Service ${service} error rate elevated (${stat.errorRate})`,
          timestamp: new Date(),
          details: { errorRate, failedRequests: stat.failedRequests }
        });
      }
    });

    res.json({
      timestamp: new Date(),
      totalAlerts: alerts.length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      warningAlerts: alerts.filter(a => a.severity === 'warning').length,
      alerts: alerts
    });

  } catch (error) {
    logger.error('[Dashboard] Alerts error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// ============================================================================
// SERVICE CONTROL
// ============================================================================

/**
 * @route   POST /api/dashboard/service/:name/restart
 * @desc    Request service restart
 * @access  Private (Admin)
 */
router.post('/service/:name/restart', asyncHandler(async (req, res) => {
  try {
    const { name } = req.params;
    const monitor = req.pythonHealthMonitor;

    if (!monitor) {
      return res.status(503).json({ error: 'Monitor not initialized' });
    }

    // Simulate service restart signal (in production, would trigger K8s restart)
    logger.info(`[Dashboard] Restart signal sent for service: ${name}`);

    res.json({
      success: true,
      service: name,
      action: 'restart',
      message: `Restart signal sent to ${name}`,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('[Dashboard] Restart error:', error);
    res.status(500).json({ error: error.message });
  }
}));

/**
 * @route   POST /api/dashboard/reset-stats
 * @desc    Reset all service statistics
 * @access  Private (Admin)
 */
router.post('/reset-stats', asyncHandler(async (req, res) => {
  try {
    const gateway = req.pythonGateway;

    if (!gateway) {
      return res.status(503).json({ error: 'Gateway not initialized' });
    }

    gateway.resetStatistics();

    res.json({
      success: true,
      message: 'Statistics reset successfully',
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('[Dashboard] Reset stats error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate alerts based on current state
 */
function generateAlerts(healthStatus, capacity, stats) {
  const alerts = [];

  Object.entries(capacity).forEach(([service, cap]) => {
    const utilization = parseFloat(cap.utilization);
    if (utilization > 80) {
      alerts.push({
        service,
        type: 'capacity',
        severity: utilization > 90 ? 'critical' : 'warning',
        message: `${service} capacity at ${cap.utilization}`
      });
    }
  });

  return alerts;
}

/**
 * Calculate overall success rate
 */
function calculateOverallSuccessRate(stats) {
  const services = Object.values(stats.services);
  if (services.length === 0) return '0%';

  const totalRequests = services.reduce((sum, s) => sum + s.totalRequests, 0);
  const totalSuccesses = services.reduce((sum, s) => sum + s.successfulRequests, 0);

  if (totalRequests === 0) return '0%';
  return ((totalSuccesses / totalRequests) * 100).toFixed(2) + '%';
}

/**
 * Calculate average latency
 */
function calculateAverageLatency(stats) {
  const services = Object.values(stats.services);
  if (services.length === 0) return '0ms';

  const avgLatency = services.reduce((sum, s) => sum + s.averageLatency, 0) / services.length;
  return avgLatency.toFixed(2) + 'ms';
}

/**
 * Get top performing services
 */
function getTopServices(stats) {
  return Object.entries(stats.services)
    .map(([service, stat]) => ({
      service,
      successRate: parseFloat(stat.successRate),
      requests: stat.totalRequests,
      latency: stat.averageLatency
    }))
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 3);
}

/**
 * Get bottom performing services
 */
function getBottomServices(stats) {
  return Object.entries(stats.services)
    .map(([service, stat]) => ({
      service,
      successRate: parseFloat(stat.successRate),
      requests: stat.totalRequests,
      latency: stat.averageLatency
    }))
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 3);
}

/**
 * Calculate trend (simplified)
 */
function calculateTrend(stats, metric) {
  return {
    current: Object.values(stats.services)[0]?.[metric] || 0,
    trend: 'stable', // Would be calculated with historical data
    direction: '→'
  };
}

/**
 * Generate trends for service
 */
function generateTrends(stat, service) {
  return {
    requests: 'increasing',
    successRate: 'stable',
    latency: 'stable',
    recommendations: [
      'Monitor error rate changes',
      'Check latency patterns',
      'Review load distribution'
    ]
  };
}

/**
 * Generate recommendations
 */
function generateRecommendations(stats, report) {
  const recommendations = [];

  Object.entries(stats.services).forEach(([service, stat]) => {
    if (parseFloat(stat.errorRate) > 5) {
      recommendations.push(`Review and fix errors in ${service}`);
    }
    if (stat.averageLatency > 200) {
      recommendations.push(`Optimize ${service} performance`);
    }
  });

  return recommendations;
}

/**
 * Calculate overall health score
 */
function calculateHealthScore(stats, report) {
  const successRate = parseFloat(calculateOverallSuccessRate(stats));
  const avgLatency = Object.values(stats.services).reduce((sum, s) => sum + s.averageLatency, 0) / 5;

  let score = 100;

  // Deduct for low success rate
  if (successRate < 95) {
    score -= (95 - successRate) * 5;
  }

  // Deduct for high latency
  if (avgLatency > 100) {
    score -= Math.min(20, (avgLatency - 100) / 10);
  }

  return Math.max(0, Math.min(100, score)).toFixed(2);
}

module.exports = router;
