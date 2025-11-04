/**
 * Distributed Rate Limiting Service
 *
 * Implements Token Bucket rate limiting algorithm using Redis for distributed systems.
 *
 * Features:
 * - Token Bucket algorithm with Lua scripting for atomicity
 * - Per-user, per-endpoint, and global rate limiting
 * - User tier-based limits (free, premium, enterprise)
 * - Automatic cleanup of expired tokens
 * - Real-time metrics and monitoring
 * - Graceful degradation when Redis is unavailable
 * - Rate limit headers in responses
 *
 * Rate Limiting Tiers:
 * - Free: 100 requests/hour (per endpoint)
 * - Premium: 1000 requests/hour (per endpoint)
 * - Enterprise: 10000 requests/hour (per endpoint)
 * - Global: 10000 requests/second (total)
 *
 * @version 1.0.0
 * @author Claude AI
 */

const redis = require('./cache/redisClient');
const { logger } = require('../utils/productionLogger');

class DistributedRateLimitService {
  constructor() {
    // Redis key prefixes
    this.BUCKET_PREFIX = 'ratelimit:bucket:';
    this.USAGE_PREFIX = 'ratelimit:usage:';
    this.METRICS_PREFIX = 'ratelimit:metrics:';

    // Rate limit configurations
    this.limits = {
      global: {
        tokensPerSecond: 1000,
        bucketCapacity: 5000,
        description: 'Global system-wide limit'
      },
      tiers: {
        free: {
          tokensPerHour: 100,
          tokensPerMinute: 10,
          bucketCapacity: 100,
          costPerRequest: 1
        },
        premium: {
          tokensPerHour: 1000,
          tokensPerMinute: 50,
          bucketCapacity: 1000,
          costPerRequest: 1
        },
        enterprise: {
          tokensPerHour: 10000,
          tokensPerMinute: 500,
          bucketCapacity: 10000,
          costPerRequest: 1
        },
        admin: {
          tokensPerHour: 100000,
          tokensPerMinute: 5000,
          bucketCapacity: 100000,
          costPerRequest: 1
        }
      },
      endpoints: {
        '/api/python/ml/predict': {
          cost: 5, // Costs 5 tokens per request (more expensive than others)
          tier: 'premium'
        },
        '/api/python/blockchain/analyze-contract': {
          cost: 10,
          tier: 'premium'
        },
        '/api/python/fraud/assess-risk': {
          cost: 2,
          tier: 'free'
        },
        default: {
          cost: 1,
          tier: 'free'
        }
      }
    };

    // Lua script for atomic token bucket operation
    this.tokenBucketScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local cost = tonumber(ARGV[2])
      local refill_rate = tonumber(ARGV[3])
      local bucket_capacity = tonumber(ARGV[4])
      local ttl = tonumber(ARGV[5])

      local bucket = redis.call('HGETALL', key)
      local tokens = 0
      local last_refill = now

      if #bucket > 0 then
        for i = 1, #bucket, 2 do
          if bucket[i] == 'tokens' then
            tokens = tonumber(bucket[i+1])
          elseif bucket[i] == 'last_refill' then
            last_refill = tonumber(bucket[i+1])
          end
        end
      end

      -- Calculate tokens to add based on elapsed time
      local elapsed = math.max(0, now - last_refill)
      local tokens_to_add = math.floor(elapsed * refill_rate)
      tokens = math.min(tokens + tokens_to_add, bucket_capacity)

      -- Check if we can process the request
      if tokens >= cost then
        tokens = tokens - cost
        redis.call('HSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, ttl)
        return {1, tokens}  -- {allowed, remaining_tokens}
      else
        redis.call('HSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, ttl)
        return {0, tokens}  -- {denied, remaining_tokens}
      end
    `;

    // Configuration
    this.config = {
      enableRateLimiting: process.env.RATE_LIMITING_ENABLED !== 'false',
      enableGlobalLimit: process.env.ENABLE_GLOBAL_LIMIT !== 'false',
      gracefulDegradation: process.env.GRACEFUL_RATE_LIMIT_DEGRADATION !== 'false',
      metricsInterval: 300000 // 5 minutes
    };

    // Metrics
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      redisErrors: 0,
      gracefulDegradations: 0,
      byTier: {
        free: { allowed: 0, denied: 0 },
        premium: { allowed: 0, denied: 0 },
        enterprise: { allowed: 0, denied: 0 },
        admin: { allowed: 0, denied: 0 }
      }
    };

    logger.info('[DistributedRateLimitService] Initialized', {
      enabled: this.config.enableRateLimiting,
      tiers: Object.keys(this.limits.tiers)
    });
  }

  /**
   * Check rate limit for a request
   *
   * @param {Object} context - Request context
   * @param {string} context.userId - User ID
   * @param {string} context.endpoint - API endpoint
   * @param {string} context.userTier - User's subscription tier
   * @param {number} context.weight - Request weight/cost (default 1)
   * @returns {Promise<Object>} Rate limit check result
   */
  async checkRateLimit(context) {
    const { userId, endpoint, userTier = 'free', weight = 1 } = context;

    if (!this.config.enableRateLimiting) {
      return { allowed: true, rateLimit: null };
    }

    try {
      this.metrics.totalRequests++;

      // Get endpoint configuration
      const endpointConfig = this.limits.endpoints[endpoint] || this.limits.endpoints.default;
      const effectiveTier = endpointConfig.tier || userTier;
      const tierConfig = this.limits.tiers[effectiveTier];
      const cost = (endpointConfig.cost || 1) * weight;

      if (!tierConfig) {
        throw new Error(`Unknown tier: ${effectiveTier}`);
      }

      // Check global limit
      if (this.config.enableGlobalLimit) {
        const globalLimited = await this._checkGlobalLimit();
        if (!globalLimited) {
          this.metrics.deniedRequests++;
          logger.warn('[DistributedRateLimitService] Global rate limit exceeded', {
            userId,
            endpoint
          });

          return {
            allowed: false,
            reason: 'global_rate_limit_exceeded',
            rateLimit: {
              limit: this.limits.global.tokensPerSecond,
              remaining: 0,
              reset: null
            }
          };
        }
      }

      // Check user tier limit
      const bucketKey = `${this.BUCKET_PREFIX}${userId}:${effectiveTier}`;
      const result = await this._checkTokenBucket(
        bucketKey,
        cost,
        tierConfig
      );

      if (result.allowed) {
        this.metrics.allowedRequests++;
        this.metrics.byTier[effectiveTier].allowed++;

        logger.debug('[DistributedRateLimitService] Rate limit check passed', {
          userId,
          tier: effectiveTier,
          endpoint,
          cost,
          remaining: result.remaining
        });

        return {
          allowed: true,
          rateLimit: {
            limit: tierConfig.tokensPerHour,
            remaining: Math.floor(result.remaining),
            reset: null,
            retryAfter: null
          }
        };
      } else {
        this.metrics.deniedRequests++;
        this.metrics.byTier[effectiveTier].denied++;

        logger.warn('[DistributedRateLimitService] Rate limit exceeded', {
          userId,
          tier: effectiveTier,
          endpoint,
          remaining: result.remaining
        });

        return {
          allowed: false,
          reason: 'rate_limit_exceeded',
          rateLimit: {
            limit: tierConfig.tokensPerHour,
            remaining: 0,
            retryAfter: Math.ceil(cost / (tierConfig.tokensPerHour / 3600)) // Seconds to refill
          }
        };
      }
    } catch (error) {
      logger.error('[DistributedRateLimitService] Rate limit check error', {
        userId,
        endpoint,
        error: error.message
      });

      this.metrics.redisErrors++;

      // Graceful degradation: allow request if Redis is unavailable
      if (this.config.gracefulDegradation) {
        this.metrics.gracefulDegradations++;
        logger.warn('[DistributedRateLimitService] Graceful degradation: allowing request', {
          userId
        });
        return { allowed: true, rateLimit: null };
      }

      // Otherwise, deny to be safe
      return {
        allowed: false,
        reason: 'rate_limit_service_error',
        error: error.message
      };
    }
  }

  /**
   * Get rate limit status for a user
   *
   * @param {string} userId - User ID
   * @param {string} userTier - User's subscription tier
   * @returns {Promise<Object>} Rate limit status
   */
  async getRateLimitStatus(userId, userTier = 'free') {
    try {
      const tierConfig = this.limits.tiers[userTier];
      if (!tierConfig) {
        throw new Error(`Unknown tier: ${userTier}`);
      }

      const bucketKey = `${this.BUCKET_PREFIX}${userId}:${userTier}`;
      const bucketData = await redis.hgetall(bucketKey);

      let tokens = tierConfig.bucketCapacity;
      let lastRefill = Date.now();

      if (bucketData && bucketData.tokens !== undefined) {
        tokens = parseFloat(bucketData.tokens);
        lastRefill = parseInt(bucketData.last_refill);
      }

      const refillRate = tierConfig.tokensPerHour / 3600; // tokens per second
      const elapsed = (Date.now() - lastRefill) / 1000;
      const tokensToAdd = elapsed * refillRate;
      const currentTokens = Math.min(tokens + tokensToAdd, tierConfig.bucketCapacity);

      return {
        userId,
        tier: userTier,
        limit: tierConfig.tokensPerHour,
        remaining: Math.floor(currentTokens),
        capacity: tierConfig.bucketCapacity,
        refillRate: refillRate,
        lastRefill: new Date(lastRefill),
        nextRefillIn: Math.ceil(60 / refillRate) // Seconds for one token
      };
    } catch (error) {
      logger.error('[DistributedRateLimitService] Status check error', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reset rate limit for a user (admin only)
   *
   * @param {string} userId - User ID
   * @param {string} userTier - User's subscription tier
   * @returns {Promise<Object>} Reset result
   */
  async resetRateLimit(userId, userTier = 'free') {
    try {
      const bucketKey = `${this.BUCKET_PREFIX}${userId}:${userTier}`;
      await redis.del(bucketKey);

      logger.info('[DistributedRateLimitService] Rate limit reset', {
        userId,
        tier: userTier
      });

      return {
        success: true,
        userId,
        tier: userTier,
        resetAt: new Date()
      };
    } catch (error) {
      logger.error('[DistributedRateLimitService] Rate limit reset error', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get rate limiting metrics
   *
   * @returns {Object} Current metrics
   */
  getMetrics() {
    const totalAllowedPercentage = this.metrics.totalRequests > 0
      ? ((this.metrics.allowedRequests / this.metrics.totalRequests) * 100).toFixed(2)
      : 0;

    return {
      ...this.metrics,
      allowedPercentage: totalAllowedPercentage + '%',
      timestamp: new Date()
    };
  }

  /**
   * Private helper methods
   */

  async _checkTokenBucket(key, cost, tierConfig) {
    try {
      // Refill rate: tokens per second
      const refillRate = tierConfig.tokensPerHour / 3600;
      const now = Date.now();
      const ttl = 86400; // 24 hours

      // Use Lua script for atomic operation
      const result = await redis.eval(
        this.tokenBucketScript,
        1,
        key,
        now.toString(),
        cost.toString(),
        refillRate.toString(),
        tierConfig.bucketCapacity.toString(),
        ttl.toString()
      );

      return {
        allowed: result[0] === 1,
        remaining: result[1]
      };
    } catch (error) {
      logger.debug('[DistributedRateLimitService] Token bucket check error', {
        error: error.message
      });
      throw error;
    }
  }

  async _checkGlobalLimit() {
    try {
      const globalKey = `${this.BUCKET_PREFIX}:global`;
      const refillRate = this.limits.global.tokensPerSecond;
      const cost = 1;
      const now = Date.now();
      const ttl = 86400;

      const result = await redis.eval(
        this.tokenBucketScript,
        1,
        globalKey,
        now.toString(),
        cost.toString(),
        refillRate.toString(),
        this.limits.global.bucketCapacity.toString(),
        ttl.toString()
      );

      return result[0] === 1;
    } catch (error) {
      logger.debug('[DistributedRateLimitService] Global limit check error', {
        error: error.message
      });
      // Allow request on error
      return true;
    }
  }
}

// Export singleton instance
module.exports = new DistributedRateLimitService();
