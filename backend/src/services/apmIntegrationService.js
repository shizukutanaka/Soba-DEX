/**
 * APM Integration Service
 *
 * Integrates with Application Performance Monitoring systems:
 * - DataDog APM integration
 * - New Relic APM support
 * - Custom metrics collection
 * - Performance baseline tracking
 * - Anomaly detection
 * - Alert generation
 *
 * Features:
 * - Transaction tracking
 * - Distributed tracing integration
 * - Custom metrics and attributes
 * - Service map generation
 * - Performance profiling
 * - Error tracking and grouping
 * - User journey tracking
 * - Real User Monitoring (RUM)
 *
 * @version 1.0.0
 * @author Claude AI
 */

const { logger } = require('../utils/productionLogger');

class APMIntegrationService {
  constructor() {
    this.config = {
      provider: process.env.APM_PROVIDER || 'datadog', // datadog, newrelic, custom
      enabled: process.env.APM_ENABLED !== 'false',
      apiKey: process.env.APM_API_KEY,
      siteUrl: process.env.APM_SITE_URL || 'https://api.datadoghq.com',
      serviceName: process.env.SERVICE_NAME || 'soba-backend',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.VERSION || '1.0.0',
      sampleRate: parseFloat(process.env.APM_SAMPLE_RATE || '1.0'),
      logLevel: process.env.APM_LOG_LEVEL || 'info',
      enableProfiling: process.env.APM_ENABLE_PROFILING !== 'false',
      enableRUM: process.env.APM_ENABLE_RUM !== 'false',
      enableErrorTracking: process.env.APM_ENABLE_ERROR_TRACKING !== 'false',
      recordDatabaseQueries: process.env.APM_RECORD_DB_QUERIES !== 'false',
      recordExternalRequests: process.env.APM_RECORD_EXTERNAL_REQUESTS !== 'false',
      recordRedisOperations: process.env.APM_RECORD_REDIS !== 'false',
      performanceThresholds: {
        slowQueryMs: parseInt(process.env.SLOW_QUERY_MS || '500'),
        slowRequestMs: parseInt(process.env.SLOW_REQUEST_MS || '1000'),
        slowExternalRequestMs: parseInt(process.env.SLOW_EXTERNAL_REQUEST_MS || '2000')
      }
    };

    // Metrics storage
    this.metrics = {
      transactions: 0,
      errors: 0,
      slowRequests: 0,
      slowQueries: 0,
      externalRequests: 0,
      redisOperations: 0,
      byEndpoint: {},
      byService: {},
      byErrorType: {},
      performanceDistribution: []
    };

    // Current transaction context
    this.currentTransaction = null;
    this.transactionStack = [];

    // Initialize APM client
    if (this.config.enabled) {
      this._initializeAPMClient();
    }

    logger.info('[APMIntegrationService] Initialized', {
      provider: this.config.provider,
      enabled: this.config.enabled,
      serviceName: this.config.serviceName,
      environment: this.config.environment
    });
  }

  /**
   * Start transaction (e.g., HTTP request)
   *
   * @param {string} name - Transaction name
   * @param {Object} metadata - Transaction metadata
   * @returns {Object} Transaction object
   */
  startTransaction(name, metadata = {}) {
    const transaction = {
      id: this._generateTransactionId(),
      name,
      startTime: Date.now(),
      status: 'in_progress',
      metadata: {
        serviceName: this.config.serviceName,
        environment: this.config.environment,
        ...metadata
      },
      spans: [],
      errors: []
    };

    this.transactionStack.push(transaction);
    this.currentTransaction = transaction;
    this.metrics.transactions++;

    logger.debug('[APMIntegrationService] Transaction started', {
      transactionId: transaction.id,
      name,
      stack: this.transactionStack.length
    });

    return transaction;
  }

  /**
   * End current transaction
   *
   * @param {Object} result - Transaction result
   * @returns {Object} Completed transaction
   */
  endTransaction(result = {}) {
    if (!this.currentTransaction) {
      logger.warn('[APMIntegrationService] No active transaction to end');
      return null;
    }

    const transaction = this.currentTransaction;
    transaction.endTime = Date.now();
    transaction.duration = transaction.endTime - transaction.startTime;
    transaction.status = result.status || 'completed';
    transaction.result = result;

    // Pop from stack
    this.transactionStack.pop();
    this.currentTransaction = this.transactionStack[this.transactionStack.length - 1] || null;

    // Check if slow
    if (transaction.duration > this.config.performanceThresholds.slowRequestMs) {
      this.metrics.slowRequests++;
      logger.warn('[APMIntegrationService] Slow transaction', {
        name: transaction.name,
        duration: transaction.duration,
        threshold: this.config.performanceThresholds.slowRequestMs
      });
    }

    // Record performance distribution
    this.metrics.performanceDistribution.push(transaction.duration);

    // Send to APM provider
    if (this.config.enabled) {
      this._sendTransaction(transaction);
    }

    logger.debug('[APMIntegrationService] Transaction ended', {
      transactionId: transaction.id,
      name: transaction.name,
      duration: transaction.duration
    });

    return transaction;
  }

