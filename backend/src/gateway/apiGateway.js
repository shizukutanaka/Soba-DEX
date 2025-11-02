const express = require('express');
const httpProxy = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

class APIGateway {
  constructor(config = {}) {
    this.app = express();
    this.config = {
      port: config.port || 3000,
      services: config.services || {},
      auth: config.auth || { enabled: true },
      rateLimit: config.rateLimit || { enabled: true },
      cors: config.cors || { enabled: true },
      logging: config.logging || { enabled: true },
      cache: config.cache || { enabled: true },
      circuitBreaker: config.circuitBreaker || { enabled: true }
    };

    this.metrics = {
      requests: 0,
      errors: 0,
      latency: [],
      services: {}
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupHealthCheck();
  }

  setupMiddleware() {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:']
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS
    if (this.config.cors.enabled) {
      this.app.use(cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
      }));
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID
    this.app.use((req, res, next) => {
      req.id = req.headers['x-request-id'] || uuidv4();
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // Logging
    if (this.config.logging.enabled) {
      this.app.use(this.loggingMiddleware.bind(this));
    }

    // Authentication
    if (this.config.auth.enabled) {
      this.app.use(this.authMiddleware.bind(this));
    }

    // Rate limiting
    if (this.config.rateLimit.enabled) {
      this.setupRateLimiting();
    }

    // Circuit breaker
    if (this.config.circuitBreaker.enabled) {
      this.app.use(this.circuitBreakerMiddleware.bind(this));
    }
  }

  setupRateLimiting() {
    // Global rate limit
    const globalLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100,
      message: 'Too many requests',
      standardHeaders: true,
      legacyHeaders: false
    });

    // API key based rate limiting
    const apiKeyLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 1000,
      keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
      skip: (req) => !req.headers['x-api-key']
    });

    // Service-specific rate limits
    const serviceLimiters = {
      trading: rateLimit({
        windowMs: 60 * 1000,
        max: 30,
        message: 'Trading rate limit exceeded'
      }),
      auth: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5,
        message: 'Auth rate limit exceeded'
      }),
      data: rateLimit({
        windowMs: 60 * 1000,
        max: 200,
        message: 'Data rate limit exceeded'
      })
    };

    this.app.use(globalLimiter);
    this.app.use(apiKeyLimiter);
    this.serviceLimiters = serviceLimiters;
  }

  authMiddleware(req, res, next) {
    // Skip auth for public endpoints
    const publicPaths = ['/health', '/status', '/api/public'];
    if (publicPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      req.user = decoded;
      next();
    } catch (_error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  loggingMiddleware(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const log = {
        timestamp: new Date().toISOString(),
        requestId: req.id,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      };

      // Update metrics
      this.metrics.requests++;
      if (res.statusCode >= 400) {
        this.metrics.errors++;
      }
      this.metrics.latency.push(duration);

      // Log based on status
      if (res.statusCode >= 500) {
        console.error('[GATEWAY ERROR]', log);
      } else if (res.statusCode >= 400) {
        console.warn('[GATEWAY WARN]', log);
      } else {
        console.log('[GATEWAY]', log);
      }
    });

    next();
  }

  circuitBreakerMiddleware(req, res, next) {
    const service = this.getServiceFromPath(req.path);

    if (!service) {
      return next();
    }

    const breaker = this.getCircuitBreaker(service);

    if (breaker && breaker.state === 'OPEN') {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        service,
        retryAfter: breaker.nextAttempt
      });
    }

    next();
  }

  setupRoutes() {
    // Service routing
    Object.entries(this.config.services).forEach(([name, config]) => {
      const path = config.path || `/${name}`;
      const target = config.target;

      if (!target) {
        console.warn(`No target defined for service ${name}`);
        return;
      }

      // Apply service-specific rate limiting
      if (this.serviceLimiters[name]) {
        this.app.use(path, this.serviceLimiters[name]);
      }

      // Proxy configuration
      const proxy = httpProxy.createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: config.pathRewrite || {},
        onProxyReq: (proxyReq, req) => {
          // Forward request ID
          proxyReq.setHeader('X-Request-ID', req.id);

          // Forward user info
          if (req.user) {
            proxyReq.setHeader('X-User-ID', req.user.id);
            proxyReq.setHeader('X-User-Role', req.user.role);
          }
        },
        onProxyRes: (proxyRes, _req, _res) => {
          // Add service header
          proxyRes.headers['X-Service'] = name;
        },
        onError: (err, req, res) => {
          console.error(`Proxy error for ${name}:`, err);

          // Update circuit breaker
          const breaker = this.getCircuitBreaker(name);
          if (breaker) {
            breaker.recordFailure();
          }

          res.status(502).json({
            error: 'Bad Gateway',
            service: name,
            message: 'Service unavailable'
          });
        }
      });

      this.app.use(path, proxy);
      console.log(`Routing ${path} -> ${target}`);
    });

    // Fallback route
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.path
      });
    });
  }

  setupHealthCheck() {
    this.app.get('/health', async (req, res) => {
      const health = await this.checkHealth();
      const status = health.status === 'healthy' ? 200 : 503;
      res.status(status).json(health);
    });

    this.app.get('/status', (req, res) => {
      res.json({
        status: 'operational',
        uptime: process.uptime(),
        metrics: this.getMetrics(),
        services: this.config.services,
        timestamp: Date.now()
      });
    });

    this.app.get('/metrics', (req, res) => {
      res.json(this.getMetrics());
    });
  }

  async checkHealth() {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      services: {}
    };

    // Check each service
    for (const [name, config] of Object.entries(this.config.services)) {
      try {
        const response = await fetch(`${config.target}/health`);
        health.services[name] = {
          status: response.ok ? 'healthy' : 'unhealthy',
          statusCode: response.status
        };
      } catch (error) {
        health.services[name] = {
          status: 'unhealthy',
          error: error.message
        };
        health.status = 'degraded';
      }
    }

    return health;
  }

  getMetrics() {
    const latencyArray = this.metrics.latency.slice(-1000); // Last 1000 requests

    return {
      totalRequests: this.metrics.requests,
      totalErrors: this.metrics.errors,
      errorRate: this.metrics.requests ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) : 0,
      latency: {
        avg: latencyArray.length ? (latencyArray.reduce((a, b) => a + b, 0) / latencyArray.length).toFixed(2) : 0,
        min: latencyArray.length ? Math.min(...latencyArray) : 0,
        max: latencyArray.length ? Math.max(...latencyArray) : 0,
        p50: this.percentile(latencyArray, 50),
        p95: this.percentile(latencyArray, 95),
        p99: this.percentile(latencyArray, 99)
      },
      services: this.metrics.services
    };
  }

  percentile(arr, p) {
    if (arr.length === 0) {
      return 0;
    }
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * (p / 100)) - 1;
    return sorted[index] || 0;
  }

  getServiceFromPath(path) {
    for (const [name, config] of Object.entries(this.config.services)) {
      const servicePath = config.path || `/${name}`;
      if (path.startsWith(servicePath)) {
        return name;
      }
    }
    return null;
  }

  getCircuitBreaker(_service) {
    // In production, integrate with circuit breaker service
    return null;
  }

  start() {
    this.server = this.app.listen(this.config.port, () => {
      console.log(`API Gateway running on port ${this.config.port}`);
      console.log(`Services configured: ${Object.keys(this.config.services).join(', ')}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

// Default configuration
// NOTE: This API Gateway is currently unused in the monolithic architecture
// It's designed for future microservices migration
const defaultConfig = {
  port: process.env.GATEWAY_PORT || 3000,
  services: {
    auth: {
      // IMPORTANT: Set AUTH_SERVICE_URL environment variable when using microservices
      target: process.env.AUTH_SERVICE_URL || null,
      path: '/api/auth',
      required: false // Optional until microservices are deployed
    },
    trading: {
      target: process.env.TRADING_SERVICE_URL || null,
      path: '/api/trading',
      required: false
    },
    data: {
      target: process.env.DATA_SERVICE_URL || null,
      path: '/api/data',
      required: false
    },
    blockchain: {
      target: process.env.BLOCKCHAIN_SERVICE_URL || null,
      path: '/api/blockchain',
      required: false
    }
  }
};

// Create and export gateway instance
const gateway = new APIGateway(defaultConfig);

module.exports = {
  APIGateway,
  gateway
};