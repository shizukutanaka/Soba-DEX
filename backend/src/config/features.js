const resolveBoolean = require('../utils/booleanResolver');

class FeatureManager {
  constructor() {
    this.features = this.defineFeatures();
    this.cache = new Map();
  }

  defineFeatures() {
    return {
      // Core features (always enabled)
      core: { enabled: true, description: 'Core DEX functionality' },

      // DeFi features (experimental)
      smartOrderRouter: {
        enabled: resolveBoolean(process.env.FEATURE_SOR_ENABLED, false),
        description: 'Smart order routing',
        dependencies: ['redis']
      },

      impermanentLossProtection: {
        enabled: resolveBoolean(process.env.FEATURE_ILP_ENABLED, false),
        description: 'Impermanent loss protection'
      },

      // Advanced 2025 features (experimental)
      poolHooks: {
        enabled: resolveBoolean(process.env.FEATURE_POOL_HOOKS_ENABLED, false),
        description: 'Pool hooks'
      },

      flashGuard: {
        enabled: resolveBoolean(process.env.FEATURE_FLASH_GUARD_ENABLED, false),
        description: 'Flash loan protection'
      },

      multiOracle: {
        enabled: resolveBoolean(process.env.FEATURE_MULTI_ORACLE_ENABLED, false),
        description: 'Multi-oracle price feeds'
      },

      redisCache: {
        enabled: resolveBoolean(process.env.FEATURE_REDIS_CACHE_ENABLED, false),
        description: 'Redis caching layer',
        dependencies: ['redis']
      },

      accountAbstraction: {
        enabled: resolveBoolean(process.env.FEATURE_AA_ENABLED, false),
        description: 'Account abstraction'
      },

      // Advanced trading features (experimental)
      limitOrderBook: {
        enabled: resolveBoolean(process.env.FEATURE_LOB_ENABLED, false),
        description: 'Limit order book'
      },

      aiTradingOptimizer: {
        enabled: resolveBoolean(process.env.FEATURE_AI_OPTIMIZER_ENABLED, false),
        description: 'AI trading optimizer',
        dependencies: ['tensorflow']
      },

      // DAO and Staking features (experimental)
      daoGovernance: {
        enabled: resolveBoolean(process.env.FEATURE_DAO_ENABLED, false),
        description: 'DAO governance'
      },

      stakingRewards: {
        enabled: resolveBoolean(process.env.FEATURE_STAKING_ENABLED, false),
        description: 'Staking rewards'
      },

      // Analytics and Compliance (experimental)
      analyticsEngine: {
        enabled: resolveBoolean(process.env.FEATURE_ANALYTICS_ENABLED, false),
        description: 'Analytics engine'
      },

      kycCompliance: {
        enabled: resolveBoolean(process.env.FEATURE_KYC_ENABLED, false),
        description: 'KYC compliance'
      },

      // Advanced DeFi features (experimental)
      crossChainBridge: {
        enabled: resolveBoolean(process.env.FEATURE_BRIDGE_ENABLED, false),
        description: 'Cross-chain bridge'
      },

      intentBasedTrading: {
        enabled: resolveBoolean(process.env.FEATURE_INTENT_ENABLED, false),
        description: 'Intent-based trading'
      },

      dexAggregator: {
        enabled: resolveBoolean(process.env.FEATURE_AGGREGATOR_ENABLED, false),
        description: 'DEX aggregator'
      },

      blobTransactions: {
        enabled: resolveBoolean(process.env.FEATURE_BLOB_ENABLED, false),
        description: 'Blob transactions'
      },

      // 2025 DeFi Infrastructure (experimental)
      yieldVault: {
        enabled: resolveBoolean(process.env.FEATURE_YIELD_VAULT_ENABLED, false),
        description: 'Yield vault'
      },

      rwaTokenization: {
        enabled: resolveBoolean(process.env.FEATURE_RWA_ENABLED, false),
        description: 'RWA tokenization'
      },

      perpetualFutures: {
        enabled: resolveBoolean(process.env.FEATURE_PERP_ENABLED, false),
        description: 'Perpetual futures'
      },

      // Advanced 2025 DeFi Standards (experimental)
      uniswapV4Hooks: {
        enabled: resolveBoolean(process.env.FEATURE_V4_HOOKS_ENABLED, false),
        description: 'Uniswap V4 hooks'
      },

      eip7702Delegation: {
        enabled: resolveBoolean(process.env.FEATURE_EIP7702_ENABLED, false),
        description: 'EIP-7702 delegation'
      },

      liquidStaking: {
        enabled: resolveBoolean(process.env.FEATURE_LIQUID_STAKING_ENABLED, false),
        description: 'Liquid staking'
      },

      // Advanced ML & AI Features (v3.4.0)
      mlAnomalyDetection: {
        enabled: resolveBoolean(process.env.FEATURE_ML_ANOMALY_ENABLED, false),
        description: 'ML-based anomaly detection',
        dependencies: ['tensorflow']
      },

      predictiveScaling: {
        enabled: resolveBoolean(process.env.FEATURE_PREDICTIVE_SCALING_ENABLED, false),
        description: 'Predictive scaling with ML',
        dependencies: ['tensorflow']
      },

      abTesting: {
        enabled: resolveBoolean(process.env.FEATURE_AB_TESTING_ENABLED, false),
        description: 'Advanced A/B testing',
        dependencies: ['tensorflow']
      },

      behaviorAnalytics: {
        enabled: resolveBoolean(process.env.FEATURE_BEHAVIOR_ANALYTICS_ENABLED, false),
        description: 'User behavior analytics',
        dependencies: ['tensorflow']
      },

      autoTuning: {
        enabled: resolveBoolean(process.env.FEATURE_AUTO_TUNING_ENABLED, false),
        description: 'Auto-tuning optimization',
        dependencies: ['tensorflow']
      },

      // Advanced Trading AI Features (v3.4.0)
      nlpTrading: {
        enabled: resolveBoolean(process.env.FEATURE_NLP_TRADING_ENABLED, false),
        description: 'Natural language trading commands',
        dependencies: ['natural']
      },

      advancedAnalytics: {
        enabled: resolveBoolean(process.env.FEATURE_ADVANCED_ANALYTICS_ENABLED, false),
        description: 'Advanced market analytics',
        dependencies: ['axios']
      },

      securityAnalysis: {
        enabled: resolveBoolean(process.env.FEATURE_SECURITY_ANALYSIS_ENABLED, false),
        description: 'Security risk analysis',
        dependencies: ['web3']
      }
    };
  }

