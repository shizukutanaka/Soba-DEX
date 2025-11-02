/**
 * Unit tests for TracerService
 * @version 3.0.0
 */

const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

// Mock OpenTelemetry dependencies
jest.mock('@opentelemetry/sdk-node');
jest.mock('@opentelemetry/auto-instrumentations-node');
jest.mock('@opentelemetry/exporter-jaeger');
jest.mock('@opentelemetry/exporter-zipkin');
jest.mock('@opentelemetry/exporter-trace-otlp-http');
jest.mock('../../config/logger');

const TracerService = require('../tracerService');

describe('TracerService', () => {
  let tracerService;
  let mockSdk;
  let mockTracer;
  let mockSpan;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock span
    mockSpan = {
      setAttribute: jest.fn().mockReturnThis(),
      setAttributes: jest.fn().mockReturnThis(),
      addEvent: jest.fn().mockReturnThis(),
      setStatus: jest.fn().mockReturnThis(),
      recordException: jest.fn().mockReturnThis(),
      end: jest.fn(),
      isRecording: jest.fn().mockReturnValue(true),
    };

    // Mock tracer
    mockTracer = {
      startSpan: jest.fn().mockReturnValue(mockSpan),
      startActiveSpan: jest.fn((name, options, callback) => {
        return callback(mockSpan);
      }),
    };

    // Mock SDK
    mockSdk = {
      start: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
    };

    const { NodeSDK } = require('@opentelemetry/sdk-node');
    NodeSDK.mockImplementation(() => mockSdk);

    // Mock trace provider
    jest.spyOn(trace, 'getTracer').mockReturnValue(mockTracer);

    // Create fresh instance
    tracerService = new TracerService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default Jaeger exporter', async () => {
      await tracerService.initialize();

      expect(mockSdk.start).toHaveBeenCalled();
      expect(tracerService.isInitialized).toBe(true);
    });

    it('should initialize with Zipkin exporter', async () => {
      const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');

      await tracerService.initialize({ exporterType: 'zipkin' });

      expect(ZipkinExporter).toHaveBeenCalled();
      expect(mockSdk.start).toHaveBeenCalled();
    });

    it('should initialize with OTLP exporter', async () => {
      const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

      await tracerService.initialize({ exporterType: 'otlp' });

      expect(OTLPTraceExporter).toHaveBeenCalled();
      expect(mockSdk.start).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      await tracerService.initialize();
      await tracerService.initialize();

      expect(mockSdk.start).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unknown exporter type', async () => {
      await expect(
        tracerService.initialize({ exporterType: 'unknown' })
      ).rejects.toThrow('Unknown exporter type: unknown');
    });

    it('should use custom service name and version', async () => {
      const customOptions = {
        serviceName: 'custom-service',
        serviceVersion: '1.0.0',
      };

      await tracerService.initialize(customOptions);

      expect(mockSdk.start).toHaveBeenCalled();
    });
  });

  describe('Span Creation', () => {
    beforeEach(async () => {
      await tracerService.initialize();
    });

    it('should create a span with name', () => {
      const span = tracerService.startSpan('test-operation');

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'test-operation',
        expect.any(Object)
      );
      expect(span).toBe(mockSpan);
    });

    it('should create a span with attributes', () => {
      const attributes = {
        'user.id': '123',
        'request.method': 'GET',
      };

      tracerService.startSpan('test-operation', { attributes });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'test-operation',
        expect.objectContaining({ attributes })
      );
    });

    it('should execute function with active span', async () => {
      const testFunction = jest.fn().mockResolvedValue('result');

      const result = await tracerService.startActiveSpan(
        'test-operation',
        testFunction
      );

      expect(mockTracer.startActiveSpan).toHaveBeenCalled();
      expect(testFunction).toHaveBeenCalledWith(mockSpan);
      expect(result).toBe('result');
    });

    it('should handle errors in active span', async () => {
      const error = new Error('Test error');
      const testFunction = jest.fn().mockRejectedValue(error);

      await expect(
        tracerService.startActiveSpan('test-operation', testFunction)
      ).rejects.toThrow('Test error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    });
  });

  describe('Span Management', () => {
    beforeEach(async () => {
      await tracerService.initialize();
    });

    it('should set span attributes', () => {
      tracerService.setSpanAttribute(mockSpan, 'key', 'value');

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('key', 'value');
    });

    it('should set multiple span attributes', () => {
      const attributes = {
        key1: 'value1',
        key2: 'value2',
      };

      tracerService.setSpanAttributes(mockSpan, attributes);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(attributes);
    });

    it('should add event to span', () => {
      tracerService.addSpanEvent(mockSpan, 'test-event', { detail: 'info' });

      expect(mockSpan.addEvent).toHaveBeenCalledWith('test-event', {
        detail: 'info',
      });
    });

    it('should record exception on span', () => {
      const error = new Error('Test error');

      tracerService.recordException(mockSpan, error);

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    });

    it('should end span', () => {
      tracerService.endSpan(mockSpan);

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle null span gracefully', () => {
      expect(() => {
        tracerService.setSpanAttribute(null, 'key', 'value');
      }).not.toThrow();

      expect(() => {
        tracerService.endSpan(null);
      }).not.toThrow();
    });
  });

  describe('HTTP Request Tracing', () => {
    beforeEach(async () => {
      await tracerService.initialize();
    });

    it('should create span for HTTP request', () => {
      const req = {
        method: 'GET',
        url: '/api/test',
        headers: {
          'user-agent': 'test-agent',
        },
      };

      tracerService.startHttpRequestSpan(req);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'GET /api/test',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'http.method': 'GET',
            'http.url': '/api/test',
          }),
        })
      );
    });

    it('should add response info to span', () => {
      const res = {
        statusCode: 200,
        headers: {
          'content-type': 'application/json',
        },
      };

      tracerService.addHttpResponseInfo(mockSpan, res);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'http.status_code': 200,
        })
      );
    });
  });

  describe('Database Query Tracing', () => {
    beforeEach(async () => {
      await tracerService.initialize();
    });

    it('should create span for database query', () => {
      tracerService.startDatabaseSpan('SELECT * FROM users', 'postgresql');

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'db.query',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'db.system': 'postgresql',
            'db.statement': 'SELECT * FROM users',
          }),
        })
      );
    });
  });

  describe('External API Tracing', () => {
    beforeEach(async () => {
      await tracerService.initialize();
    });

    it('should create span for external API call', () => {
      tracerService.startExternalApiSpan('etherscan', 'GET', '/api/stats');

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'external.etherscan',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'external.service': 'etherscan',
            'http.method': 'GET',
          }),
        })
      );
    });
  });

  describe('Background Job Tracing', () => {
    beforeEach(async () => {
      await tracerService.initialize();
    });

    it('should create span for background job', () => {
      tracerService.startBackgroundJobSpan('gas-price-update');

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'job.gas-price-update',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'job.name': 'gas-price-update',
          }),
        })
      );
    });
  });

  describe('Shutdown', () => {
    it('should shutdown SDK', async () => {
      await tracerService.initialize();
      await tracerService.shutdown();

      expect(mockSdk.shutdown).toHaveBeenCalled();
      expect(tracerService.isInitialized).toBe(false);
    });

    it('should handle shutdown when not initialized', async () => {
      await expect(tracerService.shutdown()).resolves.not.toThrow();
    });
  });

  describe('isEnabled', () => {
    it('should return true when initialized', async () => {
      await tracerService.initialize();
      expect(tracerService.isEnabled()).toBe(true);
    });

    it('should return false when not initialized', () => {
      expect(tracerService.isEnabled()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      mockSdk.start.mockRejectedValue(new Error('SDK start failed'));

      await expect(tracerService.initialize()).rejects.toThrow(
        'SDK start failed'
      );
      expect(tracerService.isInitialized).toBe(false);
    });

    it('should handle shutdown errors gracefully', async () => {
      await tracerService.initialize();
      mockSdk.shutdown.mockRejectedValue(new Error('Shutdown failed'));

      await expect(tracerService.shutdown()).rejects.toThrow(
        'Shutdown failed'
      );
    });
  });

  describe('Context Propagation', () => {
    beforeEach(async () => {
      await tracerService.initialize();
    });

    it('should get active span context', () => {
      jest.spyOn(trace, 'getActiveSpan').mockReturnValue(mockSpan);

      const activeSpan = tracerService.getActiveSpan();

      expect(activeSpan).toBe(mockSpan);
    });

    it('should return null if no active span', () => {
      jest.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);

      const activeSpan = tracerService.getActiveSpan();

      expect(activeSpan).toBeUndefined();
    });
  });

  describe('Custom Attributes', () => {
    beforeEach(async () => {
      await tracerService.initialize();
    });

    it('should add custom attributes to span', () => {
      const customAttributes = {
        'custom.userId': '123',
        'custom.feature': 'trading',
        'custom.amount': 100.5,
      };

      tracerService.setSpanAttributes(mockSpan, customAttributes);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(customAttributes);
    });

    it('should handle different attribute types', () => {
      tracerService.setSpanAttribute(mockSpan, 'string.attr', 'value');
      tracerService.setSpanAttribute(mockSpan, 'number.attr', 42);
      tracerService.setSpanAttribute(mockSpan, 'boolean.attr', true);

      expect(mockSpan.setAttribute).toHaveBeenCalledTimes(3);
    });
  });
});
