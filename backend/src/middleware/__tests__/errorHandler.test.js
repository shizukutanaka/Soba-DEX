const {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  asyncHandler,
  errorHandler,
  notFoundHandler
} = require('../errorHandler');

describe('Custom Error Classes', () => {
  test('AppError should create error with correct properties', () => {
    const error = new AppError('Test error', 400);

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
    expect(error.timestamp).toBeDefined();
  });

  test('ValidationError should have status 400', () => {
    const error = new ValidationError('Validation failed', ['Field required']);

    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(['Field required']);
  });

  test('AuthenticationError should have status 401', () => {
    const error = new AuthenticationError();
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Authentication failed');
  });

  test('AuthorizationError should have status 403', () => {
    const error = new AuthorizationError();
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Access denied');
  });

  test('NotFoundError should have status 404', () => {
    const error = new NotFoundError('User');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('User not found');
  });

  test('ConflictError should have status 409', () => {
    const error = new ConflictError();
    expect(error.statusCode).toBe(409);
  });

  test('RateLimitError should have status 429', () => {
    const error = new RateLimitError();
    expect(error.statusCode).toBe(429);
  });

  test('InternalError should have status 500 and be non-operational', () => {
    const error = new InternalError();
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(false);
  });
});

describe('asyncHandler', () => {
  test('should call next with error on rejected promise', async () => {
    const error = new Error('Test error');
    const handler = asyncHandler(async () => {
      throw error;
    });

    const req = {};
    const res = {};
    const next = jest.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test('should not call next on successful promise', async () => {
    const handler = asyncHandler(async (req, res) => {
      res.status(200).json({ success: true });
    });

    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('errorHandler', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn(() => 'test-agent')
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('should handle AppError correctly', () => {
    const error = new AppError('Test error', 400);
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Test error',
        statusCode: 400
      })
    );
  });

  test('should handle ValidationError with details', () => {
    const error = new ValidationError('Validation failed', ['Field required']);
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Validation failed',
        details: ['Field required']
      })
    );
  });

  test('should convert CastError to NotFoundError', () => {
    const error = new Error('Cast failed');
    error.name = 'CastError';
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('should handle duplicate key error (code 11000)', () => {
    const error = new Error('Duplicate key');
    error.code = 11000;
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('should handle JWT errors', () => {
    const error = new Error('Invalid token');
    error.name = 'JsonWebTokenError';
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid token'
      })
    );
  });

  test('should handle TokenExpiredError', () => {
    const error = new Error('Token expired');
    error.name = 'TokenExpiredError';
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('should default to 500 for unknown errors', () => {
    const error = new Error('Unknown error');
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('should include request ID if available', () => {
    req.id = 'request-123';
    const error = new AppError('Test error', 400);
    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-123'
      })
    );
  });

  test('should include stack trace in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const error = new AppError('Test error', 400);
    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.any(String)
      })
    );

    process.env.NODE_ENV = originalEnv;
  });
});

describe('notFoundHandler', () => {
  test('should create NotFoundError and call next', () => {
    const req = { originalUrl: '/nonexistent' };
    const res = {};
    const next = jest.fn();

    notFoundHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toContain('/nonexistent');
  });
});
