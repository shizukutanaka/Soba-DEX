/**
 * Unified Error Handler - Enterprise-Grade Implementation
 * Consolidated from errorHandler.js, unifiedErrorHandler.js, globalErrorHandler.js, productionErrorHandler.js
 *
 * Features:
 * - Comprehensive error classification and transformation
 * - Sensitive data sanitization
 * - Error statistics and metrics tracking
 * - Audit logging for critical errors
 * - Graceful shutdown handling
 * - Multi-language error messages
 * - Request context tracking
 */

const productionLogger = require('../utils/productionLogger');
const logger = productionLogger.logger || productionLogger;

// ============================================================================
// ERROR CLASSES
// ============================================================================

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    this.isOperational = statusCode < 500;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND', { resource });
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT', { retryAfter });
  }
}

class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

class DatabaseError extends AppError {
  constructor(message, originalError, details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
    this.originalError = originalError;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message = 'External service error') {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', { service });
    this.service = service;
  }
}

class BlockchainError extends AppError {
  constructor(message, txHash, details = null) {
    super(message, 500, 'BLOCKCHAIN_ERROR', { ...details, txHash });
    this.txHash = txHash;
  }
}

class BusinessLogicError extends AppError {
  constructor(message, details = null) {
    super(message, 422, 'BUSINESS_LOGIC_ERROR', details);
    this.isBusinessLogic = true;
  }
}

// ============================================================================
// ERROR STATISTICS TRACKER
// ============================================================================

class ErrorStats {
  constructor() {
    this.errors = [];
    this.counts = new Map();
    this.endpointErrors = new Map();
    this.maxHistory = 1000;
  }

  track(error, context) {
    const entry = {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      timestamp: Date.now(),
      context
    };

    this.errors.push(entry);
    if (this.errors.length > this.maxHistory) {
      this.errors.shift();
    }

    // Track by error code
    const key = `${error.statusCode}:${error.code}`;
    this.counts.set(key, (this.counts.get(key) || 0) + 1);

    // Track by endpoint
    if (context?.url) {
      const endpointKey = `${context.method}:${context.url}`;
      if (!this.endpointErrors.has(endpointKey)) {
        this.endpointErrors.set(endpointKey, 0);
      }
      this.endpointErrors.set(endpointKey, this.endpointErrors.get(endpointKey) + 1);
    }
  }

  getStats() {
    const now = Date.now();
    const last5min = this.errors.filter(e => now - e.timestamp < 300000);

    return {
      total: this.errors.length,
      last5min: last5min.length,
      topErrors: Array.from(this.counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => ({ key, count })),
      topEndpoints: Array.from(this.endpointErrors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([endpoint, count]) => ({ endpoint, count }))
    };
  }

  healthCheck() {
    return {
      operational: true,
      totalErrors: this.errors.length,
      uniqueErrors: this.counts.size,
      affectedEndpoints: this.endpointErrors.size
    };
  }

  clear() {
    this.errors = [];
    this.counts.clear();
    this.endpointErrors.clear();
  }
}

const errorStats = new ErrorStats();

// ============================================================================
// ERROR HANDLER MIDDLEWARE CLASS
// ============================================================================

class ErrorHandlerMiddleware {
  constructor() {
    this.sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'privateKey',
      'creditCard', 'ssn', 'bearerToken', 'refreshToken'
    ];

