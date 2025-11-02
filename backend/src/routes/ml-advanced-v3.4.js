/**
 * Advanced ML & AI Services Routes for Soba DEX v3.4.0
 * Enhanced with NLP Trading, Advanced Analytics, and Security Analysis
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { isEnabled } = require('../config/features');

// Import ML services
let nlpTradingService, advancedAnalyticsService, securityRiskAnalysisService;

if (isEnabled('nlpTrading')) {
  nlpTradingService = require('../ml/nlpTradingService');
}

if (isEnabled('advancedAnalytics')) {
  advancedAnalyticsService = require('../ml/advancedAnalyticsService');
}

if (isEnabled('securityAnalysis')) {
  securityRiskAnalysisService = require('../ml/securityRiskAnalysisService');
}

// ============================================================================
// NLP Trading Routes
// ============================================================================

if (isEnabled('nlpTrading')) {
  /**
   * POST /api/ml/nlp/process-command
   * Process natural language trading commands
   */
  router.post('/nlp/process-command', asyncHandler(async (req, res) => {
    const { text, userId, context } = req.body;

    if (!text || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Text and userId are required'
      });
    }

    const result = await nlpTradingService.processCommand(text, userId, context);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/nlp/supported-languages
   * Get list of supported languages for NLP processing
   */
  router.get('/nlp/supported-languages', asyncHandler(async (req, res) => {
    const languages = [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'it', name: 'Italian', nativeName: 'Italiano' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' }
    ];

    res.json({
      success: true,
      data: languages,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/nlp/trading-context/:userId
   * Get user's trading context history
   */
  router.get('/nlp/trading-context/:userId', asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // In a real implementation, this would retrieve from database
    const context = []; // Mock context data

    res.json({
      success: true,
      data: context,
      timestamp: new Date().toISOString()
    });
  }));
}

// ============================================================================
// Advanced Analytics Routes
// ============================================================================

if (isEnabled('advancedAnalytics')) {
  /**
   * GET /api/ml/analytics/market-overview
   * Get comprehensive market overview
   */
  router.get('/analytics/market-overview', asyncHandler(async (req, res) => {
    const tokens = req.query.tokens ? req.query.tokens.split(',') : [];
    const timeframes = req.query.timeframes ? req.query.timeframes.split(',') : ['1h', '24h', '7d'];

    const analytics = await advancedAnalyticsService.getMarketAnalytics(tokens, timeframes);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/analytics/token/:symbol
   * Get detailed analytics for a specific token
   */
  router.get('/analytics/token/:symbol', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const timeframes = req.query.timeframes ? req.query.timeframes.split(',') : ['1h', '24h', '7d'];

    const analytics = await advancedAnalyticsService.getTokenAnalytics(symbol.toUpperCase(), timeframes);

    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: `Analytics not found for token: ${symbol}`
      });
    }

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/analytics/trading-signals
   * Get AI-powered trading signals
   */
  router.get('/analytics/trading-signals', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const minConfidence = parseFloat(req.query.minConfidence) || 0.5;

    const signals = await advancedAnalyticsService.getTradingSignals();
    const filteredSignals = signals
      .filter(signal => signal.confidence >= minConfidence)
      .slice(0, limit);

    res.json({
      success: true,
      data: filteredSignals,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/analytics/social-metrics
   * Get social media metrics and sentiment
   */
  router.get('/analytics/social-metrics', asyncHandler(async (req, res) => {
    const tokens = req.query.tokens ? req.query.tokens.split(',') : [];

    const metrics = await advancedAnalyticsService.getSocialMetrics();

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/analytics/whale-activity
   * Get whale tracking data
   */
  router.get('/analytics/whale-activity', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;

    const whaleActivity = await advancedAnalyticsService.getWhaleActivity();

    res.json({
      success: true,
      data: {
        ...whaleActivity,
        recentTransactions: whaleActivity.recentTransactions.slice(0, limit)
      },
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/analytics/kol-insights
   * Get KOL (Key Opinion Leader) insights
   */
  router.get('/analytics/kol-insights', asyncHandler(async (req, res) => {
    const kolInsights = await advancedAnalyticsService.getKOLInsights();

    if (!kolInsights) {
      return res.status(404).json({
        success: false,
        error: 'KOL tracking not enabled'
      });
    }

    res.json({
      success: true,
      data: kolInsights,
      timestamp: new Date().toISOString()
    });
  }));
}

// ============================================================================
// Security Analysis Routes
// ============================================================================

if (isEnabled('securityAnalysis')) {
  /**
   * POST /api/ml/security/analyze-token
   * Analyze token for security risks
   */
  router.post('/security/analyze-token', asyncHandler(async (req, res) => {
    const { contractAddress, chain = 'ethereum' } = req.body;

    if (!contractAddress) {
      return res.status(400).json({
        success: false,
        error: 'Contract address is required'
      });
    }

    const analysis = await securityRiskAnalysisService.analyzeTokenSecurity(contractAddress, chain);

    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/security/risk-score/:contractAddress
   * Get cached risk score for a contract
   */
  router.get('/security/risk-score/:contractAddress', asyncHandler(async (req, res) => {
    const { contractAddress } = req.params;
    const chain = req.query.chain || 'ethereum';

    // In a real implementation, this would retrieve from cache/database
    const cachedScore = null; // Mock - would be retrieved from database

    if (!cachedScore) {
      return res.status(404).json({
        success: false,
        error: 'Risk score not found. Please run analysis first.'
      });
    }

    res.json({
      success: true,
      data: cachedScore,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/security/vulnerability-database
   * Get known vulnerability patterns
   */
  router.get('/security/vulnerability-database', asyncHandler(async (req, res) => {
    const vulnerabilities = [
      {
        id: 'reentrancy',
        name: 'Reentrancy',
        severity: 'high',
        description: 'Attacker can repeatedly call a function to drain funds'
      },
      {
        id: 'overflow',
        name: 'Integer Overflow',
        severity: 'medium',
        description: 'Arithmetic overflow can lead to unexpected behavior'
      },
      {
        id: 'honeypot',
        name: 'Honeypot',
        severity: 'high',
        description: 'Contract designed to trap users and steal funds'
      }
    ];

    res.json({
      success: true,
      data: vulnerabilities,
      timestamp: new Date().toISOString()
    });
  }));

  /**
   * GET /api/ml/security/scan-results
   * Get recent security scan results
   */
  router.get('/security/scan-results', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    // Mock scan results
    const scanResults = [];

    res.json({
      success: true,
      data: scanResults,
      timestamp: new Date().toISOString()
    });
  }));
}

// ============================================================================
// Health Check and Status Routes
// ============================================================================

/**
 * GET /api/ml/status
 * Get status of all ML services
 */
router.get('/status', asyncHandler(async (req, res) => {
  const status = {
    nlpTrading: {
      enabled: isEnabled('nlpTrading'),
      initialized: nlpTradingService?.isInitialized || false
    },
    advancedAnalytics: {
      enabled: isEnabled('advancedAnalytics'),
      initialized: advancedAnalyticsService?.isInitialized || false
    },
    securityAnalysis: {
      enabled: isEnabled('securityAnalysis'),
      initialized: securityRiskAnalysisService?.isInitialized || false
    },
    timestamp: new Date().toISOString()
  };

  res.json({
    success: true,
    data: status
  });
}));

/**
 * POST /api/ml/initialize-services
 * Initialize all enabled ML services
 */
router.post('/initialize-services', asyncHandler(async (req, res) => {
  const results = {};

  if (isEnabled('nlpTrading') && !nlpTradingService?.isInitialized) {
    try {
      await nlpTradingService.initialize();
      results.nlpTrading = { success: true, message: 'NLP Trading Service initialized' };
    } catch (error) {
      results.nlpTrading = { success: false, error: error.message };
    }
  }

  if (isEnabled('advancedAnalytics') && !advancedAnalyticsService?.isInitialized) {
    try {
      await advancedAnalyticsService.initialize();
      results.advancedAnalytics = { success: true, message: 'Advanced Analytics Service initialized' };
    } catch (error) {
      results.advancedAnalytics = { success: false, error: error.message };
    }
  }

  if (isEnabled('securityAnalysis') && !securityRiskAnalysisService?.isInitialized) {
    try {
      await securityRiskAnalysisService.initialize();
      results.securityAnalysis = { success: true, message: 'Security Analysis Service initialized' };
    } catch (error) {
      results.securityAnalysis = { success: false, error: error.message };
    }
  }

  res.json({
    success: true,
    data: results,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
