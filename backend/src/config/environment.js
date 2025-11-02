const { parseAndValidateOrigins } = require('../utils/originUtils');
const { logger } = require('../utils/productionLogger');

// Optimized environment configuration - Single source of truth
class EnvironmentConfig {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.config = this.loadConfig();
    this.cache = new Map(); // Performance cache for frequently accessed values
  }

  loadConfig() {
    const baseConfig = {
      // Server configuration
      port: parseInt(process.env.PORT) || 3001,
      host: process.env.HOST || 'localhost',
      corsOrigins: this.getCorsOrigins(),

      // Performance settings
      compression: {
        enabled: process.env.COMPRESSION_ENABLED !== 'false',
        level: parseInt(process.env.COMPRESSION_LEVEL) || 6,
        threshold: parseInt(process.env.COMPRESSION_THRESHOLD) || 1024
      },

      // Rate limiting
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        skipSuccessfulRequests: true,
        skipFailedRequests: false
      },

      // Caching
      cache: {
        ttl: parseInt(process.env.CACHE_TTL) || 10000,
        maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
        cleanupInterval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 30000
      },

      // WebSocket
      websocket: {
        path: process.env.WS_PATH || '/ws',
        heartbeatInterval: parseInt(process.env.WS_HEARTBEAT) || 30000,
        maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS) || 1000,
        batchInterval: parseInt(process.env.WS_BATCH_INTERVAL) || 100
      },

      // Security
      security: {
        helmet: {
          enabled: process.env.HELMET_ENABLED !== 'false',
          contentSecurityPolicy: process.env.NODE_ENV === 'production'
        },
        maxRequestSize: process.env.MAX_REQUEST_SIZE || '1mb'
      }
    };

    if (this.env === 'production') {
      return {
        ...baseConfig,
        compression: {
          ...baseConfig.compression,
          level: 9 // Maximum compression in production
        },
        rateLimit: {
          ...baseConfig.rateLimit,
          max: 200 // Higher limit for production
        },
        cache: {
          ...baseConfig.cache,
          ttl: 30000, // Longer cache in production
          maxSize: 5000 // Larger cache in production
        },
        security: {
          ...baseConfig.security,
          helmet: {
            enabled: true,
            contentSecurityPolicy: true
          }
        }
      };
    }

    if (this.env === 'test') {
      return {
        ...baseConfig,
        port: 3002,
        rateLimit: {
          windowMs: 60000,
          max: 1000 // Higher limit for testing
        }
      };
    }

    // Development config
    return baseConfig;
  }

  getCorsOrigins() {
    const rawOrigins = process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || '';

    const { validOrigins, invalidOrigins } = parseAndValidateOrigins(rawOrigins, {
      allowHttpLocalhost: this.env !== 'production'
    });

    if (this.env === 'production') {
      if (validOrigins.length === 0) {
        throw new Error('CORS_ORIGINS environment variable must contain at least one valid HTTPS origin in production');
      }

      if (invalidOrigins.length > 0) {
        throw new Error('CORS_ORIGINS includes invalid origins. Please review your configuration.');
      }

      return validOrigins;
    }

    const devDefaults = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];

    return Array.from(new Set([...devDefaults, ...validOrigins]));
  }

  get(key, defaultValue = null) {
    // Check cache first for performance
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Get value from config or environment
    let value = this.config[key];
    if (value === undefined) {
      // Check environment variables with dot notation conversion
      const envKey = key.toUpperCase().replace(/\./g, '_');
      value = process.env[envKey] || defaultValue;
    }

    // Cache frequently accessed values
    this.cache.set(key, value);
    return value;
  }

  getAll() {
    return { ...this.config };
  }

  isProduction() {
    return this.env === 'production';
  }

  isDevelopment() {
    return this.env === 'development';
  }

  isTest() {
    return this.env === 'test';
  }

  // Get database URL (if using database)
  getDatabaseUrl() {
    return process.env.DATABASE_URL || 'sqlite://./dev.db';
  }

  // Get Redis URL (if using Redis)
  getRedisUrl() {
    return process.env.REDIS_URL || 'redis://localhost:6379';
  }

  // Validate required environment variables
  validateEnvironment() {
    const required = [];

    if (this.isProduction()) {
      required.push('DATABASE_URL', 'REDIS_URL');
    }

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return true;
  }

  // Enhanced configuration methods
  has(key) {
    return this.config[key] !== undefined || process.env[key.toUpperCase().replace(/\./g, '_')] !== undefined;
  }

  set(key, value) {
    this.config[key] = value;
    this.cache.set(key, value);
    return this;
  }

  getSection(prefix) {
    const section = {};
    for (const [key, value] of Object.entries(this.config)) {
      if (key.startsWith(prefix + '.')) {
        const subKey = key.substring(prefix.length + 1);
        section[subKey] = value;
      }
    }
    return section;
  }

  clearCache() {
    this.cache.clear();
  }

  // Performance monitoring for config access
  getAccessStats() {
    return {
      cacheSize: this.cache.size,
      environment: this.env,
      configKeys: Object.keys(this.config).length
    };
  }

  // Log configuration (safe for production)
  logConfig() {
    const safeConfig = {
      environment: this.env,
      port: this.config.port,
      corsOrigins: this.config.corsOrigins.length,
      rateLimit: this.config.rateLimit,
      cache: this.config.cache,
      performance: this.getAccessStats()
    };

    logger.info('[Environment] Configuration loaded', safeConfig);
  }
}

module.exports = new EnvironmentConfig();