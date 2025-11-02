const crypto = require('crypto');
const { logger } = require('../utils/productionLogger');

const API_KEY_HMAC_SECRET = (() => {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('API_KEY_HMAC_SECRET must be configured and at least 32 characters long');
  }
  return secret;
})();

const API_KEY_TTL_MS = (() => {
  const raw = process.env.API_KEY_TTL_MS;
  if (!raw) {
    return 90 * 24 * 60 * 60 * 1000;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 60 * 60 * 1000) {
    throw new Error('API_KEY_TTL_MS must be a number greater than or equal to 3600000');
  }
  return parsed;
})();

class AuthMiddleware {
  constructor() {
    this.sessions = new Map();
    this.apiKeys = new Map();
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    this.maxSessionsPerUser = 5;
    this.maxTotalSessions = 10000; // Global limit to prevent unlimited growth
    this.maxTotalApiKeys = 1000;
    this.maxApiKeysPerUser = 20;
    this.apiKeyInactivityMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    this.cleanupInterval = null;
    this.apiKeyTtlMs = API_KEY_TTL_MS;
    this.cleanupMetrics = {
      sessions: {
        lastRunAt: null,
        lastRunRemoved: 0,
        expiredRemovedTotal: 0,
        overflowRemovedTotal: 0,
        lastOverflowAt: null
      },
      apiKeys: {
        lastRunAt: null,
        expiredRemovedTotal: 0,
        inactiveRemovedTotal: 0,
        overflowRemovedTotal: 0,
        perUserRemovedTotal: 0,
        lastOverflowAt: null,
        lastPerUserCleanupAt: null
      }
    };
    this.setupCleanup();
  }

  // Generate secure session token
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate API key
  generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create session for user
  createSession(userId, userAgent = '', ipAddress = '') {
    const sessionToken = this.generateSessionToken();
    const now = Date.now();

    // Clean up old sessions for this user
    this.cleanupUserSessions(userId);

    const session = {
      token: sessionToken,
      userId,
      createdAt: now,
      lastAccess: now,
      userAgent,
      ipAddress,
      isActive: true
    };

    this.sessions.set(sessionToken, session);

    return {
      token: sessionToken,
      expiresAt: now + this.sessionTimeout
    };
  }

  // Validate session token
  validateSession(token) {
    const session = this.sessions.get(token);

    if (!session || !session.isActive) {
      return { valid: false, error: 'Invalid session' };
    }

    const now = Date.now();
    if (now - session.lastAccess > this.sessionTimeout) {
      this.sessions.delete(token);
      return { valid: false, error: 'Session expired' };
    }

    // Update last access
    session.lastAccess = now;

    return {
      valid: true,
      userId: session.userId,
      session
    };
  }

  // Invalidate session
  invalidateSession(token) {
    const session = this.sessions.get(token);
    if (session) {
      session.isActive = false;
      this.sessions.delete(token);
    }
  }

  // Create API key for user
  createApiKey(userId, options = {}) {
    const { permissions = [], metadata = {} } = options;
    const apiKey = this.generateApiKey();
    const hashedKey = this.hashApiKey(apiKey);
    const now = Date.now();
    this.cleanupStaleApiKeys();
    this.cleanupUserApiKeys(userId);

    const allowedIps = this.resolveAllowedIps(metadata.allowedIps);
    const rateLimit = metadata.rateLimit && Number.isFinite(metadata.rateLimit.limit)
      ? {
        limit: Math.max(1, Math.floor(metadata.rateLimit.limit)),
        windowMs: Math.max(1000, Math.floor(metadata.rateLimit.windowMs || 60000)),
        windowStart: now,
        count: 0
      }
      : null;
    const expiresAt = metadata.expiresAt && Number.isFinite(metadata.expiresAt)
      ? Math.min(metadata.expiresAt, now + this.apiKeyTtlMs)
      : now + this.apiKeyTtlMs;
    const keyData = {
      hashedKey,
      userId,
      permissions: this.normalizePermissions(permissions),
      createdAt: now,
      lastUsed: null,
      requestCount: 0,
      isActive: true,
      expiresAt,
      allowedIps,
      allowedIpSet: allowedIps.length > 0 ? new Set(allowedIps) : null,
      lastIp: null,
      label: typeof metadata.label === 'string' ? metadata.label.trim().slice(0, 128) : null,
      rateLimit
    };

    this.apiKeys.set(hashedKey, keyData);

    if (this.apiKeys.size > this.maxTotalApiKeys) {
      const excess = Math.max(1, Math.ceil(this.apiKeys.size * 0.1));
      this.cleanupOldestApiKeys(excess);
    }

    return {
      apiKey,
      fingerprint: hashedKey.substring(0, 12),
      expiresAt,
      label: keyData.label
    };
  }

