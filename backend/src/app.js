/**
 * Soba DEX Application - Main Entry Point
 * Modular architecture for maximum maintainability and scalability
 */

const { DEXApplication } = require('./app-core');
const { logger } = require('./utils/productionLogger');
const { asyncHandler } = require('./middleware/errorHandler');

// Load environment configuration
require('dotenv').config();

// Validate environment before starting
const { createDEXValidator } = require('./config/envValidator');
const validator = createDEXValidator();
const validationResult = validator.validate();
if (!validationResult.valid) {
  logger.error('Environment validation failed', { errors: validationResult.errors });
  process.exit(1);
}
if (validationResult.warnings.length > 0) {
  validationResult.warnings.forEach(warning => logger.warn(warning));
}

// Create and start the application
const app = new DEXApplication();

async function startApplication() {
  try {
    const port = process.env.PORT || 3000;

    // Start the application
    await app.start(port);

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
      await app.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received. Shutting down gracefully...');
      await app.stop();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at', { promise, reason });
      process.exit(1);
    });

    logger.info('Soba DEX application started successfully', {
      port,
      nodeEnv: process.env.NODE_ENV || 'development',
      version: require('../package.json').version
    });

  } catch (error) {
    logger.error('Failed to start application', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startApplication();
}

// Export for testing and external use
module.exports = {
  DEXApplication,
  app,
  startApplication
};

// AI Trading Optimizer Endpoints (Round 26)
app.post('/api/ai/predict', asyncHandler(async (req, res) => {
  const { symbol, priceHistory, features } = req.body;

  if (!symbol || !priceHistory || !Array.isArray(priceHistory)) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing or invalid fields: symbol, priceHistory (array)'
      })
    );
  }

  const prediction = await aiTradingOptimizer.predictPrice(symbol, priceHistory, features);

  res.json({
    success: true,
    data: prediction,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/ai/backtest', asyncHandler(async (req, res) => {
  const { symbol, historicalData, strategy } = req.body;

  if (!symbol || !historicalData) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: symbol, historicalData'
      })
    );
  }

  const result = await aiTradingOptimizer.backtest(symbol, historicalData, strategy);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

app.get('/api/ai/models', (req, res) => {
  const models = aiTradingOptimizer.getModels();

  res.json({
    success: true,
    data: models,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/ai/stats', (req, res) => {
  const stats = aiTradingOptimizer.getStatistics();

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});

// DAO Governance Endpoints (Round 27)
app.post('/api/governance/proposals/create', asyncHandler(async (req, res) => {
  const { proposer, title, description, actions, metadata } = req.body;

  if (!proposer || !title || !description || !actions) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: proposer, title, description, actions'
      })
    );
  }

  const proposal = await daoGovernance.createProposal({
    proposer,
    title,
    description,
    actions,
    metadata
  });

  res.json({
    success: true,
    data: proposal,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/governance/vote', asyncHandler(async (req, res) => {
  const { proposalId, voter, support, reason } = req.body;

  if (!proposalId || !voter || !support) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: proposalId, voter, support'
      })
    );
  }

  const vote = await daoGovernance.castVote(proposalId, voter, support, reason);

  res.json({
    success: true,
    data: vote,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/governance/delegate', asyncHandler(async (req, res) => {
  const { delegator, delegatee, amount } = req.body;

  if (!delegator || !delegatee) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: delegator, delegatee'
      })
    );
  }

  const delegation = await daoGovernance.delegate(delegator, delegatee, amount);

  res.json({
    success: true,
    data: delegation,
    timestamp: new Date().toISOString()
  });
}));

app.get('/api/governance/proposals', (req, res) => {
  const status = req.query.status;
  const proposals = daoGovernance.getProposals(status);

  res.json({
    success: true,
    data: proposals,
    count: proposals.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/governance/stats', (req, res) => {
  const stats = daoGovernance.getStatistics();

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});

// Staking Rewards Endpoints (Round 27)
app.post('/api/staking/stake', asyncHandler(async (req, res) => {
  const { userId, poolId, amount, lockPeriod } = req.body;

  if (!userId || !poolId || !amount) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: userId, poolId, amount'
      })
    );
  }

  const stake = await stakingRewards.stake(userId, poolId, amount, lockPeriod);

  res.json({
    success: true,
    data: stake,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/staking/unstake', asyncHandler(async (req, res) => {
  const { stakeId, userId } = req.body;

  if (!stakeId || !userId) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: stakeId, userId'
      })
    );
  }

  const result = await stakingRewards.unstake(stakeId, userId);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/staking/claim-rewards', asyncHandler(async (req, res) => {
  const { stakeId, userId } = req.body;

  if (!stakeId || !userId) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: stakeId, userId'
      })
    );
  }

  const rewards = await stakingRewards.claimRewards(stakeId, userId);

  res.json({
    success: true,
    data: rewards,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/staking/compound', asyncHandler(async (req, res) => {
  const { stakeId, userId } = req.body;

  if (!stakeId || !userId) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: stakeId, userId'
      })
    );
  }

  const result = await stakingRewards.compoundRewards(stakeId, userId);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