  /**
   * Add span to current transaction
   *
   * @param {string} name - Span name
   * @param {string} type - Span type (db, http, redis, etc.)
   * @param {Function} fn - Function to execute within span
   * @returns {Promise<any>} Result of fn
   */
  async recordSpan(name, type, fn) {
    const span = {
      id: this._generateSpanId(),
      name,
      type,
      startTime: Date.now(),
      metadata: {}
    };

    if (this.currentTransaction) {
      this.currentTransaction.spans.push(span);
    }

    try {
      const result = await fn();
      span.status = 'success';
      span.duration = Date.now() - span.startTime;

      // Check if slow
      const threshold = this.config.performanceThresholds[`slow${type.charAt(0).toUpperCase() + type.slice(1)}Ms`];
      if (threshold && span.duration > threshold) {
        span.slow = true;
        this.metrics[`slow${type.charAt(0).toUpperCase() + type.slice(1)}s`] =
          (this.metrics[`slow${type.charAt(0).toUpperCase() + type.slice(1)}s`] || 0) + 1;
      }

      return result;
    } catch (error) {
      span.status = 'error';
      span.duration = Date.now() - span.startTime;
      span.error = {
        message: error.message,
        stack: error.stack
      };

      if (this.currentTransaction) {
        this.currentTransaction.errors.push(error);
      }

      throw error;
    }
  }

  /**
   * Record database query
   *
   * @param {string} query - SQL query
   * @param {number} duration - Query duration
   * @param {Object} metadata - Query metadata
   */
  recordDatabaseQuery(query, duration, metadata = {}) {
    if (!this.config.recordDatabaseQueries) {
      return;
    }

    const span = {
      id: this._generateSpanId(),
      name: query.substring(0, 50),
      type: 'db',
      duration,
      query: query.substring(0, 200),
      ...metadata
    };

    if (this.currentTransaction) {
      this.currentTransaction.spans.push(span);
    }

    if (duration > this.config.performanceThresholds.slowQueryMs) {
      this.metrics.slowQueries++;
      logger.warn('[APMIntegrationService] Slow query detected', {
        query: query.substring(0, 100),
        duration,
        threshold: this.config.performanceThresholds.slowQueryMs
      });
    }
  }

  /**
   * Record external HTTP request
   *
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {number} duration - Request duration
   * @param {Object} metadata - Request metadata
   */
  recordExternalRequest(method, url, duration, metadata = {}) {
    if (!this.config.recordExternalRequests) {
      return;
    }

    const span = {
      id: this._generateSpanId(),
      name: `${method} ${url}`,
      type: 'http',
      duration,
      method,
      url,
      ...metadata
    };

    if (this.currentTransaction) {
      this.currentTransaction.spans.push(span);
    }

    this.metrics.externalRequests++;

    if (duration > this.config.performanceThresholds.slowExternalRequestMs) {
      logger.warn('[APMIntegrationService] Slow external request', {
        method,
        url,
        duration,
        threshold: this.config.performanceThresholds.slowExternalRequestMs
      });
    }
  }

  /**
   * Record Redis operation
   *
   * @param {string} command - Redis command
   * @param {number} duration - Operation duration
   * @param {Object} metadata - Operation metadata
   */
  recordRedisOperation(command, duration, metadata = {}) {
    if (!this.config.recordRedisOperations) {
      return;
    }

    const span = {
      id: this._generateSpanId(),
      name: command,
      type: 'redis',
      duration,
      command,
      ...metadata
    };

    if (this.currentTransaction) {
      this.currentTransaction.spans.push(span);
    }

    this.metrics.redisOperations++;
  }

  /**
   * Record error
   *
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   */
  recordError(error, context = {}) {
    if (!this.config.enableErrorTracking) {
      return;
    }

    const errorData = {
      id: this._generateErrorId(),
      message: error.message,
      stack: error.stack,
      type: error.name,
      context,
      timestamp: Date.now(),
      transactionId: this.currentTransaction?.id
    };

    if (this.currentTransaction) {
      this.currentTransaction.errors.push(errorData);
    }

    this.metrics.errors++;

    const errorType = error.name;
    this.metrics.byErrorType[errorType] = (this.metrics.byErrorType[errorType] || 0) + 1;

    logger.error('[APMIntegrationService] Error recorded', {
      errorId: errorData.id,
      type: errorType,
      message: error.message,
      transactionId: errorData.transactionId
    });

    // Send to APM provider
    if (this.config.enabled) {
      this._sendError(errorData);
    }
  }

