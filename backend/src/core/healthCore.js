/**
 * Health Core - Comprehensive Health Monitoring System
 * Multi-dimensional health checks with historical data
 */

class HealthCore {
  constructor(options = {}) {
    this.config = {
      historySize: options.historySize || 100,
      checkInterval: options.checkInterval || 30000, // 30 seconds
      thresholds: {
        memory: options.memoryThreshold || 0.9, // 90%
        cpu: options.cpuThreshold || 0.8, // 80%
        errorRate: options.errorRateThreshold || 0.05, // 5%
        responseTime: options.responseTimeThreshold || 1000 // 1s
      }
    };

    this.checks = new Map();
    this.history = [];
    this.startTime = Date.now();
    this.lastCheck = null;

    this.registerDefaultChecks();
    this.startPeriodicChecks();
  }

  // Register a health check
  register(name, checkFn, options = {}) {
    this.checks.set(name, {
      name,
      checkFn,
      critical: options.critical || false,
      timeout: options.timeout || 5000,
      enabled: options.enabled !== false
    });

    return this;
  }

  // Unregister a health check
  unregister(name) {
    return this.checks.delete(name);
  }

  // Run a single health check
  async runCheck(name) {
    const check = this.checks.get(name);

    if (!check || !check.enabled) {
      return null;
    }

    const start = Date.now();

    try {
      const result = await Promise.race([
        check.checkFn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Check timeout')), check.timeout)
        )
      ]);

      return {
        name,
        status: result.status || 'healthy',
        message: result.message || 'Check passed',
        duration: Date.now() - start,
        timestamp: Date.now(),
        data: result.data || {},
        critical: check.critical
      };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        message: error.message,
        duration: Date.now() - start,
        timestamp: Date.now(),
        error: error.stack,
        critical: check.critical
      };
    }
  }

  // Run all health checks
  async runAll() {
    const results = {};
    const checks = Array.from(this.checks.keys());

    await Promise.all(
      checks.map(async (name) => {
        results[name] = await this.runCheck(name);
      })
    );

    // Calculate overall status
    let status = 'healthy';

    for (const result of Object.values(results)) {
      if (result && result.status === 'unhealthy') {
        if (result.critical) {
          status = 'unhealthy';
          break;
        } else {
          status = 'degraded';
        }
      }
    }

    const healthReport = {
      status,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      checks: results,
      summary: this.getSummary(results)
    };

    // Add to history
    this.addToHistory(healthReport);
    this.lastCheck = healthReport;

    return healthReport;
  }

  // Get summary statistics
  getSummary(results) {
    const checks = Object.values(results).filter(r => r !== null);

    return {
      total: checks.length,
      healthy: checks.filter(r => r.status === 'healthy').length,
      unhealthy: checks.filter(r => r.status === 'unhealthy').length,
      degraded: checks.filter(r => r.status === 'degraded').length,
      critical: checks.filter(r => r.critical && r.status === 'unhealthy').length
    };
  }

  // Add to history
  addToHistory(report) {
    this.history.push({
      status: report.status,
      timestamp: report.timestamp,
      summary: report.summary
    });

    // Keep only recent history
    if (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }

  // Get health history
  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  // Calculate uptime percentage
  getUptimePercentage() {
    if (this.history.length < 2) {
      return 100;
    }

    const healthyCount = this.history.filter(h => h.status === 'healthy').length;
    return ((healthyCount / this.history.length) * 100).toFixed(2);
  }

  // Register default health checks
  registerDefaultChecks() {
    // Memory check
    this.register(
      'memory',
      () => {
        const usage = process.memoryUsage();
        const heapPercent = usage.heapUsed / usage.heapTotal;

        return {
          status: heapPercent < this.config.thresholds.memory ? 'healthy' : 'unhealthy',
          message: `Memory usage: ${(heapPercent * 100).toFixed(2)}%`,
          data: {
            heapUsed: Math.round(usage.heapUsed / 1048576) + 'MB',
            heapTotal: Math.round(usage.heapTotal / 1048576) + 'MB',
            rss: Math.round(usage.rss / 1048576) + 'MB',
            external: Math.round(usage.external / 1048576) + 'MB',
            percent: (heapPercent * 100).toFixed(2) + '%'
          }
        };
      },
      { critical: true }
    );

    // Uptime check
    this.register('uptime', () => {
      const uptime = process.uptime();

      return {
        status: uptime > 5 ? 'healthy' : 'degraded',
        message: `Uptime: ${this.formatUptime(uptime)}`,
        data: {
          seconds: Math.floor(uptime),
          formatted: this.formatUptime(uptime)
        }
      };
    });

    // Event loop check
    this.register('eventLoop', () => {
      const start = Date.now();

      return new Promise((resolve) => {
        setImmediate(() => {
          const lag = Date.now() - start;

          resolve({
            status: lag < 100 ? 'healthy' : lag < 500 ? 'degraded' : 'unhealthy',
            message: `Event loop lag: ${lag}ms`,
            data: {
              lag: lag + 'ms',
              threshold: '100ms'
            }
          });
        });
      });
    });

    // Process check
    this.register('process', () => {
      const cpuUsage = process.cpuUsage();

      return {
        status: 'healthy',
        message: 'Process running normally',
        data: {
          pid: process.pid,
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          cpuUser: (cpuUsage.user / 1000000).toFixed(2) + 's',
          cpuSystem: (cpuUsage.system / 1000000).toFixed(2) + 's'
        }
      };
    });
  }

  // Format uptime
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (secs > 0 || parts.length === 0) {
      parts.push(`${secs}s`);
    }

    return parts.join(' ');
  }

  // Start periodic health checks
  startPeriodicChecks() {
    this.checkTimer = setInterval(async () => {
      try {
        await this.runAll();
      } catch (error) {
        console.error('[Health] Periodic check failed:', error);
      }
    }, this.config.checkInterval);

    // Run initial check
    setTimeout(() => this.runAll(), 1000);
  }

  // Stop periodic checks
  stopPeriodicChecks() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // Get latest health status
  getStatus() {
    return this.lastCheck || {
      status: 'unknown',
      message: 'No health checks run yet',
      timestamp: Date.now()
    };
  }

  // Get detailed health report
  async getDetailedReport() {
    const current = await this.runAll();
    const history = this.getHistory(20);
    const uptime = this.getUptimePercentage();

    return {
      current,
      history,
      metrics: {
        uptime: this.formatUptime((Date.now() - this.startTime) / 1000),
        uptimePercentage: uptime + '%',
        totalChecks: this.checks.size,
        historySize: this.history.length
      }
    };
  }

  // Express middleware for health endpoint
  createMiddleware() {
    return async (req, res) => {
      try {
        const health = await this.runAll();

        const statusCode = health.status === 'healthy' ? 200 :
          health.status === 'degraded' ? 200 : 503;

        res.status(statusCode).json(health);
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: 'Health check failed',
          error: error.message
        });
      }
    };
  }

  // Create detailed health endpoint
  createDetailedMiddleware() {
    return async (req, res) => {
      try {
        const report = await this.getDetailedReport();
        res.json(report);
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: 'Failed to generate health report',
          error: error.message
        });
      }
    };
  }
}

module.exports = HealthCore;