app.get('/api/staking/user/:userId', (req, res) => {
  const { userId } = req.params;
  const stakes = stakingRewards.getUserStakes(userId);

  res.json({
    success: true,
    data: stakes,
    count: stakes.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/staking/pools', (req, res) => {
  const pools = stakingRewards.getPoolsInfo();

  res.json({
    success: true,
    data: pools,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/staking/stats', (req, res) => {
  const stats = stakingRewards.getStatistics();

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});

// Analytics Engine Endpoints (Round 28)
app.post('/api/analytics/tvl', asyncHandler(async (req, res) => {
  const { chain, protocol, amount, tokenData } = req.body;

  if (!chain || !protocol || amount === undefined) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: chain, protocol, amount'
      })
    );
  }

  const result = await analyticsEngine.updateTVL(chain, protocol, amount, tokenData);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/analytics/index-block', asyncHandler(async (req, res) => {
  const { chain, blockNumber, blockData } = req.body;

  if (!chain || !blockNumber || !blockData) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: chain, blockNumber, blockData'
      })
    );
  }

  const result = await analyticsEngine.indexBlock(chain, blockNumber, blockData);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/analytics/query', asyncHandler(async (req, res) => {
  const { chain, query } = req.body;

  if (!chain || !query) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: chain, query'
      })
    );
  }

  const result = await analyticsEngine.querySubgraph(chain, query);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

app.get('/api/analytics/protocol/:chain/:protocol', asyncHandler(async (req, res) => {
  const { chain, protocol } = req.params;
  const timeWindow = req.query.timeWindow || '24h';

  const metrics = await analyticsEngine.getProtocolMetrics(chain, protocol, timeWindow);

  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString()
  });
}));

app.get('/api/analytics/cross-chain/:protocol', asyncHandler(async (req, res) => {
  const { protocol } = req.params;

  const metrics = await analyticsEngine.getCrossChainMetrics(protocol);

  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString()
  });
}));

app.get('/api/analytics/events', (req, res) => {
  const filters = {
    type: req.query.type,
    chain: req.query.chain,
    since: req.query.since ? parseInt(req.query.since) : undefined
  };

  const events = analyticsEngine.getEventStream(filters);

  res.json({
    success: true,
    data: events,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/analytics/stats', (req, res) => {
  const stats = analyticsEngine.getStatistics();

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});

// KYC & Compliance Endpoints (Round 28)
app.post('/api/kyc/create-did', asyncHandler(async (req, res) => {
  const { userId, userData } = req.body;

  if (!userId || !userData) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: userId, userData'
      })
    );
  }

  const did = await kycCompliance.createDID(userId, userData);

  res.json({
    success: true,
    data: did,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/kyc/verify', asyncHandler(async (req, res) => {
  const { userId, kycData, level } = req.body;

  if (!userId || !kycData) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required fields: userId, kycData'
      })
    );
  }

  const result = await kycCompliance.performKYC(userId, kycData, level);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/kyc/screen-wallet', asyncHandler(async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required field: address'
      })
    );
  }

  const screening = await kycCompliance.screenWalletAddress(address);

  res.json({
    success: true,
    data: screening,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/kyc/travel-rule', asyncHandler(async (req, res) => {
  const { transactionData } = req.body;

  if (!transactionData) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required field: transactionData'
      })
    );
  }

  const result = await kycCompliance.applyTravelRule(transactionData);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

app.post('/api/kyc/monitor-transaction', asyncHandler(async (req, res) => {
  const { transaction } = req.body;

  if (!transaction) {
    return res.status(400).json(
      problemDetails.create({
        type: 'validation-error',
        detail: 'Missing required field: transaction'
      })
    );
  }

  const monitoring = await kycCompliance.monitorTransaction(transaction);

  res.json({
    success: true,
    data: monitoring,
    timestamp: new Date().toISOString()
  });
}));

