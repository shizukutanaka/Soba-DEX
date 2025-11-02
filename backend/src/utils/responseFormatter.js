class ResponseFormatter {
  constructor() {
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    };
    this.config = {
      includeTimestamp: true,
      includeRequestId: true,
      includeVersion: true,
      apiVersion: process.env.API_VERSION || '1.0.0'
    };
  }

  // Success response with data
  success(data = null, message = 'Success', meta = {}) {
    const response = {
      success: true,
      message,
      data
    };

    // メタデータ構築
    const metaData = {
      ...meta
    };

    if (this.config.includeTimestamp) {
      metaData.timestamp = new Date().toISOString();
    }

    if (this.config.includeVersion) {
      metaData.version = this.config.apiVersion;
    }

    response.meta = metaData;
    return response;
  }

  // Error response
  error(message = 'An error occurred', code = 'INTERNAL_ERROR', details = null) {
    return {
      success: false,
      error: {
        message,
        code,
        details,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Paginated response
  paginated(data, page, limit, total, meta = {}) {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return this.success(data, 'Data retrieved successfully', {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
        nextPage: hasNext ? page + 1 : null,
        prevPage: hasPrev ? page - 1 : null
      },
      ...meta
    });
  }

  // List response with metadata
  list(items, meta = {}) {
    return this.success(items, 'List retrieved successfully', {
      count: items.length,
      ...meta
    });
  }

  // Single item response
  item(item, message = 'Item retrieved successfully') {
    return this.success(item, message);
  }

  // Created response
  created(data, message = 'Resource created successfully') {
    return this.success(data, message, {
      status: 201
    });
  }

  // Updated response
  updated(data, message = 'Resource updated successfully') {
    return this.success(data, message, {
      status: 200
    });
  }

  // Deleted response
  deleted(message = 'Resource deleted successfully') {
    return this.success(null, message, {
      status: 200
    });
  }

  // Not found response
  notFound(resource = 'Resource', id = null) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    return this.error(message, 'NOT_FOUND');
  }

  // Validation error response
  validationError(errors) {
    return this.error('Validation failed', 'VALIDATION_ERROR', {
      errors: Array.isArray(errors) ? errors : [errors]
    });
  }

  // Unauthorized response
  unauthorized(message = 'Authentication required') {
    return this.error(message, 'UNAUTHORIZED');
  }

  // Forbidden response
  forbidden(message = 'Access denied') {
    return this.error(message, 'FORBIDDEN');
  }

  // Rate limit response
  rateLimited(retryAfter = null) {
    return this.error('Rate limit exceeded', 'RATE_LIMITED', {
      retryAfter
    });
  }

  // Server error response
  serverError(message = 'Internal server error') {
    return this.error(message, 'INTERNAL_ERROR');
  }

  // Service unavailable response
  serviceUnavailable(message = 'Service temporarily unavailable') {
    return this.error(message, 'SERVICE_UNAVAILABLE');
  }

  // Trading specific responses
  orderCreated(order) {
    return this.created(order, 'Order created successfully');
  }

  orderCancelled(orderId) {
    return this.success({ orderId }, 'Order cancelled successfully');
  }

  tradeExecuted(trade) {
    return this.success(trade, 'Trade executed successfully');
  }

  balanceUpdated(balance) {
    return this.updated(balance, 'Balance updated successfully');
  }

  // Status responses
  healthCheck(status, checks = {}) {
    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
      uptime: process.uptime()
    };
  }

  // Express middleware
  middleware() {
    return (req, res, next) => {
      // リクエストID追加ヘルパー
      const addRequestId = (response) => {
        if (this.config.includeRequestId && req.id) {
          response.requestId = req.id;
        }
        return response;
      };

      // Add response methods to res object
      res.success = (data, message, meta) => {
        const response = addRequestId(this.success(data, message, meta));
        const status = meta?.status || 200;
        this.sendResponse(res, response, status);
      };

      res.error = (message, code, details, status = 500) => {
        const response = addRequestId(this.error(message, code, details));
        this.sendResponse(res, response, status);
      };

      res.paginated = (data, page, limit, total, meta) => {
        const response = addRequestId(this.paginated(data, page, limit, total, meta));
        this.sendResponse(res, response, 200);
      };

      res.list = (items, meta) => {
        const response = addRequestId(this.list(items, meta));
        this.sendResponse(res, response, 200);
      };

      res.item = (item, message) => {
        const response = addRequestId(this.item(item, message));
        this.sendResponse(res, response, 200);
      };

      res.created = (data, message) => {
        const response = addRequestId(this.created(data, message));
        this.sendResponse(res, response, 201);
      };

      res.updated = (data, message) => {
        const response = addRequestId(this.updated(data, message));
        this.sendResponse(res, response, 200);
      };

      res.deleted = (message) => {
        const response = addRequestId(this.deleted(message));
        this.sendResponse(res, response, 200);
      };

      res.notFound = (resource, id) => {
        const response = addRequestId(this.notFound(resource, id));
        this.sendResponse(res, response, 404);
      };

      res.validationError = (errors) => {
        const response = addRequestId(this.validationError(errors));
        this.sendResponse(res, response, 400);
      };

      res.unauthorized = (message) => {
        const response = addRequestId(this.unauthorized(message));
        this.sendResponse(res, response, 401);
      };

      res.forbidden = (message) => {
        const response = addRequestId(this.forbidden(message));
        this.sendResponse(res, response, 403);
      };

      res.rateLimited = (retryAfter) => {
        const response = addRequestId(this.rateLimited(retryAfter));
        this.sendResponse(res, response, 429);
      };

      res.serverError = (message) => {
        const response = addRequestId(this.serverError(message));
        this.sendResponse(res, response, 500);
      };

      res.serviceUnavailable = (message) => {
        const response = addRequestId(this.serviceUnavailable(message));
        this.sendResponse(res, response, 503);
      };

      next();
    };
  }

  // 設定変更
  setConfig(config) {
    this.config = {
      ...this.config,
      ...config
    };
  }

  // APIバージョン設定
  setApiVersion(version) {
    this.config.apiVersion = version;
  }

  // 設定取得
  getConfig() {
    return { ...this.config };
  }

  sendResponse(res, data, status = 200) {
    // Set default headers
    Object.keys(this.defaultHeaders).forEach(header => {
      if (!res.getHeader(header)) {
        res.setHeader(header, this.defaultHeaders[header]);
      }
    });

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Send response
    res.status(status).json(data);
  }

  // Compress response data
  compress(data) {
    if (typeof data === 'string' && data.length > 1024) {
      // Only suggest compression for large strings
      return {
        compressed: true,
        originalSize: data.length,
        data
      };
    }
    return data;
  }

  // Format error for logging
  formatErrorForLog(error, req) {
    return {
      message: error.message,
      stack: error.stack,
      url: req?.originalUrl,
      method: req?.method,
      userAgent: req?.get('user-agent'),
      ip: req?.ip,
      timestamp: new Date().toISOString()
    };
  }
}

const responseFormatter = new ResponseFormatter();

module.exports = {
  responseFormatter,
  ResponseFormatter
};