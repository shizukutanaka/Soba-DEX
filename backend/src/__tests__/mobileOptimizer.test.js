/**
 * Mobile Optimizer Tests for Soba DEX v3.4.0
 *
 * Unit tests for the mobile experience optimization service
 */

const MobileOptimizer = require('../ml/mobileOptimizer');
const UAParser = require('ua-parser-js');

// Mock UAParser for testing
jest.mock('ua-parser-js', () => {
  return jest.fn(() => ({
    getResult: () => ({
      device: { type: 'mobile', vendor: 'Apple', model: 'iPhone' },
      browser: { name: 'Safari', version: '15.0', major: '15' },
      os: { name: 'iOS', version: '15.0' }
    })
  }));
});

describe('MobileOptimizer', () => {
  let mobileOptimizer;

  beforeEach(() => {
    mobileOptimizer = new MobileOptimizer({
      compressionThreshold: 512,
      cacheTTL: 300000,
      maxCacheSize: 100
    });
  });

  afterEach(async () => {
    if (mobileOptimizer) {
      mobileOptimizer.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(mobileOptimizer.initialize()).resolves.not.toThrow();
      expect(mobileOptimizer.initialized).toBe(true);
    });

    test('should generate PWA manifest', async () => {
      await mobileOptimizer.initialize();

      const manifest = mobileOptimizer.getPWAManifest();
      expect(manifest).toHaveProperty('name');
      expect(manifest).toHaveProperty('short_name');
      expect(manifest).toHaveProperty('start_url');
      expect(manifest.display).toBe('standalone');
    });

    test('should generate service worker script', async () => {
      await mobileOptimizer.initialize();

      const swScript = mobileOptimizer.getServiceWorkerScript();
      expect(typeof swScript).toBe('string');
      expect(swScript).toContain('CACHE_NAME');
      expect(swScript).toContain('addEventListener');
    });
  });

  describe('User Agent Parsing', () => {
    beforeEach(async () => {
      await mobileOptimizer.initialize();
    });

    test('should parse mobile user agent correctly', () => {
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15';
      const deviceInfo = mobileOptimizer.parseUserAgent(userAgent);

      expect(deviceInfo.device.type).toBe('mobile');
      expect(deviceInfo.os.name).toBe('iOS');
      expect(deviceInfo.browser.name).toBe('Safari');
    });

    test('should detect mobile device', () => {
      const mobileDevice = { device: { type: 'mobile' } };
      const desktopDevice = { device: { type: 'desktop' } };

      expect(mobileOptimizer.isMobileDevice(mobileDevice)).toBe(true);
      expect(mobileOptimizer.isMobileDevice(desktopDevice)).toBe(false);
    });

    test('should assess device capabilities', () => {
      const mobileInfo = {
        device: { type: 'mobile' },
        browser: { name: 'Safari', major: '15' },
        os: { name: 'iOS' }
      };

      const capabilities = mobileOptimizer.assessDeviceCapabilities(mobileInfo);

      expect(capabilities.screenSize).toBe('small');
      expect(capabilities.processingPower).toBe('low');
      expect(capabilities.memory).toBe('low');
    });
  });

  describe('Response Optimization', () => {
    beforeEach(async () => {
      await mobileOptimizer.initialize();
    });

    test('should optimize response for mobile device', () => {
      const originalResponse = {
        data: {
          largeArray: Array(100).fill('data'),
          nestedObject: { deep: { value: 123.456789 } },
          precisionNumber: 123.456789
        }
      };

      const mockRequest = {
        headers: { 'user-agent': 'mobile-user-agent' }
      };

      const optimized = mobileOptimizer.optimizeResponse(originalResponse, mockRequest);

      expect(optimized._meta.optimized).toBe(true);
      expect(optimized._meta.deviceType).toBe('mobile');
      expect(optimized.data.largeArray.length).toBeLessThan(100);
      expect(optimized.data.precisionNumber).toBe(123.46); // Reduced precision
    });

    test('should not optimize for desktop devices', () => {
      // Mock desktop device
      mobileOptimizer.parseUserAgent = jest.fn().mockReturnValue({
        device: { type: 'desktop' }
      });

      const originalResponse = { data: { test: 'value' } };
      const mockRequest = {
        headers: { 'user-agent': 'desktop-user-agent' }
      };

      const optimized = mobileOptimizer.optimizeResponse(originalResponse, mockRequest);

      expect(optimized._meta.optimized).toBe(true);
      expect(optimized._meta.deviceType).toBe('desktop');
    });

    test('should compress large data structures', () => {
      const largeArray = Array(50).fill('item');
      const data = { largeArray };

      const mobileInfo = { device: { type: 'mobile' } };
      const compressed = mobileOptimizer.compressMobileData(data, mobileInfo);

      expect(compressed.largeArray._compressed).toBe(true);
      expect(compressed.largeArray.items.length).toBeLessThan(50);
      expect(compressed.largeArray.totalCount).toBe(50);
    });

    test('should reduce numerical precision', () => {
      const data = {
        highPrecision: 123.456789,
        lowValue: 0.00123456,
        integer: 100
      };

      const reduced = mobileOptimizer.reducePrecision(data);

      expect(reduced.highPrecision).toBe(123.46);
      expect(reduced.lowValue).toBe(0.001235);
      expect(reduced.integer).toBe(100);
    });

    test('should remove redundant fields for mobile', () => {
      const data = {
        usefulData: 'value',
        debugInfo: 'debug',
        desktopOnlyFeature: 'feature',
        internalNotes: 'notes'
      };

      const cleaned = mobileOptimizer.removeMobileRedundantFields(data);

      expect(cleaned.usefulData).toBe('value');
      expect(cleaned.debugInfo).toBeUndefined();
      expect(cleaned.desktopOnlyFeature).toBeUndefined();
      expect(cleaned.internalNotes).toBeUndefined();
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      await mobileOptimizer.initialize();
    });

    test('should cache data for endpoint', () => {
      const data = { cached: 'data' };
      mobileOptimizer.setCachedData('/api/test', data);

      const cached = mobileOptimizer.getCachedData('/api/test');
      expect(cached).toEqual(data);
    });

    test('should return null for non-existent cache', () => {
      const cached = mobileOptimizer.getCachedData('/api/nonexistent');
      expect(cached).toBeNull();
    });

    test('should expire cache after TTL', () => {
      jest.useFakeTimers();

      const data = { cached: 'data' };
      mobileOptimizer.setCachedData('/api/test', data);

      // Fast-forward past TTL
      jest.advanceTimersByTime(400000); // 400 seconds

      const cached = mobileOptimizer.getCachedData('/api/test');
      expect(cached).toBeNull();

      jest.useRealTimers();
    });

    test('should implement LRU cache eviction', () => {
      // Fill cache beyond max size
      for (let i = 0; i < 150; i++) {
        mobileOptimizer.setCachedData(`/api/endpoint${i}`, { data: i });
      }

      expect(mobileOptimizer.mobileCache.size).toBeLessThanOrEqual(100);
    });
  });

  describe('Offline Support', () => {
    beforeEach(async () => {
      await mobileOptimizer.initialize();
    });

    test('should queue offline action', () => {
      const action = {
        type: 'trade',
        data: { amount: 100, token: 'ETH' }
      };

      mobileOptimizer.queueOfflineAction('user1', action);

      expect(mobileOptimizer.offlineQueue.has('user1')).toBe(true);
      expect(mobileOptimizer.offlineQueue.get('user1')).toHaveLength(1);
    });

    test('should process offline actions when online', async () => {
      const action = {
        type: 'trade',
        data: { amount: 100 }
      };

      mobileOptimizer.queueOfflineAction('user1', action);
      mobileOptimizer.executeOfflineAction = jest.fn().mockResolvedValue({ success: true });

      const result = await mobileOptimizer.processOfflineActions('user1');

      expect(result.processed).toHaveLength(1);
      expect(mobileOptimizer.executeOfflineAction).toHaveBeenCalledWith(action);
    });

    test('should handle offline action execution errors', async () => {
      const action = { type: 'trade', data: {} };
      mobileOptimizer.queueOfflineAction('user1', action);

      mobileOptimizer.executeOfflineAction = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await mobileOptimizer.processOfflineActions('user1');

      expect(result.failed).toHaveLength(1);
      expect(result.processed).toHaveLength(0);
    });
  });

  describe('Analytics', () => {
    beforeEach(async () => {
      await mobileOptimizer.initialize();
    });

    test('should provide mobile analytics', () => {
      // Add some test data
      mobileOptimizer.parseUserAgent('mobile-agent');
      mobileOptimizer.setCachedData('/api/test', { data: 'test' });
      mobileOptimizer.queueOfflineAction('user1', { type: 'test' });

      const analytics = mobileOptimizer.getMobileAnalytics();

      expect(analytics).toHaveProperty('deviceProfiles');
      expect(analytics).toHaveProperty('cacheSize');
      expect(analytics).toHaveProperty('offlineQueueSize');
      expect(analytics).toHaveProperty('pwaManifest');
    });

    test('should track compression statistics', () => {
      const originalResponse = { data: 'x'.repeat(1000) };
      const mockRequest = { headers: { 'user-agent': 'mobile-agent' } };

      mobileOptimizer.optimizeResponse(originalResponse, mockRequest);

      const analytics = mobileOptimizer.getMobileAnalytics();
      expect(analytics.compressionStats).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed user agent', () => {
      const malformedUA = '';
      const deviceInfo = mobileOptimizer.parseUserAgent(malformedUA);

      expect(deviceInfo).toBeDefined();
      expect(deviceInfo.device).toBeDefined();
    });

    test('should handle cache operations gracefully', () => {
      expect(() => {
        mobileOptimizer.setCachedData(null, 'data');
        mobileOptimizer.getCachedData(null);
      }).not.toThrow();
    });

    test('should handle offline queue operations safely', () => {
      expect(() => {
        mobileOptimizer.queueOfflineAction(null, { type: 'test' });
        mobileOptimizer.processOfflineActions(null);
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await mobileOptimizer.initialize();
    });

    test('should optimize response within reasonable time', () => {
      const largeResponse = {
        data: {
          items: Array(1000).fill({ id: 1, name: 'item', description: 'x'.repeat(100) })
        }
      };

      const mockRequest = { headers: { 'user-agent': 'mobile-agent' } };

      const startTime = Date.now();
      const optimized = mobileOptimizer.optimizeResponse(largeResponse, mockRequest);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
      expect(optimized).toBeDefined();
    });

    test('should handle large datasets efficiently', () => {
      const largeData = {
        array: Array(10000).fill('data'),
        object: Object.fromEntries(
          Array(1000).fill().map((_, i) => [`key${i}`, `value${i}`.repeat(10)])
        )
      };

      const mobileInfo = { device: { type: 'mobile' } };

      const startTime = Date.now();
      const compressed = mobileOptimizer.compressMobileData(largeData, mobileInfo);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50); // Should complete within 50ms
      expect(compressed.array._compressed).toBe(true);
    });
  });

  describe('Applied Optimizations', () => {
    beforeEach(async () => {
      await mobileOptimizer.initialize();
    });

    test('should list applied optimizations for mobile', () => {
      const mobileInfo = { device: { type: 'mobile' } };
      const optimizations = mobileOptimizer.getAppliedOptimizations(mobileInfo);

      expect(optimizations).toContain('precision_reduction');
      expect(optimizations).toContain('field_removal');
    });

    test('should list optimizations for low-power devices', () => {
      const lowPowerInfo = {
        device: { type: 'mobile' },
        capabilities: { processingPower: 'low' }
      };

      const optimizations = mobileOptimizer.getAppliedOptimizations(lowPowerInfo);
      expect(optimizations).toContain('data_compression');
    });
  });

  describe('Memory Management', () => {
    test('should cleanup all resources', async () => {
      await mobileOptimizer.initialize();

      // Add some data
      mobileOptimizer.setCachedData('/api/test', { data: 'test' });
      mobileOptimizer.parseUserAgent('test-agent');
      mobileOptimizer.queueOfflineAction('user1', { type: 'test' });

      mobileOptimizer.cleanup();

      expect(mobileOptimizer.mobileCache.size).toBe(0);
      expect(mobileOptimizer.deviceProfiles.size).toBe(0);
      expect(mobileOptimizer.offlineQueue.size).toBe(0);
    });
  });
});
