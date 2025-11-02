const { logger } = require('../utils/productionLogger');

/**
 * Advanced Slippage Protection
 * 最新のDeFi取引保護メカニズム
 *
 * 機能:
 * - 動的スリッページ計算
 * - 市場状況に応じた自動調整
 * - Multi-hop最適化
 * - MEV保護との統合
 */

class AdvancedSlippageProtection {
  constructor() {
    this.config = {
      // デフォルトスリッページ設定
      defaultSlippage: {
        stable: 0.1,    // ステーブルコイン: 0.1%
        major: 0.5,     // 主要トークン: 0.5%
        minor: 1.0,     // マイナートークン: 1.0%
        exotic: 3.0     // エキゾチック: 3.0%
      },

      // 動的調整パラメータ
      volatilityAdjustment: {
        enabled: true,
        baseMultiplier: 1.5,
        maxMultiplier: 3.0
      },

      // 流動性による調整
      liquidityAdjustment: {
        enabled: true,
        lowLiquidityThreshold: 100000,  // $100K
        highLiquidityThreshold: 10000000, // $10M
        lowLiquidityMultiplier: 2.0
      },

      // 取引量による調整
      tradeVolumeAdjustment: {
        enabled: true,
        largeTradeThreshold: 100000, // $100K
        largeTradeMultiplier: 1.5
      },

      // 時間帯による調整
      timeBasedAdjustment: {
        enabled: true,
        lowVolumeHours: [0, 1, 2, 3, 4, 5], // UTC 深夜
        lowVolumeMultiplier: 1.3
      },

      // Multi-hop設定
      multiHop: {
        enabled: true,
        maxHops: 3,
        hopPenalty: 0.1 // 各ホップで0.1%追加
      }
    };

    this.volatilityCache = new Map();
    this.liquidityCache = new Map();
    this.recentTrades = [];

    this.stats = {
      totalCalculations: 0,
      adjustmentsMade: 0,
      protectedTransactions: 0,
      slippageExceeded: 0
    };
  }

  /**
   * スリッページ計算 (メインエントリーポイント)
   */
  async calculateOptimalSlippage(params) {
    this.stats.totalCalculations++;

    const {
      tokenIn,
      tokenOut,
      amountIn,
      route = [],
      userSlippage = null
    } = params;

    try {
      // 1. トークン分類を取得
      const tokenClass = await this.classifyToken(tokenIn, tokenOut);

      // 2. ベーススリッページを取得
      let slippage = this.config.defaultSlippage[tokenClass];

      // 3. ボラティリティ調整
      if (this.config.volatilityAdjustment.enabled) {
        const volatilityMultiplier = await this.getVolatilityMultiplier(tokenIn, tokenOut);
        slippage *= volatilityMultiplier;
        if (volatilityMultiplier > 1) {
          this.stats.adjustmentsMade++;
        }
      }

      // 4. 流動性調整
      if (this.config.liquidityAdjustment.enabled) {
        const liquidityMultiplier = await this.getLiquidityMultiplier(tokenIn, tokenOut);
        slippage *= liquidityMultiplier;
        if (liquidityMultiplier > 1) {
          this.stats.adjustmentsMade++;
        }
      }

      // 5. 取引量調整
      if (this.config.tradeVolumeAdjustment.enabled && amountIn) {
        const volumeMultiplier = this.getTradeVolumeMultiplier(amountIn);
        slippage *= volumeMultiplier;
        if (volumeMultiplier > 1) {
          this.stats.adjustmentsMade++;
        }
      }

      // 6. 時間帯調整
      if (this.config.timeBasedAdjustment.enabled) {
        const timeMultiplier = this.getTimeBasedMultiplier();
        slippage *= timeMultiplier;
        if (timeMultiplier > 1) {
          this.stats.adjustmentsMade++;
        }
      }

      // 7. Multi-hop調整
      if (route.length > 1 && this.config.multiHop.enabled) {
        const hopPenalty = (route.length - 1) * this.config.multiHop.hopPenalty;
        slippage += hopPenalty;
      }

      // 8. ユーザー指定スリッページとの比較
      if (userSlippage !== null) {
        if (userSlippage < slippage) {
          logger.warn('[SlippageProtection] User slippage too low', {
            userSlippage,
            recommended: slippage.toFixed(2),
            tokenPair: `${tokenIn}/${tokenOut}`
          });

          return {
            recommended: slippage,
            userProvided: userSlippage,
            warning: `Recommended slippage is ${slippage.toFixed(2)}%, but user provided ${userSlippage}%`,
            riskLevel: 'high'
          };
        }
      }

      return {
        slippage: Math.min(slippage, 10), // 最大10%
        breakdown: {
          base: this.config.defaultSlippage[tokenClass],
          volatility: await this.getVolatilityMultiplier(tokenIn, tokenOut),
          liquidity: await this.getLiquidityMultiplier(tokenIn, tokenOut),
          volume: this.getTradeVolumeMultiplier(amountIn),
          time: this.getTimeBasedMultiplier(),
          hops: route.length > 1 ? (route.length - 1) * this.config.multiHop.hopPenalty : 0
        },
        confidence: this.calculateConfidence(slippage),
        riskLevel: this.assessRiskLevel(slippage)
      };

    } catch (error) {
      logger.error('[SlippageProtection] Calculation error', {
        error: error.message,
        params
      });

      // エラー時は安全側に倒す
      return {
        slippage: 5.0, // 安全なデフォルト値
        error: error.message,
        riskLevel: 'high'
      };
    }
  }

