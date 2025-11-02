// ============================================================================
// Advanced Alert Manager
// Intelligent alert aggregation, deduplication, and routing
// ============================================================================

const EventEmitter = require('events');

/**
 * AlertManager - Advanced alert management system
 *
 * Features:
 * - Alert deduplication
 * - Alert aggregation and correlation
 * - Priority-based routing
 * - Alert suppression during maintenance
 * - Alert escalation
 * - Multi-channel notifications (Slack, Email, PagerDuty)
 * - Alert history and tracking
 * - Rate limiting for alert storms
 */
class AlertManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      deduplicationWindow: options.deduplicationWindow || 5 * 60 * 1000, // 5 minutes
      aggregationWindow: options.aggregationWindow || 2 * 60 * 1000, // 2 minutes
      maxAlertsPerMinute: options.maxAlertsPerMinute || 60,
      escalationDelay: options.escalationDelay || 10 * 60 * 1000, // 10 minutes
      retentionPeriod: options.retentionPeriod || 7 * 24 * 60 * 60 * 1000, // 7 days
      ...options
    };

    // Alert storage
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.suppressions = new Map();
    this.aggregatedAlerts = new Map();

    // Rate limiting
    this.alertCounts = new Map();
    this.rateLimitResetTimer = null;

    // Metrics
    this.metrics = {
      totalAlerts: 0,
      deduplicated: 0,
      aggregated: 0,
      suppressed: 0,
      escalated: 0,
      sent: 0,
      failed: 0
    };

    // Alert levels
    this.LEVELS = {
      INFO: { priority: 1, color: '#3498db' },
      WARNING: { priority: 2, color: '#f39c12' },
      ERROR: { priority: 3, color: '#e74c3c' },
      CRITICAL: { priority: 4, color: '#c0392b' }
    };
  }

  /**
   * Initialize alert manager
   */
  async initialize() {
    console.log('[AlertManager] Initializing alert management system...');

    // Start rate limit reset timer
    this.rateLimitResetTimer = setInterval(() => {
      this.resetRateLimits();
    }, 60000); // Every minute

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldAlerts();
    }, 60 * 60 * 1000); // Every hour

    console.log('[AlertManager] Alert manager initialized');
    this.emit('initialized');
  }

  /**
   * Create and send alert
   */
  async alert(config) {
    this.metrics.totalAlerts++;

    const alert = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      level: config.level || 'WARNING',
      title: config.title,
      message: config.message,
      source: config.source || 'unknown',
      tags: config.tags || [],
      metadata: config.metadata || {},
      fingerprint: this.generateFingerprint(config)
    };

    try {
      // Check if suppressed
      if (this.isAlertSuppressed(alert)) {
        this.metrics.suppressed++;
        this.emit('alert-suppressed', alert);
        return { sent: false, reason: 'suppressed' };
      }

      // Check rate limiting
      if (!this.checkRateLimit(alert)) {
        this.metrics.suppressed++;
        this.emit('alert-rate-limited', alert);
        return { sent: false, reason: 'rate-limited' };
      }

      // Check for deduplication
      const existingAlert = this.findDuplicateAlert(alert);
      if (existingAlert) {
        this.metrics.deduplicated++;
        this.updateExistingAlert(existingAlert, alert);
        this.emit('alert-deduplicated', { existing: existingAlert, new: alert });
        return { sent: false, reason: 'deduplicated', alertId: existingAlert.id };
      }

      // Check for aggregation
      if (this.shouldAggregate(alert)) {
        this.aggregateAlert(alert);
        this.metrics.aggregated++;
        this.emit('alert-aggregated', alert);
        return { sent: false, reason: 'aggregated' };
      }

      // Store alert
      this.activeAlerts.set(alert.id, alert);
      this.alertHistory.push(alert);

      // Send alert
      await this.sendAlert(alert);
      this.metrics.sent++;

      // Schedule escalation if critical
      if (alert.level === 'CRITICAL') {
        this.scheduleEscalation(alert);
      }

      this.emit('alert-sent', alert);
      return { sent: true, alertId: alert.id };

    } catch (error) {
      this.metrics.failed++;
      this.emit('alert-error', { alert, error: error.message });
      return { sent: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Send alert to configured channels
   */
  async sendAlert(alert) {
    const channels = this.getChannelsForLevel(alert.level);

    const promises = channels.map(async (channel) => {
      try {
        switch (channel.type) {
          case 'slack':
            await this.sendSlackAlert(alert, channel);
            break;
          case 'email':
            await this.sendEmailAlert(alert, channel);
            break;
          case 'pagerduty':
            await this.sendPagerDutyAlert(alert, channel);
            break;
          case 'webhook':
            await this.sendWebhookAlert(alert, channel);
            break;
        }
      } catch (error) {
        console.error(`[AlertManager] Failed to send to ${channel.type}:`, error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Send alert to Slack
   */
  async sendSlackAlert(alert, channel) {
    if (!channel.webhookUrl) return;

    const levelInfo = this.LEVELS[alert.level] || this.LEVELS.WARNING;

    const payload = {
      text: `🚨 ${alert.level}: ${alert.title}`,
      attachments: [{
        color: levelInfo.color,
        title: alert.title,
        text: alert.message,
        fields: [
          {
            title: 'Level',
            value: alert.level,
            short: true
          },
          {
            title: 'Source',
            value: alert.source,
            short: true
          },
          {
            title: 'Time',
            value: new Date(alert.timestamp).toISOString(),
            short: false
          }
        ],
        footer: 'DEX Security Monitor',
        ts: Math.floor(alert.timestamp / 1000)
      }]
    };

    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }
  }

  /**
   * Send alert via webhook
   */
  async sendWebhookAlert(alert, channel) {
    if (!channel.url) return;

    const response = await fetch(channel.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Alert-Id': alert.id,
        'X-Alert-Level': alert.level
      },
      body: JSON.stringify(alert)
    });

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.statusText}`);
    }
  }

  /**
   * Send email alert (placeholder)
   */
  async sendEmailAlert(alert, channel) {
    console.log(`[AlertManager] Email alert: ${alert.title} to ${channel.recipients}`);
    // Implement email sending (e.g., using nodemailer)
  }

  /**
   * Send PagerDuty alert (placeholder)
   */
  async sendPagerDutyAlert(alert, channel) {
    console.log(`[AlertManager] PagerDuty alert: ${alert.title}`);
    // Implement PagerDuty integration
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId, resolution) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return { success: false, reason: 'alert-not-found' };
    }

    alert.resolved = true;
    alert.resolvedAt = Date.now();
    alert.resolution = resolution;

    this.activeAlerts.delete(alertId);
    this.emit('alert-resolved', alert);

    return { success: true, alert };
  }

  /**
   * Suppress alerts matching pattern
   */
  suppressAlerts(pattern, duration) {
    const suppressionId = this.generateAlertId();
    const expiry = Date.now() + duration;

    this.suppressions.set(suppressionId, {
      pattern,
      expiry,
      createdAt: Date.now()
    });

    console.log(`[AlertManager] Alerts suppressed: ${pattern} until ${new Date(expiry).toISOString()}`);
    this.emit('suppression-created', { suppressionId, pattern, expiry });

    return suppressionId;
  }

  /**
   * Remove suppression
   */
  removeSuppression(suppressionId) {
    const removed = this.suppressions.delete(suppressionId);
    if (removed) {
      this.emit('suppression-removed', { suppressionId });
    }
    return removed;
  }

  /**
   * Check if alert is suppressed
   */
  isAlertSuppressed(alert) {
    const now = Date.now();

    for (const [id, suppression] of this.suppressions) {
      // Remove expired suppressions
      if (suppression.expiry < now) {
        this.suppressions.delete(id);
        continue;
      }

      // Check if alert matches suppression pattern
      if (this.matchesPattern(alert, suppression.pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find duplicate alert
   */
  findDuplicateAlert(alert) {
    const window = Date.now() - this.options.deduplicationWindow;

    for (const [id, existing] of this.activeAlerts) {
      if (existing.timestamp < window) continue;
      if (existing.fingerprint === alert.fingerprint) {
        return existing;
      }
    }

    return null;
  }

  /**
   * Update existing alert
   */
  updateExistingAlert(existing, newAlert) {
    existing.count = (existing.count || 1) + 1;
    existing.lastSeen = newAlert.timestamp;
    existing.occurrences = existing.occurrences || [];
    existing.occurrences.push({
      timestamp: newAlert.timestamp,
      metadata: newAlert.metadata
    });
  }

  /**
   * Check if alerts should be aggregated
   */
  shouldAggregate(alert) {
    // Aggregate similar alerts from same source
    const key = `${alert.source}:${alert.level}`;
    const existing = this.aggregatedAlerts.get(key);

    if (!existing) {
      this.aggregatedAlerts.set(key, {
        alerts: [alert],
        firstSeen: alert.timestamp,
        count: 1
      });
      return false;
    }

    // Aggregate if within window
    const window = Date.now() - this.options.aggregationWindow;
    if (existing.firstSeen > window) {
      existing.alerts.push(alert);
      existing.count++;
      return true;
    }

    // Send aggregated alert
    this.sendAggregatedAlert(key, existing);
    this.aggregatedAlerts.delete(key);

    return false;
  }

  /**
   * Aggregate alert
   */
  aggregateAlert(alert) {
    // Alert is added to aggregation in shouldAggregate
  }

  /**
   * Send aggregated alert
   */
  async sendAggregatedAlert(key, aggregation) {
    const [source, level] = key.split(':');

    const alert = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      level,
      title: `${aggregation.count} ${level} alerts from ${source}`,
      message: `Aggregated ${aggregation.count} similar alerts`,
      source,
      tags: ['aggregated'],
      metadata: {
        aggregated: true,
        count: aggregation.count,
        firstSeen: aggregation.firstSeen,
        alerts: aggregation.alerts.map(a => ({
          title: a.title,
          timestamp: a.timestamp
        }))
      },
      fingerprint: this.generateFingerprint({ source, level, aggregated: true })
    };

    await this.sendAlert(alert);
    this.emit('aggregated-alert-sent', alert);
  }

  /**
   * Schedule alert escalation
   */
  scheduleEscalation(alert) {
    setTimeout(() => {
      // Check if alert is still active
      if (this.activeAlerts.has(alert.id) && !alert.resolved) {
        this.escalateAlert(alert);
      }
    }, this.options.escalationDelay);
  }

  /**
   * Escalate alert
   */
  async escalateAlert(alert) {
    this.metrics.escalated++;

    const escalatedAlert = {
      ...alert,
      id: this.generateAlertId(),
      escalated: true,
      escalatedFrom: alert.id,
      title: `[ESCALATED] ${alert.title}`,
      message: `Alert not resolved after ${this.options.escalationDelay / 60000} minutes: ${alert.message}`
    };

    await this.sendAlert(escalatedAlert);
    this.emit('alert-escalated', escalatedAlert);
  }

  /**
   * Check rate limiting
   */
  checkRateLimit(alert) {
    const key = `${alert.source}:${alert.level}`;
    const count = this.alertCounts.get(key) || 0;

    if (count >= this.options.maxAlertsPerMinute) {
      return false;
    }

    this.alertCounts.set(key, count + 1);
    return true;
  }

  /**
   * Reset rate limits
   */
  resetRateLimits() {
    this.alertCounts.clear();
  }

  /**
   * Get notification channels for alert level
   */
  getChannelsForLevel(level) {
    const channels = [];

    // Configure based on level
    switch (level) {
      case 'CRITICAL':
        if (process.env.SLACK_WEBHOOK_URL) {
          channels.push({ type: 'slack', webhookUrl: process.env.SLACK_WEBHOOK_URL });
        }
        if (process.env.PAGERDUTY_API_KEY) {
          channels.push({ type: 'pagerduty', apiKey: process.env.PAGERDUTY_API_KEY });
        }
        break;

      case 'ERROR':
      case 'WARNING':
        if (process.env.SLACK_WEBHOOK_URL) {
          channels.push({ type: 'slack', webhookUrl: process.env.SLACK_WEBHOOK_URL });
        }
        break;

      case 'INFO':
        // Log only, no notifications
        break;
    }

    return channels;
  }

  /**
   * Generate alert fingerprint for deduplication
   */
  generateFingerprint(config) {
    const crypto = require('crypto');
    const data = `${config.source}:${config.title}:${JSON.stringify(config.tags || [])}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Generate unique alert ID
   */
  generateAlertId() {
    const crypto = require('crypto');
    return `alert_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Match alert against pattern
   */
  matchesPattern(alert, pattern) {
    // Simple pattern matching (can be extended)
    if (pattern.source && alert.source !== pattern.source) return false;
    if (pattern.level && alert.level !== pattern.level) return false;
    if (pattern.tags && !pattern.tags.every(tag => alert.tags.includes(tag))) return false;
    return true;
  }

  /**
   * Clean up old alerts
   */
  cleanupOldAlerts() {
    const cutoff = Date.now() - this.options.retentionPeriod;

    // Clean active alerts
    for (const [id, alert] of this.activeAlerts) {
      if (alert.timestamp < cutoff) {
        this.activeAlerts.delete(id);
      }
    }

    // Clean history
    this.alertHistory = this.alertHistory.filter(alert => alert.timestamp >= cutoff);

    console.log(`[AlertManager] Cleaned up alerts older than ${this.options.retentionPeriod / (24 * 60 * 60 * 1000)} days`);
  }

  /**
   * Get alert statistics
   */
  getStatistics() {
    return {
      metrics: this.metrics,
      active: this.activeAlerts.size,
      suppressed: this.suppressions.size,
      historySize: this.alertHistory.length,
      byLevel: this.getAlertsByLevel()
    };
  }

  /**
   * Get alerts grouped by level
   */
  getAlertsByLevel() {
    const byLevel = {};
    for (const alert of this.activeAlerts.values()) {
      byLevel[alert.level] = (byLevel[alert.level] || 0) + 1;
    }
    return byLevel;
  }

  /**
   * Shutdown alert manager
   */
  async shutdown() {
    console.log('[AlertManager] Shutting down alert manager...');

    if (this.rateLimitResetTimer) {
      clearInterval(this.rateLimitResetTimer);
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.emit('shutdown');
    console.log('[AlertManager] Alert manager shut down');
  }
}

module.exports = AlertManager;
