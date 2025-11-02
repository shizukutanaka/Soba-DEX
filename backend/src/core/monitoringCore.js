/**
 * Monitoring Core - Real-time Performance Monitoring
 * Tracks system health, performance metrics, and alerts
 */

class MonitoringCore {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byEndpoint: new Map(),
        byStatus: new Map()
      },
      performance: {
        responseTimes: [],
        avgResponseTime: 0,
        p50: 0,
        p95: 0,
        p99: 0
      },
      system: {
        startTime: Date.now(),
        uptime: 0,
        memory: {},
        cpu: {}
      },
      errors: [],
      alerts: []
    };

    this.config = {
      maxResponseTimes: 10000,
      maxErrors: 1000,
      alertThresholds: {
        errorRate: 0.05, // 5%
        avgResponseTime: 1000, // 1s
        memoryUsage: 0.9 // 90%
      }
    };

    this.startTime = Date.now();
    this.startMonitoring();
  }

  // Track request
  trackRequest(req, res, duration) {
    this.metrics.requests.total++;

    // Track by status
    if (res.statusCode >= 200 && res.statusCode < 300) {
      this.metrics.requests.successful++;
    } else if (res.statusCode >= 400) {
      this.metrics.requests.failed++;
    }

    // Track by endpoint
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    const endpointStats = this.metrics.requests.byEndpoint.get(endpoint) || {
      count: 0,
      avgDuration: 0,
      totalDuration: 0
    };

    endpointStats.count++;
    endpointStats.totalDuration += duration;
    endpointStats.avgDuration = endpointStats.totalDuration / endpointStats.count;

    this.metrics.requests.byEndpoint.set(endpoint, endpointStats);

    // Track by status code
    const statusKey = `${Math.floor(res.statusCode / 100)}xx`;
    this.metrics.requests.byStatus.set(
      statusKey,
      (this.metrics.requests.byStatus.get(statusKey) || 0) + 1
    );

    // Track response time
    this.recordResponseTime(duration);

    // Check for alerts
    this.checkAlerts();
  }

  // Record response time
  recordResponseTime(duration) {
    this.metrics.performance.responseTimes.push(duration);

    // Keep only recent response times
    if (this.metrics.performance.responseTimes.length > this.config.maxResponseTimes) {
      this.metrics.performance.responseTimes.shift();
    }

    // Calculate percentiles
    this.calculatePercentiles();
  }

  // Calculate performance percentiles
  calculatePercentiles() {
    const times = [...this.metrics.performance.responseTimes].sort((a, b) => a - b);
    const len = times.length;

    if (len === 0) {
      return;
    }

    this.metrics.performance.avgResponseTime =
      times.reduce((a, b) => a + b, 0) / len;

    this.metrics.performance.p50 = times[Math.floor(len * 0.5)];
    this.metrics.performance.p95 = times[Math.floor(len * 0.95)];
    this.metrics.performance.p99 = times[Math.floor(len * 0.99)];
  }

  // Record error
  recordError(error, context = {}) {
    const errorRecord = {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode || 500,
      context,
      timestamp: Date.now()
    };

    this.metrics.errors.push(errorRecord);

    // Keep only recent errors
    if (this.metrics.errors.length > this.config.maxErrors) {
      this.metrics.errors.shift();
    }

    // Check if error rate is too high
    this.checkErrorRate();
  }

  // Check error rate
  checkErrorRate() {
    const total = this.metrics.requests.total;
    if (total === 0) {
      return;
    }

    const errorRate = this.metrics.requests.failed / total;

    if (errorRate > this.config.alertThresholds.errorRate) {
      this.createAlert('high_error_rate', {
        errorRate: (errorRate * 100).toFixed(2) + '%',
        threshold: (this.config.alertThresholds.errorRate * 100) + '%',
        totalRequests: total,
        failedRequests: this.metrics.requests.failed
      });
    }
  }

  // Check alerts
  checkAlerts() {
    // Check average response time
    if (this.metrics.performance.avgResponseTime > this.config.alertThresholds.avgResponseTime) {
      this.createAlert('high_response_time', {
        avgResponseTime: this.metrics.performance.avgResponseTime.toFixed(2) + 'ms',
        threshold: this.config.alertThresholds.avgResponseTime + 'ms'
      });
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapPercent = memUsage.heapUsed / memUsage.heapTotal;

    if (heapPercent > this.config.alertThresholds.memoryUsage) {
      this.createAlert('high_memory_usage', {
        heapUsed: (memUsage.heapUsed / 1048576).toFixed(2) + 'MB',
        heapTotal: (memUsage.heapTotal / 1048576).toFixed(2) + 'MB',
        percentage: (heapPercent * 100).toFixed(2) + '%'
      });
    }
  }

  // Create alert
  createAlert(type, data) {
    // Check if similar alert exists recently (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentAlert = this.metrics.alerts.find(
      alert => alert.type === type && alert.timestamp > fiveMinutesAgo
    );

    if (recentAlert) {
      return;
    } // Don't spam alerts

    const alert = {
      type,
      data,
      timestamp: Date.now(),
      severity: this.getAlertSeverity(type)
    };

    this.metrics.alerts.push(alert);

    // Keep only recent alerts (last 100)
    if (this.metrics.alerts.length > 100) {
      this.metrics.alerts.shift();
    }

    console.warn(`[ALERT] ${type}:`, data);
  }

  // Get alert severity
  getAlertSeverity(type) {
    const severityMap = {
      high_error_rate: 'critical',
      high_response_time: 'warning',
      high_memory_usage: 'warning',
      high_cpu_usage: 'warning'
    };

    return severityMap[type] || 'info';
  }

  // Update system metrics
  updateSystemMetrics() {
    const memUsage = process.memoryUsage();

    this.metrics.system.uptime = process.uptime();
    this.metrics.system.memory = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapPercent: (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(2)
    };
  }

  // Get current metrics
  getMetrics() {
    this.updateSystemMetrics();

    return {
      requests: {
        total: this.metrics.requests.total,
        successful: this.metrics.requests.successful,
        failed: this.metrics.requests.failed,
        successRate: this.metrics.requests.total > 0
          ? ((this.metrics.requests.successful / this.metrics.requests.total) * 100).toFixed(2) + '%'
          : '0%',
        byStatus: Object.fromEntries(this.metrics.requests.byStatus)
      },
      performance: {
        avgResponseTime: this.metrics.performance.avgResponseTime.toFixed(2) + 'ms',
        p50: this.metrics.performance.p50 + 'ms',
        p95: this.metrics.performance.p95 + 'ms',
        p99: this.metrics.performance.p99 + 'ms'
      },
      system: {
        uptime: Math.floor(this.metrics.system.uptime) + 's',
        uptimeHuman: this.formatUptime(this.metrics.system.uptime),
        memory: {
          heapUsed: (this.metrics.system.memory.heapUsed / 1048576).toFixed(2) + 'MB',
          heapTotal: (this.metrics.system.memory.heapTotal / 1048576).toFixed(2) + 'MB',
          rss: (this.metrics.system.memory.rss / 1048576).toFixed(2) + 'MB',
          heapPercent: this.metrics.system.memory.heapPercent + '%'
        }
      },
      errors: {
        total: this.metrics.errors.length,
        recent: this.metrics.errors.slice(-10)
      },
      alerts: {
        total: this.metrics.alerts.length,
        active: this.metrics.alerts.filter(a => a.timestamp > Date.now() - 5 * 60 * 1000).length,
        recent: this.metrics.alerts.slice(-5)
      },
      timestamp: Date.now()
    };
  }

  // Get endpoint stats
  getEndpointStats() {
    const stats = [];

    this.metrics.requests.byEndpoint.forEach((data, endpoint) => {
      stats.push({
        endpoint,
        count: data.count,
        avgDuration: data.avgDuration.toFixed(2) + 'ms'
      });
    });

    return stats.sort((a, b) => b.count - a.count);
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

  // Start monitoring
  startMonitoring() {
    // Update system metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);

    // Clean old data every 5 minutes
    setInterval(() => {
      this.cleanOldData();
    }, 5 * 60 * 1000);
  }

  // Clean old data
  cleanOldData() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // Clean old errors
    this.metrics.errors = this.metrics.errors.filter(
      e => e.timestamp > oneHourAgo
    );

    // Clean old alerts
    this.metrics.alerts = this.metrics.alerts.filter(
      a => a.timestamp > oneHourAgo
    );
  }

  // Express middleware
  createMiddleware() {
    return (req, res, next) => {
      const start = Date.now();

      // Track response
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.trackRequest(req, res, duration);
      });

      next();
    };
  }

  // Health check
  getHealth() {
    this.updateSystemMetrics();

    const errorRate = this.metrics.requests.total > 0
      ? this.metrics.requests.failed / this.metrics.requests.total
      : 0;

    const isHealthy =
      errorRate < this.config.alertThresholds.errorRate &&
      this.metrics.performance.avgResponseTime < this.config.alertThresholds.avgResponseTime &&
      parseFloat(this.metrics.system.memory.heapPercent) < (this.config.alertThresholds.memoryUsage * 100);

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      uptime: this.formatUptime(this.metrics.system.uptime),
      timestamp: Date.now(),
      checks: {
        errorRate: {
          status: errorRate < this.config.alertThresholds.errorRate ? 'pass' : 'fail',
          value: (errorRate * 100).toFixed(2) + '%',
          threshold: (this.config.alertThresholds.errorRate * 100) + '%'
        },
        responseTime: {
          status: this.metrics.performance.avgResponseTime < this.config.alertThresholds.avgResponseTime ? 'pass' : 'fail',
          value: this.metrics.performance.avgResponseTime.toFixed(2) + 'ms',
          threshold: this.config.alertThresholds.avgResponseTime + 'ms'
        },
        memory: {
          status: parseFloat(this.metrics.system.memory.heapPercent) < (this.config.alertThresholds.memoryUsage * 100) ? 'pass' : 'fail',
          value: this.metrics.system.memory.heapPercent + '%',
          threshold: (this.config.alertThresholds.memoryUsage * 100) + '%'
        }
      }
    };
  }

  // Reset metrics
  reset() {
    this.metrics.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      byEndpoint: new Map(),
      byStatus: new Map()
    };
    this.metrics.performance.responseTimes = [];
    this.metrics.errors = [];
    this.metrics.alerts = [];

    console.log('[Monitoring] Metrics reset');
  }
}

module.exports = new MonitoringCore();