/**
 * Enhanced Lightweight Monitoring and Alerting System
 * Comprehensive monitoring for DEX platform with real-time metrics
 */

const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class EnhancedLightweightMonitor {
  constructor() {
    // Enhanced metrics structure
    this.metrics = {
      requests: {
        total: 0,
        errors: 0,
        totalResponseTime: 0,
        byEndpoint: new Map(),
        byMethod: new Map(),
        responseTimeDistribution: {
          '<100ms': 0,
          '100-500ms': 0,
          '500-1000ms': 0,
          '1000-2000ms': 0,
          '>2000ms': 0
        }
      },
      memory: {
        peak: 0,
        average: 0,
        snapshots: [],
        heapUsed: 0,
        heapTotal: 0,
        external: 0
      },
      cpu: {
        average: 0,
        snapshots: [],
        loadAverage: []
      },
      trades: {
        total: 0,
        volume: 0,
        averageValue: 0,
        byPair: new Map(),
        failed: 0
      },
      users: {
        active: new Set(),
        peak: 0,
        sessions: new Map(),
        byCountry: new Map()
      },
      database: {
        queries: 0,
        slowQueries: 0,
        errors: 0,
        averageQueryTime: 0,
        byOperation: new Map(),
        connectionPool: {
          active: 0,
          idle: 0,
          waiting: 0
        }
      },
      system: {
        uptime: 0,
        loadAverage: [],
        diskUsage: {},
        network: {
          bytesIn: 0,
          bytesOut: 0,
          connections: 0
        }
      },
      blockchain: {
        syncStatus: 'unknown',
        lastBlock: 0,
        pendingTransactions: 0,
        gasPrice: 0,
        networkLatency: 0
      }
    };

    this.alerts = [];
    this.maxAlerts = 200;
    this.maxMetricsHistory = 1000;

    // Enhanced thresholds
    this.thresholds = {
      memoryUsagePercent: 85,
      responseTimeMs: 5000,
      errorRatePercent: 10,
      slowQueryMs: 1000,
      cpuUsagePercent: 80,
      diskUsagePercent: 90,
      databaseConnectionPool: 0.8,
      blockchainSyncDelay: 300, // seconds
      tradeFailureRate: 5 // percent
    };

    this.intervals = [];
    this.startTime = Date.now();
    this.lastCollection = Date.now();

    // Metrics history for trend analysis
    this.metricsHistory = [];

    this.startEnhancedMonitoring();
  }

  // Import error tracking system
  const { errorTrackingSystem } = require('../services/errorTrackingService');

  // Enhanced monitoring intervals
  startEnhancedMonitoring() {
    // Collect detailed metrics every 15 seconds
    this.intervals.push(setInterval(() => {
      this.collectDetailedMetrics();
    }, 15000));

    // Check thresholds every 30 seconds
    this.intervals.push(setInterval(() => {
      this.checkEnhancedThresholds();
    }, 30000));

    // Collect system metrics every minute
    this.intervals.push(setInterval(() => {
      this.collectSystemMetrics();
    }, 60000));

    // Clean old data every 10 minutes
    this.intervals.push(setInterval(() => {
      this.cleanOldData();
    }, 600000));

    // Save metrics to disk every 5 minutes
    this.intervals.push(setInterval(() => {
      this.persistMetrics();
    }, 300000));

    // Integrate with error tracking
    this.setupErrorTrackingIntegration();
  }

  /**
   * Setup integration with error tracking system
   */
  setupErrorTrackingIntegration() {
    // Listen for errors tracked by the error tracking system
    errorTrackingSystem.on('errorTracked', (error) => {
      this.recordErrorMetrics(error);
    });

    // Listen for alerts from error tracking
    errorTrackingSystem.on('alertTriggered', (alert) => {
      this.recordAlertMetrics(alert);
    });

    // Listen for periodic reports
    errorTrackingSystem.on('periodicReport', (report) => {
      this.integrateErrorReport(report);
    });
  }

  /**
   * Record error metrics in performance monitoring
   */
  recordErrorMetrics(error) {
    // Record in error tracking metrics
    const errorKey = `${error.classification.type}_${error.classification.category}`;
    const currentCount = this.metrics.errors.get(errorKey) || 0;
    this.metrics.errors.set(errorKey, currentCount + 1);

    // Track error performance impact
    if (error.performanceImpact) {
      this.metrics.performanceImpact.set(error.id, error.performanceImpact);
    }

    // Update error rate metrics
    this.updateErrorRateMetrics(error);
  }

  /**
   * Record alert metrics
   */
  recordAlertMetrics(alert) {
    this.metrics.alerts.push({
      timestamp: alert.timestamp,
      level: alert.level,
      type: alert.type,
      message: alert.message
    });

    // Keep only recent alerts
    if (this.metrics.alerts.length > 100) {
      this.metrics.alerts.shift();
    }
  }

  /**
   * Integrate error report with performance metrics
   */
  integrateErrorReport(report) {
    // Update error statistics in performance metrics
    this.metrics.errorStats = {
      totalErrors: report.summary.totalErrors,
      uniqueErrors: report.summary.uniqueErrors,
      errorsByType: report.summary.errorsByType,
      errorsByCategory: report.summary.errorsByCategory,
      errorsBySeverity: report.summary.errorsBySeverity,
      topEndpoints: report.summary.topEndpoints,
      topUsers: report.summary.topUsers,
      systemHealth: report.performance.systemHealth
    };

    // Update error patterns
    this.metrics.errorPatterns = report.patterns;

    // Update recent alerts
    this.metrics.recentAlerts = report.alerts.slice(-20); // Last 20 alerts
  }

  /**
   * Update error rate metrics
   */
  updateErrorRateMetrics(error) {
    const now = Date.now();
    const minute = Math.floor(now / 60000); // Minute timestamp

    // Initialize minute data if not exists
    if (!this.metrics.errorRatesByMinute.has(minute)) {
      this.metrics.errorRatesByMinute.set(minute, {
        timestamp: minute * 60000,
        total: 0,
        byType: new Map(),
        bySeverity: new Map()
      });
    }

    const minuteData = this.metrics.errorRatesByMinute.get(minute);
    minuteData.total++;

    // Update by type
    const typeCount = minuteData.byType.get(error.classification.type) || 0;
    minuteData.byType.set(error.classification.type, typeCount + 1);

    // Update by severity
    const severityCount = minuteData.bySeverity.get(error.severity) || 0;
    minuteData.bySeverity.set(error.severity, severityCount + 1);

    // Clean old minute data (keep last hour)
    const cutoffMinute = Math.floor((now - 3600000) / 60000);
    for (const [key] of this.metrics.errorRatesByMinute) {
      if (key < cutoffMinute) {
        this.metrics.errorRatesByMinute.delete(key);
      }
    }
  }

  // Enhanced metrics collection
  collectDetailedMetrics() {
    const now = Date.now();
    const elapsed = now - this.lastCollection;
    this.lastCollection = now;

    // Update uptime
    this.metrics.system.uptime = now - this.startTime;

    // Collect enhanced memory metrics
    this.collectMemoryMetrics();

    // Collect enhanced CPU metrics
    this.collectCpuMetrics();

    // Update averages and distributions
    this.updateMetricsAverages();

    // Store metrics snapshot for history
    this.storeMetricsSnapshot();
  }

  // Enhanced memory metrics collection
  collectMemoryMetrics() {
    const memUsage = process.memoryUsage();

    this.metrics.memory.heapUsed = memUsage.heapUsed;
    this.metrics.memory.heapTotal = memUsage.heapTotal;
    this.metrics.memory.external = memUsage.external;

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    this.metrics.memory.snapshots.push({
      timestamp: Date.now(),
      used: usedMemory,
      total: totalMemory,
      percent: memoryUsagePercent,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal
    });

    // Keep only last 100 snapshots
    if (this.metrics.memory.snapshots.length > 100) {
      this.metrics.memory.snapshots.shift();
    }
  }

  // Enhanced CPU metrics collection
  collectCpuMetrics() {
    const cpuUsage = process.cpuUsage();
    const loadAverage = os.loadavg();

    this.metrics.cpu.snapshots.push({
      timestamp: Date.now(),
      user: cpuUsage.user,
      system: cpuUsage.system,
      loadAverage: loadAverage
    });

    this.metrics.cpu.loadAverage = loadAverage;

    // Keep only last 100 snapshots
    if (this.metrics.cpu.snapshots.length > 100) {
      this.metrics.cpu.snapshots.shift();
    }
  }

  // Enhanced system metrics collection
  collectSystemMetrics() {
    try {
      // Disk usage (basic implementation)
      this.collectDiskUsage();

      // Network stats (if available)
      this.collectNetworkStats();
    } catch (error) {
      console.warn('Error collecting system metrics:', error.message);
    }
  }

  // Collect disk usage
  async collectDiskUsage() {
    try {
      // This would need platform-specific implementations
      // For now, we'll use a basic approach
      const stats = await fs.statvfs?.('/');
      if (stats) {
        const usagePercent = ((stats.f_bsize * (stats.f_blocks - stats.f_bavail)) / (stats.f_bsize * stats.f_blocks)) * 100;
        this.metrics.system.diskUsage = {
          total: stats.f_bsize * stats.f_blocks,
          used: stats.f_bsize * (stats.f_blocks - stats.f_bavail),
          available: stats.f_bsize * stats.f_bavail,
          percent: usagePercent
        };
      }
    } catch (error) {
      // Disk usage collection failed, continue
    }
  }

  // Collect network statistics
  collectNetworkStats() {
    // Network stats collection would require additional libraries
    // For now, we'll track basic connection info
    this.metrics.system.network.connections = Object.keys(require('net').Server.prototype).length;
  }

  // Update metrics averages and calculate distributions
  updateMetricsAverages() {
    // Memory averages
    if (this.metrics.memory.snapshots.length > 0) {
      const recentSnapshots = this.metrics.memory.snapshots.slice(-20);
      this.metrics.memory.average = recentSnapshots.reduce((sum, snap) => sum + snap.percent, 0) / recentSnapshots.length;
      this.metrics.memory.peak = Math.max(...recentSnapshots.map(snap => snap.percent));
    }

    // CPU averages
    if (this.metrics.cpu.snapshots.length > 0) {
      const recentSnapshots = this.metrics.cpu.snapshots.slice(-20);
      const totalUser = recentSnapshots.reduce((sum, snap) => sum + snap.user, 0);
      const totalSystem = recentSnapshots.reduce((sum, snap) => sum + snap.system, 0);
      this.metrics.cpu.average = (totalUser + totalSystem) / (recentSnapshots.length * 1000000); // Convert to percentage
    }

    // Request response time distribution
    if (this.metrics.requests.total > 0) {
      const avgResponseTime = this.metrics.requests.totalResponseTime / this.metrics.requests.total;
      this.updateResponseTimeDistribution(avgResponseTime);
    }
  }

  // Update response time distribution
  updateResponseTimeDistribution(responseTime) {
    const distribution = this.metrics.requests.responseTimeDistribution;
    if (responseTime < 100) distribution['<100ms']++;
    else if (responseTime < 500) distribution['100-500ms']++;
    else if (responseTime < 1000) distribution['500-1000ms']++;
    else if (responseTime < 2000) distribution['1000-2000ms']++;
    else distribution['>2000ms']++;
  }

  // Store metrics snapshot for history
  storeMetricsSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      requests: { ...this.metrics.requests },
      memory: { ...this.metrics.memory },
      cpu: { ...this.metrics.cpu },
      trades: { ...this.metrics.trades },
      users: {
        active: this.metrics.users.active.size,
        peak: this.metrics.users.peak
      },
      database: { ...this.metrics.database },
      system: { ...this.metrics.system },
      blockchain: { ...this.metrics.blockchain }
    };

    this.metricsHistory.push(snapshot);

    // Keep only last 1000 snapshots
    if (this.metricsHistory.length > this.maxMetricsHistory) {
      this.metricsHistory.shift();
    }
  }

  // Enhanced threshold checking
  checkEnhancedThresholds() {
    const alerts = [];

    // Memory usage check
    if (this.metrics.memory.average > this.thresholds.memoryUsagePercent) {
      alerts.push({
        type: 'memory',
        level: 'warning',
        message: `High memory usage: ${this.metrics.memory.average.toFixed(1)}%`,
        timestamp: Date.now(),
        value: this.metrics.memory.average,
        threshold: this.thresholds.memoryUsagePercent
      });
    }

    // Error rate check
    if (this.metrics.requests.total > 0) {
      const errorRate = (this.metrics.requests.errors / this.metrics.requests.total) * 100;
      if (errorRate > this.thresholds.errorRatePercent) {
        alerts.push({
          type: 'error_rate',
          level: 'error',
          message: `High error rate: ${errorRate.toFixed(1)}%`,
          timestamp: Date.now(),
          value: errorRate,
          threshold: this.thresholds.errorRatePercent
        });
      }
    }

    // Response time check
    if (this.metrics.requests.total > 0) {
      const avgResponseTime = this.metrics.requests.totalResponseTime / this.metrics.requests.total;
      if (avgResponseTime > this.thresholds.responseTimeMs) {
        alerts.push({
          type: 'response_time',
          level: 'warning',
          message: `Slow response time: ${avgResponseTime.toFixed(0)}ms`,
          timestamp: Date.now(),
          value: avgResponseTime,
          threshold: this.thresholds.responseTimeMs
        });
      }
    }

    // Database performance check
    if (this.metrics.database.queries > 0) {
      const slowQueryRate = (this.metrics.database.slowQueries / this.metrics.database.queries) * 100;
      if (slowQueryRate > 5) { // 5% threshold for slow queries
        alerts.push({
          type: 'database',
          level: 'warning',
          message: `High slow query rate: ${slowQueryRate.toFixed(1)}%`,
          timestamp: Date.now(),
          value: slowQueryRate,
          threshold: 5
        });
      }
    }

    // CPU usage check
    if (this.metrics.cpu.average > this.thresholds.cpuUsagePercent) {
      alerts.push({
        type: 'cpu',
        level: 'warning',
        message: `High CPU usage: ${this.metrics.cpu.average.toFixed(1)}%`,
        timestamp: Date.now(),
        value: this.metrics.cpu.average,
        threshold: this.thresholds.cpuUsagePercent
      });
    }

    // Trade failure rate check
    if (this.metrics.trades.total > 0) {
      const failureRate = (this.metrics.trades.failed / this.metrics.trades.total) * 100;
      if (failureRate > this.thresholds.tradeFailureRate) {
        alerts.push({
          type: 'trade_failure',
          level: 'error',
          message: `High trade failure rate: ${failureRate.toFixed(1)}%`,
          timestamp: Date.now(),
          value: failureRate,
          threshold: this.thresholds.tradeFailureRate
        });
      }
    }

    // Add alerts to the alerts array
    this.alerts.push(...alerts);

    // Keep only recent alerts
    const oneHourAgo = Date.now() - 3600000;
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneHourAgo);

    // Keep only the maximum number of alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    // Log critical alerts
    alerts.filter(alert => alert.level === 'error').forEach(alert => {
      console.error(`🚨 CRITICAL ALERT: ${alert.message}`);
    });
  }

  // Record API request metrics
  recordApiRequest(endpoint, method, responseTime, statusCode, error = null) {
    // Update general request metrics
    this.metrics.requests.total++;

    if (statusCode >= 400 || error) {
      this.metrics.requests.errors++;
    }

    this.metrics.requests.totalResponseTime += responseTime;

    // Update endpoint-specific metrics
    const endpointKey = `${method} ${endpoint}`;
    const endpointMetrics = this.metrics.requests.byEndpoint.get(endpointKey) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      avgResponseTime: 0
    };

    endpointMetrics.count++;
    endpointMetrics.totalTime += responseTime;

    if (statusCode >= 400 || error) {
      endpointMetrics.errors++;
    }

    endpointMetrics.avgResponseTime = endpointMetrics.totalTime / endpointMetrics.count;
    this.metrics.requests.byEndpoint.set(endpointKey, endpointMetrics);

    // Update method-specific metrics
    const methodMetrics = this.metrics.requests.byMethod.get(method) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      avgResponseTime: 0
    };

    methodMetrics.count++;
    methodMetrics.totalTime += responseTime;

    if (statusCode >= 400 || error) {
      methodMetrics.errors++;
    }

    methodMetrics.avgResponseTime = methodMetrics.totalTime / methodMetrics.count;
    this.metrics.requests.byMethod.set(method, methodMetrics);
  }

  // Record trade metrics
  recordTrade(pair, volume, value, success = true) {
    this.metrics.trades.total++;

    if (success) {
      this.metrics.trades.volume += volume;
      this.metrics.trades.averageValue = this.metrics.trades.volume / this.metrics.trades.total;
    } else {
      this.metrics.trades.failed++;
    }

    // Update pair-specific metrics
    const pairMetrics = this.metrics.trades.byPair.get(pair) || {
      count: 0,
      volume: 0,
      value: 0,
      success: 0,
      failed: 0
    };

    pairMetrics.count++;
    pairMetrics.volume += volume;
    pairMetrics.value += value;

    if (success) {
      pairMetrics.success++;
    } else {
      pairMetrics.failed++;
    }

    this.metrics.trades.byPair.set(pair, pairMetrics);
  }

  // Record database query metrics
  recordDatabaseQuery(operation, queryTime, success = true) {
    this.metrics.database.queries++;

    if (queryTime > this.thresholds.slowQueryMs) {
      this.metrics.database.slowQueries++;
    }

    if (!success) {
      this.metrics.database.errors++;
    }

    // Update operation-specific metrics
    const operationMetrics = this.metrics.database.byOperation.get(operation) || {
      count: 0,
      totalTime: 0,
      slowQueries: 0,
      errors: 0,
      avgTime: 0
    };

    operationMetrics.count++;
    operationMetrics.totalTime += queryTime;

    if (queryTime > this.thresholds.slowQueryMs) {
      operationMetrics.slowQueries++;
    }

    if (!success) {
      operationMetrics.errors++;
    }

    operationMetrics.avgTime = operationMetrics.totalTime / operationMetrics.count;
    this.metrics.database.byOperation.set(operation, operationMetrics);
  }

  // Record user activity
  recordUserActivity(userId, country = null) {
    this.metrics.users.active.add(userId);

    if (this.metrics.users.active.size > this.metrics.users.peak) {
      this.metrics.users.peak = this.metrics.users.active.size;
    }

    if (country) {
      const countryCount = this.metrics.users.byCountry.get(country) || 0;
      this.metrics.users.byCountry.set(country, countryCount + 1);
    }
  }

  // Persist metrics to disk
  async persistMetrics() {
    try {
      const metricsDir = path.join(process.cwd(), 'metrics');
      await fs.mkdir(metricsDir, { recursive: true });

      const filename = `metrics-${new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join(metricsDir, filename);

      // Save current metrics
      await fs.writeFile(filepath, JSON.stringify({
        timestamp: new Date().toISOString(),
        metrics: this.metrics,
        alerts: this.alerts.slice(-50), // Last 50 alerts
        uptime: this.metrics.system.uptime
      }, null, 2));

      // Clean up old metric files (keep last 7 days)
      const files = await fs.readdir(metricsDir);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (file.startsWith('metrics-')) {
          const fileDate = new Date(file.replace('metrics-', '').replace('.json', '')).getTime();
          if (fileDate < sevenDaysAgo) {
            await fs.unlink(path.join(metricsDir, file));
          }
        }
      }

      console.log('💾 Metrics persisted to disk');
    } catch (error) {
      console.error('Error persisting metrics:', error.message);
    }
  }

  // Clean old data
  cleanOldData() {
    const oneHourAgo = Date.now() - 3600000;

    // Remove old alerts
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneHourAgo);

    // Reset active users set periodically
    if (this.metrics.users.active.size > 1000) {
      this.metrics.users.active.clear();
    }

    // Clean old metric snapshots
    const cutoffTime = Date.now() - 3600000; // 1 hour ago
    this.metrics.memory.snapshots = this.metrics.memory.snapshots.filter(
      snapshot => snapshot.timestamp > cutoffTime
    );
    this.metrics.cpu.snapshots = this.metrics.cpu.snapshots.filter(
      snapshot => snapshot.timestamp > cutoffTime
    );

    // Log cleanup
    console.log('🧹 Cleaned old monitoring data');
  }

  // Get comprehensive health status
  getHealthStatus() {
    const issues = [];

    // Check memory
    if (this.metrics.memory.average > this.thresholds.memoryUsagePercent) {
      issues.push({
        component: 'memory',
        status: 'warning',
        message: `Memory usage at ${this.metrics.memory.average.toFixed(1)}%`
      });
    }

    // Check error rate
    if (this.metrics.requests.total > 0) {
      const errorRate = (this.metrics.requests.errors / this.metrics.requests.total) * 100;
      if (errorRate > this.thresholds.errorRatePercent) {
        issues.push({
          component: 'api',
          status: 'error',
          message: `Error rate at ${errorRate.toFixed(1)}%`
        });
      }
    }

    // Check response time
    if (this.metrics.requests.total > 0) {
      const avgResponseTime = this.metrics.requests.totalResponseTime / this.metrics.requests.total;
      if (avgResponseTime > this.thresholds.responseTimeMs) {
        issues.push({
          component: 'performance',
          status: 'warning',
          message: `Average response time ${avgResponseTime.toFixed(0)}ms`
        });
      }
    }

    // Check database
    if (this.metrics.database.queries > 0) {
      const slowQueryRate = (this.metrics.database.slowQueries / this.metrics.database.queries) * 100;
      if (slowQueryRate > 5) {
        issues.push({
          component: 'database',
          status: 'warning',
          message: `Slow query rate at ${slowQueryRate.toFixed(1)}%`
        });
      }
    }

    return {
      status: issues.some(issue => issue.status === 'error') ? 'error' :
              issues.some(issue => issue.status === 'warning') ? 'warning' : 'healthy',
      issues,
      timestamp: new Date().toISOString()
    };
  }

  // Get detailed metrics
  getMetrics() {
    return {
      timestamp: new Date().toISOString(),
      uptime: this.metrics.system.uptime,
      application: {
        requests: {
          total: this.metrics.requests.total,
          errors: this.metrics.requests.errors,
          errorRate: this.metrics.requests.total > 0 ?
            (this.metrics.requests.errors / this.metrics.requests.total) * 100 : 0,
          averageResponseTime: this.metrics.requests.total > 0 ?
            this.metrics.requests.totalResponseTime / this.metrics.requests.total : 0,
          byEndpoint: Object.fromEntries(this.metrics.requests.byEndpoint),
          byMethod: Object.fromEntries(this.metrics.requests.byMethod),
          responseTimeDistribution: this.metrics.requests.responseTimeDistribution
        },
        trades: {
          total: this.metrics.trades.total,
          volume: this.metrics.trades.volume,
          averageValue: this.metrics.trades.averageValue,
          failed: this.metrics.trades.failed,
          failureRate: this.metrics.trades.total > 0 ?
            (this.metrics.trades.failed / this.metrics.trades.total) * 100 : 0,
          byPair: Object.fromEntries(this.metrics.trades.byPair)
        },
        users: {
          active: this.metrics.users.active.size,
          peak: this.metrics.users.peak,
          byCountry: Object.fromEntries(this.metrics.users.byCountry)
        },
        database: {
          queries: this.metrics.database.queries,
          slowQueries: this.metrics.database.slowQueries,
          errors: this.metrics.database.errors,
          averageQueryTime: this.metrics.database.queries > 0 ?
            this.metrics.database.averageQueryTime : 0,
          byOperation: Object.fromEntries(this.metrics.database.byOperation),
          connectionPool: this.metrics.database.connectionPool
        }
      },
      system: {
        memory: {
          used: this.metrics.memory.heapUsed,
          total: this.metrics.memory.heapTotal,
          percent: this.metrics.memory.average,
          peak: this.metrics.memory.peak
        },
        cpu: {
          average: this.metrics.cpu.average,
          loadAverage: this.metrics.cpu.loadAverage
        },
        uptime: this.metrics.system.uptime,
        diskUsage: this.metrics.system.diskUsage,
        network: this.metrics.system.network
      },
      blockchain: this.metrics.blockchain
    };
  }

  // Get comprehensive dashboard data
  getDashboard() {
    const metrics = this.getMetrics();
    const health = this.getHealthStatus();

    return {
      status: health.status,
      uptime: Math.round(metrics.system.uptime / 1000 / 60), // minutes
      timestamp: metrics.timestamp,

      // Key metrics
      requestsPerMinute: Math.round((metrics.application.requests.total / (metrics.system.uptime / 1000 / 60)) * 100) / 100,
      errorRate: metrics.application.requests.errorRate,
      averageResponseTime: Math.round(metrics.application.requests.averageResponseTime),
      activeUsers: metrics.application.users.active,
      tradesPerHour: Math.round((metrics.application.trades.total / (metrics.system.uptime / 1000 / 3600)) * 100) / 100,

      // System metrics
      memoryUsage: `${Math.round(metrics.system.memory.percent)}%`,
      cpuUsage: `${Math.round(metrics.system.cpu.average * 100)}%`,
      loadAverage: metrics.system.cpu.loadAverage,

      // Recent alerts
      criticalAlerts: this.alerts.filter(a => a.level === 'error' && Date.now() - a.timestamp < 300000).length, // Last 5 minutes
      warningAlerts: this.alerts.filter(a => a.level === 'warning' && Date.now() - a.timestamp < 300000).length,

      // Performance indicators
      healthIssues: health.issues.length,
      databaseSlowQueries: metrics.application.database.slowQueries,
      tradeFailureRate: metrics.application.trades.failureRate,

      // Response time distribution
      responseTimeDistribution: metrics.application.requests.responseTimeDistribution
    };
  }

  // Reset metrics
  resetMetrics() {
    this.metrics = {
      requests: {
        total: 0,
        errors: 0,
        totalResponseTime: 0,
        byEndpoint: new Map(),
        byMethod: new Map(),
        responseTimeDistribution: {
          '<100ms': 0,
          '100-500ms': 0,
          '500-1000ms': 0,
          '1000-2000ms': 0,
          '>2000ms': 0
        }
      },
      memory: {
        peak: 0,
        average: 0,
        snapshots: [],
        heapUsed: 0,
        heapTotal: 0,
        external: 0
      },
      cpu: {
        average: 0,
        snapshots: [],
        loadAverage: []
      },
      trades: {
        total: 0,
        volume: 0,
        averageValue: 0,
        byPair: new Map(),
        failed: 0
      },
      users: {
        active: new Set(),
        peak: 0,
        sessions: new Map(),
        byCountry: new Map()
      },
      database: {
        queries: 0,
        slowQueries: 0,
        errors: 0,
        averageQueryTime: 0,
        byOperation: new Map(),
        connectionPool: {
          active: 0,
          idle: 0,
          waiting: 0
        }
      },
      system: {
        uptime: 0,
        loadAverage: [],
        diskUsage: {},
        network: {
          bytesIn: 0,
          bytesOut: 0,
          connections: 0
        }
      },
      blockchain: {
        syncStatus: 'unknown',
        lastBlock: 0,
        pendingTransactions: 0,
        gasPrice: 0,
        networkLatency: 0
      }
    };

    this.alerts = [];
    this.metricsHistory = [];
    this.startTime = Date.now();
    this.lastCollection = Date.now();

    console.log('🔄 Metrics reset');
  }

  // Stop monitoring
  stopMonitoring() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    console.log('⏹️  Enhanced monitoring stopped');
  }
}

// Export singleton instance
const enhancedLightweightMonitor = new EnhancedLightweightMonitor();

module.exports = {
  EnhancedLightweightMonitor,
  enhancedLightweightMonitor
};
      this.cleanOldData();
    }, 600000));
  }

  // Collect system metrics
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    // Update memory metrics
    this.metrics.memory.peak = Math.max(this.metrics.memory.peak, memUsageMB);
    this.metrics.memory.average = Math.round((this.metrics.memory.average + memUsageMB) / 2);

    // CPU usage (approximation)
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuUsage = Math.min(100, (loadAvg / cpuCount) * 100);
    this.metrics.cpu.average = Math.round((this.metrics.cpu.average + cpuUsage) / 2);

    this.lastCollection = Date.now();
  }

  // Record request metrics
  recordRequest(duration, isError = false) {
    this.metrics.requests.total++;
    this.metrics.requests.totalResponseTime += duration;

    if (isError) {
      this.metrics.requests.errors++;
    }

    // Check for slow response
    if (duration > this.thresholds.responseTimeMs) {
      this.addAlert('SLOW_RESPONSE', {
        duration: `${duration}ms`,
        threshold: `${this.thresholds.responseTimeMs}ms`
      });
    }
  }

  // Record trade metrics
  recordTrade(amount, userAddress) {
    this.metrics.trades.total++;
    this.metrics.trades.volume += parseFloat(amount) || 0;

    if (userAddress) {
      this.metrics.users.active.add(userAddress.toLowerCase());
      this.metrics.users.peak = Math.max(this.metrics.users.peak, this.metrics.users.active.size);
    }
  }

  // Record database metrics
  recordDbQuery(duration, isError = false) {
    this.metrics.database.queries++;

    if (isError) {
      this.metrics.database.errors++;
    }

    if (duration > this.thresholds.slowQueryMs) {
      this.metrics.database.slowQueries++;
      this.addAlert('SLOW_QUERY', {
        duration: `${duration}ms`,
        threshold: `${this.thresholds.slowQueryMs}ms`
      });
    }
  }

  // Check alert thresholds
  checkThresholds() {
    // Memory usage check
    const memUsage = process.memoryUsage();
    const memTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memUsagePercent = (memUsed / memTotal) * 100;

    if (memUsagePercent > this.thresholds.memoryUsagePercent) {
      this.addAlert('HIGH_MEMORY_USAGE', {
        usage: `${memUsagePercent.toFixed(1)}%`,
        threshold: `${this.thresholds.memoryUsagePercent}%`
      });
    }

    // Error rate check
    if (this.metrics.requests.total > 0) {
      const errorRate = (this.metrics.requests.errors / this.metrics.requests.total) * 100;
      if (errorRate > this.thresholds.errorRatePercent) {
        this.addAlert('HIGH_ERROR_RATE', {
          rate: `${errorRate.toFixed(1)}%`,
          threshold: `${this.thresholds.errorRatePercent}%`
        });
      }
    }

    // CPU usage check
    if (this.metrics.cpu.average > this.thresholds.cpuUsagePercent) {
      this.addAlert('HIGH_CPU_USAGE', {
        usage: `${this.metrics.cpu.average.toFixed(1)}%`,
        threshold: `${this.thresholds.cpuUsagePercent}%`
      });
    }
  }

  // Add alert
  addAlert(type, data, severity = 'warning') {
    const alert = {
      type,
      data,
      severity,
      timestamp: Date.now(),
      id: Date.now() + Math.random().toString(36).substr(2, 9)
    };

    this.alerts.unshift(alert);

    // Trim alerts if too many
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    // Log alert
    console.warn(`🚨 ALERT [${type}]:`, data);

    // Send to external monitoring if configured
    this.sendAlert(alert);
  }

  // Send alert to external system
  sendAlert(_alert) {
    // Placeholder for external monitoring integration
    // In production, integrate with services like:
    // - Slack webhooks
    // - Email notifications
    // - SMS alerts
    // - PagerDuty
    // - DataDog events
  }

  // Get current metrics
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    const avgResponseTime = this.metrics.requests.total > 0
      ? Math.round(this.metrics.requests.totalResponseTime / this.metrics.requests.total)
      : 0;

    const errorRate = this.metrics.requests.total > 0
      ? ((this.metrics.requests.errors / this.metrics.requests.total) * 100).toFixed(1)
      : 0;

    return {
      system: {
        uptime: Math.round(uptime / 1000), // seconds
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          peak: this.metrics.memory.peak
        },
        cpu: {
          usage: this.metrics.cpu.average,
          loadAvg: os.loadavg()
        }
      },
      application: {
        requests: {
          total: this.metrics.requests.total,
          errors: this.metrics.requests.errors,
          errorRate: `${errorRate}%`,
          avgResponseTime: `${avgResponseTime}ms`
        },
        trades: {
          total: this.metrics.trades.total,
          volume: this.metrics.trades.volume.toFixed(2)
        },
        users: {
          active: this.metrics.users.active.size,
          peak: this.metrics.users.peak
        },
        database: {
          queries: this.metrics.database.queries,
          slowQueries: this.metrics.database.slowQueries,
          errors: this.metrics.database.errors
        }
      },
      alerts: {
        recent: this.alerts.slice(0, 10), // Last 10 alerts
        total: this.alerts.length
      },
      timestamp: Date.now()
    };
  }

  // Get health status
  getHealthStatus() {
    const metrics = this.getMetrics();
    const issues = [];

    // Check various health indicators
    if (parseFloat(metrics.application.requests.errorRate) > this.thresholds.errorRatePercent) {
      issues.push('High error rate');
    }

    if (metrics.system.memory.used > metrics.system.memory.total * 0.85) {
      issues.push('High memory usage');
    }

    if (metrics.system.cpu.usage > this.thresholds.cpuUsagePercent) {
      issues.push('High CPU usage');
    }

    if (this.alerts.filter(a => Date.now() - a.timestamp < 300000).length > 5) {
      issues.push('Multiple recent alerts');
    }

    return {
      status: issues.length === 0 ? 'healthy' : 'unhealthy',
      issues,
      lastCheck: new Date().toISOString(),
      uptime: metrics.system.uptime
    };
  }

  // Express middleware for request tracking
  middleware() {
    return (req, res, next) => {
      const start = performance.now();

      // Track user activity
      const userAddress = req.headers['x-user-address'] || req.body?.userAddress;
      if (userAddress) {
        this.metrics.users.active.add(userAddress.toLowerCase());
      }

      // Override res.end to capture metrics
      const originalEnd = res.end;
      res.end = (...args) => {
        const duration = performance.now() - start;
        const isError = res.statusCode >= 400;

        this.recordRequest(duration, isError);
        originalEnd.apply(res, args);
      };

      next();
    };
  }

  // Database middleware
  dbMiddleware(query, duration, error) {
    this.recordDbQuery(duration, !!error);
  }

  // Clean old data
  cleanOldData() {
    const oneHourAgo = Date.now() - 3600000;

    // Remove old alerts
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneHourAgo);

    // Reset active users set periodically
    if (this.metrics.users.active.size > 1000) {
      this.metrics.users.active.clear();
    }

    // Log cleanup
    console.log('🧹 Cleaned old monitoring data');
  }

  // Reset metrics
  resetMetrics() {
    this.metrics = {
      requests: { total: 0, errors: 0, totalResponseTime: 0 },
      memory: { peak: 0, average: 0 },
      cpu: { average: 0 },
      trades: { total: 0, volume: 0 },
      users: { active: new Set(), peak: 0 },
      database: { queries: 0, slowQueries: 0, errors: 0 }
    };
    this.alerts = [];
    this.startTime = Date.now();
  }

  // Stop monitoring
  stopMonitoring() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }

  // Get simple dashboard data
  getDashboard() {
    const metrics = this.getMetrics();
    return {
      status: this.getHealthStatus().status,
      uptime: Math.round(metrics.system.uptime / 60), // minutes
      requests: metrics.application.requests.total,
      errorRate: metrics.application.requests.errorRate,
      trades: metrics.application.trades.total,
      activeUsers: metrics.application.users.active,
      memoryUsage: `${metrics.system.memory.used}MB`,
      alerts: this.alerts.filter(a => Date.now() - a.timestamp < 3600000).length, // Last hour
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton
const lightweightMonitor = new LightweightMonitor();

module.exports = {
  LightweightMonitor,
  lightweightMonitor
};