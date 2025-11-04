/**
 * Feature Flags and A/B Testing Service
 *
 * Implements feature flags with:
 * - Simple feature toggles
 * - User-based feature targeting
 * - Percentage-based rollouts
 * - A/B test variants with performance tracking
 * - Feature flag analytics and metrics
 * - Redis-backed flag storage for distributed systems
 * - Gradual feature rollout support
 *
 * Features:
 * - FEATURE_ML_V2: New ML prediction model
 * - FEATURE_FRAUD_DETECTION_V3: Enhanced fraud detection
 * - FEATURE_NLP_BATCH_PROCESSING: Batch NLP processing
 * - FEATURE_ADVANCED_ANALYTICS: Advanced user analytics
 * - FEATURE_BLOCKCHAIN_MEV_DETECTION: MEV detection feature
 *
 * @version 1.0.0
 * @author Claude AI
 */

const redis = require('./cache/redisClient');
const { logger } = require('../utils/productionLogger');

class FeatureFlagsService {
  constructor() {
    this.config = {
      enableFeatureFlags: process.env.FEATURE_FLAGS_ENABLED !== 'false',
      redisTTL: 3600, // 1 hour TTL for flag cache
      samplingInterval: 1000 // Collect metrics every second
    };

    // Feature flag definitions with defaults
    this.flags = {
      FEATURE_ML_V2: {
        enabled: true,
        rolloutPercentage: 50,
        description: 'New ML prediction model v2',
        targetUsers: [],
        targetGroups: []
      },
      FEATURE_FRAUD_DETECTION_V3: {
        enabled: true,
        rolloutPercentage: 75,
        description: 'Enhanced fraud detection with ML',
        targetUsers: [],
        targetGroups: ['premium', 'enterprise']
      },
      FEATURE_NLP_BATCH_PROCESSING: {
        enabled: true,
        rolloutPercentage: 100,
        description: 'Batch NLP processing capability',
        targetUsers: [],
        targetGroups: []
      },
      FEATURE_ADVANCED_ANALYTICS: {
        enabled: true,
        rolloutPercentage: 25,
        description: 'Advanced user analytics dashboard',
        targetUsers: [],
        targetGroups: ['enterprise']
      },
      FEATURE_BLOCKCHAIN_MEV_DETECTION: {
        enabled: true,
        rolloutPercentage: 30,
        description: 'Blockchain MEV detection feature',
        targetUsers: [],
        targetGroups: ['premium', 'enterprise']
      },
      FEATURE_RATE_LIMITING_V2: {
        enabled: true,
        rolloutPercentage: 60,
        description: 'Enhanced rate limiting with token bucket',
        targetUsers: [],
        targetGroups: []
      },
      FEATURE_GDPR_STRICT_MODE: {
        enabled: true,
        rolloutPercentage: 100,
        description: 'Strict GDPR compliance enforcement',
        targetUsers: [],
        targetGroups: []
      },
      FEATURE_DISTRIBUTED_TRACING: {
        enabled: true,
        rolloutPercentage: 40,
        description: 'OpenTelemetry distributed tracing',
        targetUsers: [],
        targetGroups: ['enterprise']
      }
    };

    // Metrics tracking
    this.metrics = {
      flagEvaluations: 0,
      flagHits: 0,
      flagMisses: 0,
      abTestVariations: {},
      performanceByVariant: {},
      userSegmentation: {}
    };

    // A/B test variants
    this.abTests = {};

    logger.info('[FeatureFlagsService] Initialized', {
      enabled: this.config.enableFeatureFlags,
      totalFlags: Object.keys(this.flags).length
    });
  }

  /**
   * Check if feature is enabled for user
   *
   * @param {string} featureName - Feature flag name
   * @param {Object} context - User/request context
   * @returns {Promise<boolean>} Feature enabled status
   */
  async isFeatureEnabled(featureName, context = {}) {
    const { userId, userTier = 'free', groups = [] } = context;

    if (!this.config.enableFeatureFlags) {
      return true; // All features enabled when flags disabled
    }

    this.metrics.flagEvaluations++;

    const flag = this.flags[featureName];

    if (!flag) {
      logger.warn('[FeatureFlagsService] Unknown feature flag', { featureName });
      return false;
    }

    if (!flag.enabled) {
      this.metrics.flagMisses++;
      return false;
    }

    // Check if user is explicitly targeted
    if (userId && flag.targetUsers.includes(userId)) {
      this.metrics.flagHits++;
      return true;
    }

    // Check if user's group is targeted
    const userGroups = [...groups, userTier];
    const hasTargetedGroup = flag.targetGroups.some(group =>
      userGroups.includes(group)
    );

    if (hasTargetedGroup && flag.targetGroups.length > 0) {
      this.metrics.flagHits++;
      return true;
    }

    // Check percentage rollout
    if (userId) {
      const hash = this._hashUserId(userId);
      const percentage = (hash % 100) + 1;

      if (percentage <= flag.rolloutPercentage) {
        this.metrics.flagHits++;
        return true;
      }
    }

    this.metrics.flagMisses++;
    return false;
  }

