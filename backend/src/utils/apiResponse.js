/**
 * Standardized API Response Utility
 * Version: 2.6.1 - Practical improvements
 *
 * Provides consistent response format across all API endpoints:
 * {
 *   success: boolean,
 *   data: any,
 *   error: string (if failed),
 *   timestamp: number,
 *   requestId: string
 * }
 */

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendSuccess(res, data = null, statusCode = 200) {
  const response = {
    success: true,
    timestamp: Date.now(),
  };

  // Add requestId if available
  if (res.locals?.requestId) {
    response.requestId = res.locals.requestId;
  }

  // Add data if provided
  if (data !== null && data !== undefined) {
    response.data = data;
  }

  res.status(statusCode).json(response);
}

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {Object} details - Additional error details
 */
function sendError(res, message, statusCode = 400, details = null) {
  const response = {
    success: false,
    error: message,
    timestamp: Date.now(),
  };

  // Add requestId if available
  if (res.locals?.requestId) {
    response.requestId = res.locals.requestId;
  }

  // Add error details in development
  if (details && process.env.NODE_ENV === 'development') {
    response.details = details;
  }

  res.status(statusCode).json(response);
}

/**
 * Send paginated response
 * @param {Object} res - Express response object
 * @param {Array} items - Array of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 */
function sendPaginated(res, items, page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  sendSuccess(res, {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext,
      hasPrev,
    },
  });
}

/**
 * Send created response (201)
 * @param {Object} res - Express response object
 * @param {*} data - Created resource data
 */
function sendCreated(res, data) {
  sendSuccess(res, data, 201);
}

/**
 * Send no content response (204)
 * @param {Object} res - Express response object
 */
function sendNoContent(res) {
  res.status(204).end();
}

/**
 * Send not found response (404)
 * @param {Object} res - Express response object
 * @param {string} resource - Resource name that was not found
 */
function sendNotFound(res, resource = 'Resource') {
  sendError(res, `${resource} not found`, 404);
}

/**
 * Send unauthorized response (401)
 * @param {Object} res - Express response object
 * @param {string} message - Custom message
 */
function sendUnauthorized(res, message = 'Unauthorized') {
  sendError(res, message, 401);
}

/**
 * Send forbidden response (403)
 * @param {Object} res - Express response object
 * @param {string} message - Custom message
 */
function sendForbidden(res, message = 'Forbidden') {
  sendError(res, message, 403);
}

/**
 * Send conflict response (409)
 * @param {Object} res - Express response object
 * @param {string} message - Conflict message
 */
function sendConflict(res, message = 'Resource already exists') {
  sendError(res, message, 409);
}

/**
 * Send validation error response (422)
 * @param {Object} res - Express response object
 * @param {Array|Object} errors - Validation errors
 */
function sendValidationError(res, errors) {
  const response = {
    success: false,
    error: 'Validation failed',
    errors: Array.isArray(errors) ? errors : [errors],
    timestamp: Date.now(),
  };

  if (res.locals?.requestId) {
    response.requestId = res.locals.requestId;
  }

  res.status(422).json(response);
}

/**
 * Send server error response (500)
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 */
function sendServerError(res, error) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const response = {
    success: false,
    error: 'Internal server error',
    timestamp: Date.now(),
  };

  if (res.locals?.requestId) {
    response.requestId = res.locals.requestId;
  }

  // Include error details in development
  if (isDevelopment && error) {
    response.details = {
      message: error.message,
      stack: error.stack,
    };
  }

  res.status(500).json(response);
}

/**
 * Send service unavailable response (503)
 * @param {Object} res - Express response object
 * @param {string} message - Custom message
 */
function sendServiceUnavailable(res, message = 'Service temporarily unavailable') {
  sendError(res, message, 503);
}

/**
 * Express middleware to attach response helpers to res object
 */
function responseMiddleware(req, res, next) {
  // Attach helpers to response object
  res.sendSuccess = (data, statusCode) => sendSuccess(res, data, statusCode);
  res.sendError = (message, statusCode, details) => sendError(res, message, statusCode, details);
  res.sendPaginated = (items, page, limit, total) => sendPaginated(res, items, page, limit, total);
  res.sendCreated = (data) => sendCreated(res, data);
  res.sendNoContent = () => sendNoContent(res);
  res.sendNotFound = (resource) => sendNotFound(res, resource);
  res.sendUnauthorized = (message) => sendUnauthorized(res, message);
  res.sendForbidden = (message) => sendForbidden(res, message);
  res.sendConflict = (message) => sendConflict(res, message);
  res.sendValidationError = (errors) => sendValidationError(res, errors);
  res.sendServerError = (error) => sendServerError(res, error);
  res.sendServiceUnavailable = (message) => sendServiceUnavailable(res, message);

  next();
}

module.exports = {
  // Direct functions
  sendSuccess,
  sendError,
  sendPaginated,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendConflict,
  sendValidationError,
  sendServerError,
  sendServiceUnavailable,

  // Middleware
  responseMiddleware,
};
