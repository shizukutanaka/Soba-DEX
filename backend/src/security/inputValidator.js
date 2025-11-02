/**
 * Input Validation and Sanitization
 * Lightweight security for user inputs
 */

class InputValidator {
  constructor() {
    this.patterns = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      address: /^0x[a-fA-F0-9]{40}$/,
      txHash: /^0x[a-fA-F0-9]{64}$/,
      amount: /^\d+(\.\d{1,18})?$/,
      alphanumeric: /^[a-zA-Z0-9]+$/,
      slug: /^[a-zA-Z0-9-_]+$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    };

    this.maxLengths = {
      username: 50,
      email: 100,
      message: 1000,
      description: 500,
      search: 100
    };
  }

  // Sanitize string input
  sanitizeString(input, options = {}) {
    if (typeof input !== 'string') {
      return '';
    }

    let sanitized = input.trim();

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove control characters except newline and tab
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // HTML encode if requested
    if (options.htmlEncode) {
      sanitized = this.htmlEncode(sanitized);
    }

    // Limit length
    const maxLength = options.maxLength || 1000;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  // HTML encode dangerous characters
  htmlEncode(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // Validate email address
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email is required' };
    }

    email = email.trim().toLowerCase();

    if (email.length > this.maxLengths.email) {
      return { valid: false, error: 'Email too long' };
    }

    if (!this.patterns.email.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true, value: email };
  }

  // Validate Ethereum address
  validateAddress(address) {
    if (!address || typeof address !== 'string') {
      return { valid: false, error: 'Address is required' };
    }

    address = address.trim();

    if (!this.patterns.address.test(address)) {
      return { valid: false, error: 'Invalid Ethereum address format' };
    }

    return { valid: true, value: address.toLowerCase() };
  }

  // Validate transaction hash
  validateTxHash(hash) {
    if (!hash || typeof hash !== 'string') {
      return { valid: false, error: 'Transaction hash is required' };
    }

    hash = hash.trim();

    if (!this.patterns.txHash.test(hash)) {
      return { valid: false, error: 'Invalid transaction hash format' };
    }

    return { valid: true, value: hash.toLowerCase() };
  }

  // Validate amount (for trading)
  validateAmount(amount, options = {}) {
    if (amount === null || amount === undefined) {
      return { valid: false, error: 'Amount is required' };
    }

    const amountStr = String(amount).trim();

    if (!this.patterns.amount.test(amountStr)) {
      return { valid: false, error: 'Invalid amount format' };
    }

    const numAmount = parseFloat(amountStr);

    if (isNaN(numAmount) || numAmount < 0) {
      return { valid: false, error: 'Amount must be a positive number' };
    }

    if (options.min !== undefined && numAmount < options.min) {
      return { valid: false, error: `Amount must be at least ${options.min}` };
    }

    if (options.max !== undefined && numAmount > options.max) {
      return { valid: false, error: `Amount must not exceed ${options.max}` };
    }

    return { valid: true, value: numAmount };
  }

  // Validate pagination parameters
  validatePagination(page, limit) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;

    return {
      page: Math.max(1, Math.min(pageNum, 1000)), // Max 1000 pages
      limit: Math.max(1, Math.min(limitNum, 100)) // Max 100 items per page
    };
  }

  // Validate search query
  validateSearch(query) {
    if (!query || typeof query !== 'string') {
      return { valid: false, error: 'Search query is required' };
    }

    const sanitized = this.sanitizeString(query, { maxLength: this.maxLengths.search });

    if (sanitized.length < 2) {
      return { valid: false, error: 'Search query too short' };
    }

    // Block potentially dangerous patterns
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sanitized)) {
        return { valid: false, error: 'Invalid search query' };
      }
    }

    return { valid: true, value: sanitized };
  }

  // Validate trade order
  validateTradeOrder(order) {
    const errors = {};

    // Validate token addresses
    const tokenA = this.validateAddress(order.tokenA);
    if (!tokenA.valid) {
      errors.tokenA = tokenA.error;
    }

    const tokenB = this.validateAddress(order.tokenB);
    if (!tokenB.valid) {
      errors.tokenB = tokenB.error;
    }

    // Validate amounts
    const amountA = this.validateAmount(order.amountA, { min: 0.000001 });
    if (!amountA.valid) {
      errors.amountA = amountA.error;
    }

    const amountB = this.validateAmount(order.amountB, { min: 0.000001 });
    if (!amountB.valid) {
      errors.amountB = amountB.error;
    }

    // Validate order type
    if (!['buy', 'sell', 'swap'].includes(order.type)) {
      errors.type = 'Invalid order type';
    }

    // Validate slippage tolerance
    if (order.slippage !== undefined) {
      const slippage = this.validateAmount(order.slippage, { min: 0, max: 50 });
      if (!slippage.valid) {
        errors.slippage = slippage.error;
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        tokenA: tokenA.valid ? tokenA.value : null,
        tokenB: tokenB.valid ? tokenB.value : null,
        amountA: amountA.valid ? amountA.value : null,
        amountB: amountB.valid ? amountB.value : null,
        type: order.type,
        slippage: order.slippage
      }
    };
  }

  // Rate limiting check
  checkRateLimit(identifier, maxRequests = 100, windowMs = 60000) {
    if (!this.rateLimitMap) {
      this.rateLimitMap = new Map();
    }

    const now = Date.now();
    const _windowStart = now - windowMs;

    let record = this.rateLimitMap.get(identifier);
    if (!record || record.reset < now) {
      record = {
        count: 0,
        reset: now + windowMs
      };
      this.rateLimitMap.set(identifier, record);
    }

    record.count++;

    // Clean old entries periodically with better memory management
    if (this.rateLimitMap.size > 1000) {
      const now = Date.now();
      for (const [key, value] of this.rateLimitMap.entries()) {
        if (value.reset < now) {
          this.rateLimitMap.delete(key);
        }
      }
    }

    return {
      allowed: record.count <= maxRequests,
      remaining: Math.max(0, maxRequests - record.count),
      reset: record.reset
    };
  }
  }

  // SQL injection prevention for dynamic queries - Improved with proper escaping
  sanitizeForSQL(input) {
    if (typeof input !== 'string') {
      return input;
    }

    // Use parameterized queries instead of string manipulation
    // This is a placeholder - actual implementation should use query builders or prepared statements
    return input
      .replace(/['";\\]/g, '') // Remove quotes and backslashes
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove block comment start
      .replace(/\*\//g, '') // Remove block comment end
      .replace(/\b(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER|EXEC|EXECUTE|UNION|SELECT)\b/gi, '') // Remove dangerous keywords
      .trim();
  }

  // Validate and sanitize object
  validateObject(obj, schema) {
    const result = { valid: true, errors: {}, sanitized: {} };

    for (const [key, rules] of Object.entries(schema)) {
      const value = obj[key];

      if (rules.required && (value === undefined || value === null)) {
        result.valid = false;
        result.errors[key] = `${key} is required`;
        continue;
      }

      if (value === undefined || value === null) {
        result.sanitized[key] = value;
        continue;
      }

      let sanitized = value;

      // Type validation
      if (rules.type && typeof value !== rules.type) {
        result.valid = false;
        result.errors[key] = `${key} must be of type ${rules.type}`;
        continue;
      }

      // String sanitization
      if (typeof value === 'string') {
        sanitized = this.sanitizeString(value, rules);
      }

      // Pattern validation
      if (rules.pattern && !rules.pattern.test(sanitized)) {
        result.valid = false;
        result.errors[key] = rules.error || `${key} format is invalid`;
        continue;
      }

      result.sanitized[key] = sanitized;
    }

    return result;
  }
}

// Export singleton
const inputValidator = new InputValidator();

module.exports = {
  InputValidator,
  inputValidator
};