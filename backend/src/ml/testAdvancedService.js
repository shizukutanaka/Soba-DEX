/**
 * Test Script for DeFi Protocol Interoperability AI Service Advanced
 * Tests the enhanced functionality including market data integration and backtesting
 */

const DeFiProtocolInteropAIServiceAdvanced = require('./defiProtocolInteropAIServiceAdvanced');

async function testAdvancedService() {
  console.log('🧪 Starting Advanced DeFi Protocol Interoperability AI Service Tests...\n');

  try {
    // Initialize the advanced service
    const advancedService = new DeFiProtocolInteropAIServiceAdvanced({
      supportedProtocols: [
        'uniswap_v3', 'sushiswap', 'curve', 'balancer', 'aave', 'compound',
        'makerdao', 'yearn', 'synthetix', '1inch', '0x', 'kyberswap'
      ],
      marketDataUpdateInterval: 10000, // 10 seconds for testing
      predictionHorizon: 24,
      backtestPeriod: 90, // 90 days for faster testing
      autoRebalanceThreshold: 0.05
    });

    console.log('1️⃣ Initializing service...');
    await advancedService.initialize();

    // Wait a bit for market data to update
    console.log('⏳ Waiting for market data updates...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log('\n2️⃣ Testing market data integration...');
    const marketOverview = await advancedService.getMarketOverview();
    console.log('Market Overview:', {
      totalMarketCap: `$${(marketOverview.totalMarketCap / 1e9).toFixed(2)}B`,
      totalVolume24h: `$${(marketOverview.totalVolume24h / 1e6).toFixed(2)}M`,
      marketTrend: marketOverview.marketTrend,
      volatilityIndex: marketOverview.volatilityIndex.toFixed(4)
    });

    console.log('\n3️⃣ Testing market data for specific tokens...');
    const ethData = await advancedService.getMarketData('ETH');
    const btcData = await advancedService.getMarketData('BTC');

    if (ethData) {
      console.log('ETH Data:', {
        price: `$${ethData.currentPrice.toFixed(2)}`,
        change24h: `${(ethData.priceChange24h * 100).toFixed(2)}%`,
        trend: ethData.indicators?.trend || 'N/A',
        rsi: ethData.indicators?.rsi?.toFixed(2) || 'N/A'
      });
    }

    if (btcData) {
      console.log('BTC Data:', {
        price: `$${btcData.currentPrice.toFixed(2)}`,
        change24h: `${(btcData.priceChange24h * 100).toFixed(2)}%`,
        trend: btcData.indicators?.trend || 'N/A',
        rsi: btcData.indicators?.rsi?.toFixed(2) || 'N/A'
      });
    }

    console.log('\n4️⃣ Testing price predictions...');
    const predictions = await advancedService.getMarketPredictions();
    if (predictions.length > 0) {
      console.log('Top Predictions:');
      predictions.slice(0, 3).forEach(pred => {
        console.log(`${pred.token}: $${pred.currentPrice.toFixed(2)} → $${pred.predictedPrice.toFixed(2)} (${pred.confidence.toFixed(2)} confidence)`);
      });
    }

    console.log('\n5️⃣ Testing strategy composition...');
    const strategyRequirements = {
      objective: 'yield_maximization',
      capitalAmount: 10000,
      riskTolerance: 'medium',
      timeHorizon: 180,
      baseToken: 'ETH',
      quoteToken: 'USDC'
    };

    const compositionResult = await advancedService.composeDeFiStrategy('test_user_123', strategyRequirements);

    if (compositionResult.success) {
      console.log('✅ Strategy composition successful!');
      console.log('Strategy ID:', compositionResult.strategy.strategyId);
      console.log('Composition Steps:', compositionResult.strategy.compositionSteps.length);
      console.log('Estimated Yield:', `${(compositionResult.strategy.estimatedYield * 100).toFixed(2)}%`);
    } else {
      console.log('❌ Strategy composition failed:', compositionResult.errors);
    }

    console.log('\n6️⃣ Testing backtesting...');
    if (compositionResult.success) {
      const backtestResult = await advancedService.getBacktestReport(compositionResult.strategy.strategyId, 30);

      if (backtestResult) {
        console.log('✅ Backtest completed!');
        console.log('Backtest Results:', {
          totalReturn: `${(backtestResult.backtestResult.totalReturn * 100).toFixed(2)}%`,
          annualizedReturn: `${(backtestResult.backtestResult.annualizedReturn * 100).toFixed(2)}%`,
          maxDrawdown: `${(backtestResult.backtestResult.maxDrawdown * 100).toFixed(2)}%`,
          sharpeRatio: backtestResult.backtestResult.sharpeRatio.toFixed(2)
        });
      }
    }

    console.log('\n7️⃣ Testing performance monitoring...');
    const serviceStats = await advancedService.getAdvancedServiceStats();
    console.log('Service Stats:', {
      supportedProtocols: serviceStats.supportedProtocols,
      marketDataFeeds: serviceStats.marketDataFeeds,
      activeOracles: serviceStats.activeOracles,
      backtestStrategies: serviceStats.backtestStrategies,
      marketTrend: serviceStats.marketTrend,
      averageVolatility: serviceStats.averageVolatility.toFixed(4)
    });

    console.log('\n8️⃣ Testing arbitrage dashboard...');
    const arbitrageDashboard = await advancedService.getArbitrageDashboard();
    console.log('Arbitrage Dashboard:', {
      totalOpportunities: arbitrageDashboard.totalOpportunities,
      profitableOpportunities: arbitrageDashboard.profitableOpportunities,
      totalVolume: `$${(arbitrageDashboard.totalVolume / 1e6).toFixed(2)}M`,
      averageProfitability: `${(arbitrageDashboard.averageProfitability * 100).toFixed(2)}%`
    });

    console.log('\n✅ All tests completed successfully!');

    // Cleanup
    advancedService.cleanup();

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testAdvancedService().catch(console.error);
}

module.exports = { testAdvancedService };
