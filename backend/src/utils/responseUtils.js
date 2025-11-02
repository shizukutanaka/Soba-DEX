/**
 * Response Utilities - Optimized JSON Response Operations
 * Reduces JSON.stringify overhead for common response patterns
 */

class ResponseUtils {
  constructor() {
    this._successTemplate = '{"success":true,"data":';
    this._errorTemplate = '{"success":false,"error":';
  }

  // Create success response with data
  success(data, extra = {}) {
    const response = {
      success: true,
      data,
      ...extra
    };

    // For simple objects, use template to avoid stringify overhead
    if (typeof data === 'object' && Object.keys(extra).length === 0) {
      return this._successTemplate + JSON.stringify(data) + '}';
    }

    return response;
  }

  // Create error response
  error(message, code = null, extra = {}) {
    const response = {
      success: false,
      error: message,
      ...extra
    };

    if (code) {
      response.code = code;
    }

    return response;
  }

  // Create paginated response
  paginated(items, total, pagination, extra = {}) {
    return this.success({
      items,
      total,
      pagination
    }, extra);
  }

  // Create stats response
  stats(data, extra = {}) {
    return this.success(data, {
      timestamp: require('./timestampUtils').timestampUtils.now(),
      ...extra
    });
  }

  // Stream response for large datasets
  stream(res, generator, options = {}) {
    const {
      contentType = 'application/json',
      chunkSize = 100
    } = options;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Transfer-Encoding', 'chunked');

    let first = true;
    res.write('{"success":true,"data":[');

    for (const item of generator) {
      if (!first) {
        res.write(',');
      }
      res.write(JSON.stringify(item));
      first = false;

      // Yield control periodically to prevent blocking
      if (chunkSize > 0 && !first && first % chunkSize === 0) {
        setImmediate(() => {});
      }
    }

    res.end(']}');
  }
}

// Singleton instance
const responseUtils = new ResponseUtils();

module.exports = {
  ResponseUtils,
  responseUtils
};
