/**
 * Python Integration Service
 * Provides seamless integration between Node.js backend and Python ML services
 *
 * Features:
 * - HTTP/gRPC communication with Python services
 * - Request/response marshaling
 * - Error handling & retries
 * - Caching layer
 * - Circuit breaker pattern
 * - Async/await support
 */

const axios = require('axios');
const { logger } = require('../utils/productionLogger');
const { redisClient } = require('../config/redis');
const { CircuitBreaker } = require('../utils/circuitBreaker');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PYTHON_SERVICES = {
  ML_MODELS: {
    name: 'ml-models',
    url: process.env.ML_MODELS_URL || 'http://ml-models:8001',
    timeout: 30000,
    healthCheck: '/health',
    endpoints: {
      predict: '/predict',
      train: '/train',
      health: '/health'
    }
  },
  NLP_TRANSLATION: {
    name: 'nlp-translation',
    url: process.env.NLP_TRANSLATION_URL || 'http://nlp-translation:8002',
    timeout: 20000,
    healthCheck: '/health',
    endpoints: {
      translate: '/translate',
      detectLanguage: '/detect-language',
      translateBatch: '/translate-batch',
      supportedLanguages: '/supported-languages',
      health: '/health'
    }
  },
  FRAUD_DETECTION: {
    name: 'fraud-detection',
    url: process.env.FRAUD_DETECTION_URL || 'http://fraud-detection:8003',
    timeout: 15000,
    healthCheck: '/health',
    endpoints: {
      assessRisk: '/assess-risk',
      health: '/health'
    }
  },
  DATA_PROCESSING: {
    name: 'data-processing',
    url: process.env.DATA_PROCESSING_URL || 'http://data-processing:8004',
    timeout: 60000,
    healthCheck: '/health',
    endpoints: {
      validateBlockchainEvent: '/validate/blockchain-event',
      validateMarketData: '/validate/market-data',
      processEventStream: '/process/event-stream',
      aggregateMarketData: '/aggregate/market-data',
      health: '/health'
    }
  },
  BLOCKCHAIN_INTELLIGENCE: {
    name: 'blockchain-intelligence',
    url: process.env.BLOCKCHAIN_INTELLIGENCE_URL || 'http://blockchain-intelligence:8005',
    timeout: 30000,
    healthCheck: '/health',
    endpoints: {
      analyzeContract: '/analyze-contract',
      detectMEV: '/detect-mev',
      analyzeWalletCluster: '/analyze-wallet-cluster',
      getTransactionGraph: '/transaction-graph',
      health: '/health'
    }
  }
};

const CACHE_DEFAULTS = {
  ML_PREDICTION: 3600,      // 1 hour
  TRANSLATION: 86400,        // 24 hours
  RISK_ASSESSMENT: 1800,     // 30 minutes
  DATA_VALIDATION: 3600,     // 1 hour
  CONTRACT_ANALYSIS: 604800  // 7 days
};

// ============================================================================
// PYTHON INTEGRATION CLIENT
// ============================================================================

class PythonIntegrationClient {
  constructor() {
    this.circuitBreakers = new Map();
    this.requestId = 0;
    this.initializeCircuitBreakers();
  }

  /**
   * Initialize circuit breakers for each service
   */
  initializeCircuitBreakers() {
    Object.entries(PYTHON_SERVICES).forEach(([key, service]) => {
      const breaker = new CircuitBreaker({
        name: `python-${service.name}`,
        threshold: 5,          // Fail after 5 failures
        timeout: service.timeout,
        resetTimeout: 60000    // 1 minute
      });

      this.circuitBreakers.set(key, breaker);
    });
  }

  /**
   * Make request to Python service with circuit breaker & retry logic
   */
  async request(serviceKey, endpoint, method = 'POST', data = null, options = {}) {
    const service = PYTHON_SERVICES[serviceKey];
    if (!service) {
      throw new Error(`Unknown Python service: ${serviceKey}`);
    }

    const breaker = this.circuitBreakers.get(serviceKey);
    const requestId = ++this.requestId;
    const url = `${service.url}${endpoint}`;
    const cacheKey = `python:${serviceKey}:${endpoint}:${JSON.stringify(data || {})}`;

    try {
      // Check cache first (for GET and safe operations)
      if (method === 'GET' || (method === 'POST' && options.cacheable)) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          logger.debug(`[${requestId}] Cache hit: ${url}`);
          return JSON.parse(cached);
        }
      }

