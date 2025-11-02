/**
 * Security Utilities Module
 * Provides validation, sanitization, and security helper functions
 */

const crypto = require('crypto');

/**
 * Security error codes for better troubleshooting
 */
const SecurityErrorCodes = {
  INVALID_IP: 'SEC_001',
  INVALID_HEADER: 'SEC_002',
  INVALID_PATH: 'SEC_003',
  INVALID_METHOD: 'SEC_004',
  INVALID_CONFIG: 'SEC_005',
  INJECTION_DETECTED: 'SEC_006',
  XSS_DETECTED: 'SEC_007',
  PATH_TRAVERSAL: 'SEC_008',
  MEMORY_LIMIT_EXCEEDED: 'SEC_009',
  RATE_LIMIT_EXCEEDED: 'SEC_010'
};

/**
 * Generate cryptographically secure random ID
 * @param {string} prefix - Prefix for the ID
 * @returns {string} Secure random ID
 */
function generateSecureId(prefix = 'id') {
  try {
    // Use crypto.randomUUID() for Node.js 14.17+
    if (crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    // Fallback to randomBytes
    const randomBytes = crypto.randomBytes(16);
    const timestamp = Date.now().toString(36);
    const random = randomBytes.toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  } catch (error) {
    // Last resort fallback
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  }
}

/**
 * Validate IP address format (IPv4 and IPv6)
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if valid IP
 */
function isValidIP(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([\da-f]{1,4}:){7}[\da-f]{1,4}$/i;

  if (ipv4Pattern.test(ip)) {
    // Validate IPv4 octets
    const octets = ip.split('.');
    return octets.every(octet => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }

  if (ipv6Pattern.test(ip)) {
    return true;
  }

  // Check for IPv6 compressed format
  if (ip.includes('::')) {
    const parts = ip.split('::');
    if (parts.length > 2) return false;
    return parts.every(part => {
      if (!part) return true;
      const segments = part.split(':');
      return segments.every(seg => /^[\da-f]{1,4}$/i.test(seg));
    });
  }

  return false;
}

/**
 * Sanitize IP address (extract from X-Forwarded-For, etc.)
 * @param {string} ip - Raw IP address
 * @returns {string} Sanitized IP or 'unknown'
 */
function sanitizeIP(ip) {
  if (!ip) return 'unknown';

  // Remove whitespace
  ip = ip.trim();

  // Extract first IP from comma-separated list
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }

  // Remove port number if present
  if (ip.includes(':') && !ip.includes('::')) {
    const parts = ip.split(':');
    // Only remove if it looks like IPv4:port, not IPv6
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
      ip = parts[0];
    }
  }

  // Validate and return
  return isValidIP(ip) ? ip : 'unknown';
}

/**
 * Validate HTTP method
 * @param {string} method - HTTP method
 * @returns {boolean} True if valid method
 */
function isValidMethod(method) {
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
  return validMethods.includes(method?.toUpperCase());
}

/**
 * Detect path traversal attempts
 * @param {string} path - URL path
 * @returns {boolean} True if path traversal detected
 */
function hasPathTraversal(path) {
  if (!path || typeof path !== 'string') {
    return false;
  }

  const patterns = [
    /\.\./,           // Double dot
    /\.\\/,           // Dot backslash
    /\.\/\//,         // Dot slash slash
    /%2e%2e/i,        // URL encoded ..
    /%5c/i,           // URL encoded backslash
    /\\\.\\/,         // Backslash dot backslash
  ];

  return patterns.some(pattern => pattern.test(path));
}

/**
 * Detect SQL injection patterns
 * @param {string} input - Input to check
 * @returns {boolean} True if SQL injection detected
 */
function hasSQLInjection(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }

  const patterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|eval)\b)/i,
    /(\b(or|and)\b\s*\d+\s*=\s*\d+)/i,  // OR 1=1, AND 1=1
    /['";].*(-{2}|\/\*)/,                 // Comment injection
    /\bxp_\w+/i,                          // Extended stored procedures
    /\bsp_\w+/i,                          // System stored procedures
  ];

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Detect XSS patterns
 * @param {string} input - Input to check
 * @returns {boolean} True if XSS detected
 */
