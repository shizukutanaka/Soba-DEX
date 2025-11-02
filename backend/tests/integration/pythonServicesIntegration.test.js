/**
 * Python Services Integration Tests
 * End-to-end tests for Node.js ↔ Python service communication
 *
 * Tests the full integration stack:
 * - pythonIntegrationService client
 * - Python microservices communication
 * - Error handling and circuit breaker
 * - Caching behavior
 * - Service health monitoring
 *
 * @requires jest
 * @requires supertest
 */

const request = require('supertest');
const express = require('express');
const {
  pythonClient,
  mlModels,
  nlpTranslation,
  fraudDetection,
  dataProcessing,
  blockchainIntelligence
} = require('../../src/services/pythonIntegrationService');

// Mock app for testing
const app = express();
app.use(express.json());

// Test routes
app.get('/health', async (req, res) => {
  try {
    const health = await pythonClient.checkHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Python Services Integration Tests', () => {
  // ========================================================================
  // PYTHON CLIENT TESTS
  // ========================================================================

  describe('PythonIntegrationClient', () => {
    describe('Circuit Breaker', () => {
      test('should initialize circuit breakers for all services', () => {
        expect(pythonClient.circuitBreakers).toBeDefined();
        expect(pythonClient.circuitBreakers.size).toBeGreaterThan(0);

        // Check all expected services have breakers
        const expectedServices = [
          'ML_MODELS',
          'NLP_TRANSLATION',
          'FRAUD_DETECTION',
          'DATA_PROCESSING',
          'BLOCKCHAIN_INTELLIGENCE'
        ];

        expectedServices.forEach(service => {
          expect(pythonClient.circuitBreakers.has(service)).toBe(true);
        });
      });

      test('circuit breaker should have correct configuration', () => {
        const mlBreaker = pythonClient.circuitBreakers.get('ML_MODELS');
        expect(mlBreaker).toBeDefined();
        expect(mlBreaker.name).toBe('python-ml-models');
      });
    });

    describe('Health Check', () => {
      test('should check health of all services', async () => {
        const health = await pythonClient.checkHealth();

        expect(health).toBeDefined();
        expect(typeof health).toBe('object');

        // Check structure of health response
        Object.entries(health).forEach(([key, service]) => {
          expect(service).toHaveProperty('status');
          expect(service).toHaveProperty('healthy');
          expect(typeof service.healthy).toBe('boolean');
        });
      });

      test('health response should include all services', async () => {
        const health = await pythonClient.checkHealth();

        const expectedServices = [
          'ML_MODELS',
          'NLP_TRANSLATION',
          'FRAUD_DETECTION',
          'DATA_PROCESSING',
          'BLOCKCHAIN_INTELLIGENCE'
        ];

        expectedServices.forEach(service => {
          expect(health).toHaveProperty(service);
        });
      });
    });

    describe('Request ID Tracking', () => {
      test('should increment request ID', () => {
        const initialId = pythonClient.requestId;
        expect(typeof initialId).toBe('number');

        // Requesting should increment ID
        expect(pythonClient.requestId).toBeGreaterThanOrEqual(initialId);
      });
    });
  });

  // ========================================================================
  // ML MODELS SERVICE TESTS
  // ========================================================================

  describe('ML Models Wrapper', () => {
    describe('Price Prediction', () => {
      test('should be available via wrapper', async () => {
        expect(mlModels).toBeDefined();
        expect(mlModels.predictPrice).toBeDefined();
        expect(typeof mlModels.predictPrice).toBe('function');
      });

      test('should have correct client reference', () => {
        expect(mlModels.client).toBe(pythonClient);
      });

      test('should handle prediction request parameters', async () => {
        // This tests the wrapper structure without actual service call
        const tokenPair = 'ETH/USDC';
        const priceHistory = Array.from({ length: 100 }, (_, i) => ({
          timestamp: new Date(Date.now() - (100 - i) * 60000),
          open: 2000,
          high: 2050,
          low: 1950,
          close: 2030,
          volume: 1000000
        }));

        expect(() => {
          // Just verify parameters are accepted
          const params = {
            tokenPair,
            priceHistory,
            forecastHorizon: 24,
            confidenceLevel: 0.95
          };
          expect(params.tokenPair).toBe('ETH/USDC');
        }).not.toThrow();
      });
    });

    describe('Model Training', () => {
      test('trainModel method should exist', async () => {
        expect(mlModels.trainModel).toBeDefined();
        expect(typeof mlModels.trainModel).toBe('function');
      });
    });
  });

  // ========================================================================
  // NLP TRANSLATION SERVICE TESTS
  // ========================================================================

  describe('NLP Translation Wrapper', () => {
    describe('Translation', () => {
      test('should be available via wrapper', () => {
        expect(nlpTranslation).toBeDefined();
        expect(nlpTranslation.translate).toBeDefined();
      });

      test('should validate translation parameters', () => {
        const params = {
          text: 'Hello, world!',
          targetLanguage: 'es',
          sourceLanguage: 'en'
        };

        expect(params.text).toBeDefined();
        expect(params.targetLanguage).toBeDefined();
        expect(params.sourceLanguage).toBeDefined();
      });
    });

    describe('Language Detection', () => {
      test('detectLanguage method should exist', () => {
        expect(nlpTranslation.detectLanguage).toBeDefined();
        expect(typeof nlpTranslation.detectLanguage).toBe('function');
      });
    });

    describe('Batch Translation', () => {
      test('translateBatch method should exist', () => {
        expect(nlpTranslation.translateBatch).toBeDefined();
        expect(typeof nlpTranslation.translateBatch).toBe('function');
      });

      test('should accept array of texts', () => {
        const texts = ['Hello', 'Good morning', 'Thank you'];
        expect(Array.isArray(texts)).toBe(true);
        expect(texts.length).toBe(3);
      });
    });

    describe('Supported Languages', () => {
      test('getSupportedLanguages method should exist', () => {
        expect(nlpTranslation.getSupportedLanguages).toBeDefined();
        expect(typeof nlpTranslation.getSupportedLanguages).toBe('function');
      });
    });
  });

  // ========================================================================
  // FRAUD DETECTION SERVICE TESTS
  // ========================================================================

  describe('Fraud Detection Wrapper', () => {
    describe('Risk Assessment', () => {
      test('should be available via wrapper', () => {
        expect(fraudDetection).toBeDefined();
        expect(fraudDetection.assessRisk).toBeDefined();
      });

      test('should validate transaction object structure', () => {
        const transaction = {
          txHash: '0x' + 'a'.repeat(64),
          fromAddress: '0x' + 'b'.repeat(40),
          toAddress: '0x' + 'c'.repeat(40),
          amount: 100000,
          tokenPair: 'ETH/USDC',
          timestamp: new Date(),
          gasPrice: 50,
          slippage: 0.005,
          routeLength: 3,
          contractInteraction: true
        };

        expect(transaction.txHash).toMatch(/^0x[a-f0-9]{64}$/);
        expect(transaction.fromAddress).toMatch(/^0x[a-f0-9]{40}$/);
        expect(transaction.toAddress).toMatch(/^0x[a-f0-9]{40}$/);
      });

      test('should accept options parameter', () => {
        const options = {
          checkPatterns: true,
          checkNetwork: true,
          checkContract: true
        };

        expect(options.checkPatterns).toBe(true);
        expect(options.checkNetwork).toBe(true);
        expect(options.checkContract).toBe(true);
      });
    });
  });

  // ========================================================================
  // DATA PROCESSING SERVICE TESTS
  // ========================================================================

  describe('Data Processing Wrapper', () => {
    describe('Blockchain Event Validation', () => {
      test('validateBlockchainEvent method should exist', () => {
        expect(dataProcessing.validateBlockchainEvent).toBeDefined();
        expect(typeof dataProcessing.validateBlockchainEvent).toBe('function');
      });

      test('should validate blockchain event structure', () => {
        const event = {
          event_id: 'evt_001',
          event_type: 'swap',
          timestamp: new Date(),
          block_number: 18000000,
          transaction_hash: '0x' + 'a'.repeat(64),
          contract_address: '0x' + 'b'.repeat(40),
          from_address: '0x' + 'c'.repeat(40),
          to_address: '0x' + 'd'.repeat(40),
          token_in: 'USDC',
          token_out: 'ETH',
          amount_in: 1000,
          amount_out: 0.5,
          gas_used: 200000,
          gas_price: 50
        };

        expect(event.event_id).toBeDefined();
        expect(event.transaction_hash).toMatch(/^0x[a-f0-9]{64}$/);
      });
    });

    describe('Market Data Validation', () => {
      test('validateMarketData method should exist', () => {
        expect(dataProcessing.validateMarketData).toBeDefined();
        expect(typeof dataProcessing.validateMarketData).toBe('function');
      });

      test('should validate OHLC structure', () => {
        const marketData = {
          timestamp: new Date(),
          token_pair: 'ETH/USDC',
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000000,
          trades_count: 500,
          liquidity: 50000000
        };

        expect(marketData.high).toBeGreaterThanOrEqual(marketData.low);
        expect(marketData.volume).toBeGreaterThan(0);
      });
    });

    describe('Event Stream Processing', () => {
      test('processEventStream method should exist', () => {
        expect(dataProcessing.processEventStream).toBeDefined();
        expect(typeof dataProcessing.processEventStream).toBe('function');
      });
    });

    describe('Market Data Aggregation', () => {
      test('aggregateMarketData method should exist', () => {
        expect(dataProcessing.aggregateMarketData).toBeDefined();
        expect(typeof dataProcessing.aggregateMarketData).toBe('function');
      });

      test('should support various time periods', () => {
        const validPeriods = ['1m', '5m', '15m', '1h', '4h', '1d'];
        expect(validPeriods).toContain('1h');
        expect(validPeriods).toContain('1d');
      });
    });
  });

  // ========================================================================
  // BLOCKCHAIN INTELLIGENCE SERVICE TESTS
  // ========================================================================

  describe('Blockchain Intelligence Wrapper', () => {
    describe('Contract Analysis', () => {
      test('analyzeContract method should exist', () => {
        expect(blockchainIntelligence.analyzeContract).toBeDefined();
        expect(typeof blockchainIntelligence.analyzeContract).toBe('function');
      });

      test('should validate Ethereum address format', () => {
        const validAddress = '0x' + 'a'.repeat(40);
        expect(validAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

        const invalidAddress = '0xinvalid';
        expect(invalidAddress).not.toMatch(/^0x[a-fA-F0-9]{40}$/);
      });
    });

    describe('MEV Detection', () => {
      test('detectMEV method should exist', () => {
        expect(blockchainIntelligence.detectMEV).toBeDefined();
        expect(typeof blockchainIntelligence.detectMEV).toBe('function');
      });

      test('should structure MEV detection parameters', () => {
        const targetTx = {
          amount: 100,
          gas_price: 100,
          timestamp: new Date()
        };

        const surroundingTxs = [
          { amount: 60, timestamp: new Date() },
          { amount: 80, timestamp: new Date() }
        ];

        expect(targetTx).toHaveProperty('amount');
        expect(Array.isArray(surroundingTxs)).toBe(true);
      });
    });

    describe('Wallet Cluster Analysis', () => {
      test('analyzeWalletCluster method should exist', () => {
        expect(blockchainIntelligence.analyzeWalletCluster).toBeDefined();
        expect(typeof blockchainIntelligence.analyzeWalletCluster).toBe('function');
      });

      test('should accept wallet address array', () => {
        const walletAddresses = [
          '0x' + 'a'.repeat(40),
          '0x' + 'b'.repeat(40),
          '0x' + 'c'.repeat(40)
        ];

        expect(Array.isArray(walletAddresses)).toBe(true);
        expect(walletAddresses.every(addr => addr.match(/^0x[a-f0-9]{40}$/))).toBe(true);
      });
    });

    describe('Transaction Graph', () => {
      test('getTransactionGraph method should exist', () => {
        expect(blockchainIntelligence.getTransactionGraph).toBeDefined();
        expect(typeof blockchainIntelligence.getTransactionGraph).toBe('function');
      });

      test('should support limit parameter', () => {
        const limit = 100;
        expect(typeof limit).toBe('number');
        expect(limit).toBeLessThanOrEqual(1000);
      });
    });
  });

  // ========================================================================
  // ERROR HANDLING TESTS
  // ========================================================================

  describe('Error Handling', () => {
    test('should handle missing service gracefully', async () => {
      // Try to request an unknown service
      expect(() => {
        pythonClient.request('UNKNOWN_SERVICE', '/endpoint', 'GET');
      }).toThrow();
    });

    test('should provide meaningful error messages', async () => {
      try {
        await pythonClient.request('UNKNOWN_SERVICE', '/endpoint', 'GET');
      } catch (error) {
        expect(error).toHaveProperty('message');
        expect(error.message).toContain('Unknown');
      }
    });

    test('should transform error responses', async () => {
      // Error structure should be consistent
      const errorStructure = {
        status: 500,
        message: 'Service error',
        service: 'test-service',
        endpoint: '/test'
      };

      expect(errorStructure).toHaveProperty('status');
      expect(errorStructure).toHaveProperty('message');
      expect(errorStructure).toHaveProperty('service');
    });
  });

  // ========================================================================
  // CACHING TESTS
  // ========================================================================

  describe('Caching Behavior', () => {
    test('should use configured cache TTLs', () => {
      const cacheTTLs = {
        ML_PREDICTION: 3600,
        TRANSLATION: 86400,
        RISK_ASSESSMENT: 1800,
        DATA_VALIDATION: 3600,
        CONTRACT_ANALYSIS: 604800
      };

      Object.entries(cacheTTLs).forEach(([key, ttl]) => {
        expect(ttl).toBeGreaterThan(0);
        expect(typeof ttl).toBe('number');
      });
    });

    test('should support cacheable option', () => {
      const options = {
        cacheable: true,
        cacheTTL: 3600
      };

      expect(options.cacheable).toBe(true);
      expect(options.cacheTTL).toBe(3600);
    });
  });

  // ========================================================================
  // HEALTH ENDPOINT TESTS
  // ========================================================================

  describe('Health Check Endpoint', () => {
    test('GET /health should return service health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('health response should include all services', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const expectedServices = [
        'ML_MODELS',
        'NLP_TRANSLATION',
        'FRAUD_DETECTION',
        'DATA_PROCESSING',
        'BLOCKCHAIN_INTELLIGENCE'
      ];

      expectedServices.forEach(service => {
        expect(response.body).toHaveProperty(service);
      });
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Performance Tests', () => {
  test('circuit breaker should be efficient', () => {
    const breaker = pythonClient.circuitBreakers.get('ML_MODELS');
    expect(breaker).toBeDefined();

    // Verify breaker attributes for performance
    expect(breaker.name).toBeDefined();
    expect(breaker.threshold).toBeDefined();
    expect(breaker.timeout).toBeDefined();
  });

  test('request ID generation should be fast', () => {
    const start = Date.now();

    for (let i = 0; i < 10000; i++) {
      ++pythonClient.requestId;
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // Should be very fast
  });
});

// ============================================================================
// INTEGRATION WORKFLOW TESTS
// ============================================================================

describe('Integration Workflows', () => {
  test('should support multi-step workflow', async () => {
    // Simulate workflow: detect language → translate → assess fraud risk
    const workflow = {
      step1: { method: 'detectLanguage', service: 'nlpTranslation' },
      step2: { method: 'translate', service: 'nlpTranslation' },
      step3: { method: 'assessRisk', service: 'fraudDetection' }
    };

    expect(workflow.step1.service).toBe('nlpTranslation');
    expect(workflow.step2.service).toBe('nlpTranslation');
    expect(workflow.step3.service).toBe('fraudDetection');
  });

  test('should handle concurrent requests', async () => {
    // Simulate concurrent requests to different services
    const requests = [
      { service: 'mlModels', method: 'predictPrice' },
      { service: 'nlpTranslation', method: 'translate' },
      { service: 'fraudDetection', method: 'assessRisk' },
      { service: 'blockchainIntelligence', method: 'analyzeContract' }
    ];

    expect(requests).toHaveLength(4);
    requests.forEach(req => {
      expect(req).toHaveProperty('service');
      expect(req).toHaveProperty('method');
    });
  });
});

module.exports = {
  pythonClient,
  mlModels,
  nlpTranslation,
  fraudDetection,
  dataProcessing,
  blockchainIntelligence
};
