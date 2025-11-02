const { logger } = require('../utils/productionLogger');
const crypto = require('crypto');

/**
 * Advanced MEV Protection
 * 最新のDeFi攻撃手法に対する包括的な防御システム
 *
 * 防御対象:
 * - Sandwich Attacks (サンドイッチ攻撃)
 * - Front-running (フロントランニング)
 * - Back-running (バックランニング)
 * - Flash Loan Attacks (フラッシュローン攻撃)
 * - Price Manipulation (価格操作)
 */

class AdvancedMEVProtection {
  constructor() {
    this.config = {
      // サンドイッチ攻撃検出
      sandwichDetection: {
        enabled: true,
        timeWindow: 10000, // 10秒以内の取引を監視
        priceDeviationThreshold: 0.5, // 0.5%以上の価格変動で警告
        volumeThreshold: 1000000 // $1M以上の取引を監視
      },

      // フロントランニング防止
      frontrunProtection: {
        enabled: true,
        commitRevealDelay: 2000, // 2秒のcommit-reveal遅延
        gasPriceLimit: 200, // 200 Gwei上限
        priorityFeeLimit: 10 // 10 Gwei上限
      },

      // フラッシュローン検出
      flashLoanDetection: {
        enabled: true,
        minBlocksBetweenBorrowReturn: 1, // 最小1ブロック必要
        maxLoanAmount: 10000000, // $10M上限
        suspiciousPatternCheck: true
      },

      // 価格操作検出
      priceManipulation: {
        enabled: true,
        maxPriceImpact: 5, // 5%以上の価格インパクトで警告
        minLiquidity: 100000, // $100K最小流動性
        oracleDeviationThreshold: 2 // オラクル価格との乖離2%まで
      }
    };

    // 取引履歴 (MEV検出用)
    this.transactionHistory = new Map();
    this.pendingTransactions = new Map();
    this.suspiciousAddresses = new Set();
    this.priceHistory = new Map();

    // 統計情報
    this.stats = {
      totalTransactions: 0,
      blockedTransactions: 0,
      sandwichAttacks: 0,
      frontrunAttempts: 0,
      flashLoanAttacks: 0,
      priceManipulations: 0
    };

    this.startMonitoring();
  }

  /**
   * トランザクション検証 (メインエントリーポイント)
   */
  async validateTransaction(tx, context = {}) {
    const validations = [];

    try {
      // 1. サンドイッチ攻撃検出
      if (this.config.sandwichDetection.enabled) {
        const sandwichCheck = await this.detectSandwichAttack(tx, context);
        validations.push(sandwichCheck);
      }

      // 2. フロントランニング検出
      if (this.config.frontrunProtection.enabled) {
        const frontrunCheck = await this.detectFrontrunning(tx, context);
        validations.push(frontrunCheck);
      }

      // 3. フラッシュローン攻撃検出
      if (this.config.flashLoanDetection.enabled) {
        const flashLoanCheck = await this.detectFlashLoanAttack(tx, context);
        validations.push(flashLoanCheck);
      }

      // 4. 価格操作検出
      if (this.config.priceManipulation.enabled) {
        const priceManipCheck = await this.detectPriceManipulation(tx, context);
        validations.push(priceManipCheck);
      }

      // 結果の集約
      const blocked = validations.some(v => v.blocked);
      const warnings = validations.filter(v => v.warning);

      if (blocked) {
        this.stats.blockedTransactions++;
        logger.warn('[MEVProtection] Transaction blocked', {
          txHash: tx.hash,
          reasons: validations.filter(v => v.blocked).map(v => v.reason),
          address: tx.from
        });

        // 疑わしいアドレスとして記録
        this.suspiciousAddresses.add(tx.from);
      }

      return {
        allowed: !blocked,
        blocked,
        warnings: warnings.map(w => w.reason),
        validations,
        riskScore: this.calculateRiskScore(validations)
      };

    } catch (error) {
      logger.error('[MEVProtection] Validation error', {
        error: error.message,
        txHash: tx.hash
      });

      // エラー時は安全側に倒してブロック
      return {
        allowed: false,
        blocked: true,
        error: error.message
      };
    }
  }

