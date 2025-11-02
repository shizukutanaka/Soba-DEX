// SAND Configuration - Optimized Settings
module.exports = {
  // Application Settings
  app: {
    name: 'SAND',
    version: '2.0.0',
    description: 'Streamlined API Network for DEX',
    environment: process.env.NODE_ENV || 'production'
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0',
    cors: {
      enabled: true,
      origin: process.env.CORS_ORIGIN || '*',
      maxAge: 86400
    },
    compression: {
      enabled: true,
      threshold: 1024
    },
    rateLimit: {
      windowMs: 60000,
      max: 100
    }
  },

  // Performance Settings
  performance: {
    cache: {
      enabled: true,
      ttl: 60000,
      maxSize: 1000
    },
    request: {
      maxSize: '500kb',
      timeout: 30000
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  // Trading Configuration
  trading: {
    fees: {
      maker: 0.001,
      taker: 0.001
    },
    limits: {
      minOrderValue: 10,
      maxOrderValue: 100000,
      maxOpenOrders: 100
    },
    pairs: [
      'ETH/USDT',
      'BTC/USDT',
      'BNB/USDT'
    ]
  },

  // Security Settings
  security: {
    helmet: {
      enabled: true,
      contentSecurityPolicy: false
    },
    encryption: {
      algorithm: 'aes-256-gcm'
    },
    session: {
      secret: process.env.SESSION_SECRET || 'sand-secret-key-change-in-production',
      maxAge: 86400000
    }
  },

  // Database Settings (simplified)
  database: {
    type: 'memory',
    cleanup: {
      enabled: true,
      interval: 300000
    }
  },

  // Monitoring Settings
  monitoring: {
    metrics: {
      enabled: true,
      interval: 60000
    },
    health: {
      enabled: true,
      endpoint: '/health'
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: 'json'
    }
  },

  // Features Toggle
  features: {
    trading: true,
    orderBook: true,
    marketData: true,
    balance: true,
    staking: false,
    lending: false,
    derivatives: false,
    nft: false
  }
};