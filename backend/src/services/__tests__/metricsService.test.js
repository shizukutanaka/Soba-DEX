/**
 * Unit tests for MetricsService
 * @version 2.9.0
 */

const client = require('prom-client');

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Disable default metrics collection in tests
process.env.PROMETHEUS_COLLECT_DEFAULT = 'false';

// Note: metricsService is exported as a singleton
const metricsService = require('../metricsService');

describe('MetricsService', () => {
  beforeEach(() => {
    // Clear the global registry to avoid conflicts
    client.register.clear();

    // Reset the service state
    if (metricsService.initialized) {
      metricsService.resetMetrics();
    }
    metricsService.initialized = false;
    metricsService.metrics = {};
    metricsService.register = new client.Registry();
    metricsService.register.setDefaultLabels({
      app: 'soba-dex-backend',
      environment: process.env.NODE_ENV || 'test',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      metricsService.initialize();

      expect(metricsService.initialized).toBe(true);
      expect(metricsService.metrics).toBeDefined();
    });

    it('should not reinitialize if already initialized', () => {
      const logger = require('../../config/logger');

      metricsService.initialize();
      metricsService.initialize();

      expect(logger.warn).toHaveBeenCalledWith(
        '[MetricsService] Already initialized'
      );
    });

    it('should initialize HTTP metrics', () => {
      metricsService.initialize();

      expect(metricsService.metrics.httpRequestsTotal).toBeDefined();
      expect(metricsService.metrics.httpRequestDuration).toBeDefined();
    });

    it('should initialize business metrics', () => {
      metricsService.initialize();

      expect(metricsService.metrics.swapTransactionsTotal).toBeDefined();
      expect(metricsService.metrics.gasPriceCurrent).toBeDefined();
      expect(metricsService.metrics.tokenPrice).toBeDefined();
    });

    it('should initialize WebSocket metrics', () => {
      metricsService.initialize();

      expect(metricsService.metrics.wsConnectionsTotal).toBeDefined();
      expect(metricsService.metrics.wsActiveConnections).toBeDefined();
    });

    it('should initialize database metrics', () => {
      metricsService.initialize();

      expect(metricsService.metrics.dbQueryDuration).toBeDefined();
      expect(metricsService.metrics.dbQueriesTotal).toBeDefined();
    });

    it('should initialize job metrics', () => {
      metricsService.initialize();

      expect(metricsService.metrics.jobDuration).toBeDefined();
      expect(metricsService.metrics.jobsTotal).toBeDefined();
    });
  });

  describe('HTTP Metrics', () => {
    beforeEach(() => {
      metricsService.initialize();
    });

    it('should record HTTP request', () => {
      metricsService.recordHttpRequest('GET', '/api/test', 200, 0.123, 100, 500);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_http_requests_total');
    });

    it('should record request duration', () => {
      metricsService.recordHttpRequest('POST', '/api/swap', 201, 0.456, 1024, 2048);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_http_request_duration_seconds');
    });
  });

  describe('Business Metrics', () => {
    beforeEach(() => {
      metricsService.initialize();
    });

    it('should record swap transaction', () => {
      metricsService.recordSwapTransaction('ETH/USDT', 'success', 1000);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_swap_transactions_total');
    });

    it('should update gas price', () => {
      metricsService.updateGasPrice('fast', 50, 'etherscan');

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_gas_price_gwei');
    });

    it('should update token price', () => {
      metricsService.updateTokenPrice('ETH/USD', 2000, 'coingecko');

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_token_price_usd');
    });
  });

  describe('WebSocket Metrics', () => {
    beforeEach(() => {
      metricsService.initialize();
    });

    it('should record WebSocket connection', () => {
      metricsService.recordWebSocketConnection(true);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_ws_connections_total');
    });

    it('should record WebSocket disconnection', () => {
      metricsService.recordWebSocketConnection(true);
      metricsService.recordWebSocketConnection(false);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_ws_active_connections');
    });

    it('should record WebSocket message', () => {
      metricsService.recordWebSocketMessage('gas-prices', 'prices');

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_ws_messages_sent_total');
    });

    it('should update room subscribers', () => {
      metricsService.updateWebSocketRoomSubscribers('gas-prices', 10);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_ws_room_subscribers');
    });
  });

  describe('Database Metrics', () => {
    beforeEach(() => {
      metricsService.initialize();
    });

    it('should record database query', () => {
      metricsService.recordDatabaseQuery('SELECT', 'users', 0.05);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_db_queries_total');
    });

    it('should record query duration', () => {
      metricsService.recordDatabaseQuery('INSERT', 'transactions', 0.1);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_db_query_duration_seconds');
    });
  });

  describe('Background Job Metrics', () => {
    beforeEach(() => {
      metricsService.initialize();
    });

    it('should record job execution', () => {
      metricsService.recordJobExecution('gas-price-update', 'success', 1.5);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_jobs_total');
    });

    it('should record job duration', () => {
      metricsService.recordJobExecution('price-fetch', 'success', 2.0);

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_job_duration_seconds');
    });

    it('should record job failure', () => {
      metricsService.recordJobExecution('cleanup', 'error', 0.5, new Error('Test error'));

      const metrics = metricsService.getMetrics();
      expect(metrics).resolves.toContain('soba_dex_jobs_total');
    });
  });

  describe('Metrics Export', () => {
    beforeEach(() => {
      metricsService.initialize();
    });

    it('should export metrics in Prometheus format', async () => {
      const metrics = await metricsService.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('should export metrics as JSON', async () => {
      metricsService.recordSwapTransaction('ETH/USDT', 'success', 1000);

      const metricsJson = await metricsService.getMetricsJson();

      expect(metricsJson).toBeDefined();
      expect(Array.isArray(metricsJson)).toBe(true);
    });

    it('should return content type for metrics', () => {
      const contentType = metricsService.getContentType();

      expect(contentType).toBe(client.register.contentType);
    });

    it('should reset metrics when requested', () => {
      metricsService.recordHttpRequest('GET', '/test', 200, 0.1, 100, 500);
      metricsService.resetMetrics();

      // Metrics should still be defined but counters reset
      expect(metricsService.initialized).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    it('should return initialization status', () => {
      expect(metricsService.isInitialized()).toBe(false);

      metricsService.initialize();

      expect(metricsService.isInitialized()).toBe(true);
    });

    it('should return registry instance', () => {
      metricsService.initialize();

      const registry = metricsService.getRegistry();

      expect(registry).toBeDefined();
      expect(registry).toBe(metricsService.register);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      metricsService.initialize();
    });

    it('should handle missing parameters gracefully', () => {
      expect(() => {
        metricsService.recordHttpRequest('GET', null, 200, 0.1);
      }).not.toThrow();
    });

    it('should handle invalid metric values', () => {
      expect(() => {
        metricsService.updateGasPrice('fast', 'invalid', 'etherscan');
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      metricsService.initialize();
    });

    it('should handle high volume of metrics', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        metricsService.recordHttpRequest('GET', '/test', 200, 0.1, 100, 500);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it('should not leak memory with continuous metrics', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 10000; i++) {
        metricsService.updateGasPrice('fast', 50 + i, 'etherscan');
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});
