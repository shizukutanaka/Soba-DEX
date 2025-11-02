const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('./productionLogger');

const SALT_ROUNDS = 12;
const MIN_JWT_SECRET_LENGTH = 32;

// Validate JWT_SECRET at startup
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`);
  }
  return secret;
})();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

/**
 * SecureAuth class for managing authentication tokens and password hashing
 * Implements automatic cleanup of expired tokens to prevent memory leaks
 */
class SecureAuth {
  /**
   * Initialize SecureAuth with token storage and automatic cleanup
   */
  constructor() {
    this.refreshTokens = new Map();
    this.blacklistedTokens = new Map(); // Changed to Map with expiration timestamps
    this.maxRefreshTokensPerUser = 5;
    this.maxTotalRefreshTokens = 50000;
    this.maxBlacklistedTokens = 100000;
    this.refreshTokenInactivityMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.tokenCleanupInterval = 30 * 60 * 1000; // 30 minutes
    this.cleanupTimer = null;
    this.cleanupMetrics = {
      lastRunAt: null,
      lastRunSummary: null,
      expiredRemovedTotal: 0,
      inactiveRemovedTotal: 0,
      overflowRemovedTotal: 0,
      blacklistRemovedTotal: 0,
      blacklistOverflowTotal: 0,
      lastOverflowAt: null,
      lastBlacklistCleanupAt: null,
      lastBlacklistScanAt: null
    };
    this.startAutomaticCleanup();
  }

  /**
   * Start automatic cleanup of expired tokens
   * Runs every 30 minutes to prevent memory leaks
   */
  startAutomaticCleanup() {
    if (this.cleanupTimer) {
      return;
    }

    // Comprehensive cleanup every 30 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredTokens();
      this.cleanupBlacklistedTokens();

      if (this.refreshTokens.size > this.maxTotalRefreshTokens) {
        const excess = Math.max(1, Math.ceil(this.refreshTokens.size * 0.1));
        this.cleanupOldestRefreshTokens(excess);
      }
    }, this.tokenCleanupInterval);

    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  cleanupOldestBlacklistedTokens(count) {
    if (count <= 0) {
      return 0;
    }

    const sorted = Array.from(this.blacklistedTokens.entries())
      .sort((a, b) => a[1] - b[1]);

    let removed = 0;

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      this.blacklistedTokens.delete(sorted[i][0]);
      removed++;
    }

    if (removed > 0) {
      const timestamp = new Date().toISOString();
      this.cleanupMetrics.blacklistOverflowTotal += removed;
      this.cleanupMetrics.lastBlacklistCleanupAt = timestamp;
      logger.warn('[SecureAuth] Blacklist overflow pruned', { removed });
    }

    return removed;
  }

  /**
   * Stop automatic cleanup (useful for graceful shutdown)
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cleanupMetrics.lastRunAt = new Date().toISOString();
  }

  /**
   * Hash a password using bcrypt
   * @param {string} password - Plain text password to hash
   * @returns {Promise<string>} Hashed password
   * @throws {Error} If password is less than 8 characters
   */
  async hashPassword(password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    return await bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify a password against a hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} True if password matches
   */
  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (_error) {
      return false;
    }
  }

  /**
   * Generate a JWT access token
   * @param {string} userId - User identifier
   * @param {Object} payload - Additional payload data
   * @returns {string} JWT access token
   */
  generateAccessToken(userId, payload = {}, options = {}) {
    const { expiresIn = JWT_EXPIRES_IN } = options;
    return jwt.sign(
      {
        userId,
        type: 'access',
        ...payload
      },
      JWT_SECRET,
      {
        expiresIn,
        issuer: 'dex-platform',
        audience: 'dex-api'
      }
    );
  }

  generateRefreshToken(userId) {
    const tokenId = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign(
      {
        userId,
        tokenId,
        type: 'refresh'
      },
      JWT_SECRET,
      {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
        issuer: 'dex-platform',
        audience: 'dex-api'
      }
    );

    this.cleanupUserRefreshTokens(userId);
    this.cleanupExpiredTokens();

    const decoded = jwt.decode(token) || {};
    const expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + this.refreshTokenInactivityMs;

    this.refreshTokens.set(tokenId, {
      userId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      expiresAt
    });

    if (this.refreshTokens.size > this.maxTotalRefreshTokens) {
      const excess = Math.max(1, this.refreshTokens.size - this.maxTotalRefreshTokens);
      this.cleanupOldestRefreshTokens(excess);
    }

    return token;
  }

  issueTokens(userId, payload = {}, options = {}) {
    const {
      access: accessOptions = {},
      includeMetadata = true
    } = options;

    const accessToken = this.generateAccessToken(userId, payload, accessOptions);
    const refreshToken = this.generateRefreshToken(userId);

    if (!includeMetadata) {
      return { accessToken, refreshToken };
    }

    const accessClaims = jwt.decode(accessToken) || {};
    const refreshDetails = this.getRefreshTokenDetails(refreshToken);

    return {
      accessToken,
      refreshToken,
      metadata: {
        access: {
          issuedAt: accessClaims.iat ? accessClaims.iat * 1000 : null,
          expiresAt: accessClaims.exp ? accessClaims.exp * 1000 : null,
          payload: {
            userId,
            ...payload
          }
        },
        refresh: refreshDetails
          ? {
            tokenId: refreshDetails.tokenId,
            userId: refreshDetails.userId,
            issuedAt: refreshDetails.issuedAt,
            expiresAt: refreshDetails.expiresAt,
            lastUsed: refreshDetails.lastUsed
          }
          : null
      }
    };
  }

  verifyToken(token, type = 'access') {
    try {
      // Check if token is blacklisted and not expired
      if (this.blacklistedTokens.has(token)) {
        const expiresAt = this.blacklistedTokens.get(token);
        if (Date.now() < expiresAt) {
          return { valid: false, error: 'Token has been revoked' };
        }
        // Remove expired blacklisted token
        this.blacklistedTokens.delete(token);
      }

      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'dex-platform',
        audience: 'dex-api'
      });

      if (decoded.type !== type) {
        return { valid: false, error: 'Invalid token type' };
      }

      if (type === 'refresh' && !this.refreshTokens.has(decoded.tokenId)) {
        return { valid: false, error: 'Refresh token not found' };
      }

      if (type === 'refresh') {
        const tokenData = this.refreshTokens.get(decoded.tokenId);
        tokenData.lastUsed = Date.now();
      }

      return {
        valid: true,
        payload: decoded
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token expired' };
      }
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: error.message };
    }
  }

  revokeToken(token) {
    return this.blacklistToken(token);
  }

  revokeAllUserTokens(userId) {
    const tokensToRevoke = [];

    for (const [tokenId, data] of this.refreshTokens.entries()) {
      if (data.userId === userId) {
        tokensToRevoke.push(tokenId);
      }
    }

    tokensToRevoke.forEach(tokenId => this.refreshTokens.delete(tokenId));

    return tokensToRevoke.length;
  }

  cleanupUserRefreshTokens(userId) {
    const userTokens = [];

    for (const [tokenId, data] of this.refreshTokens.entries()) {
      if (data.userId === userId) {
        userTokens.push({ tokenId, ...data });
      }
    }

    userTokens.sort((a, b) => b.lastUsed - a.lastUsed);

    while (userTokens.length >= this.maxRefreshTokensPerUser) {
      const oldest = userTokens.pop();
      this.refreshTokens.delete(oldest.tokenId);
    }
  }

  cleanupExpiredTokens() {
    const now = Date.now();
    let cleaned = 0;
    let expiredRemoved = 0;
    let inactiveRemoved = 0;

    for (const [tokenId, data] of this.refreshTokens.entries()) {
      const expired = data.expiresAt && now >= data.expiresAt;
      const inactive = data.lastUsed && (now - data.lastUsed > this.refreshTokenInactivityMs);

      if (expired || inactive) {
        this.refreshTokens.delete(tokenId);
        cleaned++;
        if (expired) {
          expiredRemoved++;
        }
        if (inactive) {
          inactiveRemoved++;
        }
      }
    }

    const timestamp = new Date().toISOString();
    this.cleanupMetrics.lastRunAt = timestamp;
    this.cleanupMetrics.lastRunSummary = {
      expiredRemoved,
      inactiveRemoved,
      totalRemoved: cleaned,
      timestamp
    };

    if (cleaned > 0) {
      this.cleanupMetrics.expiredRemovedTotal += expiredRemoved;
      this.cleanupMetrics.inactiveRemovedTotal += inactiveRemoved;
      logger.info('[SecureAuth] Expired refresh tokens cleaned', {
        totalRemoved: cleaned,
        expiredRemoved,
        inactiveRemoved
      });
    }

    return cleaned;
  }

  cleanupBlacklistedTokens() {
    const now = Date.now();
    let cleaned = 0;

    for (const [token, expiresAt] of this.blacklistedTokens.entries()) {
      if (now > expiresAt) {
        this.blacklistedTokens.delete(token);
        cleaned++;
      }
    }

    const timestamp = new Date().toISOString();
    this.cleanupMetrics.lastBlacklistScanAt = timestamp;

    if (cleaned > 0) {
      this.cleanupMetrics.blacklistRemovedTotal += cleaned;
      this.cleanupMetrics.lastBlacklistCleanupAt = timestamp;
    }

    return cleaned;
  }

  blacklistToken(token, ttlMs = 24 * 60 * 60 * 1000) {
    if (!token) {
      return false;
    }

    try {
      const decoded = jwt.decode(token);

      if (decoded && decoded.tokenId) {
        this.refreshTokens.delete(decoded.tokenId);
      }

      const expiresAt = Date.now() + ttlMs;
      this.blacklistedTokens.set(token, expiresAt);

      if (this.blacklistedTokens.size > this.maxBlacklistedTokens) {
        const overflowCount = this.blacklistedTokens.size - this.maxBlacklistedTokens;
        const removed = this.cleanupOldestBlacklistedTokens(Math.max(1, overflowCount));
        if (removed > 0) {
          logger.warn('[SecureAuth] Blacklist capped to prevent growth', {
            overflowCount,
            removed,
            maxBlacklistedTokens: this.maxBlacklistedTokens
          });
        }
      }

      return true;
    } catch (_error) {
      return false;
    }
  }

  isTokenBlacklisted(token) {
    if (!token) {
      return false;
    }

    const expiresAt = this.blacklistedTokens.get(token);
    if (!expiresAt) {
      return false;
    }

    if (Date.now() > expiresAt) {
      this.blacklistedTokens.delete(token);
      return false;
    }

    return true;
  }

  getRefreshTokenDetails(token) {
    const validation = this.verifyToken(token, 'refresh');
    if (!validation.valid) {
      return null;
    }

    const tokenMeta = this.refreshTokens.get(validation.payload.tokenId);
    if (!tokenMeta) {
      return null;
    }

    return {
      tokenId: validation.payload.tokenId,
      userId: validation.payload.userId,
      issuedAt: validation.payload.iat ? validation.payload.iat * 1000 : null,
      expiresAt: validation.payload.exp ? validation.payload.exp * 1000 : null,
      lastUsed: tokenMeta.lastUsed
    };
  }

  cleanupOldestRefreshTokens(count) {
    if (count <= 0) {
      return;
    }

    const sorted = Array.from(this.refreshTokens.entries())
      .sort((a, b) => (a[1].lastUsed || a[1].createdAt) - (b[1].lastUsed || b[1].createdAt));

    let removed = 0;

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      this.refreshTokens.delete(sorted[i][0]);
      removed++;
    }

    if (removed > 0) {
      const timestamp = new Date().toISOString();
      this.cleanupMetrics.overflowRemovedTotal += removed;
      this.cleanupMetrics.lastOverflowAt = timestamp;
    }
  }

  getRefreshToken(token) {
    return this.getRefreshTokenDetails(token);
  }

  getStats() {
    return {
      activeRefreshTokens: this.refreshTokens.size,
      blacklistedTokens: this.blacklistedTokens.size,
      maxRefreshTokensPerUser: this.maxRefreshTokensPerUser,
      maxTotalRefreshTokens: this.maxTotalRefreshTokens,
      maxBlacklistedTokens: this.maxBlacklistedTokens,
      refreshTokenInactivityMs: this.refreshTokenInactivityMs,
      cleanupMetrics: this.cleanupMetrics
    };
  }
}

const secureAuth = new SecureAuth();

// Graceful shutdown handler
process.on('SIGTERM', () => {
  secureAuth.stopCleanup();
});

process.on('SIGINT', () => {
  secureAuth.stopCleanup();
});

module.exports = {
  SecureAuth,
  secureAuth
};