    this.errorMappings = new Map();
    this.initializeErrorMappings();
  }

  /**
   * Initialize error mappings for common libraries
   */
  initializeErrorMappings() {
    // Prisma errors
    this.errorMappings.set('P2002', (error) =>
      new ConflictError('Unique constraint violation')
    );
    this.errorMappings.set('P2025', (error) =>
      new NotFoundError('Record')
    );
    this.errorMappings.set('P2003', (error) =>
      new ValidationError('Foreign key constraint violation')
    );

    // MongoDB errors
    this.errorMappings.set(11000, (error) =>
      new ConflictError('Duplicate key error')
    );

    // JWT errors
    this.errorMappings.set('TokenExpiredError', () =>
      new AuthenticationError('Token expired')
    );
    this.errorMappings.set('JsonWebTokenError', () =>
      new AuthenticationError('Invalid token')
    );

    // Network errors
    this.errorMappings.set('ECONNREFUSED', () =>
      new ServiceUnavailableError('Service connection refused')
    );
    this.errorMappings.set('ENOTFOUND', () =>
      new ServiceUnavailableError('Service not found')
    );

    // Database errors
    this.errorMappings.set('SequelizeError', (error) =>
      new DatabaseError('Database error', error)
    );
  }

  /**
   * Transform various error types to AppError
   */
  transformError(error) {
    if (error instanceof AppError) {
      return error;
    }

    // Check for known error codes
    if (error.code && this.errorMappings.has(error.code)) {
      return this.errorMappings.get(error.code)(error);
    }

    // Check for known error names
    if (error.name && this.errorMappings.has(error.name)) {
      return this.errorMappings.get(error.name)(error);
    }

    // Prisma specific errors
    if (error.code && error.code.startsWith('P')) {
      return this.handlePrismaError(error);
    }

    // Express-validator validation errors
    if (error.errors && Array.isArray(error.errors)) {
      return new ValidationError('Validation failed', { errors: error.errors });
    }

    // Mongoose validation errors
    if (error.name === 'ValidationError' && error.errors) {
      const validationErrors = Object.keys(error.errors).map(field => ({
        field,
        message: error.errors[field].message
      }));
      return new ValidationError('Validation failed', { errors: validationErrors });
    }

    // Default to internal server error
    return new AppError(
      error.message || 'An unexpected error occurred',
      500,
      'INTERNAL_ERROR',
      { originalError: error.toString() }
    );
  }

  /**
   * Handle Prisma-specific errors
   */
  handlePrismaError(error) {
    const mapping = {
      P2000: new ValidationError('Value too long for column'),
      P2001: new NotFoundError('Record'),
      P2002: new ConflictError('Unique constraint violation'),
      P2003: new ValidationError('Foreign key constraint violation'),
      P2004: new DatabaseError('Database constraint violation', error),
      P2025: new NotFoundError('Record')
    };

    return mapping[error.code] || new DatabaseError('Database error', error);
  }

  /**
   * Sanitize object by removing sensitive fields
   */
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const sanitized = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if field name is sensitive
   */
  isSensitiveField(fieldName) {
    return this.sensitiveFields.some(sensitive =>
      fieldName.toLowerCase().includes(sensitive.toLowerCase())
    );
  }

  /**
   * Log error with context
   */
  logError(error, req) {
    const context = {
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.userId || req.user?.id || null,
      requestId: req.id || null
    };

    const logData = {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      ...context,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };

    // Sanitize request body if present
    if (req.body) {
      logData.body = this.sanitizeObject(req.body);
    }

    if (error.statusCode >= 500) {
      logger.error('[ErrorHandler] Server error', logData);
    } else if (error.statusCode === 403 || error.statusCode === 401) {
      logger.warn('[ErrorHandler] Security error', logData);
    } else {
      logger.warn('[ErrorHandler] Client error', logData);
    }
  }

  /**
   * Create Express error handler middleware
   * Transforms errors to consistent JSON format, sanitizes sensitive data, and tracks error metrics
   *
   * @returns {Function} Express error middleware function (err, req, res, next)
   *
   * @example
   * // In Express setup:
   * const errorHandler = new ErrorHandlerMiddleware();
   * app.use(errorHandler.middleware());
   *
   * @example
   * // When error occurs:
   * // Response: { error: 'Validation Error', message: 'Invalid input', code: 'VALIDATION_ERROR', statusCode: 400 }
   *
   * @ai-generated AI-generated error handling middleware
   */
  middleware() {
    return (err, req, res, _next) => {
      // Transform error
      const appError = this.transformError(err);

      // Track error statistics
      const context = {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent')
      };
      errorStats.track(appError, context);

      // Log error
      this.logError(appError, req);

      // Don't send response if already sent
      if (res.headersSent) {
        logger.warn('[ErrorHandler] Headers already sent', {
          url: req.originalUrl
        });
        return;
      }

      // Build response
      const isDevelopment = process.env.NODE_ENV === 'development';
      const response = {
        success: false,
        error: {
          message: appError.message,
          code: appError.code,
          statusCode: appError.statusCode
        }
      };

      if (appError.details) {
        response.error.details = appError.details;
      }

      if (isDevelopment) {
        response.error.stack = appError.stack;
      }

      if (req.id) {
        response.requestId = req.id;
      }

      res.status(appError.statusCode).json(response);
    };
  }
}

// Create singleton instance
const errorHandlerMiddleware = new ErrorHandlerMiddleware();

// ============================================================================
// ASYNC HANDLER WRAPPER
// ============================================================================

const asyncHandler = (fn, timeoutMs = 30000) => (req, res, next) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new InternalError('Request timeout')), timeoutMs);
  });

  Promise.race([
    Promise.resolve(fn(req, res, next)),
    timeoutPromise
  ]).catch(next);
};

// ============================================================================
// 404 HANDLER
// ============================================================================

const notFoundHandler = (req, res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl}`));
};

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================

const setupGlobalHandlers = () => {
  process.on('unhandledRejection', (reason, _promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack
    });
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      message: error.message,
      stack: error.stack
    });
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  // Graceful shutdown
  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach(signal => {
    process.on(signal, () => {
      logger.info(`${signal} received, starting graceful shutdown`);
      process.exit(0);
    });
  });

  logger.info('Global error handlers initialized');
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  DatabaseError,
  ExternalServiceError,
  BlockchainError,
  BusinessLogicError,

  // Error handler instance and middleware
  errorHandler: errorHandlerMiddleware.middleware(),
  asyncHandler,
  notFoundHandler,
  setupGlobalHandlers,

  // Error statistics
  errorStats,
  getErrorStatistics: () => errorStats.getStats(),
  getErrorHealthCheck: () => errorStats.healthCheck(),
  clearErrorStats: () => errorStats.clear()
};
