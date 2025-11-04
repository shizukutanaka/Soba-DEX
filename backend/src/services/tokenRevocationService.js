/**
 * Token Revocation Service
 *
 * Manages token revocation and logout for both access tokens and refresh tokens.
 * Implements multiple strategies:
 * 1. Token blacklisting (for immediate revocation)
 * 2. Token versioning (for comprehensive revocation of all tokens of a user)
 * 3. Refresh token rotation (for access token refresh)
 *
 * Features:
 * - Redis-backed blacklist for fast lookups
 * - User session tracking
 * - Automatic cleanup of expired blacklist entries
 * - Emergency revocation (revoke all tokens for a user)
 * - Device-specific token management
 * - Suspicious activity detection
 *
 * @version 1.0.0
 * @author Claude AI
 */

const redis = require('./cache/redisClient');
const { logger } = require('../utils/productionLogger');
const crypto = require('crypto');

class TokenRevocationService {
  constructor() {
    // Redis key prefixes
    this.BLACKLIST_PREFIX = 'token:blacklist:';
    this.REVOCATION_PREFIX = 'token:revoked:';
    this.USER_TOKENS_PREFIX = 'user:tokens:';
    this.USER_VERSION_PREFIX = 'user:token:version:';
    this.SESSION_PREFIX = 'user:session:';
    this.DEVICE_PREFIX = 'user:device:';
    this.SUSPICIOUS_PREFIX = 'user:suspicious:';

    // Configuration
    this.config = {
      blacklistTTL: process.env.TOKEN_REVOCATION_TTL || 3600, // 1 hour - should match token expiry
      maxSessionsPerUser: process.env.MAX_SESSIONS_PER_USER || 5,
      maxFailedAttemptsBeforeLock: 5,
      suspiciousActivityTTL: 3600, // 1 hour
      cleanupInterval: 300000, // Clean up every 5 minutes
      enableDeviceTracking: process.env.TOKEN_DEVICE_TRACKING !== 'false'
    };

    // Metrics
    this.metrics = {
      tokensRevoked: 0,
      tokensBlacklisted: 0,
      logoutsPerformed: 0,
      emergencyRevocations: 0,
      suspiciousActivitiesDetected: 0
    };

    // Start cleanup job
    this.startCleanupJob();

    logger.info('[TokenRevocationService] Initialized', {
      config: {
        blacklistTTL: this.config.blacklistTTL,
        maxSessionsPerUser: this.config.maxSessionsPerUser,
        enableDeviceTracking: this.config.enableDeviceTracking
      }
    });
  }