  /**
   * Create A/B test variant
   *
   * @param {string} testName - Test identifier
   * @param {Array<string>} variants - Test variant names
   * @param {Object} options - Test configuration
   * @returns {Promise<Object>} Test configuration
   */
  async createABTest(testName, variants, options = {}) {
    const {
      trafficAllocation = {},
      startDate = new Date(),
      endDate = null,
      targetUsers = [],
      targetGroups = []
    } = options;

    // Default traffic allocation if not provided
    const allocation = trafficAllocation;
    if (Object.keys(allocation).length === 0) {
      variants.forEach(variant => {
        allocation[variant] = Math.round(100 / variants.length);
      });
    }

    const test = {
      name: testName,
      variants,
      trafficAllocation: allocation,
      startDate,
      endDate,
      targetUsers,
      targetGroups,
      createdAt: new Date(),
      metrics: {}
    };

    this.abTests[testName] = test;

    // Cache in Redis
    await redis.setex(
      `ab_test:${testName}`,
      this.config.redisTTL,
      JSON.stringify(test)
    );

    logger.info('[FeatureFlagsService] A/B test created', {
      testName,
      variants,
      allocation
    });

    return test;
  }

  /**
   * Get A/B test variant for user
   *
   * @param {string} testName - Test identifier
   * @param {string} userId - User identifier
   * @param {Object} context - Additional context
   * @returns {Promise<string>} Assigned variant
   */
  async getABTestVariant(testName, userId, context = {}) {
    const test = this.abTests[testName];

    if (!test) {
      logger.warn('[FeatureFlagsService] A/B test not found', { testName });
      return null;
    }

    // Check date range
    if (test.startDate && new Date() < test.startDate) {
      return null; // Test hasn't started
    }

    if (test.endDate && new Date() > test.endDate) {
      return null; // Test has ended
    }

    // Check user targeting
    if (test.targetUsers.length > 0 && !test.targetUsers.includes(userId)) {
      return null;
    }

    // Check group targeting
    const userGroups = [context.userTier || 'free', ...(context.groups || [])];
    if (test.targetGroups.length > 0) {
      const hasGroup = test.targetGroups.some(group => userGroups.includes(group));
      if (!hasGroup) {
        return null;
      }
    }

    // Assign variant based on user hash and traffic allocation
    const hash = this._hashUserId(userId);
    const randomValue = hash % 100;

    let cumulativeAllocation = 0;
    for (const [variant, allocation] of Object.entries(test.trafficAllocation)) {
      cumulativeAllocation += allocation;
      if (randomValue < cumulativeAllocation) {
        // Track variant assignment
        if (!this.metrics.abTestVariations[testName]) {
          this.metrics.abTestVariations[testName] = {};
        }
        if (!this.metrics.abTestVariations[testName][variant]) {
          this.metrics.abTestVariations[testName][variant] = 0;
        }
        this.metrics.abTestVariations[testName][variant]++;

        return variant;
      }
    }

    return test.variants[0];
  }

  /**
   * Record A/B test metric (e.g., conversion, latency)
   *
   * @param {string} testName - Test identifier
   * @param {string} variant - Variant name
   * @param {string} metricName - Metric name
   * @param {number} value - Metric value
   * @returns {Promise<void>}
   */
  async recordABTestMetric(testName, variant, metricName, value) {
    const test = this.abTests[testName];

    if (!test) {
      return;
    }

    if (!test.metrics[variant]) {
      test.metrics[variant] = {};
    }

    if (!test.metrics[variant][metricName]) {
      test.metrics[variant][metricName] = [];
    }

    test.metrics[variant][metricName].push({
      value,
      timestamp: Date.now()
    });

    // Keep performance metrics
    if (!this.metrics.performanceByVariant[variant]) {
      this.metrics.performanceByVariant[variant] = {
        totalRequests: 0,
        totalLatency: 0,
        totalErrors: 0,
        avgLatency: 0
      };
    }

    if (metricName === 'latency') {
      this.metrics.performanceByVariant[variant].totalLatency += value;
      this.metrics.performanceByVariant[variant].totalRequests++;
      this.metrics.performanceByVariant[variant].avgLatency =
        this.metrics.performanceByVariant[variant].totalLatency /
        this.metrics.performanceByVariant[variant].totalRequests;
    }

    if (metricName === 'error') {
      this.metrics.performanceByVariant[variant].totalErrors += value;
    }
  }

  /**
   * Get A/B test results
   *
   * @param {string} testName - Test identifier
   * @returns {Promise<Object>} Test results and statistics
   */
  async getABTestResults(testName) {
    const test = this.abTests[testName];

    if (!test) {
      return null;
    }

    const results = {
      name: test.name,
      variants: test.variants,
      metrics: test.metrics,
      performance: {}
    };

    // Calculate performance statistics per variant
    for (const variant of test.variants) {
      const metrics = test.metrics[variant] || {};
      results.performance[variant] = this._calculateStatistics(metrics);
    }

    return results;
  }

