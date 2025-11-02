/**
 * Python ML Services API Routes
 * Integration endpoints for Python microservices
 *
 * Services:
 * - ML Models: Price prediction, model training
 * - NLP Translation: Multilingual text translation
 * - Fraud Detection: Risk assessment and anomaly detection
 * - Data Processing: Data validation and ETL pipelines
 * - Blockchain Intelligence: Smart contract analysis, MEV detection
 *
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const {
  pythonClient,
  mlModels,
  nlpTranslation,
  fraudDetection,
  dataProcessing,
  blockchainIntelligence
} = require('../services/pythonIntegrationService');
const { logger } = require('../config/logger');
const { authMiddleware } = require('../middleware/auth');
const asyncHandler = require('express-async-errors');

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

/**
 * @route   GET /api/python/health
 * @desc    Check health of all Python services
 * @access  Public
 */
router.get('/health', asyncHandler(async (req, res) => {
  try {
    const health = await pythonClient.checkHealth();

    const allHealthy = Object.values(health).every(service => service.healthy);

    res.json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date(),
      services: health
    });
  } catch (error) {
    logger.error('[Python Services] Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
}));

// ============================================================================
// ML MODELS SERVICE ROUTES
// ============================================================================

/**
 * @route   POST /api/python/ml/predict
 * @desc    Predict token price using ML models
 * @body    {tokenPair, priceHistory, forecastHorizon, confidenceLevel}
 * @access  Private
 */
router.post('/ml/predict', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const {
      tokenPair,
      priceHistory,
      forecastHorizon = 24,
      confidenceLevel = 0.95
    } = req.body;

    // Validation
    if (!tokenPair || !Array.isArray(priceHistory) || priceHistory.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: tokenPair and priceHistory'
      });
    }

    if (priceHistory.length < 50) {
      return res.status(400).json({
        error: 'Minimum 50 price history points required'
      });
    }

    const prediction = await mlModels.predictPrice(
      tokenPair,
      priceHistory,
      forecastHorizon,
      confidenceLevel
    );

    res.json({
      success: true,
      data: prediction,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[ML Predict] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Prediction failed',
      service: error.service,
      endpoint: error.endpoint
    });
  }
}));

/**
 * @route   POST /api/python/ml/train
 * @desc    Train ML model for specific token pair
 * @body    {tokenPair}
 * @access  Private (Admin)
 */
router.post('/ml/train', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const { tokenPair } = req.body;

    if (!tokenPair) {
      return res.status(400).json({ error: 'tokenPair required' });
    }

    const result = await mlModels.trainModel(tokenPair);

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[ML Train] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Training failed',
      service: error.service
    });
  }
}));

// ============================================================================
// NLP TRANSLATION SERVICE ROUTES
// ============================================================================

/**
 * @route   POST /api/python/nlp/translate
 * @desc    Translate text to target language
 * @body    {text, targetLanguage, sourceLanguage}
 * @access  Public
 */
router.post('/nlp/translate', asyncHandler(async (req, res) => {
  try {
    const {
      text,
      targetLanguage,
      sourceLanguage = 'auto'
    } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({
        error: 'Missing required fields: text and targetLanguage'
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        error: 'Text too long (max 5000 characters)'
      });
    }

    const result = await nlpTranslation.translate(
      text,
      targetLanguage,
      sourceLanguage
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[NLP Translate] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Translation failed',
      service: error.service
    });
  }
}));

/**
 * @route   POST /api/python/nlp/detect-language
 * @desc    Detect language of given text
 * @body    {text}
 * @access  Public
 */
router.post('/nlp/detect-language', asyncHandler(async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text required' });
    }

    const result = await nlpTranslation.detectLanguage(text);

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[NLP Detect] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Language detection failed',
      service: error.service
    });
  }
}));

/**
 * @route   POST /api/python/nlp/translate-batch
 * @desc    Translate multiple texts in batch
 * @body    {texts: [], targetLanguage, sourceLanguage}
 * @access  Public
 */
router.post('/nlp/translate-batch', asyncHandler(async (req, res) => {
  try {
    const {
      texts,
      targetLanguage,
      sourceLanguage = 'auto'
    } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({
        error: 'texts must be a non-empty array'
      });
    }

    if (texts.length > 100) {
      return res.status(400).json({
        error: 'Maximum 100 texts per batch'
      });
    }

    if (!targetLanguage) {
      return res.status(400).json({
        error: 'targetLanguage required'
      });
    }

    const result = await nlpTranslation.translateBatch(
      texts,
      targetLanguage,
      sourceLanguage
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[NLP Batch Translate] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Batch translation failed',
      service: error.service
    });
  }
}));

/**
 * @route   GET /api/python/nlp/supported-languages
 * @desc    Get list of supported languages
 * @access  Public
 */
router.get('/nlp/supported-languages', asyncHandler(async (req, res) => {
  try {
    const result = await nlpTranslation.getSupportedLanguages();

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[NLP Languages] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch supported languages',
      service: error.service
    });
  }
}));

// ============================================================================
// FRAUD DETECTION SERVICE ROUTES
// ============================================================================

/**
 * @route   POST /api/python/fraud/assess-risk
 * @desc    Assess fraud risk for transaction
 * @body    {transaction, userHistory, options}
 * @access  Private
 */