  /**
   * サンドイッチ攻撃検出
   *
   * パターン:
   * 1. 攻撃者が大量買い注文 (価格上昇)
   * 2. 被害者の取引が実行 (高値で購入)
   * 3. 攻撃者が売却 (利益確定)
   */
  async detectSandwichAttack(tx, _context) {
    const { timeWindow, volumeThreshold } = this.config.sandwichDetection;

    const now = Date.now();
    const recentTxs = this.getRecentTransactions(tx.tokenPair, timeWindow);

    // 同一ペアの取引パターン分析
    const samePairTxs = recentTxs.filter(rtx =>
      rtx.tokenIn === tx.tokenIn && rtx.tokenOut === tx.tokenOut
    );

    // パターン1: 直前に大量買い
    const largeBuyBefore = samePairTxs.find(rtx =>
      rtx.timestamp < now &&
      rtx.type === 'buy' &&
      rtx.amount > volumeThreshold &&
      rtx.from !== tx.from
    );

    // パターン2: 直後に大量売り (pending txs)
    const largeSellAfter = Array.from(this.pendingTransactions.values()).find(ptx =>
      ptx.tokenPair === tx.tokenPair &&
      ptx.type === 'sell' &&
      ptx.amount > volumeThreshold &&
      ptx.from === largeBuyBefore?.from
    );

    if (largeBuyBefore && largeSellAfter) {
      this.stats.sandwichAttacks++;

      logger.warn('[MEVProtection] Sandwich attack detected', {
        victim: tx.from,
        attacker: largeBuyBefore.from,
        tokenPair: tx.tokenPair
      });

      return {
        blocked: true,
        warning: true,
        reason: 'Sandwich attack pattern detected',
        attackType: 'sandwich',
        details: {
          suspiciousAddress: largeBuyBefore.from,
          buyAmount: largeBuyBefore.amount,
          sellAmount: largeSellAfter.amount
        }
      };
    }

    return { blocked: false, warning: false };
  }

  /**
   * フロントランニング検出
   *
   * 高いガス価格で同じ取引を先に実行しようとする攻撃
   */
  async detectFrontrunning(tx, _context) {
    const { gasPriceLimit, priorityFeeLimit } = this.config.frontrunProtection;

    // ガス価格チェック
    if (tx.gasPrice > gasPriceLimit * 1e9) { // Gwei to Wei
      this.stats.frontrunAttempts++;

      logger.warn('[MEVProtection] High gas price detected', {
        txHash: tx.hash,
        gasPrice: tx.gasPrice / 1e9,
        limit: gasPriceLimit
      });

      return {
        blocked: true,
        warning: true,
        reason: `Gas price exceeds limit (${(tx.gasPrice / 1e9).toFixed(2)} > ${gasPriceLimit} Gwei)`,
        attackType: 'frontrun'
      };
    }

    // 優先手数料チェック
    if (tx.priorityFee && tx.priorityFee > priorityFeeLimit * 1e9) {
      return {
        blocked: true,
        warning: true,
        reason: 'Priority fee exceeds limit',
        attackType: 'frontrun'
      };
    }

    // 類似取引の検出
    const similarTx = this.findSimilarTransaction(tx);
    if (similarTx && tx.gasPrice > similarTx.gasPrice * 1.2) {
      logger.warn('[MEVProtection] Potential frontrunning detected', {
        txHash: tx.hash,
        similarTx: similarTx.hash,
        gasPriceDiff: ((tx.gasPrice / similarTx.gasPrice - 1) * 100).toFixed(2) + '%'
      });

      return {
        blocked: false,
        warning: true,
        reason: 'Similar transaction with lower gas price exists',
        attackType: 'frontrun'
      };
    }

    return { blocked: false, warning: false };
  }

  /**
   * フラッシュローン攻撃検出
   *
   * 単一トランザクション内で借入・操作・返済を行う攻撃
   */
  async detectFlashLoanAttack(tx, _context) {
    const { maxLoanAmount, suspiciousPatternCheck } = this.config.flashLoanDetection;

    // 大量借入の検出
    if (tx.type === 'borrow' && tx.amount > maxLoanAmount) {
      this.stats.flashLoanAttacks++;

      logger.warn('[MEVProtection] Large flash loan detected', {
        txHash: tx.hash,
        amount: tx.amount,
        address: tx.from
      });

      return {
        blocked: true,
        warning: true,
        reason: `Flash loan amount exceeds limit ($${(tx.amount / 1e6).toFixed(2)}M)`,
        attackType: 'flashloan'
      };
    }

    // 疑わしいパターンチェック
    if (suspiciousPatternCheck) {
      const pattern = this.analyzeTransactionPattern(tx);

      if (pattern.isFlashLoan) {
        logger.warn('[MEVProtection] Flash loan pattern detected', {
          txHash: tx.hash,
          pattern: pattern.type
        });

        return {
          blocked: pattern.highRisk,
          warning: true,
          reason: 'Suspicious flash loan pattern detected',
          attackType: 'flashloan',
          details: pattern
        };
      }
    }

    return { blocked: false, warning: false };
  }

