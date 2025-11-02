const Joi = require('joi');
const validator = require('validator');
const { sanitize } = require('dompurify');

class EnterpriseValidation {
  constructor() {
    // Custom validation rules
    this.customValidators = new Map();
    this.sanitizers = new Map();

    // Security configurations
    this.securityConfig = {
      maxStringLength: 10000,
      maxArrayLength: 1000,
      maxObjectDepth: 10,
      allowedImageFormats: ['jpeg', 'jpg', 'png', 'webp'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      blockedPatterns: [
        /(<script[\s\S]*?>[\s\S]*?<\/script>)/gi,
        /(javascript:)/gi,
        /(vbscript:)/gi,
        /(onload\s*=)/gi,
        /(onerror\s*=)/gi,
        /(<iframe[\s\S]*?>[\s\S]*?<\/iframe>)/gi
      ]
    };

    this.initializeCustomValidators();
    this.initializeSanitizers();
  }

  // Trading-specific validation schemas
  getOrderValidationSchema() {
    return Joi.object({
      symbol: Joi.string()
        .pattern(/^[A-Z]{3,6}-[A-Z]{3,6}$/)
        .required()
        .description('Trading pair symbol (e.g., BTC-USD)'),

      side: Joi.string()
        .valid('buy', 'sell')
        .required()
        .description('Order side'),

      type: Joi.string()
        .valid('market', 'limit', 'stop', 'stop_limit', 'trailing_stop')
        .required()
        .description('Order type'),

      quantity: Joi.number()
        .positive()
        .precision(8)
        .max(1000000000)
        .required()
        .description('Order quantity'),

      price: Joi.when('type', {
        is: Joi.string().valid('limit', 'stop_limit'),
        then: Joi.number().positive().precision(8).required(),
        otherwise: Joi.number().positive().precision(8).optional()
      }),

      stopPrice: Joi.when('type', {
        is: Joi.string().valid('stop', 'stop_limit', 'trailing_stop'),
        then: Joi.number().positive().precision(8).required(),
        otherwise: Joi.forbidden()
      }),

      timeInForce: Joi.string()
        .valid('GTC', 'IOC', 'FOK', 'GTD')
        .default('GTC'),

      clientOrderId: Joi.string()
        .max(64)
        .pattern(/^[a-zA-Z0-9_-]+$/)
        .optional(),

      reduceOnly: Joi.boolean().default(false),

      postOnly: Joi.boolean().default(false)
    });
  }

  getUserValidationSchema() {
    return Joi.object({
      email: Joi.string()
        .email({ minDomainSegments: 2 })
        .max(254)
        .required()
        .custom(this.customValidators.get('businessEmail')),

      password: Joi.string()
        .min(12)
        .max(128)
        .required()
        .custom(this.customValidators.get('strongPassword')),

      firstName: Joi.string()
        .min(1)
        .max(50)
        .pattern(/^[a-zA-Z\s-']+$/)
        .required(),

      lastName: Joi.string()
        .min(1)
        .max(50)
        .pattern(/^[a-zA-Z\s-']+$/)
        .required(),

      phone: Joi.string()
        .pattern(/^\+[1-9]\d{10,14}$/)
        .required(),

      dateOfBirth: Joi.date()
        .max('now')
        .min('1900-01-01')
        .required(),

      nationality: Joi.string()
        .length(2)
        .pattern(/^[A-Z]{2}$/)
        .required(),

      address: Joi.object({
        street: Joi.string().max(100).required(),
        city: Joi.string().max(50).required(),
        state: Joi.string().max(50).required(),
        postalCode: Joi.string().max(20).required(),
        country: Joi.string().length(2).pattern(/^[A-Z]{2}$/).required()
      }).required(),

      kycLevel: Joi.string()
        .valid('basic', 'intermediate', 'advanced')
        .default('basic'),

      riskProfile: Joi.string()
        .valid('conservative', 'moderate', 'aggressive')
        .default('conservative'),

      institutionType: Joi.string()
        .valid('individual', 'corporation', 'trust', 'foundation')
        .default('individual'),

      source_of_funds: Joi.string()
        .valid('salary', 'business', 'investment', 'inheritance', 'other')
        .required(),

      annual_income: Joi.number()
        .min(0)
        .max(1000000000)
        .required(),

      net_worth: Joi.number()
        .min(0)
        .max(10000000000)
        .required(),

      trading_experience: Joi.string()
        .valid('none', 'beginner', 'intermediate', 'advanced', 'professional')
        .required(),

      consent: Joi.object({
        terms: Joi.boolean().valid(true).required(),
        privacy: Joi.boolean().valid(true).required(),
        marketing: Joi.boolean().default(false),
        dataProcessing: Joi.boolean().valid(true).required()
      }).required()
    });
  }

  getWithdrawalValidationSchema() {
    return Joi.object({
      currency: Joi.string()
        .length(3)
        .pattern(/^[A-Z]{3}$/)
        .required(),

      amount: Joi.number()
        .positive()
        .precision(8)
        .max(1000000)
        .required(),

      destination: Joi.object({
        type: Joi.string().valid('crypto', 'bank', 'wire').required(),
        address: Joi.when('type', {
          is: 'crypto',
          then: Joi.string().custom(this.customValidators.get('cryptoAddress')).required(),
          otherwise: Joi.forbidden()
        }),
        bankAccount: Joi.when('type', {
          is: Joi.string().valid('bank', 'wire'),
          then: Joi.object({
            accountNumber: Joi.string().required(),
            routingNumber: Joi.string().required(),
            bankName: Joi.string().required(),
            accountHolder: Joi.string().required()
          }).required(),
          otherwise: Joi.forbidden()
        })
      }).required(),

      memo: Joi.string().max(500).optional(),

      twoFactorCode: Joi.string()
        .pattern(/^\d{6}$/)
        .required()
    });
  }

  getComplianceValidationSchema() {
    return Joi.object({
      reportType: Joi.string()
        .valid('SAR', 'CTR', 'FBAR', 'AML', 'KYC', 'TRANSACTION_SURVEILLANCE')
        .required(),

      jurisdiction: Joi.string()
        .valid('US', 'EU', 'UK', 'CA', 'AU', 'SG', 'JP')
        .required(),

      dateRange: Joi.object({
        start: Joi.date().required(),
        end: Joi.date().min(Joi.ref('start')).required()
      }).required(),

      filters: Joi.object({
        minAmount: Joi.number().min(0).optional(),
        maxAmount: Joi.number().min(Joi.ref('minAmount')).optional(),
        currencies: Joi.array().items(Joi.string().length(3)).optional(),
        userTypes: Joi.array().items(Joi.string().valid('individual', 'corporate')).optional()
      }).optional(),

      format: Joi.string()
        .valid('JSON', 'XML', 'CSV', 'PDF')
        .default('JSON'),

      encryption: Joi.boolean().default(true)
    });
  }

  // Custom validation functions
  initializeCustomValidators() {
    // Strong password validation
    this.customValidators.set('strongPassword', (value, helpers) => {
      const hasUpper = /[A-Z]/.test(value);
      const hasLower = /[a-z]/.test(value);
      const hasNumbers = /\d/.test(value);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);
      const hasNoSequence = !/(.)\1{2,}/.test(value); // No 3+ repeated chars
      const hasNoCommonWords = !this.containsCommonWords(value);

      if (!hasUpper || !hasLower || !hasNumbers || !hasSpecial) {
        return helpers.error('password.complexity');
      }

      if (!hasNoSequence) {
        return helpers.error('password.sequence');
      }

      if (!hasNoCommonWords) {
        return helpers.error('password.common');
      }

      return value;
    });

    // Business email validation
    this.customValidators.set('businessEmail', (value, helpers) => {
      const freeProviders = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'
      ];

      const domain = value.split('@')[1]?.toLowerCase();
      if (freeProviders.includes(domain)) {
        return helpers.error('email.business');
      }

      return value;
    });

    // Crypto address validation
    this.customValidators.set('cryptoAddress', (value, helpers) => {
      // Bitcoin address validation
      if (value.match(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/) || // Legacy
          value.match(/^bc1[a-z0-9]{39,59}$/)) { // Bech32
        return value;
      }

      // Ethereum address validation
      if (value.match(/^0x[a-fA-F0-9]{40}$/)) {
        return value;
      }

      // Add more crypto address validations as needed
      return helpers.error('crypto.invalidAddress');
    });

    // Phone number validation with country codes
    this.customValidators.set('internationalPhone', (value, helpers) => {
      if (!validator.isMobilePhone(value, 'any', { strictMode: true })) {
        return helpers.error('phone.invalid');
      }
      return value;
    });

    // IP address validation (including private ranges for security)
    this.customValidators.set('publicIP', (value, helpers) => {
      if (!validator.isIP(value)) {
        return helpers.error('ip.invalid');
      }

      // Block private IP ranges for security
      const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^127\./,
        /^169\.254\./
      ];

      if (privateRanges.some(range => range.test(value))) {
        return helpers.error('ip.private');
      }

      return value;
    });
  }

  // Sanitization functions
  initializeSanitizers() {
    // HTML sanitization
    this.sanitizers.set('html', (value) => {
      return sanitize(value, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      });
    });

    // SQL injection prevention
    this.sanitizers.set('sql', (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      return value
        .replace(/'/g, "''")
        .replace(/;/g, '')
        .replace(/--/g, '')
        .replace(/\/\*/g, '')
        .replace(/\*\//g, '')
        .replace(/xp_/gi, '')
        .replace(/sp_/gi, '')
        .replace(/(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|SELECT|UNION|UPDATE)\b)/gi, '');
    });

    // XSS prevention
    this.sanitizers.set('xss', (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/onload\s*=/gi, '')
        .replace(/onerror\s*=/gi, '');
    });

    // File path sanitization
    this.sanitizers.set('filePath', (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      return value
        .replace(/\.\./g, '')
        .replace(/[<>:"|?*]/g, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    });

    // Currency amount sanitization
    this.sanitizers.set('currency', (value) => {
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value !== 'string') {
        return 0;
      }

      const cleaned = value.replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : Math.round(parsed * 100000000) / 100000000; // 8 decimal precision
    });
  }

  // Advanced validation with sanitization
  async validateAndSanitize(data, schema, options = {}) {
    try {
      // Pre-validation sanitization
      const sanitizedData = this.applySanitization(data, options.sanitizers || []);

      // Security checks
      this.performSecurityChecks(sanitizedData);

      // Schema validation
      const { error, value } = schema.validate(sanitizedData, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
        ...options.joiOptions
      });

      if (error) {
        const validationError = new Error('Validation failed');
        validationError.details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type,
          value: detail.context?.value
        }));
        throw validationError;
      }

      return value;

    } catch (error) {
      if (error.details) {
        throw error; // Re-throw validation errors
      }

      // Wrap other errors
      const wrappedError = new Error('Validation processing failed');
      wrappedError.originalError = error;
      throw wrappedError;
    }
  }