  isEnabled(feature) {
    if (this.cache.has(feature)) {
      return this.cache.get(feature);
    }

    const enabled = this.features[feature]?.enabled || false;
    this.cache.set(feature, enabled);
    return enabled;
  }

  validateFeatures() {
    const warnings = [];
    const errors = [];

    Object.entries(this.features).forEach(([name, config]) => {
      if (config.enabled && config.dependencies) {
        config.dependencies.forEach(dep => {
          if (!this.checkDependency(dep)) {
            warnings.push(`Feature '${name}' requires '${dep}' but dependency not available`);
          }
        });
      }
    });

    return { valid: errors.length === 0, warnings, errors };
  }

  checkDependency(dep) {
    switch (dep) {
      case 'redis':
        return process.env.REDIS_URL || process.env.REDIS_HOST;
      case 'tensorflow':
        try {
          require('@tensorflow/tfjs-node');
          return true;
        } catch {
          return false;
        }
      case 'natural':
        try {
          require('natural');
          return true;
        } catch {
          return false;
        }
      case 'axios':
        try {
          require('axios');
          return true;
        } catch {
          return false;
        }
      case 'web3':
        try {
          require('web3');
          return true;
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  getAllFeatures() {
    return { ...this.features };
  }

  getEnabledFeatures() {
    return Object.entries(this.features)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);
  }
}

const featureManager = new FeatureManager();

module.exports = {
  featureManager,
  isEnabled: (feature) => featureManager.isEnabled(feature)
};