app.get('/api/kyc/status/:userId', (req, res) => {
  const { userId } = req.params;
  const status = kycCompliance.getKYCStatus(userId);

  res.json({
    success: true,
    data: status,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/kyc/suspicious-transactions', (req, res) => {
  const filters = {
    severity: req.query.severity,
    status: req.query.status
  };

  const transactions = kycCompliance.getSuspiciousTransactions(filters);

  res.json({
    success: true,
    data: transactions,
    count: transactions.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/kyc/stats', (req, res) => {
  const stats = kycCompliance.getStatistics();

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});
// Cross-Chain Bridge Endpoints (Round 29)
app.post('/api/bridge/transfer', asyncHandler(async (req, res) => {
  const result = await crossChainBridge.initiateTransfer(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.get('/api/bridge/status/:transferId', (req, res) => {
  const status = crossChainBridge.getTransferStatus(req.params.transferId);
  res.json({ success: true, data: status, timestamp: new Date().toISOString() });
});

app.post('/api/bridge/quote', asyncHandler(async (req, res) => {
  const quote = await crossChainBridge.getBridgeQuote(req.body);
  res.json({ success: true, data: quote, timestamp: new Date().toISOString() });
}));

app.get('/api/bridge/chains', (req, res) => {
  const chains = crossChainBridge.getSupportedChains();
  res.json({ success: true, data: chains, timestamp: new Date().toISOString() });
});

app.get('/api/bridge/stats', (req, res) => {
  const stats = crossChainBridge.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// Intent-Based Trading Endpoints (Round 29)
app.post('/api/intent/create', asyncHandler(async (req, res) => {
  const intent = await intentBasedTrading.createIntent(req.body);
  res.json({ success: true, data: intent, timestamp: new Date().toISOString() });
}));

app.get('/api/intent/status/:intentId', (req, res) => {
  const status = intentBasedTrading.getIntentStatus(req.params.intentId);
  res.json({ success: true, data: status, timestamp: new Date().toISOString() });
});

app.delete('/api/intent/:intentId', (req, res) => {
  const { userId } = req.body;
  const result = intentBasedTrading.cancelIntent(req.params.intentId, userId);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
});

app.get('/api/intent/batch/current', (req, res) => {
  const batch = intentBasedTrading.getCurrentBatch();
  res.json({ success: true, data: batch, timestamp: new Date().toISOString() });
});

app.get('/api/intent/stats', (req, res) => {
  const stats = intentBasedTrading.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// DEX Aggregator Endpoints (Round 29)
app.post('/api/aggregator/quote', asyncHandler(async (req, res) => {
  const quote = await dexAggregator.getBestQuote(req.body);
  res.json({ success: true, data: quote, timestamp: new Date().toISOString() });
}));

app.post('/api/aggregator/swap', asyncHandler(async (req, res) => {
  const result = await dexAggregator.executeSwap(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.get('/api/aggregator/stats', (req, res) => {
  const stats = dexAggregator.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// Blob Transactions Endpoints (Round 29)
app.post('/api/blob/create', asyncHandler(async (req, res) => {
  const result = await blobTransactions.createBlobTransaction(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/blob/cost-comparison', asyncHandler(async (req, res) => {
  const comparison = await blobTransactions.getCostComparison(req.body.dataSize, req.body.rollup);
  res.json({ success: true, data: comparison, timestamp: new Date().toISOString() });
}));

app.get('/api/blob/status/:txId', (req, res) => {
  const status = blobTransactions.getBlobTxStatus(req.params.txId);
  res.json({ success: true, data: status, timestamp: new Date().toISOString() });
});

app.get('/api/blob/stats', (req, res) => {
  const stats = blobTransactions.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// Yield Vault Endpoints (Round 30)
app.post('/api/vault/create', asyncHandler(async (req, res) => {
  const vault = await yieldVault.createVault(req.body);
  res.json({ success: true, data: vault, timestamp: new Date().toISOString() });
}));

app.post('/api/vault/strategy/create', asyncHandler(async (req, res) => {
  const strategy = await yieldVault.createStrategy(req.body);
  res.json({ success: true, data: strategy, timestamp: new Date().toISOString() });
}));

app.post('/api/vault/deposit', asyncHandler(async (req, res) => {
  const result = await yieldVault.deposit(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/vault/withdraw', asyncHandler(async (req, res) => {
  const result = await yieldVault.withdraw(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.get('/api/vault/:vaultId', (req, res) => {
  const vault = yieldVault.getVault(req.params.vaultId);
  res.json({ success: true, data: vault, timestamp: new Date().toISOString() });
});

app.get('/api/vault/user/:userId/deposits', (req, res) => {
  const deposits = yieldVault.getUserDeposits(req.params.userId);
  res.json({ success: true, data: deposits, timestamp: new Date().toISOString() });
});

app.get('/api/vault/stats', (req, res) => {
  const stats = yieldVault.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// RWA Tokenization Endpoints (Round 30)
app.post('/api/rwa/tokenize', asyncHandler(async (req, res) => {
  const asset = await rwaTokenization.tokenizeAsset(req.body);
  res.json({ success: true, data: asset, timestamp: new Date().toISOString() });
}));

app.post('/api/rwa/pool/create', asyncHandler(async (req, res) => {
  const pool = await rwaTokenization.createLendingPool(req.body);
  res.json({ success: true, data: pool, timestamp: new Date().toISOString() });
}));

app.post('/api/rwa/invest', asyncHandler(async (req, res) => {
  const investment = await rwaTokenization.investInPool(req.body);
  res.json({ success: true, data: investment, timestamp: new Date().toISOString() });
}));

app.post('/api/rwa/loan/originate', asyncHandler(async (req, res) => {
  const loan = await rwaTokenization.originateLoan(req.body);
  res.json({ success: true, data: loan, timestamp: new Date().toISOString() });
}));

app.post('/api/rwa/loan/repay', asyncHandler(async (req, res) => {
  const result = await rwaTokenization.repayLoan(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.get('/api/rwa/asset/:assetId', (req, res) => {
  const asset = rwaTokenization.getAsset(req.params.assetId);
  res.json({ success: true, data: asset, timestamp: new Date().toISOString() });
});

app.get('/api/rwa/pool/:poolId', (req, res) => {
  const pool = rwaTokenization.getPool(req.params.poolId);
  res.json({ success: true, data: pool, timestamp: new Date().toISOString() });
});

app.get('/api/rwa/user/:userId/investments', (req, res) => {
  const investments = rwaTokenization.getUserInvestments(req.params.userId);
  res.json({ success: true, data: investments, timestamp: new Date().toISOString() });
});

app.get('/api/rwa/loan/:loanId', (req, res) => {
  const loan = rwaTokenization.getLoan(req.params.loanId);
  res.json({ success: true, data: loan, timestamp: new Date().toISOString() });
});

app.get('/api/rwa/stats', (req, res) => {
  const stats = rwaTokenization.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// Perpetual Futures Endpoints (Round 30)
app.post('/api/perp/position/open', asyncHandler(async (req, res) => {
  const position = await perpetualFutures.openPosition(req.body);
  res.json({ success: true, data: position, timestamp: new Date().toISOString() });
}));

app.post('/api/perp/position/close', asyncHandler(async (req, res) => {
  const result = await perpetualFutures.closePosition(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/perp/order/place', asyncHandler(async (req, res) => {
  const order = await perpetualFutures.placeOrder(req.body);
  res.json({ success: true, data: order, timestamp: new Date().toISOString() });
}));

app.get('/api/perp/position/:positionId', (req, res) => {
  const position = perpetualFutures.getPosition(req.params.positionId);
  res.json({ success: true, data: position, timestamp: new Date().toISOString() });
});

app.get('/api/perp/market/:market', (req, res) => {
  const market = perpetualFutures.getMarketInfo(req.params.market);
  res.json({ success: true, data: market, timestamp: new Date().toISOString() });
});

app.get('/api/perp/user/:userId/positions', (req, res) => {
  const positions = perpetualFutures.getUserPositions(req.params.userId);
  res.json({ success: true, data: positions, timestamp: new Date().toISOString() });
});

app.get('/api/perp/stats', (req, res) => {
  const stats = perpetualFutures.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// Uniswap V4 Hooks Endpoints (Round 31)
app.post('/api/v4/pool/create', asyncHandler(async (req, res) => {
  const pool = await uniswapV4Hooks.createPool(req.body);
  res.json({ success: true, data: pool, timestamp: new Date().toISOString() });
}));

app.post('/api/v4/hook/register', asyncHandler(async (req, res) => {
  const hook = await uniswapV4Hooks.registerHook(req.body);
  res.json({ success: true, data: hook, timestamp: new Date().toISOString() });
}));

app.post('/api/v4/liquidity/add', asyncHandler(async (req, res) => {
  const position = await uniswapV4Hooks.addLiquidity(req.body);
  res.json({ success: true, data: position, timestamp: new Date().toISOString() });
}));

app.post('/api/v4/swap', asyncHandler(async (req, res) => {
  const result = await uniswapV4Hooks.swap(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/v4/twamm/place', asyncHandler(async (req, res) => {
  const order = await uniswapV4Hooks.placeTWAMMOrder(req.body);
  res.json({ success: true, data: order, timestamp: new Date().toISOString() });
}));

app.post('/api/v4/limit-order/place', asyncHandler(async (req, res) => {
  const order = await uniswapV4Hooks.placeLimitOrder(req.body);
  res.json({ success: true, data: order, timestamp: new Date().toISOString() });
}));

app.get('/api/v4/pool/:poolId', (req, res) => {
  const pool = uniswapV4Hooks.getPool(req.params.poolId);
  res.json({ success: true, data: pool, timestamp: new Date().toISOString() });
});

app.get('/api/v4/hook/:hookId', (req, res) => {
  const hook = uniswapV4Hooks.getHook(req.params.hookId);
  res.json({ success: true, data: hook, timestamp: new Date().toISOString() });
});

app.get('/api/v4/stats', (req, res) => {
  const stats = uniswapV4Hooks.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// EIP-7702 Delegation Endpoints (Round 31)
app.post('/api/eip7702/authorize', asyncHandler(async (req, res) => {
  const delegation = await eip7702Delegation.authorizeDelegate(req.body);
  res.json({ success: true, data: delegation, timestamp: new Date().toISOString() });
}));

app.post('/api/eip7702/execute', asyncHandler(async (req, res) => {
  const result = await eip7702Delegation.executeDelegated(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/eip7702/batch/create', asyncHandler(async (req, res) => {
  const batch = await eip7702Delegation.createBatch(req.body);
  res.json({ success: true, data: batch, timestamp: new Date().toISOString() });
}));

app.post('/api/eip7702/batch/:batchId/execute', asyncHandler(async (req, res) => {
  const result = await eip7702Delegation.executeBatch(req.params.batchId);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/eip7702/sponsor', asyncHandler(async (req, res) => {
  const result = await eip7702Delegation.sponsorTransaction(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/eip7702/revoke/:delegationId', asyncHandler(async (req, res) => {
  const result = await eip7702Delegation.revokeDelegation(req.params.delegationId);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.get('/api/eip7702/delegation/:delegationId', (req, res) => {
  const delegation = eip7702Delegation.getDelegation(req.params.delegationId);
  res.json({ success: true, data: delegation, timestamp: new Date().toISOString() });
});

app.get('/api/eip7702/eoa/:eoaAddress/delegations', (req, res) => {
  const delegations = eip7702Delegation.getEOADelegations(req.params.eoaAddress);
  res.json({ success: true, data: delegations, timestamp: new Date().toISOString() });
});

app.get('/api/eip7702/stats', (req, res) => {
  const stats = eip7702Delegation.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// Liquid Staking Endpoints (Round 31)
app.post('/api/liquid-staking/lido/stake', asyncHandler(async (req, res) => {
  const result = await liquidStaking.stakeLido(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/liquid-staking/rocketpool/stake', asyncHandler(async (req, res) => {
  const result = await liquidStaking.stakeRocketPool(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/liquid-staking/unstake', asyncHandler(async (req, res) => {
  const result = await liquidStaking.unstake(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/liquid-staking/defi/use', asyncHandler(async (req, res) => {
  const result = await liquidStaking.useInDeFi(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.get('/api/liquid-staking/position/:positionId', (req, res) => {
  const position = liquidStaking.getPosition(req.params.positionId);
  res.json({ success: true, data: position, timestamp: new Date().toISOString() });
});

app.get('/api/liquid-staking/user/:userId/balances', (req, res) => {
  const balances = liquidStaking.getUserBalances(req.params.userId);
  res.json({ success: true, data: balances, timestamp: new Date().toISOString() });
});

app.get('/api/liquid-staking/stats', (req, res) => {
  const stats = liquidStaking.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// MEV Protection Endpoints (Round 31)
app.post('/api/mev/submit', asyncHandler(async (req, res) => {
  const result = await mevProtection.submitProtected(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.post('/api/mev/auction/bid', asyncHandler(async (req, res) => {
  const result = await mevProtection.submitBid(req.body);
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

app.get('/api/mev/tx/:txId/status', (req, res) => {
  const status = mevProtection.getProtectionStatus(req.params.txId);
  res.json({ success: true, data: status, timestamp: new Date().toISOString() });
});

app.get('/api/mev/user/:userId/rebates', (req, res) => {
  const rebates = mevProtection.getUserRebates(req.params.userId);
  res.json({ success: true, data: rebates, timestamp: new Date().toISOString() });
});

app.get('/api/mev/builder/:builder/performance', (req, res) => {
  const performance = mevProtection.getBuilderPerformance(req.params.builder);
  res.json({ success: true, data: performance, timestamp: new Date().toISOString() });
});

app.get('/api/mev/stats', (req, res) => {
  const stats = mevProtection.getStatistics();
  res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
