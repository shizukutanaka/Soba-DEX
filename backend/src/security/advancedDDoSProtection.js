/**
 * Advanced DDoS Protection System
 * Multi-layered defense against sophisticated DDoS attacks
 */

const { logger } = require('../utils/productionLogger');

class AdvancedDDoSProtection {
  constructor() {
    this.config = {
      enabled: process.env.DDOS_PROTECTION !== 'false',
      sensitivityLevel: parseInt(process.env.DDOS_SENSITIVITY) || 3, // 1-5
      adaptiveThresholds: process.env.DDOS_ADAPTIVE !== 'false',
      geoBlocking: process.env.DDOS_GEO_BLOCKING !== 'false',
      botDetection: process.env.DDOS_BOT_DETECTION !== 'false',
      rateLimiting: process.env.DDOS_RATE_LIMITING !== 'false',
      trafficAnalysis: process.env.DDOS_TRAFFIC_ANALYSIS !== 'false',
      autoMitigation: process.env.DDOS_AUTO_MITIGATION !== 'false',
      whitelistEnabled: process.env.DDOS_WHITELIST !== 'false'
    };

    // Traffic monitoring
    this.trafficMonitor = {
      requests: new Map(), // IP -> request history
      endpoints: new Map(), // endpoint -> request patterns
      userAgents: new Map(), // user agent -> request patterns
      referrers: new Map(), // referrer -> request patterns
      countries: new Map(), // country -> request patterns
      timeWindows: new Map() // time window -> aggregated stats
    };

    // Attack detection
    this.attackPatterns = new Map();
    this.blockedIPs = new Set();
    this.suspiciousIPs = new Map();
    this.whitelist = new Set();

    // Mitigation strategies
    this.mitigationStrategies = {
      rateLimiting: this.applyRateLimiting.bind(this),
      geoBlocking: this.applyGeoBlocking.bind(this),
      botFiltering: this.applyBotFiltering.bind(this),
      challengeResponse: this.applyChallengeResponse.bind(this),
      trafficShaping: this.applyTrafficShaping.bind(this)
    };

    // Statistics
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      suspiciousRequests: 0,
      mitigatedAttacks: 0,
      falsePositives: 0,
      avgResponseTime: 0,
      peakTraffic: 0,
      attacksDetected: 0
    };

    // Load whitelist
    this.loadWhitelist();

