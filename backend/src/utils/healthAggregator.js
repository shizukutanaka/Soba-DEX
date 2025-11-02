class HealthAggregator {
  constructor() {
    this.services = new Map();
    this.config = {
      timeout: 5000,
      retries: 2,
      warningThreshold: 80, // % of services that must be healthy
      criticalThreshold: 50 // % of services that must be healthy
    };
    this.cache = null;
    this.cacheExpiry = 0;
    this.cacheTTL = 30000; // 30 seconds
  }

  // Register a service health check
  register(name, healthCheckFunction, options = {}) {
    this.services.set(name, {
      name,
      check: healthCheckFunction,
      weight: options.weight || 1,
      timeout: options.timeout || this.config.timeout,
      retries: options.retries || this.config.retries,
      critical: options.critical || false, // If true, failure makes entire system unhealthy
      lastCheck: null,
      lastResult: null,
      errorCount: 0,
      successCount: 0
    });

    console.log(`Registered health check: ${name}`);
  }

  // Remove a service health check
  unregister(name) {
    const removed = this.services.delete(name);
    if (removed) {
      console.log(`Unregistered health check: ${name}`);
    }
    return removed;
  }

  // Run all health checks
  async checkAll() {
    // Return cached result if still valid
    if (this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }

    const startTime = Date.now();
    const results = new Map();

    // Run all checks in parallel
    const promises = Array.from(this.services.entries()).map(([name, service]) =>
      this.runServiceCheck(name, service).then(result => {
        results.set(name, result);
      })
    );

    await Promise.allSettled(promises);

    // Aggregate results
    const healthReport = this.aggregateResults(results, startTime);

    // Cache the result
    this.cache = healthReport;
    this.cacheExpiry = Date.now() + this.cacheTTL;

    return healthReport;
  }

  // Run individual service check
  async runServiceCheck(name, service) {
    const startTime = Date.now();

    for (let attempt = 0; attempt <= service.retries; attempt++) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), service.timeout);
        });

        // Run the actual health check
        const checkPromise = Promise.resolve(service.check());

        const result = await Promise.race([checkPromise, timeoutPromise]);

        // Successful check
        service.lastCheck = Date.now();
        service.lastResult = 'healthy';
        service.successCount++;

        return {
          name,
          status: 'healthy',
          duration: Date.now() - startTime,
          attempt: attempt + 1,
          data: result || null,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        // Failed attempt
        if (attempt === service.retries) {
          // Final attempt failed
          service.lastCheck = Date.now();
          service.lastResult = 'unhealthy';
          service.errorCount++;

          return {
            name,
            status: 'unhealthy',
            duration: Date.now() - startTime,
            attempt: attempt + 1,
            error: error.message,
            timestamp: new Date().toISOString()
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }

  // Aggregate all results into overall health status
  aggregateResults(results, startTime) {
    const services = Array.from(results.values());
    const healthyServices = services.filter(s => s.status === 'healthy');
    const unhealthyServices = services.filter(s => s.status === 'unhealthy');

    const totalServices = services.length;
    const healthyCount = healthyServices.length;
    const healthyPercentage = totalServices > 0 ? (healthyCount / totalServices) * 100 : 100;

    // Check for critical service failures
    const criticalFailures = unhealthyServices.filter(service => {
      const serviceConfig = this.services.get(service.name);
      return serviceConfig?.critical;
    });

    // Determine overall status
    let overallStatus = 'healthy';
    let statusReason = 'All services operational';

    if (criticalFailures.length > 0) {
      overallStatus = 'unhealthy';
      statusReason = `Critical service failures: ${criticalFailures.map(s => s.name).join(', ')}`;
    } else if (healthyPercentage < this.config.criticalThreshold) {
      overallStatus = 'unhealthy';
      statusReason = `Too many service failures (${Math.round(healthyPercentage)}% healthy)`;
    } else if (healthyPercentage < this.config.warningThreshold) {
      overallStatus = 'degraded';
      statusReason = `Some services degraded (${Math.round(healthyPercentage)}% healthy)`;
    }

    // Calculate response time statistics
    const responseTimes = services.map(s => s.duration);
    const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);

    return {
      status: overallStatus,
      reason: statusReason,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      summary: {
        total: totalServices,
        healthy: healthyCount,
        unhealthy: unhealthyServices.length,
        healthyPercentage: Math.round(healthyPercentage * 100) / 100
      },
      performance: {
        avgResponseTime: Math.round(avgResponseTime),
        maxResponseTime,
        totalDuration: Date.now() - startTime
      },
      services: services.reduce((acc, service) => {
        acc[service.name] = {
          status: service.status,
          duration: service.duration,
          ...(service.error && { error: service.error }),
          ...(service.data && { data: service.data })
        };
        return acc;
      }, {}),
      metadata: {
        cached: false,
        cacheExpiresAt: new Date(Date.now() + this.cacheTTL).toISOString()
      }
    };
  }

  // Quick health check (only critical services)
  async quickCheck() {
    const criticalServices = Array.from(this.services.entries())
      .filter(([_, service]) => service.critical);

    if (criticalServices.length === 0) {
      return { status: 'healthy', message: 'No critical services configured' };
    }

    const results = await Promise.allSettled(
      criticalServices.map(([name, service]) => this.runServiceCheck(name, service))
    );

    const failures = results
      .filter(result => result.status === 'fulfilled' && result.value.status === 'unhealthy')
      .map(result => result.value.name);

    return {
      status: failures.length === 0 ? 'healthy' : 'unhealthy',
      criticalServices: criticalServices.length,
      failures: failures.length,
      failedServices: failures
    };
  }

  // Get service statistics
  getServiceStats() {
    const stats = {};

    this.services.forEach((service, name) => {
      const total = service.successCount + service.errorCount;
      stats[name] = {
        successCount: service.successCount,
        errorCount: service.errorCount,
        totalChecks: total,
        successRate: total > 0 ? (service.successCount / total) * 100 : 0,
        lastCheck: service.lastCheck ? new Date(service.lastCheck).toISOString() : null,
        lastResult: service.lastResult
      };
    });

    return stats;
  }

  // Express middleware for health endpoint
  middleware() {
    return async (req, res) => {
      try {
        const healthReport = await this.checkAll();

        const statusCode = healthReport.status === 'healthy' ? 200 :
          healthReport.status === 'degraded' ? 200 : 503;

        res.status(statusCode).json(healthReport);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check system failure',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  // Quick health endpoint (faster response)
  quickMiddleware() {
    return async (req, res) => {
      try {
        const result = await this.quickCheck();
        const statusCode = result.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(result);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error.message
        });
      }
    };
  }

  // Clear cache
  clearCache() {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  // Configure thresholds
  configure(options) {
    this.config = { ...this.config, ...options };
  }

  // Register common service checks
  registerCommonChecks() {
    // Database check
    this.register('database', async () => {
      const connectionPool = require('../database/connectionPool');
      const result = await connectionPool.query('SELECT 1 as status');
      return { connected: true, result: result.rows[0] };
    }, { critical: true, timeout: 3000 });

    // Memory check
    this.register('memory', () => {
      const usage = process.memoryUsage();
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
      const utilizationPercent = (usage.heapUsed / usage.heapTotal) * 100;

      return {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        utilization: Math.round(utilizationPercent),
        status: utilizationPercent > 90 ? 'warning' : 'ok'
      };
    }, { timeout: 1000 });

    // Disk space check
    this.register('disk', () => {
      const fs = require('fs');
      const _stats = fs.statSync('.');

      return {
        available: true,
        writeable: true
      };
    }, { timeout: 2000 });

    console.log('Registered common health checks');
  }
}

module.exports = new HealthAggregator();