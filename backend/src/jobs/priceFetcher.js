/**
 * Price Fetcher Background Job
 * Fetches and stores token prices at regular intervals
 * Version: 2.7.0
 */

const priceOracle = require('../services/priceOracle');
const priceService = require('../services/priceService');
const { logger } = require('../utils/winstonLogger');
const websocketService = require('../services/websocketService');
const metricsService = require('../services/metricsService');

class PriceFetcher {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.fetchInterval = parseInt(process.env.PRICE_FETCH_INTERVAL) || 120000; // 2 minutes default
    this.cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.lastCleanup = Date.now();

    // Token pairs to track
    this.tokenPairs = (process.env.TRACKED_TOKEN_PAIRS || 'ETH-USDC,BTC-USDC,ETH-BTC,USDC-USDT,DAI-USDC').split(',');
  }

  /**
   * Start the price fetcher
   */
  start() {
    if (this.isRunning) {
      logger.warn('[PriceFetcher] Already running');
      return;
    }

    logger.info('[PriceFetcher] Starting price fetcher', {
      interval: this.fetchInterval,
      pairs: this.tokenPairs.length
    });

    this.isRunning = true;

    // Fetch immediately
    this.fetchPrices();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.fetchPrices();
      this.checkCleanup();
    }, this.fetchInterval);
  }

  /**
   * Stop the price fetcher
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('[PriceFetcher] Not running');
      return;
    }

    logger.info('[PriceFetcher] Stopping price fetcher');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Fetch prices for all tracked pairs
   */
  async fetchPrices() {
    const startTime = Date.now();
    let status = 'success';

    try {
      logger.debug('[PriceFetcher] Fetching prices for tracked pairs', {
        pairs: this.tokenPairs
      });

      const results = await priceOracle.fetchMultiplePrices(this.tokenPairs);

      const successCount = Object.values(results).filter(r => r !== null).length;
      const failCount = Object.values(results).filter(r => r === null).length;

      logger.info('[PriceFetcher] Price fetch completed', {
        success: successCount,
        failed: failCount,
        total: this.tokenPairs.length
      });

      // Broadcast each successful price to WebSocket subscribers and update metrics
      if (websocketService.isInitialized() || metricsService.isInitialized()) {
        Object.entries(results).forEach(([pair, priceData]) => {
          if (priceData) {
            // WebSocket broadcast
            if (websocketService.isInitialized()) {
              websocketService.broadcastTokenPrice(priceData);
            }

            // Prometheus metrics
            if (metricsService.isInitialized()) {
              metricsService.updateTokenPrice(pair, priceData.price, priceData.source);
            }
          }
        });
      }

      if (failCount > 0) {
        status = 'partial';
      }

      return results;
    } catch (error) {
      status = 'error';
      logger.error('[PriceFetcher] Error fetching prices', {
        error: error.message
      });

      // Record error in metrics
      if (metricsService.isInitialized()) {
        metricsService.recordJobExecution('price-fetcher', status, undefined, { type: 'fetch_error' });
      }
    } finally {
      // Record job execution
      const duration = (Date.now() - startTime) / 1000;
      if (metricsService.isInitialized()) {
        metricsService.recordJobExecution('price-fetcher', status, duration);
      }
    }
  }

  /**
   * Fetch price for a specific pair
   */
  async fetchPair(tokenPair) {
    try {
      const price = await priceOracle.fetchAndStore(tokenPair);

      logger.debug('[PriceFetcher] Price fetched for pair', {
        tokenPair,
        price: price.price,
        source: price.source
      });

      // Broadcast to WebSocket subscribers
      if (websocketService.isInitialized()) {
        websocketService.broadcastTokenPrice(price);
      }

      return price;
    } catch (error) {
      logger.error('[PriceFetcher] Error fetching price for pair', {
        error: error.message,
        tokenPair
      });
      return null;
    }
  }

  /**
   * Check if cleanup is needed
   */
  async checkCleanup() {
    const now = Date.now();

    if (now - this.lastCleanup >= this.cleanupInterval) {
      await this.cleanup();
      this.lastCleanup = now;
    }
  }

  /**
   * Clean up old price records
   */
  async cleanup() {
    try {
      const daysToKeep = parseInt(process.env.PRICE_HISTORY_DAYS) || 90;

      logger.info('[PriceFetcher] Starting cleanup', {
        daysToKeep
      });

      const deleted = await priceService.cleanupOldPrices(daysToKeep);

      logger.info('[PriceFetcher] Cleanup completed', {
        deleted
      });
    } catch (error) {
      logger.error('[PriceFetcher] Error during cleanup', {
        error: error.message
      });
    }
  }

  /**
   * Add a token pair to track
   */
  addPair(tokenPair) {
    if (!this.tokenPairs.includes(tokenPair)) {
      this.tokenPairs.push(tokenPair);
      logger.info('[PriceFetcher] Added token pair to tracking', { tokenPair });
    }
  }

  /**
   * Remove a token pair from tracking
   */
  removePair(tokenPair) {
    const index = this.tokenPairs.indexOf(tokenPair);
    if (index > -1) {
      this.tokenPairs.splice(index, 1);
      logger.info('[PriceFetcher] Removed token pair from tracking', { tokenPair });
    }
  }

  /**
   * Get fetcher status
   */
  getStatus() {
    return {
      running: this.isRunning,
      interval: this.fetchInterval,
      trackedPairs: this.tokenPairs,
      lastCleanup: new Date(this.lastCleanup).toISOString()
    };
  }
}

// Export singleton instance
module.exports = new PriceFetcher();
