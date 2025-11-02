// ============================================================================
// Health Check Endpoints for Kubernetes and Load Balancers
// Standard health check routes for container orchestration
// ============================================================================

/**
 * Setup health check endpoints
 *
 * Provides:
 * - /health - Overall health status
 * - /health/live - Liveness probe (is the app running?)
 * - /health/ready - Readiness probe (can the app serve traffic?)
 * - /health/startup - Startup probe (has the app finished starting?)
 * - /metrics/health - Detailed health metrics
 *
 * @param {Express} app - Express application
 * @param {HealthMonitor} healthMonitor - Health monitor instance
 */
function setupHealthEndpoints(app, healthMonitor) {
  /**
   * Overall health status
   * Returns aggregated health status of all components
   */
  app.get('/health', async (req, res) => {
    try {
      const health = healthMonitor.getHealthStatus();

      const statusCode = health.overall === 'healthy' ? 200 :
                        health.overall === 'degraded' ? 200 :
                        503;

      res.status(statusCode).json({
        status: health.overall,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        components: health.components,
        metrics: {
          totalChecks: health.metrics.totalChecks,
          failedChecks: health.metrics.failedChecks,
          successRate: health.metrics.successRate
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Liveness probe
   * Kubernetes uses this to determine if the pod should be restarted
   * Returns 200 if the application is running, 503 if it should be restarted
   */
  app.get('/health/live', (req, res) => {
    // Simple check - is the Node.js process responsive?
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  /**
   * Readiness probe
   * Kubernetes uses this to determine if the pod can receive traffic
   * Returns 200 if ready to serve requests, 503 if not ready
   */
  app.get('/health/ready', async (req, res) => {
    try {
      const health = healthMonitor.getHealthStatus();

      // Consider the app ready if:
      // 1. Overall status is healthy or degraded (not critical)
      // 2. Database is accessible
      // 3. Redis is accessible

      const databaseHealthy = health.components.database?.status !== 'critical';
      const redisHealthy = health.components.redis?.status !== 'critical';
      const isReady = health.overall !== 'critical' && databaseHealthy && redisHealthy;

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          components: {
            database: health.components.database?.status || 'unknown',
            redis: health.components.redis?.status || 'unknown'
          }
        });
      } else {
        res.status(503).json({
          status: 'not-ready',
          timestamp: new Date().toISOString(),
          reason: health.overall === 'critical' ? 'System critical' : 'Dependencies unavailable',
          components: {
            database: health.components.database?.status || 'unknown',
            redis: health.components.redis?.status || 'unknown'
          }
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not-ready',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Startup probe
   * Kubernetes uses this during container startup
   * Returns 200 when the application has completed initialization
   */
  app.get('/health/startup', async (req, res) => {
    try {
      const health = healthMonitor.getHealthStatus();

      // Check if the app has performed at least one health check
      // (indicating initialization is complete)
      const isStarted = health.lastCheck !== null && health.metrics.totalChecks > 0;

      if (isStarted) {
        res.status(200).json({
          status: 'started',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          firstCheck: health.lastCheck
        });
      } else {
        res.status(503).json({
          status: 'starting',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'starting',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Detailed health metrics endpoint
   * Returns comprehensive health and recovery metrics
   */
  app.get('/metrics/health', async (req, res) => {
    try {
      const health = healthMonitor.getHealthStatus();
      const metrics = healthMonitor.getMetrics();

      res.status(200).json({
        status: health.overall,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        lastCheck: health.lastCheck,
        consecutiveFailures: health.consecutiveFailures,
        components: health.components,
        metrics: {
          totalChecks: metrics.totalChecks,
          failedChecks: metrics.failedChecks,
          successRate: metrics.successRate,
          recoveryAttempts: metrics.recoveryAttempts,
          successfulRecoveries: metrics.successfulRecoveries,
          recoveryRate: metrics.recoveryRate
        },
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
          },
          cpu: {
            user: process.cpuUsage().user,
            system: process.cpuUsage().system
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  console.log('[HealthEndpoints] Health check endpoints registered:');
  console.log('  GET /health - Overall health status');
  console.log('  GET /health/live - Liveness probe');
  console.log('  GET /health/ready - Readiness probe');
  console.log('  GET /health/startup - Startup probe');
  console.log('  GET /metrics/health - Detailed health metrics');
}

module.exports = { setupHealthEndpoints };
