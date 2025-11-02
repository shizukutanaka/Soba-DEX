/**
 * Real-time Metrics Collector
 *
 * Collects and aggregates system metrics for monitoring:
 * - Request/response times
 * - Error rates
 * - Resource usage (CPU, memory)
 * - Active connections
 * - Database performance
 * - Cache hit rates
 */

const os = require('os');
const v8 = require('v8');

class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
        byStatus: {},
        byEndpoint: {},
        responseTimes: []
      },
      system: {
        cpu: 0,
        memory: {
          used: 0,
          free: 0,
          total: 0,
          percentage: 0
        },
        uptime: 0
      },
      database: {
        queries: 0,
        errors: 0,
        avgQueryTime: 0,
        slowQueries: []
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      websockets: {
        connected: 0,
        messages: 0,
        errors: 0
      }
    };

    this.startTime = Date.now();
    this.intervals = [];

    // Start periodic collection
    this.startCollection();
  }

  /**
   * Record an HTTP request
   */
  recordRequest(req, res, responseTime) {
    this.metrics.requests.total++;

    const status = res.statusCode;
    const endpoint = `${req.method} ${req.path}`;

    // Count by status
    this.metrics.requests.byStatus[status] =
      (this.metrics.requests.byStatus[status] || 0) + 1;

    // Count by endpoint
    this.metrics.requests.byEndpoint[endpoint] =
      (this.metrics.requests.byEndpoint[endpoint] || 0) + 1;

    // Track success/error
    if (status >= 200 && status < 400) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.errors++;
    }

    // Record response time
    this.metrics.requests.responseTimes.push({
      endpoint,
      time: responseTime,
      timestamp: Date.now()
    });

    // Keep only last 1000 response times
    if (this.metrics.requests.responseTimes.length > 1000) {
      this.metrics.requests.responseTimes.shift();
    }
  }

  /**
   * Record a database query
   */
  recordQuery(queryTime, error = null) {
    this.metrics.database.queries++;

    if (error) {
      this.metrics.database.errors++;
    }

    // Update average query time
    const currentAvg = this.metrics.database.avgQueryTime;
    const totalQueries = this.metrics.database.queries;
    this.metrics.database.avgQueryTime =
      (currentAvg * (totalQueries - 1) + queryTime) / totalQueries;

    // Track slow queries (> 1000ms)
    if (queryTime > 1000) {
      this.metrics.database.slowQueries.push({
        time: queryTime,
        timestamp: Date.now()
      });

      // Keep only last 100 slow queries
      if (this.metrics.database.slowQueries.length > 100) {
        this.metrics.database.slowQueries.shift();
      }
    }
  }

  /**
   * Record cache access
   */
  recordCacheAccess(hit) {
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }

    // Calculate hit rate
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = total > 0
      ? (this.metrics.cache.hits / total * 100).toFixed(2)
      : 0;
  }

  /**
   * Record WebSocket activity
   */
  recordWebSocket(event, error = false) {
    switch (event) {
    case 'connection':
      this.metrics.websockets.connected++;
      break;
    case 'disconnect':
      this.metrics.websockets.connected = Math.max(0, this.metrics.websockets.connected - 1);
      break;
    case 'message':
      this.metrics.websockets.messages++;
      break;
    }

    if (error) {
      this.metrics.websockets.errors++;
    }
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    // CPU usage (average across all cores)
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    this.metrics.system.cpu = ((1 - totalIdle / totalTick) * 100).toFixed(2);

    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    this.metrics.system.memory = {
      used: (usedMem / 1024 / 1024 / 1024).toFixed(2), // GB
      free: (freeMem / 1024 / 1024 / 1024).toFixed(2), // GB
      total: (totalMem / 1024 / 1024 / 1024).toFixed(2), // GB
      percentage: ((usedMem / totalMem) * 100).toFixed(2)
    };

    // Process uptime
    this.metrics.system.uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // V8 heap statistics
    const heapStats = v8.getHeapStatistics();
    this.metrics.system.heap = {
      used: (heapStats.used_heap_size / 1024 / 1024).toFixed(2), // MB
      total: (heapStats.total_heap_size / 1024 / 1024).toFixed(2), // MB
      limit: (heapStats.heap_size_limit / 1024 / 1024).toFixed(2) // MB
    };
  }

  /**
   * Start periodic metric collection
   */
  startCollection() {
    // Collect system metrics every 5 seconds
    const systemInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000);

    this.intervals.push(systemInterval);

    // Initial collection
    this.collectSystemMetrics();
  }

  /**
   * Stop metric collection
   */
  stopCollection() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }

  /**
   * Get metrics summary
   */
  getSummary() {
    const responseTimes = this.metrics.requests.responseTimes.map(r => r.time);
    const avgResponseTime = responseTimes.length > 0
      ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2)
      : 0;

    const p95ResponseTime = this.calculatePercentile(responseTimes, 95);
    const p99ResponseTime = this.calculatePercentile(responseTimes, 99);

    const errorRate = this.metrics.requests.total > 0
      ? ((this.metrics.requests.errors / this.metrics.requests.total) * 100).toFixed(2)
      : 0;

    return {
      requests: {
        total: this.metrics.requests.total,
        success: this.metrics.requests.success,
        errors: this.metrics.requests.errors,
        errorRate: `${errorRate}%`,
        avgResponseTime: `${avgResponseTime}ms`,
        p95ResponseTime: `${p95ResponseTime}ms`,
        p99ResponseTime: `${p99ResponseTime}ms`
      },
      system: this.metrics.system,
      database: {
        queries: this.metrics.database.queries,
        errors: this.metrics.database.errors,
        avgQueryTime: `${this.metrics.database.avgQueryTime.toFixed(2)}ms`,
        slowQueries: this.metrics.database.slowQueries.length
      },
      cache: {
        hits: this.metrics.cache.hits,
        misses: this.metrics.cache.misses,
        hitRate: `${this.metrics.cache.hitRate}%`
      },
      websockets: this.metrics.websockets,
      uptime: `${Math.floor(this.metrics.system.uptime / 3600)}h ${Math.floor((this.metrics.system.uptime % 3600) / 60)}m`
    };
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;

    return sorted[index].toFixed(2);
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics.requests = {
      total: 0,
      success: 0,
      errors: 0,
      byStatus: {},
      byEndpoint: {},
      responseTimes: []
    };

    this.metrics.database = {
      queries: 0,
      errors: 0,
      avgQueryTime: 0,
      slowQueries: []
    };

    this.metrics.cache = {
      hits: 0,
      misses: 0,
      hitRate: 0
    };

    this.metrics.websockets = {
      connected: 0,
      messages: 0,
      errors: 0
    };

    this.startTime = Date.now();
  }

  /**
   * Export metrics for Prometheus
   */
  exportPrometheus() {
    const summary = this.getSummary();

    let output = '# HELP soba_dex_requests_total Total number of HTTP requests\n';
    output += '# TYPE soba_dex_requests_total counter\n';
    output += `soba_dex_requests_total ${this.metrics.requests.total}\n\n`;

    output += '# HELP soba_dex_requests_errors_total Total number of HTTP errors\n';
    output += '# TYPE soba_dex_requests_errors_total counter\n';
    output += `soba_dex_requests_errors_total ${this.metrics.requests.errors}\n\n`;

    output += '# HELP soba_dex_response_time_avg Average response time in ms\n';
    output += '# TYPE soba_dex_response_time_avg gauge\n';
    output += `soba_dex_response_time_avg ${parseFloat(summary.requests.avgResponseTime)}\n\n`;

    output += '# HELP soba_dex_cpu_usage CPU usage percentage\n';
    output += '# TYPE soba_dex_cpu_usage gauge\n';
    output += `soba_dex_cpu_usage ${this.metrics.system.cpu}\n\n`;

    output += '# HELP soba_dex_memory_usage Memory usage percentage\n';
    output += '# TYPE soba_dex_memory_usage gauge\n';
    output += `soba_dex_memory_usage ${this.metrics.system.memory.percentage}\n\n`;

    output += '# HELP soba_dex_cache_hit_rate Cache hit rate percentage\n';
    output += '# TYPE soba_dex_cache_hit_rate gauge\n';
    output += `soba_dex_cache_hit_rate ${this.metrics.cache.hitRate}\n\n`;

    output += '# HELP soba_dex_websocket_connections Active WebSocket connections\n';
    output += '# TYPE soba_dex_websocket_connections gauge\n';
    output += `soba_dex_websocket_connections ${this.metrics.websockets.connected}\n\n`;

    return output;
  }
}

// Singleton instance
const metricsCollector = new MetricsCollector();

// Express middleware to record requests
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();

  // Record response
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    metricsCollector.recordRequest(req, res, responseTime);
  });

  next();
}

module.exports = {
  metricsCollector,
  metricsMiddleware,
  MetricsCollector
};