router.post('/fraud/assess-risk', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const {
      transaction,
      userHistory = null,
      options = {}
    } = req.body;

    if (!transaction) {
      return res.status(400).json({ error: 'transaction object required' });
    }

    // Validate transaction structure
    const requiredFields = ['txHash', 'fromAddress', 'toAddress', 'amount'];
    const missingFields = requiredFields.filter(field => !transaction[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required transaction fields: ${missingFields.join(', ')}`
      });
    }

    const assessment = await fraudDetection.assessRisk(
      transaction,
      userHistory,
      options
    );

    res.json({
      success: true,
      data: assessment,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[Fraud Assessment] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Risk assessment failed',
      service: error.service
    });
  }
}));

// ============================================================================
// DATA PROCESSING SERVICE ROUTES
// ============================================================================

/**
 * @route   POST /api/python/data/validate-blockchain-event
 * @desc    Validate blockchain event
 * @body    {event}
 * @access  Private
 */
router.post('/data/validate-blockchain-event', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const { event } = req.body;

    if (!event) {
      return res.status(400).json({ error: 'event object required' });
    }

    const result = await dataProcessing.validateBlockchainEvent(event);

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[Data Validation] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Validation failed',
      service: error.service
    });
  }
}));

/**
 * @route   POST /api/python/data/validate-market-data
 * @desc    Validate market data point
 * @body    {data}
 * @access  Private
 */
router.post('/data/validate-market-data', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'data object required' });
    }

    const result = await dataProcessing.validateMarketData(data);

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[Market Data Validation] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Validation failed',
      service: error.service
    });
  }
}));

/**
 * @route   POST /api/python/data/process-event-stream
 * @desc    Process stream of blockchain events
 * @body    {events}
 * @access  Private
 */
router.post('/data/process-event-stream', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        error: 'events must be a non-empty array'
      });
    }

    if (events.length > 1000) {
      return res.status(400).json({
        error: 'Maximum 1000 events per stream'
      });
    }

    const result = await dataProcessing.processEventStream(events);

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[Event Stream Processing] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Stream processing failed',
      service: error.service
    });
  }
}));

/**
 * @route   GET /api/python/data/aggregate-market-data
 * @desc    Aggregate market data for token pair
 * @query   {tokenPair, period}
 * @access  Private
 */
router.get('/data/aggregate-market-data', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const {
      tokenPair,
      period = '1h'
    } = req.query;

    if (!tokenPair) {
      return res.status(400).json({ error: 'tokenPair required' });
    }

    const validPeriods = ['1m', '5m', '15m', '1h', '4h', '1d'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        error: `Invalid period. Must be one of: ${validPeriods.join(', ')}`
      });
    }

    const result = await dataProcessing.aggregateMarketData(tokenPair, period);

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[Market Data Aggregation] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Aggregation failed',
      service: error.service
    });
  }
}));

// ============================================================================
// BLOCKCHAIN INTELLIGENCE SERVICE ROUTES
// ============================================================================

/**
 * @route   POST /api/python/blockchain/analyze-contract
 * @desc    Analyze smart contract for vulnerabilities
 * @body    {address}
 * @access  Private
 */
router.post('/blockchain/analyze-contract', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'contract address required' });
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        error: 'Invalid Ethereum address format'
      });
    }

    const analysis = await blockchainIntelligence.analyzeContract(address);

    res.json({
      success: true,
      data: analysis,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[Contract Analysis] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Contract analysis failed',
      service: error.service
    });
  }
}));

/**
 * @route   POST /api/python/blockchain/detect-mev
 * @desc    Detect MEV opportunities
 * @body    {targetTx, surroundingTxs}
 * @access  Private
 */
router.post('/blockchain/detect-mev', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const { targetTx, surroundingTxs } = req.body;

    if (!targetTx || !Array.isArray(surroundingTxs)) {
      return res.status(400).json({
        error: 'targetTx object and surroundingTxs array required'
      });
    }

    const opportunities = await blockchainIntelligence.detectMEV(
      targetTx,
      surroundingTxs
    );

    res.json({
      success: true,
      data: opportunities,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[MEV Detection] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'MEV detection failed',
      service: error.service
    });
  }
}));

/**
 * @route   POST /api/python/blockchain/analyze-wallet-cluster
 * @desc    Analyze network of related wallets
 * @body    {walletAddresses}
 * @access  Private
 */
router.post('/blockchain/analyze-wallet-cluster', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const { walletAddresses } = req.body;

    if (!Array.isArray(walletAddresses) || walletAddresses.length === 0) {
      return res.status(400).json({
        error: 'walletAddresses must be a non-empty array'
      });
    }

    if (walletAddresses.length > 100) {
      return res.status(400).json({
        error: 'Maximum 100 wallet addresses per request'
      });
    }

    const analysis = await blockchainIntelligence.analyzeWalletCluster(
      walletAddresses
    );

    res.json({
      success: true,
      data: analysis,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[Wallet Cluster Analysis] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Wallet analysis failed',
      service: error.service
    });
  }
}));

/**
 * @route   GET /api/python/blockchain/transaction-graph
 * @desc    Get transaction flow graph for token pair
 * @query   {tokenPair, limit}
 * @access  Private
 */
router.get('/blockchain/transaction-graph', authMiddleware.requireAuth(), asyncHandler(async (req, res) => {
  try {
    const {
      tokenPair,
      limit = 100
    } = req.query;

    if (!tokenPair) {
      return res.status(400).json({ error: 'tokenPair required' });
    }

    const limitNum = Math.min(parseInt(limit) || 100, 1000);

    const graph = await blockchainIntelligence.getTransactionGraph(
      tokenPair,
      limitNum
    );

    res.json({
      success: true,
      data: graph,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('[Transaction Graph] Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Graph generation failed',
      service: error.service
    });
  }
}));

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * 404 handler for undefined Python service routes
 */
router.use((req, res) => {
  res.status(404).json({
    error: 'Python service endpoint not found',
    path: req.path,
    method: req.method
  });
});

module.exports = router;
