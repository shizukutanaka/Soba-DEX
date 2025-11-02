/**
 * Environment Variables Validator
 * Validates required environment variables on startup
 */

class EnvValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  // Validate required variables
  required(name, description = '') {
    if (!process.env[name]) {
      this.errors.push({
        variable: name,
        message: `${name} is required`,
        description
      });
      return null;
    }
    return process.env[name];
  }

  // Validate optional but recommended variables
  recommended(name, description = '') {
    if (!process.env[name]) {
      this.warnings.push({
        variable: name,
        message: `${name} is recommended for production`,
        description
      });
      return null;
    }
    return process.env[name];
  }

  // Validate number
  number(name, options = {}) {
    const value = process.env[name];

    if (!value && !options.optional) {
      this.errors.push({
        variable: name,
        message: `${name} is required`,
        description: options.description || ''
      });
      return null;
    }

    if (!value) {
      return options.default;
    }

    const num = parseInt(value, 10);

    if (isNaN(num)) {
      this.errors.push({
        variable: name,
        message: `${name} must be a valid number`,
        value
      });
      return options.default;
    }

    if (options.min !== undefined && num < options.min) {
      this.errors.push({
        variable: name,
        message: `${name} must be at least ${options.min}`,
        value: num
      });
      return options.default;
    }

    if (options.max !== undefined && num > options.max) {
      this.errors.push({
        variable: name,
        message: `${name} must be at most ${options.max}`,
        value: num
      });
      return options.default;
    }

    return num;
  }

  // Validate enum
  enum(name, allowedValues, options = {}) {
    const value = process.env[name];

    if (!value && !options.optional) {
      this.errors.push({
        variable: name,
        message: `${name} is required`,
        description: options.description || ''
      });
      return null;
    }

    if (!value) {
      return options.default;
    }

    if (!allowedValues.includes(value)) {
      this.errors.push({
        variable: name,
        message: `${name} must be one of: ${allowedValues.join(', ')}`,
        value
      });
      return options.default;
    }

    return value;
  }

  // Validate URL
  url(name, options = {}) {
    const value = process.env[name];

    if (!value && !options.optional) {
      this.errors.push({
        variable: name,
        message: `${name} is required`,
        description: options.description || ''
      });
      return null;
    }

    if (!value) {
      return options.default;
    }

    try {
      new URL(value);
      return value;
    } catch (_error) {
      this.errors.push({
        variable: name,
        message: `${name} must be a valid URL`,
        value
      });
      return options.default;
    }
  }

  // Validate boolean
  boolean(name, options = {}) {
    const value = process.env[name];

    if (!value && !options.optional) {
      return options.default || false;
    }

    if (!value) {
      return options.default || false;
    }

    const lowerValue = value.toLowerCase();
    return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
  }

  // Validate string length
  string(name, options = {}) {
    const value = process.env[name];

    if (!value && !options.optional) {
      this.errors.push({
        variable: name,
        message: `${name} is required`,
        description: options.description || ''
      });
      return null;
    }

    if (!value) {
      return options.default;
    }

    if (options.minLength && value.length < options.minLength) {
      this.errors.push({
        variable: name,
        message: `${name} must be at least ${options.minLength} characters`,
        length: value.length
      });
      return options.default;
    }

    if (options.maxLength && value.length > options.maxLength) {
      this.errors.push({
        variable: name,
        message: `${name} must be at most ${options.maxLength} characters`,
        length: value.length
      });
      return options.default;
    }

    if (options.pattern && !new RegExp(options.pattern).test(value)) {
      this.errors.push({
        variable: name,
        message: `${name} does not match required pattern`,
        pattern: options.pattern
      });
      return options.default;
    }

    return value;
  }

  // Get validation results
  getResults() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      hasErrors: this.errors.length > 0,
      hasWarnings: this.warnings.length > 0
    };
  }

  // Throw if validation failed
  throwIfInvalid() {
    if (this.errors.length > 0) {
      const errorMessages = this.errors.map(e =>
        `  - ${e.variable}: ${e.message}${e.value ? ` (got: ${e.value})` : ''}`
      ).join('\n');

      throw new Error(`Environment validation failed:\n${errorMessages}`);
    }
  }

  // Validate security secrets
  secret(name, options = {}) {
    const value = process.env[name];

    if (!value && !options.optional) {
      this.errors.push({
        variable: name,
        message: `${name} is required for security`,
        description: options.description || 'This secret is required for application security'
      });
      return null;
    }

    if (!value) {
      return options.default;
    }

    // Check minimum length
    const minLength = options.minLength || 32;
    if (value.length < minLength) {
      this.errors.push({
        variable: name,
        message: `${name} must be at least ${minLength} characters long`,
        length: value.length
      });
    }

    // Check for placeholder values
    if (value.includes('your-') || value.includes('change-this') || value.includes('replace-this') || value.includes('placeholder')) {
      this.errors.push({
        variable: name,
        message: `${name} contains placeholder text - must be changed for production`,
        value: value.substring(0, 20) + '...'
      });
    }

    // Check for weak patterns
    if (this.isWeakSecret(value)) {
      this.errors.push({
        variable: name,
        message: `${name} appears to be weak or predictable`,
        description: 'Use a cryptographically secure random string'
      });
    }

    return value;
  }

  // Validate CORS origins
  corsOrigins(name = 'CORS_ORIGINS', options = {}) {
    const value = process.env[name] || process.env.ALLOWED_ORIGINS;

    if (!value && !options.optional) {
      this.errors.push({
        variable: name,
        message: `${name} is required for CORS configuration`,
        description: 'Define allowed origins to prevent unauthorized access'
      });
      return null;
    }

    if (!value) {
      return options.default;
    }

    const origins = value.split(',').map(o => o.trim());
    const isProduction = process.env.NODE_ENV === 'production';

    // Check for wildcard in production
    const hasWildcard = origins.some(o => o === '*' || o.includes('*'));
    if (hasWildcard && isProduction) {
      this.errors.push({
        variable: name,
        message: 'Wildcard (*) origins not allowed in production',
        description: 'Specify exact domains for security'
      });
    }

    // Check for localhost in production
    if (isProduction) {
      const hasLocalhost = origins.some(o => o.includes('localhost') || o.includes('127.0.0.1') || o.includes('0.0.0.0'));
      if (hasLocalhost) {
        this.warnings.push({
          variable: name,
          message: 'Localhost origins found in production configuration',
          description: 'Remove localhost origins for production deployment'
        });
      }
    }

    // Validate URL format
    origins.forEach(origin => {
      try {
        if (origin !== '*') {
          new URL(origin);
        }
      } catch (_error) {
        this.errors.push({
          variable: name,
          message: `Invalid origin format: ${origin}`,
          description: 'Origins must be valid URLs or *'
        });
      }
    });

    return origins;
  }

  // Validate production readiness
  validateProductionReadiness() {
    const isProduction = process.env.NODE_ENV === 'production';

    if (!isProduction) {
      return; // Skip production checks in development
    }

    // HTTPS enforcement
    if (process.env.ENFORCE_HTTPS !== 'true') {
      this.warnings.push({
        variable: 'ENFORCE_HTTPS',
        message: 'HTTPS enforcement not enabled in production',
        description: 'Set ENFORCE_HTTPS=true for production security'
      });
    }

    // Database security
    const dbHost = process.env.DB_HOST;
    if (dbHost && (dbHost.includes('localhost') || dbHost.includes('127.0.0.1'))) {
      this.errors.push({
        variable: 'DB_HOST',
        message: 'Localhost database configuration not allowed in production',
        description: 'Use production database host'
      });
    }

    // Redis security
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl && redisUrl.includes('localhost')) {
      this.warnings.push({
        variable: 'REDIS_URL',
        message: 'Localhost Redis configuration found in production',
        description: 'Use production Redis instance'
      });
    }

    // Rate limiting
    const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '100');
    if (rateLimitMax > 1000) {
      this.warnings.push({
        variable: 'RATE_LIMIT_MAX',
        message: 'Rate limit is very high',
        description: 'Consider reducing for better security'
      });
    }
  }

  // Check if secret is weak
  isWeakSecret(secret) {
    const weakPatterns = [
      /^password$/i,
      /^123456/,
      /^admin$/i,
      /^root$/i,
      /^secret$/i,
      /^token$/i,
      /^key$/i,
      /^test/i,
      /^demo/i,
      /^example/i
    ];

    return weakPatterns.some(pattern => pattern.test(secret)) ||
           secret.length < 16 ||
           !/[A-Z]/.test(secret) ||
           !/[a-z]/.test(secret) ||
           !/[0-9]/.test(secret);
  }
}

module.exports = { EnvValidator };