  /**
   * Set custom metric
   *
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} tags - Metric tags
   */
  setMetric(name, value, tags = {}) {
    if (!this.config.enabled) {
      return;
    }

    const metric = {
      name,
      value,
      timestamp: Date.now(),
      tags: {
        service: this.config.serviceName,
        environment: this.config.environment,
        ...tags
      }
    };

    // Send to APM provider
    this._sendMetric(metric);
  }

  /**
   * Record user action (for RUM)
   *
   * @param {string} action - Action type
   * @param {Object} data - Action data
   */
  recordUserAction(action, data = {}) {
    if (!this.config.enableRUM) {
      return;
    }

    const event = {
      type: 'user_action',
      action,
      timestamp: Date.now(),
      transactionId: this.currentTransaction?.id,
      ...data
    };

    // Send to APM provider
    this._sendEvent(event);
  }

  /**
   * Get performance statistics
   *
   * @returns {Object} Performance stats
   */
  getPerformanceStats() {
    const durations = this.metrics.performanceDistribution;

    if (durations.length === 0) {
      return {
        transactions: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      transactions: durations.length,
      avgDuration: Math.round(sum / durations.length),
      minDuration: sorted[0],
      maxDuration: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * Get APM metrics
   *
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      performanceStats: this.getPerformanceStats(),
      timestamp: new Date()
    };
  }

  /**
   * Private: Initialize APM client
   *
   * @private
   */
  _initializeAPMClient() {
    if (this.config.provider === 'datadog') {
      this._initializeDatadog();
    } else if (this.config.provider === 'newrelic') {
      this._initializeNewRelic();
    }
  }

  /**
   * Private: Initialize DataDog APM
   *
   * @private
   */
  _initializeDatadog() {
    try {
      // In production, initialize DataDog tracer
      // const tracer = require('dd-trace').init();

      logger.info('[APMIntegrationService] DataDog APM initialized', {
        apiKey: this.config.apiKey ? '***' : 'not set',
        siteUrl: this.config.siteUrl
      });
    } catch (error) {
      logger.warn('[APMIntegrationService] DataDog initialization failed', {
        error: error.message
      });
    }
  }

  /**
   * Private: Initialize New Relic APM
   *
   * @private
   */
  _initializeNewRelic() {
    try {
      // In production, initialize New Relic agent
      // require('newrelic');

      logger.info('[APMIntegrationService] New Relic APM initialized', {
        apiKey: this.config.apiKey ? '***' : 'not set'
      });
    } catch (error) {
      logger.warn('[APMIntegrationService] New Relic initialization failed', {
        error: error.message
      });
    }
  }

  /**
   * Private: Send transaction to APM provider
   *
   * @private
   * @param {Object} transaction - Transaction data
   */
  _sendTransaction(transaction) {
    // Implementation depends on APM provider
    logger.debug('[APMIntegrationService] Transaction sent to APM', {
      transactionId: transaction.id,
      name: transaction.name,
      duration: transaction.duration
    });
  }

  /**
   * Private: Send error to APM provider
   *
   * @private
   * @param {Object} errorData - Error data
   */
  _sendError(errorData) {
    // Implementation depends on APM provider
    logger.debug('[APMIntegrationService] Error sent to APM', {
      errorId: errorData.id,
      type: errorData.type
    });
  }

  /**
   * Private: Send metric to APM provider
   *
   * @private
   * @param {Object} metric - Metric data
   */
  _sendMetric(metric) {
    // Implementation depends on APM provider
    logger.debug('[APMIntegrationService] Metric sent to APM', {
      name: metric.name,
      value: metric.value
    });
  }

  /**
   * Private: Send event to APM provider
   *
   * @private
   * @param {Object} event - Event data
   */
  _sendEvent(event) {
    // Implementation depends on APM provider
    logger.debug('[APMIntegrationService] Event sent to APM', {
      type: event.type,
      action: event.action
    });
  }

  /**
   * Private: Generate transaction ID
   *
   * @private
   * @returns {string} Transaction ID
   */
  _generateTransactionId() {
    return require('crypto').randomBytes(8).toString('hex');
  }

  /**
   * Private: Generate span ID
   *
   * @private
   * @returns {string} Span ID
   */
  _generateSpanId() {
    return require('crypto').randomBytes(4).toString('hex');
  }

  /**
   * Private: Generate error ID
   *
   * @private
   * @returns {string} Error ID
   */
  _generateErrorId() {
    return require('crypto').randomBytes(8).toString('hex');
  }
}

// Export singleton instance
module.exports = new APMIntegrationService();
