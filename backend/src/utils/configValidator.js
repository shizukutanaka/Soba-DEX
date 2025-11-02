const { parseAndValidateOrigins } = require('./originUtils');
const { featureManager } = require('../config/features');

// Configuration validator for production environment

class ConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  validateApiKeyTtl() {
    const rawTtl = process.env.API_KEY_TTL_MS;
    const parsedTtl = this.safeParseInt(rawTtl);
    const minimumTtl = 60 * 60 * 1000; // 1 hour
    const maximumTtl = 365 * 24 * 60 * 60 * 1000; // 365 days

    if (parsedTtl === null) {
      this.warnings.push({
        field: 'API_KEY_TTL_MS',
        message: 'API_KEY_TTL_MS is not set; using secure default of 90 days',
        severity: 'warning'
      });
      return;
    }

    if (parsedTtl < minimumTtl || parsedTtl > maximumTtl) {
      this.errors.push({
        field: 'API_KEY_TTL_MS',
        message: `API_KEY_TTL_MS must be between ${minimumTtl} (1 hour) and ${maximumTtl} (365 days) milliseconds`,
        severity: 'error',
        currentValue: parsedTtl
      });
    }
  }

  validateHmacSecret(secret) {
    if (secret.length < 32) {
      this.errors.push({
        field: 'API_KEY_HMAC_SECRET',
        message: 'API_KEY_HMAC_SECRET must be at least 32 characters long',
        severity: 'error',
        currentLength: secret.length
      });
    }

    if (/^[a-z0-9]+$/i.test(secret)) {
      this.errors.push({
        field: 'API_KEY_HMAC_SECRET',
        message: 'API_KEY_HMAC_SECRET should contain non-alphanumeric characters to increase entropy',
        severity: 'error'
      });
    }

    const uniqueChars = new Set(secret).size;
    if (uniqueChars < 10) {
      this.warnings.push({
        field: 'API_KEY_HMAC_SECRET',
        message: 'API_KEY_HMAC_SECRET may not have sufficient randomness',
        severity: 'warning',
        uniqueCharacters: uniqueChars
      });
    }
  }

  validateRateLimiting() {
    const windowMs = this.safeParseInt(process.env.RATE_LIMIT_WINDOW_MS);
    const maxRequests = this.safeParseInt(process.env.RATE_LIMIT_MAX);

    if (windowMs !== null) {
      if (windowMs < 1000 || windowMs > 3600000) {
        this.errors.push({
          field: 'RATE_LIMIT_WINDOW_MS',
          message: 'RATE_LIMIT_WINDOW_MS must be between 1000 and 3600000 milliseconds',
          severity: 'error',
          currentValue: windowMs
        });
      }
    }

    if (maxRequests !== null) {
      if (maxRequests < 1 || maxRequests > 10000) {
        this.errors.push({
          field: 'RATE_LIMIT_MAX',
          message: 'RATE_LIMIT_MAX must be between 1 and 10000',
          severity: 'error',
          currentValue: maxRequests
        });
      }
    }
  }

  validateBodyLimits() {
    const limitBytes = this.safeParseInt(process.env.REQUEST_BODY_LIMIT_BYTES);

    if (limitBytes !== null) {
      if (limitBytes < 1024 || limitBytes > 1024 * 1024) {
        this.errors.push({
          field: 'REQUEST_BODY_LIMIT_BYTES',
          message: 'REQUEST_BODY_LIMIT_BYTES must be between 1024 and 1048576 bytes',
          severity: 'error',
          currentValue: limitBytes
        });
      }
    }
  }

  validateHttpsEnforcement() {
    const rawValue = process.env.ENFORCE_HTTPS;
    const parsed = this.safeParseBoolean(rawValue);

    if (rawValue && parsed === null) {
      this.errors.push({
        field: 'ENFORCE_HTTPS',
        message: 'ENFORCE_HTTPS must be a boolean value (true/false)',
        severity: 'error',
        currentValue: rawValue
      });
    }

    if (process.env.NODE_ENV === 'production') {
      if (parsed === false) {
        this.errors.push({
          field: 'ENFORCE_HTTPS',
          message: 'ENFORCE_HTTPS must be enabled in production environments',
          severity: 'error'
        });
      } else if (parsed === null && rawValue === undefined) {
        this.warnings.push({
          field: 'ENFORCE_HTTPS',
          message: 'ENFORCE_HTTPS is not set; defaulting to true in production',
          severity: 'warning'
        });
      }
    }
  }

  validateFeatures() {
    const validation = featureManager.validateFeatures();

    if (validation.warnings && validation.warnings.length > 0) {
      this.warnings.push(...validation.warnings.map(w => ({
        field: 'FEATURE_FLAGS',
        message: w,
        severity: 'warning'
      })));
    }

    if (validation.errors && validation.errors.length > 0) {
      this.errors.push(...validation.errors.map(e => ({
        field: 'FEATURE_FLAGS',
        message: e,
        severity: 'error'
      })));
    }
  }

  // Validate all required configuration
  validate() {
    this.errors = [];
    this.warnings = [];

    // Required environment variables
    this.validateRequired('PORT', process.env.PORT);
    this.validateRequired('NODE_ENV', process.env.NODE_ENV);
    this.validateRequired('JWT_SECRET', process.env.JWT_SECRET);
    this.validateRequired('API_KEY_HMAC_SECRET', process.env.API_KEY_HMAC_SECRET);

    // JWT Secret strength validation
    if (process.env.JWT_SECRET) {
      this.validateJWTSecret(process.env.JWT_SECRET);
    }

    if (process.env.API_KEY_HMAC_SECRET) {
      this.validateHmacSecret(process.env.API_KEY_HMAC_SECRET);
    }

    // Node environment validation
    if (process.env.NODE_ENV) {
      this.validateNodeEnv(process.env.NODE_ENV);
    }

    // Port validation
    if (process.env.PORT) {
      this.validatePort(process.env.PORT);
    }

    // Optional but recommended
    this.validateOptional('CORS_ORIGINS', process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS);
    this.validateOptional('RATE_LIMIT_MAX', process.env.RATE_LIMIT_MAX);
    this.validateOptional('RATE_LIMIT_WINDOW_MS', process.env.RATE_LIMIT_WINDOW_MS);
    this.validateOptional('REQUEST_BODY_LIMIT_BYTES', process.env.REQUEST_BODY_LIMIT_BYTES);
    this.validateOptional('ENFORCE_HTTPS', process.env.ENFORCE_HTTPS);

    this.validateApiKeyTtl();

    // Timeout consistency checks
    this.validateTimeouts();
    this.validateRateLimiting();
    this.validateBodyLimits();
    this.validateHttpsEnforcement();

    // Feature validation
    this.validateFeatures();

    // Production-specific checks
    if (process.env.NODE_ENV === 'production') {
      this.validateProduction();
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  validateRequired(name, value) {
    if (!value) {
      this.errors.push({
        field: name,
        message: `${name} is required but not set`,
        severity: 'error'
      });
    }
  }

  validateOptional(name, value) {
    if (!value) {
      this.warnings.push({
        field: name,
        message: `${name} is not set, using default value`,
        severity: 'warning'
      });
    }
  }

  validateJWTSecret(secret) {
    if (secret.length < 32) {
      this.errors.push({
        field: 'JWT_SECRET',
        message: 'JWT_SECRET must be at least 32 characters long',
        severity: 'error',
        currentLength: secret.length
      });
    }

    // Check for common weak secrets
    const weakSecrets = [
      'secret',
      'password',
      'changeme',
      'default',
      '12345',
      'test',
      'your-secret-key'
    ];

    if (weakSecrets.some(weak => secret.toLowerCase().includes(weak))) {
      this.errors.push({
        field: 'JWT_SECRET',
        message: 'JWT_SECRET appears to be weak or contains common patterns',
        severity: 'error'
      });
    }

    // Check for sufficient randomness
    const uniqueChars = new Set(secret).size;
    if (uniqueChars < 10) {
      this.warnings.push({
        field: 'JWT_SECRET',
        message: 'JWT_SECRET may not have sufficient randomness',
        severity: 'warning',
        uniqueCharacters: uniqueChars
      });
    }
  }

  validateNodeEnv(env) {
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(env)) {
      this.errors.push({
        field: 'NODE_ENV',
        message: `NODE_ENV must be one of: ${validEnvs.join(', ')}`,
        severity: 'error',
        currentValue: env
      });
    }
  }

  validatePort(port) {
    const portNum = parseInt(port);
    if (isNaN(portNum)) {
      this.errors.push({
        field: 'PORT',
        message: 'PORT must be a valid number',
        severity: 'error',
        currentValue: port
      });
      return;
    }

    if (portNum < 1 || portNum > 65535) {
      this.errors.push({
        field: 'PORT',
        message: 'PORT must be between 1 and 65535',
        severity: 'error',
        currentValue: portNum
      });
    }

    // Warn about privileged ports
    if (portNum < 1024) {
      this.warnings.push({
        field: 'PORT',
        message: 'PORT is a privileged port (<1024), may require root access',
        severity: 'warning',
        currentValue: portNum
      });
    }
  }

  validateProduction() {
    const rawOrigins = process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || '';
    const {
      validOrigins,
      invalidOrigins
    } = parseAndValidateOrigins(rawOrigins, {
      allowHttpLocalhost: false
    });

    if (validOrigins.length === 0) {
      this.errors.push({
        field: 'CORS_ORIGINS',
        message: 'CORS_ORIGINS must contain at least one valid HTTPS origin in production',
        severity: 'error'
      });
    }

    if (rawOrigins.includes('*')) {
      this.errors.push({
        field: 'CORS_ORIGINS',
        message: 'Wildcard origins (*) are not permitted in production',
        severity: 'error'
      });
    }

    if (invalidOrigins.length > 0) {
      this.errors.push({
        field: 'CORS_ORIGINS',
        message: `CORS_ORIGINS contains invalid entries: ${invalidOrigins.join(', ')}`,
        severity: 'error'
      });
    }

    // Check for development values in production
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.includes('development')) {
      this.errors.push({
        field: 'JWT_SECRET',
        message: 'JWT_SECRET appears to contain development values',
        severity: 'error'
      });
    }

    // Warn about missing rate limiting
    if (!process.env.RATE_LIMIT_MAX) {
      this.warnings.push({
        field: 'RATE_LIMIT_MAX',
        message: 'Rate limiting not configured, using default',
        severity: 'warning'
      });
    }

    const trustHeader = this.safeParseBoolean(process.env.REQUEST_ID_TRUST_HEADER);
    if (trustHeader === true) {
      this.warnings.push({
        field: 'REQUEST_ID_TRUST_HEADER',
        message: 'REQUEST_ID_TRUST_HEADER is enabled in production. Ensure upstream proxies sanitize request headers.',
        severity: 'warning'
      });
    }

    // Warn about localhost origins in production
    if (validOrigins.some(origin => origin.includes('localhost'))) {
      this.warnings.push({
        field: 'CORS_ORIGINS',
        message: 'CORS_ORIGINS contains localhost in production',
        severity: 'warning'
      });
    }
  }

  validateTimeouts() {
    const keepAlive = this.safeParseInt(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS);
    const headersTimeout = this.safeParseInt(process.env.SERVER_HEADERS_TIMEOUT_MS);
    const requestTimeout = this.safeParseInt(process.env.SERVER_REQUEST_TIMEOUT_MS);

    if (keepAlive !== null && keepAlive < 1000) {
      this.errors.push({
        field: 'SERVER_KEEP_ALIVE_TIMEOUT_MS',
        message: 'SERVER_KEEP_ALIVE_TIMEOUT_MS should be at least 1000ms',
        severity: 'error'
      });
    }

    if (headersTimeout !== null && keepAlive !== null && headersTimeout <= keepAlive) {
      this.errors.push({
        field: 'SERVER_HEADERS_TIMEOUT_MS',
        message: 'SERVER_HEADERS_TIMEOUT_MS must be greater than SERVER_KEEP_ALIVE_TIMEOUT_MS to avoid premature disconnects',
        severity: 'error'
      });
    }

    if (requestTimeout !== null && requestTimeout < 1000) {
      this.errors.push({
        field: 'SERVER_REQUEST_TIMEOUT_MS',
        message: 'SERVER_REQUEST_TIMEOUT_MS should be at least 1000ms',
        severity: 'error'
      });
    }
  }

  safeParseInt(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  safeParseBoolean(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
    return null;
  }

  // Generate configuration report
  getReport() {
    const validation = this.validate();

    const report = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      validation: validation,
      configuration: {
        port: process.env.PORT || 'not set',
        nodeEnv: process.env.NODE_ENV || 'not set',
        jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
        apiKeyHmacSecretLength: process.env.API_KEY_HMAC_SECRET ? process.env.API_KEY_HMAC_SECRET.length : 0,
        allowedOrigins: process.env.ALLOWED_ORIGINS || 'not set',
        rateLimitMax: process.env.RATE_LIMIT_MAX || 'default',
        rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS || 'default',
        requestBodyLimitBytes: process.env.REQUEST_BODY_LIMIT_BYTES || '100kb default',
        apiKeyTtlMs: process.env.API_KEY_TTL_MS || 'default',
        enforceHttps: (() => {
          const rawValue = process.env.ENFORCE_HTTPS;
          const parsed = this.safeParseBoolean(rawValue);
          if (parsed === null) {
            if (rawValue === undefined) {
              return process.env.NODE_ENV === 'production' ? 'default:true' : 'default:false';
            }
            return 'invalid';
          }
          return parsed;
        })()
      }
    };

    return report;
  }

  // Print validation results
  printResults() {
    const validation = this.validate();

    console.log('\n=== Configuration Validation ===\n');

    if (validation.errors.length > 0) {
      console.log('❌ ERRORS:');
      validation.errors.forEach(error => {
        console.log(`  - ${error.field}: ${error.message}`);
        if (error.currentValue !== undefined) {
          console.log(`    Current: ${error.currentValue}`);
        }
      });
      console.log('');
    }

    if (validation.warnings.length > 0) {
      console.log('⚠️  WARNINGS:');
      validation.warnings.forEach(warning => {
        console.log(`  - ${warning.field}: ${warning.message}`);
      });
      console.log('');
    }

    if (validation.valid && validation.warnings.length === 0) {
      console.log('✅ Configuration is valid\n');
    } else if (validation.valid) {
      console.log('✅ Configuration is valid (with warnings)\n');
    } else {
      console.log('❌ Configuration is INVALID - Fix errors before starting\n');
    }

    return validation.valid;
  }

  // Validate and exit if invalid (for production)
  validateOrExit() {
    const isValid = this.printResults();

    if (!isValid && process.env.NODE_ENV === 'production') {
      console.error('❌ Cannot start in production with invalid configuration');
      process.exit(1);
    }

    if (!isValid && process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  Starting with invalid configuration (development mode)');
    }

    return isValid;
  }
}

module.exports = new ConfigValidator();