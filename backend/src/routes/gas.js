/**
 * Gas Routes for Gas Price Optimization
 * Provides gas price data and estimates
 * Version: 2.7.0 - Database integration with real gas price oracle
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/productionLogger');
const { cacheMiddleware } = require('../middleware/cache');
const { isValidAmount, isValidInteger, isValidEmail, isValidUrl } = require('../utils/validators');
const { responseMiddleware } = require('../utils/apiResponse');
const gasPriceOracle = require('../services/gasPriceOracle');
const gasService = require('../services/gasService');

// Apply response middleware
router.use(responseMiddleware);

/**
 * GET /api/gas/prices
 * Get current gas prices for different speeds
 */
router.get('/prices',
  cacheMiddleware({ ttl: 10 }), // Cache for 10 seconds
  asyncHandler(async (req, res) => {
    try {
      // Fetch from oracle or database
      const gasData = await gasPriceOracle.getCurrentGasPrice();

      // Get ETH price (still using mock for now)
      const ethPrice = 1900 + Math.random() * 200; // TODO: Integrate price service

      // Calculate congestion percentage
      const congestionMap = {
        low: 25,
        medium: 60,
        high: 90
      };

      res.sendSuccess({
        prices: {
          slow: gasData.slow,
          standard: gasData.standard,
          fast: gasData.fast,
          instant: gasData.instant
        },
        baseFee: gasData.baseFee,
        congestion: congestionMap[gasData.congestion] || 50,
        congestionLevel: gasData.congestion,
        ethPrice: parseFloat(ethPrice.toFixed(2)),
        lastUpdate: gasData.lastUpdate,
        source: gasData.source
      });
    } catch (error) {
      logger.error('[Gas] Error fetching gas prices', {
        error: error.message,
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * POST /api/gas/estimate
 * Estimate gas cost for a transaction
 */
router.post('/estimate',
  asyncHandler(async (req, res) => {
    const { type = 'swap', gasPrice } = req.body;

    // Validate gas price
    if (!isValidAmount(gasPrice)) {
      return res.sendValidationError({
        field: 'gasPrice',
        message: 'Valid gas price (in Gwei) is required'
      });
    }

    // Validate transaction type
    const validTypes = ['swap', 'approval', 'liquidity', 'transfer'];
    if (type && !validTypes.includes(type)) {
      return res.sendValidationError({
        field: 'type',
        message: `Transaction type must be one of: ${validTypes.join(', ')}`
      });
    }

    try {
      // Gas limits for different transaction types
      const gasLimits = {
        swap: 150000,
        approval: 45000,
        liquidity: 200000,
        transfer: 21000,
      };

      const gasLimit = gasLimits[type] || gasLimits.swap;

      // Calculate costs
      const gasPriceGwei = parseFloat(gasPrice);
      const gasLimitNum = gasLimit;

      // Cost in ETH
      const costWei = gasPriceGwei * gasLimitNum * 1e9; // Convert Gwei to Wei
      const costEth = costWei / 1e18; // Convert Wei to ETH

      // Mock ETH price (TODO: integrate price service)
      const ethPrice = 1900 + Math.random() * 200;
      const costUsd = costEth * ethPrice;

      // Estimate confirmation time based on gas price
      const estimatedTime = gasPriceGwei < 25 ? '~5 min'
        : gasPriceGwei < 35 ? '~2 min'
        : gasPriceGwei < 45 ? '~1 min'
        : '<30 sec';

      const estimate = {
        gasLimit: gasLimitNum,
        gasPriceGwei: parseFloat(gasPriceGwei.toFixed(2)),
        estimatedCostEth: parseFloat(costEth.toFixed(6)).toString(),
        estimatedCostUsd: parseFloat(costUsd.toFixed(2)).toString(),
        estimatedTime,
        transactionType: type,
      };

      res.sendSuccess(estimate);
    } catch (error) {
      logger.error('[Gas] Error estimating gas', {
        error: error.message,
        type,
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/gas/history
 * Get historical gas prices
 */
router.get('/history',
  asyncHandler(async (req, res) => {
    const { hours = 24 } = req.query;

    // Validate hours parameter
    if (!isValidInteger(hours, 1, 168)) {
      return res.sendValidationError({
        field: 'hours',
        message: 'Hours must be an integer between 1 and 168 (1 week)'
      });
    }

    try {
      const hoursNum = parseInt(hours, 10);

      // Fetch from database
      const history = await gasService.getGasHistory(hoursNum);

      // Format response
      const formattedHistory = history.map(record => ({
        timestamp: record.timestamp.getTime(),
        baseFee: parseFloat(record.baseFee || record.standard),
        slow: parseFloat(record.slow),
        standard: parseFloat(record.standard),
        fast: parseFloat(record.fast),
        instant: parseFloat(record.instant),
        congestion: record.congestion
      }));

      res.sendSuccess({
        history: formattedHistory,
        hours: hoursNum,
        dataPoints: formattedHistory.length,
      });
    } catch (error) {
      logger.error('[Gas] Error fetching gas history', {
        error: error.message,
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/gas/optimal-time
 * Get optimal time for transaction based on historical data
 */
router.get('/optimal-time',
  asyncHandler(async (req, res) => {
    try {
      // Analyze last week of data
      const analysis = await gasService.findOptimalTimeWindows(168);

      if (!analysis) {
        // No historical data, return general recommendations
        const recommendations = {
          current: {
            optimal: false,
            reason: 'Insufficient historical data for analysis',
          },
          bestTimes: [
            {
              hour: 2,
              timezone: 'UTC',
              averageGwei: null,
              reason: 'Typically low activity period',
            },
            {
              hour: 4,
              timezone: 'UTC',
              averageGwei: null,
              reason: 'Typically lowest daily activity',
            }
          ],
          worstTimes: [
            {
              hour: 14,
              timezone: 'UTC',
              averageGwei: null,
              reason: 'Typically peak trading hours',
            }
          ],
          nextOptimalWindow: {
            start: getNextOptimalTime(),
            duration: 2,
            expectedGwei: null,
          },
        };

        return res.sendSuccess(recommendations);
      }

      // Build recommendations from actual data
      const bestTimes = analysis.bestTimes.map(time => ({
        hour: time.hour,
        timezone: 'UTC',
        averageGwei: time.averageGwei,
        reason: time.averageGwei < 20 ? 'Very low activity' : 'Low activity period',
        samples: time.samples
      }));

      const worstTimes = analysis.worstTimes.map(time => ({
        hour: time.hour,
        timezone: 'UTC',
        averageGwei: time.averageGwei,
        reason: time.averageGwei > 40 ? 'Very high activity' : 'High activity period',
        samples: time.samples
      }));

      // Determine if current time is optimal
      const currentHour = new Date().getUTCHours();
      const currentIsOptimal = bestTimes.some(t => t.hour === currentHour);

      const recommendations = {
        current: {
          optimal: currentIsOptimal,
          reason: currentIsOptimal
            ? 'Current hour is in optimal time window'
            : 'Consider waiting for optimal time window',
        },
        bestTimes: bestTimes.slice(0, 3),
        worstTimes: worstTimes.slice(0, 2),
        nextOptimalWindow: {
          start: getNextOptimalTime(bestTimes.map(t => t.hour)),
          duration: 2,
          expectedGwei: bestTimes[0]?.averageGwei,
        },
        analyzed: analysis.analyzed,
        period: analysis.period
      };

      res.sendSuccess(recommendations);
    } catch (error) {
      logger.error('[Gas] Error fetching optimal time', {
        error: error.message,
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/gas/statistics
 * Get gas price statistics
 */
router.get('/statistics',
  asyncHandler(async (req, res) => {
    const { hours = 24 } = req.query;

    // Validate hours parameter
    if (!isValidInteger(hours, 1, 168)) {
      return res.sendValidationError({
        field: 'hours',
        message: 'Hours must be an integer between 1 and 168 (1 week)'
      });
    }

    try {
      const hoursNum = parseInt(hours, 10);

      const stats = await gasService.getStatistics(hoursNum);

      if (!stats) {
        return res.sendSuccess({
          message: 'No data available for the specified period',
          hours: hoursNum
        });
      }

      res.sendSuccess(stats);
    } catch (error) {
      logger.error('[Gas] Error fetching statistics', {
        error: error.message,
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * POST /api/gas/alert
 * Set gas price alert
 */
router.post('/alert',
  asyncHandler(async (req, res) => {
    const { targetGasPrice, email, webhook } = req.body;

    // Validate target gas price
    if (!isValidAmount(targetGasPrice)) {
      return res.sendValidationError({
        field: 'targetGasPrice',
        message: 'Valid target gas price (in Gwei) is required'
      });
    }

    // Validate notification method
    if (!email && !webhook) {
      return res.sendValidationError({
        field: 'notification',
        message: 'Email or webhook is required for alerts'
      });
    }

    // Validate email if provided
    if (email && !isValidEmail(email)) {
      return res.sendValidationError({
        field: 'email',
        message: 'Invalid email format'
      });
    }

    // Validate webhook if provided
    if (webhook && !isValidUrl(webhook)) {
      return res.sendValidationError({
        field: 'webhook',
        message: 'Invalid webhook URL format'
      });
    }

    try {
      // TODO: Store alert in database and set up monitoring
      const alert = {
        id: `alert_${Date.now()}`,
        targetGasPrice: parseFloat(targetGasPrice),
        email,
        webhook,
        active: true,
        createdAt: new Date().toISOString(),
      };

      logger.info('[Gas] Alert created', {
        id: alert.id,
        targetGasPrice,
      });

      res.sendCreated(alert);
    } catch (error) {
      logger.error('[Gas] Error creating alert', {
        error: error.message,
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * Helper: Get next optimal time for transaction
 */
function getNextOptimalTime(optimalHours = [2, 4]) {
  const now = new Date();
  const currentHour = now.getUTCHours();

  // Find next optimal hour
  let nextHour = optimalHours.find(h => h > currentHour);

  if (!nextHour) {
    nextHour = optimalHours[0];
  }

  const next = new Date(now);
  next.setUTCHours(nextHour, 0, 0, 0);

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.toISOString();
}

module.exports = router;
