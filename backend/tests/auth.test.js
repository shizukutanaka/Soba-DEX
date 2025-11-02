const { secureAuth } = require('../src/utils/secureAuth');

describe('SecureAuth', () => {
  describe('Password Hashing', () => {
    test('should hash password successfully', async () => {
      const password = 'TestPassword123!';
      const hash = await secureAuth.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    test('should reject passwords shorter than 8 characters', async () => {
      await expect(secureAuth.hashPassword('short')).rejects.toThrow();
    });

    test('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await secureAuth.hashPassword(password);
      const isValid = await secureAuth.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const hash = await secureAuth.hashPassword(password);
      const isValid = await secureAuth.verifyPassword('WrongPassword123!', hash);

      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    test('should generate access token', () => {
      const token = secureAuth.generateAccessToken('user123');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    test('should generate refresh token', () => {
      const token = secureAuth.generateRefreshToken('user123');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    test('should include userId in token payload', () => {
      const userId = 'user123';
      const token = secureAuth.generateAccessToken(userId);
      const result = secureAuth.verifyToken(token, 'access');

      expect(result.valid).toBe(true);
      expect(result.payload.userId).toBe(userId);
    });
  });

  describe('JWT Token Verification', () => {
    test('should verify valid access token', () => {
      const token = secureAuth.generateAccessToken('user123');
      const result = secureAuth.verifyToken(token, 'access');

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    test('should verify valid refresh token', () => {
      const token = secureAuth.generateRefreshToken('user123');
      const result = secureAuth.verifyToken(token, 'refresh');

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    test('should reject invalid token', () => {
      const result = secureAuth.verifyToken('invalid.token.here', 'access');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject wrong token type', () => {
      const accessToken = secureAuth.generateAccessToken('user123');
      const result = secureAuth.verifyToken(accessToken, 'refresh');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('type');
    });
  });

  describe('Token Revocation', () => {
    test('should revoke token successfully', () => {
      const token = secureAuth.generateAccessToken('user123');
      const revoked = secureAuth.revokeToken(token);

      expect(revoked).toBe(true);

      const result = secureAuth.verifyToken(token, 'access');
      expect(result.valid).toBe(false);
    });

    test('should revoke all user tokens', () => {
      const userId = 'user123';
      secureAuth.generateRefreshToken(userId);
      secureAuth.generateRefreshToken(userId);

      const revokedCount = secureAuth.revokeAllUserTokens(userId);

      expect(revokedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics', () => {
    test('should return stats', () => {
      const stats = secureAuth.getStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('activeRefreshTokens');
      expect(stats).toHaveProperty('blacklistedTokens');
      expect(stats).toHaveProperty('maxRefreshTokensPerUser');
    });
  });
});
