module.exports = {
  // Server configuration
  server: {
    port: 3001,
    host: 'localhost',
    keepAliveTimeout: 5000,
    headersTimeout: 6000,
    maxHeaderSize: 8192,
    bodyParserLimit: '10mb'
  },

  // Database configuration
  database: {
    host: 'localhost',
    port: 5432,
    name: 'dex_development',
    user: 'dex_dev',
    password: 'dev_password',
    ssl: false,

    // Connection pool settings
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      destroyTimeoutMillis: 2000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 5000
    }
  },

  // Redis configuration
  redis: {
    host: 'localhost',
    port: 6379,
    password: null,
    db: 0,
    keyPrefix: 'dex_dev:',
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },

  // Rate limiting (more lenient for development)
  rateLimiting: {
    windowMs: 60000, // 1 minute
    maxRequests: 10000, // High limit for development
    skipSuccessfulRequests: false,
    trustProxy: false,

    // Per-endpoint limits
    endpoints: {
      '/api/auth/login': { windowMs: 60000, maxRequests: 100 },
      '/api/auth/register': { windowMs: 60000, maxRequests: 50 },
      '/api/orderbook/order': { windowMs: 1000, maxRequests: 100 },
      '/api/trading/*': { windowMs: 1000, maxRequests: 200 }
    }
  },

  // Security settings (relaxed for development)
  security: {
    corsOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    jwtSecret: 'dev_jwt_secret_change_in_production',
    sessionSecret: 'dev_session_secret_change_in_production',
    encryptionKey: 'dev_encryption_key_32_chars_long',

    // Security headers (relaxed)
    helmet: {
      contentSecurityPolicy: false, // Disabled for easier development
      hsts: false
    }
  },

  // Logging configuration
  logging: {
    level: 'debug',
    format: 'simple',
    maxFileSize: '50MB',
    maxFiles: 5,
    datePattern: 'YYYY-MM-DD',

    // Log destinations
    destinations: {
      console: true,
      file: true,
      errorFile: true,
      syslog: false
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
      default: 60, // 1 minute (shorter for development)
      orderbook: 1, // 1 second
      marketData: 2, // 2 seconds
      userProfile: 60, // 1 minute
      tokenInfo: 300 // 5 minutes
    },
    maxSize: 100,
    checkPeriod: 60 // 1 minute
  },

  // Trading configuration
  trading: {
    fees: {
      maker: 0.001, // 0.1%
      taker: 0.001, // 0.1%
      withdrawal: 0.0005 // 0.05%
    },

    limits: {
      minOrderValue: 1, // USD (lower for testing)
      maxOrderValue: 100000, // USD
      maxOrdersPerUser: 1000, // Higher for testing
      maxDailyVolume: 1000000 // USD
    },

    orderbook: {
      maxDepth: 50,
      priceTickSize: 0.01,
      quantityTickSize: 0.000001
    }
  },

  // WebSocket configuration
  websocket: {
    pingTimeout: 60000,
    pingInterval: 25000,
    maxConnections: 1000,
    maxListeners: 100,
    compression: false, // Disabled for easier debugging

    // Rate limiting for WS
    messageRateLimit: {
      windowMs: 1000,
      maxMessages: 500 // Higher for development
    }
  },

  // Monitoring and metrics
  monitoring: {
    enabled: true,
    endpoint: '/metrics',
    collectDefaultMetrics: true,

    // Health check configuration
    healthCheck: {
      timeout: 2000,
      interval: 10000, // More frequent checks

      // Services to monitor
      services: [
        'database',
        'redis'
      ]
    },

    // Alerting thresholds (more lenient)
    alerts: {
      errorRate: 0.1, // 10%
      responseTime: 2000, // 2 seconds
      memoryUsage: 0.95, // 95%
      cpuUsage: 0.9 // 90%
    }
  },

  // External services
  external: {
    // Price feed configuration
    priceFeed: {
      enabled: true,
      providers: [
        {
          name: 'mock',
          baseUrl: 'http://localhost:3001/mock-prices',
          timeout: 2000,
          retries: 1
        }
      ],
      updateInterval: 2000, // 2 seconds
      fallbackData: true
    },

    // Blockchain configuration
    blockchain: {
      network: 'testnet',
      rpcUrl: 'http://localhost:8545',
      gasLimit: 200000,
      gasPrice: 'auto',
      confirmations: 1 // Faster for development
    }
  },

  // Backup and recovery (disabled for development)
  backup: {
    enabled: false,
    interval: '0 4 * * *', // Daily at 4 AM
    retention: 7, // Keep 7 days
    compression: true,
    destination: './backups'
  },

  // Feature flags
  features: {
    registration: true,
    trading: true,
    withdrawal: true,
    apiKeys: true,
    webSocket: true,
    orderMatching: true,
    mockData: true, // Enable mock data generation
    debugMode: true // Enable debug endpoints
  },

  // Performance optimization (relaxed for development)
  performance: {
    clustering: false, // Disabled for easier debugging
    workers: 1,

    // Compression
    compression: {
      level: 1, // Lower compression for faster development
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return require('compression').filter(req, res);
      }
    },

    // Request optimization
    requestTimeout: 60000, // Longer timeout for debugging
    slowRequestThreshold: 2000,

    // Memory management
    memoryLimit: '512MB',
    gcInterval: 600000 // 10 minutes
  },

  // Development specific settings
  development: {
    hotReload: true,
    verboseLogging: true,
    mockExternalServices: true,
    skipAuthentication: false, // Set to true to bypass auth for testing
    generateMockData: true,

    // Test users
    testUsers: [
      { username: 'demo', password: 'demo123', balance: { USDT: 10000, ETH: 5 } },
      { username: 'trader1', password: 'test123', balance: { USDT: 5000, BTC: 1 } },
      { username: 'trader2', password: 'test123', balance: { USDT: 8000, ETH: 3 } }
    ]
  }
};