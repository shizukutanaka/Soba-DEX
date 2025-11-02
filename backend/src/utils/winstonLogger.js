/**
 * Winston Logger with Daily Rotation
 * Version: 2.6.1 - Practical improvements
 *
 * Features:
 * - Daily log rotation
 * - Automatic compression
 * - Configurable retention
 * - Separate error logs
 * - JSON and console formats
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Ensure log directory exists
const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Sensitive keys to redact
const SENSITIVE_KEYS = new Set([
  'authorization',
  'x-authorization',
  'x-api-key',
  'api-key',
  'api_key',
  'password',
  'passphrase',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'jwt',
  'session',
  'csrf',
  'set-cookie',
  'cookie',
  'apiKey',
  'apiSecret',
  'clientSecret',
  'privateKey',
  'mnemonic',
]);

/**
 * Sanitize sensitive data
 */
function sanitizeData(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (value.length > 2048) {
      return `${value.slice(0, 2048)}…`;
    }
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  const result = Array.isArray(value) ? [] : {};
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);

  for (const [key, val] of entries) {
    if (typeof key === 'string' && SENSITIVE_KEYS.has(key.toLowerCase())) {
      if (Array.isArray(value)) {
        result.push('[REDACTED]');
      } else {
        result[key] = '[REDACTED]';
      }
    } else {
      const sanitized = sanitizeData(val, seen);
      if (Array.isArray(value)) {
        result.push(sanitized);
      } else {
        result[key] = sanitized;
      }
    }
  }

  return result;
}

/**
 * Custom format for console output
 */
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  let metaStr = '';
  if (Object.keys(meta).length > 0) {
    metaStr = ` ${JSON.stringify(sanitizeData(meta))}`;
  }
  return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
});

/**
 * Custom format for JSON logs
 */
const jsonFormat = winston.format.printf((info) => {
  return JSON.stringify({
    timestamp: info.timestamp,
    level: info.level,
    message: info.message,
    ...sanitizeData(info.metadata || {}),
    pid: process.pid,
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * Create daily rotate transport
 */
function createDailyRotateTransport(level, filename) {
  return new DailyRotateFile({
    level,
    filename: path.join(logDir, filename),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true, // Compress rotated files
    maxSize: '20m', // Rotate when file reaches 20MB
    maxFiles: isProduction ? '30d' : '7d', // Keep 30 days in production, 7 in dev
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
      jsonFormat
    ),
  });
}

/**
 * Create Winston logger
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
  ),
  transports: [
    // Combined logs (all levels)
    createDailyRotateTransport('debug', 'combined-%DATE%.log'),

    // Error logs (errors only)
    createDailyRotateTransport('error', 'error-%DATE%.log'),

    // Console output
    new winston.transports.Console({
      level: isDevelopment ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    }),
  ],
  // Don't exit on uncaught exceptions
  exitOnError: false,
});

/**
 * Log HTTP request
 */
logger.logRequest = function (req, res, duration) {
  const durationMs = Number(res.locals?.requestDurationMs ?? duration) || 0;
  const logData = {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    durationMs: Math.round(durationMs),
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.id,
  };

  if (req.user) {
    logData.userId = req.user.id;
  }

  if (res.statusCode >= 500) {
    logger.error('HTTP 5xx', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('HTTP 4xx', logData);
  } else if (durationMs > 5000) {
    logger.warn('Slow request', logData);
  } else {
    logger.info('Request', logData);
  }
};

/**
 * Log error with context
 */
logger.logError = function (error, req = null, context = {}) {
  const errorData = {
    message: error.message,
    name: error.name,
    code: error.code,
    stack: isDevelopment ? error.stack : error.stack?.split('\n').slice(0, 3).join('\n'),
    ...context,
  };

  if (req) {
    errorData.method = req.method;
    errorData.path = req.path;
    errorData.ip = req.ip;
    errorData.requestId = req.id;
  }

  logger.error('Error occurred', errorData);
};

// Handle rotation events
logger.transports.forEach((transport) => {
  if (transport instanceof DailyRotateFile) {
    transport.on('rotate', (oldFilename, newFilename) => {
      logger.debug('Log file rotated', { oldFilename, newFilename });
    });

    transport.on('archive', (zipFilename) => {
      logger.debug('Log file archived', { zipFilename });
    });

    transport.on('logRemoved', (removedFilename) => {
      logger.debug('Old log file removed', { removedFilename });
    });
  }
});

module.exports = { logger };
