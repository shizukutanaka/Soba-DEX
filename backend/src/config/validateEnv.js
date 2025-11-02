/**
 * Environment Variable Validation
 * Version: 2.6.1 - Practical improvements
 *
 * Validates all required environment variables on startup
 * Prevents runtime errors from missing configuration
 */

const { logger } = require('../utils/productionLogger');

/**
 * Required environment variables (Critical)
 */
const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'API_KEY_HMAC_SECRET',
  'SESSION_SECRET',
];

/**
 * Required environment variables for production only
 */
const REQUIRED_PRODUCTION_VARS = [
  'REDIS_URL',
  'CORS_ORIGIN',
];

/**
 * Recommended environment variables (Warnings only)
 */
const RECOMMENDED_VARS = [
  'PORT',
  'NODE_ENV',
  'LOG_LEVEL',
];

/**
 * Validation rules for specific variables
 */
const VALIDATION_RULES = {
  JWT_SECRET: {
    minLength: 32,
    pattern: /^[a-zA-Z0-9-_]+$/,
    message: 'JWT_SECRET must be at least 32 characters (alphanumeric, dash, underscore)',
  },
  API_KEY_HMAC_SECRET: {
    minLength: 32,
    pattern: /^[a-zA-Z0-9-_]+$/,
    message: 'API_KEY_HMAC_SECRET must be at least 32 characters',
  },
  SESSION_SECRET: {
    minLength: 32,
    message: 'SESSION_SECRET must be at least 32 characters',
  },
  DATABASE_URL: {
    pattern: /^postgresql:\/\/.+/,
    message: 'DATABASE_URL must be a valid PostgreSQL connection string',
  },
  REDIS_URL: {
    pattern: /^redis:\/\/.+/,
    message: 'REDIS_URL must be a valid Redis connection string',
  },
  PORT: {
    pattern: /^\d+$/,
    validate: (val) => {
      const port = parseInt(val, 10);
      return port > 0 && port < 65536;
    },
    message: 'PORT must be a valid port number (1-65535)',
  },
  NODE_ENV: {
    enum: ['development', 'production', 'test'],
    message: 'NODE_ENV must be one of: development, production, test',
  },
  LOG_LEVEL: {
    enum: ['error', 'warn', 'info', 'debug'],
    message: 'LOG_LEVEL must be one of: error, warn, info, debug',
  },
};

/**
 * Check if a value matches validation rules
 */
function validateValue(key, value, rule) {
  // Check minimum length
  if (rule.minLength && value.length < rule.minLength) {
    return { valid: false, message: rule.message };
  }

  // Check pattern
  if (rule.pattern && !rule.pattern.test(value)) {
    return { valid: false, message: rule.message };
  }

  // Check enum
  if (rule.enum && !rule.enum.includes(value)) {
    return { valid: false, message: rule.message };
  }

  // Custom validation function
  if (rule.validate && !rule.validate(value)) {
    return { valid: false, message: rule.message };
  }

  return { valid: true };
}

/**
 * Check for insecure default values in production
 */
function checkInsecureDefaults() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return [];

  const warnings = [];
  const insecurePatterns = [
    'development',
    'test',
    'password',
    'secret',
    'change-in-production',
    'example',
    'localhost',
  ];

  const criticalVars = ['JWT_SECRET', 'API_KEY_HMAC_SECRET', 'SESSION_SECRET'];

  criticalVars.forEach((key) => {
    const value = process.env[key] || '';
    const lowerValue = value.toLowerCase();

    insecurePatterns.forEach((pattern) => {
      if (lowerValue.includes(pattern)) {
        warnings.push(
          `⚠️  ${key} appears to contain insecure default value: "${pattern}"`
        );
      }
    });
  });

  return warnings;
}

/**
 * Validate all environment variables
 */
function validateEnvironment() {
  const errors = [];
  const warnings = [];
  const isProduction = process.env.NODE_ENV === 'production';

  console.log('🔍 Validating environment variables...\n');

  // Check required variables
  REQUIRED_VARS.forEach((key) => {
    if (!process.env[key]) {
      errors.push(`❌ Missing required environment variable: ${key}`);
    } else {
      // Validate value if rules exist
      const rule = VALIDATION_RULES[key];
      if (rule) {
        const result = validateValue(key, process.env[key], rule);
        if (!result.valid) {
          errors.push(`❌ Invalid ${key}: ${result.message}`);
        }
      }
    }
  });

  // Check production-only required variables
  if (isProduction) {
    REQUIRED_PRODUCTION_VARS.forEach((key) => {
      if (!process.env[key]) {
        errors.push(`❌ Missing required production variable: ${key}`);
      } else {
        const rule = VALIDATION_RULES[key];
        if (rule) {
          const result = validateValue(key, process.env[key], rule);
          if (!result.valid) {
            errors.push(`❌ Invalid ${key}: ${result.message}`);
          }
        }
      }
    });
  }

  // Check recommended variables
  RECOMMENDED_VARS.forEach((key) => {
    if (!process.env[key]) {
      warnings.push(`⚠️  Missing recommended variable: ${key} (will use default)`);
    } else {
      const rule = VALIDATION_RULES[key];
      if (rule) {
        const result = validateValue(key, process.env[key], rule);
        if (!result.valid) {
          warnings.push(`⚠️  ${result.message}`);
        }
      }
    }
  });

  // Check for insecure defaults in production
  const securityWarnings = checkInsecureDefaults();
  warnings.push(...securityWarnings);

  // Display results
  if (errors.length > 0) {
    console.error('\n❌ Environment validation failed:\n');
    errors.forEach((error) => console.error(`  ${error}`));
    console.error('\n');
    console.error('💡 Fix these issues in your .env file before starting the server.');
    console.error('📄 See .env.example for reference.\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment validation warnings:\n');
    warnings.forEach((warning) => console.warn(`  ${warning}`));
    console.warn('\n');
  }

  console.log('✅ Environment validation passed!\n');

  // Log configuration summary
  console.log('📋 Configuration Summary:');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Port: ${process.env.PORT || '3001'}`);
  console.log(`   Database: ${process.env.DATABASE_URL ? '✓ Configured' : '✗ Not configured'}`);
  console.log(`   Redis: ${process.env.REDIS_URL ? '✓ Configured' : '✗ Not configured'}`);
  console.log(`   Log Level: ${process.env.LOG_LEVEL || 'debug'}`);
  console.log('');
}

/**
 * Get validated configuration object
 */
function getConfig() {
  return {
    // Server
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',

    // Database
    databaseUrl: process.env.DATABASE_URL,

    // Redis
    redisUrl: process.env.REDIS_URL,
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),

    // Security
    jwtSecret: process.env.JWT_SECRET,
    apiKeyHmacSecret: process.env.API_KEY_HMAC_SECRET,
    sessionSecret: process.env.SESSION_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

    // CORS
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),

    // Logging
    logLevel: process.env.LOG_LEVEL || 'debug',
    logDir: process.env.LOG_DIR || './logs',

    // Rate limiting
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),

    // Caching
    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
    cacheTtlDefault: parseInt(process.env.CACHE_TTL_DEFAULT || '300', 10),
    cacheTtlPrices: parseInt(process.env.CACHE_TTL_PRICES || '5', 10),
    cacheTtlGas: parseInt(process.env.CACHE_TTL_GAS || '10', 10),

    // Feature flags
    useMockData: process.env.USE_MOCK_DATA === 'true',
    forceHttps: process.env.FORCE_HTTPS === 'true',

    // Production check
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
    isTest: process.env.NODE_ENV === 'test',
  };
}

module.exports = {
  validateEnvironment,
  getConfig,
};
