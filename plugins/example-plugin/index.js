/**
 * Example Trading Strategy Plugin
 *
 * Demonstrates:
 * - Hook implementation
 * - Price monitoring
 * - Custom metrics tracking
 * - Event emission
 */

const { BasePlugin } = require('../../backend/src/core/pluginSystem');

class ExampleTradingStrategyPlugin extends BasePlugin {
  constructor() {
    super();
    this.trades = [];
    this.priceHistory = [];
    this.metrics = {
      totalSwaps: 0,
      totalVolume: 0,
      priceUpdates: 0
    };
  }

  async initialize(config) {
    await super.initialize(config);

    this.logger.info('Example Trading Strategy Plugin initialized');
    this.logger.info('Config:', config);

    // Start monitoring interval
    if (config.interval) {
      this.monitoringInterval = setInterval(() => {
        this.analyze();
      }, config.interval);
    }
  }

  /**
   * Hook: Before swap
   * Can modify swap parameters or add validations
   */
  async beforeSwap(data) {
    this.logger.info('Before swap hook triggered', {
      tokenIn: data.tokenIn,
      tokenOut: data.tokenOut,
      amountIn: data.amountIn
    });

    // Example: Check if trade size is within limits
    if (data.amountIn > this.config.maxTradeSize) {
      this.logger.warn('Trade size exceeds maximum allowed');
      // Could throw error to prevent swap
      // throw new Error('Trade size too large');
    }

    // Example: Add custom slippage protection
    const customSlippage = this.calculateOptimalSlippage(data);

    return {
      ...data,
      customSlippage,
      pluginData: {
        strategyApplied: 'example-dca',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Hook: After swap
   * Track results, emit events, update metrics
   */
  async afterSwap(data) {
    this.logger.info('After swap hook triggered', {
      amountOut: data.amountOut,
      gasUsed: data.gasUsed
    });

    // Track trade
    this.trades.push({
      timestamp: Date.now(),
      tokenIn: data.tokenIn,
      tokenOut: data.tokenOut,
      amountIn: data.amountIn,
      amountOut: data.amountOut,
      gasUsed: data.gasUsed
    });

    // Update metrics
    this.metrics.totalSwaps++;
    this.metrics.totalVolume += parseFloat(data.amountIn);

    // Emit custom event
    this.hooks.emit('analytics:metric', {
      metric: 'custom_swap_completed',
      value: 1,
      tags: {
        plugin: 'example-strategy',
        pair: `${data.tokenIn}/${data.tokenOut}`
      }
    });

    return data;
  }

  /**
   * Hook: Price update
   * Monitor price changes for strategy signals
   */
  async onPriceUpdate(data) {
    this.metrics.priceUpdates++;

    // Store price history
    this.priceHistory.push({
      timestamp: Date.now(),
      token: data.token,
      price: data.price
    });

    // Keep only last 100 prices
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }

    // Example: Detect price spike
    if (this.detectPriceSpike(data.token, data.price)) {
      this.logger.warn('Price spike detected', {
        token: data.token,
        price: data.price
      });

      // Emit alert
      this.hooks.emit('analytics:metric', {
        metric: 'price_spike',
        value: data.price,
        tags: {
          token: data.token,
          plugin: 'example-strategy'
        }
      });
    }

    return data;
  }

  /**
   * Calculate optimal slippage based on market conditions
   */
  calculateOptimalSlippage(swapData) {
    // Example logic: adjust slippage based on volatility
    const recentPrices = this.priceHistory
      .filter(p => p.token === swapData.tokenIn)
      .slice(-10);

    if (recentPrices.length < 2) {
      return 0.005; // Default 0.5%
    }

    // Calculate volatility
    const prices = recentPrices.map(p => p.price);
    const mean = prices.reduce((a, b) => a + b) / prices.length;
    const variance = prices.reduce((sum, price) => {
      return sum + Math.pow(price - mean, 2);
    }, 0) / prices.length;
    const volatility = Math.sqrt(variance) / mean;

    // Higher volatility = higher slippage tolerance
    const baseSlippage = 0.005; // 0.5%
    const volatilityMultiplier = Math.min(volatility * 10, 2);

    return baseSlippage * (1 + volatilityMultiplier);
  }

  /**
   * Detect price spike
   */
  detectPriceSpike(token, currentPrice) {
    const recentPrices = this.priceHistory
      .filter(p => p.token === token)
      .slice(-5);

    if (recentPrices.length < 3) {
      return false;
    }

    const avgPrice = recentPrices.reduce((sum, p) => sum + p.price, 0) / recentPrices.length;
    const priceChange = Math.abs((currentPrice - avgPrice) / avgPrice);

    // Spike if price changed more than 10%
    return priceChange > 0.1;
  }

  /**
   * Periodic analysis
   */
  analyze() {
    this.logger.debug('Running periodic analysis', this.metrics);

    // Example: Check if we should execute a DCA strategy
    if (this.shouldExecuteDCA()) {
      this.logger.info('DCA strategy signal detected');
      // Emit event that could trigger automated trading
      this.hooks.emit('strategy:signal', {
        strategy: 'dca',
        action: 'buy',
        confidence: 0.8
      });
    }
  }

  /**
   * Example DCA strategy logic
   */
  shouldExecuteDCA() {
    // Simplified example: execute every 10 price updates
    return this.metrics.priceUpdates % 10 === 0;
  }

  /**
   * Get plugin metrics (exposed via API)
   */
  getMetrics() {
    return {
      ...this.metrics,
      avgTradeSize: this.trades.length > 0
        ? this.metrics.totalVolume / this.metrics.totalSwaps
        : 0,
      recentTrades: this.trades.slice(-10),
      priceHistorySize: this.priceHistory.length
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.logger.info('Example Trading Strategy Plugin cleaned up', {
      totalSwaps: this.metrics.totalSwaps,
      totalVolume: this.metrics.totalVolume
    });
  }

  /**
   * Get metadata
   */
  getMetadata() {
    return {
      id: 'example-trading-strategy',
      version: '1.0.0',
      status: 'active',
      metrics: this.metrics
    };
  }
}

module.exports = ExampleTradingStrategyPlugin;
