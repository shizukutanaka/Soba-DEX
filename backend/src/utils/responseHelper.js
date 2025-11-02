// Standardized API response helper

class ResponseHelper {
  // Success response
  success(res, data, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  }

  // Created response (201)
  created(res, data) {
    return this.success(res, data, 201);
  }

  // Error response
  error(res, message, statusCode = 400, details = null) {
    const response = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };

    if (details) {
      response.details = details;
    }

    return res.status(statusCode).json(response);
  }

  // Bad request (400)
  badRequest(res, message, details = null) {
    return this.error(res, message, 400, details);
  }

  // Unauthorized (401)
  unauthorized(res, message = 'Unauthorized') {
    return this.error(res, message, 401);
  }

  // Forbidden (403)
  forbidden(res, message = 'Forbidden') {
    return this.error(res, message, 403);
  }

  // Not found (404)
  notFound(res, resource = 'Resource') {
    return this.error(res, `${resource} not found`, 404);
  }

  // Internal server error (500)
  serverError(res, message = 'Internal server error') {
    return this.error(res, message, 500);
  }

  // Paginated response
  paginated(res, data, pagination) {
    return res.status(200).json({
      success: true,
      data: data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit)
      },
      timestamp: new Date().toISOString()
    });
  }

  // Rate limit response
  rateLimited(res, retryAfter) {
    res.set('Retry-After', retryAfter);
    return res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfter: retryAfter,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new ResponseHelper();