  applySanitization(data, sanitizers = []) {
    if (!Array.isArray(sanitizers) || sanitizers.length === 0) {
      return data;
    }

    const sanitized = JSON.parse(JSON.stringify(data)); // Deep clone

    const applySanitizers = (obj) => {
      if (typeof obj === 'string') {
        let result = obj;
        sanitizers.forEach(sanitizer => {
          const sanitizerFn = this.sanitizers.get(sanitizer);
          if (sanitizerFn) {
            result = sanitizerFn(result);
          }
        });
        return result;
      }

      if (Array.isArray(obj)) {
        return obj.map(applySanitizers);
      }

      if (obj && typeof obj === 'object') {
        const sanitizedObj = {};
        Object.keys(obj).forEach(key => {
          sanitizedObj[key] = applySanitizers(obj[key]);
        });
        return sanitizedObj;
      }

      return obj;
    };

    return applySanitizers(sanitized);
  }

  performSecurityChecks(data) {
    const checkValue = (value, path = '') => {
      if (typeof value === 'string') {
        // Check string length
        if (value.length > this.securityConfig.maxStringLength) {
          throw new Error(`String too long at ${path}: ${value.length} characters`);
        }

        // Check for malicious patterns
        this.securityConfig.blockedPatterns.forEach(pattern => {
          if (pattern.test(value)) {
            throw new Error(`Blocked pattern detected at ${path}`);
          }
        });
      }

      if (Array.isArray(value)) {
        if (value.length > this.securityConfig.maxArrayLength) {
          throw new Error(`Array too long at ${path}: ${value.length} items`);
        }
        value.forEach((item, index) => {
          checkValue(item, `${path}[${index}]`);
        });
      }

      if (value && typeof value === 'object') {
        const depth = path.split('.').length;
        if (depth > this.securityConfig.maxObjectDepth) {
          throw new Error(`Object nesting too deep at ${path}`);
        }

        Object.keys(value).forEach(key => {
          checkValue(value[key], path ? `${path}.${key}` : key);
        });
      }
    };

    checkValue(data);
  }

