const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class EnhancedSecurity {
  constructor(config) {
    this.config = config;
    this.tokenBlacklist = new Set();
    this.suspiciousIPs = new Map();
    this.failedAttempts = new Map();
  }

  // Initialize all security middleware
  setupMiddleware(app) {
    // Helmet for security headers
    app.use(helmet({
      contentSecurityPolicy: this.config.get('security.helmet.contentSecurityPolicy'),
      hsts: this.config.get('security.helmet.hsts'),
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      dnsPrefetchControl: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true
    }));

    // CORS configuration
    app.use(this.getCorsMiddleware());

    // Rate limiting
    app.use(this.getRateLimiter());

    // Prevent NoSQL injection attacks
    app.use(mongoSanitize({
      replaceWith: '_',
      onSanitize: ({ req, key }) => {
        console.warn(`Sanitized ${key} in request from ${req.ip}`);
        this.recordSuspiciousActivity(req.ip, 'nosql-injection-attempt');
      }
    }));

    // XSS protection
    app.use(xss());

    // Prevent HTTP parameter pollution
    app.use(hpp({
      whitelist: ['sort', 'filter', 'page', 'limit']
    }));

    // Custom security headers
    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      next();
    });

    // Request ID for tracing
    app.use((req, res, next) => {
      req.id = crypto.randomBytes(16).toString('hex');
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    return app;
  }

  // Enhanced CORS configuration
  getCorsMiddleware() {
    const corsOptions = {
      origin: (origin, callback) => {
        const allowedOrigins = this.config.get('security.cors.origins');

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes('*')) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Log and reject unauthorized origin
        console.warn(`CORS: Rejected request from unauthorized origin: ${origin}`);
        this.recordSuspiciousActivity(origin, 'cors-violation');
        callback(new Error('Not allowed by CORS'));
      },
      credentials: this.config.get('security.cors.credentials'),
      maxAge: this.config.get('security.cors.maxAge'),
      exposedHeaders: this.config.get('security.cors.exposedHeaders'),
      allowedHeaders: this.config.get('security.cors.allowedHeaders'),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      preflightContinue: false,
      optionsSuccessStatus: 204
    };

    return cors(corsOptions);
  }

  // Advanced rate limiting with different limits per endpoint
  getRateLimiter() {
    const limiters = {
      general: rateLimit({
        windowMs: this.config.get('security.rateLimit.windowMs'),
        max: this.config.get('security.rateLimit.max'),
        message: this.config.get('security.rateLimit.message'),
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          this.recordSuspiciousActivity(req.ip, 'rate-limit-exceeded');
          res.status(429).json({
            error: 'Too many requests',
            retryAfter: Math.ceil(this.config.get('security.rateLimit.windowMs') / 1000)
          });
        }
      }),

      auth: rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        skipSuccessfulRequests: true,
        message: 'Too many authentication attempts'
      }),

      api: rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 60,
        message: 'API rate limit exceeded'
      }),

      websocket: rateLimit({
        windowMs: 1000,
        max: 10,
        message: 'WebSocket rate limit exceeded'
      })
    };

    return (req, res, next) => {
      if (req.path.includes('/auth')) {
        return limiters.auth(req, res, next);
      }
      if (req.path.includes('/api')) {
        return limiters.api(req, res, next);
      }
      if (req.path.includes('/ws')) {
        return limiters.websocket(req, res, next);
      }
      return limiters.general(req, res, next);
    };
  }

  // JWT token generation with enhanced security
  generateToken(payload, options = {}) {
    const secret = this.config.get('security.jwt.secret');
    const defaultOptions = {
      expiresIn: this.config.get('security.jwt.expiresIn'),
      algorithm: this.config.get('security.jwt.algorithm'),
      issuer: 'soba',
      audience: 'dex-users'
    };

    const token = jwt.sign(
      {
        ...payload,
        jti: crypto.randomBytes(16).toString('hex'),
        iat: Math.floor(Date.now() / 1000)
      },
      secret,
      { ...defaultOptions, ...options }
    );

    return token;
  }

  // Token verification with blacklist check
  verifyToken(token) {
    try {
      if (this.tokenBlacklist.has(token)) {
        throw new Error('Token has been revoked');
      }

      const secret = this.config.get('security.jwt.secret');
      const decoded = jwt.verify(token, secret, {
        algorithms: [this.config.get('security.jwt.algorithm')],
        issuer: 'soba',
        audience: 'dex-users'
      });

      return decoded;
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  // Revoke token
  revokeToken(token) {
    this.tokenBlacklist.add(token);

    // Clean up old tokens periodically
    if (this.tokenBlacklist.size > 1000) {
      this.cleanupTokenBlacklist();
    }
  }

  // Password hashing with salt
  async hashPassword(password) {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  // Password verification
  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  // Input validation and sanitization
  sanitizeInput(input) {
    if (typeof input === 'string') {
      // Remove HTML tags
      input = input.replace(/<[^>]*>/g, '');
      // Remove script tags specifically
      input = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      // Escape special characters
      input = input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }
    return input;
  }

  // SQL injection prevention
  escapeSql(value) {
    if (typeof value === 'string') {
      // eslint-disable-next-line no-control-regex
      return value.replace(/[\0\x08\x09\x1a\n\r"'\\%]/g, (char) => {
        switch (char) {
        case '\0': return '\\0';
        case '\x08': return '\\b';
        case '\x09': return '\\t';
        case '\x1a': return '\\z';
        case '\n': return '\\n';
        case '\r': return '\\r';
        case '"':
        case "'":
        case '\\':
        case '%':
          return '\\' + char;
        default:
          return char;
        }
      });
    }
    return value;
  }

  // Content Security Policy violation handler
  handleCSPViolation(req, res) {
    const violation = req.body;
    console.warn('CSP Violation:', {
      documentUri: violation['document-uri'],
      violatedDirective: violation['violated-directive'],
      blockedUri: violation['blocked-uri'],
      sourceFile: violation['source-file'],
      lineNumber: violation['line-number'],
      columnNumber: violation['column-number']
    });

    this.recordSuspiciousActivity(req.ip, 'csp-violation');
    res.status(204).end();
  }

  // Track suspicious activity
  recordSuspiciousActivity(identifier, type) {
    if (!this.suspiciousIPs.has(identifier)) {
      this.suspiciousIPs.set(identifier, []);
    }

    const activities = this.suspiciousIPs.get(identifier);
    activities.push({
      type,
      timestamp: Date.now()
    });

    // Block IP if too many suspicious activities
    if (activities.length > 10) {
      this.blockIP(identifier);
    }

    // Clean up old records
    if (this.suspiciousIPs.size > 1000) {
      this.cleanupSuspiciousIPs();
    }
  }

  // IP blocking mechanism
  blockIP(ip) {
    console.error(`Blocking IP address: ${ip}`);
    // Implement IP blocking logic (firewall rules, etc.)
  }

  // Brute force protection
  recordFailedAttempt(identifier) {
    if (!this.failedAttempts.has(identifier)) {
      this.failedAttempts.set(identifier, []);
    }

    const attempts = this.failedAttempts.get(identifier);
    attempts.push(Date.now());

    // Keep only recent attempts
    const recentAttempts = attempts.filter(
      time => Date.now() - time < 15 * 60 * 1000
    );
    this.failedAttempts.set(identifier, recentAttempts);

    // Block if too many failed attempts
    if (recentAttempts.length > 5) {
      this.blockIP(identifier);
      return true;
    }

    return false;
  }

  // Clear failed attempt record on successful login
  clearFailedAttempts(identifier) {
    this.failedAttempts.delete(identifier);
  }

  // Cleanup methods
  cleanupTokenBlacklist() {
    // In production, store in Redis with TTL
    // This is a simple in-memory cleanup
    if (this.tokenBlacklist.size > 500) {
      const tokensArray = Array.from(this.tokenBlacklist);
      this.tokenBlacklist = new Set(tokensArray.slice(-500));
    }
  }

  cleanupSuspiciousIPs() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    for (const [ip, activities] of this.suspiciousIPs.entries()) {
      const recentActivities = activities.filter(
        activity => activity.timestamp > cutoff
      );

      if (recentActivities.length === 0) {
        this.suspiciousIPs.delete(ip);
      } else {
        this.suspiciousIPs.set(ip, recentActivities);
      }
    }
  }

  // Encrypt sensitive data
  encrypt(text) {
    const algorithm = this.config.get('security.encryption.algorithm');
    const key = Buffer.from(this.config.get('security.encryption.key'), 'hex');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  // Decrypt sensitive data
  decrypt(encryptedData) {
    const algorithm = this.config.get('security.encryption.algorithm');
    const key = Buffer.from(this.config.get('security.encryption.key'), 'hex');

    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Generate secure random tokens
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Validate API key
  validateApiKey(apiKey, service) {
    const apiKeys = this.config.get('security.apiKeys');
    return apiKeys[service] === apiKey;
  }

  // Session security
  configureSession() {
    return {
      secret: this.config.get('security.jwt.secret'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
      },
      name: 'dex.sid',
      genid: () => this.generateSecureToken()
    };
  }
}

module.exports = EnhancedSecurity;