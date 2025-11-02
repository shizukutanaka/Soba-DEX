/**
 * Test Suite for Security Utilities
 */

const {
  SecurityErrorCodes,
  generateSecureId,
  isValidIP,
  sanitizeIP,
  isValidMethod,
  hasPathTraversal,
  hasSQLInjection,
  hasXSS,
  hasCommandInjection,
  sanitizeHeaders,
  validateConfig,
  safeDivide,
  exceedsMapLimit,
  trimMapToLimit,
  TokenBucket
} = require('./securityUtils');

describe('Security Utilities', () => {
  describe('generateSecureId', () => {
    test('should generate unique IDs', () => {
      const id1 = generateSecureId('test');
      const id2 = generateSecureId('test');
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^test_/);
    });

    test('should use custom prefix', () => {
      const id = generateSecureId('custom');
      expect(id).toMatch(/^custom_/);
    });
  });

  describe('isValidIP', () => {
    test('should validate IPv4 addresses', () => {
      expect(isValidIP('192.168.1.1')).toBe(true);
      expect(isValidIP('10.0.0.1')).toBe(true);
      expect(isValidIP('127.0.0.1')).toBe(true);
      expect(isValidIP('255.255.255.255')).toBe(true);
    });

    test('should reject invalid IPv4 addresses', () => {
      expect(isValidIP('256.256.256.256')).toBe(false);
      expect(isValidIP('192.168.1')).toBe(false);
      expect(isValidIP('192.168.1.1.1')).toBe(false);
      expect(isValidIP('abc.def.ghi.jkl')).toBe(false);
    });

    test('should validate IPv6 addresses', () => {
      expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isValidIP('fe80::1')).toBe(true);
      expect(isValidIP('::1')).toBe(true);
    });

    test('should handle invalid inputs', () => {
      expect(isValidIP('')).toBe(false);
      expect(isValidIP(null)).toBe(false);
      expect(isValidIP(undefined)).toBe(false);
      expect(isValidIP(123)).toBe(false);
    });
  });

  describe('sanitizeIP', () => {
    test('should extract first IP from X-Forwarded-For', () => {
      expect(sanitizeIP('192.168.1.1, 10.0.0.1')).toBe('192.168.1.1');
    });

    test('should remove port from IPv4', () => {
      expect(sanitizeIP('192.168.1.1:8080')).toBe('192.168.1.1');
    });

    test('should handle unknown IPs', () => {
      expect(sanitizeIP('')).toBe('unknown');
      expect(sanitizeIP(null)).toBe('unknown');
      expect(sanitizeIP('invalid')).toBe('unknown');
    });
  });

  describe('isValidMethod', () => {
    test('should validate HTTP methods', () => {
      expect(isValidMethod('GET')).toBe(true);
      expect(isValidMethod('POST')).toBe(true);
      expect(isValidMethod('PUT')).toBe(true);
      expect(isValidMethod('DELETE')).toBe(true);
      expect(isValidMethod('PATCH')).toBe(true);
    });

    test('should reject invalid methods', () => {
      expect(isValidMethod('INVALID')).toBe(false);
      expect(isValidMethod('get')).toBe(false);
      expect(isValidMethod('')).toBe(false);
    });
  });

  describe('hasPathTraversal', () => {
    test('should detect path traversal attempts', () => {
      expect(hasPathTraversal('../etc/passwd')).toBe(true);
      expect(hasPathTraversal('..\\windows\\system32')).toBe(true);
      expect(hasPathTraversal('%2e%2e/etc')).toBe(true);
    });

    test('should allow valid paths', () => {
      expect(hasPathTraversal('/api/users')).toBe(false);
      expect(hasPathTraversal('/path/to/resource')).toBe(false);
    });
  });

  describe('hasSQLInjection', () => {
    test('should detect SQL injection patterns', () => {
      expect(hasSQLInjection("' OR 1=1--")).toBe(true);
      expect(hasSQLInjection('UNION SELECT * FROM users')).toBe(true);
      expect(hasSQLInjection('DROP TABLE users')).toBe(true);
    });

    test('should allow normal SQL-like text', () => {
      expect(hasSQLInjection('select a product')).toBe(false);
      expect(hasSQLInjection('user name')).toBe(false);
    });
  });

  describe('hasXSS', () => {
    test('should detect XSS patterns', () => {
      expect(hasXSS('<script>alert("XSS")</script>')).toBe(true);
      expect(hasXSS('javascript:alert(1)')).toBe(true);
      expect(hasXSS('<img onerror=alert(1)>')).toBe(true);
    });

    test('should allow normal HTML-like text', () => {
      expect(hasXSS('Click here')).toBe(false);
      expect(hasXSS('User input text')).toBe(false);
    });
  });

  describe('hasCommandInjection', () => {
    test('should detect command injection patterns', () => {
      expect(hasCommandInjection('test; rm -rf /')).toBe(true);
      expect(hasCommandInjection('test | cat /etc/passwd')).toBe(true);
      expect(hasCommandInjection('$(whoami)')).toBe(true);
    });

    test('should allow normal text', () => {
      expect(hasCommandInjection('normal text')).toBe(false);
      expect(hasCommandInjection('user@example.com')).toBe(false);
    });
  });

  describe('sanitizeHeaders', () => {
    test('should redact sensitive headers', () => {
      const headers = {
        'authorization': 'Bearer token123',
        'cookie': 'session=abc',
        'content-type': 'application/json'
      };

      const sanitized = sanitizeHeaders(headers);
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized['content-type']).toBe('application/json');
    });

    test('should truncate long headers', () => {
      const longValue = 'a'.repeat(300);
      const headers = { 'user-agent': longValue };
      const sanitized = sanitizeHeaders(headers);
      expect(sanitized['user-agent'].length).toBeLessThan(longValue.length);
      expect(sanitized['user-agent']).toContain('[TRUNCATED]');
    });
  });

  describe('validateConfig', () => {
    test('should validate correct config', () => {
      const config = {
        monitoringInterval: 1000,
        alertThresholds: { high: 80, medium: 50, low: 20 },
        maxIncidents: 1000,
        retentionPeriod: 86400000
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid threshold ordering', () => {
      const config = {
        alertThresholds: { high: 50, medium: 80, low: 20 }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject out-of-range values', () => {
      const config = {
        monitoringInterval: 50, // Too low
        maxIncidents: 200000 // Too high
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });
  });

  describe('safeDivide', () => {
    test('should perform normal division', () => {
      expect(safeDivide(10, 2)).toBe(5);
      expect(safeDivide(100, 4)).toBe(25);
    });

    test('should return default on division by zero', () => {
      expect(safeDivide(10, 0)).toBe(0);
      expect(safeDivide(10, 0, 100)).toBe(100);
    });

    test('should handle infinity', () => {
      expect(safeDivide(10, Infinity, 0)).toBe(0);
    });
  });

  describe('exceedsMapLimit', () => {
    test('should detect when map exceeds limit', () => {
      const map = new Map();
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      expect(exceedsMapLimit(map, 2)).toBe(true);
      expect(exceedsMapLimit(map, 3)).toBe(false);
      expect(exceedsMapLimit(map, 4)).toBe(false);
    });
  });

  describe('trimMapToLimit', () => {
    test('should trim map to limit', () => {
      const map = new Map();
      map.set('a', { timestamp: 100 });
      map.set('b', { timestamp: 200 });
      map.set('c', { timestamp: 300 });
      map.set('d', { timestamp: 400 });

      trimMapToLimit(map, 2);
      expect(map.size).toBe(2);
      expect(map.has('a')).toBe(false);
      expect(map.has('b')).toBe(false);
      expect(map.has('c')).toBe(true);
      expect(map.has('d')).toBe(true);
    });
  });

  describe('TokenBucket', () => {
    test('should allow requests within capacity', () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.tryConsume(5)).toBe(true);
      expect(bucket.tryConsume(5)).toBe(true);
      expect(bucket.tryConsume(1)).toBe(false);
    });

    test('should refill tokens over time', async () => {
      const bucket = new TokenBucket(10, 10); // 10 tokens per second
      bucket.tryConsume(10); // Empty the bucket

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(bucket.tryConsume(1)).toBe(true);
    });

    test('should not exceed capacity', async () => {
      const bucket = new TokenBucket(5, 10);
      bucket.tryConsume(5);

      // Wait to refill
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(bucket.getRemainingTokens()).toBeLessThanOrEqual(5);
    });
  });
});
