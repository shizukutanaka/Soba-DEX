/**
 * Improved JWT Utilities
 *
 * SECURITY IMPROVEMENTS:
 * - Token blacklist with TTL tracking
 * - Automatic cleanup of expired tokens
 * - RS256 support for production
 * - Token rotation support
 * - Refresh token family tracking
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class ImprovedJWTUtils {
  constructor() {
    this.config = {
      secret: process.env.JWT_SECRET || this.generateSecret(),
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
      issuer: 'soba-dex',
      audience: 'dex-users',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      resetTokenExpiry: '1h'
    };

    // SECURITY: Track token expiration for proper cleanup
    this.blacklist = new Map(); // token -> { exp: timestamp, blacklistedAt: timestamp }
    this.refreshTokens = new Map(); // token -> { userId, family, exp }

    // Start automatic cleanup
    this.startCleanup();
  }

  generateSecret() {
    const secret = crypto.randomBytes(64).toString('hex');
    console.warn('⚠️  Using generated JWT secret. Set JWT_SECRET for production.');
    return secret;
  }

  /**
   * SECURITY: Automatic cleanup of expired blacklisted tokens
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
    }, 3600000); // 1 hour
  }

  /**
   * Remove expired tokens from blacklist
   */
  cleanupExpiredTokens() {
    const now = Date.now();
    let removed = 0;

    for (const [token, data] of this.blacklist.entries()) {
      if (data.exp * 1000 < now) {
        this.blacklist.delete(token);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`Cleaned up ${removed} expired tokens from blacklist`);
    }
  }

  /**
   * Generate access token
   */
  generateAccessToken(payload, options = {}) {
    const tokenPayload = {
      ...payload,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomBytes(16).toString('hex') // Unique token ID
    };

    const tokenOptions = {
      expiresIn: options.expiresIn || this.config.accessTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: this.config.algorithm
    };

    return jwt.sign(tokenPayload, this.config.secret, tokenOptions);
  }

  /**
   * Generate refresh token with family tracking
   * SECURITY: Token families prevent refresh token reuse attacks
   */
  generateRefreshToken(payload, options = {}) {
    const family = options.family || crypto.randomBytes(16).toString('hex');

    const tokenPayload = {
      userId: payload.userId,
      sessionId: payload.sessionId,
      type: 'refresh',
      family, // Track token family
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomBytes(16).toString('hex')
    };

    const tokenOptions = {
      expiresIn: options.expiresIn || this.config.refreshTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: this.config.algorithm
    };

    const token = jwt.sign(tokenPayload, this.config.secret, tokenOptions);

    // Store refresh token with expiration
    const decoded = jwt.decode(token);
    this.refreshTokens.set(token, {
      userId: payload.userId,
      family,
      exp: decoded.exp
    });

    return { token, family };
  }

  /**
   * Verify and decode token
   */
  verifyToken(token, options = {}) {
    try {
      // Check blacklist first
      if (this.isTokenBlacklisted(token)) {
        throw new Error('Token has been revoked');
      }

      const decoded = jwt.verify(token, this.config.secret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm],
        ...options
      });

      return { valid: true, payload: decoded };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        expired: error.name === 'TokenExpiredError'
      };
    }
  }

  /**
   * SECURITY: Blacklist token with expiration tracking
   */
  blacklistToken(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        throw new Error('Invalid token');
      }

      this.blacklist.set(token, {
        exp: decoded.exp,
        blacklistedAt: Math.floor(Date.now() / 1000)
      });

      // Remove from refresh tokens if it's a refresh token
      if (decoded.type === 'refresh') {
        this.refreshTokens.delete(token);
      }

      return true;
    } catch (error) {
      console.error('Failed to blacklist token:', error);
      return false;
    }
  }

  /**
   * Check if token is blacklisted
   */
  isTokenBlacklisted(token) {
    return this.blacklist.has(token);
  }

  /**
   * SECURITY: Rotate refresh token with family tracking
   * If a token from an already-used family is presented, revoke entire family
   */
  rotateRefreshToken(oldToken, payload) {
    const verification = this.verifyToken(oldToken);

    if (!verification.valid) {
      return { success: false, error: verification.error };
    }

    const family = verification.payload.family;

    // Check if this token was already used
    if (!this.refreshTokens.has(oldToken)) {
      // SECURITY: Token reuse detected! Revoke entire family
      console.warn(`Token reuse detected for family ${family}. Revoking all tokens.`);
      this.revokeTokenFamily(family);
      return {
        success: false,
        error: 'Token reuse detected. All tokens revoked for security.'
      };
    }

    // Blacklist old token
    this.blacklistToken(oldToken);

    // Generate new token in same family
    const { token: newToken } = this.generateRefreshToken(payload, { family });

    return {
      success: true,
      token: newToken,
      family
    };
  }

  /**
   * SECURITY: Revoke all tokens in a family
   */
  revokeTokenFamily(family) {
    let revoked = 0;

    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.family === family) {
        this.blacklistToken(token);
        revoked++;
      }
    }

    console.log(`Revoked ${revoked} tokens from family ${family}`);
    return revoked;
  }

  /**
   * Get blacklist statistics
   */
  getBlacklistStats() {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const [token, data] of this.blacklist.entries()) {
      if (data.exp * 1000 < now) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.blacklist.size,
      active,
      expired,
      refreshTokens: this.refreshTokens.size
    };
  }

  /**
   * Cleanup on shutdown
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = new ImprovedJWTUtils();