    if (this.config.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Main DDoS protection middleware
   */
  middleware() {
    return async (req, res, next) => {
      if (!this.config.enabled) {
        return next();
      }

      const clientIP = this.getClientIP(req);
      const timestamp = Date.now();

      try {
        // Step 1: Whitelist check
        if (this.config.whitelistEnabled && this.whitelist.has(clientIP)) {
          this.recordRequest(clientIP, req, 'whitelisted');
          return next();
        }

        // Step 2: Basic traffic analysis
        const trafficAnalysis = await this.analyzeTraffic(clientIP, req);

        // Step 3: Attack detection
        const attackDetection = this.detectAttack(trafficAnalysis, clientIP, req);

        if (attackDetection.isAttack) {
          this.stats.attacksDetected++;
          await this.mitigateAttack(attackDetection, clientIP, req, res);
          return;
        }

        // Step 4: Suspicious activity check
        if (attackDetection.riskLevel >= this.config.sensitivityLevel) {
          this.stats.suspiciousRequests++;
          await this.handleSuspiciousRequest(attackDetection, clientIP, req, res);
          return;
        }

        // Step 5: Record normal request
        this.recordRequest(clientIP, req, 'normal');

        // Apply traffic shaping for high-frequency requests
        if (trafficAnalysis.requestRate > 100) { // More than 100 req/sec
          await this.applyTrafficShaping(clientIP, req, res);
        }

        next();

      } catch (error) {
        logger.error('DDoS protection error', {
          error: error.message,
          ip: clientIP,
          path: req.path
        });

        // On error, allow request through but log it
        this.recordRequest(clientIP, req, 'error');
        next();
      }
    };
  }

  /**
   * Analyze traffic patterns for a specific IP
   */
  async analyzeTraffic(clientIP, req) {
    const now = Date.now();
    const windowSize = 60000; // 1 minute windows
    const currentWindow = Math.floor(now / windowSize);

    // Initialize IP tracking if not exists
    if (!this.trafficMonitor.requests.has(clientIP)) {
      this.trafficMonitor.requests.set(clientIP, {
        requests: [],
        blocked: 0,
        suspicious: 0,
        firstSeen: now,
        lastSeen: now,
        userAgent: req.headers['user-agent'],
        country: await this.getCountryFromIP(clientIP)
      });
    }

    const ipData = this.trafficMonitor.requests.get(clientIP);

    // Clean old requests (keep last 10 minutes)
    ipData.requests = ipData.requests.filter(req => now - req.timestamp < 600000);
    ipData.lastSeen = now;

    // Add current request
    ipData.requests.push({
      timestamp: now,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer,
      status: null // Will be updated when response is sent
    });

    // Calculate request rate
    const recentRequests = ipData.requests.filter(req => now - req.timestamp < 60000);
    const requestRate = recentRequests.length / 60; // requests per second

    // Analyze request patterns
    const patterns = this.analyzeRequestPatterns(ipData.requests);

    // Update endpoint statistics
    this.updateEndpointStats(req.path, req.method, now);

    // Update user agent statistics
    this.updateUserAgentStats(req.headers['user-agent'], now);

    return {
      ipData,
      requestRate,
      patterns,
      currentWindow,
      timeSinceFirstSeen: now - ipData.firstSeen,
      totalRequests: ipData.requests.length,
      uniquePaths: new Set(ipData.requests.map(r => r.path)).size,
      uniqueUserAgents: new Set(ipData.requests.map(r => r.userAgent)).size
    };
  }

  /**
   * Detect potential DDoS attacks
   */
  detectAttack(trafficAnalysis, clientIP, req) {
    const { requestRate, patterns, ipData } = trafficAnalysis;
    let riskScore = 0;
    let riskFactors = [];
    let isAttack = false;

    // High request rate detection
    if (requestRate > 50) { // More than 50 req/sec
      riskScore += 3;
      riskFactors.push(`High request rate: ${requestRate.toFixed(2)} req/sec`);
    }

    // Suspicious patterns
    if (patterns.identicalRequests > 0.8) { // More than 80% identical requests
      riskScore += 2;
      riskFactors.push(`Identical request pattern: ${(patterns.identicalRequests * 100).toFixed(1)}%`);
    }

    if (patterns.sequentialPaths) {
      riskScore += 2;
      riskFactors.push('Sequential path access pattern');
    }

    if (patterns.rapidEndpointSwitching) {
      riskScore += 1;
      riskFactors.push('Rapid endpoint switching');
    }

    // User agent anomalies
    if (ipData.uniqueUserAgents > 10 && ipData.requests.length < 100) {
      riskScore += 1;
      riskFactors.push('Multiple user agents in short time');
    }

    // Bot-like behavior
    if (this.detectBotBehavior(req)) {
      riskScore += 2;
      riskFactors.push('Bot-like behavior detected');
    }

    // Known attack patterns
    const knownAttacks = this.detectKnownAttackPatterns(trafficAnalysis, req);
    if (knownAttacks.length > 0) {
      riskScore += 3;
      riskFactors.push(`Known attack patterns: ${knownAttacks.join(', ')}`);
      isAttack = true;
    }

    // Geographic anomalies
    if (this.detectGeographicAnomalies(clientIP, ipData.country)) {
      riskScore += 1;
      riskFactors.push('Geographic anomaly detected');
    }

    // Determine risk level
    let riskLevel = 1; // LOW
    if (riskScore >= 8) riskLevel = 5; // CRITICAL
    else if (riskScore >= 6) riskLevel = 4; // HIGH
    else if (riskScore >= 4) riskLevel = 3; // MEDIUM
    else if (riskScore >= 2) riskLevel = 2; // LOW

    // Auto-classify as attack if risk is very high
    if (riskScore >= 8) {
      isAttack = true;
    }

    return {
      isAttack,
      riskScore,
      riskLevel,
      riskFactors,
      recommendation: this.getMitigationRecommendation(riskScore, riskLevel)
    };
  }

  /**
   * Analyze request patterns for anomalies
   */
  analyzeRequestPatterns(requests) {
    if (requests.length < 5) {
      return {
        identicalRequests: 0,
        sequentialPaths: false,
        rapidEndpointSwitching: false
      };
    }

    // Check for identical requests
    const requestStrings = requests.map(r => `${r.method}:${r.path}`);
    const uniqueRequests = new Set(requestStrings);
    const identicalRequests = (requestStrings.length - uniqueRequests.size) / requestStrings.length;

    // Check for sequential path access (potential directory scanning)
    const paths = requests.map(r => r.path);
    const sequentialPaths = this.detectSequentialAccess(paths);

    // Check for rapid endpoint switching
    const endpoints = [...new Set(paths)];
    const rapidEndpointSwitching = endpoints.length > requests.length * 0.5;

    return {
      identicalRequests,
      sequentialPaths,
      rapidEndpointSwitching
    };
  }

  /**
   * Detect sequential access patterns
   */
  detectSequentialAccess(paths) {
    if (paths.length < 10) return false;

    // Look for patterns like /api/1, /api/2, /api/3, etc.
    const numericPaths = paths.filter(p => /\/\d+$/.test(p));
    if (numericPaths.length < 5) return false;

    // Check if they're sequential
    const numbers = numericPaths.map(p => parseInt(p.match(/\/(\d+)$/)[1])).sort((a, b) => a - b);
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] !== numbers[i-1] + 1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Detect bot-like behavior
   */
  detectBotBehavior(req) {
    const userAgent = req.headers['user-agent'] || '';
    const headers = req.headers;

    const botIndicators = [
      // Missing common headers
      !headers['accept-language'],
      !headers['accept-encoding'],
      !headers['cache-control'],

      // Bot-like user agents
      /bot|crawler|spider|scraper/i.test(userAgent),
      /python|java|curl|wget/i.test(userAgent),

      // Missing referrer for non-direct access
      !headers.referer && !req.path.startsWith('/api/'),

      // Unusual header patterns
      headers['x-forwarded-for'] && headers['x-forwarded-for'].split(',').length > 5
    ];

    return botIndicators.filter(Boolean).length >= 2;
  }

  /**
   * Detect known attack patterns
   */
  detectKnownAttackPatterns(trafficAnalysis, req) {
    const patterns = [];
    const { requestRate, patterns: requestPatterns } = trafficAnalysis;

    // SYN flood simulation (rapid connection attempts)
    if (requestRate > 100 && requestPatterns.identicalRequests > 0.9) {
      patterns.push('SYN_FLOOD_SIMULATION');
    }

    // Application layer attacks
    if (req.path.includes('/admin') && requestRate > 20) {
      patterns.push('ADMIN_PANEL_ATTACK');
    }

    if (req.path.includes('/api/') && requestRate > 30) {
      patterns.push('API_FLOOD');
    }

    // Slowloris-like attacks (very slow requests)
    if (requestRate < 1 && trafficAnalysis.timeSinceFirstSeen > 300000) { // 5 minutes
      patterns.push('SLOWLORIS_ATTACK');
    }

    return patterns;
  }

  /**
   * Detect geographic anomalies
   */
  detectGeographicAnomalies(clientIP, country) {
    // This would integrate with a geolocation service
    // For now, we'll use a simple heuristic
    const suspiciousCountries = ['CN', 'RU', 'KP', 'IR']; // Example list

    return suspiciousCountries.includes(country);
  }

  /**
   * Get mitigation recommendation based on risk
   */
  getMitigationRecommendation(riskScore, riskLevel) {
    if (riskLevel >= 5) {
      return ['BLOCK_IP', 'RATE_LIMIT_AGGRESSIVE', 'CHALLENGE_RESPONSE'];
    } else if (riskLevel >= 4) {
      return ['RATE_LIMIT_MODERATE', 'BOT_FILTERING', 'TRAFFIC_SHAPING'];
    } else if (riskLevel >= 3) {
      return ['RATE_LIMIT_LIGHT', 'USER_AGENT_FILTERING'];
    } else {
      return ['MONITOR_ONLY'];
    }
  }

  /**
   * Mitigate detected attack
   */
  async mitigateAttack(attackDetection, clientIP, req, res) {
    this.stats.mitigatedAttacks++;
    this.blockedIPs.add(clientIP);

    logger.warn('DDoS attack mitigated', {
      ip: clientIP,
      riskScore: attackDetection.riskScore,
      riskFactors: attackDetection.riskFactors,
      path: req.path
    });

    // Apply multiple mitigation strategies
    for (const strategy of attackDetection.recommendation) {
      await this.mitigationStrategies[strategy.toLowerCase()]?.(clientIP, req, res);
    }

    res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      code: 'DDOS_PROTECTION',
      retryAfter: 3600 // 1 hour
    });
  }

  /**
   * Handle suspicious requests
   */
  async handleSuspiciousRequest(attackDetection, clientIP, req, res) {
    const ipData = this.trafficMonitor.requests.get(clientIP);
    ipData.suspicious++;

    // Apply lighter mitigation for suspicious requests
    if (attackDetection.riskLevel >= 4) {
      await this.applyRateLimiting(clientIP, req, res);
    }

    // Log suspicious activity
    logger.info('Suspicious request detected', {
      ip: clientIP,
      riskLevel: attackDetection.riskLevel,
      riskFactors: attackDetection.riskFactors,
      path: req.path
    });

    next(); // Allow request through but monitor closely
  }

  /**
   * Apply rate limiting mitigation
   */
  async applyRateLimiting(clientIP, req, res) {
    const rateLimit = this.calculateDynamicRateLimit(clientIP);
    res.setHeader('X-RateLimit-Limit', rateLimit.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, rateLimit.limit - rateLimit.current));
    res.setHeader('X-RateLimit-Reset', rateLimit.resetTime);
  }

  /**
   * Apply geographic blocking
   */
  async applyGeoBlocking(clientIP, req, res) {
    const country = await this.getCountryFromIP(clientIP);
    if (this.shouldBlockCountry(country)) {
      res.setHeader('X-Blocked-Reason', 'Geographic restriction');
      throw new Error('Geographic blocking applied');
    }
  }

  /**
   * Apply bot filtering
   */
  async applyBotFiltering(clientIP, req, res) {
    if (this.detectBotBehavior(req)) {
      res.setHeader('X-Blocked-Reason', 'Bot behavior detected');
      throw new Error('Bot filtering applied');
    }
  }

  /**
   * Apply challenge-response mechanism
   */
  async applyChallengeResponse(clientIP, req, res) {
    const challenge = this.generateChallenge();
    res.setHeader('X-Challenge-Required', challenge);

    // Store challenge for verification
    this.storeChallenge(clientIP, challenge);

    res.status(401).json({
      success: false,
      error: 'Challenge Required',
      code: 'CHALLENGE_REQUIRED',
      challenge
    });
  }

  /**
   * Apply traffic shaping
   */
  async applyTrafficShaping(clientIP, req, res) {
    // Add artificial delay to slow down high-frequency requests
    const delay = Math.min(1000, this.calculateTrafficDelay(clientIP)); // Max 1 second delay

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      res.setHeader('X-Traffic-Shaped', `${delay}ms`);
    }
  }

  /**
   * Calculate dynamic rate limit based on IP behavior
   */
  calculateDynamicRateLimit(clientIP) {
    const ipData = this.trafficMonitor.requests.get(clientIP);
    if (!ipData) {
      return { limit: 100, current: 0, resetTime: Date.now() + 60000 };
    }

    // Base rate limit
    let limit = 100; // requests per minute

    // Adjust based on behavior
    if (ipData.suspicious > 5) {
      limit = 20;
    } else if (ipData.suspicious > 2) {
      limit = 50;
    }

    // Adjust based on account age
    const accountAge = Date.now() - ipData.firstSeen;
    if (accountAge < 3600000) { // Less than 1 hour
      limit = Math.floor(limit * 0.5);
    }

    const currentRequests = ipData.requests.filter(r => Date.now() - r.timestamp < 60000).length;

    return {
      limit,
      current: currentRequests,
      resetTime: Date.now() + 60000
    };
  }

  /**
   * Calculate traffic delay for shaping
   */
  calculateTrafficDelay(clientIP) {
    const ipData = this.trafficMonitor.requests.get(clientIP);
    if (!ipData) return 0;

    const recentRequests = ipData.requests.filter(r => Date.now() - r.timestamp < 10000); // Last 10 seconds
    const requestRate = recentRequests.length / 10; // requests per second

    // Delay increases with request rate
    if (requestRate > 10) return 100;
    if (requestRate > 5) return 50;
    if (requestRate > 2) return 20;

    return 0;
  }

  /**
   * Record request for monitoring
   */
  recordRequest(clientIP, req, status) {
    this.stats.totalRequests++;

    if (status === 'blocked') {
      this.stats.blockedRequests++;
    }

    // Update peak traffic tracking
    const now = Date.now();
    const window = Math.floor(now / 60000); // 1-minute windows

    if (!this.trafficMonitor.timeWindows.has(window)) {
      this.trafficMonitor.timeWindows.set(window, {
        requests: 0,
        timestamp: now
      });
    }

    const windowData = this.trafficMonitor.timeWindows.get(window);
    windowData.requests++;

    // Update peak traffic
    if (windowData.requests > this.stats.peakTraffic) {
      this.stats.peakTraffic = windowData.requests;
    }
  }

  /**
   * Update endpoint statistics
   */
  updateEndpointStats(path, method, timestamp) {
    const key = `${method}:${path}`;

    if (!this.trafficMonitor.endpoints.has(key)) {
      this.trafficMonitor.endpoints.set(key, []);
    }

    const endpointData = this.trafficMonitor.endpoints.get(key);
    endpointData.push({ timestamp, method, path });

    // Keep only recent data (last hour)
    const cutoff = timestamp - 3600000;
    this.trafficMonitor.endpoints.set(key, endpointData.filter(e => e.timestamp > cutoff));
  }

  /**
   * Update user agent statistics
   */
  updateUserAgentStats(userAgent, timestamp) {
    if (!this.trafficMonitor.userAgents.has(userAgent)) {
      this.trafficMonitor.userAgents.set(userAgent, []);
    }

    const uaData = this.trafficMonitor.userAgents.get(userAgent);
    uaData.push({ timestamp, userAgent });

    // Keep only recent data (last 30 minutes)
    const cutoff = timestamp - 1800000;
    this.trafficMonitor.userAgents.set(userAgent, uaData.filter(ua => ua.timestamp > cutoff));
  }

  /**
   * Get client IP address
   */
  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }

  /**
   * Get country from IP (placeholder for geolocation service)
   */
  async getCountryFromIP(ip) {
    // This would integrate with a geolocation service
    // For now, return a placeholder
    return 'US';
  }

  /**
   * Check if country should be blocked
   */
  shouldBlockCountry(country) {
    const blockedCountries = ['KP', 'IR']; // Example
    return blockedCountries.includes(country);
  }

  /**
   * Generate challenge for bot verification
   */
  generateChallenge() {
    return `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store challenge for verification
   */
  storeChallenge(clientIP, challenge) {
    // Store challenge with expiration
    setTimeout(() => {
      // Remove expired challenge
    }, 300000); // 5 minutes
  }

  /**
   * Load whitelist from configuration
   */
  loadWhitelist() {
    // In production, this would load from a database or file
    const whitelistIPs = process.env.DDOS_WHITELIST?.split(',') || [];
    whitelistIPs.forEach(ip => this.whitelist.add(ip.trim()));
  }

  /**
   * Add IP to whitelist
   */
  addToWhitelist(ip) {
    this.whitelist.add(ip);
    logger.info('IP added to DDoS whitelist', { ip });
  }

  /**
   * Remove IP from whitelist
   */
  removeFromWhitelist(ip) {
    this.whitelist.delete(ip);
    logger.info('IP removed from DDoS whitelist', { ip });
  }

  /**
   * Start monitoring processes
   */
  startMonitoring() {
    // Clean up old data every 5 minutes
    setInterval(() => {
      this.cleanupOldData();
    }, 300000);

    // Analyze traffic patterns every minute
    setInterval(() => {
      this.analyzeTrafficPatterns();
    }, 60000);

    logger.info('Advanced DDoS protection monitoring started');
  }

  /**
   * Clean up old monitoring data
   */
  cleanupOldData() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    // Clean IP data
    for (const [ip, data] of this.trafficMonitor.requests) {
      if (now - data.lastSeen > maxAge) {
        this.trafficMonitor.requests.delete(ip);
      } else {
        // Clean old requests within IP data
        data.requests = data.requests.filter(req => now - req.timestamp < maxAge);
      }
    }

    // Clean endpoint data
    for (const [endpoint, data] of this.trafficMonitor.endpoints) {
      this.trafficMonitor.endpoints.set(endpoint, data.filter(d => now - d.timestamp < maxAge));
    }

    // Clean user agent data
    for (const [ua, data] of this.trafficMonitor.userAgents) {
      this.trafficMonitor.userAgents.set(ua, data.filter(d => now - d.timestamp < maxAge));
    }

    // Clean time windows
    for (const [window, data] of this.trafficMonitor.timeWindows) {
      if (now - data.timestamp > maxAge) {
        this.trafficMonitor.timeWindows.delete(window);
      }
    }
  }

  /**
   * Analyze traffic patterns for proactive protection
   */
  analyzeTrafficPatterns() {
    // Analyze request distribution
    const totalRequests = Array.from(this.trafficMonitor.timeWindows.values())
      .reduce((sum, window) => sum + window.requests, 0);

    if (totalRequests === 0) return;

    // Detect sudden traffic spikes
    const recentWindows = Array.from(this.trafficMonitor.timeWindows.values())
      .filter(w => Date.now() - w.timestamp < 300000) // Last 5 minutes
      .sort((a, b) => b.requests - a.requests);

    if (recentWindows.length > 0) {
      const maxRecent = recentWindows[0].requests;
      const avgRecent = recentWindows.reduce((sum, w) => sum + w.requests, 0) / recentWindows.length;

      if (maxRecent > avgRecent * 3) {
        logger.warn('Traffic spike detected', {
          maxRequests: maxRecent,
          avgRequests: avgRecent,
          spikeRatio: (maxRecent / avgRecent).toFixed(2)
        });
      }
    }
  }

  /**
   * Get protection statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      activeMonitoring: {
        trackedIPs: this.trafficMonitor.requests.size,
        trackedEndpoints: this.trafficMonitor.endpoints.size,
        trackedUserAgents: this.trafficMonitor.userAgents.size,
        blockedIPs: this.blockedIPs.size,
        whitelistedIPs: this.whitelist.size
      },
      config: this.config
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      suspiciousRequests: 0,
      mitigatedAttacks: 0,
      falsePositives: 0,
      avgResponseTime: 0,
      peakTraffic: 0,
      attacksDetected: 0
    };
  }
}

// Export singleton instance
const advancedDDoSProtection = new AdvancedDDoSProtection();

module.exports = advancedDDoSProtection;
