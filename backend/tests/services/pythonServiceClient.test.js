/**
 * Python Service Client - Integration Tests
 *
 * Tests for:
 * - Circuit breaker functionality
 * - Retry logic with exponential backoff
 * - Redis caching behavior
 * - Error handling and graceful degradation
 * - Health check endpoints
 * - Metrics collection
 *
 * @version 1.0.0
 */

const axios = require('axios');
const redis = require('redis');
const pythonServiceClient = require('../../src/services/pythonServiceClient');

jest.mock('axios');
jest.mock('redis');

describe('PythonServiceClient', () => {
  const mockUserId = 'test-user-123';
  const mockRequestId = 'req-test-456';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset circuit breaker state
    pythonServiceClient.circuitBreakers = {};
    pythonServiceClient.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedResponses: 0,
      circuitBreakerTrips: 0,
      retries: 0,
      byService: {}
    };
  });

  describe('ML Models Service', () => {
    test('should predict price successfully', async () => {
      const mockPrediction = {
        predicted_price: 45230.50,
        confidence: 0.92,
        model: 'ensemble_v3'
      };

      axios.get.mockResolvedValue({ data: mockPrediction });

      const result = await pythonServiceClient.predictPrice(
        { BTC: 45000, ETH: 2500 },
        { userId: mockUserId, requestId: mockRequestId }
      );

      expect(result).toEqual(mockPrediction);
      expect(pythonServiceClient.metrics.totalRequests).toBe(1);
      expect(pythonServiceClient.metrics.successfulRequests).toBe(1);
    });

    test('should handle ML service errors gracefully', async () => {
      axios.get.mockRejectedValue(new Error('Service unavailable'));

      try {
        await pythonServiceClient.predictPrice({}, { userId: mockUserId });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toMatch(/service.*unavailable|rate limit|timeout/i);
        expect(pythonServiceClient.metrics.failedRequests).toBeGreaterThan(0);
      }
    });

    test('should train model with data validation', async () => {
      const mockTrainingResult = {
        status: 'training',
        job_id: 'train-job-789',
        eta_minutes: 15
      };

      axios.post.mockResolvedValue({ data: mockTrainingResult });

      const result = await pythonServiceClient.trainModel(
        [{ features: [1, 2, 3], label: 0.5 }],
        { userId: mockUserId }
      );

      expect(result).toEqual(mockTrainingResult);
      expect(pythonServiceClient.metrics.totalRequests).toBe(1);
    });

    test('should reject invalid training data', async () => {
      expect(async () => {
        await pythonServiceClient.trainModel([]);
      }).rejects.toThrow();
    });
  });

  describe('NLP Translation Service', () => {
    test('should translate text successfully', async () => {
      const mockTranslation = {
        original_text: 'Hello world',
        translated_text: 'こんにちは世界',
        source_language: 'en',
        target_language: 'ja',
        confidence: 0.95
      };

      axios.post.mockResolvedValue({ data: mockTranslation });

      const result = await pythonServiceClient.translate(
        'Hello world',
        'en',
        'ja',
        { userId: mockUserId }
      );

      expect(result).toEqual(mockTranslation);
      expect(pythonServiceClient.metrics.totalRequests).toBe(1);
    });

    test('should detect language correctly', async () => {
      const mockDetection = {
        text: 'Bonjour',
        detected_language: 'fr',
        confidence: 0.98,
        alternatives: [
          { language: 'es', confidence: 0.01 }
        ]
      };

      axios.post.mockResolvedValue({ data: mockDetection });

      const result = await pythonServiceClient.detectLanguage(
        'Bonjour',
        { userId: mockUserId }
      );

      expect(result).toEqual(mockDetection);
      expect(result.detected_language).toBe('fr');
    });

    test('should handle batch translation', async () => {
      const mockBatch = {
        translations: [
          { text: 'Hello', translated: 'こんにちは' },
          { text: 'World', translated: '世界' }
        ],
        language_pair: 'en-ja',
        total_time_ms: 234
      };

      axios.post.mockResolvedValue({ data: mockBatch });

      const result = await pythonServiceClient.translateBatch(
        ['Hello', 'World'],
        'en',
        'ja',
        { userId: mockUserId }
      );

      expect(result.translations).toHaveLength(2);
      expect(pythonServiceClient.metrics.totalRequests).toBe(1);
    });

    test('should retrieve supported languages', async () => {
      const mockLanguages = {
        supported_languages: ['en', 'ja', 'fr', 'de', 'es', 'zh'],
        total_count: 100
      };

      axios.get.mockResolvedValue({ data: mockLanguages });

      const result = await pythonServiceClient.getSupportedLanguages();

      expect(result.supported_languages).toContain('en');
      expect(result.supported_languages).toContain('ja');
    });
  });

  describe('Fraud Detection Service', () => {
    test('should assess fraud risk', async () => {
      const mockRiskAssessment = {
        user_id: mockUserId,
        risk_score: 0.23,
        risk_level: 'low',
        factors: [
          { factor: 'velocity_score', weight: 0.2 },
          { factor: 'device_fingerprint_match', weight: 0.05 }
        ]
      };

      axios.post.mockResolvedValue({ data: mockRiskAssessment });

      const result = await pythonServiceClient.assessFraudRisk(
        {
          user_id: mockUserId,
          transaction_amount: 1000,
          transaction_type: 'swap'
        },
        { userId: mockUserId }
      );

      expect(result.risk_level).toBe('low');
      expect(result.risk_score).toBeLessThan(0.5);
      expect(pythonServiceClient.metrics.totalRequests).toBe(1);
    });

    test('should flag high-risk transactions', async () => {
      const mockHighRisk = {
        risk_score: 0.85,
        risk_level: 'high',
        flags: [
          'unusual_amount',
          'rapid_succession',
          'new_device'
        ]
      };

      axios.post.mockResolvedValue({ data: mockHighRisk });

      const result = await pythonServiceClient.assessFraudRisk(
        {
          user_id: mockUserId,
          transaction_amount: 1000000
        }
      );

      expect(result.risk_level).toBe('high');
      expect(result.flags).toContain('unusual_amount');
    });
  });

  describe('Data Processing Service', () => {
    test('should validate blockchain event', async () => {
      const mockValidation = {
        event_id: 'evt-123',
        is_valid: true,
        validation_time_ms: 45,
        checks_passed: [
          'signature_valid',
          'timestamp_valid',
          'nonce_unique'
        ]
      };

      axios.post.mockResolvedValue({ data: mockValidation });

      const result = await pythonServiceClient.validateBlockchainEvent(
        {
          event_id: 'evt-123',
          signature: '0x...',
          timestamp: Date.now()
        }
      );

      expect(result.is_valid).toBe(true);
      expect(result.checks_passed).toHaveLength(3);
    });

    test('should validate market data', async () => {
      const mockMarketValidation = {
        data_id: 'mkt-456',
        is_valid: true,
        data_quality_score: 0.98,
        outliers_detected: 0
      };

      axios.post.mockResolvedValue({ data: mockMarketValidation });

      const result = await pythonServiceClient.validateMarketData(
        {
          token: 'BTC',
          price: 45000,
          volume: 1000000
        }
      );

      expect(result.is_valid).toBe(true);
      expect(result.data_quality_score).toBeGreaterThan(0.95);
    });

    test('should process event stream', async () => {
      const mockProcessing = {
        stream_id: 'stream-789',
        events_processed: 1500,
        processing_time_ms: 234,
        aggregated_metrics: {
          avg_price: 45100,
          max_volume: 50000
        }
      };

      axios.post.mockResolvedValue({ data: mockProcessing });

      const result = await pythonServiceClient.processEventStream(
        [{ type: 'price_update', data: {} }]
      );

      expect(result.events_processed).toBe(1500);
      expect(result.aggregated_metrics).toBeDefined();
    });

    test('should aggregate market data', async () => {
      const mockAggregation = {
        aggregation_period: '1h',
        tokens: [
          { symbol: 'BTC', price: 45100, volume: 500000 },
          { symbol: 'ETH', price: 2500, volume: 1000000 }
        ]
      };

      axios.get.mockResolvedValue({ data: mockAggregation });

      const result = await pythonServiceClient.aggregateMarketData('1h');

      expect(result.tokens).toHaveLength(2);
      expect(result.aggregation_period).toBe('1h');
    });
  });

  describe('Blockchain Intelligence Service', () => {
    test('should analyze smart contract', async () => {
      const mockAnalysis = {
        contract_address: '0x...',
        vulnerabilities: ['reentrancy_risk'],
        risk_score: 0.35,
        optimization_suggestions: ['use_safe_math']
      };

      axios.post.mockResolvedValue({ data: mockAnalysis });

      const result = await pythonServiceClient.analyzeContract(
        '0x...'
      );

      expect(result.vulnerabilities).toBeDefined();
      expect(result.risk_score).toBeLessThan(1);
    });

    test('should detect MEV opportunities', async () => {
      const mockMEV = {
        transaction_hash: '0xtxhash...',
        mev_opportunity_detected: true,
        mev_amount: '2.5',
        sandwich_risk: true
      };

      axios.post.mockResolvedValue({ data: mockMEV });

      const result = await pythonServiceClient.detectMEV(
        '0xtxhash...'
      );

      expect(result.mev_opportunity_detected).toBeDefined();
    });

    test('should analyze wallet cluster', async () => {
      const mockAnalysis = {
        cluster_id: 'cluster-123',
        wallet_count: 45,
        total_value: '1500000',
        cluster_type: 'whales'
      };

      axios.post.mockResolvedValue({ data: mockAnalysis });

      const result = await pythonServiceClient.analyzeWalletCluster(
        ['0xwallet1...', '0xwallet2...']
      );

      expect(result.cluster_type).toBeDefined();
    });

    test('should retrieve transaction graph', async () => {
      const mockGraph = {
        nodes: 150,
        edges: 300,
        diameter: 8,
        clustering_coefficient: 0.65
      };

      axios.get.mockResolvedValue({ data: mockGraph });

      const result = await pythonServiceClient.getTransactionGraph();

      expect(result.nodes).toBeGreaterThan(0);
      expect(result.edges).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker Pattern', () => {
    test('should open circuit after consecutive failures', async () => {
      axios.get.mockRejectedValue(new Error('Service down'));

      for (let i = 0; i < 5; i++) {
        try {
          await pythonServiceClient.predictPrice({});
        } catch (e) {
          // Expected
        }
      }

      expect(pythonServiceClient.metrics.circuitBreakerTrips).toBeGreaterThan(0);
    });

    test('should half-open circuit after timeout', async () => {
      jest.useFakeTimers();
      axios.get.mockRejectedValue(new Error('Service down'));

      // Trigger failures to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await pythonServiceClient.predictPrice({});
        } catch (e) {
          // Expected
        }
      }

      // Advance time to allow half-open state
      jest.advanceTimersByTime(70000);

      axios.get.mockResolvedValue({ data: { success: true } });
      const result = await pythonServiceClient.predictPrice({});

      expect(result).toBeDefined();
      jest.useRealTimers();
    });
  });

  describe('Retry Logic', () => {
    test('should retry failed requests', async () => {
      axios.get
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ data: { success: true } });

      const result = await pythonServiceClient.predictPrice({});

      expect(result.success).toBe(true);
      expect(pythonServiceClient.metrics.retries).toBeGreaterThan(0);
    });

    test('should use exponential backoff', async () => {
      const startTime = Date.now();
      axios.get
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ data: { success: true } });

      await pythonServiceClient.predictPrice({});

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    test('should not retry non-transient errors', async () => {
      axios.get.mockRejectedValue(new Error('Invalid request'));

      try {
        await pythonServiceClient.predictPrice({});
      } catch (error) {
        expect(pythonServiceClient.metrics.retries).toBe(0);
      }
    });
  });

  describe('Caching', () => {
    test('should cache GET responses', async () => {
      axios.get.mockResolvedValue({ data: { cached: true } });

      await pythonServiceClient.predictPrice({});
      await pythonServiceClient.predictPrice({});

      expect(pythonServiceClient.metrics.cachedResponses).toBeGreaterThan(0);
    });

    test('should not cache POST responses by default', async () => {
      axios.post.mockResolvedValue({ data: { cached: false } });

      await pythonServiceClient.translate('text', 'en', 'ja');
      await pythonServiceClient.translate('text', 'en', 'ja');

      expect(pythonServiceClient.metrics.totalRequests).toBe(2);
    });

    test('should respect cache TTL', async () => {
      jest.useFakeTimers();
      axios.get.mockResolvedValue({ data: { fresh: true } });

      await pythonServiceClient.predictPrice({});
      jest.advanceTimersByTime(61000); // TTL default is 60s
      await pythonServiceClient.predictPrice({});

      expect(axios.get).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });

  describe('Health Checks', () => {
    test('should check overall service health', async () => {
      const mockHealth = {
        status: 'healthy',
        services: {
          ml_models: { healthy: true, latency_ms: 45 },
          nlp_translation: { healthy: true, latency_ms: 56 }
        }
      };

      axios.get.mockResolvedValue({ data: mockHealth });

      const result = await pythonServiceClient.checkHealth();

      expect(result.status).toBe('healthy');
    });

    test('should report service metrics', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await pythonServiceClient.predictPrice({});
      const metrics = pythonServiceClient.getMetrics();

      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.successfulRequests).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle timeout errors', async () => {
      const timeoutError = new Error('ECONNABORTED');
      timeoutError.code = 'ECONNABORTED';
      axios.get.mockRejectedValue(timeoutError);

      try {
        await pythonServiceClient.predictPrice({});
      } catch (error) {
        expect(error.message).toMatch(/timeout|unavailable/i);
      }
    });

    test('should handle network errors', async () => {
      const networkError = new Error('ENOTFOUND');
      networkError.code = 'ENOTFOUND';
      axios.get.mockRejectedValue(networkError);

      try {
        await pythonServiceClient.predictPrice({});
      } catch (error) {
        expect(error.message).toMatch(/network|unavailable/i);
      }
    });

    test('should handle service response errors', async () => {
      axios.get.mockResolvedValue({
        data: {
          error: 'Invalid input',
          error_code: 'INVALID_INPUT'
        }
      });

      const result = await pythonServiceClient.predictPrice({});
      expect(result.error).toBeDefined();
    });
  });

  describe('Distributed Tracing', () => {
    test('should pass request ID through calls', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await pythonServiceClient.predictPrice({}, {
        requestId: 'trace-123'
      });

      const callArgs = axios.get.mock.calls[0];
      expect(callArgs[1].headers['X-Request-ID']).toBe('trace-123');
    });

    test('should include trace context in metrics', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await pythonServiceClient.predictPrice({}, {
        userId: 'user-123',
        requestId: 'trace-456'
      });

      const metrics = pythonServiceClient.getMetrics();
      expect(metrics).toBeDefined();
    });
  });
});