  /**
   * 価格操作検出
   *
   * 大量取引で価格を操作する攻撃
   */
  async detectPriceManipulation(tx, _context) {
    const { maxPriceImpact, minLiquidity, oracleDeviationThreshold } = this.config.priceManipulation;

    // 価格インパクト計算
    const priceImpact = await this.calculatePriceImpact(tx);

    if (priceImpact > maxPriceImpact) {
      this.stats.priceManipulations++;

      logger.warn('[MEVProtection] High price impact detected', {
        txHash: tx.hash,
        priceImpact: priceImpact.toFixed(2) + '%',
        tokenPair: tx.tokenPair
      });

      return {
        blocked: priceImpact > maxPriceImpact * 2, // 10%以上は完全ブロック
        warning: true,
        reason: `Price impact too high (${priceImpact.toFixed(2)}%)`,
        attackType: 'priceManipulation',
        details: { priceImpact }
      };
    }

    // 流動性チェック
    const liquidity = await this.getPoolLiquidity(tx.tokenPair);
    if (liquidity < minLiquidity) {
      return {
        blocked: false,
        warning: true,
        reason: `Low liquidity pool ($${(liquidity / 1e3).toFixed(2)}K)`,
        details: { liquidity }
      };
    }

    // オラクル価格との比較
    const oraclePrice = await this.getOraclePrice(tx.tokenPair);
    const executionPrice = tx.amountOut / tx.amountIn;
    const deviation = Math.abs(executionPrice / oraclePrice - 1) * 100;

    if (deviation > oracleDeviationThreshold) {
      logger.warn('[MEVProtection] Price deviation from oracle', {
        txHash: tx.hash,
        deviation: deviation.toFixed(2) + '%',
        oraclePrice,
        executionPrice
      });

      return {
        blocked: deviation > oracleDeviationThreshold * 2,
        warning: true,
        reason: `Price deviates from oracle (${deviation.toFixed(2)}%)`,
        details: { deviation, oraclePrice, executionPrice }
      };
    }

    return { blocked: false, warning: false };
  }

  /**
   * リスクスコア計算 (0-100)
   */
  calculateRiskScore(validations) {
    let score = 0;

    validations.forEach(validation => {
      if (validation.blocked) {
        score += 50;
      }
      if (validation.warning) {
        score += 20;
      }

      // 攻撃タイプ別の重み付け
      switch (validation.attackType) {
      case 'sandwich':
        score += 15;
        break;
      case 'frontrun':
        score += 10;
        break;
      case 'flashloan':
        score += 20;
        break;
      case 'priceManipulation':
        score += 15;
        break;
      }
    });

    return Math.min(score, 100);
  }

  /**
   * 最近の取引を取得
   */
  getRecentTransactions(tokenPair, timeWindow) {
    const now = Date.now();
    const recent = [];

    for (const [_hash, tx] of this.transactionHistory.entries()) {
      if (tx.tokenPair === tokenPair && now - tx.timestamp < timeWindow) {
        recent.push(tx);
      }
    }

    return recent;
  }

  /**
   * 類似取引を検索
   */
  findSimilarTransaction(tx) {
    const threshold = 0.95; // 95%以上の類似度

    for (const [_hash, stored] of this.transactionHistory.entries()) {
      if (stored.tokenPair === tx.tokenPair) {
        const similarity = this.calculateSimilarity(tx, stored);
        if (similarity > threshold) {
          return stored;
        }
      }
    }

    return null;
  }

  /**
   * 取引の類似度計算
   */
  calculateSimilarity(tx1, tx2) {
    const amountSimilarity = 1 - Math.abs(tx1.amount - tx2.amount) / Math.max(tx1.amount, tx2.amount);
    const timeDiff = Math.abs(tx1.timestamp - tx2.timestamp);
    const timeSimilarity = Math.max(0, 1 - timeDiff / 60000); // 1分以内

    return (amountSimilarity * 0.7 + timeSimilarity * 0.3);
  }