      // Make request through circuit breaker
      logger.info(`[${requestId}] Calling ${service.name}: ${endpoint}`);

      const response = await breaker.execute(async () => {
        const axiosConfig = {
          timeout: service.timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            'User-Agent': 'Soba-DEX-Backend/3.9.0'
          }
        };

        if (method === 'GET') {
          return await axios.get(url, axiosConfig);
        } else if (method === 'POST') {
          return await axios.post(url, data, axiosConfig);
        } else if (method === 'PUT') {
          return await axios.put(url, data, axiosConfig);
        } else {
          throw new Error(`Unsupported HTTP method: ${method}`);
        }
      });

      // Cache successful response
      if ((method === 'GET' || options.cacheable) && response.data) {
        const ttl = options.cacheTTL || CACHE_DEFAULTS[serviceKey] || 3600;
        await redisClient.setex(cacheKey, ttl, JSON.stringify(response.data));
      }

      logger.info(`[${requestId}] Success: ${service.name} responded in ${response.duration || 'unknown'}ms`);
      return response.data;

    } catch (error) {
      logger.error(`[${requestId}] Error calling ${service.name}`, {
        endpoint,
        error: error.message,
        code: error.code
      });

      // Transform error for consistency
      if (error.response) {
        // Python service returned error
        throw {
          status: error.response.status,
          message: error.response.data?.detail || error.message,
          service: service.name,
          endpoint
        };
      } else if (error.code === 'CIRCUIT_BREAKER_OPEN') {
        // Circuit breaker open
        throw {
          status: 503,
          message: `${service.name} is temporarily unavailable`,
          service: service.name,
          endpoint
        };
      } else {
        // Network error
        throw {
          status: 503,
          message: `Failed to reach ${service.name}`,
          service: service.name,
          endpoint
        };
      }
    }
  }

  /**
   * Check health of all Python services
   */
  async checkHealth() {
    const results = {};

    for (const [key, service] of Object.entries(PYTHON_SERVICES)) {
      try {
        const health = await this.request(key, service.endpoints.health, 'GET');
        results[key] = {
          status: health.status || 'unknown',
          healthy: health.status === 'healthy'
        };
      } catch (error) {
        results[key] = {
          status: 'unhealthy',
          healthy: false,
          error: error.message
        };
      }
    }

    return results;
  }
}

// ============================================================================
// SERVICE-SPECIFIC WRAPPERS
// ============================================================================

/**
 * ML Models Service Wrapper
 */
class MLModelsWrapper {
  constructor(client) {
    this.client = client;
  }

  async predictPrice(tokenPair, priceHistory, forecastHorizon = 24, confidenceLevel = 0.95) {
    return await this.client.request('ML_MODELS', '/predict', 'POST', {
      token_pair: tokenPair,
      price_history: priceHistory,
      forecast_horizon: forecastHorizon,
      confidence_level: confidenceLevel
    }, {
      cacheable: true,
      cacheTTL: CACHE_DEFAULTS.ML_PREDICTION
    });
  }

  async trainModel(tokenPair) {
    return await this.client.request('ML_MODELS', `/train/${tokenPair}`, 'POST');
  }
}

/**
 * NLP Translation Service Wrapper
 */
class NLPTranslationWrapper {
  constructor(client) {
    this.client = client;
  }

  async translate(text, targetLanguage, sourceLanguage = 'auto') {
    return await this.client.request('NLP_TRANSLATION', '/translate', 'POST', {
      text,
      source_language: sourceLanguage,
      target_language: targetLanguage
    }, {
      cacheable: true,
      cacheTTL: CACHE_DEFAULTS.TRANSLATION
    });
  }

  async detectLanguage(text) {
    return await this.client.request('NLP_TRANSLATION', '/detect-language', 'POST', {
      text
    });
  }

