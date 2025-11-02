/**
 * Redis Security Cache
 * Distributed caching and state management for security monitoring
 *
 * Features:
 * - Distributed rate limiting
 * - Session sharing across instances
 * - Threat intelligence caching
 * - Real-time event broadcasting
 * - IP blacklist/whitelist
 */

const redis = require('redis');
const { logger } = require('../utils/productionLogger');

class RedisSecurityCache {
  constructor(options = {}) {
    this.options = {
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || process.env.REDIS_PORT || 6379,
      password: options.password || process.env.REDIS_PASSWORD,
      db: options.db || process.env.REDIS_DB || 0,
      keyPrefix: options.keyPrefix || 'security:',
      ttl: options.ttl || 3600, // Default TTL: 1 hour
      enablePubSub: options.enablePubSub !== false
    };

    this.client = null;
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;
    this.eventHandlers = new Map();
  }

  /**
   * Connect to Redis
   */
  async connect() {
    try {
      // Create main client
      this.client = redis.createClient({
        socket: {
          host: this.options.host,
          port: this.options.port
        },
        password: this.options.password,
        database: this.options.db
      });

      this.client.on('error', (error) => {
        logger.error('Redis client error', { error: error.message });
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      await this.client.connect();

      // Create pub/sub clients if enabled
      if (this.options.enablePubSub) {
        this.publisher = this.client.duplicate();
        this.subscriber = this.client.duplicate();

        await this.publisher.connect();
        await this.subscriber.connect();

        logger.info('Redis pub/sub clients connected');
      }

      this.isConnected = true;
      logger.info('Redis security cache initialized', {
        host: this.options.host,
        port: this.options.port
      });

      return true;
    } catch (error) {
      logger.error('Failed to connect to Redis', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    try {
      if (this.client) await this.client.quit();
      if (this.publisher) await this.publisher.quit();
      if (this.subscriber) await this.subscriber.quit();

      this.isConnected = false;
      logger.info('Redis connections closed');
    } catch (error) {
      logger.error('Error disconnecting from Redis', {
        error: error.message
      });
    }
  }

  /**
   * Check rate limit using distributed counter
   */
  async checkRateLimit(key, limit, windowSeconds) {
    try {
      const redisKey = `${this.options.keyPrefix}ratelimit:${key}`;
      const now = Date.now();
      const windowStart = now - (windowSeconds * 1000);

      // Use sorted set for sliding window rate limiting
      const pipeline = this.client.multi();

      // Remove old entries
      pipeline.zRemRangeByScore(redisKey, 0, windowStart);

      // Add current request
      pipeline.zAdd(redisKey, { score: now, value: `${now}` });

      // Count requests in window
      pipeline.zCard(redisKey);

      // Set expiration
      pipeline.expire(redisKey, windowSeconds * 2);

      const results = await pipeline.exec();
      const count = results[2]; // Result from zCard

      return {
        allowed: count <= limit,
        current: count,
        limit,
        remaining: Math.max(0, limit - count)
      };
    } catch (error) {
      logger.error('Rate limit check failed', {
        error: error.message,
        key
      });
      // Fail open - allow request if Redis is down
      return { allowed: true, current: 0, limit, remaining: limit };
    }
  }

  /**
   * Add IP to blacklist
   */
  async addToBlacklist(ip, reason, durationSeconds = 3600) {
    try {
      const key = `${this.options.keyPrefix}blacklist:${ip}`;
      const data = JSON.stringify({
        ip,
        reason,
        blacklistedAt: Date.now(),
        expiresAt: Date.now() + (durationSeconds * 1000)
      });

      await this.client.setEx(key, durationSeconds, data);

      // Publish blacklist event
      if (this.publisher) {
        await this.publisher.publish('security:blacklist:add', JSON.stringify({ ip, reason }));
      }

      logger.warn('IP added to blacklist', { ip, reason, duration: durationSeconds });
      return true;
    } catch (error) {
      logger.error('Failed to add IP to blacklist', {
        error: error.message,
        ip
      });
      return false;
    }
  }

  /**
   * Check if IP is blacklisted
   */
  async isBlacklisted(ip) {
    try {
      const key = `${this.options.keyPrefix}blacklist:${ip}`;
      const data = await this.client.get(key);

      if (!data) {
        return { blacklisted: false };
      }

      const blacklistInfo = JSON.parse(data);
      return {
        blacklisted: true,
        ...blacklistInfo
      };
    } catch (error) {
      logger.error('Failed to check blacklist', {
        error: error.message,
        ip
      });
      // Fail open
      return { blacklisted: false };
    }
  }

  /**
   * Remove IP from blacklist
   */
  async removeFromBlacklist(ip) {
    try {
      const key = `${this.options.keyPrefix}blacklist:${ip}`;
      await this.client.del(key);

      // Publish removal event
      if (this.publisher) {
        await this.publisher.publish('security:blacklist:remove', JSON.stringify({ ip }));
      }

      logger.info('IP removed from blacklist', { ip });
      return true;
    } catch (error) {
      logger.error('Failed to remove IP from blacklist', {
        error: error.message,
        ip
      });
      return false;
    }
  }

  /**
   * Add IP to whitelist
   */
  async addToWhitelist(ip, reason = 'Trusted IP') {
    try {
      const key = `${this.options.keyPrefix}whitelist:${ip}`;
      const data = JSON.stringify({
        ip,
        reason,
        whitelistedAt: Date.now()
      });

      await this.client.set(key, data);
      logger.info('IP added to whitelist', { ip, reason });
      return true;
    } catch (error) {
      logger.error('Failed to add IP to whitelist', {
        error: error.message,
        ip
      });
      return false;
    }
  }

  /**
   * Check if IP is whitelisted
   */
  async isWhitelisted(ip) {
    try {
      const key = `${this.options.keyPrefix}whitelist:${ip}`;
      const data = await this.client.get(key);

      if (!data) {
        return { whitelisted: false };
      }

      const whitelistInfo = JSON.parse(data);
      return {
        whitelisted: true,
        ...whitelistInfo
      };
    } catch (error) {
      logger.error('Failed to check whitelist', {
        error: error.message,
        ip
      });
      return { whitelisted: false };
    }
  }

  /**
   * Cache threat intelligence
   */
  async cacheThreatIntelligence(threatType, data, ttl = null) {
    try {
      const key = `${this.options.keyPrefix}threat:${threatType}`;
      const value = JSON.stringify(data);
      const expirySeconds = ttl || this.options.ttl;

      await this.client.setEx(key, expirySeconds, value);
      return true;
    } catch (error) {
      logger.error('Failed to cache threat intelligence', {
        error: error.message,
        threatType
      });
      return false;
    }
  }

  /**
   * Get cached threat intelligence
   */
  async getThreatIntelligence(threatType) {
    try {
      const key = `${this.options.keyPrefix}threat:${threatType}`;
      const data = await this.client.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to get threat intelligence', {
        error: error.message,
        threatType
      });
      return null;
    }
  }

  /**
   * Increment threat counter
   */
  async incrementThreatCounter(threatType, timeWindow = 3600) {
    try {
      const key = `${this.options.keyPrefix}counter:${threatType}`;
      const count = await this.client.incr(key);

      // Set expiration on first increment
      if (count === 1) {
        await this.client.expire(key, timeWindow);
      }

      return count;
    } catch (error) {
      logger.error('Failed to increment threat counter', {
        error: error.message,
        threatType
      });
      return 0;
    }
  }

  /**
   * Get threat counter
   */
  async getThreatCounter(threatType) {
    try {
      const key = `${this.options.keyPrefix}counter:${threatType}`;
      const count = await this.client.get(key);
      return parseInt(count) || 0;
    } catch (error) {
      logger.error('Failed to get threat counter', {
        error: error.message,
        threatType
      });
      return 0;
    }
  }

  /**
   * Store active incident
   */
  async storeIncident(incidentId, incident, ttl = 86400) {
    try {
      const key = `${this.options.keyPrefix}incident:${incidentId}`;
      const value = JSON.stringify(incident);

      await this.client.setEx(key, ttl, value);

      // Add to active incidents set
      const activeKey = `${this.options.keyPrefix}incidents:active`;
      await this.client.sAdd(activeKey, incidentId);

      return true;
    } catch (error) {
      logger.error('Failed to store incident', {
        error: error.message,
        incidentId
      });
      return false;
    }
  }

  /**
   * Get incident from cache
   */
  async getIncident(incidentId) {
    try {
      const key = `${this.options.keyPrefix}incident:${incidentId}`;
      const data = await this.client.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to get incident', {
        error: error.message,
        incidentId
      });
      return null;
    }
  }

