/**
 * Price Routes for Real-time Price Data
 * Provides price information for token pairs
 * Version: 2.7.0 - Database integration with price oracle
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/winstonLogger');
const { cacheMiddleware } = require('../middleware/cache');
const priceService = require('../services/priceService');
const priceOracle = require('../services/priceOracle');
const { isValidTokenPair, validatePagination } = require('../utils/validators');
const { responseMiddleware } = require('../utils/apiResponse');

// Apply response middleware
router.use(responseMiddleware);

/**
 * GET /api/prices/:pair
 * Get current price for a token pair
 */
router.get('/:pair',
  cacheMiddleware({ ttl: 30 }), // Cache for 30 seconds
  asyncHandler(async (req, res) => {
    const { pair } = req.params;

    if (!pair || !isValidTokenPair(pair)) {
      return res.sendValidationError({
        field: 'pair',
        message: 'Invalid token pair format (expected: TOKEN1-TOKEN2, e.g., ETH-USDC)'
      });
    }

    try {
      // Get price from oracle (handles DB cache)
      const priceData = await priceOracle.getCurrentPrice(pair);

      res.sendSuccess(priceData);

    } catch (error) {
      logger.error('[Prices] Error fetching price', {
        error: error.message,
        pair
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/prices/:pair/history
 * Get price history for a token pair
 */
router.get('/:pair/history',
  asyncHandler(async (req, res) => {
    const { pair } = req.params;
    const { period = '24h', limit = 100 } = req.query;

    if (!pair || !isValidTokenPair(pair)) {
      return res.sendValidationError({
        field: 'pair',
        message: 'Invalid token pair format'
      });
    }

    // Validate period
    const validPeriods = ['1h', '24h', '7d', '30d', '1y'];
    if (!validPeriods.includes(period)) {
      return res.sendValidationError({
        field: 'period',
        message: `Period must be one of: ${validPeriods.join(', ')}`
      });
    }

    // Validate limit
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      return res.sendValidationError({
        field: 'limit',
        message: 'Limit must be between 1 and 1000'
      });
    }

    try {
      const history = await priceService.getPriceHistory(pair, {
        period,
        limit: limitNum
      });

      res.sendSuccess({
        pair,
        period,
        history,
        count: history.length
      });

    } catch (error) {
      logger.error('[Prices] Error fetching price history', {
        error: error.message,
        pair
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/prices/:pair/stats
 * Get price statistics for a token pair
 */
router.get('/:pair/stats',
  asyncHandler(async (req, res) => {
    const { pair } = req.params;

    if (!pair || !isValidTokenPair(pair)) {
      return res.sendValidationError({
        field: 'pair',
        message: 'Invalid token pair format'
      });
    }

    try {
      const stats = await priceService.getPriceStats(pair);

      if (!stats) {
        return res.sendSuccess({
          message: 'No data available for the specified pair',
          pair
        });
      }

      res.sendSuccess(stats);

    } catch (error) {
      logger.error('[Prices] Error fetching price stats', {
        error: error.message,
        pair
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/prices
 * Get multiple prices at once
 */
router.get('/',
  cacheMiddleware({ ttl: 30 }), // Cache for 30 seconds
  asyncHandler(async (req, res) => {
    const { pairs } = req.query;

    if (!pairs) {
      return res.sendValidationError({
        field: 'pairs',
        message: 'Comma-separated list of token pairs is required (e.g., ETH-USDC,BTC-USDC)'
      });
    }

    // Parse and validate pairs
    const pairList = pairs.split(',').map(p => p.trim());

    // Validate all pairs
    const invalidPairs = pairList.filter(p => !isValidTokenPair(p));
    if (invalidPairs.length > 0) {
      return res.sendValidationError({
        field: 'pairs',
        message: `Invalid token pairs: ${invalidPairs.join(', ')}`
      });
    }

    // Limit to 20 pairs per request
    if (pairList.length > 20) {
      return res.sendValidationError({
        field: 'pairs',
        message: 'Maximum 20 token pairs per request'
      });
    }

    try {
      const prices = await priceService.getMultiplePrices(pairList);

      res.sendSuccess({
        prices,
        count: prices.length
      });

    } catch (error) {
      logger.error('[Prices] Error fetching multiple prices', {
        error: error.message,
        pairs: pairList
      });

      return res.sendServerError(error);
    }
  })
);

module.exports = router;