  /**
   * トークン分類
   */
  async classifyToken(tokenIn, tokenOut) {
    // ステーブルコインペア
    const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD'];
    if (this.isStablePair(tokenIn, tokenOut, stablecoins)) {
      return 'stable';
    }

    // 主要トークン
    const majorTokens = ['ETH', 'WETH', 'BTC', 'WBTC', 'BNB', 'MATIC'];
    if (this.isMajorPair(tokenIn, tokenOut, majorTokens)) {
      return 'major';
    }

    // 流動性チェック
    const liquidity = await this.getPoolLiquidity(tokenIn, tokenOut);
    if (liquidity > this.config.liquidityAdjustment.highLiquidityThreshold) {
      return 'minor';
    }

    return 'exotic';
  }

  /**
   * ステーブルコインペア判定
   */
  isStablePair(tokenIn, tokenOut, stablecoins) {
    const symbolIn = this.extractSymbol(tokenIn);
    const symbolOut = this.extractSymbol(tokenOut);
    return stablecoins.includes(symbolIn) && stablecoins.includes(symbolOut);
  }

  /**
   * 主要トークンペア判定
   */
  isMajorPair(tokenIn, tokenOut, majorTokens) {
    const symbolIn = this.extractSymbol(tokenIn);
    const symbolOut = this.extractSymbol(tokenOut);
    return majorTokens.includes(symbolIn) || majorTokens.includes(symbolOut);
  }

  /**
   * シンボル抽出
   */
  extractSymbol(token) {
    // アドレスからシンボルを取得 (実装必要)
    // プレースホルダー
    return token.toUpperCase();
  }

  /**
   * ボラティリティ乗数取得
   */
  async getVolatilityMultiplier(tokenIn, tokenOut) {
    const pair = `${tokenIn}/${tokenOut}`;
    const cached = this.volatilityCache.get(pair);

    if (cached && Date.now() - cached.timestamp < 300000) { // 5分キャッシュ
      return cached.multiplier;
    }

    // ボラティリティ計算 (標準偏差)
    const volatility = await this.calculateVolatility(tokenIn, tokenOut);

    const { baseMultiplier, maxMultiplier } = this.config.volatilityAdjustment;
    const multiplier = Math.min(
      1 + (volatility * baseMultiplier),
      maxMultiplier
    );

    this.volatilityCache.set(pair, {
      multiplier,
      volatility,
      timestamp: Date.now()
    });

    return multiplier;
  }

  /**
   * ボラティリティ計算
   */
  async calculateVolatility(_tokenIn, _tokenOut) {
    // 実装: 過去の価格データから標準偏差を計算
    // プレースホルダー: ランダム値
    return Math.random() * 0.3; // 0-30%
  }

  /**
   * 流動性乗数取得
   */
  async getLiquidityMultiplier(tokenIn, tokenOut) {
    const liquidity = await this.getPoolLiquidity(tokenIn, tokenOut);

    const { lowLiquidityThreshold, lowLiquidityMultiplier } = this.config.liquidityAdjustment;

    if (liquidity < lowLiquidityThreshold) {
      return lowLiquidityMultiplier;
    }

    // 流動性が高いほど乗数が小さい
    return Math.max(1.0, 1.5 - (liquidity / 10000000));
  }

  /**
   * プール流動性取得
   */
  async getPoolLiquidity(tokenIn, tokenOut) {
    const pair = `${tokenIn}/${tokenOut}`;
    const cached = this.liquidityCache.get(pair);

    if (cached && Date.now() - cached.timestamp < 60000) { // 1分キャッシュ
      return cached.liquidity;
    }

    // 実装: 実際のプールから流動性を取得
    // プレースホルダー
    const liquidity = 1000000 + Math.random() * 9000000; // $1M-$10M

    this.liquidityCache.set(pair, {
      liquidity,
      timestamp: Date.now()
    });

    return liquidity;
  }