  /**
   * Get all active incident IDs
   */
  async getActiveIncidentIds() {
    try {
      const key = `${this.options.keyPrefix}incidents:active`;
      const ids = await this.client.sMembers(key);
      return ids;
    } catch (error) {
      logger.error('Failed to get active incident IDs', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Publish security event
   */
  async publishEvent(eventType, eventData) {
    try {
      if (!this.publisher) {
        return false;
      }

      const channel = `security:events:${eventType}`;
      const message = JSON.stringify({
        type: eventType,
        data: eventData,
        timestamp: Date.now()
      });

      await this.publisher.publish(channel, message);
      return true;
    } catch (error) {
      logger.error('Failed to publish event', {
        error: error.message,
        eventType
      });
      return false;
    }
  }

  /**
   * Subscribe to security events
   */
  async subscribeToEvents(eventType, handler) {
    try {
      if (!this.subscriber) {
        throw new Error('Pub/Sub not enabled');
      }

      const channel = `security:events:${eventType}`;

      await this.subscriber.subscribe(channel, (message) => {
        try {
          const event = JSON.parse(message);
          handler(event);
        } catch (error) {
          logger.error('Error handling subscribed event', {
            error: error.message,
            channel
          });
        }
      });

      this.eventHandlers.set(eventType, handler);
      logger.info('Subscribed to security events', { eventType });
      return true;
    } catch (error) {
      logger.error('Failed to subscribe to events', {
        error: error.message,
        eventType
      });
      return false;
    }
  }

  /**
   * Unsubscribe from security events
   */
  async unsubscribeFromEvents(eventType) {
    try {
      if (!this.subscriber) {
        return false;
      }

      const channel = `security:events:${eventType}`;
      await this.subscriber.unsubscribe(channel);

      this.eventHandlers.delete(eventType);
      logger.info('Unsubscribed from security events', { eventType });
      return true;
    } catch (error) {
      logger.error('Failed to unsubscribe from events', {
        error: error.message,
        eventType
      });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStatistics() {
    try {
      const info = await this.client.info('stats');
      const keyspace = await this.client.info('keyspace');

      // Count keys by prefix
      const keys = await this.client.keys(`${this.options.keyPrefix}*`);

      const stats = {
        connected: this.isConnected,
        totalKeys: keys.length,
        keysByType: {},
        serverInfo: {
          info,
          keyspace
        }
      };

      // Count keys by type
      const types = ['ratelimit', 'blacklist', 'whitelist', 'threat', 'counter', 'incident'];
      for (const type of types) {
        const typeKeys = keys.filter(key => key.includes(`:${type}:`));
        stats.keysByType[type] = typeKeys.length;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get cache statistics', {
        error: error.message
      });
      return {
        connected: this.isConnected,
        error: error.message
      };
    }
  }

  /**
   * Clear all security cache data
   */
  async clearAll() {
    try {
      const keys = await this.client.keys(`${this.options.keyPrefix}*`);

      if (keys.length > 0) {
        await this.client.del(keys);
      }

      logger.info('Security cache cleared', { keysRemoved: keys.length });
      return keys.length;
    } catch (error) {
      logger.error('Failed to clear cache', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const pong = await this.client.ping();
      return {
        healthy: pong === 'PONG',
        connected: this.isConnected,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        healthy: false,
        connected: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}

// Export singleton
let instance = null;

module.exports = {
  RedisSecurityCache,
  getInstance: (options) => {
    if (!instance) {
      instance = new RedisSecurityCache(options);
    }
    return instance;
  }
};
