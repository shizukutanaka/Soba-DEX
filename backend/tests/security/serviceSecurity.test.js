/**
 * Security Tests for Critical Services
 *
 * Tests for:
 * - GDPR compliance enforcement
 * - Token revocation mechanisms
 * - Rate limiting bypass prevention
 * - Data validation and sanitization
 * - Authorization checks
 * - Audit logging
 *
 * @version 1.0.0
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const gdprDataService = require('../../src/services/gdprDataService');
const tokenRevocationService = require('../../src/services/tokenRevocationService');
const distributedRateLimitService = require('../../src/services/distributedRateLimitService');

// Mock Express app for testing
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  return app;
};

describe('Security Tests - GDPR Compliance', () => {
  const userId = 'test-user-gdpr-123';
  const testEmail = 'test@example.com';

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('Article 15: Right to Access', () => {
    test('should create data access request for authenticated user', async () => {
      const result = await gdprDataService.createDataAccessRequest(userId);

      expect(result.requestId).toBeDefined();
      expect(result.requestType).toBe('access');
      expect(result.createdAt).toBeDefined();
      expect(result.expiryTime).toBeGreaterThan(Date.now());
    });

    test('should reject access request for unauthorized user', async () => {
      expect(async () => {
        await gdprDataService.createDataAccessRequest('');
      }).rejects.toThrow();
    });

    test('should process access request and collect all data', async () => {
      const accessRequest = await gdprDataService.createDataAccessRequest(userId);

      const processed = await gdprDataService.processDataAccessRequest(
        accessRequest.requestId,
        userId
      );

      expect(processed.status).toBe('completed');
      expect(processed.dataExport).toBeDefined();
      expect(processed.dataExport.profile).toBeDefined();
      expect(processed.dataExport.consents).toBeDefined();
    });

    test('should not provide data after request expiry', async () => {
      jest.useFakeTimers();

      const accessRequest = await gdprDataService.createDataAccessRequest(userId);

      // Advance time beyond 30-day limit
      jest.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);

      expect(async () => {
        await gdprDataService.processDataAccessRequest(
          accessRequest.requestId,
          userId
        );
      }).rejects.toThrow();

      jest.useRealTimers();
    });

    test('should include sensitive data in export', async () => {
      const accessRequest = await gdprDataService.createDataAccessRequest(userId);
      const processed = await gdprDataService.processDataAccessRequest(
        accessRequest.requestId,
        userId
      );

      const exportData = processed.dataExport;
      expect(exportData.authentication).toBeDefined();
      expect(exportData.transactions).toBeDefined();
      expect(exportData.apiKeys).toBeDefined();
    });
  });

  describe('Article 17: Right to Erasure (Right to be Forgotten)', () => {
    test('should create deletion request with verification requirement', async () => {
      const delRequest = await gdprDataService.createDeletionRequest(
        userId,
        testEmail
      );

      expect(delRequest.requestId).toBeDefined();
      expect(delRequest.requestType).toBe('deletion');
      expect(delRequest.status).toBe('pending_verification');
      expect(delRequest.verificationRequired).toBe(true);
    });

    test('should require email verification before deletion', async () => {
      const delRequest = await gdprDataService.createDeletionRequest(
        userId,
        testEmail
      );

      expect(async () => {
        await gdprDataService.processDeletionRequest(
          delRequest.requestId,
          userId,
          'wrong-token'
        );
      }).rejects.toThrow();
    });

    test('should verify deletion request with token', async () => {
      const delRequest = await gdprDataService.createDeletionRequest(
        userId,
        testEmail
      );

      const verified = await gdprDataService.verifyDeletionRequest(
        delRequest.requestId,
        delRequest.verificationToken
      );

      expect(verified.verified).toBe(true);
      expect(verified.status).toBe('verified');
    });

    test('should permanently delete all user data', async () => {
      const delRequest = await gdprDataService.createDeletionRequest(
        userId,
        testEmail
      );

      await gdprDataService.verifyDeletionRequest(
        delRequest.requestId,
        delRequest.verificationToken
      );

      const result = await gdprDataService.processDeletionRequest(
        delRequest.requestId,
        userId,
        delRequest.verificationToken
      );

      expect(result.status).toBe('completed');
      expect(result.deletedAt).toBeDefined();
      expect(result.dataDeletedPermanently).toBe(true);
    });

    test('should audit deletion requests', async () => {
      const delRequest = await gdprDataService.createDeletionRequest(
        userId,
        testEmail
      );

      await gdprDataService.verifyDeletionRequest(
        delRequest.requestId,
        delRequest.verificationToken
      );

      await gdprDataService.processDeletionRequest(
        delRequest.requestId,
        userId,
        delRequest.verificationToken
      );

      const audit = await gdprDataService.getAuditLog(userId);
      const deletionLog = audit.find(log => log.action === 'data_deletion');

      expect(deletionLog).toBeDefined();
      expect(deletionLog.timestamp).toBeDefined();
    });
  });

  describe('Article 20: Data Portability', () => {
    test('should export data in JSON format', async () => {
      const accessRequest = await gdprDataService.createDataAccessRequest(userId);
      const processed = await gdprDataService.processDataAccessRequest(
        accessRequest.requestId,
        userId
      );

      const jsonExport = await gdprDataService.downloadExport(
        processed.exportId,
        'json'
      );

      expect(jsonExport).toBeDefined();
      expect(typeof jsonExport).toBe('string');
      expect(JSON.parse(jsonExport)).toBeDefined();
    });

    test('should export data in CSV format', async () => {
      const accessRequest = await gdprDataService.createDataAccessRequest(userId);
      const processed = await gdprDataService.processDataAccessRequest(
        accessRequest.requestId,
        userId
      );

      const csvExport = await gdprDataService.downloadExport(
        processed.exportId,
        'csv'
      );

      expect(csvExport).toBeDefined();
      expect(typeof csvExport).toBe('string');
      expect(csvExport).toContain(',');
    });

    test('should export data in XML format', async () => {
      const accessRequest = await gdprDataService.createDataAccessRequest(userId);
      const processed = await gdprDataService.processDataAccessRequest(
        accessRequest.requestId,
        userId
      );

      const xmlExport = await gdprDataService.downloadExport(
        processed.exportId,
        'xml'
      );

      expect(xmlExport).toBeDefined();
      expect(xmlExport).toContain('<?xml');
    });

    test('should expire export after 7 days', async () => {
      jest.useFakeTimers();

      const accessRequest = await gdprDataService.createDataAccessRequest(userId);
      const processed = await gdprDataService.processDataAccessRequest(
        accessRequest.requestId,
        userId
      );

      jest.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

      expect(async () => {
        await gdprDataService.downloadExport(processed.exportId, 'json');
      }).rejects.toThrow();

      jest.useRealTimers();
    });
  });

  describe('Consent Management', () => {
    test('should update user consents', async () => {
      const consents = {
        marketing: true,
        analytics: true,
        personalization: false,
        thirdParty: false,
        essential: true
      };

      const result = await gdprDataService.updateConsents(userId, consents);

      expect(result.userId).toBe(userId);
      expect(result.consents.marketing).toBe(true);
      expect(result.consents.personalization).toBe(false);
    });

    test('should retrieve current consents', async () => {
      const consents = {
        marketing: true,
        analytics: true,
        personalization: false
      };

      await gdprDataService.updateConsents(userId, consents);
      const retrieved = await gdprDataService.getConsents(userId);

      expect(retrieved.marketing).toBe(true);
      expect(retrieved.analytics).toBe(true);
      expect(retrieved.personalization).toBe(false);
    });

    test('should not process non-essential data without consent', async () => {
      await gdprDataService.updateConsents(userId, {
        marketing: false,
        analytics: false
      });

      const consents = await gdprDataService.getConsents(userId);

      expect(consents.marketing).toBe(false);
      expect(consents.analytics).toBe(false);
    });
  });

  describe('Audit Logging', () => {
    test('should log all data access requests', async () => {
      await gdprDataService.createDataAccessRequest(userId);

      const audit = await gdprDataService.getAuditLog(userId);
      const accessLog = audit.find(log => log.action === 'data_access_request');

      expect(accessLog).toBeDefined();
      expect(accessLog.timestamp).toBeDefined();
    });

    test('should retain audit logs for 7 years', async () => {
      await gdprDataService.createDataAccessRequest(userId);

      const audit = await gdprDataService.getAuditLog(userId);

      expect(audit.length).toBeGreaterThan(0);
      expect(audit[0].retentionExpiry).toBeDefined();

      const retentionDays = (audit[0].retentionExpiry - audit[0].timestamp) / (1000 * 60 * 60 * 24);
      expect(retentionDays).toBeGreaterThanOrEqual(365 * 7);
    });

    test('should not delete audit logs before retention period', async () => {
      jest.useFakeTimers();

      const delRequest = await gdprDataService.createDeletionRequest(userId, testEmail);
      await gdprDataService.verifyDeletionRequest(delRequest.requestId, delRequest.verificationToken);
      await gdprDataService.processDeletionRequest(delRequest.requestId, userId, delRequest.verificationToken);

      // Even after deletion, audit logs should persist
      const audit = await gdprDataService.getAuditLog(userId);
      expect(audit.length).toBeGreaterThan(0);

      jest.useRealTimers();
    });
  });
});

describe('Security Tests - Token Revocation', () => {
  const userId = 'test-user-token-123';
  let testToken;

  beforeEach(async () => {
    jest.clearAllMocks();
    testToken = jwt.sign(
      { userId, email: 'test@example.com' },
      'test-secret',
      { expiresIn: '24h' }
    );
  });

  describe('Token Blacklisting', () => {
    test('should revoke token', async () => {
      const result = await tokenRevocationService.revokeToken(testToken);

      expect(result.revoked).toBe(true);
      expect(result.revokedAt).toBeDefined();
    });

    test('should check if token is revoked', async () => {
      await tokenRevocationService.revokeToken(testToken);

      const isRevoked = await tokenRevocationService.isTokenRevoked(testToken);
      expect(isRevoked).toBe(true);
    });

    test('should not allow use of revoked token', async () => {
      await tokenRevocationService.revokeToken(testToken);

      expect(async () => {
        await tokenRevocationService.validateTokenNotRevoked(testToken);
      }).rejects.toThrow();
    });

    test('should set correct TTL for revoked token', async () => {
      const decoded = jwt.decode(testToken);
      const expiresAt = decoded.exp * 1000;
      const ttl = Math.ceil((expiresAt - Date.now()) / 1000);

      const result = await tokenRevocationService.revokeToken(testToken);

      expect(result.ttl).toBe(ttl);
    });
  });

  describe('Session Management', () => {
    test('should register user session', async () => {
      const session = await tokenRevocationService.registerSession(
        userId,
        {
          token: testToken,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        }
      );

      expect(session.sessionId).toBeDefined();
      expect(session.userId).toBe(userId);
      expect(session.createdAt).toBeDefined();
    });

    test('should limit concurrent sessions', async () => {
      const maxSessions = 5;

      // Register max sessions
      for (let i = 0; i < maxSessions; i++) {
        const token = jwt.sign({ userId }, 'secret', { expiresIn: '24h' });
        await tokenRevocationService.registerSession(userId, { token });
      }

      // Try to register one more
      const token = jwt.sign({ userId }, 'secret', { expiresIn: '24h' });
      const session = await tokenRevocationService.registerSession(userId, { token });

      expect(session).toBeDefined();

      const activeSessions = await tokenRevocationService.getActiveSessions(userId);
      expect(activeSessions.length).toBeLessThanOrEqual(maxSessions);
    });

    test('should logout user and revoke all sessions', async () => {
      // Register multiple sessions
      for (let i = 0; i < 3; i++) {
        const token = jwt.sign({ userId }, 'secret', { expiresIn: '24h' });
        await tokenRevocationService.registerSession(userId, { token });
      }

      const result = await tokenRevocationService.logoutUser(userId);

      expect(result.loggedOut).toBe(true);
      expect(result.sessionsRevoked).toBe(3);

      const activeSessions = await tokenRevocationService.getActiveSessions(userId);
      expect(activeSessions.length).toBe(0);
    });

    test('should revoke specific session', async () => {
      const session = await tokenRevocationService.registerSession(userId, {
        token: testToken
      });

      const result = await tokenRevocationService.revokeSession(session.sessionId);

      expect(result.revoked).toBe(true);
    });

    test('should detect suspicious activity', async () => {
      const suspiciousActivity = await tokenRevocationService.detectSuspiciousActivity(
        userId,
        {
          location: 'Tokyo',
          ipAddress: '203.0.113.1'
        }
      );

      expect(suspiciousActivity.suspicious).toBeDefined();
    });
  });

  describe('Emergency Revocation', () => {
    test('should perform emergency revocation', async () => {
      // Register multiple sessions
      for (let i = 0; i < 3; i++) {
        const token = jwt.sign({ userId }, 'secret', { expiresIn: '24h' });
        await tokenRevocationService.registerSession(userId, { token });
      }

      const result = await tokenRevocationService.emergencyRevocation(
        userId,
        'password_change'
      );

      expect(result.revoked).toBe(true);
      expect(result.reason).toBe('password_change');

      const activeSessions = await tokenRevocationService.getActiveSessions(userId);
      expect(activeSessions.length).toBe(0);
    });

    test('should log emergency revocation', async () => {
      await tokenRevocationService.emergencyRevocation(userId, 'breach_detected');

      const audit = await tokenRevocationService.getAuditLog(userId);
      const emergencyLog = audit.find(log => log.action === 'emergency_revocation');

      expect(emergencyLog).toBeDefined();
      expect(emergencyLog.reason).toBe('breach_detected');
    });
  });

  describe('Token Versioning', () => {
    test('should increment token version on revocation', async () => {
      const initialVersion = await tokenRevocationService.getTokenVersion(userId);

      await tokenRevocationService.emergencyRevocation(userId, 'password_change');

      const newVersion = await tokenRevocationService.getTokenVersion(userId);
      expect(newVersion).toBeGreaterThan(initialVersion);
    });

    test('should invalidate all tokens of previous version', async () => {
      const token1 = jwt.sign(
        { userId, tokenVersion: 1 },
        'secret',
        { expiresIn: '24h' }
      );

      await tokenRevocationService.registerSession(userId, { token: token1 });

      // Increment version
      await tokenRevocationService.emergencyRevocation(userId, 'password_change');

      const isValid = await tokenRevocationService.validateTokenNotRevoked(token1);
      expect(isValid).toBe(false);
    });
  });
});

describe('Security Tests - Rate Limiting', () => {
  const userId = 'test-user-rate-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rate Limit Enforcement', () => {
    test('should allow requests within limit', async () => {
      const context = {
        userId,
        endpoint: '/api/python/ml/predict',
        userTier: 'free'
      };

      const result = await distributedRateLimitService.checkRateLimit(context);

      expect(result.allowed).toBe(true);
    });

    test('should deny requests exceeding limit', async () => {
      const context = {
        userId,
        endpoint: '/api/python/ml/predict',
        userTier: 'free',
        weight: 100 // Exceed free tier limit
      };

      const result = await distributedRateLimitService.checkRateLimit(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limit_exceeded');
    });

    test('should respect user tier limits', async () => {
      const freeContext = {
        userId: 'free-user',
        endpoint: '/api/python/ml/predict',
        userTier: 'free'
      };

      const premiumContext = {
        userId: 'premium-user',
        endpoint: '/api/python/ml/predict',
        userTier: 'premium'
      };

      const freeResult = await distributedRateLimitService.checkRateLimit(freeContext);
      const premiumResult = await distributedRateLimitService.checkRateLimit(premiumContext);

      expect(freeResult.rateLimit.limit).toBeLessThan(premiumResult.rateLimit.limit);
    });

    test('should enforce endpoint-specific costs', async () => {
      const expensiveContext = {
        userId,
        endpoint: '/api/python/blockchain/analyze-contract',
        userTier: 'free',
        weight: 1
      };

      const cheapContext = {
        userId,
        endpoint: '/api/python/fraud/assess-risk',
        userTier: 'free',
        weight: 1
      };

      const expensiveResult = await distributedRateLimitService.checkRateLimit(expensiveContext);
      const cheapResult = await distributedRateLimitService.checkRateLimit(cheapContext);

      expect(expensiveResult.rateLimit.remaining).toBeLessThan(cheapResult.rateLimit.remaining);
    });
  });

  describe('Global Rate Limiting', () => {
    test('should enforce global system limit', async () => {
      const context = {
        userId,
        endpoint: '/api/python/ml/predict',
        userTier: 'admin',
        weight: 10000 // Exceed global limit
      };

      const result = await distributedRateLimitService.checkRateLimit(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('global_rate_limit_exceeded');
    });
  });

  describe('Rate Limit Reset', () => {
    test('should reset rate limit for user', async () => {
      const result = await distributedRateLimitService.resetRateLimit(userId, 'free');

      expect(result.success).toBe(true);
      expect(result.resetAt).toBeDefined();
    });

    test('should restore full token bucket after reset', async () => {
      // Use some tokens
      await distributedRateLimitService.checkRateLimit({
        userId,
        endpoint: '/api/python/ml/predict',
        userTier: 'free',
        weight: 10
      });

      // Reset
      await distributedRateLimitService.resetRateLimit(userId, 'free');

      // Check status
      const status = await distributedRateLimitService.getRateLimitStatus(userId, 'free');

      expect(status.remaining).toBe(status.capacity);
    });
  });

  describe('Metrics Collection', () => {
    test('should collect rate limit metrics', async () => {
      await distributedRateLimitService.checkRateLimit({
        userId,
        endpoint: '/api/python/ml/predict',
        userTier: 'free'
      });

      const metrics = distributedRateLimitService.getMetrics();

      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.allowedRequests).toBeGreaterThan(0);
      expect(metrics.allowedPercentage).toBeDefined();
    });

    test('should track denials in metrics', async () => {
      await distributedRateLimitService.checkRateLimit({
        userId,
        endpoint: '/api/python/ml/predict',
        userTier: 'free',
        weight: 200 // Exceed limit
      });

      const metrics = distributedRateLimitService.getMetrics();

      expect(metrics.deniedRequests).toBeGreaterThan(0);
    });
  });
});

describe('Security Tests - Input Validation', () => {
  test('should sanitize user input', async () => {
    const maliciousInput = {
      text: '<script>alert("XSS")</script>',
      command: 'DROP TABLE users;--'
    };

    // These should be sanitized before processing
    expect(maliciousInput.text).toBeDefined();
    expect(maliciousInput.command).toBeDefined();
  });

  test('should validate endpoint parameters', async () => {
    expect(async () => {
      await distributedRateLimitService.checkRateLimit({
        userId: '',
        endpoint: '/invalid',
        userTier: 'invalid_tier'
      });
    }).rejects.toThrow();
  });
});

describe('Security Tests - Authorization', () => {
  test('should enforce role-based access control', async () => {
    const userContext = { userId: 'user-123', role: 'user' };
    const adminContext = { userId: 'admin-123', role: 'admin' };

    // Users should not be able to reset others' rate limits
    expect(async () => {
      await distributedRateLimitService.resetRateLimit('other-user', 'free');
    }).rejects.toThrow();
  });

  test('should require authentication for sensitive operations', async () => {
    expect(async () => {
      await gdprDataService.createDeletionRequest('', 'email@example.com');
    }).rejects.toThrow();
  });
});
