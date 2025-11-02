/**
 * Real-Time Security Monitoring System - IMPROVED VERSION
 * Continuous security threat detection and response
 *
 * IMPROVEMENTS IMPLEMENTED:
 * - Cryptographically secure ID generation
 * - Comprehensive input validation
 * - Memory limit enforcement
 * - Configuration validation
 * - Error handling with error codes
 * - Graceful shutdown support
 * - Thread-safe operations
 * - Performance optimizations
 * - Enhanced security detections
 */

const { logger } = require('../utils/productionLogger');
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
  createSecurityError,
  normalizeUserAgent,
  validatePath,
  TokenBucket
} = require('./securityUtils');

class RealTimeSecurityMonitor {
  constructor() {
    // Shutdown flag for graceful shutdown
    this.isShuttingDown = false;
    this.monitoringIntervals = [];
    this.activeRequests = new Set();

    // Initialize configuration with validation
    this.config = this.initializeConfig();

    // Memory limits to prevent unbounded growth
    this.limits = {
      maxEvents: parseInt(process.env.MAX_SECURITY_EVENTS) || 10000,
      maxIncidents: this.config.maxIncidents,
      maxThreatIndicators: parseInt(process.env.MAX_THREAT_INDICATORS) || 1000,
      maxBehavioralProfiles: parseInt(process.env.MAX_BEHAVIORAL_PROFILES) || 5000,
      maxActiveIncidents: parseInt(process.env.MAX_ACTIVE_INCIDENTS) || 500
    };

    // Monitoring data structures with size limits
    this.securityEvents = new Map();
    this.threatIndicators = new Map();
    this.behavioralProfiles = new Map();
    this.incidentHistory = [];
    this.activeIncidents = new Map();

    // Threat intelligence
    this.threatSignatures = new Map();
    this.knownAttackPatterns = new Set();
    this.suspiciousIndicators = new Set();

    // Alert system
    this.alertCallbacks = new Set();
    this.incidentResponders = new Map();

    // Rate limiting per IP
    this.rateLimiters = new Map();

    // Statistics with atomic counters
    this.stats = {
      eventsProcessed: 0,
      threatsDetected: 0,
      anomaliesDetected: 0,
      incidentsCreated: 0,
      falsePositives: 0,
      responseTime: 0,
      alertsSent: 0,
      blockedRequests: 0,
      invalidInputs: 0,
      memoryCleanups: 0
    };

    // Performance metrics
    this.performanceMetrics = {
      avgProcessingTime: 0,
      maxProcessingTime: 0,
      minProcessingTime: Infinity,
      totalProcessingTime: 0,
      requestCount: 0
    };

    // Register shutdown handlers
    this.registerShutdownHandlers();

    if (this.config.enabled) {
      this.initializeSecurityMonitoring();
    }
  }

  /**
   * Initialize and validate configuration
   */
  initializeConfig() {
    const config = {
      enabled: process.env.REAL_TIME_SECURITY !== 'false',
      monitoringInterval: parseInt(process.env.SECURITY_MONITORING_INTERVAL) || 1000,
      threatDetectionEnabled: process.env.THREAT_DETECTION !== 'false',
      anomalyDetectionEnabled: process.env.ANOMALY_DETECTION !== 'false',
      behavioralAnalysisEnabled: process.env.BEHAVIORAL_ANALYSIS !== 'false',
      incidentResponseEnabled: process.env.INCIDENT_RESPONSE !== 'false',
      alertThresholds: {
        high: parseInt(process.env.HIGH_THREAT_THRESHOLD) || 80,
        medium: parseInt(process.env.MEDIUM_THREAT_THRESHOLD) || 50,
        low: parseInt(process.env.LOW_THREAT_THRESHOLD) || 20
      },
      maxIncidents: parseInt(process.env.MAX_INCIDENTS) || 1000,
      retentionPeriod: parseInt(process.env.INCIDENT_RETENTION) || 86400000, // 24 hours
      rateLimitPerIP: parseInt(process.env.RATE_LIMIT_PER_IP) || 100, // requests per minute
      enableIPBlocking: process.env.ENABLE_IP_BLOCKING === 'true',
      blockDuration: parseInt(process.env.BLOCK_DURATION) || 3600000, // 1 hour
    };

    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.valid) {
      logger.error('Invalid security configuration', { errors: validation.errors });
      throw createSecurityError(
        SecurityErrorCodes.INVALID_CONFIG,
        `Invalid configuration: ${validation.errors.join(', ')}`,
        { errors: validation.errors }
      );
    }

