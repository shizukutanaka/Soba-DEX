const { SecureAuth } = require('../secureAuth');

describe('SecureAuth', () => {
  let auth;

  beforeEach(() => {
    auth = new SecureAuth();
  });

  afterEach(() => {
    auth.stopCleanup();
  });

  describe('Password Hashing', () => {
    test('should hash password successfully', async () => {
      const password = 'testPassword123!';
      const hash = await auth.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    test('should reject password shorter than 8 characters', async () => {
      await expect(auth.hashPassword('short')).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    test('should verify correct password', async () => {
      const password = 'testPassword123!';
      const hash = await auth.hashPassword(password);
      const isValid = await auth.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const password = 'testPassword123!';
      const hash = await auth.hashPassword(password);
      const isValid = await auth.verifyPassword('wrongPassword', hash);

      expect(isValid).toBe(false);
    });
  });

  describe('Access Token Generation', () => {
    test('should generate valid access token', () => {
      const userId = 'user123';
      const token = auth.generateAccessToken(userId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    test('should include custom payload in token', () => {
      const userId = 'user123';
      const customPayload = { role: 'admin' };
      const token = auth.generateAccessToken(userId, customPayload);

      const verification = auth.verifyToken(token, 'access');
      expect(verification.valid).toBe(true);
      expect(verification.payload.role).toBe('admin');
    });
  });

  describe('Refresh Token Management', () => {
    test('should generate and store refresh token', () => {
      const userId = 'user123';
      const token = auth.generateRefreshToken(userId);

      expect(token).toBeDefined();
      const stats = auth.getStats();
      expect(stats.activeRefreshTokens).toBe(1);
    });

    test('should limit refresh tokens per user', () => {
      const userId = 'user123';

      // Generate more than max allowed
      for (let i = 0; i < 7; i++) {
        auth.generateRefreshToken(userId);
      }

      const stats = auth.getStats();
      expect(stats.activeRefreshTokens).toBeLessThanOrEqual(5);
    });

    test('should verify valid refresh token', () => {
      const userId = 'user123';
      const token = auth.generateRefreshToken(userId);

      const verification = auth.verifyToken(token, 'refresh');
      expect(verification.valid).toBe(true);
      expect(verification.payload.userId).toBe(userId);
    });
  });

  describe('Token Revocation', () => {
    test('should revoke access token', () => {
      const userId = 'user123';
      const token = auth.generateAccessToken(userId);

      const revoked = auth.revokeToken(token);
      expect(revoked).toBe(true);

      const verification = auth.verifyToken(token, 'access');
      expect(verification.valid).toBe(false);
      expect(verification.error).toBe('Token has been revoked');
    });

    test('should revoke refresh token', () => {
      const userId = 'user123';
      const token = auth.generateRefreshToken(userId);

      const revoked = auth.revokeToken(token);
      expect(revoked).toBe(true);

      const verification = auth.verifyToken(token, 'refresh');
      expect(verification.valid).toBe(false);
    });

    test('should revoke all user tokens', () => {
      const userId = 'user123';

      // Generate multiple tokens
      auth.generateRefreshToken(userId);
      auth.generateRefreshToken(userId);
      auth.generateRefreshToken(userId);

      const revokedCount = auth.revokeAllUserTokens(userId);
      expect(revokedCount).toBe(3);

      const stats = auth.getStats();
      expect(stats.activeRefreshTokens).toBe(0);
    });
  });

  describe('Token Cleanup', () => {
    test('should cleanup expired refresh tokens', () => {
      const userId = 'user123';
      const token = auth.generateRefreshToken(userId);

      // Manually set token as expired
      const decoded = require('jsonwebtoken').decode(token);
      const tokenData = auth.refreshTokens.get(decoded.tokenId);
      tokenData.lastUsed = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago

      const cleaned = auth.cleanupExpiredTokens();
      expect(cleaned).toBeGreaterThan(0);
    });

    test('should cleanup expired blacklisted tokens', () => {
      const userId = 'user123';
      const token = auth.generateAccessToken(userId);

      auth.revokeToken(token);

      // Manually expire the blacklisted token
      auth.blacklistedTokens.set(token, Date.now() - 1000);

      const cleaned = auth.cleanupBlacklistedTokens();
      expect(cleaned).toBeGreaterThan(0);
    });
  });

  describe('Token Validation', () => {
    test('should reject expired token', (done) => {
      // Use very short expiry for testing
      process.env.JWT_EXPIRES_IN = '1ms';
      const tempAuth = new SecureAuth();

      const token = tempAuth.generateAccessToken('user123');

      setTimeout(() => {
        const verification = tempAuth.verifyToken(token, 'access');
        expect(verification.valid).toBe(false);
        expect(verification.error).toBe('Token expired');
        tempAuth.stopCleanup();
        delete process.env.JWT_EXPIRES_IN;
        done();
      }, 10);
    });

    test('should reject invalid token', () => {
      const verification = auth.verifyToken('invalid.token.here', 'access');
      expect(verification.valid).toBe(false);
      expect(verification.error).toBe('Invalid token');
    });

    test('should reject wrong token type', () => {
      const accessToken = auth.generateAccessToken('user123');
      const verification = auth.verifyToken(accessToken, 'refresh');

      expect(verification.valid).toBe(false);
      expect(verification.error).toBe('Invalid token type');
    });
  });

  describe('Statistics', () => {
    test('should return accurate statistics', () => {
      const userId1 = 'user1';
      const userId2 = 'user2';

      auth.generateRefreshToken(userId1);
      auth.generateRefreshToken(userId2);

      const token = auth.generateAccessToken(userId1);
      auth.revokeToken(token);

      const stats = auth.getStats();
      expect(stats.activeRefreshTokens).toBe(2);
      expect(stats.blacklistedTokens).toBe(1);
      expect(stats.maxRefreshTokensPerUser).toBe(5);
    });
  });
});
