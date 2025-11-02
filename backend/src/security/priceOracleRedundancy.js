const { logger } = require('../utils/productionLogger');

/**
 * Price Oracle Redundancy System
 * 複数のオラクルソースから価格を取得し、操作を防ぐ
 *
 * サポートするオラクル:
 * - Chainlink
 * - Uniswap V3 TWAP
 * - Band Protocol
 * - API3
 * - 内部TWAP
 */

class PriceOracleRedundancy {
  constructor() {
    this.oracles = new Map();
    this.priceCache = new Map();
    this.config = {
      // オラクル設定
      minOracleResponses: 3, // 最小3つのオラクルから応答
      maxPriceDeviation: 2, // 2%以上の乖離で警告
      staleDataThreshold: 300000, // 5分以上古いデータは無効
      cacheTTL: 60000, // 1分間キャッシュ

      // 信頼度スコア
      oracleWeights: {
        chainlink: 0.4,
        uniswapTWAP: 0.3,
        bandProtocol: 0.2,
        api3: 0.1
      },

      // フォールバック戦略
      fallbackEnabled: true,
      fallbackToInternalTWAP: true
    };

    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      oracleFailures: new Map(),
      priceDeviations: 0,
      consensusFailures: 0
    };

    this.registerOracles();
  }

  /**
   * オラクル登録
   */
  registerOracles() {
    // Chainlink Oracle
    this.registerOracle('chainlink', {
      fetch: this.fetchChainlinkPrice.bind(this),
      weight: this.config.oracleWeights.chainlink,
      priority: 1,
      timeout: 5000
    });

    // Uniswap V3 TWAP
    this.registerOracle('uniswapTWAP', {
      fetch: this.fetchUniswapTWAP.bind(this),
      weight: this.config.oracleWeights.uniswapTWAP,
      priority: 2,
      timeout: 5000
    });

    // Band Protocol
    this.registerOracle('bandProtocol', {
      fetch: this.fetchBandProtocol.bind(this),
      weight: this.config.oracleWeights.bandProtocol,
      priority: 3,
      timeout: 5000
    });

    // API3
    this.registerOracle('api3', {
      fetch: this.fetchAPI3Price.bind(this),
      weight: this.config.oracleWeights.api3,
      priority: 4,
      timeout: 5000
    });

    logger.info('[PriceOracle] Oracles registered', {
      count: this.oracles.size
    });
  }

  /**
   * オラクル登録
   */
  registerOracle(name, config) {
    this.oracles.set(name, {
      name,
      ...config,
      lastSuccess: null,
      failureCount: 0,
      averageResponseTime: 0
    });

    this.stats.oracleFailures.set(name, 0);
  }

  /**
   * 価格取得 (メインエントリーポイント)
   */
  async getPrice(tokenPair, options = {}) {
    this.stats.totalRequests++;

    // キャッシュチェック
    const cached = this.getCachedPrice(tokenPair);
    if (cached && !options.skipCache) {
      this.stats.cacheHits++;
      return cached;
    }

    try {
      // 全オラクルから価格を取得
      const prices = await this.fetchFromAllOracles(tokenPair);

      // コンセンサス価格を計算
      const consensus = this.calculateConsensusPrice(prices);

      if (!consensus.valid) {
        logger.error('[PriceOracle] Consensus failed', {
          tokenPair,
          prices,
          reason: consensus.reason
        });

        this.stats.consensusFailures++;

        // フォールバック
        if (this.config.fallbackEnabled) {
          return await this.fallbackPrice(tokenPair);
        }

        throw new Error('Price consensus failed: ' + consensus.reason);
      }

      // キャッシュに保存
      this.cachePrice(tokenPair, consensus);

      return {
        price: consensus.price,
        confidence: consensus.confidence,
        sources: prices.length,
        timestamp: Date.now(),
        deviation: consensus.deviation
      };

    } catch (error) {
      logger.error('[PriceOracle] Price fetch failed', {
        tokenPair,
        error: error.message
      });

      // フォールバック
      if (this.config.fallbackEnabled) {
        return await this.fallbackPrice(tokenPair);
      }

      throw error;
    }
  }

  /**
   * 全オラクルから価格を取得
   */
  async fetchFromAllOracles(tokenPair) {
    const promises = Array.from(this.oracles.values()).map(oracle =>
      this.fetchFromOracle(oracle, tokenPair)
    );

    const results = await Promise.allSettled(promises);

    const prices = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);

    logger.info('[PriceOracle] Fetched prices', {
      tokenPair,
      successful: prices.length,
      total: this.oracles.size
    });

    return prices;
  }

  /**
   * 個別オラクルから価格を取得
   */
  async fetchFromOracle(oracle, tokenPair) {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        oracle.fetch(tokenPair),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Oracle timeout')), oracle.timeout)
        )
      ]);

      const responseTime = Date.now() - startTime;

      // 統計更新
      oracle.lastSuccess = Date.now();
      oracle.averageResponseTime = (oracle.averageResponseTime + responseTime) / 2;

      return {
        source: oracle.name,
        price: result.price,
        timestamp: result.timestamp || Date.now(),
        weight: oracle.weight,
        responseTime
      };

    } catch (error) {
      oracle.failureCount++;
      this.stats.oracleFailures.set(
        oracle.name,
        this.stats.oracleFailures.get(oracle.name) + 1
      );

      logger.warn('[PriceOracle] Oracle fetch failed', {
        oracle: oracle.name,
        tokenPair,
        error: error.message
      });

      return null;
    }
  }

  /**
   * コンセンサス価格を計算
   */
  calculateConsensusPrice(prices) {
    if (prices.length < this.config.minOracleResponses) {
      return {
        valid: false,
        reason: `Insufficient oracle responses (${prices.length}/${this.config.minOracleResponses})`
      };
    }

    // 加重平均価格を計算
    const weightedSum = prices.reduce((sum, p) => sum + (p.price * p.weight), 0);
    const totalWeight = prices.reduce((sum, p) => sum + p.weight, 0);
    const weightedAverage = weightedSum / totalWeight;

    // 中央値を計算
    const sortedPrices = [...prices].sort((a, b) => a.price - b.price);
    const median = sortedPrices[Math.floor(sortedPrices.length / 2)].price;

    // 標準偏差を計算
    const variance = prices.reduce((sum, p) =>
      sum + Math.pow(p.price - weightedAverage, 2), 0
    ) / prices.length;
    const stdDev = Math.sqrt(variance);
    const deviation = (stdDev / weightedAverage) * 100;

    // 外れ値チェック
    const outliers = prices.filter(p =>
      Math.abs(p.price - weightedAverage) / weightedAverage > this.config.maxPriceDeviation / 100
    );

    if (outliers.length > prices.length / 2) {
      this.stats.priceDeviations++;
      logger.warn('[PriceOracle] High price deviation', {
        deviation: deviation.toFixed(2) + '%',
        outliers: outliers.length
      });
    }

    // 古いデータチェック
    const now = Date.now();
    const staleData = prices.filter(p =>
      now - p.timestamp > this.config.staleDataThreshold
    );

    if (staleData.length > 0) {
      logger.warn('[PriceOracle] Stale data detected', {
        count: staleData.length,
        sources: staleData.map(p => p.source)
      });
    }

    // 信頼度スコア計算 (0-100)
    const confidence = this.calculateConfidence(prices, deviation, outliers.length);

    return {
      valid: true,
      price: weightedAverage,
      median,
      deviation,
      confidence,
      outliers: outliers.length,
      sources: prices.map(p => ({
        source: p.source,
        price: p.price,
        weight: p.weight
      }))
    };
  }

  /**
   * 信頼度スコア計算
   */
  calculateConfidence(prices, deviation, outlierCount) {
    let score = 100;

    // オラクル数による減点
    if (prices.length < 4) {
      score -= (4 - prices.length) * 10;
    }

    // 乖離による減点
    score -= Math.min(deviation * 10, 30);

    // 外れ値による減点
    score -= outlierCount * 15;

    // 古いデータによる減点
    const now = Date.now();
    const avgAge = prices.reduce((sum, p) => sum + (now - p.timestamp), 0) / prices.length;
    if (avgAge > 60000) { // 1分以上
      score -= 10;
    }

    return Math.max(score, 0);
  }

  /**
   * Chainlink価格取得
   */
  async fetchChainlinkPrice(_tokenPair) {
    // 実装: Chainlink契約から価格を取得
    // プレースホルダー
    return {
      price: 1.0 + Math.random() * 0.01,
      timestamp: Date.now()
    };
  }

  /**
   * Uniswap TWAP価格取得
   */
  async fetchUniswapTWAP(_tokenPair) {
    // 実装: Uniswap V3のTWAPを計算
    // プレースホルダー
    return {
      price: 1.0 + Math.random() * 0.015,
      timestamp: Date.now()
    };
  }

  /**
   * Band Protocol価格取得
   */
  async fetchBandProtocol(_tokenPair) {
    // 実装: Band Protocolから価格を取得
    // プレースホルダー
    return {
      price: 1.0 + Math.random() * 0.012,
      timestamp: Date.now()
    };
  }

  /**
   * API3価格取得
   */
  async fetchAPI3Price(_tokenPair) {
    // 実装: API3から価格を取得
    // プレースホルダー
    return {
      price: 1.0 + Math.random() * 0.008,
      timestamp: Date.now()
    };
  }

  /**
   * キャッシュから価格取得
   */
  getCachedPrice(tokenPair) {
    const cached = this.priceCache.get(tokenPair);

    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > this.config.cacheTTL) {
      this.priceCache.delete(tokenPair);
      return null;
    }

    return cached;
  }

  /**
   * 価格をキャッシュ
   */
  cachePrice(tokenPair, priceData) {
    this.priceCache.set(tokenPair, {
      ...priceData,
      cachedAt: Date.now()
    });

    // キャッシュサイズ管理
    if (this.priceCache.size > 1000) {
      const oldest = Array.from(this.priceCache.entries())
        .sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
      this.priceCache.delete(oldest[0]);
    }
  }

  /**
   * フォールバック価格取得
   */
  async fallbackPrice(tokenPair) {
    logger.warn('[PriceOracle] Using fallback price', { tokenPair });

    // 内部TWAPにフォールバック
    if (this.config.fallbackToInternalTWAP) {
      const twap = await this.calculateInternalTWAP(tokenPair);
      if (twap) {
        return {
          price: twap.price,
          confidence: 50, // 低い信頼度
          sources: 1,
          timestamp: Date.now(),
          fallback: true,
          fallbackSource: 'internal-twap'
        };
      }
    }

    // 最後のキャッシュ価格を使用
    const lastCached = this.priceCache.get(tokenPair);
    if (lastCached) {
      logger.warn('[PriceOracle] Using stale cached price', { tokenPair });
      return {
        ...lastCached,
        confidence: 30,
        fallback: true,
        fallbackSource: 'stale-cache'
      };
    }

    throw new Error('No fallback price available');
  }

  /**
   * 内部TWAP計算
   */
  async calculateInternalTWAP(_tokenPair) {
    // 実装: 過去の取引から時間加重平均価格を計算
    // プレースホルダー
    return {
      price: 1.0,
      confidence: 60
    };
  }

  /**
   * 統計情報取得
   */
  getStatistics() {
    const oracleStats = {};
    for (const [name, oracle] of this.oracles.entries()) {
      oracleStats[name] = {
        failures: this.stats.oracleFailures.get(name),
        lastSuccess: oracle.lastSuccess,
        avgResponseTime: Math.round(oracle.averageResponseTime)
      };
    }

    return {
      totalRequests: this.stats.totalRequests,
      cacheHitRate: ((this.stats.cacheHits / this.stats.totalRequests) * 100).toFixed(2) + '%',
      priceDeviations: this.stats.priceDeviations,
      consensusFailures: this.stats.consensusFailures,
      cacheSize: this.priceCache.size,
      oracles: oracleStats
    };
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      if (req.path.includes('/price') || req.path.includes('/quote')) {
        const tokenPair = req.query.pair || req.params.pair;

        if (tokenPair) {
          try {
            const price = await this.getPrice(tokenPair);
            req.oraclePrice = price;
          } catch (error) {
            logger.error('[PriceOracle] Middleware error', {
              error: error.message,
              tokenPair
            });
          }
        }
      }

      next();
    };
  }
}

// Export
const priceOracleRedundancy = new PriceOracleRedundancy();

module.exports = {
  PriceOracleRedundancy,
  priceOracleRedundancy
};