  async translateBatch(texts, targetLanguage, sourceLanguage = 'auto') {
    return await this.client.request('NLP_TRANSLATION', '/translate-batch', 'POST', {
      texts,
      source_language: sourceLanguage,
      target_language: targetLanguage
    });
  }

  async getSupportedLanguages() {
    return await this.client.request('NLP_TRANSLATION', '/supported-languages', 'GET', null, {
      cacheable: true,
      cacheTTL: 604800  // 1 week
    });
  }
}

/**
 * Fraud Detection Service Wrapper
 */
class FraudDetectionWrapper {
  constructor(client) {
    this.client = client;
  }

  async assessRisk(transaction, userHistory = null, options = {}) {
    return await this.client.request('FRAUD_DETECTION', '/assess-risk', 'POST', {
      transaction,
      user_history: userHistory,
      check_patterns: options.checkPatterns !== false,
      check_network: options.checkNetwork !== false,
      check_contract: options.checkContract !== false
    }, {
      cacheable: true,
      cacheTTL: CACHE_DEFAULTS.RISK_ASSESSMENT
    });
  }
}

/**
 * Data Processing Service Wrapper
 */
class DataProcessingWrapper {
  constructor(client) {
    this.client = client;
  }

  async validateBlockchainEvent(event) {
    return await this.client.request('DATA_PROCESSING', '/validate/blockchain-event', 'POST', event);
  }

  async validateMarketData(data) {
    return await this.client.request('DATA_PROCESSING', '/validate/market-data', 'POST', data);
  }

  async processEventStream(events) {
    return await this.client.request('DATA_PROCESSING', '/process/event-stream', 'POST', {
      events
    });
  }

  async aggregateMarketData(tokenPair, period = '1h') {
    return await this.client.request('DATA_PROCESSING', '/aggregate/market-data', 'GET', null, {
      cacheable: true,
      cacheTTL: CACHE_DEFAULTS.DATA_VALIDATION
    }, `?token_pair=${tokenPair}&period=${period}`);
  }
}

/**
 * Blockchain Intelligence Service Wrapper
 */
class BlockchainIntelligenceWrapper {
  constructor(client) {
    this.client = client;
  }

  async analyzeContract(address) {
    return await this.client.request('BLOCKCHAIN_INTELLIGENCE', '/analyze-contract', 'POST', {
      address
    }, {
      cacheable: true,
      cacheTTL: CACHE_DEFAULTS.CONTRACT_ANALYSIS
    });
  }

  async detectMEV(targetTx, surroundingTxs) {
    return await this.client.request('BLOCKCHAIN_INTELLIGENCE', '/detect-mev', 'POST', {
      target_tx: targetTx,
      surrounding_txs: surroundingTxs
    });
  }

  async analyzeWalletCluster(walletAddresses) {
    return await this.client.request('BLOCKCHAIN_INTELLIGENCE', '/analyze-wallet-cluster', 'POST', {
      wallet_addresses: walletAddresses
    });
  }

  async getTransactionGraph(tokenPair, limit = 100) {
    return await this.client.request('BLOCKCHAIN_INTELLIGENCE', '/transaction-graph', 'GET', null, {
      cacheable: true,
      cacheTTL: CACHE_DEFAULTS.CONTRACT_ANALYSIS
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE & EXPORTS
// ============================================================================

const pythonClient = new PythonIntegrationClient();

// Create service wrappers
const mlModels = new MLModelsWrapper(pythonClient);
const nlpTranslation = new NLPTranslationWrapper(pythonClient);
const fraudDetection = new FraudDetectionWrapper(pythonClient);
const dataProcessing = new DataProcessingWrapper(pythonClient);
const blockchainIntelligence = new BlockchainIntelligenceWrapper(pythonClient);

module.exports = {
  // Low-level client
  pythonClient,

  // Service wrappers
  mlModels,
  nlpTranslation,
  fraudDetection,
  dataProcessing,
  blockchainIntelligence,

  // Configuration
  PYTHON_SERVICES,
  CACHE_DEFAULTS,

  // Utilities
  PythonIntegrationClient,
  MLModelsWrapper,
  NLPTranslationWrapper,
  FraudDetectionWrapper,
  DataProcessingWrapper,
  BlockchainIntelligenceWrapper
};
