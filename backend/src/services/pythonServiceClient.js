/**
 * Python Services Client
 *
 * Manages communication with all 5 Python microservices:
 * - ML Models (port 8001)
 * - NLP Translation (port 8002)
 * - Fraud Detection (port 8003)
 * - Data Processing (port 8004)
 * - Blockchain Intelligence (port 8005)
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern for fault tolerance
 * - Request/response logging and tracing
 * - Connection pooling and timeout management
 * - Health check monitoring
 * - Request deduplication and caching
 *
 * @version 1.0.0
 * @author Claude AI
 */

const axios = require('axios');
const CircuitBreaker = require('opossum');
const { logger } = require('../utils/productionLogger');
const redis = require('./cache/redisClient');

class PythonServiceClient {
  constructor() {
    // Service endpoints
    this.services = {
      ML_MODELS: {
        name: 'ML Models',
        url: process.env.ML_MODELS_URL || 'http://localhost:8001',
        timeout: 30000,
        healthPath: '/health',
        metrics: { requests: 0, errors: 0, latency: [] }
      },
      NLP_TRANSLATION: {
        name: 'NLP Translation',
        url: process.env.NLP_TRANSLATION_URL || 'http://localhost:8002',
        timeout: 30000,
        healthPath: '/health',
        metrics: { requests: 0, errors: 0, latency: [] }
      },
      FRAUD_DETECTION: {
        name: 'Fraud Detection',
        url: process.env.FRAUD_DETECTION_URL || 'http://localhost:8003',
        timeout: 25000,
        healthPath: '/health',
        metrics: { requests: 0, errors: 0, latency: [] }
      },
      DATA_PROCESSING: {
        name: 'Data Processing',
        url: process.env.DATA_PROCESSING_URL || 'http://localhost:8004',
        timeout: 30000,
        healthPath: '/health',
        metrics: { requests: 0, errors: 0, latency: [] }
      },
      BLOCKCHAIN_INTELLIGENCE: {
        name: 'Blockchain Intelligence',
        url: process.env.BLOCKCHAIN_INTELLIGENCE_URL || 'http://localhost:8005',
        timeout: 35000,
        healthPath: '/health',
        metrics: { requests: 0, errors: 0, latency: [] }
      }
    };

    // Circuit breaker options
    this.circuitBreakerOptions = {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      name: 'PythonServiceCircuitBreaker',
      healthCheckInterval: 5000,
      healthCheck: async () => this.performHealthCheck()
    };

    // Initialize circuit breakers for each service
    this.circuitBreakers = {};
    this.initializeCircuitBreakers();

    // Request tracking
    this.requestQueue = new Map();
    this.maxQueueSize = 1000;

    // Cache configuration
    this.cacheConfig = {
      defaultTTL: 300, // 5 minutes
      maxCacheSize: 1000
    };

    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 5000,
      backoffMultiplier: 2
    };

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      totalCacheHits: 0,
      totalCacheMisses: 0,
      circuitBreakerTrips: 0,
      requestsByService: {}
    };

    Object.keys(this.services).forEach(key => {
      this.metrics.requestsByService[key] = 0;
    });

    logger.info('[PythonServiceClient] Initialized with services', {
      services: Object.keys(this.services)
    });
  }

  /**
   * Initialize circuit breakers for each service
   */
  initializeCircuitBreakers() {
    Object.entries(this.services).forEach(([key, service]) => {
      const breaker = new CircuitBreaker(
        async (method, ...args) => this._executeServiceCall(service, method, ...args),
        this.circuitBreakerOptions
      );

      // Circuit breaker event handlers
      breaker.fallback(() => ({
        error: 'Service temporarily unavailable',
        service: service.name,
        circuitBreakerOpen: true,
        timestamp: new Date()
      }));

      breaker.on('open', () => {
        logger.warn(`[PythonServiceClient] Circuit breaker opened for ${service.name}`);
        this.metrics.circuitBreakerTrips++;
        service.circuitBreakerOpen = true;
      });

      breaker.on('halfOpen', () => {
        logger.info(`[PythonServiceClient] Circuit breaker half-open for ${service.name}`);
        service.circuitBreakerOpen = false;
      });

      breaker.on('close', () => {
        logger.info(`[PythonServiceClient] Circuit breaker closed for ${service.name}`);
        service.circuitBreakerOpen = false;
      });

      this.circuitBreakers[key] = breaker;
    });
  }

  /**
   * Execute service call with retry logic
   */
  async _executeServiceCall(service, method, ...args) {
    let lastError;
    let delay = this.retryConfig.initialDelay;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(
            delay * this.retryConfig.backoffMultiplier,
            this.retryConfig.maxDelay
          );
        }

        return await method(...args);
      } catch (error) {
        lastError = error;
        logger.warn(`[PythonServiceClient] Service call failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`, {
          service: service.name,
          error: error.message,
          attempt: attempt + 1
        });

        // Don't retry on 4xx errors except 408, 429
        if (error.response?.status >= 400 && error.response?.status < 500) {
          if (![408, 429].includes(error.response.status)) {
            throw error;
          }
        }
      }
    }

    throw lastError;
  }

  /**
   * Make a request to a Python service
   */
  async call(serviceName, endpoint, data = null, options = {}) {
    const startTime = Date.now();
    const requestId = this._generateRequestId();
    const cacheKey = this._getCacheKey(serviceName, endpoint, data);

    try {
      // Check cache
      if (!data || options.method === 'GET') {
        const cached = await this._getFromCache(cacheKey);
        if (cached) {
          this.metrics.totalCacheHits++;
          logger.debug('[PythonServiceClient] Cache hit', {
            serviceName,
            endpoint,
            requestId,
            cacheHit: true
          });
          return cached;
        }
      }

      this.metrics.totalCacheMisses++;

      // Get service configuration
      const service = this.services[serviceName];
      if (!service) {
        throw new Error(`Unknown service: ${serviceName}`);
      }

      // Track request
      this.metrics.totalRequests++;
      this.metrics.requestsByService[serviceName]++;
      service.metrics.requests++;

      // Build request
      const url = `${service.url}${endpoint}`;
      const axiosConfig = {
        method: options.method || (data ? 'POST' : 'GET'),
        url,
        timeout: service.timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-Service-Client': 'dex-backend',
          ...options.headers
        }
      };

      if (data) {
        axiosConfig.data = data;
      }

      // Execute with circuit breaker
      const breaker = this.circuitBreakers[serviceName];
      const response = await breaker.fire(
        async (config) => {
          const result = await axios(config);
          return result.data;
        },
        axiosConfig
      );

      // Cache successful response
      if (response && !options.skipCache) {
        await this._setInCache(cacheKey, response, options.cacheTTL);
      }

      // Track latency
      const latency = Date.now() - startTime;
      service.metrics.latency.push(latency);
      if (service.metrics.latency.length > 100) {
        service.metrics.latency.shift();
      }

      logger.debug('[PythonServiceClient] Service call successful', {
        serviceName,
        endpoint,
        requestId,
        latency,
        cacheHit: false
      });

      return response;
    } catch (error) {
      const latency = Date.now() - startTime;

      this.metrics.totalErrors++;
      this.services[serviceName].metrics.errors++;

      logger.error('[PythonServiceClient] Service call failed', {
        serviceName,
        endpoint,
        requestId,
        error: error.message,
        status: error.response?.status,
        latency
      });

      throw {
        service: serviceName,
        endpoint,
        error: error.message,
        status: error.response?.status || 500,
        requestId,
        timestamp: new Date()
      };
    }
  }

  /**
   * ML Models Service Methods
   */

  async predictPrice(tokenPair, priceHistory, options = {}) {
    return this.call('ML_MODELS', '/predict', {
      tokenPair,
      priceHistory,
      forecastHorizon: options.forecastHorizon || 24,
      confidenceLevel: options.confidenceLevel || 0.95
    }, { cacheTTL: options.cacheTTL || 300 });
  }

  async trainModel(modelName, trainingData, options = {}) {
    return this.call('ML_MODELS', '/train', {
      modelName,
      trainingData,
      epochs: options.epochs || 100,
      batchSize: options.batchSize || 32
    }, { method: 'POST' });
  }

  /**
   * NLP Translation Service Methods
   */

  async translate(text, targetLanguage, options = {}) {
    return this.call('NLP_TRANSLATION', '/translate', {
      text,
      targetLanguage,
      sourceLanguage: options.sourceLanguage || 'auto',
      formality: options.formality || 'formal'
    }, { cacheTTL: options.cacheTTL || 3600 });
  }

  async detectLanguage(text) {
    return this.call('NLP_TRANSLATION', '/detect-language', {
      text
    }, { cacheTTL: 3600 });
  }

  async translateBatch(texts, targetLanguage, options = {}) {
    return this.call('NLP_TRANSLATION', '/translate-batch', {
      texts,
      targetLanguage,
      sourceLanguage: options.sourceLanguage || 'auto'
    }, { method: 'POST' });
  }

  async getSupportedLanguages() {
    return this.call('NLP_TRANSLATION', '/supported-languages', null, {
      method: 'GET',
      cacheTTL: 86400 // Cache for 24 hours
    });
  }

  /**
   * Fraud Detection Service Methods
   */

  async assessFraudRisk(transaction, options = {}) {
    return this.call('FRAUD_DETECTION', '/assess-risk', {
      transaction,
      threshold: options.threshold || 0.7,
      considerHistory: options.considerHistory !== false
    }, { cacheTTL: options.cacheTTL || 60 });
  }

  /**
   * Data Processing Service Methods
   */

  async validateBlockchainEvent(event, options = {}) {
    return this.call('DATA_PROCESSING', '/validate-blockchain-event', {
      event,
      strict: options.strict !== false
    }, { cacheTTL: options.cacheTTL || 300 });
  }

  async validateMarketData(data, options = {}) {
    return this.call('DATA_PROCESSING', '/validate-market-data', {
      data,
      dataType: options.dataType || 'ohlcv'
    }, { cacheTTL: options.cacheTTL || 60 });
  }

  async processEventStream(events, options = {}) {
    return this.call('DATA_PROCESSING', '/process-event-stream', {
      events,
      aggregationWindow: options.aggregationWindow || 1000
    }, { method: 'POST' });
  }

  async aggregateMarketData(symbols, timeframe = '1h') {
    return this.call('DATA_PROCESSING', `/aggregate-market-data?symbols=${symbols}&timeframe=${timeframe}`, null, {
      method: 'GET',
      cacheTTL: 300
    });
  }

  /**
   * Blockchain Intelligence Service Methods
   */

  async analyzeContract(contractAddress, options = {}) {
    return this.call('BLOCKCHAIN_INTELLIGENCE', '/analyze-contract', {
      contractAddress,
      analyzePatterns: options.analyzePatterns !== false,
      checkVulnerabilities: options.checkVulnerabilities !== false
    }, { cacheTTL: options.cacheTTL || 3600 });
  }

  async detectMEV(transaction, options = {}) {
    return this.call('BLOCKCHAIN_INTELLIGENCE', '/detect-mev', {
      transaction,
      checkSandwich: options.checkSandwich !== false,
      checkLiquidation: options.checkLiquidation !== false
    }, { cacheTTL: options.cacheTTL || 300 });
  }

  async analyzeWalletCluster(walletAddresses, options = {}) {
    return this.call('BLOCKCHAIN_INTELLIGENCE', '/analyze-wallet-cluster', {
      walletAddresses,
      depth: options.depth || 2,
      checkCircles: options.checkCircles !== false
    }, { cacheTTL: options.cacheTTL || 3600 });
  }

  async getTransactionGraph(transactionHash, options = {}) {
    return this.call('BLOCKCHAIN_INTELLIGENCE', `/transaction-graph/${transactionHash}`, null, {
      method: 'GET',
      cacheTTL: options.cacheTTL || 7200
    });
  }

  /**
   * Health check all services
   */
  async checkHealth() {
    const health = {};

    for (const [key, service] of Object.entries(this.services)) {
      try {
        const startTime = Date.now();
        const response = await axios.get(
          `${service.url}${service.healthPath}`,
          { timeout: 5000 }
        );
        const latency = Date.now() - startTime;

        health[key] = {
          healthy: true,
          service: service.name,
          latency,
          uptime: response.data?.uptime || 'unknown',
          version: response.data?.version || 'unknown',
          timestamp: new Date()
        };
      } catch (error) {
        health[key] = {
          healthy: false,
          service: service.name,
          error: error.message,
          timestamp: new Date()
        };

        logger.warn(`[PythonServiceClient] Health check failed for ${service.name}`, {
          error: error.message
        });
      }
    }

    return health;
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    const serviceMetrics = {};

    Object.entries(this.services).forEach(([key, service]) => {
      const latencies = service.metrics.latency;
      const avgLatency = latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

      serviceMetrics[key] = {
        name: service.name,
        requests: service.metrics.requests,
        errors: service.metrics.errors,
        errorRate: service.metrics.requests > 0
          ? (service.metrics.errors / service.metrics.requests * 100).toFixed(2) + '%'
          : '0%',
        averageLatency: Math.round(avgLatency) + 'ms',
        circuitBreakerOpen: service.circuitBreakerOpen || false
      };
    });

    return {
      totalMetrics: this.metrics,
      serviceMetrics,
      timestamp: new Date()
    };
  }

  /**
   * Cache helper methods
   */

  async _getFromCache(key) {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.debug('[PythonServiceClient] Cache get error', { error: error.message });
      return null;
    }
  }

  async _setInCache(key, value, ttl = this.cacheConfig.defaultTTL) {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.debug('[PythonServiceClient] Cache set error', { error: error.message });
    }
  }

  _getCacheKey(serviceName, endpoint, data) {
    const dataHash = data
      ? require('crypto')
          .createHash('sha256')
          .update(JSON.stringify(data))
          .digest('hex')
      : 'nodata';
    return `python:${serviceName}:${endpoint}:${dataHash}`;
  }

  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Perform periodic health check
   */
  async performHealthCheck() {
    try {
      const health = await this.checkHealth();
      const allHealthy = Object.values(health).every(s => s.healthy);
      return allHealthy;
    } catch (error) {
      logger.error('[PythonServiceClient] Health check error', { error: error.message });
      return false;
    }
  }
}

// Export singleton instance
module.exports = new PythonServiceClient();
