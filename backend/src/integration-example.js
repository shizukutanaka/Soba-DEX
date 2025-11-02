/**
 * Integration Example - How to use the lightweight optimizations
 * Demonstrates practical usage of all optimization modules
 */

const express = require('express');
const { lightweightMonitor } = require('./monitoring/lightweightMonitor');
const { stableErrorHandler } = require('./utils/stableErrorHandler');
const { inputValidator } = require('./security/inputValidator');
const { lightweightQueries } = require('./database/lightweightQueries');
const { performanceOptimizer } = require('./utils/performanceOptimizer');
const {
  requestOptimizer,
  compressionOptimizer,
  memoryMonitor,
  lightweightRateLimit
} = require('./middleware/lightweightOptimizer');

const app = express();

// Apply lightweight middleware stack
app.use(lightweightMonitor.middleware()); // Monitor all requests
app.use(requestOptimizer()); // Request optimization with caching
app.use(compressionOptimizer()); // Response compression
app.use(memoryMonitor()); // Memory management
app.use(lightweightRateLimit({ max: 100, windowMs: 60000 })); // Rate limiting

// JSON parsing with size limits
app.use(express.json({ limit: '1mb' }));

// Health check endpoint with monitoring
app.get('/health', async (req, res) => {
  try {
    const [dbHealth, appHealth, metrics] = await Promise.all([
      lightweightQueries.healthCheck(),
      lightweightMonitor.getHealthStatus(),
      lightweightMonitor.getDashboard()
    ]);

    res.json({
      status: dbHealth.healthy && appHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
      database: dbHealth,
      application: appHealth,
      metrics: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const handled = await stableErrorHandler.handleError(error, {
      operation: 'health-check'
    });
    res.status(503).json(handled.error);
  }
});

// Trading endpoint with full optimization stack
app.post('/api/trade', async (req, res) => {
  try {
    // Input validation
    const validation = inputValidator.validateTradeOrder(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const order = validation.sanitized;

    // Rate limiting check
    const userAddress = order.userAddress || req.headers['x-user-address'];
    const rateLimit = inputValidator.checkRateLimit(userAddress, 10, 60000);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rateLimit.reset - Date.now()) / 1000)
      });
    }

    // Use memoized price calculation
    const getPriceWithCache = performanceOptimizer.memoize(
      async (tokenA, _tokenB) => {
        return lightweightQueries.getTokenPrice(tokenA);
      },
      (tokenA, tokenB) => `${tokenA}-${tokenB}`,
      30000 // 30 second cache
    );

    // Get token prices with caching
    const [_priceA, _priceB] = await Promise.all([
      getPriceWithCache(order.tokenA),
      getPriceWithCache(order.tokenB)
    ]);

    // Simulate trade execution
    const tradeResult = {
      orderId: Date.now().toString(),
      executedAt: new Date().toISOString(),
      tokenA: order.tokenA,
      tokenB: order.tokenB,
      amountA: order.amountA,
      amountB: order.amountB,
      status: 'executed'
    };

    // Record trade metrics
    lightweightMonitor.recordTrade(order.amountA, userAddress);

    // Store trade in database (with caching)
    await lightweightQueries.batchInsertTrades([{
      user_address: userAddress,
      token_a: order.tokenA,
      token_b: order.tokenB,
      amount_a: order.amountA,
      amount_b: order.amountB,
      price: parseFloat(order.amountB) / parseFloat(order.amountA),
      type: order.type,
      timestamp: Date.now()
    }]);

    res.json({
      success: true,
      trade: tradeResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const handled = await stableErrorHandler.handleError(error, {
      operation: 'trade-execution',
      userAddress: req.headers['x-user-address']
    });
    res.status(handled.error?.status || 500).json(handled.error);
  }
});

// Portfolio endpoint with optimized queries
app.get('/api/portfolio/:address', async (req, res) => {
  try {
    // Validate address
    const addressValidation = inputValidator.validateAddress(req.params.address);
    if (!addressValidation.valid) {
      return res.status(400).json({ error: addressValidation.error });
    }

    const userAddress = addressValidation.value;

    // Use cached batch queries for better performance
    const [balances, trades, orders] = await Promise.all([
      lightweightQueries.getBatchBalances(userAddress, [
        '0xa0b86a33e6b00e48f29af8d4b59b7b8d3bc67e8f', // Example token addresses
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      ]),
      lightweightQueries.getRecentTrades(Date.now() - 86400000, 20), // Last 24h
      lightweightQueries.getUserActiveOrders(userAddress)
    ]);

    res.json({
      address: userAddress,
      balances,
      recentTrades: trades.rows,
      activeOrders: orders.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const handled = await stableErrorHandler.handleError(error, {
      operation: 'portfolio-fetch',
      userAddress: req.params.address
    });
    res.status(handled.error?.status || 500).json(handled.error);
  }
});

// Market data endpoint with aggressive caching
app.get('/api/market/:pair', async (req, res) => {
  try {
    const pair = inputValidator.sanitizeString(req.params.pair, { maxLength: 50 });

    // Use memoized market data with longer cache
    const getMarketData = performanceOptimizer.memoize(
      async (tokenPair) => {
        const [orderBook, recentTrades] = await Promise.all([
          lightweightQueries.getOrderBook(tokenPair, 20),
          lightweightQueries.getRecentTrades(Date.now() - 3600000, 50) // Last hour
        ]);

        return {
          pair: tokenPair,
          orderBook,
          recentTrades: recentTrades.rows,
          timestamp: Date.now()
        };
      },
      (pair) => `market-${pair}`,
      5000 // 5 second cache for market data
    );

    const marketData = await getMarketData(pair);
    res.json(marketData);

  } catch (error) {
    const handled = await stableErrorHandler.handleError(error, {
      operation: 'market-data',
      pair: req.params.pair
    });
    res.status(handled.error?.status || 500).json(handled.error);
  }
});

// Monitoring dashboard endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    const dashboard = lightweightMonitor.getDashboard();
    const dbStats = await lightweightQueries.getDbStats();
    const errorStats = stableErrorHandler.getStats();
    const perfMetrics = performanceOptimizer.getMetrics();

    res.json({
      system: dashboard,
      database: dbStats,
      errors: errorStats,
      performance: perfMetrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const handled = await stableErrorHandler.handleError(error, {
      operation: 'dashboard'
    });
    res.status(handled.error?.status || 500).json(handled.error);
  }
});

// Global error handler (should be last)
app.use(stableErrorHandler.middleware());

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Optimized DEX server running on port ${PORT}`);
  console.log('🚀 Lightweight optimizations active:');
  console.log('   • Performance optimization with memoization');
  console.log('   • Database query caching');
  console.log('   • Input validation and sanitization');
  console.log('   • Circuit breaker protection');
  console.log('   • Error recovery and handling');
  console.log('   • Request monitoring and alerting');
  console.log('   • Memory management and cleanup');
  console.log('   • Response compression and caching');
});

module.exports = app;