  /**
   * トランザクションパターン分析
   */
  analyzeTransactionPattern(tx) {
    // フラッシュローンの典型的なパターン
    const patterns = {
      isFlashLoan: false,
      highRisk: false,
      type: null
    };

    // パターン1: 借入→スワップ→スワップ→返済
    if (tx.operations && tx.operations.length >= 4) {
      const ops = tx.operations.map(op => op.type);
      if (ops[0] === 'borrow' && ops[ops.length - 1] === 'repay') {
        patterns.isFlashLoan = true;
        patterns.type = 'borrow-swap-repay';
        patterns.highRisk = tx.operations.length > 6; // 複雑な操作
      }
    }

    return patterns;
  }

  /**
   * 価格インパクト計算
   */
  async calculatePriceImpact(tx) {
    // 簡易的な価格インパクト計算
    // 実際にはAMMの数式を使用
    const liquidity = await this.getPoolLiquidity(tx.tokenPair);
    if (liquidity === 0) {
      return 100;
    }

    const impact = (tx.amountIn / liquidity) * 100;
    return Math.min(impact, 100);
  }

  /**
   * プール流動性取得
   */
  async getPoolLiquidity(_tokenPair) {
    // 実装: 実際のプールから流動性を取得
    // プレースホルダー値
    return 1000000; // $1M
  }

  /**
   * オラクル価格取得
   */
  async getOraclePrice(_tokenPair) {
    // 実装: Chainlink等のオラクルから価格を取得
    // プレースホルダー値
    return 1.0;
  }

  /**
   * 取引履歴に追加
   */
  recordTransaction(tx) {
    this.transactionHistory.set(tx.hash, {
      ...tx,
      timestamp: Date.now()
    });

    this.stats.totalTransactions++;

    // 古い履歴を削除 (メモリ管理)
    if (this.transactionHistory.size > 10000) {
      const oldest = Array.from(this.transactionHistory.keys())[0];
      this.transactionHistory.delete(oldest);
    }
  }

  /**
   * Pending取引に追加
   */
  addPendingTransaction(tx) {
    this.pendingTransactions.set(tx.hash, tx);
  }

  /**
   * Pending取引を削除
   */
  removePendingTransaction(hash) {
    this.pendingTransactions.delete(hash);
  }

  /**
   * 監視開始
   */
  startMonitoring() {
    // 定期的にペンディング取引をクリーンアップ
    setInterval(() => {
      const now = Date.now();
      for (const [hash, tx] of this.pendingTransactions.entries()) {
        if (now - tx.timestamp > 60000) { // 1分以上古い
          this.pendingTransactions.delete(hash);
        }
      }
    }, 30000); // 30秒毎

    logger.info('[MEVProtection] Monitoring started');
  }

  /**
   * 統計情報取得
   */
  getStatistics() {
    return {
      ...this.stats,
      blockRate: ((this.stats.blockedTransactions / this.stats.totalTransactions) * 100).toFixed(2) + '%',
      suspiciousAddresses: this.suspiciousAddresses.size,
      pendingTransactions: this.pendingTransactions.size,
      historicalTransactions: this.transactionHistory.size
    };
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      if (req.path.includes('/swap') || req.path.includes('/trade')) {
        const tx = {
          hash: crypto.randomBytes(32).toString('hex'),
          from: req.user?.address || req.body.from,
          tokenIn: req.body.tokenIn,
          tokenOut: req.body.tokenOut,
          amountIn: parseFloat(req.body.amountIn),
          amountOut: parseFloat(req.body.amountOut),
          gasPrice: req.body.gasPrice || 50e9,
          tokenPair: `${req.body.tokenIn}/${req.body.tokenOut}`,
          type: 'swap'
        };

        const validation = await this.validateTransaction(tx, req);

        if (validation.blocked) {
          return res.status(403).json({
            success: false,
            error: 'Transaction blocked by MEV protection',
            reasons: validation.warnings,
            riskScore: validation.riskScore
          });
        }

        if (validation.warnings.length > 0) {
          req.mevWarnings = validation.warnings;
        }

        this.recordTransaction(tx);
      }

      next();
    };
  }
}

// Export
const advancedMEVProtection = new AdvancedMEVProtection();

module.exports = {
  AdvancedMEVProtection,
  advancedMEVProtection
};