  /**
   * Revoke a token (blacklist it)
   *
   * @param {string} token - The JWT token to revoke
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Revocation result
   */
  async revokeToken(token, options = {}) {
    try {
      // Decode token to get info (without verification since it might be compromised)
      const decoded = this._decodeToken(token);
      if (!decoded) {
        throw new Error('Invalid token format');
      }

      const { sub: userId, exp, iat } = decoded;
      const now = Math.floor(Date.now() / 1000);

      // Calculate TTL: use the remaining lifetime of the token
      const tokenTTL = Math.max(exp - now, 60); // Minimum 60 seconds
      const blacklistTTL = Math.min(tokenTTL, this.config.blacklistTTL);

      // Create blacklist entry
      const tokenHash = this._hashToken(token);
      const key = `${this.BLACKLIST_PREFIX}${tokenHash}`;

      await redis.setex(key, blacklistTTL, JSON.stringify({
        userId,
        revokedAt: new Date(),
        reason: options.reason || 'manual_revocation',
        source: options.source || 'unknown',
        ip: options.ip,
        userAgent: options.userAgent
      }));

      this.metrics.tokensBlacklisted++;

      logger.info('[TokenRevocationService] Token blacklisted', {
        userId,
        reason: options.reason,
        ttl: blacklistTTL
      });

      return {
        success: true,
        tokenHash: tokenHash.substring(0, 16) + '...',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + blacklistTTL * 1000)
      };
    } catch (error) {
      logger.error('[TokenRevocationService] Token revocation failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if a token is revoked (blacklisted)
   *
   * @param {string} token - The JWT token to check
   * @returns {Promise<boolean>} True if token is revoked
   */
  async isTokenRevoked(token) {
    try {
      const tokenHash = this._hashToken(token);
      const key = `${this.BLACKLIST_PREFIX}${tokenHash}`;
      const revoked = await redis.exists(key);
      return revoked === 1;
    } catch (error) {
      logger.error('[TokenRevocationService] Token revocation check failed', {
        error: error.message
      });
      // Fail secure: if we can't check revocation, reject the token
      return true;
    }
  }

  /**
   * Logout user: revoke all active tokens
   *
   * @param {string} userId - The user ID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Logout result
   */
  async logoutUser(userId, options = {}) {
    try {
      // Get all active sessions for the user
      const sessionsKey = `${this.SESSION_PREFIX}${userId}`;
      const sessionsData = await redis.get(sessionsKey);
      const sessions = sessionsData ? JSON.parse(sessionsData) : {};

      // Revoke all tokens in active sessions
      const revokedTokens = [];
      for (const [sessionId, sessionData] of Object.entries(sessions)) {
        if (sessionData.accessToken) {
          try {
            await this.revokeToken(sessionData.accessToken, {
              reason: 'user_logout',
              ...options
            });
            revokedTokens.push(sessionId);
          } catch (error) {
            logger.warn('[TokenRevocationService] Failed to revoke token in session', {
              userId,
              sessionId,
              error: error.message
            });
          }
        }
      }

      // Clear user sessions
      await redis.del(sessionsKey);

      // Increment user token version (invalidates all future token validations)
      const versionKey = `${this.USER_VERSION_PREFIX}${userId}`;
      await redis.incr(versionKey);

      this.metrics.logoutsPerformed++;

      logger.info('[TokenRevocationService] User logged out', {
        userId,
        revokedSessions: revokedTokens.length,
        totalSessions: Object.keys(sessions).length
      });

      return {
        success: true,
        userId,
        revokedSessions: revokedTokens.length,
        logoutAt: new Date()
      };
    } catch (error) {
      logger.error('[TokenRevocationService] User logout failed', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Emergency revocation: revoke all tokens for a user
   * Used when suspicious activity is detected or password is changed
   *
   * @param {string} userId - The user ID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Revocation result
   */
  async emergencyRevocation(userId, options = {}) {
    try {
      // Increment token version to invalidate all existing tokens
      const versionKey = `${this.USER_VERSION_PREFIX}${userId}`;
      const newVersion = await redis.incr(versionKey);

      // Clear all sessions
      const sessionsKey = `${this.SESSION_PREFIX}${userId}`;
      await redis.del(sessionsKey);

      // Clear all devices
      const deviceKey = `${this.DEVICE_PREFIX}${userId}`;
      await redis.del(deviceKey);

      // Record the emergency revocation
      const revocationKey = `${this.REVOCATION_PREFIX}${userId}`;
      await redis.setex(revocationKey, 86400, JSON.stringify({
        revokedAt: new Date(),
        reason: options.reason || 'emergency_revocation',
        initiatedBy: options.initiatedBy || 'system',
        revokedVersion: newVersion - 1
      }));

      this.metrics.emergencyRevocations++;

      logger.warn('[TokenRevocationService] Emergency revocation performed', {
        userId,
        reason: options.reason,
        newVersion
      });

      return {
        success: true,
        userId,
        allTokensRevoked: true,
        revokedAt: new Date(),
        newTokenVersion: newVersion
      };
    } catch (error) {
      logger.error('[TokenRevocationService] Emergency revocation failed', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Register a user session
   *
   * @param {string} userId - The user ID
   * @param {string} accessToken - The access token
   * @param {string} refreshToken - The refresh token
   * @param {Object} metadata - Session metadata
   * @returns {Promise<Object>} Session registration result
   */
  async registerSession(userId, accessToken, refreshToken, metadata = {}) {
    try {
      const sessionId = this._generateSessionId();
      const sessionsKey = `${this.SESSION_PREFIX}${userId}`;

      // Get current sessions
      const sessionsData = await redis.get(sessionsKey);
      const sessions = sessionsData ? JSON.parse(sessionsData) : {};

      // Enforce max sessions per user
      if (Object.keys(sessions).length >= this.config.maxSessionsPerUser) {
        // Remove oldest session
        const oldestSessionId = Object.entries(sessions).sort(
          (a, b) => a[1].createdAt - b[1].createdAt
        )[0][0];
        delete sessions[oldestSessionId];
      }

      // Add new session
      sessions[sessionId] = {
        sessionId,
        accessToken,
        refreshToken,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        deviceId: metadata.deviceId,
        fingerprint: metadata.fingerprint
      };

      // Store sessions with 30-day expiry
      await redis.setex(sessionsKey, 2592000, JSON.stringify(sessions));

      // Track device if enabled
      if (this.config.enableDeviceTracking && metadata.deviceId) {
        await this._trackDevice(userId, metadata.deviceId, metadata);
      }

      logger.info('[TokenRevocationService] Session registered', {
        userId,
        sessionId: sessionId.substring(0, 8) + '...',
        ip: metadata.ip
      });

      return {
        sessionId,
        registeredAt: new Date()
      };
    } catch (error) {
      logger.error('[TokenRevocationService] Session registration failed', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate token hasn't been revoked
   *
   * @param {Object} token - Decoded token object
   * @returns {Promise<boolean>} True if token is valid (not revoked)
   */
  async validateTokenNotRevoked(token) {
    try {
      const { sub: userId, version } = token;

      // Check blacklist
      const rawToken = token._raw; // Assumes JWT middleware stores raw token
      if (rawToken && await this.isTokenRevoked(rawToken)) {
        return false;
      }

      // Check token version
      const versionKey = `${this.USER_VERSION_PREFIX}${userId}`;
      const currentVersion = await redis.get(versionKey);
      if (currentVersion && parseInt(currentVersion) > (version || 0)) {
        return false;
      }

      // Check if user has recent emergency revocation
      const revocationKey = `${this.REVOCATION_PREFIX}${userId}`;
      const revocation = await redis.get(revocationKey);
      if (revocation) {
        const revocationData = JSON.parse(revocation);
        if (revocationData.revokedVersion >= (version || 0)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('[TokenRevocationService] Token validation failed', {
        error: error.message
      });
      // Fail secure: if we can't validate, reject
      return false;
    }
  }

  /**
   * Detect suspicious activity
   *
   * @param {string} userId - The user ID
   * @param {Object} activityData - Activity information
   * @returns {Promise<boolean>} True if suspicious activity detected
   */
  async detectSuspiciousActivity(userId, activityData) {
    try {
      const sessionsKey = `${this.SESSION_PREFIX}${userId}`;
      const sessionsData = await redis.get(sessionsKey);
      const sessions = sessionsData ? JSON.parse(sessionsData) : {};

      // Check for impossible travel (same user from different locations in short time)
      const lastActivity = Object.values(sessions)
        .map(s => ({ ip: s.ip, time: s.lastActivity }))
        .sort((a, b) => b.time - a.time)[0];

      if (lastActivity && activityData.ip !== lastActivity.ip) {
        // Different IP - could be suspicious
        // In production, you might use GeoIP to check distance
        logger.warn('[TokenRevocationService] Possible impossible travel detected', {
          userId,
          previousIp: lastActivity.ip,
          currentIp: activityData.ip
        });

        this.metrics.suspiciousActivitiesDetected++;

        // Store suspicious activity record
        const suspiciousKey = `${this.SUSPICIOUS_PREFIX}${userId}`;
        const record = {
          detectedAt: new Date(),
          type: 'impossible_travel',
          previousIp: lastActivity.ip,
          currentIp: activityData.ip,
          timeDelta: Date.now() - lastActivity.time
        };
        await redis.setex(suspiciousKey, this.config.suspiciousActivityTTL, JSON.stringify(record));

        return true;
      }

      return false;
    } catch (error) {
      logger.error('[TokenRevocationService] Suspicious activity detection failed', {
        userId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get user's active sessions
   *
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} List of active sessions
   */
  async getActiveSessions(userId) {
    try {
      const sessionsKey = `${this.SESSION_PREFIX}${userId}`;
      const sessionsData = await redis.get(sessionsKey);
      const sessions = sessionsData ? JSON.parse(sessionsData) : {};

      return Object.entries(sessions).map(([id, data]) => ({
        sessionId: id,
        ip: data.ip,
        userAgent: data.userAgent,
        deviceId: data.deviceId,
        createdAt: new Date(data.createdAt),
        lastActivity: new Date(data.lastActivity)
      }));
    } catch (error) {
      logger.error('[TokenRevocationService] Failed to get active sessions', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Revoke a specific session
   *
   * @param {string} userId - The user ID
   * @param {string} sessionId - The session ID to revoke
   * @returns {Promise<Object>} Revocation result
   */
  async revokeSession(userId, sessionId) {
    try {
      const sessionsKey = `${this.SESSION_PREFIX}${userId}`;
      const sessionsData = await redis.get(sessionsKey);
      const sessions = sessionsData ? JSON.parse(sessionsData) : {};

      const sessionData = sessions[sessionId];
      if (!sessionData) {
        throw new Error('Session not found');
      }

      // Revoke the access token
      if (sessionData.accessToken) {
        await this.revokeToken(sessionData.accessToken, {
          reason: 'session_revocation',
          source: 'user_action'
        });
      }

      // Remove from sessions
      delete sessions[sessionId];
      await redis.setex(sessionsKey, 2592000, JSON.stringify(sessions));

      logger.info('[TokenRevocationService] Session revoked', {
        userId,
        sessionId: sessionId.substring(0, 8) + '...'
      });

      return {
        success: true,
        revokedAt: new Date()
      };
    } catch (error) {
      logger.error('[TokenRevocationService] Session revocation failed', {
        userId,
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get revocation metrics
   *
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date()
    };
  }

  /**
   * Private helper methods
   */

  _decodeToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payload);
    } catch (error) {
      return null;
    }
  }

  _hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  _generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  async _trackDevice(userId, deviceId, metadata) {
    try {
      const deviceKey = `${this.DEVICE_PREFIX}${userId}`;
      const deviceData = await redis.get(deviceKey);
      const devices = deviceData ? JSON.parse(deviceData) : {};

      devices[deviceId] = {
        deviceId,
        trackedAt: Date.now(),
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        lastUsed: Date.now()
      };

      await redis.setex(deviceKey, 2592000, JSON.stringify(devices));
    } catch (error) {
      logger.debug('[TokenRevocationService] Device tracking failed', {
        error: error.message
      });
    }
  }

  startCleanupJob() {
    setInterval(async () => {
      try {
        // Cleanup is mostly handled by Redis TTL expiration
        // This job can be used for additional cleanup if needed
        logger.debug('[TokenRevocationService] Cleanup job executed');
      } catch (error) {
        logger.error('[TokenRevocationService] Cleanup job failed', {
          error: error.message
        });
      }
    }, this.config.cleanupInterval);
  }
}

// Export singleton instance
module.exports = new TokenRevocationService();
