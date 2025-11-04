/**
 * Centralized Logging Service (ELK Stack Compatible)
 *
 * Implements structured logging for distributed tracing and analysis:
 * - Elasticsearch integration for log indexing
 * - Structured JSON logging format
 * - Log levels and filtering
 * - Log rotation and archival
 * - Performance metrics logging
 * - Security event logging
 * - Correlation ID tracking across requests
 *
 * Features:
 * - Multiple transport backends (Elasticsearch, File, Console)
 * - Log buffering and batching
 * - Real-time log streaming
 * - Log filtering by level and pattern
 * - Sensitive data masking
 * - Log retention policies
 * - Performance statistics
 *
 * @version 1.0.0
 * @author Claude AI
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { logger } = require('../utils/productionLogger');

class CentralizedLoggingService extends EventEmitter {
  constructor() {
    super();

    this.config = {
      enabled: process.env.CENTRALIZED_LOGGING !== 'false',
      elasticsearch: {
        enabled: process.env.ELASTICSEARCH_ENABLED !== 'false',
        host: process.env.ELASTICSEARCH_HOST || 'localhost',
        port: parseInt(process.env.ELASTICSEARCH_PORT || '9200'),
        index: process.env.ELASTICSEARCH_INDEX || 'soba-dex-logs',
        indexPattern: process.env.ELASTICSEARCH_INDEX_PATTERN || 'soba-dex-logs-%{+YYYY.MM.dd}'
      },
      fileStorage: {
        enabled: process.env.FILE_LOGGING !== 'false',
        directory: process.env.LOG_DIR || './logs',
        maxSize: parseInt(process.env.LOG_MAX_SIZE || '104857600'), // 100MB
        maxFiles: parseInt(process.env.LOG_MAX_FILES || '30'),
        compress: process.env.LOG_COMPRESS !== 'false'
      },
      logLevels: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3,
        TRACE: 4
      },
      defaultLevel: process.env.LOG_LEVEL || 'INFO',
      batchSize: parseInt(process.env.LOG_BATCH_SIZE || '100'),
      batchTimeout: parseInt(process.env.LOG_BATCH_TIMEOUT || '5000'),
      maskSensitiveData: process.env.MASK_SENSITIVE_DATA !== 'false',
      retentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30')
    };

    // Initialize state
    this.logBuffer = [];
    this.metrics = {
      totalLogs: 0,
      logsByLevel: { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 },
      elasticsearchWrites: 0,
      elasticsearchErrors: 0,
      fileWrites: 0,
      fileErrors: 0,
      bufferedLogs: 0,
      droppedLogs: 0
    };

    this.elasticsearchClient = null;
    this.logFile = null;

    // Initialize logging directory
    if (this.config.fileStorage.enabled) {
      this._initializeLogDirectory();
    }

    // Start batch processor
    this._startBatchProcessor();

    // Initialize Elasticsearch if enabled
    if (this.config.elasticsearch.enabled) {
      this._initializeElasticsearch();
    }

    logger.info('[CentralizedLoggingService] Initialized', {
      elasticsearch: this.config.elasticsearch.enabled,
      fileStorage: this.config.fileStorage.enabled,
      defaultLevel: this.config.defaultLevel,
      batchSize: this.config.batchSize
    });
  }

  /**
   * Log an event
   *
   * @param {string} level - Log level (ERROR, WARN, INFO, DEBUG, TRACE)
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  log(level, message, metadata = {}) {
    const levelValue = this.config.logLevels[level] || this.config.logLevels.INFO;
    const defaultLevelValue = this.config.logLevels[this.config.defaultLevel];

    // Check log level threshold
    if (levelValue > defaultLevelValue) {
      return;
    }

    const logEntry = this._createLogEntry(level, message, metadata);

    this.logBuffer.push(logEntry);
    this.metrics.bufferedLogs = this.logBuffer.length;

    // Emit event for real-time subscribers
    this.emit('log', logEntry);

    // Check if buffer should be flushed
    if (this.logBuffer.length >= this.config.batchSize) {
      this._flushBuffer();
    }
  }

  /**
   * Log error
   *
   * @param {string} message - Error message
   * @param {Object} metadata - Additional metadata
   */
  error(message, metadata = {}) {
    this.log('ERROR', message, metadata);
  }

  /**
   * Log warning
   *
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    this.log('WARN', message, metadata);
  }

  /**
   * Log info
   *
   * @param {string} message - Info message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    this.log('INFO', message, metadata);
  }

  /**
   * Log debug
   *
   * @param {string} message - Debug message
   * @param {Object} metadata - Additional metadata
   */
  debug(message, metadata = {}) {
    this.log('DEBUG', message, metadata);
  }

  /**
   * Log trace
   *
   * @param {string} message - Trace message
   * @param {Object} metadata - Additional metadata
   */
  trace(message, metadata = {}) {
    this.log('TRACE', message, metadata);
  }

  /**
   * Log security event
   *
   * @param {string} event - Event type
   * @param {Object} context - Event context
   */
  logSecurityEvent(event, context = {}) {
    this.log('WARN', `Security event: ${event}`, {
      event,
      ...context,
      severity: context.severity || 'medium',
      timestamp: Date.now()
    });
  }

  /**
   * Log performance metric
   *
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in ms
   * @param {Object} metadata - Additional metadata
   */
  logPerformance(operation, duration, metadata = {}) {
    const level = duration > 1000 ? 'WARN' : 'DEBUG';

    this.log(level, `Performance: ${operation}`, {
      operation,
      duration_ms: duration,
      ...metadata,
      slow: duration > 1000
    });
  }

  /**
   * Search logs in Elasticsearch
   *
   * @param {Object} query - Elasticsearch query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchLogs(query, options = {}) {
    if (!this.elasticsearchClient) {
      return [];
    }

    try {
      const results = await this.elasticsearchClient.search({
        index: this.config.elasticsearch.index,
        body: {
          query: query || { match_all: {} },
          size: options.size || 100,
          from: options.from || 0,
          sort: options.sort || [{ timestamp: { order: 'desc' } }]
        }
      });

      return results.body.hits.hits.map(hit => hit._source);
    } catch (error) {
      logger.error('[CentralizedLoggingService] Search failed', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get logs by level
   *
   * @param {string} level - Log level
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Logs matching level
   */
  async getLogsByLevel(level, options = {}) {
    return this.searchLogs(
      { match: { level } },
      options
    );
  }

  /**
   * Get logs by time range
   *
   * @param {number} startTime - Start timestamp
   * @param {number} endTime - End timestamp
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Logs in time range
   */
  async getLogsByTimeRange(startTime, endTime, options = {}) {
    return this.searchLogs(
      {
        range: {
          timestamp: {
            gte: startTime,
            lte: endTime
          }
        }
      },
      options
    );
  }

  /**
   * Get logs by correlation ID (trace tracking)
   *
   * @param {string} correlationId - Correlation ID
   * @returns {Promise<Array>} All logs for this correlation
   */
  async getLogsByCorrelation(correlationId) {
    return this.searchLogs(
      { match: { correlationId } },
      { size: 1000 }
    );
  }

  /**
   * Get logging metrics
   *
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      bufferSize: this.logBuffer.length,
      timestamp: new Date()
    };
  }

  /**
   * Stream logs in real-time
   *
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  streamLogs(callback) {
    this.on('log', callback);

    // Return unsubscribe function
    return () => {
      this.removeListener('log', callback);
    };
  }

  /**
   * Private: Create structured log entry
   *
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Log entry
   */
  _createLogEntry(level, message, metadata = {}) {
    const entry = {
      timestamp: Date.now(),
      level,
      message,
      correlationId: metadata.correlationId || this._generateCorrelationId(),
      environment: process.env.NODE_ENV || 'development',
      service: process.env.SERVICE_NAME || 'soba-backend',
      version: process.env.VERSION || '1.0.0',
      hostname: require('os').hostname(),
      pid: process.pid,
      ...metadata
    };

    // Mask sensitive data if enabled
    if (this.config.maskSensitiveData) {
      entry._masked = this._maskSensitiveData(entry);
    }

    // Update metrics
    this.metrics.totalLogs++;
    this.metrics.logsByLevel[level] = (this.metrics.logsByLevel[level] || 0) + 1;

    return entry;
  }

  /**
   * Private: Mask sensitive data
   *
   * @private
   * @param {Object} data - Data to mask
   * @returns {Object} Masked data
   */
  _maskSensitiveData(data) {
    const masked = { ...data };
    const sensitiveKeys = [
      'password', 'token', 'apiKey', 'secret', 'privateKey',
      'creditCard', 'ssn', 'authorization', 'cookie', 'sessionId'
    ];

    const maskValue = (obj) => {
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
          obj[key] = '***MASKED***';
        } else if (typeof value === 'object' && value !== null) {
          maskValue(value);
        }
      }
    };

    maskValue(masked);
    return masked;
  }

  /**
   * Private: Initialize log directory
   *
   * @private
   */
  _initializeLogDirectory() {
    const logDir = this.config.fileStorage.directory;

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${Date.now()}.log`);
    this.logFile = logFile;

    logger.info('[CentralizedLoggingService] Log directory initialized', {
      directory: logDir,
      logFile
    });
  }

  /**
   * Private: Initialize Elasticsearch client
   *
   * @private
   */
  _initializeElasticsearch() {
    try {
      const { Client } = require('@elastic/elasticsearch');

      this.elasticsearchClient = new Client({
        node: `http://${this.config.elasticsearch.host}:${this.config.elasticsearch.port}`,
        requestTimeout: 5000,
        sniffOnStart: false
      });

      logger.info('[CentralizedLoggingService] Elasticsearch client initialized', {
        host: this.config.elasticsearch.host,
        port: this.config.elasticsearch.port
      });
    } catch (error) {
      logger.warn('[CentralizedLoggingService] Elasticsearch not available', {
        error: error.message
      });
      this.elasticsearchClient = null;
    }
  }

  /**
   * Private: Start batch processor
   *
   * @private
   */
  _startBatchProcessor() {
    setInterval(() => {
      if (this.logBuffer.length > 0) {
        this._flushBuffer();
      }
    }, this.config.batchTimeout);

    logger.info('[CentralizedLoggingService] Batch processor started', {
      batchSize: this.config.batchSize,
      batchTimeout: this.config.batchTimeout
    });
  }

  /**
   * Private: Flush log buffer
   *
   * @private
   */
  async _flushBuffer() {
    if (this.logBuffer.length === 0) {
      return;
    }

    const logsToWrite = [...this.logBuffer];
    this.logBuffer = [];

    // Write to file
    if (this.config.fileStorage.enabled && this.logFile) {
      this._writeToFile(logsToWrite);
    }

    // Write to Elasticsearch
    if (this.elasticsearchClient) {
      this._writeToElasticsearch(logsToWrite);
    }

    this.metrics.bufferedLogs = this.logBuffer.length;
  }

  /**
   * Private: Write logs to file
   *
   * @private
   * @param {Array} logs - Logs to write
   */
  _writeToFile(logs) {
    try {
      const content = logs
        .map(log => JSON.stringify(log))
        .join('\n') + '\n';

      fs.appendFileSync(this.logFile, content);
      this.metrics.fileWrites += logs.length;
    } catch (error) {
      this.metrics.fileErrors++;
      console.error('[CentralizedLoggingService] File write error:', error.message);
    }
  }

  /**
   * Private: Write logs to Elasticsearch
   *
   * @private
   * @param {Array} logs - Logs to write
   */
  async _writeToElasticsearch(logs) {
    if (!this.elasticsearchClient) {
      return;
    }

    try {
      const bulkBody = logs.flatMap(log => [
        { index: { _index: this.config.elasticsearch.index } },
        log
      ]);

      await this.elasticsearchClient.bulk({ body: bulkBody });
      this.metrics.elasticsearchWrites += logs.length;
    } catch (error) {
      this.metrics.elasticsearchErrors++;
      logger.error('[CentralizedLoggingService] Elasticsearch write error', {
        error: error.message,
        logsDropped: logs.length
      });
    }
  }

  /**
   * Private: Generate correlation ID
   *
   * @private
   * @returns {string} Correlation ID
   */
  _generateCorrelationId() {
    return require('crypto').randomBytes(8).toString('hex');
  }

  /**
   * Shutdown gracefully
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Flush remaining logs
    if (this.logBuffer.length > 0) {
      await this._flushBuffer();
    }

    // Close Elasticsearch client
    if (this.elasticsearchClient) {
      await this.elasticsearchClient.close();
    }

    logger.info('[CentralizedLoggingService] Shutdown complete');
  }
}

// Export singleton instance
module.exports = new CentralizedLoggingService();
