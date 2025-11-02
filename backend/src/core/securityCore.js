/**
 * Security Core - Production-Grade Security System
 * Implements defense-in-depth security architecture
 */

const crypto = require('crypto');

class SecurityCore {
  constructor() {
    this.blockedIPs = new Set();
    this.suspiciousIPs = new Map();
    this.failedAttempts = new Map();
    this.rateLimits = new Map();

    this.config = {
      maxFailedAttempts: 5,
      blockDuration: 15 * 60 * 1000, // 15 minutes
      suspiciousThreshold: 3,
      cleanupInterval: 60 * 1000 // 1 minute
    };

    this.startCleanup();
  }

  // IP blocking and monitoring
  isIPBlocked(ip) {
    return this.blockedIPs.has(ip);
  }

  blockIP(ip, reason = 'Security violation', duration = this.config.blockDuration) {
    this.blockedIPs.add(ip);

    setTimeout(() => {
      this.blockedIPs.delete(ip);
    }, duration);

    console.warn(`[SECURITY] IP blocked: ${ip} - Reason: ${reason}`);
  }

  recordFailedAttempt(ip, endpoint) {
    const key = `${ip}:${endpoint}`;
    const attempts = this.failedAttempts.get(key) || 0;
    const newAttempts = attempts + 1;

    this.failedAttempts.set(key, newAttempts);

    if (newAttempts >= this.config.maxFailedAttempts) {
      this.blockIP(ip, `Too many failed attempts on ${endpoint}`);
      this.failedAttempts.delete(key);
    }

    // Auto-cleanup after 5 minutes
    setTimeout(() => {
      const current = this.failedAttempts.get(key);
      if (current === newAttempts) {
        this.failedAttempts.delete(key);
      }
    }, 5 * 60 * 1000);
  }

  clearFailedAttempts(ip, endpoint) {
    const key = `${ip}:${endpoint}`;
    this.failedAttempts.delete(key);
  }

  // Input validation and sanitization
  validateInput(input, rules = {}) {
    if (input === null || input === undefined) {
      return { valid: false, error: 'Input is required' };
    }

    const {
      type = 'string',
      minLength = 0,
      maxLength = 10000,
      pattern = null,
      allowedValues = null,
      required = true
    } = rules;

    // Check required
    if (required && (!input || (typeof input === 'string' && input.trim() === ''))) {
      return { valid: false, error: 'Input is required' };
    }

    // Type validation
    if (type === 'string' && typeof input !== 'string') {
      return { valid: false, error: 'Input must be a string' };
    }

    if (type === 'number' && (typeof input !== 'number' || isNaN(input))) {
      return { valid: false, error: 'Input must be a valid number' };
    }

    // Length validation
    if (typeof input === 'string') {
      if (input.length < minLength) {
        return { valid: false, error: `Input must be at least ${minLength} characters` };
      }
      if (input.length > maxLength) {
        return { valid: false, error: `Input must be at most ${maxLength} characters` };
      }
    }

    // Pattern validation
    if (pattern && typeof input === 'string') {
      const regex = new RegExp(pattern);
      if (!regex.test(input)) {
        return { valid: false, error: 'Input format is invalid' };
      }
    }

    // Allowed values validation
    if (allowedValues && !allowedValues.includes(input)) {
      return { valid: false, error: 'Input value is not allowed' };
    }

    return { valid: true, sanitized: this.sanitizeInput(input) };
  }

  sanitizeInput(input, depth = 0) {
    const MAX_DEPTH = 10;

    if (depth > MAX_DEPTH) {
      return null;
    }

    if (typeof input === 'string') {
      return input
        .replace(/[<>]/g, '') // Remove HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();
    }

    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item, depth + 1));
    }

    if (typeof input === 'object' && input !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(input)) {
        const sanitizedKey = this.sanitizeInput(key, depth + 1);
        sanitized[sanitizedKey] = this.sanitizeInput(value, depth + 1);
      }
      return sanitized;
    }

    return input;
  }

  // SQL injection prevention
  escapeSQLString(str) {
    if (typeof str !== 'string') {
      return str;
    }
    // eslint-disable-next-line no-control-regex
    return str.replace(/[\0\x08\x09\x1a\n\r"'\\%]/g, (char) => {
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

  // CSRF token management
  generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  validateCSRFToken(token, storedToken) {
    if (!token || !storedToken) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(storedToken)
    );
  }

  // Rate limiting
  checkRateLimit(identifier, limit = 100, window = 60000) {
    const now = Date.now();
    const key = `${identifier}:${Math.floor(now / window)}`;

    const current = this.rateLimits.get(key) || 0;

    if (current >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: Math.ceil(now / window) * window
      };
    }

    this.rateLimits.set(key, current + 1);

    return {
      allowed: true,
      remaining: limit - current - 1,
      resetAt: Math.ceil(now / window) * window
    };
  }

  // JWT utilities
  generateSecureToken(payload, secret, expiresIn = '1h') {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const exp = expiresIn.endsWith('h')
      ? now + parseInt(expiresIn) * 3600
      : expiresIn.endsWith('d')
        ? now + parseInt(expiresIn) * 86400
        : now + 3600;

    const body = {
      ...payload,
      iat: now,
      exp: exp
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedBody = Buffer.from(JSON.stringify(body)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedBody}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedBody}.${signature}`;
  }

  verifyToken(token, secret) {
    try {
      const [encodedHeader, encodedBody, signature] = token.split('.');

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${encodedHeader}.${encodedBody}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      const payload = JSON.parse(Buffer.from(encodedBody, 'base64url').toString());

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Password hashing
  async hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  async verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }

  // Security headers
  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
  }

  // Cleanup old data
  startCleanup() {
    setInterval(() => {
      const now = Date.now();

      // Clean rate limits
      for (const [key] of this.rateLimits.entries()) {
        const timestamp = parseInt(key.split(':')[1]);
        if (now - timestamp > 120000) { // 2 minutes old
          this.rateLimits.delete(key);
        }
      }

      // Clean suspicious IPs
      for (const [ip, timestamp] of this.suspiciousIPs.entries()) {
        if (now - timestamp > 600000) { // 10 minutes old
          this.suspiciousIPs.delete(ip);
        }
      }
    }, this.config.cleanupInterval);
  }

  // Get security stats
  getStats() {
    return {
      blockedIPs: this.blockedIPs.size,
      suspiciousIPs: this.suspiciousIPs.size,
      failedAttempts: this.failedAttempts.size,
      rateLimitEntries: this.rateLimits.size
    };
  }

  // Middleware generator
  createSecurityMiddleware() {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;

      // Check if IP is blocked
      if (this.isIPBlocked(ip)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Your IP has been temporarily blocked'
        });
      }

      // Add security headers
      const headers = this.getSecurityHeaders();
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }

      // Sanitize request body
      if (req.body) {
        req.body = this.sanitizeInput(req.body);
      }

      // Sanitize query parameters
      if (req.query) {
        req.query = this.sanitizeInput(req.query);
      }

      next();
    };
  }
}

module.exports = new SecurityCore();