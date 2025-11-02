/**
 * Advanced Features API Routes
 * Comprehensive endpoints for 2025 DeFi innovations
 */

const express = require('express');
const router = express.Router();

// Import services
const AILiquidityRebalancer = require('../services/aiLiquidityRebalancer');
const { crossChainRouter } = require('../services/crossChainRouter');
const { predictiveGasOptimizer } = require('../services/predictiveGasOptimizer');
const { ilHedgingStrategies } = require('../services/ilHedgingStrategies');
const { intentBasedTrading } = require('../services/intentBasedTrading');
const { mevProtection } = require('../services/mevProtection');
const { portfolioAnalytics } = require('../services/portfolioAnalytics');
const concentratedLiquidityManager = require('../services/concentratedLiquidity');

// Initialize AI Liquidity Rebalancer
const aiRebalancer = new AILiquidityRebalancer(concentratedLiquidityManager);

// ==================== AI LIQUIDITY REBALANCING ====================

/**
 * @route   POST /api/v1/advanced/ai-rebalance/register
 * @desc    Register position for AI-driven management
 */
router.post('/ai-rebalance/register', async (req, res) => {
  try {
    const { positionId, strategy } = req.body;
    const result = await aiRebalancer.registerPosition(positionId, strategy);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/ai-rebalance/analyze/:positionId
 * @desc    Analyze position and get rebalancing recommendations
 */
router.get('/ai-rebalance/analyze/:positionId', async (req, res) => {
  try {
    const { positionId } = req.params;
    const analysis = await aiRebalancer.analyzePosition(positionId);
    res.json({ success: true, data: analysis });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/advanced/ai-rebalance/execute
 * @desc    Execute AI-driven rebalancing
 */
router.post('/ai-rebalance/execute', async (req, res) => {
  try {
    const { positionId } = req.body;
    const result = await aiRebalancer.executeRebalance(positionId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/ai-rebalance/analytics/:positionId
 * @desc    Get position performance analytics
 */
router.get('/ai-rebalance/analytics/:positionId', (req, res) => {
  try {
    const { positionId } = req.params;
    const analytics = aiRebalancer.getPositionAnalytics(positionId);
    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/ai-rebalance/stats
 * @desc    Get AI rebalancer system metrics
 */
router.get('/ai-rebalance/stats', (req, res) => {
  const stats = aiRebalancer.getSystemMetrics();
  res.json({ success: true, data: stats });
});

// ==================== CROSS-CHAIN ROUTING ====================

/**
 * @route   POST /api/v1/advanced/cross-chain/route
 * @desc    Find optimal cross-chain route
 */
router.post('/cross-chain/route', async (req, res) => {
  try {
    const route = await crossChainRouter.findOptimalRoute(req.body);
    res.json({ success: true, data: route });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/advanced/cross-chain/execute
 * @desc    Execute cross-chain swap
 */
router.post('/cross-chain/execute', async (req, res) => {
  try {
    const { routeId, userAddress } = req.body;
    const result = await crossChainRouter.executeRoute(routeId, userAddress);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/cross-chain/chains
 * @desc    Get supported chains
 */
router.get('/cross-chain/chains', (req, res) => {
  const chains = crossChainRouter.getSupportedChains();
  res.json({ success: true, data: chains });
});

/**
 * @route   GET /api/v1/advanced/cross-chain/sources/:chain
 * @desc    Get liquidity sources for a chain
 */
router.get('/cross-chain/sources/:chain', (req, res) => {
  try {
    const { chain } = req.params;
    const sources = crossChainRouter.getLiquiditySources(chain);
    res.json({ success: true, data: sources });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/cross-chain/bridges
 * @desc    Get available bridges between chains
 */
router.get('/cross-chain/bridges', (req, res) => {
  try {
    const { fromChain, toChain } = req.query;
    const bridges = crossChainRouter.getAvailableBridges(fromChain, toChain);
    res.json({ success: true, data: bridges });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/cross-chain/stats
 * @desc    Get cross-chain router statistics
 */
router.get('/cross-chain/stats', (req, res) => {
  const stats = crossChainRouter.getStatistics();
  res.json({ success: true, data: stats });
});

// ==================== GAS OPTIMIZATION ====================

/**
 * @route   POST /api/v1/advanced/gas/prediction
 * @desc    Get gas price prediction
 */
router.post('/gas/prediction', async (req, res) => {
  try {
    const { chain, urgency } = req.body;
    const prediction = await predictiveGasOptimizer.getPrediction(chain, urgency);
    res.json({ success: true, data: prediction });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/advanced/gas/optimize
 * @desc    Optimize transaction for best gas price
 */
router.post('/gas/optimize', async (req, res) => {
  try {
    const optimization = await predictiveGasOptimizer.optimizeTransaction(req.body);
    res.json({ success: true, data: optimization });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/gas/analytics/:chain
 * @desc    Get gas analytics for a chain
 */
router.get('/gas/analytics/:chain', (req, res) => {
  try {
    const { chain } = req.params;
    const { timeframe } = req.query;
    const analytics = predictiveGasOptimizer.getGasAnalytics(chain, timeframe);
    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/gas/comparison
 * @desc    Get multi-chain gas comparison
 */
router.get('/gas/comparison', (req, res) => {
  const { transactionType } = req.query;
  const comparison = predictiveGasOptimizer.getMultiChainComparison(transactionType);
  res.json({ success: true, data: comparison });
});

/**
 * @route   GET /api/v1/advanced/gas/stats
 * @desc    Get gas optimizer statistics
 */
router.get('/gas/stats', (req, res) => {
  const stats = predictiveGasOptimizer.getStatistics();
  res.json({ success: true, data: stats });
});

// ==================== IL HEDGING STRATEGIES ====================

/**
 * @route   POST /api/v1/advanced/il-hedge/recommend
 * @desc    Get hedging strategy recommendation
 */
router.post('/il-hedge/recommend', async (req, res) => {
  try {
    const { positionId, riskTolerance } = req.body;
    const recommendation = await ilHedgingStrategies.recommendStrategy(
      positionId,
      riskTolerance
    );
    res.json({ success: true, data: recommendation });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/advanced/il-hedge/collar
 * @desc    Create options collar hedge
 */
router.post('/il-hedge/collar', async (req, res) => {
  try {
    const { positionId, ...params } = req.body;
    const result = await ilHedgingStrategies.createOptionsCollar(positionId, params);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/advanced/il-hedge/delta
 * @desc    Create delta hedge
 */
router.post('/il-hedge/delta', async (req, res) => {
  try {
    const { positionId, ...params } = req.body;
    const result = await ilHedgingStrategies.createDeltaHedge(positionId, params);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/advanced/il-hedge/insurance
 * @desc    Buy IL insurance
 */
router.post('/il-hedge/insurance', async (req, res) => {
  try {
    const { positionId, ...params } = req.body;
    const result = await ilHedgingStrategies.buyILInsurance(positionId, params);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/advanced/il-hedge/rebalance
 * @desc    Rebalance delta hedge
 */
router.post('/il-hedge/rebalance', async (req, res) => {
  try {
    const { hedgeId, currentPrice } = req.body;
    const result = await ilHedgingStrategies.rebalanceDeltaHedge(
      hedgeId,
      currentPrice
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/il-hedge/performance/:hedgeId
 * @desc    Get hedge performance
 */
router.get('/il-hedge/performance/:hedgeId', (req, res) => {
  try {
    const { hedgeId } = req.params;
    const { currentPrice } = req.query;
    const performance = ilHedgingStrategies.getHedgePerformance(
      hedgeId,
      parseFloat(currentPrice)
    );
    res.json({ success: true, data: performance });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/il-hedge/position/:positionId
 * @desc    Get all hedges for a position
 */
router.get('/il-hedge/position/:positionId', (req, res) => {
  try {
    const { positionId } = req.params;
    const hedges = ilHedgingStrategies.getPositionHedges(positionId);
    res.json({ success: true, data: hedges });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/il-hedge/stats
 * @desc    Get IL hedging statistics
 */
router.get('/il-hedge/stats', (req, res) => {
  const stats = ilHedgingStrategies.getStatistics();
  res.json({ success: true, data: stats });
});

// ==================== INTENT-BASED TRADING ====================

/**
 * @route   POST /api/v1/advanced/intent/create
 * @desc    Create trading intent
 */
router.post('/intent/create', async (req, res) => {
  try {
    const result = await intentBasedTrading.createIntent(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/intent/status/:intentId
 * @desc    Get intent status
 */
router.get('/intent/status/:intentId', (req, res) => {
  try {
    const { intentId } = req.params;
    const status = intentBasedTrading.getIntentStatus(intentId);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/advanced/intent/cancel
 * @desc    Cancel intent
 */
router.post('/intent/cancel', (req, res) => {
  try {
    const { intentId, userId } = req.body;
    const result = intentBasedTrading.cancelIntent(intentId, userId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/intent/batch
 * @desc    Get current batch info
 */
router.get('/intent/batch', (req, res) => {
  const batch = intentBasedTrading.getCurrentBatch();
  res.json({ success: true, data: batch });
});

/**
 * @route   GET /api/v1/advanced/intent/stats
 * @desc    Get intent trading statistics
 */
router.get('/intent/stats', (req, res) => {
  const stats = intentBasedTrading.getStatistics();
  res.json({ success: true, data: stats });
});

// ==================== PORTFOLIO ANALYTICS ====================

/**
 * @route   POST /api/v1/advanced/portfolio/update
 * @desc    Update user portfolio
 */
router.post('/portfolio/update', async (req, res) => {
  try {
    const { userId, positions } = req.body;
    const portfolio = await portfolioAnalytics.updatePortfolio(userId, positions);
    res.json({ success: true, data: portfolio });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/portfolio/:userId/analytics
 * @desc    Get comprehensive portfolio analytics
 */
router.get('/portfolio/:userId/analytics', (req, res) => {
  try {
    const { userId } = req.params;
    const analytics = portfolioAnalytics.getPortfolioAnalytics(userId);
    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/portfolio/:userId/position/:positionId
 * @desc    Get detailed position analysis
 */
router.get('/portfolio/:userId/position/:positionId', (req, res) => {
  try {
    const { userId, positionId } = req.params;
    const analysis = portfolioAnalytics.getPositionAnalysis(userId, positionId);
    res.json({ success: true, data: analysis });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/portfolio/:userId/history
 * @desc    Get historical performance data
 */
router.get('/portfolio/:userId/history', (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe } = req.query;
    const history = portfolioAnalytics.getPerformanceHistory(userId, timeframe);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/portfolio/:userId/risk
 * @desc    Get risk assessment
 */
router.get('/portfolio/:userId/risk', (req, res) => {
  try {
    const { userId } = req.params;
    const risk = portfolioAnalytics.getRiskAssessment(userId);
    res.json({ success: true, data: risk });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/portfolio/:userId/yield-optimization
 * @desc    Get yield optimization suggestions
 */
router.get('/portfolio/:userId/yield-optimization', (req, res) => {
  try {
    const { userId } = req.params;
    const optimization = portfolioAnalytics.getYieldOptimization(userId);
    res.json({ success: true, data: optimization });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/portfolio/:userId/breakdown
 * @desc    Get asset breakdown by chain, protocol, and asset
 */
router.get('/portfolio/:userId/breakdown', (req, res) => {
  try {
    const { userId } = req.params;
    const breakdown = portfolioAnalytics.getAssetBreakdown(userId);
    res.json({ success: true, data: breakdown });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/advanced/portfolio/stats
 * @desc    Get portfolio analytics statistics
 */
router.get('/portfolio/stats', (req, res) => {
  const stats = portfolioAnalytics.getStatistics();
  res.json({ success: true, data: stats });
});

// ==================== SYSTEM ====================

/**
 * @route   GET /api/v1/advanced/overview
 * @desc    Get overview of all advanced features
 */
router.get('/overview', (req, res) => {
  res.json({
    success: true,
    data: {
      features: {
        aiRebalancing: {
          name: 'AI-Driven Liquidity Rebalancing',
          description: 'ML-powered position optimization',
          status: 'active'
        },
        crossChain: {
          name: 'Cross-Chain Smart Routing',
          description: '30+ chains, 900+ liquidity sources',
          status: 'active'
        },
        gasOptimization: {
          name: 'Predictive Gas Optimization',
          description: 'ML-based gas price prediction',
          status: 'active'
        },
        ilHedging: {
          name: 'IL Hedging Strategies',
          description: 'Options and automated protection',
          status: 'active'
        },
        intentTrading: {
          name: 'Intent-Based Trading',
          description: 'MEV-protected batch auctions',
          status: 'active'
        },
        portfolioAnalytics: {
          name: 'Portfolio Analytics Dashboard',
          description: 'Comprehensive DeFi portfolio tracking',
          status: 'active'
        }
      },
      version: '2.0.0',
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * @route   GET /api/v1/advanced/health
 * @desc    Get health status of all services
 */
router.get('/health', (req, res) => {
  const health = {
    aiRebalancer: {
      status: 'healthy',
      metrics: aiRebalancer.getSystemMetrics()
    },
    crossChainRouter: {
      status: 'healthy',
      metrics: crossChainRouter.getStatistics()
    },
    gasOptimizer: {
      status: 'healthy',
      metrics: predictiveGasOptimizer.getStatistics()
    },
    ilHedging: {
      status: 'healthy',
      metrics: ilHedgingStrategies.getStatistics()
    },
    mevProtection: {
      status: 'healthy',
      metrics: mevProtection.getStatistics()
    },
    portfolioAnalytics: {
      status: 'healthy',
      metrics: portfolioAnalytics.getStatistics()
    }
  };

  res.json({
    success: true,
    overallStatus: 'healthy',
    services: health,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