function hasXSS(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }

  const patterns = [
    /<script[^>]*>.*?<\/script>/is,
    /javascript:/i,
    /on\w+\s*=/i,                        // Event handlers
    /expression\s*\(/i,                  // CSS expression
    /vbscript:/i,
    /data:text\/html/i,
    /<iframe/i,
    /<embed/i,
    /<object/i,
  ];

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Detect command injection patterns
 * @param {string} input - Input to check
 * @returns {boolean} True if command injection detected
 */
function hasCommandInjection(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }

  const patterns = [
    /[;&|`$()]/,                         // Shell metacharacters
    /\$\{.*\}/,                          // Variable expansion
    /\$\(.*\)/,                          // Command substitution
    /\|\|/,                              // Or operator
    /&&/,                                // And operator
  ];

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Sanitize headers for logging (remove sensitive data)
 * @param {object} headers - Request headers
 * @returns {object} Sanitized headers
 */
function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  const sanitized = {};
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'x-session-token',
    'api-key',
    'apikey',
    'auth-token',
    'access-token',
    'refresh-token',
  ];

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveHeaders.includes(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      // Truncate long header values
      sanitized[key] = typeof value === 'string' && value.length > 200
        ? value.substring(0, 200) + '...[TRUNCATED]'
        : value;
    }
  }

  return sanitized;
}

/**
 * Validate configuration values
 * @param {object} config - Configuration object
 * @returns {object} Validation result with errors
 */
function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be an object'] };
  }

  // Validate monitoring interval
  if (config.monitoringInterval !== undefined) {
    const interval = parseInt(config.monitoringInterval, 10);
    if (isNaN(interval) || interval < 100 || interval > 60000) {
      errors.push('monitoringInterval must be between 100 and 60000 milliseconds');
    }
  }

  // Validate thresholds
  if (config.alertThresholds) {
    const { high, medium, low } = config.alertThresholds;

    if (high !== undefined && (isNaN(high) || high < 0 || high > 100)) {
      errors.push('high threshold must be between 0 and 100');
    }
    if (medium !== undefined && (isNaN(medium) || medium < 0 || medium > 100)) {
      errors.push('medium threshold must be between 0 and 100');
    }
    if (low !== undefined && (isNaN(low) || low < 0 || low > 100)) {
      errors.push('low threshold must be between 0 and 100');
    }

    // Validate threshold ordering
    if (high !== undefined && medium !== undefined && high <= medium) {
      errors.push('high threshold must be greater than medium threshold');
    }
    if (medium !== undefined && low !== undefined && medium <= low) {
      errors.push('medium threshold must be greater than low threshold');
    }
  }

  // Validate max incidents
  if (config.maxIncidents !== undefined) {
    const max = parseInt(config.maxIncidents, 10);
    if (isNaN(max) || max < 10 || max > 100000) {
      errors.push('maxIncidents must be between 10 and 100000');
    }
  }

  // Validate retention period
  if (config.retentionPeriod !== undefined) {
    const retention = parseInt(config.retentionPeriod, 10);
    if (isNaN(retention) || retention < 60000 || retention > 2592000000) {
      errors.push('retentionPeriod must be between 1 minute and 30 days');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate secure hash of data
 * @param {string|object} data - Data to hash
 * @returns {string} SHA-256 hash
 */
function calculateHash(data) {
  const hash = crypto.createHash('sha256');
  const input = typeof data === 'string' ? data : JSON.stringify(data);
  hash.update(input);
  return hash.digest('hex');
}

/**
 * Generate HMAC for data verification
 * @param {string|object} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {string} HMAC signature
 */
function generateHMAC(data, secret) {
  if (!secret) {
    throw new Error('HMAC secret is required');
  }
  const hmac = crypto.createHmac('sha256', secret);
  const input = typeof data === 'string' ? data : JSON.stringify(data);
  hmac.update(input);
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature
 * @param {string|object} data - Data to verify
 * @param {string} signature - HMAC signature
 * @param {string} secret - Secret key
 * @returns {boolean} True if signature is valid
 */
function verifyHMAC(data, signature, secret) {
  try {
    const expectedSignature = generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    return false;
  }
}

/**
 * Safe division to prevent division by zero
 * @param {number} numerator - Numerator
 * @param {number} denominator - Denominator
 * @param {number} defaultValue - Default value if denominator is zero
 * @returns {number} Result of division or default value
 */
function safeDivide(numerator, denominator, defaultValue = 0) {
  if (denominator === 0 || !isFinite(denominator)) {
    return defaultValue;
  }
  const result = numerator / denominator;
  return isFinite(result) ? result : defaultValue;
}

/**
 * Check if Map size exceeds limit
 * @param {Map} map - Map to check
 * @param {number} limit - Size limit
 * @returns {boolean} True if size exceeds limit
 */
function exceedsMapLimit(map, limit) {
  return map && map.size > limit;
}

/**
 * Trim Map to limit by removing oldest entries
 * @param {Map} map - Map to trim
 * @param {number} limit - Maximum size
 * @param {function} getTimestamp - Function to get timestamp from entry
 */
function trimMapToLimit(map, limit, getTimestamp = (entry) => entry.timestamp) {
  if (!map || map.size <= limit) {
    return;
  }

  // Convert to array and sort by timestamp
  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    const tsA = getTimestamp(a[1]);
    const tsB = getTimestamp(b[1]);
    return tsA - tsB; // Oldest first
  });

  // Remove oldest entries
  const toRemove = entries.length - limit;
  for (let i = 0; i < toRemove; i++) {
    map.delete(entries[i][0]);
  }
}

/**
 * Create error object with code and context
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {object} context - Additional context
 * @returns {Error} Error object with additional properties
 */
function createSecurityError(code, message, context = {}) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  error.timestamp = Date.now();
  return error;
}

/**
 * Detect if string contains only printable ASCII characters
 * @param {string} str - String to check
 * @returns {boolean} True if string is safe
 */
function isPrintableASCII(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }
  // Printable ASCII range: 32-126
  return /^[\x20-\x7E]*$/.test(str);
}

/**
 * Normalize user agent string
 * @param {string} userAgent - User agent string
 * @returns {string} Normalized user agent
 */
function normalizeUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return 'unknown';
  }

  // Truncate to reasonable length
  const truncated = userAgent.substring(0, 500);

  // Remove potentially malicious patterns
  const cleaned = truncated
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');

  return cleaned.trim() || 'unknown';
}

/**
 * Validate and normalize path
 * @param {string} path - URL path
 * @returns {object} Validation result with normalized path
 */
function validatePath(path) {
  if (!path || typeof path !== 'string') {
    return {
      valid: false,
      path: '/',
      error: 'Invalid path format'
    };
  }

  // Check for path traversal
  if (hasPathTraversal(path)) {
    return {
      valid: false,
      path: '/',
      error: 'Path traversal detected'
    };
  }

  // Normalize path
  let normalized = path.trim();

  // Ensure it starts with /
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  // Truncate to reasonable length
  if (normalized.length > 2000) {
    normalized = normalized.substring(0, 2000);
  }

  return {
    valid: true,
    path: normalized,
    error: null
  };
}

/**
 * Rate limit check using token bucket algorithm
 */
class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate; // tokens per second
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1) {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  refill() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getRemainingTokens() {
    this.refill();
    return Math.floor(this.tokens);
  }
}

module.exports = {
  SecurityErrorCodes,
  generateSecureId,
  isValidIP,
  sanitizeIP,
  isValidMethod,
  hasPathTraversal,
  hasSQLInjection,
  hasXSS,
  hasCommandInjection,
  sanitizeHeaders,
  validateConfig,
  calculateHash,
  generateHMAC,
  verifyHMAC,
  safeDivide,
  exceedsMapLimit,
  trimMapToLimit,
  createSecurityError,
  isPrintableASCII,
  normalizeUserAgent,
  validatePath,
  TokenBucket
};
