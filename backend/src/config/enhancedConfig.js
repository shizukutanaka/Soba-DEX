// const _fs = require('fs');
// const _path = require('path');
const crypto = require('crypto');

class EnhancedConfig {
  constructor() {
    this.config = {
      // Server Configuration
      server: {
        port: this.getPort(),
        host: process.env.HOST || '0.0.0.0',
        environment: process.env.NODE_ENV || 'development',
        apiPrefix: '/api/v1',
        maxRequestSize: '10mb',
        requestTimeout: 30000,
        keepAliveTimeout: 65000,
        headersTimeout: 66000
      },

      // Security Configuration
      security: {
        cors: {
          enabled: true,
          origins: this.getCorsOrigins(),
          credentials: true,
          maxAge: 86400,
          exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
        },
        helmet: {
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
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
        },
        rateLimit: {
          windowMs: 15 * 60 * 1000,
          max: process.env.NODE_ENV === 'production' ? 100 : 1000,
          message: 'Too many requests from this IP',
          standardHeaders: true,
          legacyHeaders: false
        },
        jwt: {
          secret: process.env.JWT_SECRET || this.generateSecret(),
          expiresIn: '24h',
          refreshExpiresIn: '7d',
          algorithm: 'HS256'
        },
        encryption: {
          algorithm: 'aes-256-gcm',
          key: process.env.ENCRYPTION_KEY || this.generateSecret()
        },
        apiKeys: this.getApiKeys()
      },

      // Database Configuration
      database: {
        primary: {
          type: process.env.DB_TYPE || 'postgresql',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'dex_db',
          username: process.env.DB_USER || 'dex_user',
          password: process.env.DB_PASSWORD || '',
          ssl: process.env.DB_SSL === 'true',
          pool: {
            max: parseInt(process.env.DB_POOL_MAX || '20'),
            min: parseInt(process.env.DB_POOL_MIN || '5'),
            acquire: 30000,
            idle: 10000
          }
        },
        replica: {
          enabled: process.env.DB_REPLICA_ENABLED === 'true',
          host: process.env.DB_REPLICA_HOST,
          port: parseInt(process.env.DB_REPLICA_PORT || '5432')
        }
      },

      // Cache Configuration
      cache: {
        redis: {
          enabled: process.env.REDIS_ENABLED !== 'false',
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '0'),
          ttl: 3600,
          keyPrefix: 'dex:',
          maxRetriesPerRequest: 3
        },
        memory: {
          max: 100,
          ttl: 300,
          updateAgeOnGet: true
        }
      },

      // Blockchain Configuration
      blockchain: {
        networks: {
          ethereum: {
            rpcUrl: process.env.ETH_RPC_URL || '',
            chainId: parseInt(process.env.ETH_CHAIN_ID || '1'),
            confirmations: 6,
            gasLimit: '3000000',
            gasPriceMultiplier: 1.1
          },
          bsc: {
            rpcUrl: process.env.BSC_RPC_URL || '',
            chainId: parseInt(process.env.BSC_CHAIN_ID || '56'),
            confirmations: 10
          },
          polygon: {
            rpcUrl: process.env.POLYGON_RPC_URL || '',
            chainId: parseInt(process.env.POLYGON_CHAIN_ID || '137'),
            confirmations: 30
          }
        },
        contracts: {
          dex: process.env.CONTRACT_DEX_ADDRESS,
          router: process.env.CONTRACT_ROUTER_ADDRESS,
          factory: process.env.CONTRACT_FACTORY_ADDRESS,
          governance: process.env.CONTRACT_GOVERNANCE_ADDRESS
        },
        gasEstimation: {
          enabled: true,
          buffer: 1.2,
          maxGasPrice: '500000000000'
        }
      },

      // Monitoring Configuration
      monitoring: {
        metrics: {
          enabled: true,
          port: parseInt(process.env.METRICS_PORT || '9090'),
          path: '/metrics',
          defaultLabels: {
            app: 'soba',
            environment: process.env.NODE_ENV
          }
        },
        logging: {
          level: process.env.LOG_LEVEL || 'info',
          format: process.env.LOG_FORMAT || 'json',
          outputs: ['console', 'file'],
          file: {
            path: process.env.LOG_PATH || './logs',
            filename: 'dex-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d'
          }
        },
        alerts: {
          enabled: process.env.ALERTS_ENABLED === 'true',
          channels: {
            email: {
              enabled: process.env.EMAIL_ALERTS === 'true',
              smtp: {
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS
                }
              },
              from: process.env.ALERT_EMAIL_FROM,
              to: process.env.ALERT_EMAIL_TO?.split(',') || []
            },
            slack: {
              enabled: process.env.SLACK_ALERTS === 'true',
              webhookUrl: process.env.SLACK_WEBHOOK_URL,
              channel: process.env.SLACK_CHANNEL
            }
          }
        },
        healthCheck: {
          enabled: true,
          interval: 30000,
          timeout: 5000,
          endpoints: ['/health', '/ready', '/live']
        }
      },

