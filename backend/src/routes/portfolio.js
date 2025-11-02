/**
 * Portfolio Routes for Portfolio Tracking
 * Provides portfolio data, analytics, and historical performance
 * Version: 2.6.1 - With validators and standardized responses
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/productionLogger');
const { cacheMiddleware } = require('../middleware/cache');
const { isValidAddress, isValidPeriod } = require('../utils/validators');
const { responseMiddleware } = require('../utils/apiResponse');

// Apply response middleware
router.use(responseMiddleware);

// Mock portfolio data store
const portfolioCache = new Map();

/**
 * GET /api/portfolio/:address
 * Get complete portfolio for an address
 */
router.get('/:address',
  cacheMiddleware({ ttl: 30 }), // Cache for 30 seconds
  asyncHandler(async (req, res) => {
    const { address } = req.params;

    // Validate Ethereum address
    if (!isValidAddress(address)) {
      return res.sendValidationError({
        field: 'address',
        message: 'Valid Ethereum address is required'
      });
    }

    try {
      // Get or create portfolio data
      let portfolio = portfolioCache.get(address.toLowerCase());

      if (!portfolio) {
        portfolio = await generateMockPortfolio(address);
        portfolioCache.set(address.toLowerCase(), portfolio);
      }

      res.sendSuccess(portfolio);

    } catch (error) {
      logger.error('[Portfolio] Error fetching portfolio', {
        error: error.message,
        address
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/portfolio/:address/history
 * Get historical portfolio performance
 */
router.get('/:address/history',
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const { period = '24h' } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required',
        code: 'MISSING_ADDRESS'
      });
    }

    try {
      const history = generateHistoricalData(period);

      res.json({
        success: true,
        data: {
          address,
          period,
          history,
          dataPoints: history.length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[Portfolio] Error fetching history', {
        error: error.message,
        address
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch portfolio history',
        code: 'HISTORY_ERROR'
      });
    }
  })
);

/**
 * GET /api/portfolio/:address/analytics
 * Get portfolio analytics and insights
 */
router.get('/:address/analytics',
  asyncHandler(async (req, res) => {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required',
        code: 'MISSING_ADDRESS'
      });
    }

    try {
      const analytics = await generatePortfolioAnalytics(address);

      res.json({
        success: true,
        data: analytics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[Portfolio] Error generating analytics', {
        error: error.message,
        address
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to generate analytics',
        code: 'ANALYTICS_ERROR'
      });
    }
  })
);

/**
 * GET /api/portfolio/:address/performance
 * Get portfolio performance metrics
 */
router.get('/:address/performance',
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const { period = '30d' } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required',
        code: 'MISSING_ADDRESS'
      });
    }

    try {
      const performance = calculatePerformanceMetrics(period);

      res.json({
        success: true,
        data: {
          address,
          period,
          metrics: performance
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[Portfolio] Error calculating performance', {
        error: error.message,
        address
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to calculate performance',
        code: 'PERFORMANCE_ERROR'
      });
    }
  })
);

/**
 * Helper: Generate mock portfolio data
 */
async function generateMockPortfolio(address) {
  // Mock token holdings
  const holdings = [
    {
      symbol: 'ETH',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      balance: 5.5 + Math.random() * 2,
      decimals: 18,
      priceUsd: 1900 + Math.random() * 200,
      change24h: Math.random() * 10 - 5,
      allocation: 0
    },
    {
      symbol: 'USDC',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      balance: 5000 + Math.random() * 1000,
      decimals: 6,
      priceUsd: 1.0,
      change24h: Math.random() * 0.2 - 0.1,
      allocation: 0
    },
    {
      symbol: 'DAI',
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      balance: 2500 + Math.random() * 500,
      decimals: 18,
      priceUsd: 0.999 + Math.random() * 0.002,
      change24h: Math.random() * 0.2 - 0.1,
      allocation: 0
    },
    {
      symbol: 'WBTC',
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      balance: 0.1 + Math.random() * 0.05,
      decimals: 8,
      priceUsd: 42000 + Math.random() * 2000,
      change24h: Math.random() * 8 - 4,
      allocation: 0
    },
    {
      symbol: 'UNI',
      address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      balance: 150 + Math.random() * 50,
      decimals: 18,
      priceUsd: 6.5 + Math.random() * 1,
      change24h: Math.random() * 15 - 7.5,
      allocation: 0
    }
  ];

  // Calculate values and allocations
  holdings.forEach(holding => {
    holding.valueUsd = holding.balance * holding.priceUsd;
  });

  const totalValue = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

  holdings.forEach(holding => {
    holding.allocation = (holding.valueUsd / totalValue) * 100;
  });

  // Calculate stats
  const totalChange24h = holdings.reduce((sum, h) => {
    const oldValue = h.valueUsd / (1 + h.change24h / 100);
    return sum + (h.valueUsd - oldValue);
  }, 0);

  const totalChange24hPercent = (totalChange24h / (totalValue - totalChange24h)) * 100;

  // Mock total gains (simulate purchase history)
  const totalCost = totalValue * (0.9 + Math.random() * 0.15); // ±5-15% gains
  const totalGainsUsd = totalValue - totalCost;
  const totalGainsPercent = (totalGainsUsd / totalCost) * 100;

  // Find best and worst performers
  const sorted = [...holdings].sort((a, b) => b.change24h - a.change24h);

  const stats = {
    totalValueUsd: parseFloat(totalValue.toFixed(2)),
    change24h: parseFloat(totalChange24h.toFixed(2)),
    change24hPercent: parseFloat(totalChange24hPercent.toFixed(2)),
    totalGainsUsd: parseFloat(totalGainsUsd.toFixed(2)),
    totalGainsPercent: parseFloat(totalGainsPercent.toFixed(2)),
    bestPerformer: sorted[0]?.symbol || 'N/A',
    worstPerformer: sorted[sorted.length - 1]?.symbol || 'N/A'
  };

  // Generate historical data
  const history = generateHistoricalData('24h', totalValue);

  return {
    address,
    holdings: holdings.map(h => ({
      ...h,
      balance: parseFloat(h.balance.toFixed(6)),
      priceUsd: parseFloat(h.priceUsd.toFixed(2)),
      valueUsd: parseFloat(h.valueUsd.toFixed(2)),
      change24h: parseFloat(h.change24h.toFixed(2)),
      allocation: parseFloat(h.allocation.toFixed(2))
    })),
    stats,
    history,
    lastUpdate: Date.now()
  };
}

