/**
 * Gas Price Fetcher Background Job
 * Fetches and stores gas prices at regular intervals
 * Version: 3.0.0 - OpenTelemetry tracing integration
 */

const gasPriceOracle = require('../services/gasPriceOracle');
const gasService = require('../services/gasService');
const { logger } = require('../utils/winstonLogger');
const websocketService = require('../services/websocketService');
const metricsService = require('../services/metricsService');
const tracerService = require('../services/tracerService');

class GasPriceFetcher {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.fetchInterval = parseInt(process.env.GAS_FETCH_INTERVAL) || 60000; // 1 minute default
    this.cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.lastCleanup = Date.now();
  }

  /**
   * Start the gas price fetcher
   */
  start() {
    if (this.isRunning) {
      logger.warn('[GasPriceFetcher] Already running');
      return;
    }

    logger.info('[GasPriceFetcher] Starting gas price fetcher', {
      interval: this.fetchInterval
    });

    this.isRunning = true;

    // Fetch immediately
    this.fetchGasPrice();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.fetchGasPrice();
      this.checkCleanup();
    }, this.fetchInterval);
  }

  /**
   * Stop the gas price fetcher
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('[GasPriceFetcher] Not running');
      return;
    }

    logger.info('[GasPriceFetcher] Stopping gas price fetcher');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Fetch and store current gas price
   */
  async fetchGasPrice() {
    return tracerService.traceJob('gas-price-fetcher', async (span) => {
      const startTime = Date.now();
      let status = 'success';

      try {
        span?.setAttribute('job.interval_ms', this.fetchInterval);

        const gasPrice = await gasPriceOracle.fetchAndStore();

        logger.debug('[GasPriceFetcher] Gas price fetched and stored', {
          baseFee: gasPrice.baseFee,
          congestion: gasPrice.congestion,
          source: gasPrice.source
        });

        span?.setAttributes({
          'gas.source': gasPrice.source,
          'gas.standard': gasPrice.standard,
          'gas.fast': gasPrice.fast,
        });

        span?.addEvent('gas_price_fetched', {
          'source': gasPrice.source,
        });

        // Broadcast to WebSocket subscribers
        if (websocketService.isInitialized()) {
          websocketService.broadcastGasPrice(gasPrice);
          span?.addEvent('websocket_broadcast');
        }

        // Update Prometheus metrics
        if (metricsService.isInitialized()) {
          metricsService.updateGasPrice('slow', gasPrice.slow, gasPrice.source);
          metricsService.updateGasPrice('standard', gasPrice.standard, gasPrice.source);
          metricsService.updateGasPrice('fast', gasPrice.fast, gasPrice.source);
          metricsService.updateGasPrice('instant', gasPrice.instant, gasPrice.source);
        }

        return gasPrice;
      } catch (error) {
        status = 'error';
        logger.error('[GasPriceFetcher] Error fetching gas price', {
          error: error.message
        });

        // Record error in metrics
        if (metricsService.isInitialized()) {
          metricsService.recordJobExecution('gas-price-fetcher', status, undefined, { type: 'fetch_error' });
        }

        throw error;
      } finally {
        // Record job execution
        const duration = (Date.now() - startTime) / 1000;
        if (metricsService.isInitialized()) {
          metricsService.recordJobExecution('gas-price-fetcher', status, duration);
        }
      }
    });
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
   * Clean up old gas price records
   */
  async cleanup() {
    try {
      const daysToKeep = parseInt(process.env.GAS_HISTORY_DAYS) || 30;

      logger.info('[GasPriceFetcher] Starting cleanup', {
        daysToKeep
      });

      const deleted = await gasService.cleanupOldRecords(daysToKeep);

      logger.info('[GasPriceFetcher] Cleanup completed', {
        deleted
      });
    } catch (error) {
      logger.error('[GasPriceFetcher] Error during cleanup', {
        error: error.message
      });
    }
  }

  /**
   * Get fetcher status
   */
  getStatus() {
    return {
      running: this.isRunning,
      interval: this.fetchInterval,
      lastCleanup: new Date(this.lastCleanup).toISOString()
    };
  }
}

// Export singleton instance
module.exports = new GasPriceFetcher();