  // Validate API key
  validateApiKey(apiKey, context = {}) {
    const hashedKey = this.hashApiKey(apiKey);
    const keyData = this.apiKeys.get(hashedKey);

    if (!keyData || !keyData.isActive) {
      return { valid: false, error: 'Invalid API key' };
    }

    const now = Date.now();
    if (keyData.expiresAt && now > keyData.expiresAt) {
      this.apiKeys.delete(hashedKey);
      return { valid: false, error: 'API key expired' };
    }

    if (!this.apiKeyAllowedForIp(keyData, context.ip)) {
      logger.warn('[Auth] API key blocked for IP', { userId: keyData.userId, ip: context.ip });
      return { valid: false, error: 'API key not allowed from this IP' };
    }

    const rateResult = this.recordApiKeyUsage(keyData, context);
    if (!rateResult.allowed) {
      logger.warn('[Auth] API key rate limit exceeded', { userId: keyData.userId });
      return { valid: false, error: 'API key rate limit exceeded' };
    }

    return {
      valid: true,
      userId: keyData.userId,
      permissions: keyData.permissions,
      keyData
    };
  }

  // Authentication middleware
  requireAuth() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      const sessionToken = req.headers['x-session-token'];

      if (!authHeader && !sessionToken) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Provide Authorization header or X-Session-Token'
        });
      }

      let authResult = null;

      // Try session token first
      if (sessionToken) {
        authResult = this.validateSession(sessionToken);
        if (authResult.valid) {
          req.user = { id: authResult.userId };
          req.session = authResult.session;
          return next();
        }
      }

      // Try API key
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const apiKey = authHeader.substring(7);
        authResult = this.validateApiKey(apiKey, { ip: req.ip, userAgent: req.get('user-agent') });
        if (authResult.valid) {
          req.user = { id: authResult.userId };
          req.apiKey = authResult.keyData;
          return next();
        }
      }

      return res.status(401).json({
        error: 'Invalid authentication',
        message: 'Invalid session token or API key'
      });
    };
  }

  // Optional authentication (allows anonymous)
  optionalAuth() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      const sessionToken = req.headers['x-session-token'];

      if (sessionToken) {
        const authResult = this.validateSession(sessionToken);
        if (authResult.valid) {
          req.user = { id: authResult.userId };
          req.session = authResult.session;
        }
      } else if (authHeader && authHeader.startsWith('Bearer ')) {
        const apiKey = authHeader.substring(7);
        const authResult = this.validateApiKey(apiKey, { ip: req.ip, userAgent: req.get('user-agent') });
        if (authResult.valid) {
          req.user = { id: authResult.userId };
          req.apiKey = authResult.keyData;
        }
      }

      next();
    };
  }

  // Check permissions
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      // If using API key, check permissions
      if (req.apiKey) {
        if (!req.apiKey.permissions.includes(permission) &&
            !req.apiKey.permissions.includes('*')) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            required: permission
          });
        }
      }

      next();
    };
  }

  // Clean up expired sessions
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [token, session] of this.sessions.entries()) {
      if (now - session.lastAccess > this.sessionTimeout) {
        this.sessions.delete(token);
        cleanedCount++;
      }
    }

    const timestamp = new Date().toISOString();
    this.cleanupMetrics.sessions.lastRunAt = timestamp;
    this.cleanupMetrics.sessions.lastRunRemoved = cleanedCount;
    if (cleanedCount > 0) {
      this.cleanupMetrics.sessions.expiredRemovedTotal += cleanedCount;
      logger.info('[Auth] Expired sessions cleaned', { count: cleanedCount });
    }
  }

  // Clean up stale API keys
  cleanupStaleApiKeys() {
    const now = Date.now();
    let cleanedCount = 0;
    let expiredRemoved = 0;
    let inactiveRemoved = 0;

    for (const [hashedKey, keyData] of this.apiKeys.entries()) {
      const expired = keyData.expiresAt && now > keyData.expiresAt;
      const inactive = keyData.lastUsed && now - keyData.lastUsed > this.apiKeyInactivityMs;
      if (expired || inactive) {
        this.apiKeys.delete(hashedKey);
        cleanedCount++;
        if (expired) {
          expiredRemoved++;
        }
        if (inactive) {
          inactiveRemoved++;
        }
      }
    }

    const timestamp = new Date().toISOString();
    this.cleanupMetrics.apiKeys.lastRunAt = timestamp;
    if (cleanedCount > 0) {
      this.cleanupMetrics.apiKeys.expiredRemovedTotal += expiredRemoved;
      this.cleanupMetrics.apiKeys.inactiveRemovedTotal += inactiveRemoved;
      logger.info('[Auth] Expired API keys cleaned', { count: cleanedCount });
    }
  }

  // Clean up old API keys for a specific user
  cleanupUserApiKeys(userId) {
    const userKeys = [];

    for (const [hash, keyData] of this.apiKeys.entries()) {
      if (keyData.userId === userId) {
        userKeys.push({ hash, lastUsed: keyData.lastUsed || keyData.createdAt });
      }
    }

    if (userKeys.length < this.maxApiKeysPerUser) {
      return;
    }

    userKeys.sort((a, b) => a.lastUsed - b.lastUsed);

    let removed = 0;

    while (userKeys.length >= this.maxApiKeysPerUser) {
      const { hash } = userKeys.shift();
      this.apiKeys.delete(hash);
      removed++;
    }

    if (removed > 0) {
      const timestamp = new Date().toISOString();
      this.cleanupMetrics.apiKeys.perUserRemovedTotal += removed;
      this.cleanupMetrics.apiKeys.lastPerUserCleanupAt = timestamp;
    }
  }

  // Setup automatic cleanup
  setupCleanup() {
    // Clear any existing interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Set up new cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();

      // Check if sessions exceed global limit
      if (this.sessions.size > this.maxTotalSessions) {
        this.cleanupOldestSessions(Math.floor(this.sessions.size * 0.1)); // Remove 10%
      }

      // Check if API keys exceed global limit
      if (this.apiKeys.size > this.maxTotalApiKeys) {
        this.cleanupOldestApiKeys(Math.floor(this.apiKeys.size * 0.1));
      }
      this.cleanupStaleApiKeys();
    }, 60 * 60 * 1000); // Clean up every hour

    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  // Cleanup method for graceful shutdown
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
    this.apiKeys.clear();
  }

  // Clean up oldest sessions
  cleanupOldestSessions(count) {
    const sorted = Array.from(this.sessions.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    let removed = 0;

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      this.sessions.delete(sorted[i][0]);
      removed++;
    }

    if (removed > 0) {
      const timestamp = new Date().toISOString();
      this.cleanupMetrics.sessions.overflowRemovedTotal += removed;
      this.cleanupMetrics.sessions.lastOverflowAt = timestamp;
    }
  }

  // Clean up oldest API keys
  cleanupOldestApiKeys(count) {
    const sorted = Array.from(this.apiKeys.entries())
      .sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));

    let removed = 0;

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      this.apiKeys.delete(sorted[i][0]);
      removed++;
    }

    if (removed > 0) {
      const timestamp = new Date().toISOString();
      this.cleanupMetrics.apiKeys.overflowRemovedTotal += removed;
      this.cleanupMetrics.apiKeys.lastOverflowAt = timestamp;
    }
  }

  // Get user sessions
  getUserSessions(userId) {
    const sessions = [];

    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        sessions.push({
          token: `${token.substring(0, 8)  }...`,
          createdAt: session.createdAt,
          lastAccess: session.lastAccess,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress
        });
      }
    }

    return sessions.sort((a, b) => b.lastAccess - a.lastAccess);
  }

  // Get API keys for user
  getUserApiKeys(userId) {
    const keys = [];

    for (const [key, keyData] of this.apiKeys.entries()) {
      if (keyData.userId === userId) {
        keys.push({
          key: `${key.substring(0, 8)  }...`,
          permissions: keyData.permissions,
          createdAt: keyData.createdAt,
          lastUsed: keyData.lastUsed,
          requestCount: keyData.requestCount,
          isActive: keyData.isActive
        });
      }
    }

    return keys.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Get auth statistics
  getStats() {
    const now = Date.now();
    let activeSessions = 0;
    let activeApiKeys = 0;

    for (const session of this.sessions.values()) {
      if (now - session.lastAccess < this.sessionTimeout) {
        activeSessions++;
      }
    }

    for (const keyData of this.apiKeys.values()) {
      if (keyData.isActive) {
        activeApiKeys++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      totalApiKeys: this.apiKeys.size,
      activeApiKeys,
      sessionTimeout: this.sessionTimeout,
      maxSessionsPerUser: this.maxSessionsPerUser,
      maxTotalSessions: this.maxTotalSessions,
      apiKeyTtlMs: this.apiKeyTtlMs,
      apiKeyInactivityMs: this.apiKeyInactivityMs,
      maxApiKeysPerUser: this.maxApiKeysPerUser,
      maxTotalApiKeys: this.maxTotalApiKeys,
      cleanupMetrics: this.cleanupMetrics
    };
  }
}

// Create singleton instance
const authMiddleware = new AuthMiddleware();

process.on('SIGTERM', () => {
  authMiddleware.destroy();
});

process.on('SIGINT', () => {
  authMiddleware.destroy();
});

module.exports = {
  AuthMiddleware,
  authMiddleware
};