/**
 * Helper: Generate historical data
 */
function generateHistoricalData(period, currentValue = 10000) {
  let dataPoints = 24;
  let intervalMs = 3600000; // 1 hour

  switch (period) {
    case '7d':
      dataPoints = 168; // 7 days * 24 hours
      break;
    case '30d':
      dataPoints = 720; // 30 days * 24 hours
      break;
    case 'all':
      dataPoints = 365; // 1 year (daily)
      intervalMs = 86400000; // 1 day
      break;
  }

  const history = [];
  const now = Date.now();
  let value = currentValue;

  for (let i = dataPoints - 1; i >= 0; i--) {
    // Simulate price movement
    const change = (Math.random() - 0.5) * 0.02; // ±1% per interval
    value = value * (1 + change);

    history.push({
      timestamp: now - (i * intervalMs),
      value: parseFloat(value.toFixed(2))
    });
  }

  // Ensure current value matches
  history[history.length - 1].value = currentValue;

  return history;
}

/**
 * Helper: Generate portfolio analytics
 */
async function generatePortfolioAnalytics(address) {
  return {
    diversification: {
      score: 65 + Math.random() * 30, // 65-95
      recommendation: 'Consider adding more assets to improve diversification'
    },
    risk: {
      level: 'Medium',
      score: 50 + Math.random() * 30,
      volatility30d: 15 + Math.random() * 20
    },
    recommendations: [
      {
        type: 'rebalance',
        priority: 'medium',
        message: 'Consider rebalancing ETH allocation (currently high)',
        action: 'Reduce ETH by 10%'
      },
      {
        type: 'diversify',
        priority: 'low',
        message: 'Add exposure to DeFi protocols',
        action: 'Consider AAVE or COMP'
      }
    ],
    topGainers: [
      { symbol: 'ETH', gain: 45.2, period: '30d' },
      { symbol: 'UNI', gain: 32.1, period: '30d' }
    ],
    topLosers: [
      { symbol: 'USDC', gain: -0.1, period: '30d' }
    ],
    transactionCount: {
      total: 145,
      swaps: 98,
      liquidity: 35,
      other: 12
    }
  };
}

/**
 * Helper: Calculate performance metrics
 */
function calculatePerformanceMetrics(period) {
  return {
    roi: parseFloat((Math.random() * 50 - 10).toFixed(2)), // -10% to +40%
    sharpeRatio: parseFloat((Math.random() * 2).toFixed(2)),
    maxDrawdown: parseFloat((Math.random() * 20).toFixed(2)),
    winRate: parseFloat((50 + Math.random() * 30).toFixed(2)), // 50-80%
    averageGain: parseFloat((5 + Math.random() * 10).toFixed(2)),
    averageLoss: parseFloat((-5 - Math.random() * 5).toFixed(2)),
    profitFactor: parseFloat((1 + Math.random() * 1.5).toFixed(2)),
    bestTrade: {
      pair: 'ETH/USDC',
      gain: parseFloat((10 + Math.random() * 20).toFixed(2)),
      date: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString()
    },
    worstTrade: {
      pair: 'UNI/USDC',
      gain: parseFloat((-5 - Math.random() * 10).toFixed(2)),
      date: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString()
    }
  };
}

module.exports = router;
