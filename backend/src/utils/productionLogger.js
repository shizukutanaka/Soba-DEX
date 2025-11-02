const isDevelopment = process.env.NODE_ENV === 'development';
const fs = require('fs');
const path = require('path');

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
  'mnemonic'
]);

class ProductionLogger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
    this.logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;

    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const sanitizedData = data !== undefined ? this.sanitizeData(data) : undefined;
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(sanitizedData !== undefined ? { data: sanitizedData } : {}),
      pid: process.pid,
      ...(data && data.requestId ? { requestId: data.requestId } : {}),
      environment: process.env.NODE_ENV || 'development'
    };

    return JSON.stringify(logEntry);
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  writeToFile(level, formattedMessage) {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const logFile = path.join(this.logDir, `${level}.log`);

    try {
      fs.appendFileSync(logFile, formattedMessage + '\n');
      this.rotateIfNeeded(logFile);
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }

  rotateIfNeeded(logFile) {
    try {
      const stats = fs.statSync(logFile);
      if (stats.size > this.maxLogSize) {
        const timestamp = Date.now();
        const rotatedFile = `${logFile}.${timestamp}`;
        fs.renameSync(logFile, rotatedFile);

        this.cleanupOldLogs(path.dirname(logFile), path.basename(logFile));
      }
    } catch (_err) {
      // Ignore rotation errors
    }
  }

  cleanupOldLogs(dir, baseName) {
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith(baseName) && f !== baseName)
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(dir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > this.maxLogFiles) {
        files.slice(this.maxLogFiles).forEach(f => {
          fs.unlinkSync(path.join(dir, f.name));
        });
      }
    } catch (_err) {
      // Ignore cleanup errors
    }
  }

  log(level, message, data) {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, data);

    if (isDevelopment || level === 'error' || level === 'warn') {
      const consoleMethod = console[level] || console.log;
      consoleMethod(`[${level.toUpperCase()}]`, message, data || '');
    }

    if (!isDevelopment) {
      this.writeToFile(level, formattedMessage);
    }
  }

  logRequest(req, res, duration) {
    const durationMs = Number(res.locals?.requestDurationMs ?? duration) || 0;
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      requestId: req.id,
      cache: res.getHeader ? res.getHeader('X-Cache') : undefined,
      contentLength: res.getHeader ? res.getHeader('content-length') : undefined,
      startTimestamp: req.requestContext?.startTimestamp
        ? new Date(req.requestContext.startTimestamp).toISOString()
        : undefined
    };

    if (req.user) {
      logData.user = this.sanitizeData({
        id: req.user.id,
        username: req.user.username,
        email: req.user.email
      });
    }

    if (res.locals?.requestId && res.locals.requestId !== req.id) {
      logData.responseRequestId = res.locals.requestId;
    }

    if (req.headers['x-forwarded-for']) {
      logData.forwardedFor = req.headers['x-forwarded-for'];
    }

    if (req.get('referer')) {
      logData.referer = req.get('referer');
    }

    if (res.statusCode >= 500) {
      this.error('HTTP 5xx', logData);
    } else if (res.statusCode >= 400) {
      this.warn('HTTP 4xx', logData);
    } else if (duration > 5000) {
      this.warn('Slow request', logData);
    } else {
      this.info('Request', logData);
    }
  }

  logError(error, req = null, context = {}) {
    const errorData = {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: isDevelopment ? error.stack : undefined,
      ...context,
      ...(req && {
        method: req.method,
        path: req.path,
        ip: req.ip,
        requestId: req.id
      })
    };

    this.error('Error occurred', errorData);
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  info(message, data) {
    this.log('info', message, data);
  }

  warn(message, data) {
    this.log('warn', message, data);
  }

  error(message, error) {
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error;

    this.log('error', message, errorData);
  }

  request(req, res, duration) {
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      requestId: req.id
    };

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    this.log(level, `HTTP ${req.method} ${req.url}`, logData);
  }

  sanitizeData(value, seen = new WeakSet()) {
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
    const entries = Array.isArray(value)
      ? value.entries()
      : Object.entries(value);

    for (const [key, val] of entries) {
      if (typeof key === 'string' && SENSITIVE_KEYS.has(key.toLowerCase())) {
        if (Array.isArray(value)) {
          result.push('[REDACTED]');
        } else {
          result[key] = '[REDACTED]';
        }
      } else {
        const sanitized = this.sanitizeData(val, seen);
        if (Array.isArray(value)) {
          result.push(sanitized);
        } else {
          result[key] = sanitized;
        }
      }
    }

    return result;
  }
}

const logger = new ProductionLogger();

module.exports = {
  logger,
  ProductionLogger
};
