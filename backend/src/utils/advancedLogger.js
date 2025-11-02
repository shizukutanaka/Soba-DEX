/**
 * Advanced Logging System
 *
 * FEATURES:
 * - Structured logging
 * - Multiple transports (Console, File, HTTP)
 * - Log levels with filtering
 * - Request ID tracking
 * - Performance metrics
 * - Error stack traces
 * - Log rotation
 */

const winston = require('winston');
const path = require('path');
const { format } = winston;

// Custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Custom format for console output
const consoleFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.colorize({ all: true }),
  format.printf((info) => {
    const { timestamp, level, message, requestId, ...meta } = info;

    let log = `${timestamp} [${level}]`;

    if (requestId) {
      log += ` [${requestId}]`;
    }

    log += `: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// JSON format for file output
const fileFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

class AdvancedLogger {
  constructor(options = {}) {
    this.config = {
      level: options.level || process.env.LOG_LEVEL || 'info',
      logDir: options.logDir || path.join(__dirname, '../../logs'),
      maxFiles: options.maxFiles || '14d',
      maxSize: options.maxSize || '20m',
      enableConsole: options.enableConsole !== false,
      enableFile: options.enableFile !== false,
      enableHttp: options.enableHttp || false,
      httpUrl: options.httpUrl || process.env.LOG_HTTP_URL
    };

    this.transports = [];
    this.setupTransports();
    this.createLogger();

    // Performance tracking
    this.timers = new Map();
  }

  setupTransports() {
    // Console transport
    if (this.config.enableConsole) {
      this.transports.push(
        new winston.transports.Console({
          format: consoleFormat,
          level: this.config.level
        })
      );
    }

    // File transports
    if (this.config.enableFile) {
      // Error log
      this.transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'error.log'),
          level: 'error',
          format: fileFormat,
          maxsize: this.config.maxSize,
          maxFiles: this.config.maxFiles,
          tailable: true
        })
      );

      // Combined log
      this.transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'combined.log'),
          format: fileFormat,
          maxsize: this.config.maxSize,
          maxFiles: this.config.maxFiles,
          tailable: true
        })
      );

      // HTTP requests log
      this.transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'http.log'),
          level: 'http',
          format: fileFormat,
          maxsize: this.config.maxSize,
          maxFiles: this.config.maxFiles,
          tailable: true
        })
      );
    }

    // HTTP transport (for log aggregation services)
    if (this.config.enableHttp && this.config.httpUrl) {
      this.transports.push(
        new winston.transports.Http({
          host: this.config.httpUrl,
          format: fileFormat
        })
      );
    }
  }

  createLogger() {
    this.logger = winston.createLogger({
      levels,
      level: this.config.level,
      transports: this.transports,
      exitOnError: false
    });

    // Handle uncaught exceptions
    this.logger.exceptions.handle(
      new winston.transports.File({
        filename: path.join(this.config.logDir, 'exceptions.log'),
        format: fileFormat
      })
    );

    // Handle unhandled rejections
    this.logger.rejections.handle(
      new winston.transports.File({
        filename: path.join(this.config.logDir, 'rejections.log'),
        format: fileFormat
      })
    );
  }

  /**
   * Log methods
   */
  error(message, meta = {}) {
    this.logger.error(message, this.enrichMeta(meta));
  }

  warn(message, meta = {}) {
    this.logger.warn(message, this.enrichMeta(meta));
  }

  info(message, meta = {}) {
    this.logger.info(message, this.enrichMeta(meta));
  }

  http(message, meta = {}) {
    this.logger.http(message, this.enrichMeta(meta));
  }

  debug(message, meta = {}) {
    this.logger.debug(message, this.enrichMeta(meta));
  }

  /**
   * Enrich metadata with context
   */
  enrichMeta(meta) {
    return {
      ...meta,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      env: process.env.NODE_ENV
    };
  }

  /**
   * Performance timing
   */
  startTimer(label) {
    this.timers.set(label, Date.now());
  }

  endTimer(label, meta = {}) {
    const startTime = this.timers.get(label);
    if (!startTime) {
      this.warn(`Timer '${label}' was not started`);
      return;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(label);

    this.info(`Performance: ${label}`, {
      ...meta,
      duration: `${duration}ms`
    });

    return duration;
  }

  /**
   * Security event logging
   */
  security(event, meta = {}) {
    this.logger.warn(`SECURITY: ${event}`, {
      ...this.enrichMeta(meta),
      type: 'security_event'
    });
  }

  /**
   * Audit logging
   */
  audit(action, meta = {}) {
    this.logger.info(`AUDIT: ${action}`, {
      ...this.enrichMeta(meta),
      type: 'audit_event'
    });
  }

  /**
   * Request logging middleware
   */
  requestLogger() {
    return (req, res, next) => {
      const startTime = Date.now();

      // Generate request ID
      req.id = req.headers['x-request-id'] || this.generateRequestId();
      res.setHeader('X-Request-ID', req.id);

      // Log request
      this.http('Incoming request', {
        requestId: req.id,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Log response
      res.on('finish', () => {
        const duration = Date.now() - startTime;

        this.http('Request completed', {
          requestId: req.id,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`
        });
      });

      next();
    };
  }

  /**
   * Error logging middleware
   */
  errorLogger() {
    return (err, req, res, next) => {
      this.error('Request error', {
        requestId: req.id,
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        statusCode: err.statusCode || 500
      });

      next(err);
    };
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Query result metadata
   */
  query(query, meta = {}) {
    this.debug('Database query', {
      ...meta,
      query: query.substring(0, 100) // Truncate long queries
    });
  }

  /**
   * Shutdown logger
   */
  shutdown() {
    return new Promise((resolve) => {
      this.logger.end(() => {
        console.log('Logger shutdown complete');
        resolve();
      });
    });
  }
}

// Create singleton instance
const advancedLogger = new AdvancedLogger();

module.exports = {
  AdvancedLogger,
  logger: advancedLogger
};
