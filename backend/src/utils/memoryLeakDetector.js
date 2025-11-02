// SAND Ultra-Fast Memory Monitor
class MemoryLeakDetector {
  constructor() {
    this.baseline = null;
    this.samples = new Array(20).fill(null);
    this.index = 0;
    this.alerts = [];
    this.monitoring = false;
    this.config = {
      checkInterval: 5000, // 5 seconds
      threshold: 30, // MB
      maxAlerts: 5
    };
    this.intervalId = null;
  }

  // Ultra-fast start
  startMonitoring(config = {}) {
    Object.assign(this.config, config);
    this.monitoring = true;
    this.baseline = process.memoryUsage().heapUsed;

    this.intervalId = setInterval(() => {
      this.fastCheck();
    }, this.config.checkInterval);

    console.log('[FastMemory] Started');
  }

  // Stop monitoring
  stopMonitoring() {
    this.monitoring = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('Memory leak detection stopped');
  }

  // Ultra-fast sampling
  fastCheck() {
    const heapUsed = process.memoryUsage().heapUsed;
    const sample = { t: Date.now(), h: heapUsed };

    this.samples[this.index] = sample;
    this.index = (this.index + 1) % this.samples.length;

    // Quick threshold check
    const growthMB = (heapUsed - this.baseline) / 1048576;
    if (growthMB > this.config.threshold) {
      this.quickAlert('HIGH', growthMB);
    }

    // Trend detection
    if (this.samples.filter(s => s).length >= 5) {
      this.quickTrend();
    }
  }

  // Lightning fast trend check
  quickTrend() {
    const valid = this.samples.filter(s => s).slice(-10);
    if (valid.length < 5) {
      return;
    }

    const first = valid[0];
    const last = valid[valid.length - 1];
    const growth = (last.h - first.h) / 1048576;
    const timeSpan = (last.t - first.t) / 1000;

    const rate = growth / timeSpan; // MB per second
    if (rate > 0.1) { // 0.1 MB/sec growth
      this.quickAlert('LEAK', `${rate.toFixed(2)}MB/s`);
    }
  }

  // Calculate memory usage trend
  calculateTrend() {
    if (this.snapshots.length < 5) {
      return { slope: 0, correlation: 0 };
    }

    const recent = this.snapshots.slice(-10);
    const n = recent.length;

    // Linear regression to detect trend
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    recent.forEach((snapshot, index) => {
      const x = index;
      const y = snapshot.heapUsed / 1024 / 1024; // MB

      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Calculate correlation coefficient
    const meanX = sumX / n;
    const meanY = sumY / n;

    let numerator = 0, denomX = 0, denomY = 0;

    recent.forEach((snapshot, index) => {
      const x = index - meanX;
      const y = (snapshot.heapUsed / 1024 / 1024) - meanY;

      numerator += x * y;
      denomX += x * x;
      denomY += y * y;
    });

    const correlation = numerator / Math.sqrt(denomX * denomY);

    return { slope, correlation };
  }

  // Instant alert
  quickAlert(type, value) {
    const alert = { type, value, time: Date.now() };
    this.alerts.push(alert);

    if (this.alerts.length > this.config.maxAlerts) {
      this.alerts.shift();
    }

    console.warn(`[FastMemory] ${type}: ${value}`);
    return alert;
  }

  // Get alert severity
  getSeverity(type, data) {
    switch (type) {
    case 'HEAP_GROWTH':
      return data.growth > 100 ? 'critical' : 'warning';
    case 'HIGH_MEMORY':
      return data.utilization > 90 ? 'critical' : 'warning';
    case 'MEMORY_TREND':
      return data.confidence > 0.8 ? 'warning' : 'info';
    default:
      return 'info';
    }
  }

  // Lightning fast status
  getStatus() {
    const mem = process.memoryUsage();
    const growth = (mem.heapUsed - this.baseline) / 1048576;

    return {
      heap: Math.round(mem.heapUsed / 1048576),
      baseline: Math.round(this.baseline / 1048576),
      growth: Math.round(growth),
      alerts: this.alerts.length,
      active: this.monitoring
    };
  }

  // Get memory statistics
  getStats() {
    if (this.snapshots.length === 0) {
      return null;
    }

    const heapValues = this.snapshots.map(s => s.heapUsed);
    const min = Math.min(...heapValues);
    const max = Math.max(...heapValues);
    const avg = heapValues.reduce((sum, val) => sum + val, 0) / heapValues.length;

    return {
      samples: this.snapshots.length,
      heapUsed: {
        min: Math.round(min / 1024 / 1024),
        max: Math.round(max / 1024 / 1024),
        avg: Math.round(avg / 1024 / 1024),
        current: Math.round(heapValues[heapValues.length - 1] / 1024 / 1024)
      },
      trend: this.calculateTrend(),
      alerts: this.alerts.map(alert => ({
        type: alert.type,
        severity: alert.severity,
        timestamp: new Date(alert.timestamp).toISOString()
      }))
    };
  }

  // Generate memory report
  generateReport() {
    const status = this.getStatus();
    const stats = this.getStats();
    const trend = this.calculateTrend();

    return {
      timestamp: new Date().toISOString(),
      status,
      statistics: stats,
      trend: {
        direction: trend.slope > 0.05 ? 'increasing' : trend.slope < -0.05 ? 'decreasing' : 'stable',
        slope: trend.slope,
        confidence: trend.correlation
      },
      recommendations: this.getRecommendations(status, stats, trend)
    };
  }

  // Get recommendations based on current state
  getRecommendations(status, stats, trend) {
    const recommendations = [];

    if (status.current.heapUtilization > 80) {
      recommendations.push('High heap utilization detected. Consider optimizing memory usage.');
    }

    if (trend.slope > 0.1 && trend.correlation > 0.7) {
      recommendations.push('Memory usage is consistently increasing. Check for memory leaks.');
    }

    if (this.alerts.length > 5) {
      recommendations.push('Multiple memory alerts detected. Review application code for inefficient patterns.');
    }

    if (status.current.external > 100) {
      recommendations.push('High external memory usage. Check for large buffers or file operations.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Memory usage appears normal.');
    }

    return recommendations;
  }

  // Quick GC
  gc() {
    if (!global.gc) {
      return 0;
    }
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const freed = before - process.memoryUsage().heapUsed;
    console.log(`[FastMemory] GC: -${Math.round(freed / 1024)}KB`);
    return freed;
  }

  // Reset monitoring data
  reset() {
    this.baseline = null;
    this.snapshots = [];
    this.alerts = [];
  }
}

module.exports = new MemoryLeakDetector();