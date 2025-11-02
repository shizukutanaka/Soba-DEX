/**
 * Webhook Notification System
 * Sends security alerts to external systems via webhooks
 *
 * Features:
 * - Multiple webhook endpoints
 * - Automatic retry with exponential backoff
 * - HMAC signature verification
 * - Rate limiting
 * - Dead letter queue for failed webhooks
 * - Webhook health monitoring
 */

const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('../utils/productionLogger');
const { generateHMAC } = require('../security/securityUtils');

class WebhookNotifier {
  constructor() {
    this.webhooks = new Map(); // webhookId -> webhook config
    this.failedWebhooks = []; // Dead letter queue
    this.webhookStats = new Map(); // webhookId -> stats

    this.config = {
      maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY) || 1000, // 1 second
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000, // 5 seconds
      maxFailedWebhooks: parseInt(process.env.MAX_FAILED_WEBHOOKS) || 1000,
      enableSignature: process.env.WEBHOOK_ENABLE_SIGNATURE !== 'false'
    };
  }

  /**
   * Register a webhook endpoint
   */
  registerWebhook(id, config) {
    if (!id || !config || !config.url) {
      throw new Error('Invalid webhook configuration');
    }

    const webhook = {
      id,
      url: config.url,
      secret: config.secret || null,
      enabled: config.enabled !== false,
      filters: config.filters || {}, // Filter by severity, type, etc.
      headers: config.headers || {},
      method: config.method || 'POST',
      retryConfig: {
        maxRetries: config.maxRetries || this.config.maxRetries,
        retryDelay: config.retryDelay || this.config.retryDelay
      },
      createdAt: Date.now()
    };

    this.webhooks.set(id, webhook);
    this.webhookStats.set(id, {
      totalSent: 0,
      totalSuccess: 0,
      totalFailed: 0,
      lastSuccess: null,
      lastFailure: null,
      avgResponseTime: 0,
      isHealthy: true
    });

    logger.info('Webhook registered', { id, url: webhook.url });

    return webhook;
  }

  /**
   * Unregister a webhook
   */
  unregisterWebhook(id) {
    const removed = this.webhooks.delete(id);
    this.webhookStats.delete(id);

    if (removed) {
      logger.info('Webhook unregistered', { id });
    }

    return removed;
  }

  /**
   * Get webhook configuration
   */
  getWebhook(id) {
    return this.webhooks.get(id);
  }

  /**
   * Get all webhooks
   */
  getAllWebhooks() {
    return Array.from(this.webhooks.values());
  }

  /**
   * Enable/disable a webhook
   */
  setWebhookEnabled(id, enabled) {
    const webhook = this.webhooks.get(id);
    if (webhook) {
      webhook.enabled = enabled;
      logger.info('Webhook status changed', { id, enabled });
    }
  }

  /**
   * Send alert to all registered webhooks
   */
  async sendAlert(alert) {
    const promises = [];

    for (const [id, webhook] of this.webhooks) {
      if (!webhook.enabled) {
        continue;
      }

      // Check if alert matches webhook filters
      if (!this.matchesFilters(alert, webhook.filters)) {
        continue;
      }

      // Send to webhook (non-blocking)
      promises.push(
        this.sendToWebhook(id, webhook, alert)
          .catch(error => {
            logger.error('Webhook send failed', {
              webhookId: id,
              error: error.message
            });
          })
      );
    }

    return Promise.allSettled(promises);
  }

  /**
   * Check if alert matches webhook filters
   */
  matchesFilters(alert, filters) {
    // No filters = accept all
    if (!filters || Object.keys(filters).length === 0) {
      return true;
    }

    // Check severity filter
    if (filters.severity) {
      const allowedSeverities = Array.isArray(filters.severity)
        ? filters.severity
        : [filters.severity];

      if (!allowedSeverities.includes(alert.severity)) {
        return false;
      }
    }

    // Check type filter
    if (filters.type) {
      const allowedTypes = Array.isArray(filters.type)
        ? filters.type
        : [filters.type];

      if (!allowedTypes.includes(alert.type)) {
        return false;
      }
    }

    // Check minimum threat score
    if (filters.minThreatScore && alert.threatScore < filters.minThreatScore) {
      return false;
    }

    return true;
  }

  /**
   * Send alert to specific webhook with retry logic
   */
  async sendToWebhook(id, webhook, alert, retryCount = 0) {
    const stats = this.webhookStats.get(id);
    const startTime = Date.now();

    try {
      // Prepare payload
      const payload = this.preparePayload(alert);

      // Generate signature if enabled
      const headers = { ...webhook.headers };
      if (this.config.enableSignature && webhook.secret) {
        const signature = this.generateSignature(payload, webhook.secret);
        headers['X-Webhook-Signature'] = signature;
        headers['X-Webhook-Timestamp'] = Date.now().toString();
      }

      headers['Content-Type'] = 'application/json';
      headers['User-Agent'] = 'SecurityMonitor-Webhook/1.0';

      // Send request
      const response = await axios({
        method: webhook.method,
        url: webhook.url,
        data: payload,
        headers,
        timeout: this.config.timeout,
        validateStatus: (status) => status >= 200 && status < 300
      });

      // Update statistics
      const responseTime = Date.now() - startTime;
      stats.totalSent++;
      stats.totalSuccess++;
      stats.lastSuccess = Date.now();
      stats.avgResponseTime = (stats.avgResponseTime + responseTime) / 2;
      stats.isHealthy = true;

      logger.debug('Webhook sent successfully', {
        webhookId: id,
        statusCode: response.status,
        responseTime
      });

      return {
        success: true,
        webhookId: id,
        statusCode: response.status,
        responseTime
      };

    } catch (error) {
      // Update statistics
      stats.totalSent++;
      stats.totalFailed++;
      stats.lastFailure = Date.now();

      // Check if we should retry
      if (retryCount < webhook.retryConfig.maxRetries) {
        const delay = this.calculateRetryDelay(retryCount, webhook.retryConfig.retryDelay);

        logger.warn('Webhook failed, retrying', {
          webhookId: id,
          retryCount: retryCount + 1,
          delay,
          error: error.message
        });

        // Wait and retry
        await this.sleep(delay);
        return this.sendToWebhook(id, webhook, alert, retryCount + 1);
      }

      // All retries exhausted
      logger.error('Webhook failed after all retries', {
        webhookId: id,
        retries: retryCount,
        error: error.message
      });

      // Add to dead letter queue
      this.addToDeadLetterQueue({
        webhookId: id,
        webhook,
        alert,
        error: error.message,
        timestamp: Date.now()
      });

      // Mark as unhealthy if too many failures
      const failureRate = stats.totalFailed / stats.totalSent;
      if (failureRate > 0.5 && stats.totalSent > 10) {
        stats.isHealthy = false;
        logger.warn('Webhook marked as unhealthy', {
          webhookId: id,
          failureRate: `${(failureRate * 100).toFixed(2)}%`
        });
      }

      throw error;
    }
  }

  /**
   * Prepare webhook payload
   */
  preparePayload(alert) {
    return {
      event: 'security.alert',
      timestamp: Date.now(),
      alert: {
        type: alert.type,
        severity: alert.severity,
        message: alert.message || this.generateAlertMessage(alert),
        threat: alert.threat,
        metrics: alert.metrics,
        anomalies: alert.anomalies,
        incidentId: alert.incidentId
      },
      metadata: {
        source: 'security-monitor',
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'production'
      }
    };
  }

  /**
   * Generate alert message
   */
  generateAlertMessage(alert) {
    const messages = {
      THREAT_DETECTED: `Security threat detected: ${alert.threat?.type}`,
      ANOMALY_DETECTED: `Anomaly detected: ${alert.anomaly?.type}`,
      TRAFFIC_ANOMALY: `Traffic anomaly detected with threat score ${alert.metrics?.threatScore}`,
      INCIDENT_CREATED: `Security incident created: ${alert.incidentId}`
    };

    return messages[alert.type] || `Security alert: ${alert.type}`;
  }

  /**
   * Generate HMAC signature for webhook
   */
  generateSignature(payload, secret) {
    const payloadStr = JSON.stringify(payload);
    return generateHMAC(payloadStr, secret);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(retryCount, baseDelay) {
    // Exponential backoff: baseDelay * 2^retryCount + jitter
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000; // Random jitter up to 1 second
    return exponentialDelay + jitter;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add failed webhook to dead letter queue
   */
  addToDeadLetterQueue(failedWebhook) {
    this.failedWebhooks.push(failedWebhook);

    // Trim dead letter queue if it exceeds limit
    if (this.failedWebhooks.length > this.config.maxFailedWebhooks) {
      this.failedWebhooks = this.failedWebhooks.slice(-this.config.maxFailedWebhooks);
    }
  }

  /**
   * Get failed webhooks from dead letter queue
   */
  getFailedWebhooks(limit = 100) {
    return this.failedWebhooks.slice(-limit);
  }

  /**
   * Retry failed webhooks
   */
  async retryFailedWebhooks(limit = 10) {
    const toRetry = this.failedWebhooks.splice(-limit);
    const results = [];

    for (const failed of toRetry) {
      try {
        const webhook = this.webhooks.get(failed.webhookId);
        if (!webhook || !webhook.enabled) {
          continue;
        }

        const result = await this.sendToWebhook(
          failed.webhookId,
          webhook,
          failed.alert,
          0 // Reset retry count
        );

        results.push({ success: true, webhookId: failed.webhookId });
      } catch (error) {
        results.push({
          success: false,
          webhookId: failed.webhookId,
          error: error.message
        });

        // Add back to dead letter queue
        this.failedWebhooks.push(failed);
      }
    }

    return results;
  }

  /**
   * Get webhook statistics
   */
  getWebhookStats(id) {
    if (id) {
      return this.webhookStats.get(id);
    }

    // Return all stats
    const allStats = {};
    for (const [webhookId, stats] of this.webhookStats) {
      allStats[webhookId] = stats;
    }
    return allStats;
  }

  /**
   * Get webhook health status
   */
  getHealthStatus() {
    const health = {
      totalWebhooks: this.webhooks.size,
      healthyWebhooks: 0,
      unhealthyWebhooks: 0,
      disabledWebhooks: 0,
      failedWebhooksInQueue: this.failedWebhooks.length,
      webhooks: []
    };

    for (const [id, webhook] of this.webhooks) {
      const stats = this.webhookStats.get(id);

      if (!webhook.enabled) {
        health.disabledWebhooks++;
      } else if (stats.isHealthy) {
        health.healthyWebhooks++;
      } else {
        health.unhealthyWebhooks++;
      }

      health.webhooks.push({
        id,
        enabled: webhook.enabled,
        healthy: stats.isHealthy,
        totalSent: stats.totalSent,
        successRate: stats.totalSent > 0
          ? ((stats.totalSuccess / stats.totalSent) * 100).toFixed(2) + '%'
          : 'N/A',
        avgResponseTime: Math.round(stats.avgResponseTime) + 'ms',
        lastSuccess: stats.lastSuccess,
        lastFailure: stats.lastFailure
      });
    }

    return health;
  }

  /**
   * Test webhook connectivity
   */
  async testWebhook(id) {
    const webhook = this.webhooks.get(id);
    if (!webhook) {
      throw new Error(`Webhook not found: ${id}`);
    }

    const testAlert = {
      type: 'WEBHOOK_TEST',
      severity: 'INFO',
      message: 'This is a test webhook notification',
      timestamp: Date.now()
    };

    try {
      const result = await this.sendToWebhook(id, webhook, testAlert);
      return {
        success: true,
        message: 'Webhook test successful',
        result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Webhook test failed',
        error: error.message
      };
    }
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue() {
    const count = this.failedWebhooks.length;
    this.failedWebhooks = [];
    logger.info('Dead letter queue cleared', { count });
    return count;
  }

  /**
   * Reset webhook statistics
   */
  resetStats(id) {
    if (id) {
      this.webhookStats.set(id, {
        totalSent: 0,
        totalSuccess: 0,
        totalFailed: 0,
        lastSuccess: null,
        lastFailure: null,
        avgResponseTime: 0,
        isHealthy: true
      });
    } else {
      // Reset all
      for (const [webhookId] of this.webhookStats) {
        this.resetStats(webhookId);
      }
    }
  }
}

// Export singleton
const webhookNotifier = new WebhookNotifier();

module.exports = webhookNotifier;
module.exports.WebhookNotifier = WebhookNotifier;