    return config;
  }

  /**
   * Initialize security monitoring system
   */
  initializeSecurityMonitoring() {
    try {
      // Load threat intelligence
      this.loadThreatIntelligence();

      // Start real-time monitoring
      this.startRealTimeMonitoring();

      // Start threat detection
      if (this.config.threatDetectionEnabled) {
        this.startThreatDetection();
      }

      // Start anomaly detection
      if (this.config.anomalyDetectionEnabled) {
        this.startAnomalyDetection();
      }

      // Start behavioral analysis
      if (this.config.behavioralAnalysisEnabled) {
        this.startBehavioralAnalysis();
      }

      // Start incident response
      if (this.config.incidentResponseEnabled) {
        this.startIncidentResponse();
      }

      // Start memory cleanup
      this.startMemoryCleanup();

      logger.info('Real-time security monitoring initialized', {
        threatDetection: this.config.threatDetectionEnabled,
        anomalyDetection: this.config.anomalyDetectionEnabled,
        behavioralAnalysis: this.config.behavioralAnalysisEnabled,
        incidentResponse: this.config.incidentResponseEnabled,
        limits: this.limits
      });
    } catch (error) {
      logger.error('Failed to initialize security monitoring', {
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Main security monitoring middleware
   */
  middleware() {
    return async (req, res, next) => {
      if (!this.config.enabled || this.isShuttingDown) {
        return next();
      }

      const startTime = Date.now();
      const requestId = generateSecureId('req');

      // Track active request
      this.activeRequests.add(requestId);

      try {
        // Extract and validate client IP
        const rawIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                      req.connection?.remoteAddress ||
                      req.socket?.remoteAddress ||
                      'unknown';
        const clientIP = sanitizeIP(rawIP);

        // Validate IP address
        if (!isValidIP(clientIP) && clientIP !== 'unknown') {
          logger.warn('Invalid IP address detected', { rawIP, clientIP });
          this.stats.invalidInputs++;
        }

        // Check rate limiting
        if (!this.checkRateLimit(clientIP)) {
          this.stats.blockedRequests++;
          logger.warn('Rate limit exceeded', { ip: clientIP, path: req.path });

          res.status(429).json({
            error: 'Too many requests',
            code: SecurityErrorCodes.RATE_LIMIT_EXCEEDED,
            retryAfter: 60
          });
          this.activeRequests.delete(requestId);
          return;
        }

        // Validate HTTP method
        if (!isValidMethod(req.method)) {
          this.stats.invalidInputs++;
          logger.warn('Invalid HTTP method', { method: req.method, ip: clientIP });
        }

        // Validate and normalize path
        const pathValidation = validatePath(req.path);
        if (!pathValidation.valid) {
          this.stats.invalidInputs++;
          logger.warn('Invalid path detected', {
            path: req.path,
            error: pathValidation.error,
            ip: clientIP
          });

          if (pathValidation.error === 'Path traversal detected') {
            this.handlePathTraversalAttempt(clientIP, req.path);
            res.status(400).json({
              error: 'Invalid request path',
              code: SecurityErrorCodes.PATH_TRAVERSAL
            });
            this.activeRequests.delete(requestId);
            return;
          }
        }

        // Normalize user agent
        const userAgent = normalizeUserAgent(req.headers['user-agent']);

        // Quick injection detection on critical fields
        const quickThreats = this.performQuickThreatCheck(req, clientIP);
        if (quickThreats.length > 0) {
          logger.warn('Quick threat check failed', {
            ip: clientIP,
            threats: quickThreats,
            path: req.path
          });

          for (const threat of quickThreats) {
            this.handleDetectedThreat(threat);
          }
        }

        // Record security event
        const eventId = this.recordSecurityEvent({
          type: 'REQUEST',
          ip: clientIP,
          method: req.method,
          path: pathValidation.path,
          userAgent,
          timestamp: startTime,
          headers: sanitizeHeaders(req.headers),
          bodySize: this.calculateBodySize(req.body),
          requestId
        });

        // Attach event ID to request for tracking
        req.securityEventId = eventId;
        req.securityRequestId = requestId;

        // Wrap response to capture security metrics
        const originalSend = res.send.bind(res);
        const originalJson = res.json.bind(res);

        const updateEvent = (data) => {
          const processingTime = Date.now() - startTime;
          this.updateSecurityEvent(eventId, {
            responseTime: processingTime,
            statusCode: res.statusCode,
            responseSize: this.calculateResponseSize(data)
          });
          this.updatePerformanceMetrics(processingTime);
          this.activeRequests.delete(requestId);
        };

        res.send = (data) => {
          updateEvent(data);
          return originalSend(data);
        };

        res.json = (data) => {
          updateEvent(data);
          return originalJson(data);
        };

        next();

      } catch (error) {
        logger.error('Security monitoring error', {
          error: error.message,
          code: error.code,
          path: req.path,
          requestId
        });
        this.activeRequests.delete(requestId);
        next();
      }
    };
  }

  /**
   * Check rate limit for IP
   * @param {string} ip - Client IP address
   * @returns {boolean} True if request is allowed
   */
  checkRateLimit(ip) {
    if (!this.rateLimiters.has(ip)) {
      // Create new token bucket for this IP
      const bucket = new TokenBucket(
        this.config.rateLimitPerIP,
        this.config.rateLimitPerIP / 60 // refill rate per second
      );
      this.rateLimiters.set(ip, bucket);
    }

    const bucket = this.rateLimiters.get(ip);
    return bucket.tryConsume(1);
  }

  /**
   * Perform quick threat detection on request
   * @param {object} req - Express request object
   * @param {string} ip - Client IP
   * @returns {Array} Array of detected threats
   */
  performQuickThreatCheck(req, ip) {
    const threats = [];

    // Check user agent for XSS
    if (hasXSS(req.headers['user-agent'] || '')) {
      threats.push({
        type: 'XSS_ATTACK',
        severity: 'HIGH',
        ip,
        location: 'user-agent',
        value: req.headers['user-agent'],
        timestamp: Date.now()
      });
    }

    // Check path for SQL injection
    if (hasSQLInjection(req.path)) {
      threats.push({
        type: 'SQL_INJECTION',
        severity: 'CRITICAL',
        ip,
        location: 'path',
        path: req.path,
        timestamp: Date.now()
      });
    }

    // Check query parameters
    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') {
          if (hasSQLInjection(value)) {
            threats.push({
              type: 'SQL_INJECTION',
              severity: 'CRITICAL',
              ip,
              location: `query.${key}`,
              value,
              timestamp: Date.now()
            });
          }
          if (hasXSS(value)) {
            threats.push({
              type: 'XSS_ATTACK',
              severity: 'HIGH',
              ip,
              location: `query.${key}`,
              value,
              timestamp: Date.now()
            });
          }
          if (hasCommandInjection(value)) {
            threats.push({
              type: 'COMMAND_INJECTION',
              severity: 'CRITICAL',
              ip,
              location: `query.${key}`,
              value,
              timestamp: Date.now()
            });
          }
        }
      }
    }

    return threats;
  }

  /**
   * Handle path traversal attempt
   * @param {string} ip - Client IP
   * @param {string} path - Attempted path
   */
  handlePathTraversalAttempt(ip, path) {
    const threat = {
      type: 'PATH_TRAVERSAL',
      severity: 'HIGH',
      ip,
      path,
      timestamp: Date.now()
    };

    this.handleDetectedThreat(threat);
  }

  /**
   * Calculate body size safely
   * @param {*} body - Request body
   * @returns {number} Body size in bytes
   */
  calculateBodySize(body) {
    try {
      if (!body) return 0;
      if (Buffer.isBuffer(body)) return body.length;
      if (typeof body === 'string') return Buffer.byteLength(body);
      return Buffer.byteLength(JSON.stringify(body));
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate response size safely
   * @param {*} data - Response data
   * @returns {number} Response size in bytes
   */
  calculateResponseSize(data) {
    try {
      if (!data) return 0;
      if (Buffer.isBuffer(data)) return data.length;
      if (typeof data === 'string') return Buffer.byteLength(data);
      return Buffer.byteLength(JSON.stringify(data));
    } catch (error) {
      return 0;
    }
  }

  /**
   * Update performance metrics
   * @param {number} processingTime - Processing time in ms
   */
  updatePerformanceMetrics(processingTime) {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalProcessingTime += processingTime;
    this.performanceMetrics.avgProcessingTime =
      this.performanceMetrics.totalProcessingTime / this.performanceMetrics.requestCount;
    this.performanceMetrics.maxProcessingTime =
      Math.max(this.performanceMetrics.maxProcessingTime, processingTime);
    this.performanceMetrics.minProcessingTime =
      Math.min(this.performanceMetrics.minProcessingTime, processingTime);
  }

  /**
   * Record security event with memory limit check
   */
  recordSecurityEvent(eventData) {
    const eventId = generateSecureId('evt');

    const event = {
      id: eventId,
      ...eventData,
      indicators: [],
      riskScore: 0,
      threatLevel: 'LOW',
      processed: false
    };

    this.securityEvents.set(eventId, event);
    this.stats.eventsProcessed++;

    // Check memory limits and cleanup if needed
    if (exceedsMapLimit(this.securityEvents, this.limits.maxEvents)) {
      this.cleanupOldEvents();
    }

    return eventId;
  }

  /**
   * Update security event with response data
   */
  updateSecurityEvent(eventId, updateData) {
    const event = this.securityEvents.get(eventId);
    if (!event) return;

    Object.assign(event, updateData);

    // Calculate risk score based on response
    if (updateData.statusCode) {
      event.riskScore += this.calculateResponseRisk(
        updateData.statusCode,
        updateData.responseTime
      );
    }

    // Determine threat level
    event.threatLevel = this.calculateThreatLevel(event.riskScore);

    // Mark as processed
    event.processed = true;
  }

  /**
   * Calculate risk score from response data
   */
  calculateResponseRisk(statusCode, responseTime) {
    let risk = 0;

    // High status codes indicate potential issues
    if (statusCode >= 500) risk += 50;
    else if (statusCode >= 400) risk += 20;
    else if (statusCode >= 300) risk += 10;

    // Slow responses might indicate attacks or issues
    if (responseTime > 10000) risk += 30; // > 10 seconds
    else if (responseTime > 5000) risk += 15; // > 5 seconds
    else if (responseTime > 2000) risk += 5; // > 2 seconds

    return risk;
  }

  /**
   * Calculate threat level from risk score
   */
  calculateThreatLevel(riskScore) {
    if (riskScore >= this.config.alertThresholds.high) return 'CRITICAL';
    if (riskScore >= this.config.alertThresholds.medium) return 'HIGH';
    if (riskScore >= this.config.alertThresholds.low) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Start real-time monitoring
   */
  startRealTimeMonitoring() {
    const intervalId = setInterval(() => {
      if (this.isShuttingDown) return;
      this.performRealTimeAnalysis();
    }, this.config.monitoringInterval);

    this.monitoringIntervals.push(intervalId);
  }

  /**
   * Perform real-time security analysis
   */
  performRealTimeAnalysis() {
    const now = Date.now();
    const analysisWindow = 60000; // 1 minute

    // Analyze recent events
    const recentEvents = Array.from(this.securityEvents.values())
      .filter(event => now - event.timestamp < analysisWindow);

    if (recentEvents.length === 0) return;

    // Calculate traffic metrics
    const trafficMetrics = this.calculateTrafficMetrics(recentEvents);

    // Detect anomalies
    const anomalies = this.detectTrafficAnomalies(trafficMetrics);

    // Update threat indicators
    this.updateThreatIndicators(trafficMetrics, anomalies);

    // Generate alerts if needed
    if (anomalies.length > 0 || trafficMetrics.threatScore > 50) {
      this.generateSecurityAlert({
        type: 'TRAFFIC_ANOMALY',
        severity: trafficMetrics.threatScore > 80 ? 'CRITICAL' : 'HIGH',
        metrics: trafficMetrics,
        anomalies,
        timestamp: now
      });
    }

    // Update statistics
    this.updateMonitoringStats(trafficMetrics);
  }

  /**
   * Calculate traffic metrics from events
   */
  calculateTrafficMetrics(events) {
    const metrics = {
      totalRequests: events.length,
      uniqueIPs: new Set(events.map(e => e.ip)).size,
      uniquePaths: new Set(events.map(e => e.path)).size,
      avgResponseTime: 0,
      errorRate: 0,
      suspiciousRequests: 0,
      threatScore: 0,
      requestRate: safeDivide(events.length, 60) // requests per second
    };

    // Calculate averages and rates
    const responseTimes = events.filter(e => e.responseTime).map(e => e.responseTime);
    if (responseTimes.length > 0) {
      metrics.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }

    const errorEvents = events.filter(e => e.statusCode >= 400);
    metrics.errorRate = safeDivide(errorEvents.length, events.length, 0) * 100;

    const highRiskEvents = events.filter(e => e.riskScore > 50);
    metrics.suspiciousRequests = highRiskEvents.length;

    // Calculate threat score
    metrics.threatScore = this.calculateThreatScore(metrics);

    return metrics;
  }

  /**
   * Calculate overall threat score
   */
  calculateThreatScore(metrics) {
    let score = 0;

    // High request rate
    if (metrics.requestRate > 100) score += 40;
    else if (metrics.requestRate > 50) score += 20;
    else if (metrics.requestRate > 20) score += 10;

    // High error rate
    if (metrics.errorRate > 10) score += 30;
    else if (metrics.errorRate > 5) score += 15;

    // High number of suspicious requests
    if (metrics.suspiciousRequests > 10) score += 25;
    else if (metrics.suspiciousRequests > 5) score += 10;

    // Low diversity (potential bot attack)
    const diversityRatio = safeDivide(
      metrics.uniqueIPs,
      Math.max(metrics.totalRequests, 1),
      1
    );
    if (diversityRatio < 0.1) score += 20;

    return Math.min(100, score);
  }

  /**
   * Detect traffic anomalies
   */
  detectTrafficAnomalies(metrics) {
    const anomalies = [];

    // Request rate anomaly
    if (metrics.requestRate > 100) {
      anomalies.push({
        type: 'HIGH_REQUEST_RATE',
        severity: 'HIGH',
        value: metrics.requestRate,
        threshold: 100,
        description: `Request rate of ${metrics.requestRate.toFixed(2)} req/sec exceeds threshold`
      });
    }

    // Error rate anomaly
    if (metrics.errorRate > 10) {
      anomalies.push({
        type: 'HIGH_ERROR_RATE',
        severity: 'MEDIUM',
        value: metrics.errorRate,
        threshold: 10,
        description: `Error rate of ${metrics.errorRate.toFixed(2)}% exceeds threshold`
      });
    }

    // Response time anomaly
    if (metrics.avgResponseTime > 5000) {
      anomalies.push({
        type: 'SLOW_RESPONSE',
        severity: 'MEDIUM',
        value: metrics.avgResponseTime,
        threshold: 5000,
        description: `Average response time of ${metrics.avgResponseTime}ms exceeds threshold`
      });
    }

    return anomalies;
  }

  /**
   * Update threat indicators with memory management
   */
  updateThreatIndicators(metrics, anomalies) {
    const indicatorKey = 'global_traffic';

    if (!this.threatIndicators.has(indicatorKey)) {
      this.threatIndicators.set(indicatorKey, {
        threatScore: 0,
        lastUpdated: Date.now(),
        anomalies: []
      });
    }

    const indicator = this.threatIndicators.get(indicatorKey);
    indicator.threatScore = metrics.threatScore;
    indicator.lastUpdated = Date.now();
    indicator.anomalies = anomalies;

    // Check memory limit
    if (exceedsMapLimit(this.threatIndicators, this.limits.maxThreatIndicators)) {
      trimMapToLimit(
        this.threatIndicators,
        this.limits.maxThreatIndicators,
        entry => entry.lastUpdated
      );
    }
  }

  /**
   * Start threat detection
   */
  startThreatDetection() {
    const intervalId = setInterval(() => {
      if (this.isShuttingDown) return;
      this.performThreatDetection();
    }, 5000); // Every 5 seconds

    this.monitoringIntervals.push(intervalId);
  }

  /**
   * Perform comprehensive threat detection
   */
  performThreatDetection() {
    // Analyze events for known attack patterns
    const events = Array.from(this.securityEvents.values());
    const threats = [];

    // Check for common attack patterns
    threats.push(...this.detectInjectionAttacks(events));
    threats.push(...this.detectXSSAttacks(events));
    threats.push(...this.detectCSRFAttacks(events));
    threats.push(...this.detectBruteForceAttacks(events));
    threats.push(...this.detectDDoSAttacks(events));

    // Process detected threats
    for (const threat of threats) {
      this.handleDetectedThreat(threat);
    }
  }

  /**
   * Detect injection attacks
   */
  detectInjectionAttacks(events) {
    const threats = [];

    for (const event of events) {
      if (event.bodySize > 0 && event.body) {
        const body = typeof event.body === 'string'
          ? event.body
          : JSON.stringify(event.body);

        if (hasSQLInjection(body)) {
          threats.push({
            type: 'SQL_INJECTION',
            severity: 'CRITICAL',
            ip: event.ip,
            path: event.path,
            timestamp: event.timestamp
          });
        }
      }

      // Also check path
      if (hasSQLInjection(event.path)) {
        threats.push({
          type: 'SQL_INJECTION',
          severity: 'CRITICAL',
          ip: event.ip,
          path: event.path,
          timestamp: event.timestamp
        });
      }
    }

    return threats;
  }

  /**
   * Detect XSS attacks
   */
  detectXSSAttacks(events) {
    const threats = [];

    for (const event of events) {
      const userAgent = event.userAgent || '';
      const path = event.path || '';

      if (hasXSS(userAgent) || hasXSS(path)) {
        threats.push({
          type: 'XSS_ATTACK',
          severity: 'HIGH',
          ip: event.ip,
          path: event.path,
          timestamp: event.timestamp
        });
      }
    }

    return threats;
  }

  /**
   * Detect CSRF attacks
   */
  detectCSRFAttacks(events) {
    const threats = [];

    // Look for state-changing requests without proper CSRF tokens
    for (const event of events) {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(event.method)) {
        const headers = event.headers || {};
        const hasCSRFToken = headers['x-csrf-token'] || headers['x-xsrf-token'];

        if (!hasCSRFToken) {
          threats.push({
            type: 'POTENTIAL_CSRF',
            severity: 'MEDIUM',
            ip: event.ip,
            path: event.path,
            method: event.method,
            timestamp: event.timestamp
          });
        }
      }
    }

    return threats;
  }

  /**
   * Detect brute force attacks
   */
  detectBruteForceAttacks(events) {
    const threats = [];

    // Group events by IP
    const ipGroups = new Map();
    for (const event of events) {
      if (!ipGroups.has(event.ip)) {
        ipGroups.set(event.ip, []);
      }
      ipGroups.get(event.ip).push(event);
    }

    // Analyze each IP for brute force patterns
    for (const [ip, ipEvents] of ipGroups) {
      if (ipEvents.length > 50) { // More than 50 requests in analysis window
        const failedRequests = ipEvents.filter(e => e.statusCode >= 400).length;
        const failureRate = safeDivide(failedRequests, ipEvents.length, 0) * 100;

        if (failureRate > 80) { // More than 80% failure rate
          threats.push({
            type: 'BRUTE_FORCE',
            severity: 'HIGH',
            ip,
            requestCount: ipEvents.length,
            failureRate: failureRate.toFixed(2),
            timestamp: Date.now()
          });
        }
      }
    }

    return threats;
  }

  /**
   * Detect DDoS attacks
   */
  detectDDoSAttacks(events) {
    const threats = [];

    // Group by IP and check request rates
    const ipGroups = new Map();
    for (const event of events) {
      if (!ipGroups.has(event.ip)) {
        ipGroups.set(event.ip, []);
      }
      ipGroups.get(event.ip).push(event);
    }

    for (const [ip, ipEvents] of ipGroups) {
      if (ipEvents.length > 100) { // More than 100 requests in window
        threats.push({
          type: 'DDOS_ATTACK',
          severity: 'CRITICAL',
          ip,
          requestCount: ipEvents.length,
          timestamp: Date.now()
        });
      }
    }

    return threats;
  }

  /**
   * Handle detected threat
   */
  handleDetectedThreat(threat) {
    this.stats.threatsDetected++;

    // Create incident
    const incident = this.createIncident(threat);

    // Generate alert
    this.generateSecurityAlert({
      type: 'THREAT_DETECTED',
      severity: threat.severity,
      threat,
      incidentId: incident.id,
      timestamp: Date.now()
    });

    // Trigger automated response if enabled
    if (this.config.incidentResponseEnabled) {
      this.triggerAutomatedResponse(threat, incident);
    }
  }

  /**
   * Create incident from threat with memory management
   */
  createIncident(threat) {
    const incidentId = generateSecureId('inc');

    const incident = {
      id: incidentId,
      type: threat.type,
      severity: threat.severity,
      status: 'ACTIVE',
      threat,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedTo: null,
      actions: [],
      notes: []
    };

    this.activeIncidents.set(incidentId, incident);
    this.incidentHistory.push(incident);
    this.stats.incidentsCreated++;

    // Check memory limits
    if (exceedsMapLimit(this.activeIncidents, this.limits.maxActiveIncidents)) {
      this.cleanupOldIncidents();
    }

    if (this.incidentHistory.length > this.limits.maxIncidents) {
      this.incidentHistory = this.incidentHistory.slice(-this.limits.maxIncidents);
    }

    logger.warn('Security incident created', {
      incidentId,
      type: threat.type,
      severity: threat.severity,
      ip: threat.ip
    });

    return incident;
  }

  /**
   * Start anomaly detection
   */
  startAnomalyDetection() {
    const intervalId = setInterval(() => {
      if (this.isShuttingDown) return;
      this.performAnomalyDetection();
    }, 10000); // Every 10 seconds

    this.monitoringIntervals.push(intervalId);
  }

  /**
   * Perform anomaly detection using statistical methods
   */
  performAnomalyDetection() {
    // Get baseline from historical data
    const baseline = this.calculateBaselineMetrics();

    // Compare current metrics with baseline
    const currentMetrics = this.calculateCurrentMetrics();

    // Detect statistical anomalies
    const anomalies = this.detectStatisticalAnomalies(baseline, currentMetrics);

    // Handle detected anomalies
    for (const anomaly of anomalies) {
      this.handleAnomaly(anomaly);
    }
  }

  /**
   * Calculate baseline metrics from historical data
   */
  calculateBaselineMetrics() {
    const recentEvents = Array.from(this.securityEvents.values())
      .filter(event => Date.now() - event.timestamp < 3600000); // Last hour

    if (recentEvents.length === 0) {
      return {
        avgResponseTime: 1000,
        avgRequestRate: 10,
        avgErrorRate: 1,
        stdDevResponseTime: 500
      };
    }

    const responseTimes = recentEvents.filter(e => e.responseTime).map(e => e.responseTime);
    const requestRate = safeDivide(recentEvents.length, 3600, 0); // requests per second over last hour
    const errorCount = recentEvents.filter(e => e.statusCode >= 400).length;
    const errorRate = safeDivide(errorCount, recentEvents.length, 0) * 100;

    return {
      avgResponseTime: responseTimes.length > 0 ?
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 1000,
      avgRequestRate: requestRate,
      avgErrorRate: errorRate,
      stdDevResponseTime: this.calculateStandardDeviation(responseTimes)
    };
  }

  /**
   * Calculate current metrics
   */
  calculateCurrentMetrics() {
    const recentEvents = Array.from(this.securityEvents.values())
      .filter(event => Date.now() - event.timestamp < 60000); // Last minute

    if (recentEvents.length === 0) {
      return {
        avgResponseTime: 0,
        requestRate: 0,
        errorRate: 0
      };
    }

    const responseTimes = recentEvents.filter(e => e.responseTime).map(e => e.responseTime);
    const requestRate = safeDivide(recentEvents.length, 60, 0); // requests per second
    const errorCount = recentEvents.filter(e => e.statusCode >= 400).length;
    const errorRate = safeDivide(errorCount, recentEvents.length, 0) * 100;

    return {
      avgResponseTime: responseTimes.length > 0 ?
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      requestRate,
      errorRate
    };
  }

  /**
   * Detect statistical anomalies
   */
  detectStatisticalAnomalies(baseline, current) {
    const anomalies = [];

    // Response time anomaly
    const responseThreshold = baseline.avgResponseTime + (baseline.stdDevResponseTime * 2);
    if (current.avgResponseTime > responseThreshold && current.avgResponseTime > 0) {
      const deviation = safeDivide(
        current.avgResponseTime - baseline.avgResponseTime,
        baseline.avgResponseTime,
        0
      ) * 100;

      anomalies.push({
        type: 'SLOW_RESPONSE_ANOMALY',
        metric: 'responseTime',
        baseline: baseline.avgResponseTime,
        current: current.avgResponseTime,
        deviation
      });
    }

    // Request rate anomaly
    if (current.requestRate > baseline.avgRequestRate * 3 && baseline.avgRequestRate > 0) {
      const deviation = safeDivide(
        current.requestRate - baseline.avgRequestRate,
        baseline.avgRequestRate,
        0
      ) * 100;

      anomalies.push({
        type: 'HIGH_REQUEST_RATE_ANOMALY',
        metric: 'requestRate',
        baseline: baseline.avgRequestRate,
        current: current.requestRate,
        deviation
      });
    }

    // Error rate anomaly
    if (current.errorRate > baseline.avgErrorRate * 2 && baseline.avgErrorRate > 0) {
      const deviation = safeDivide(
        current.errorRate - baseline.avgErrorRate,
        baseline.avgErrorRate,
        0
      ) * 100;

      anomalies.push({
        type: 'HIGH_ERROR_RATE_ANOMALY',
        metric: 'errorRate',
        baseline: baseline.avgErrorRate,
        current: current.errorRate,
        deviation
      });
    }

    return anomalies;
  }

  /**
   * Handle detected anomaly
   */
  handleAnomaly(anomaly) {
    this.stats.anomaliesDetected++;

    logger.warn('Security anomaly detected', {
      type: anomaly.type,
      metric: anomaly.metric,
      deviation: `${anomaly.deviation.toFixed(2)}%`,
      baseline: anomaly.baseline,
      current: anomaly.current
    });

    // Create anomaly incident
    const incident = this.createIncident({
      type: anomaly.type,
      severity: anomaly.deviation > 100 ? 'HIGH' : 'MEDIUM',
      anomaly,
      timestamp: Date.now()
    });

    // Generate alert
    this.generateSecurityAlert({
      type: 'ANOMALY_DETECTED',
      severity: anomaly.deviation > 100 ? 'HIGH' : 'MEDIUM',
      anomaly,
      incidentId: incident.id,
      timestamp: Date.now()
    });
  }

  /**
   * Start behavioral analysis
   */
  startBehavioralAnalysis() {
    const intervalId = setInterval(() => {
      if (this.isShuttingDown) return;
      this.performBehavioralAnalysis();
    }, 30000); // Every 30 seconds

    this.monitoringIntervals.push(intervalId);
  }

  /**
   * Perform behavioral analysis on user patterns
   */
  performBehavioralAnalysis() {
    // Analyze user behavior patterns
    const ipBehaviors = this.analyzeIPBehaviors();
    const endpointBehaviors = this.analyzeEndpointBehaviors();

    // Update behavioral profiles with memory management
    this.updateBehavioralProfiles(ipBehaviors, endpointBehaviors);

    // Detect behavioral anomalies
    const behavioralAnomalies = this.detectBehavioralAnomalies(ipBehaviors);

    // Handle behavioral anomalies
    for (const anomaly of behavioralAnomalies) {
      this.handleBehavioralAnomaly(anomaly);
    }
  }

  /**
   * Analyze IP-based behaviors
   */
  analyzeIPBehaviors() {
    const behaviors = new Map();

    // Group events by IP
    for (const event of this.securityEvents.values()) {
      if (!behaviors.has(event.ip)) {
        behaviors.set(event.ip, {
          ip: event.ip,
          requestCount: 0,
          paths: new Set(),
          methods: new Set(),
          avgResponseTime: 0,
          errorCount: 0,
          lastSeen: 0,
          responseTimes: []
        });
      }

      const behavior = behaviors.get(event.ip);
      behavior.requestCount++;
      behavior.paths.add(event.path);
      behavior.methods.add(event.method);
      behavior.lastSeen = event.timestamp;

      if (event.responseTime) {
        behavior.responseTimes.push(event.responseTime);
      }

      if (event.statusCode >= 400) {
        behavior.errorCount++;
      }
    }

    // Calculate averages
    for (const behavior of behaviors.values()) {
      if (behavior.responseTimes.length > 0) {
        behavior.avgResponseTime = behavior.responseTimes.reduce((a, b) => a + b, 0) / behavior.responseTimes.length;
      }
    }

    return behaviors;
  }

  /**
   * Analyze endpoint behaviors
   */
  analyzeEndpointBehaviors() {
    const behaviors = new Map();

    for (const event of this.securityEvents.values()) {
      const endpoint = `${event.method}:${event.path}`;

      if (!behaviors.has(endpoint)) {
        behaviors.set(endpoint, {
          endpoint,
          requestCount: 0,
          uniqueIPs: new Set(),
          avgResponseTime: 0,
          errorCount: 0,
          responseTimes: []
        });
      }

      const behavior = behaviors.get(endpoint);
      behavior.requestCount++;
      behavior.uniqueIPs.add(event.ip);

      if (event.responseTime) {
        behavior.responseTimes.push(event.responseTime);
      }

      if (event.statusCode >= 400) {
        behavior.errorCount++;
      }
    }

    // Calculate averages
    for (const behavior of behaviors.values()) {
      if (behavior.responseTimes.length > 0) {
        behavior.avgResponseTime = behavior.responseTimes.reduce((a, b) => a + b, 0) / behavior.responseTimes.length;
      }
    }

    return behaviors;
  }

  /**
   * Update behavioral profiles with memory management
   */
  updateBehavioralProfiles(ipBehaviors, endpointBehaviors) {
    // Store behavioral profiles for comparison
    for (const [ip, behavior] of ipBehaviors) {
      this.behavioralProfiles.set(`ip:${ip}`, behavior);
    }

    for (const [endpoint, behavior] of endpointBehaviors) {
      this.behavioralProfiles.set(`endpoint:${endpoint}`, behavior);
    }

    // Check memory limits
    if (exceedsMapLimit(this.behavioralProfiles, this.limits.maxBehavioralProfiles)) {
      trimMapToLimit(
        this.behavioralProfiles,
        this.limits.maxBehavioralProfiles,
        entry => entry.lastSeen || entry.lastUpdated || 0
      );
    }
  }

  /**
   * Detect behavioral anomalies
   */
  detectBehavioralAnomalies(ipBehaviors) {
    const anomalies = [];

    for (const [ip, behavior] of ipBehaviors) {
      // Compare with historical profile
      const profile = this.behavioralProfiles.get(`ip:${ip}`);

      if (profile && profile.requestCount > 0) {
        // Check for significant changes in behavior
        const requestIncrease = safeDivide(
          behavior.requestCount - profile.requestCount,
          profile.requestCount,
          0
        ) * 100;

        const errorIncrease = safeDivide(
          behavior.errorCount - (profile.errorCount || 0),
          Math.max(profile.errorCount || 1, 1),
          0
        ) * 100;

        if (requestIncrease > 200) { // 200% increase
          anomalies.push({
            type: 'UNUSUAL_REQUEST_INCREASE',
            ip,
            metric: 'requestCount',
            current: behavior.requestCount,
            previous: profile.requestCount,
            increase: `${requestIncrease.toFixed(2)}%`
          });
        }

        if (errorIncrease > 100 && behavior.errorCount > 5) { // 100% increase and at least 5 errors
          anomalies.push({
            type: 'UNUSUAL_ERROR_INCREASE',
            ip,
            metric: 'errorCount',
            current: behavior.errorCount,
            previous: profile.errorCount || 0,
            increase: `${errorIncrease.toFixed(2)}%`
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Handle behavioral anomaly
   */
  handleBehavioralAnomaly(anomaly) {
    logger.warn('Behavioral anomaly detected', {
      type: anomaly.type,
      ip: anomaly.ip,
      metric: anomaly.metric,
      increase: anomaly.increase
    });

    // Create behavioral incident
    this.createIncident({
      type: anomaly.type,
      severity: 'MEDIUM',
      anomaly,
      timestamp: Date.now()
    });
  }

  /**
   * Start incident response
   */
  startIncidentResponse() {
    // Automated response handlers
    this.registerIncidentResponders();
  }

  /**
   * Register automated incident responders
   */
  registerIncidentResponders() {
    // IP blocking for critical threats
    this.incidentResponders.set('CRITICAL_THREAT', async (incident) => {
      logger.error('Automated response: Blocking IP for critical threat', {
        incidentId: incident.id,
        ip: incident.threat?.ip
      });

      // In a real implementation, this would integrate with firewall or rate limiting
      incident.actions.push({
        type: 'IP_BLOCKED',
        timestamp: Date.now(),
        automated: true
      });
    });

    // Rate limiting for high threats
    this.incidentResponders.set('HIGH_THREAT', async (incident) => {
      logger.warn('Automated response: Applying rate limiting for high threat', {
        incidentId: incident.id,
        ip: incident.threat?.ip
      });

      incident.actions.push({
        type: 'RATE_LIMITED',
        timestamp: Date.now(),
        automated: true
      });
    });
  }

  /**
   * Trigger automated response
   */
  async triggerAutomatedResponse(threat, incident) {
    const responder = this.incidentResponders.get(`${threat.severity}_THREAT`);

    if (responder) {
      try {
        await responder(incident);
        incident.status = 'MITIGATED';
        incident.updatedAt = Date.now();
      } catch (error) {
        logger.error('Automated response failed', {
          incidentId: incident.id,
          error: error.message
        });
      }
    }
  }

  /**
   * Generate security alert
   */
  generateSecurityAlert(alertData) {
    this.stats.alertsSent++;

    // Call registered alert callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alertData);
      } catch (error) {
        logger.error('Alert callback failed', { error: error.message });
      }
    }

    // Log alert
    logger.warn('Security alert generated', alertData);
  }

  /**
   * Register alert callback
   */
  registerAlertCallback(callback) {
    if (typeof callback === 'function') {
      this.alertCallbacks.add(callback);
    }
  }

  /**
   * Load threat intelligence data
   */
  loadThreatIntelligence() {
    // Note: Removed hardcoded example IPs (192.168.1.100, 10.0.0.50) as they are
    // internal/private IP ranges and not actual malicious IPs

    logger.info('Threat intelligence loaded', {
      signatures: this.threatSignatures.size,
      attackPatterns: this.knownAttackPatterns.size
    });
  }

  /**
   * Start memory cleanup interval
   */
  startMemoryCleanup() {
    const intervalId = setInterval(() => {
      if (this.isShuttingDown) return;
      this.performMemoryCleanup();
    }, 60000); // Every minute

    this.monitoringIntervals.push(intervalId);
  }

  /**
   * Perform comprehensive memory cleanup
   */
  performMemoryCleanup() {
    const before = {
      events: this.securityEvents.size,
      incidents: this.incidentHistory.length,
      activeIncidents: this.activeIncidents.size,
      threatIndicators: this.threatIndicators.size,
      behavioralProfiles: this.behavioralProfiles.size,
      rateLimiters: this.rateLimiters.size
    };

    // Clean old events
    this.cleanupOldEvents();

    // Clean old incidents
    this.cleanupOldIncidents();

    // Clean old rate limiters
    this.cleanupRateLimiters();

    const after = {
      events: this.securityEvents.size,
      incidents: this.incidentHistory.length,
      activeIncidents: this.activeIncidents.size,
      threatIndicators: this.threatIndicators.size,
      behavioralProfiles: this.behavioralProfiles.size,
      rateLimiters: this.rateLimiters.size
    };

    this.stats.memoryCleanups++;

    logger.debug('Memory cleanup completed', { before, after });
  }

  /**
   * Clean up old events and incidents
   */
  cleanupOldEvents() {
    const cutoff = Date.now() - this.config.retentionPeriod;
    let removed = 0;

    // Clean old events
    for (const [eventId, event] of this.securityEvents) {
      if (event.timestamp < cutoff) {
        this.securityEvents.delete(eventId);
        removed++;
      }
    }

    // Also enforce max size limit
    if (exceedsMapLimit(this.securityEvents, this.limits.maxEvents)) {
      trimMapToLimit(this.securityEvents, this.limits.maxEvents, event => event.timestamp);
    }

    return removed;
  }

  /**
   * Clean old incidents
   */
  cleanupOldIncidents() {
    const cutoff = Date.now() - this.config.retentionPeriod;

    // Clean old incidents from history
    const beforeLength = this.incidentHistory.length;
    this.incidentHistory = this.incidentHistory.filter(incident => incident.createdAt > cutoff);

    // Also enforce max size
    if (this.incidentHistory.length > this.limits.maxIncidents) {
      this.incidentHistory = this.incidentHistory.slice(-this.limits.maxIncidents);
    }

    // Clean old active incidents
    for (const [incidentId, incident] of this.activeIncidents) {
      if (incident.createdAt < cutoff || incident.status === 'RESOLVED') {
        this.activeIncidents.delete(incidentId);
      }
    }

    // Enforce max active incidents
    if (exceedsMapLimit(this.activeIncidents, this.limits.maxActiveIncidents)) {
      trimMapToLimit(
        this.activeIncidents,
        this.limits.maxActiveIncidents,
        incident => incident.createdAt
      );
    }

    return beforeLength - this.incidentHistory.length;
  }

  /**
   * Clean up old rate limiters
   */
  cleanupRateLimiters() {
    // Remove rate limiters that haven't been used recently
    const maxRateLimiters = 10000;

    if (this.rateLimiters.size > maxRateLimiters) {
      // Convert to array and sort by last access
      const limiters = Array.from(this.rateLimiters.entries());
      limiters.sort((a, b) => b[1].lastRefill - a[1].lastRefill);

      // Keep only the most recent
      this.rateLimiters.clear();
      for (let i = 0; i < maxRateLimiters && i < limiters.length; i++) {
        this.rateLimiters.set(limiters[i][0], limiters[i][1]);
      }
    }
  }

  /**
   * Update monitoring statistics
   */
  updateMonitoringStats(metrics) {
    this.stats.responseTime = metrics.avgResponseTime;
  }

  /**
   * Calculate standard deviation
   */
  calculateStandardDeviation(values) {
    if (!values || values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Register shutdown handlers for graceful shutdown
   */
  registerShutdownHandlers() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;

      logger.info(`Received ${signal}, starting graceful shutdown...`);
      this.isShuttingDown = true;

      // Stop all monitoring intervals
      for (const intervalId of this.monitoringIntervals) {
        clearInterval(intervalId);
      }

      // Wait for active requests to complete (with timeout)
      const shutdownTimeout = 30000; // 30 seconds
      const startTime = Date.now();

      while (this.activeRequests.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
        logger.info(`Waiting for ${this.activeRequests.size} active requests to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (this.activeRequests.size > 0) {
        logger.warn(`Forcing shutdown with ${this.activeRequests.size} active requests remaining`);
      }

      logger.info('Security monitoring shutdown complete', {
        stats: this.getStatistics(),
        performanceMetrics: this.performanceMetrics
      });

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Get security monitoring statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      activeEvents: this.securityEvents.size,
      activeIncidents: this.activeIncidents.size,
      threatIndicators: this.threatIndicators.size,
      behavioralProfiles: this.behavioralProfiles.size,
      activeRequests: this.activeRequests.size,
      rateLimiters: this.rateLimiters.size,
      config: this.config,
      limits: this.limits,
      performanceMetrics: this.performanceMetrics
    };
  }

  /**
   * Get recent incidents
   */
  getRecentIncidents(limit = 50) {
    const validLimit = Math.min(Math.max(1, limit), 1000);
    return this.incidentHistory.slice(-validLimit);
  }

  /**
   * Get active incidents
   */
  getActiveIncidents() {
    return Array.from(this.activeIncidents.values());
  }

  /**
   * Resolve incident manually
   */
  resolveIncident(incidentId, notes = '') {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) {
      throw createSecurityError(
        'INCIDENT_NOT_FOUND',
        `Incident not found: ${incidentId}`,
        { incidentId }
      );
    }

    incident.status = 'RESOLVED';
    incident.updatedAt = Date.now();
    incident.notes.push({
      type: 'RESOLUTION',
      content: notes,
      timestamp: Date.now()
    });

    this.activeIncidents.delete(incidentId);

    logger.info('Incident resolved manually', {
      incidentId,
      type: incident.type,
      severity: incident.severity
    });

    return incident;
  }

  /**
   * Reset monitoring data
   */
  resetMonitoring() {
    this.securityEvents.clear();
    this.incidentHistory = [];
    this.activeIncidents.clear();
    this.threatIndicators.clear();
    this.behavioralProfiles.clear();
    this.rateLimiters.clear();

    this.resetStatistics();

    logger.info('Security monitoring data reset');
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      eventsProcessed: 0,
      threatsDetected: 0,
      anomaliesDetected: 0,
      incidentsCreated: 0,
      falsePositives: 0,
      responseTime: 0,
      alertsSent: 0,
      blockedRequests: 0,
      invalidInputs: 0,
      memoryCleanups: 0
    };

    this.performanceMetrics = {
      avgProcessingTime: 0,
      maxProcessingTime: 0,
      minProcessingTime: Infinity,
      totalProcessingTime: 0,
      requestCount: 0
    };
  }
}

// Export singleton instance
const realTimeSecurityMonitor = new RealTimeSecurityMonitor();

module.exports = realTimeSecurityMonitor;