  // File validation
  validateFile(file, options = {}) {
    const config = {
      maxSize: options.maxSize || this.securityConfig.maxFileSize,
      allowedTypes: options.allowedTypes || this.securityConfig.allowedImageFormats,
      allowExecutables: options.allowExecutables || false
    };

    const errors = [];

    // Size check
    if (file.size > config.maxSize) {
      errors.push(`File size ${file.size} exceeds maximum ${config.maxSize}`);
    }

    // Type check
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!config.allowedTypes.includes(fileExtension)) {
      errors.push(`File type ${fileExtension} not allowed`);
    }

    // Executable check
    const executableExtensions = ['exe', 'bat', 'cmd', 'com', 'scr', 'pif', 'jar'];
    if (!config.allowExecutables && executableExtensions.includes(fileExtension)) {
      errors.push(`Executable files not allowed: ${fileExtension}`);
    }

    // MIME type check
    if (file.mimetype && !this.isValidMimeType(file.mimetype, fileExtension)) {
      errors.push(`MIME type ${file.mimetype} doesn't match file extension ${fileExtension}`);
    }

    if (errors.length > 0) {
      const error = new Error('File validation failed');
      error.details = errors;
      throw error;
    }

    return true;
  }

  isValidMimeType(mimeType, extension) {
    const mimeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'csv': 'text/csv'
    };

    return mimeMap[extension] === mimeType;
  }

  // Utility functions
  containsCommonWords(password) {
    const commonWords = [
      'password', 'admin', 'user', 'login', 'welcome',
      'qwerty', 'abc123', '123456', 'password123',
      'admin123', 'root', 'toor', 'test', 'guest'
    ];

    return commonWords.some(word =>
      password.toLowerCase().includes(word.toLowerCase())
    );
  }

  // Rate limiting validation
  validateRateLimit(identifier, action, _windowMs = 60000, maxAttempts = 100) {
    // This would integrate with Redis or in-memory store
    // Implementation depends on your rate limiting strategy

    const _key = `rate_limit:${identifier}:${action}`;
    // Check current rate limit status
    // Return true if allowed, false if rate limited

    return { allowed: true, remaining: maxAttempts - 1 };
  }

  // Batch validation
  async validateBatch(items, schema, options = {}) {
    const results = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const validated = await this.validateAndSanitize(items[i], schema, options);
        results.push({ index: i, data: validated, success: true });
      } catch (error) {
        errors.push({ index: i, error: error.message, details: error.details });
        results.push({ index: i, success: false, error: error.message });
      }
    }

    return {
      results,
      errors,
      successful: results.filter(r => r.success).length,
      failed: errors.length
    };
  }

  // Custom error messages
  getCustomErrorMessages() {
    return {
      'password.complexity': 'Password must contain uppercase, lowercase, numbers, and special characters',
      'password.sequence': 'Password cannot contain repeated character sequences',
      'password.common': 'Password cannot contain common words',
      'email.business': 'Business email address required',
      'crypto.invalidAddress': 'Invalid cryptocurrency address format',
      'phone.invalid': 'Invalid international phone number format',
      'ip.invalid': 'Invalid IP address format',
      'ip.private': 'Private IP addresses not allowed'
    };
  }

  // Performance optimization for large datasets
  createOptimizedValidator(schema, options = {}) {
    const compiledSchema = schema.compile ? schema.compile() : schema;

    return (data) => {
      const startTime = Date.now();

      try {
        const result = this.validateAndSanitize(data, compiledSchema, options);
        const duration = Date.now() - startTime;

        if (duration > 100) { // Log slow validations
          console.warn(`Slow validation detected: ${duration}ms`);
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        error.validationDuration = duration;
        throw error;
      }
    };
  }
}

// Create singleton instance
const enterpriseValidation = new EnterpriseValidation();

module.exports = enterpriseValidation;