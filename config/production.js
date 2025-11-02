module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0',
    keepAliveTimeout: 5000,
    headersTimeout: 6000,
    maxHeaderSize: 8192,
    bodyParserLimit: '10mb'
  },

  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'dex_production',
    user: process.env.DB_USER || 'dex_user',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',

    // Connection pool settings
    pool: {
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 10000
    }
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: 'dex:',
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },

  // Rate limiting
  rateLimiting: {
    windowMs: 60000, // 1 minute
    maxRequests: 1000, // Per window
    skipSuccessfulRequests: false,
    trustProxy: true,

    // Per-endpoint limits
    endpoints: {
      '/api/auth/login': { windowMs: 300000, maxRequests: 5 }, // 5 per 5 min
      '/api/auth/register': { windowMs: 3600000, maxRequests: 3 }, // 3 per hour
      '/api/orderbook/order': { windowMs: 1000, maxRequests: 10 }, // 10 per second
      '/api/trading/*': { windowMs: 1000, maxRequests: 20 } // 20 per second
    }
  },

  // Security settings
  security: {
    corsOrigins: (process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
    jwtSecret: process.env.JWT_SECRET,
    sessionSecret: process.env.SESSION_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,

    // Security headers
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    maxFileSize: '100MB',
    maxFiles: 10,
    datePattern: 'YYYY-MM-DD',

    // Log destinations
    destinations: {
      console: true,
      file: true,
      errorFile: true,
      syslog: process.env.SYSLOG_HOST ? true : false
    },

    // Sensitive field filtering
    sensitiveFields: [
      'password',
      'token',
      'apiKey',
      'privateKey',
      'sessionId'
    ]
  },

  // Cache configuration
  cache: {
    ttl: {
      default: 300, // 5 minutes
      orderbook: 1, // 1 second
      marketData: 5, // 5 seconds
      userProfile: 300, // 5 minutes
      tokenInfo: 3600 // 1 hour
    },
    maxSize: 1000,
    checkPeriod: 600 // 10 minutes
  },

  // Trading configuration
  trading: {
    fees: {
      maker: 0.001, // 0.1%
      taker: 0.001, // 0.1%
      withdrawal: 0.0005 // 0.05%
    },

    limits: {
      minOrderValue: 10, // USD
      maxOrderValue: 1000000, // USD
      maxOrdersPerUser: 100,
      maxDailyVolume: 10000000 // USD
    },

    orderbook: {
      maxDepth: 100,
      priceTickSize: 0.01,
      quantityTickSize: 0.000001
    }
  },

  // WebSocket configuration
  websocket: {
    pingTimeout: 60000,
    pingInterval: 25000,
    maxConnections: 10000,
    maxListeners: 100,
    compression: true,

    // Rate limiting for WS
    messageRateLimit: {
      windowMs: 1000,
      maxMessages: 50
    }
  },

  // Monitoring and metrics
  monitoring: {
    enabled: true,
    endpoint: '/metrics',
    collectDefaultMetrics: true,

    // Health check configuration
    healthCheck: {
      timeout: 5000,
      interval: 30000,

      // Services to monitor
      services: [
        'database',
        'redis',
        'external_api'
      ]
    },

    // Alerting thresholds
    alerts: {
      errorRate: 0.05, // 5%
      responseTime: 1000, // 1 second
      memoryUsage: 0.9, // 90%
      cpuUsage: 0.8 // 80%
    }
  },

  // External services
  external: {
    // Price feed configuration
    priceFeed: {
      enabled: true,
      providers: [
        {
          name: 'coinbase',
          baseUrl: 'https://api.coinbase.com/v2',
          timeout: 5000,
          retries: 3
        }
      ],
      updateInterval: 5000, // 5 seconds
      fallbackData: true
    },

    // Blockchain configuration
    blockchain: {
      network: process.env.BLOCKCHAIN_NETWORK || 'mainnet',
      rpcUrl: process.env.RPC_URL,
      gasLimit: 200000,
      gasPrice: 'auto',
      confirmations: 12
    }
  },

  // Backup and recovery
  backup: {
    enabled: true,
    interval: '0 2 * * *', // Daily at 2 AM
    retention: 30, // Keep 30 days
    compression: true,
    destination: process.env.BACKUP_DESTINATION || null
  },

  // Feature flags
  features: {
    registration: process.env.ENABLE_REGISTRATION !== 'false',
    trading: process.env.ENABLE_TRADING !== 'false',
    withdrawal: process.env.ENABLE_WITHDRAWAL !== 'false',
    apiKeys: true,
    webSocket: true,
    orderMatching: true
  },

  // Performance optimization
  performance: {
    clustering: process.env.CLUSTER_MODE === 'true',
    workers: parseInt(process.env.WORKERS) || require('os').cpus().length,

    // Compression
    compression: {
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return require('compression').filter(req, res);
      }
    },

    // Request optimization
    requestTimeout: 30000,
    slowRequestThreshold: 1000,

    // Memory management
    memoryLimit: '1GB',
    gcInterval: 300000 // 5 minutes
  }
};