  /**
   * 取引量乗数取得
   */
  getTradeVolumeMultiplier(amountIn) {
    if (!amountIn) {
      return 1.0;
    }

    const { largeTradeThreshold, largeTradeMultiplier } = this.config.tradeVolumeAdjustment;

    if (amountIn > largeTradeThreshold) {
      // 取引量が大きいほど乗数が大きい
      const ratio = amountIn / largeTradeThreshold;
      return Math.min(largeTradeMultiplier * ratio, 3.0);
    }

    return 1.0;
  }

  /**
   * 時間帯乗数取得
   */
  getTimeBasedMultiplier() {
    const hour = new Date().getUTCHours();
    const { lowVolumeHours, lowVolumeMultiplier } = this.config.timeBasedAdjustment;

    if (lowVolumeHours.includes(hour)) {
      return lowVolumeMultiplier;
    }

    return 1.0;
  }

  /**
   * 信頼度計算
   */
  calculateConfidence(slippage) {
    // スリッページが低いほど信頼度が高い
    if (slippage < 0.5) {
      return 'high';
    } else if (slippage < 2.0) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * リスクレベル評価
   */
  assessRiskLevel(slippage) {
    if (slippage < 1.0) {
      return 'low';
    } else if (slippage < 3.0) {
      return 'medium';
    } else if (slippage < 5.0) {
      return 'high';
    } else {
      return 'critical';
    }
  }

  /**
   * スリッページ検証
   */
  async validateSlippage(tx) {
    const expectedOut = tx.expectedAmountOut;
    const actualOut = tx.actualAmountOut;

    if (!expectedOut || !actualOut) {
      return { valid: true };
    }

    const slippage = ((expectedOut - actualOut) / expectedOut) * 100;
    const maxAllowed = tx.maxSlippage || 5.0;

    if (slippage > maxAllowed) {
      this.stats.slippageExceeded++;

      logger.warn('[SlippageProtection] Slippage exceeded', {
        expected: expectedOut,
        actual: actualOut,
        slippage: slippage.toFixed(2) + '%',
        maxAllowed: maxAllowed + '%',
        txHash: tx.hash
      });

      return {
        valid: false,
        slippage,
        maxAllowed,
        message: `Slippage ${slippage.toFixed(2)}% exceeds maximum ${maxAllowed}%`
      };
    }

    this.stats.protectedTransactions++;

    return {
      valid: true,
      slippage,
      message: `Slippage ${slippage.toFixed(2)}% within tolerance`
    };
  }

  /**
   * Multi-hop最適化
   */
  async optimizeMultiHopRoute(tokenIn, tokenOut, amountIn) {
    if (!this.config.multiHop.enabled) {
      return { route: [tokenIn, tokenOut], hops: 1 };
    }

    // 実装: 最適なルートを見つける
    // プレースホルダー: 直接ルート
    return {
      route: [tokenIn, tokenOut],
      hops: 1,
      estimatedSlippage: await this.calculateOptimalSlippage({
        tokenIn,
        tokenOut,
        amountIn
      })
    };
  }

  /**
   * 統計情報取得
   */
  getStatistics() {
    return {
      ...this.stats,
      protectionRate: (
        (this.stats.protectedTransactions / this.stats.totalCalculations) * 100
      ).toFixed(2) + '%',
      slippageExceededRate: (
        (this.stats.slippageExceeded / this.stats.protectedTransactions) * 100
      ).toFixed(2) + '%',
      volatilityCacheSize: this.volatilityCache.size,
      liquidityCacheSize: this.liquidityCache.size
    };
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      if (req.path.includes('/swap') || req.path.includes('/quote')) {
        try {
          const slippageData = await this.calculateOptimalSlippage({
            tokenIn: req.body.tokenIn || req.query.tokenIn,
            tokenOut: req.body.tokenOut || req.query.tokenOut,
            amountIn: parseFloat(req.body.amountIn || req.query.amountIn),
            userSlippage: parseFloat(req.body.slippage || req.query.slippage)
          });

          req.recommendedSlippage = slippageData;

          if (slippageData.warning) {
            logger.warn('[SlippageProtection] Warning issued', {
              warning: slippageData.warning,
              userId: req.user?.id
            });
          }
        } catch (error) {
          logger.error('[SlippageProtection] Middleware error', {
            error: error.message
          });
        }
      }

      next();
    };
  }
}

// Export
const advancedSlippageProtection = new AdvancedSlippageProtection();

module.exports = {
  AdvancedSlippageProtection,
  advancedSlippageProtection
};