      // Performance Configuration
      performance: {
        clustering: {
          enabled: process.env.CLUSTER_ENABLED === 'true',
          workers: parseInt(process.env.CLUSTER_WORKERS || '0') || require('os').cpus().length
        },
        compression: {
          enabled: true,
          level: 6,
          threshold: 1024,
          filter: (req, res) => {
            if (req.headers['x-no-compression']) {
              return false;
            }
            return /json|text|javascript|css|html|xml/.test(res.getHeader('Content-Type'));
          }
        },
        caching: {
          static: {
            maxAge: 86400,
            immutable: true
          },
          api: {
            enabled: true,
            ttl: 300,
            checkPeriod: 600
          }
        }
      },

      // Features Configuration
      features: {
        trading: {
          enabled: true,
          minOrderSize: '0.001',
          maxOrderSize: '100000',
          orderTypes: ['market', 'limit', 'stop-loss', 'take-profit'],
          feeRate: '0.003',
          makerFeeDiscount: '0.0005'
        },
        liquidity: {
          enabled: true,
          minLiquidity: '100',
          maxSlippage: '0.05',
          autoRebalance: true,
          rebalanceInterval: 3600000
        },
        staking: {
          enabled: process.env.STAKING_ENABLED === 'true',
          minStake: '100',
          lockPeriod: 86400 * 7,
          rewardRate: '0.12'
        },
        governance: {
          enabled: process.env.GOVERNANCE_ENABLED === 'true',
          proposalThreshold: '10000',
          votingPeriod: 86400 * 3,
          quorum: '0.04'
        }
      },

      // External Services
      services: {
        priceFeed: {
          providers: this.getPriceProviders(),
          updateInterval: 10000,
          timeout: 5000,
          fallbackEnabled: true
        },
        notification: {
          enabled: process.env.NOTIFICATIONS_ENABLED === 'true',
          channels: ['email', 'push', 'sms'],
          batchSize: 100,
          retryAttempts: 3
        }
      },

      // Maintenance Configuration
      maintenance: {
        mode: process.env.MAINTENANCE_MODE === 'true',
        message: process.env.MAINTENANCE_MESSAGE || 'System under maintenance',
        allowedIPs: process.env.MAINTENANCE_ALLOWED_IPS?.split(',') || [],
        scheduledTasks: {
          cleanup: {
            enabled: true,
            schedule: '0 2 * * *',
            retention: 30
          },
          backup: {
            enabled: process.env.BACKUP_ENABLED === 'true',
            schedule: '0 3 * * *',
            destination: process.env.BACKUP_PATH || './backups'
          }
        }
      }
    };

    this.validateConfiguration();
  }

  getPort() {
    const port = parseInt(process.env.PORT || '3001');
    if (port < 1 || port > 65535) {
      throw new Error('Invalid port number');
    }
    return port;
  }

  getCorsOrigins() {
    if (process.env.CORS_ORIGINS) {
      return process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
    }

    if (process.env.NODE_ENV === 'production') {
      return process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
    }

    // Development defaults - no hardcoded localhost
    return ['*'];
  }

  getApiKeys() {
    const keys = {};
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('API_KEY_')) {
        const serviceName = key.replace('API_KEY_', '').toLowerCase();
        keys[serviceName] = process.env[key];
      }
    });
    return keys;
  }

  getPriceProviders() {
    const providers = [];

    if (process.env.COINGECKO_API_KEY) {
      providers.push({
        name: 'coingecko',
        url: 'https://api.coingecko.com/api/v3',
        apiKey: process.env.COINGECKO_API_KEY,
        priority: 1
      });
    }

    if (process.env.CHAINLINK_RPC_URL) {
      providers.push({
        name: 'chainlink',
        url: process.env.CHAINLINK_RPC_URL,
        priority: 2
      });
    }

    return providers;
  }

  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  validateConfiguration() {
    const errors = [];

    // Validate required environment variables
    const required = [
      'NODE_ENV',
      'JWT_SECRET',
      'DB_PASSWORD'
    ];

    if (process.env.NODE_ENV === 'production') {
      required.push(
        'FRONTEND_URL',
        'ETH_RPC_URL',
        'CONTRACT_DEX_ADDRESS',
        'ENCRYPTION_KEY'
      );
    }

    required.forEach(key => {
      if (!process.env[key]) {
        errors.push(`Missing required environment variable: ${key}`);
      }
    });

    // Validate URLs
    ['FRONTEND_URL', 'ETH_RPC_URL', 'BSC_RPC_URL', 'POLYGON_RPC_URL'].forEach(key => {
      if (process.env[key] && !this.isValidUrl(process.env[key])) {
        errors.push(`Invalid URL for ${key}: ${process.env[key]}`);
      }
    });

    if (errors.length > 0) {
      console.error('Configuration validation errors:', errors);
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Configuration validation failed');
      }
    }
  }

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => {
      if (!obj[key]) {
        obj[key] = {};
      }
      return obj[key];
    }, this.config);
    target[lastKey] = value;
  }

  toJSON() {
    // Return config without sensitive data
    const sanitized = JSON.parse(JSON.stringify(this.config));
    this.removeSensitiveData(sanitized);
    return sanitized;
  }

  removeSensitiveData(obj) {
    const sensitive = ['password', 'secret', 'key', 'token', 'apiKey'];

    Object.keys(obj).forEach(key => {
      if (sensitive.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
        obj[key] = '***';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.removeSensitiveData(obj[key]);
      }
    });
  }
}

module.exports = new EnhancedConfig();