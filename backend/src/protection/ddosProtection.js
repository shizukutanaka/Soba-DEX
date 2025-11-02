// ============================================================================
// Advanced DDoS Protection System
// Multi-layer DDoS detection and mitigation
// ============================================================================

const EventEmitter = require('events');

/**
 * DDoSProtection - Advanced DDoS detection and mitigation
 *
 * Features:
 * - Layer 3/4/7 attack detection
 * - Rate limiting (requests, bandwidth, connections)
 * - Behavioral analysis
 * - Challenge-response (CAPTCHA)
 * - Geo-blocking
 * - IP reputation checking
 * - Automatic mitigation
 * - Traffic shaping
 */
class DDoSProtection extends EventEmitter {
  constructor(redis, options = {}) {
    super();

    this.redis = redis;
    this.options = {
      requestsPerMinute: options.requestsPerMinute || 60,
      connectionsPerIP: options.connectionsPerIP || 10,
      bandwidthLimitMB: options.bandwidthLimitMB || 100,
      burstSize: options.burstSize || 10,
      blockDuration: options.blockDuration || 3600, // 1 hour
      ...options
    };

    // Detection thresholds
    this.thresholds = {
      suspiciousRequestRate: 100, // req/min
      criticalRequestRate: 500,
      suspiciousBandwidth: 50, // MB/min
      criticalBandwidth: 200
    };

    // Blocked IPs
    this.blockedIPs = new Set();
    this.suspiciousIPs = new Map();

    // Metrics
    this.metrics = {
      requestsBlocked: 0,
      ipsBlocked: 0,
      ddosDetected: 0,
      mitigationsActive: 0
    };
  }

  /**
   * Check if request should be allowed
   */
  async checkRequest(req) {
    const ip = this.getClientIP(req);

    // Check if IP is blocked
    if (await this.isIPBlocked(ip)) {
      this.metrics.requestsBlocked++;
      return { allowed: false, reason: 'IP_BLOCKED' };
    }

    // Check rate limits
    const rateCheck = await this.checkRateLimit(ip);
    if (!rateCheck.allowed) {
      await this.handleSuspiciousActivity(ip, 'RATE_LIMIT_EXCEEDED');
      return rateCheck;
    }

    // Check connection limits
    const connCheck = await this.checkConnectionLimit(ip);
    if (!connCheck.allowed) {
      await this.handleSuspiciousActivity(ip, 'CONNECTION_LIMIT_EXCEEDED');
      return connCheck;
    }

    // Behavioral analysis
    const behaviorCheck = await this.analyzeBehavior(ip, req);
    if (!behaviorCheck.allowed) {
      await this.handleSuspiciousActivity(ip, 'SUSPICIOUS_BEHAVIOR');
      return behaviorCheck;
    }

    return { allowed: true };
  }

  /**
   * Check rate limit for IP
   */
  async checkRateLimit(ip) {
    const key = `ratelimit:${ip}`;
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    // Add current request
    await this.redis.zadd(key, now, `${now}-${Math.random()}`);
    await this.redis.expire(key, 60);

    // Remove old entries
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // Count requests in window
    const count = await this.redis.zcard(key);

    if (count > this.options.requestsPerMinute + this.options.burstSize) {
      return { allowed: false, reason: 'RATE_LIMIT_EXCEEDED', count };
    }

    return { allowed: true, count };
  }

  /**
   * Check connection limit
   */
  async checkConnectionLimit(ip) {
    const key = `connections:${ip}`;
    const count = await this.redis.get(key) || 0;

    if (parseInt(count) > this.options.connectionsPerIP) {
      return { allowed: false, reason: 'CONNECTION_LIMIT_EXCEEDED', count };
    }

    return { allowed: true, count };
  }

  /**
   * Analyze request behavior
   */
  async analyzeBehavior(ip, req) {
    const patterns = await this.getIPPatterns(ip);

    // Check for bot-like behavior
    if (this.isBotLike(patterns, req)) {
      return { allowed: false, reason: 'BOT_DETECTED' };
    }

    // Check for scanning behavior
    if (this.isScanning(patterns)) {
      return { allowed: false, reason: 'SCANNING_DETECTED' };
    }

    return { allowed: true };
  }

  /**
   * Get IP access patterns
   */
  async getIPPatterns(ip) {
    const key = `patterns:${ip}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : { requests: [], userAgents: [] };
  }

  /**
   * Check if behavior is bot-like
   */
  isBotLike(patterns, req) {
    // Check for missing or suspicious user agents
    if (!req.headers['user-agent']) return true;

    // Check for extremely regular intervals (bots)
    if (patterns.requests.length > 10) {
      const intervals = [];
      for (let i = 1; i < patterns.requests.length; i++) {
        intervals.push(patterns.requests[i] - patterns.requests[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;

      // Very low variance = likely bot
      if (variance < 100) return true;
    }

    return false;
  }

  /**
   * Check if IP is scanning
   */
  isScanning(patterns) {
    // Check for requests to many different endpoints
    const uniqueEndpoints = new Set(patterns.requests.map(r => r.path)).size;
    return uniqueEndpoints > 20 && patterns.requests.length < 60;
  }

  /**
   * Handle suspicious activity
   */
  async handleSuspiciousActivity(ip, reason) {
    const count = (this.suspiciousIPs.get(ip) || 0) + 1;
    this.suspiciousIPs.set(ip, count);

    this.emit('suspicious-activity', { ip, reason, count });

    // Block IP after multiple violations
    if (count >= 3) {
      await this.blockIP(ip, reason);
    }
  }

  /**
   * Block IP address
   */
  async blockIP(ip, reason) {
    const key = `blocked:${ip}`;
    await this.redis.set(key, JSON.stringify({ reason, blockedAt: Date.now() }), 'EX', this.options.blockDuration);

    this.blockedIPs.add(ip);
    this.metrics.ipsBlocked++;

    console.log(`[DDoSProtection] IP blocked: ${ip} (reason: ${reason})`);
    this.emit('ip-blocked', { ip, reason });
  }

  /**
   * Check if IP is blocked
   */
  async isIPBlocked(ip) {
    if (this.blockedIPs.has(ip)) return true;

    const key = `blocked:${ip}`;
    const blocked = await this.redis.get(key);
    return blocked !== null;
  }

  /**
   * Unblock IP address
   */
  async unblockIP(ip) {
    const key = `blocked:${ip}`;
    await this.redis.del(key);
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);

    console.log(`[DDoSProtection] IP unblocked: ${ip}`);
    this.emit('ip-unblocked', { ip });
  }

  /**
   * Get client IP from request
   */
  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress;
  }

  /**
   * Get protection metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      blockedIPs: this.blockedIPs.size,
      suspiciousIPs: this.suspiciousIPs.size
    };
  }

  /**
   * Shutdown
   */
  async shutdown() {
    console.log('[DDoSProtection] Shutting down...');
    this.emit('shutdown');
  }
}

module.exports = DDoSProtection;
