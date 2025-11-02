/**
 * Advanced Input Sanitizer
 * National-grade input validation and sanitization
 */

const validator = require('validator');
const { logger } = require('./productionLogger');

class InputSanitizer {
  constructor() {
    // Dangerous patterns
    this.dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe/gi,
      /eval\(/gi,
      /expression\(/gi,
      /../gi, // Path traversal
      /;\s*drop\s+table/gi,
      /union\s+select/gi,
      /insert\s+into/gi
    ];

    // Blacklisted characters for specific contexts
    this.sqlDangerousChars = ['\'', '"', ';', '--', '/*', '*/'];
    this.pathDangerousChars = ['..', '~', '\\'];
  }

  /**
   * Sanitize string input
   */
  sanitizeString(input, options = {}) {
    if (typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Trim whitespace
    if (options.trim !== false) {
      sanitized = sanitized.trim();
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Escape HTML if requested
    if (options.escapeHtml) {
      sanitized = validator.escape(sanitized);
    }

    // Remove dangerous patterns
    if (options.removeDangerous !== false) {
      for (const pattern of this.dangerousPatterns) {
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Normalize whitespace
    if (options.normalizeWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }

    // Max length
    if (options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    return sanitized;
  }

  /**
   * Sanitize email
   */
  sanitizeEmail(email) {
    if (!email || typeof email !== 'string') {
      return null;
    }

    const normalized = validator.normalizeEmail(email, {
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
      outlookdotcom_remove_subaddress: false,
      yahoo_remove_subaddress: false,
      icloud_remove_subaddress: false
    });

    if (!normalized || !validator.isEmail(normalized)) {
      return null;
    }

    return normalized;
  }

  /**
   * Sanitize URL
   */
  sanitizeUrl(url, options = {}) {
    if (!url || typeof url !== 'string') {
      return null;
    }

    // Trim and normalize
    const sanitized = url.trim();

    // Remove dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    for (const protocol of dangerousProtocols) {
      if (sanitized.toLowerCase().startsWith(protocol)) {
        logger.warn('[Sanitizer] Dangerous URL protocol detected', { url: sanitized });
        return null;
      }
    }

    // Validate URL format
    if (!validator.isURL(sanitized, {
      protocols: options.protocols || ['http', 'https'],
      require_protocol: options.requireProtocol !== false,
      require_valid_protocol: true,
      allow_underscores: false,
      allow_trailing_dot: false,
      allow_protocol_relative_urls: false
    })) {
      return null;
    }

    return sanitized;
  }

  /**
   * Sanitize file path
   */
  sanitizePath(path) {
    if (!path || typeof path !== 'string') {
      return null;
    }

    let sanitized = path.trim();

    // Check for dangerous patterns
    for (const dangerous of this.pathDangerousChars) {
      if (sanitized.includes(dangerous)) {
        logger.warn('[Sanitizer] Dangerous path pattern detected', { path: sanitized });
        return null;
      }
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Normalize separators
    sanitized = sanitized.replace(/\\/g, '/');

    // Remove leading slashes
    sanitized = sanitized.replace(/^\/+/, '');

    return sanitized;
  }

  /**
   * Sanitize numeric input
   */
  sanitizeNumber(input, options = {}) {
    if (typeof input === 'number') {
      if (!isFinite(input)) {
        return null;
      }
      return input;
    }

    if (typeof input !== 'string') {
      return null;
    }

    // Remove whitespace
    const cleaned = input.trim();

    // Check if valid number
    if (!validator.isNumeric(cleaned, { no_symbols: false })) {
      return null;
    }

    const num = Number(cleaned);

    if (!isFinite(num)) {
      return null;
    }

    // Check range
    if (options.min !== undefined && num < options.min) {
      return null;
    }

    if (options.max !== undefined && num > options.max) {
      return null;
    }

    // Check integer
    if (options.integer && !Number.isInteger(num)) {
      return null;
    }

    return num;
  }

  /**
   * Sanitize boolean input
   */
  sanitizeBoolean(input) {
    if (typeof input === 'boolean') {
      return input;
    }

    if (typeof input !== 'string') {
      return null;
    }

    const normalized = input.trim().toLowerCase();

    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }

    return null;
  }

  /**
   * Sanitize object keys and values
   */
  sanitizeObject(obj, schema = {}) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return null;
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const cleanKey = this.sanitizeString(key, {
        maxLength: 100,
        removeDangerous: true
      });

      if (!cleanKey) {
        continue;
      }

      // Get schema for this field
      const fieldSchema = schema[key] || schema['*'];

      if (!fieldSchema) {
        // No schema, skip
        continue;
      }

      // Sanitize value based on type
      let cleanValue;

      switch (fieldSchema.type) {
      case 'string':
        cleanValue = this.sanitizeString(value, fieldSchema.options || {});
        break;

      case 'email':
        cleanValue = this.sanitizeEmail(value);
        break;

      case 'url':
        cleanValue = this.sanitizeUrl(value, fieldSchema.options || {});
        break;

      case 'number':
        cleanValue = this.sanitizeNumber(value, fieldSchema.options || {});
        break;

      case 'boolean':
        cleanValue = this.sanitizeBoolean(value);
        break;

      case 'array':
        if (Array.isArray(value)) {
          cleanValue = value
            .map(item => this.sanitizeString(item, fieldSchema.options || {}))
            .filter(item => item !== null && item !== '');
        }
        break;

      default:
        cleanValue = null;
      }

      // Check if required
      if (fieldSchema.required && (cleanValue === null || cleanValue === '')) {
        logger.warn('[Sanitizer] Required field missing or invalid', { field: key });
        return null;
      }

      if (cleanValue !== null && cleanValue !== '') {
        sanitized[cleanKey] = cleanValue;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize SQL input
   */
  sanitizeSql(input) {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Remove SQL dangerous characters
    for (const char of this.sqlDangerousChars) {
      sanitized = sanitized.replace(new RegExp(char, 'g'), '');
    }

    // Remove SQL keywords
    const sqlKeywords = [
      'drop', 'delete', 'insert', 'update', 'alter', 'create',
      'exec', 'execute', 'union', 'select', 'from', 'where'
    ];

    for (const keyword of sqlKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      sanitized = sanitized.replace(regex, '');
    }

    return sanitized.trim();
  }

  /**
   * Validate and sanitize pagination parameters
   */
  sanitizePagination(params) {
    const page = this.sanitizeNumber(params.page, {
      integer: true,
      min: 1,
      max: 10000
    }) || 1;

    const limit = this.sanitizeNumber(params.limit, {
      integer: true,
      min: 1,
      max: 100
    }) || 20;

    const offset = (page - 1) * limit;

    return { page, limit, offset };
  }

  /**
   * Sanitize sort parameters
   */
  sanitizeSort(sort, allowedFields = []) {
    if (!sort || typeof sort !== 'string') {
      return null;
    }

    const [field, order] = sort.split(':');

    // Sanitize field name
    const cleanField = this.sanitizeString(field, {
      maxLength: 50,
      removeDangerous: true
    });

    // Check if field is allowed
    if (!allowedFields.includes(cleanField)) {
      return null;
    }

    // Validate order
    const cleanOrder = order && order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    return { field: cleanField, order: cleanOrder };
  }

  /**
   * Detect potential attack patterns
   */
  detectAttack(input) {
    if (!input || typeof input !== 'string') {
      return null;
    }

    const attacks = [];

    // XSS detection
    if (/<script|javascript:|on\w+=/i.test(input)) {
      attacks.push({ type: 'XSS', severity: 'high' });
    }

    // SQL injection detection
    if (/union\s+select|drop\s+table|insert\s+into|delete\s+from/i.test(input)) {
      attacks.push({ type: 'SQL_INJECTION', severity: 'critical' });
    }

    // Path traversal detection
    if (/\.\.[/\\]|~[/\\]/i.test(input)) {
      attacks.push({ type: 'PATH_TRAVERSAL', severity: 'high' });
    }

    // Command injection detection
    if (/[;&|`$(){}[\]<>]/i.test(input)) {
      attacks.push({ type: 'COMMAND_INJECTION', severity: 'high' });
    }

    if (attacks.length > 0) {
      logger.warn('[Sanitizer] Potential attack detected', {
        attacks,
        input: input.substring(0, 100)
      });

      return attacks;
    }

    return null;
  }

  /**
   * Deep sanitize nested object
   */
  deepSanitize(obj, maxDepth = 5, currentDepth = 0) {
    if (currentDepth > maxDepth) {
      logger.warn('[Sanitizer] Max depth exceeded in deep sanitize');
      return null;
    }

    if (obj === null || obj === undefined) {
      return null;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number') {
      return isFinite(obj) ? obj : null;
    }

    if (typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj
        .map(item => this.deepSanitize(item, maxDepth, currentDepth + 1))
        .filter(item => item !== null);
    }

    if (typeof obj === 'object') {
      const sanitized = {};

      for (const [key, value] of Object.entries(obj)) {
        const cleanKey = this.sanitizeString(key, { maxLength: 100 });
        if (cleanKey) {
          const cleanValue = this.deepSanitize(value, maxDepth, currentDepth + 1);
          if (cleanValue !== null) {
            sanitized[cleanKey] = cleanValue;
          }
        }
      }

      return sanitized;
    }

    return null;
  }
}

// Singleton instance
const inputSanitizer = new InputSanitizer();

module.exports = {
  InputSanitizer,
  inputSanitizer
};