  /**
   * Update feature flag configuration
   *
   * @param {string} featureName - Feature flag name
   * @param {Object} updates - Configuration updates
   * @returns {Promise<Object>} Updated flag configuration
   */
  async updateFeatureFlag(featureName, updates = {}) {
    const flag = this.flags[featureName];

    if (!flag) {
      throw new Error(`Unknown feature flag: ${featureName}`);
    }

    Object.assign(flag, updates);

    // Update Redis cache
    await redis.setex(
      `feature_flag:${featureName}`,
      this.config.redisTTL,
      JSON.stringify(flag)
    );

    logger.info('[FeatureFlagsService] Feature flag updated', {
      featureName,
      updates
    });

    return flag;
  }

  /**
   * Get all feature flags and their status
   *
   * @param {Object} context - User context
   * @returns {Promise<Object>} All flags with enabled status
   */
  async getAllFeatureFlags(context = {}) {
    const flags = {};

    for (const [flagName] of Object.entries(this.flags)) {
      flags[flagName] = await this.isFeatureEnabled(flagName, context);
    }

    return flags;
  }

  /**
   * Target specific users for feature
   *
   * @param {string} featureName - Feature flag name
   * @param {Array<string>} userIds - User IDs to target
   * @returns {Promise<Object>} Updated flag
   */
  async targetUsers(featureName, userIds = []) {
    const flag = this.flags[featureName];

    if (!flag) {
      throw new Error(`Unknown feature flag: ${featureName}`);
    }

    flag.targetUsers = [...new Set([...flag.targetUsers, ...userIds])];

    await redis.setex(
      `feature_flag:${featureName}`,
      this.config.redisTTL,
      JSON.stringify(flag)
    );

    logger.info('[FeatureFlagsService] Users targeted for feature', {
      featureName,
      userCount: flag.targetUsers.length
    });

    return flag;
  }

  /**
   * Target user groups for feature
   *
   * @param {string} featureName - Feature flag name
   * @param {Array<string>} groups - Group names to target
   * @returns {Promise<Object>} Updated flag
   */
  async targetGroups(featureName, groups = []) {
    const flag = this.flags[featureName];

    if (!flag) {
      throw new Error(`Unknown feature flag: ${featureName}`);
    }

    flag.targetGroups = [...new Set([...flag.targetGroups, ...groups])];

    await redis.setex(
      `feature_flag:${featureName}`,
      this.config.redisTTL,
      JSON.stringify(flag)
    );

    logger.info('[FeatureFlagsService] Groups targeted for feature', {
      featureName,
      groups: flag.targetGroups
    });

    return flag;
  }

  /**
   * Set rollout percentage for feature
   *
   * @param {string} featureName - Feature flag name
   * @param {number} percentage - Rollout percentage (0-100)
   * @returns {Promise<Object>} Updated flag
   */
  async setRolloutPercentage(featureName, percentage) {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Rollout percentage must be between 0 and 100');
    }

    const flag = this.flags[featureName];

    if (!flag) {
      throw new Error(`Unknown feature flag: ${featureName}`);
    }

    flag.rolloutPercentage = percentage;

    await redis.setex(
      `feature_flag:${featureName}`,
      this.config.redisTTL,
      JSON.stringify(flag)
    );

    logger.info('[FeatureFlagsService] Rollout percentage updated', {
      featureName,
      percentage
    });

    return flag;
  }

  /**
   * Get feature flag metrics
   *
   * @returns {Object} Metrics summary
   */
  getMetrics() {
    const hitRate = this.metrics.flagEvaluations > 0
      ? ((this.metrics.flagHits / this.metrics.flagEvaluations) * 100).toFixed(2)
      : '0.00';

    return {
      ...this.metrics,
      hitRate: hitRate + '%',
      timestamp: new Date()
    };
  }

  /**
   * Private helper: Hash user ID for consistent variant assignment
   *
   * @private
   * @param {string} userId - User ID
   * @returns {number} Hash value
   */
  _hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Private helper: Calculate statistics from metrics
   *
   * @private
   * @param {Object} metrics - Metrics object
   * @returns {Object} Statistics
   */
  _calculateStatistics(metrics) {
    const stats = {};

    for (const [metricName, values] of Object.entries(metrics)) {
      if (values.length === 0) {
        continue;
      }

      const numbers = values.map(v => v.value);
      const sorted = [...numbers].sort((a, b) => a - b);

      stats[metricName] = {
        count: numbers.length,
        sum: numbers.reduce((a, b) => a + b, 0),
        mean: numbers.reduce((a, b) => a + b, 0) / numbers.length,
        median: sorted[Math.floor(sorted.length / 2)],
        min: Math.min(...numbers),
        max: Math.max(...numbers),
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      };
    }

    return stats;
  }

  /**
   * Reset metrics (typically for testing)
   *
   * @returns {Object} Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      flagEvaluations: 0,
      flagHits: 0,
      flagMisses: 0,
      abTestVariations: {},
      performanceByVariant: {},
      userSegmentation: {}
    };

    return this.metrics;
  }
}

// Export singleton instance
module.exports = new FeatureFlagsService();
