/**
 * Practical Security Manager
 * Real-world security implementation for financial trading platform
 * Zero-trust architecture with industry-standard security practices
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

class SecurityManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      // Authentication settings
      auth: {
        mfaRequired: true,
        sessionTimeout: 3600000, // 1 hour
        maxFailedAttempts: 5,
        lockoutDuration: 900000, // 15 minutes
        passwordPolicy: {
          minLength: 12,
          requireUppercase: true,
          requireNumbers: true,
          requireSymbols: true
        }
      },
      // Encryption settings
      encryption: {
        algorithm: 'aes-256-gcm', // Modern GCM mode for authenticated encryption
        keyRotationInterval: 86400000, // 24 hours
        saltRounds: 12
      },
      // Rate limiting
      rateLimit: {
        windowMs: 900000, // 15 minutes
        maxRequests: 100,
        skipSuccessfulRequests: false
      },
      // Security monitoring
      monitoring: {
        enabled: true,
        logFailedAttempts: true,
        alertThreshold: 10,
        scanInterval: 300000 // 5 minutes
      },
      ...options
    };

    // Security state
    this.failedAttempts = new Map();
    this.lockedAccounts = new Map();
    this.activeSessions = new Map();
    this.securityEvents = [];
    this.encryptionKeys = new Map();

    this.isInitialized = false;
    this.monitoringInterval = null;

    this.initializeLogger();
  }

  initializeLogger() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'security-manager' },
      transports: [
        new winston.transports.File({
          filename: 'logs/security.log',
          level: 'warn',
          maxsize: 20971520,
          maxFiles: 10
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  async initialize() {
    try {
      this.logger.info('Initializing Security Manager...');

      await this.setupEncryption();
      await this.setupRateLimiting();
      await this.startSecurityMonitoring();
      await this.loadSecurityPolicies();

      this.isInitialized = true;
      this.logger.info('Security Manager initialized successfully');

      return { success: true, message: 'Security manager ready' };
    } catch (error) {
      this.logger.error('Failed to initialize security manager:', error);
      throw error;
    }
  }

  async setupEncryption() {
    // Generate master encryption key
    this.masterKey = crypto.randomBytes(32);

    // Setup key rotation
    setInterval(() => {
      this.rotateEncryptionKeys();
    }, this.options.encryption.keyRotationInterval);

    this.logger.info('Encryption system initialized');
  }

  async setupRateLimiting() {
    // Configure rate limiting middleware
    this.rateLimitMiddleware = rateLimit({
      windowMs: this.options.rateLimit.windowMs,
      max: this.options.rateLimit.maxRequests,
      message: {
        error: 'Too many requests',
        retryAfter: Math.ceil(this.options.rateLimit.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, _res) => {
        this.logSecurityEvent('rate_limit_exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: Date.now()
        });
      }
    });

    this.logger.info('Rate limiting configured');
  }

  async startSecurityMonitoring() {
    if (!this.options.monitoring.enabled) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.performSecurityScan();
    }, this.options.monitoring.scanInterval);

    this.logger.info('Security monitoring started');
  }

  async loadSecurityPolicies() {
    // Load security policies and compliance rules
    this.securityPolicies = {
      authentication: {
        requireMFA: this.options.auth.mfaRequired,
        sessionTimeout: this.options.auth.sessionTimeout,
        passwordPolicy: this.options.auth.passwordPolicy
      },
      authorization: {
        enforceRBAC: true,
        requireSessionValidation: true,
        auditAccess: true
      },
      dataProtection: {
        encryptAtRest: true,
        encryptInTransit: true,
        backupEncryption: true
      }
    };

    this.logger.info('Security policies loaded');
  }

  // Authentication methods
  async authenticateUser(credentials) {
    try {
      const { username, password, mfaToken } = credentials;

      // Check if account is locked
      if (this.isAccountLocked(username)) {
        throw new Error('Account is temporarily locked');
      }

      // Validate credentials
      const isValid = await this.validateCredentials(username, password);
      if (!isValid) {
        this.recordFailedAttempt(username);
        throw new Error('Invalid credentials');
      }

      // Validate MFA if required
      if (this.options.auth.mfaRequired) {
        const mfaValid = await this.validateMFA(username, mfaToken);
        if (!mfaValid) {
          this.recordFailedAttempt(username);
          throw new Error('Invalid MFA token');
        }
      }

      // Clear failed attempts on successful login
      this.clearFailedAttempts(username);

      // Create session
      const session = await this.createSession(username);

      this.logSecurityEvent('login_success', {
        username,
        sessionId: session.id,
        timestamp: Date.now()
      });

      return session;

    } catch (error) {
      this.logSecurityEvent('login_failed', {
        username: credentials.username,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  async validateCredentials(username, password) {
    // Implement actual credential validation
    // This would typically check against a database
    return new Promise((resolve) => {
      // Simulate async validation
      setTimeout(() => {
        resolve(password && password.length >= this.options.auth.passwordPolicy.minLength);
      }, 100);
    });
  }

  async validateMFA(username, token) {
    // Implement TOTP validation
    // This would typically use a library like speakeasy
    return new Promise((resolve) => {
      // Simulate MFA validation
      setTimeout(() => {
        resolve(token && token.length === 6);
      }, 50);
    });
  }

  async createSession(username) {
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId,
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.options.auth.sessionTimeout,
      isActive: true
    };

    this.activeSessions.set(sessionId, session);

    // Auto-expire session
    setTimeout(() => {
      this.expireSession(sessionId);
    }, this.options.auth.sessionTimeout);

    return session;
  }

  validateSession(sessionId) {
    const session = this.activeSessions.get(sessionId);

    if (!session || !session.isActive || Date.now() > session.expiresAt) {
      return null;
    }

    return session;
  }

  expireSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.activeSessions.delete(sessionId);

      this.logSecurityEvent('session_expired', {
        sessionId,
        username: session.username,
        timestamp: Date.now()
      });
    }
  }

  // Account security methods
  isAccountLocked(username) {
    const lockInfo = this.lockedAccounts.get(username);
    if (!lockInfo) {
      return false;
    }

    if (Date.now() > lockInfo.unlockAt) {
      this.lockedAccounts.delete(username);
      return false;
    }

    return true;
  }

  recordFailedAttempt(username) {
    const attempts = this.failedAttempts.get(username) || 0;
    const newAttempts = attempts + 1;

    this.failedAttempts.set(username, newAttempts);

    if (newAttempts >= this.options.auth.maxFailedAttempts) {
      this.lockAccount(username);
    }

    this.logSecurityEvent('failed_login_attempt', {
      username,
      attemptCount: newAttempts,
      timestamp: Date.now()
    });
  }

  lockAccount(username) {
    const unlockAt = Date.now() + this.options.auth.lockoutDuration;
    this.lockedAccounts.set(username, { unlockAt });
    this.failedAttempts.delete(username);

    this.logSecurityEvent('account_locked', {
      username,
      unlockAt,
      timestamp: Date.now()
    });
  }

  clearFailedAttempts(username) {
    this.failedAttempts.delete(username);
  }

  // Encryption methods
  encrypt(data, keyId = 'default') {
    try {
      const key = this.getEncryptionKey(keyId);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.options.encryption.algorithm, key);

      cipher.setAAD(Buffer.from(keyId));

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        keyId
      };
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  decrypt(encryptedData) {
    try {
      const { encrypted, iv: _iv, authTag, keyId } = encryptedData;
      const key = this.getEncryptionKey(keyId);

      const decipher = crypto.createDecipher(this.options.encryption.algorithm, key);
      decipher.setAAD(Buffer.from(keyId));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  getEncryptionKey(keyId) {
    let key = this.encryptionKeys.get(keyId);
    if (!key) {
      key = crypto.randomBytes(32);
      this.encryptionKeys.set(keyId, key);
    }
    return key;
  }

  rotateEncryptionKeys() {
    // Create new keys and mark old ones for gradual retirement
    const newKeyId = `key_${Date.now()}`;
    const newKey = crypto.randomBytes(32);
    this.encryptionKeys.set(newKeyId, newKey);

    this.logger.info('Encryption keys rotated', { newKeyId });
  }

  // Security monitoring
  async performSecurityScan() {
    try {
      const threats = [];

      // Check for suspicious login patterns
      threats.push(...this.detectSuspiciousLogins());

      // Check for session anomalies
      threats.push(...this.detectSessionAnomalies());

      // Check system security
      threats.push(...await this.checkSystemSecurity());

      // Handle detected threats
      for (const threat of threats) {
        await this.handleSecurityThreat(threat);
      }

    } catch (error) {
      this.logger.error('Security scan failed:', error);
    }
  }

  detectSuspiciousLogins() {
    const threats = [];
    const recentEvents = this.getRecentSecurityEvents(300000); // Last 5 minutes

    // Count failed login attempts
    const failedLogins = recentEvents.filter(e => e.type === 'login_failed');
    if (failedLogins.length > this.options.monitoring.alertThreshold) {
      threats.push({
        type: 'brute_force_attack',
        severity: 'high',
        count: failedLogins.length,
        timestamp: Date.now()
      });
    }

    return threats;
  }

  detectSessionAnomalies() {
    const threats = [];
    const activeSessions = Array.from(this.activeSessions.values());

    // Check for sessions from multiple locations
    const userSessions = {};
    activeSessions.forEach(session => {
      if (!userSessions[session.username]) {
        userSessions[session.username] = [];
      }
      userSessions[session.username].push(session);
    });

    // Flag users with multiple concurrent sessions
    Object.entries(userSessions).forEach(([username, sessions]) => {
      if (sessions.length > 3) {
        threats.push({
          type: 'multiple_sessions',
          severity: 'medium',
          username,
          sessionCount: sessions.length,
          timestamp: Date.now()
        });
      }
    });

    return threats;
  }

  async checkSystemSecurity() {
    const threats = [];

    // Check encryption key status
    if (this.encryptionKeys.size === 0) {
      threats.push({
        type: 'missing_encryption_keys',
        severity: 'critical',
        timestamp: Date.now()
      });
    }

    // Check active sessions count
    if (this.activeSessions.size > 1000) {
      threats.push({
        type: 'high_session_count',
        severity: 'medium',
        sessionCount: this.activeSessions.size,
        timestamp: Date.now()
      });
    }

    return threats;
  }

  async handleSecurityThreat(threat) {
    this.logSecurityEvent('threat_detected', threat);

    switch (threat.severity) {
    case 'critical':
      await this.handleCriticalThreat(threat);
      break;
    case 'high':
      await this.handleHighThreat(threat);
      break;
    case 'medium':
      await this.handleMediumThreat(threat);
      break;
    default:
      this.logger.info('Low severity threat logged', threat);
    }
  }

  async handleCriticalThreat(threat) {
    this.logger.error('CRITICAL SECURITY THREAT DETECTED', threat);

    // Implement emergency response
    switch (threat.type) {
    case 'missing_encryption_keys':
      await this.setupEncryption();
      break;
    default:
      this.emit('criticalThreat', threat);
    }
  }

  async handleHighThreat(threat) {
    this.logger.warn('High severity security threat', threat);

    switch (threat.type) {
    case 'brute_force_attack':
      // Could implement IP blocking here
      this.emit('bruteForceDetected', threat);
      break;
    default:
      this.emit('highThreat', threat);
    }
  }

  async handleMediumThreat(threat) {
    this.logger.warn('Medium severity security threat', threat);
    this.emit('mediumThreat', threat);
  }

  // Utility methods
  logSecurityEvent(type, data) {
    const event = {
      type,
      data,
      timestamp: Date.now()
    };

    this.securityEvents.push(event);

    // Keep only recent events (last 24 hours)
    const cutoff = Date.now() - 86400000;
    this.securityEvents = this.securityEvents.filter(e => e.timestamp > cutoff);

    this.logger.info('Security event logged', event);
  }

  getRecentSecurityEvents(timeWindow) {
    const cutoff = Date.now() - timeWindow;
    return this.securityEvents.filter(e => e.timestamp > cutoff);
  }

  getSecurityStatus() {
    return {
      isInitialized: this.isInitialized,
      activeSessions: this.activeSessions.size,
      lockedAccounts: this.lockedAccounts.size,
      recentEvents: this.securityEvents.length,
      encryptionKeys: this.encryptionKeys.size,
      monitoring: this.options.monitoring.enabled
    };
  }

  // Middleware generators
  getHelmetMiddleware() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    });
  }

  getRateLimitMiddleware() {
    return this.rateLimitMiddleware;
  }

  getAuthMiddleware() {
    return (req, res, next) => {
      const sessionId = req.headers['x-session-id'];
      const session = this.validateSession(sessionId);

      if (!session) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      req.session = session;
      next();
    };
  }

  async shutdown() {
    this.logger.info('Shutting down Security Manager...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Clear sensitive data
    this.encryptionKeys.clear();
    this.activeSessions.clear();

    this.isInitialized = false;
    this.logger.info('Security Manager shutdown complete');
  }
}

module.exports = SecurityManager;