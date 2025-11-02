const os = require('os');
const { performance: _performance } = require('perf_hooks');

class HealthMonitor {
  constructor() {
    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    this.lastCheckTime = Date.now();
  }

  incrementRequests() {
    this.requestCount++;
  }

  incrementErrors() {
    this.errorCount++;
  }

  getSystemMetrics() {
    const uptime = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      uptime,
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: os.loadavg()
      },
      requests: {
        total: this.requestCount,
        errors: this.errorCount,
        errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0
      }
    };
  }

  getHealthStatus() {
    const metrics = this.getSystemMetrics();
    const memoryHealthy = metrics.memory.percentage < 90;
    const errorRateHealthy = metrics.requests.errorRate < 5;

    const status = memoryHealthy && errorRateHealthy ? 'healthy' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      service: 'soba-backend',
      version: process.env.APP_VERSION || '1.0.0',
      metrics,
      checks: {
        memory: memoryHealthy ? 'pass' : 'fail',
        errorRate: errorRateHealthy ? 'pass' : 'fail'
      }
    };
  }

  async checkDependencies() {
    const checks = {
      database: 'unknown',
      redis: 'unknown',
      external_api: 'unknown'
    };

    // Add actual dependency checks here
    try {
      // Example: await database.ping()
      checks.database = 'healthy';
    } catch (_error) {
      checks.database = 'unhealthy';
    }

    return checks;
  }
}

module.exports = new HealthMonitor();