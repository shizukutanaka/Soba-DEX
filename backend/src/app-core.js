/**
 * DEX Application Core Configuration
 * Centralized application setup and configuration
 */

const express = require('express');
const compression = require('compression');

// Application configuration
const { config } = require('./config/appConfig');

// Consolidated middleware
const { corsMiddleware, allowedOrigins } = require('./middleware/cors');
const { errorHandler, notFoundHandler, setupGlobalHandlers, asyncHandler } = require('./middleware/errorHandler');
const { logger } = require('./utils/productionLogger');
const { securityService } = require('./middleware/security');
const { cacheMiddleware } = require('./middleware/cache');
const { validatePagination } = require('./middleware/validation');
const tokenRegistry = require('./services/tokenRegistry');
const dexState = require('./services/dexState');
const { requestContext } = require('./middleware/requestContext');

// Feature management
const { isEnabled } = require('./config/features');

// Advanced middleware (Round 18)
const requestValidator = require('./middleware/requestValidator');
const responseCompression = require('./middleware/responseCompression');
const healthMonitor = require('./middleware/healthMonitor');

// Ultimate middleware (Round 19)
const advancedCache = require('./middleware/advancedCache');
const { autoRetry } = require('./middleware/autoRetry');

// Final utilities (Round 20)
const { responseFormatter } = require('./utils/responseFormatter');
const { i18n } = require('./utils/i18n');

// Industry-standard utilities (Round 21)
const { problemDetails } = require('./utils/problemDetails');
const { deduplicationMiddleware } = require('./middleware/deduplication');

// Import error tracking system
const { errorTrackingSystem } = require('./services/errorTrackingService');

// Import intelligent rate limiting service
const { intelligentRateLimitService } = require('./services/intelligentRateLimitService');

// DeFi features (Round 24)
let smartOrderRouter, impermanentLossProtection;
if (isEnabled('smartOrderRouter')) {
  smartOrderRouter = require('./services/smartOrderRouter');
}
if (isEnabled('impermanentLossProtection')) {
  impermanentLossProtection = require('./services/impermanentLossProtection');
}

// Advanced security (Round 28)
const { zeroTrustAuthMiddleware, riskBasedAccessControl, deviceVerificationMiddleware } = require('./middleware/zeroTrustAuth');

// Advanced trading features (Round 26)
let limitOrderBook, aiTradingOptimizer;
if (isEnabled('limitOrderBook')) {
  limitOrderBook = require('./services/limitOrderBook');
}
if (isEnabled('aiTradingOptimizer')) {
  aiTradingOptimizer = require('./services/aiTradingOptimizer');
}

// DAO and Staking features (Round 27)
let daoGovernance, stakingRewards;
if (isEnabled('daoGovernance')) {
  daoGovernance = require('./governance/daoGovernance');
}
if (isEnabled('stakingRewards')) {
  stakingRewards = require('./services/stakingRewards');
}

// Advanced ML & AI Services (v3.4.0)
let mlAnomalyDetection, predictiveScaling, abTesting, behaviorAnalytics, autoTuning;
if (isEnabled('mlAnomalyDetection')) {
  mlAnomalyDetection = require('./ml/mlModelManager');
}
if (isEnabled('predictiveScaling')) {
  predictiveScaling = require('./ml/mlModelManager');
}
if (isEnabled('abTesting')) {
  abTesting = require('./ml/mlModelManager');
}
if (isEnabled('behaviorAnalytics')) {
  behaviorAnalytics = require('./ml/mlModelManager');
}
if (isEnabled('autoTuning')) {
  autoTuning = require('./ml/mlModelManager');
}

// Advanced AI & ML Services (v4.0.0) - Wrap in feature flags to prevent loading missing modules
let advancedNLP, advancedComputerVision, realTimeAIPrediction, reinforcementLearning;
if (isEnabled('advancedNLP')) {
  advancedNLP = require('./services/advancedNLPService');
}
if (isEnabled('advancedComputerVision')) {
  advancedComputerVision = require('./services/advancedComputerVisionService');
}
if (isEnabled('realTimeAIPrediction')) {
  realTimeAIPrediction = require('./services/realTimeAIPredictionService');
}
if (isEnabled('reinforcementLearning')) {
  reinforcementLearning = require('./services/reinforcementLearningService');
}

// Advanced Blockchain & DeFi Services (v4.0.0)
let advancedCrossChainBridge;
if (isEnabled('advancedCrossChainBridge')) {
  advancedCrossChainBridge = require('./services/advancedCrossChainBridge');
}

// Analytics and Compliance (Round 28)
let analyticsEngine, kycCompliance;
if (isEnabled('analyticsEngine')) {
  analyticsEngine = require('./services/analyticsEngine');
}
if (isEnabled('kycCompliance')) {
  kycCompliance = require('./compliance/kycCompliance');
}

// Advanced DeFi features (Round 29)
let crossChainBridge, intentBasedTrading, dexAggregator, blobTransactions;
if (isEnabled('crossChainBridge')) {
  crossChainBridge = require('./bridges/crossChainBridge');
}
if (isEnabled('intentBasedTrading')) {
  intentBasedTrading = require('./services/intentBasedTrading');
}
if (isEnabled('dexAggregator')) {
  dexAggregator = require('./services/dexAggregator');
}
if (isEnabled('blobTransactions')) {
  blobTransactions = require('./services/blobTransactions');
}

// 2025 DeFi Infrastructure (Round 30)
let yieldVault, rwaTokenization, perpetualFutures;
if (isEnabled('yieldVault')) {
  yieldVault = require('./services/yieldVault');
}
if (isEnabled('rwaTokenization')) {
  rwaTokenization = require('./services/rwaTokenization');
}
if (isEnabled('perpetualFutures')) {
  perpetualFutures = require('./services/perpetualFutures');
}

// Advanced 2025 DeFi Standards (Round 31)
let uniswapV4Hooks, eip7702Delegation, liquidStaking, mevProtection;
if (isEnabled('uniswapV4Hooks')) {
  uniswapV4Hooks = require('./services/uniswapV4Hooks');
}
if (isEnabled('eip7702Delegation')) {
  eip7702Delegation = require('./services/eip7702Delegation');
}
if (isEnabled('liquidStaking')) {
  liquidStaking = require('./services/liquidStaking');
}
if (isEnabled('mevProtection')) {
  mevProtection = require('./services/mevProtection');
}

class DEXApplication {
  constructor() {
    this.app = null;
    this.server = null;
    this.config = this.loadConfiguration();
  }

  loadConfiguration() {
    const NODE_ENV = config.get('NODE_ENV', 'development');
    const DEFAULT_RATE_LIMIT_WINDOW_MS = config.get('RATE_LIMIT_WINDOW_MS', 60000);
    const DEFAULT_BODY_LIMIT_BYTES = config.get('REQUEST_BODY_LIMIT_BYTES', 100 * 1024); // 100KB

    return {
      nodeEnv: NODE_ENV,
      rateLimitWindowMs: this.resolvePositiveInteger(
        config.get('RATE_LIMIT_WINDOW_MS'),
        DEFAULT_RATE_LIMIT_WINDOW_MS,
        { min: 1000, max: 3600000, settingName: 'RATE_LIMIT_WINDOW_MS' }
      ),
      rateLimitMax: this.resolvePositiveInteger(
        config.get('RATE_LIMIT_MAX'),
        100,
        { min: 1, max: 10000, settingName: 'RATE_LIMIT_MAX' }
      ),
      bodyLimitBytes: this.resolvePositiveInteger(
        config.get('REQUEST_BODY_LIMIT_BYTES'),
        DEFAULT_BODY_LIMIT_BYTES,
        { min: 1024, max: 1024 * 1024, settingName: 'REQUEST_BODY_LIMIT_BYTES' }
      ),
      enforceHttps: this.resolveBoolean(config.get('ENFORCE_HTTPS'), NODE_ENV === 'production'),
      requestContextOptions: {
        trustHeader: this.resolveBoolean(config.get('REQUEST_ID_TRUST_HEADER'), NODE_ENV !== 'production'),
        headerName: config.get('X_REQUEST_ID_HEADER', 'X-Request-ID')
      }
    };
  }

  resolveBoolean(value, defaultValue = true) {
    if (value === undefined) {
      return defaultValue;
    }
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
    return defaultValue;
  }

  resolvePositiveInteger(value, fallback, {
    min = 1,
    max = Number.MAX_SAFE_INTEGER,
    settingName
  } = {}) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      if (settingName) {
        logger.warn(`${settingName} must be an integer. Using fallback ${fallback}.`);
      }
      return fallback;
    }

    if (parsed < min) {
      if (settingName) {
        logger.warn(`${settingName} below minimum ${min}. Using minimum ${min}.`);
      }
      return min;
    }

    if (parsed > max) {
      if (settingName) {
        logger.warn(`${settingName} above maximum ${max}. Using maximum ${max}.`);
      }
      return max;
    }

    return parsed;
  }

  initialize() {
    // Initialize app
    this.app = express();
    this.app.disable('x-powered-by');

    // Setup global error handlers
    setupGlobalHandlers();

    // Trust proxy (for production behind nginx/load balancer)
    this.app.set('trust proxy', 1);

    return this.app;
  }

  setupSecurity() {
    // HTTPS enforcement
    if (this.config.enforceHttps) {
      this.app.use((req, res, next) => {
        const forwardedProto = req.headers['x-forwarded-proto'];
        const isSecure = req.secure || (typeof forwardedProto === 'string' && forwardedProto.split(',')[0].trim().toLowerCase() === 'https');

        if (isSecure) {
          return next();
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
          const host = req.headers.host;
          if (host) {
            return res.redirect(301, `https://${host}${req.originalUrl}`);
          }
        }

        res.status(403).json({
          success: false,
          error: 'HTTPS required',
          code: 'HTTPS_REQUIRED'
        });
      });
    }

    // Security middleware
    this.app.use(securityService.helmetMiddleware());
    this.app.use(securityService.securityHeaders());
    this.app.use(securityService.ipBlocker());
    this.app.use(securityService.sanitizeInput());

    // Advanced security validation (Round 18)
    this.app.use(requestValidator.middleware());

    // OpenTelemetry tracing middleware (v3.0.0)
    if (process.env.OTEL_ENABLED !== 'false') {
      const { tracingMiddleware } = require('./middleware/tracingMiddleware');
      this.app.use(tracingMiddleware({
        includeQueryParams: true,
        includeRequestHeaders: false,
        includeResponseHeaders: false,
      }));
    }

    // Prometheus metrics middleware (v2.9.0)
    if (process.env.PROMETHEUS_ENABLED !== 'false') {
      const { metricsMiddleware } = require('./middleware/metricsMiddleware');
      this.app.use(metricsMiddleware());
    }
  }

  setupPerformance() {
    // Compression
    this.app.use(compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      }
    }));

    // Body parsing with size limits
    this.app.use(express.json({ limit: this.config.bodyLimitBytes }));
    this.app.use(express.urlencoded({ extended: true, limit: this.config.bodyLimitBytes }));

    // Default cache-control headers (can be overridden by later middleware)
    this.app.use((req, res, next) => {
      if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
      if (!res.getHeader('Pragma')) {
        res.setHeader('Pragma', 'no-cache');
      }
      next();
    });
  }

  setupMonitoring() {
    // Request-scoped context and correlation IDs
    this.app.use(requestContext(this.config.requestContextOptions));

    if (this.config.nodeEnv === 'production' && this.config.requestContextOptions.trustHeader) {
      logger.warn('Request ID header trust is enabled in production. Ensure upstream proxies sanitize request headers.');
    }

    // CORS
    this.app.use(corsMiddleware);

    // Advanced Rate Limiting with Token Bucket (Round 22)
    // Multi-level: User/IP/APIKey based, エンドポイント別コスト
    this.app.use(advancedRateLimiter.middleware({
      enabled: true,
      skipPaths: ['/health', '/metrics', '/auth']
    }));

    // Request logging and health monitoring (Round 18)
    this.app.use(healthMonitor.middleware());
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.logRequest(req, res, duration);
      });
      next();
    });

    // Advanced response compression (Round 18)
    this.app.use(responseCompression.middleware());

    // Ultimate performance optimization (Round 19)
    this.app.use(advancedCache.middleware());
    this.app.use(autoRetry.middleware());

    // Response formatting and i18n (Round 20)
    this.app.use(responseFormatter.middleware());
    this.app.use(i18n.middleware());

    // Industry-standard error handling and deduplication (Round 21)
    this.app.use(problemDetails.middleware());
    this.app.use(deduplicationMiddleware.middleware({
      enabled: true,
      ttl: 300000, // 5分間
      methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
      excludePaths: ['/health', '/metrics']
    }));
  }

  setupRoutes() {
    // Health check routes (no auth required)
    this.app.use('/health', require('./routes/health'));

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Soba DEX API',
        status: 'running',
        timestamp: timestampUtils.now(),
        environment: this.config.nodeEnv,
        endpoints: {
          health: {
            overview: '/health',
            detailed: '/health/detailed',
            readiness: '/health/ready',
            liveness: '/health/live'
          },
          api: {
            index: '/api',
            swap: {
              quote: '/api/swap/quote',
              execute: '/api/swap/execute',
              route: '/api/swap/route',
              routerStats: '/api/swap/router-stats',
              securityStats: '/api/swap/security-stats'
            },
            dex: {
              index: '/api/dex',
              pools: '/api/dex/pools',
              pool: '/api/dex/pool/:poolId',
              recentSwaps: '/api/dex/swaps/recent',
              swapStats: '/api/dex/swaps/stats'
            },
            tokens: {
              index: '/api/tokens',
              list: '/api/tokens/list'
            },
            liquidity: {
              protect: '/api/liquidity/protect',
              analyze: '/api/liquidity/analyze/:positionId',
              claim: '/api/liquidity/claim/:positionId',
              userPositions: '/api/liquidity/user/:userId',
              stats: '/api/liquidity/stats'
            }
          },
          metrics: {
            dexState: '/metrics/dex-state'
          }
        },
        rateLimit: {
          windowMs: this.config.rateLimitWindowMs,
          maxRequests: this.config.rateLimitMax
        },
        cors: {
          allowedOrigins
        },
        security: {
          enforceHttps: this.config.enforceHttps
        }
      });
    });

    // API index endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        services: {
          swap: {
            quote: '/api/swap/quote',
            execute: '/api/swap/execute',
            route: '/api/swap/route',
            routerStats: '/api/swap/router-stats',
            securityStats: '/api/swap/security-stats'
          },
          dex: {
            index: '/api/dex',
            pools: '/api/dex/pools',
            pool: '/api/dex/pool/:poolId',
            recentSwaps: '/api/dex/swaps/recent',
            swapStats: '/api/dex/swaps/stats'
          },
          tokens: {
            index: '/api/tokens',
            list: '/api/tokens/list'
          },
          liquidity: {
            protect: '/api/liquidity/protect',
            analyze: '/api/liquidity/analyze/:positionId',
            claim: '/api/liquidity/claim/:positionId',
            userPositions: '/api/liquidity/user/:userId',
            stats: '/api/liquidity/stats'
          },
          metrics: {
            dexState: '/metrics/dex-state'
          }
        },
        health: {
          overview: '/health',
          detailed: '/health/detailed',
          readiness: '/health/ready',
          liveness: '/health/live'
        },
        metadata: {
          rateLimit: {
            windowMs: this.config.rateLimitWindowMs,
            maxRequests: this.config.rateLimitMax
          },
          cors: {
            allowedOrigins
          },
          security: {
            enforceHttps: this.config.enforceHttps
          }
        }
      });
    });
  }

  setupAdvancedFeatures() {
    // Zero Trust Authentication Middleware for protected routes
    const protectedRoutes = ['/api/dex', '/api/swap', '/api/portfolio', '/api/transactions'];

    protectedRoutes.forEach(route => {
      this.app.use(route, zeroTrustAuthMiddleware);
    });

    // Risk-based access control for high-value operations
    this.app.use('/api/swap/execute', riskBasedAccessControl('low'));
    this.app.use('/api/portfolio/withdraw', riskBasedAccessControl('low'));
    this.app.use('/api/transactions/create', riskBasedAccessControl('medium'));

    // Advanced Security Middleware
    const { advancedSlippageProtection } = require('./security/advancedSlippageProtection');
    this.app.use(advancedSlippageProtection.middleware());

    // API Routes (core functionality only)
    // DEX trading routes
    const dexRoutes = require('./routes/dex.simple');
    this.app.use('/api/dex', dexRoutes);

    // Swap routes with MEV protection
    const swapRoutes = require('./routes/swap');
    this.app.use('/api/swap', swapRoutes);

    // Token routes
    const tokenRoutes = require('./routes/tokens.simple');
    this.app.use('/api/tokens', tokenRoutes);

    // Python ML Services Routes
    const pythonServices = require('./routes/pythonServices');
    this.app.use('/api/python', pythonServices);

    // Advanced 2025 Features Routes
    const advancedFeaturesRoutes = require('./routes/advanced-features');
    this.app.use('/api/v1/advanced', advancedFeaturesRoutes);

    // Price routes for real-time price data
    const priceRoutes = require('./routes/prices');
    this.app.use('/api/prices', priceRoutes);

    // Transaction history routes
    const transactionRoutes = require('./routes/transactions');
    this.app.use('/api/transactions', transactionRoutes);

    // Gas optimization routes
    const gasRoutes = require('./routes/gas');
    this.app.use('/api/gas', gasRoutes);

    // Portfolio tracking routes
    const portfolioRoutes = require('./routes/portfolio');
    this.app.use('/api/portfolio', portfolioRoutes);

    // WebSocket routes (v2.8.0)
    const websocketRoutes = require('./routes/websocket');
    this.app.use('/api/websocket', websocketRoutes);

    // Metrics routes (v2.9.0)
    const metricsRoutes = require('./routes/metrics');
    this.app.use('/metrics', metricsRoutes);

    // Tracing routes (v3.0.0)
    const tracingRoutes = require('./routes/tracing');
    this.app.use('/api/tracing', tracingRoutes);

    // Analytics routes (v3.1.0)
    const analyticsRoutes = require('./routes/analytics');
    this.app.use('/api/analytics', analyticsRoutes);
    this.app.use('/api', analyticsRoutes); // For /api/slo, /api/alerts, /api/baselines

    // RUM routes (v3.2.0)
    const rumRoutes = require('./routes/rum');
    this.app.use('/api/rum', rumRoutes);

    // ML & Analytics routes (v3.4.0)
    const mlRoutes = require('./routes/ml');
    this.app.use('/api/ml', mlRoutes);

    // Advanced ML v3.4 routes
    const mlV34Routes = require('./routes/ml-v3.4');
    this.app.use('/api/ml/v3.4', mlV34Routes);

    // ML Model Management routes (v3.5.0)
    const mlManagementRoutes = require('./routes/mlManagement');
    this.app.use('/api/ml-management', mlManagementRoutes);

    // ML Monitoring & Explainability routes (v3.6.0)
    const mlMonitoringRoutes = require('./routes/mlMonitoring');
    this.app.use('/api/ml-monitoring', mlMonitoringRoutes);

    // ML Visualization, Automation & Reporting routes (v3.7.0)
    const mlVisualizationRoutes = require('./routes/mlVisualizationRoutes');
    this.app.use('/api/ml-visualization', mlVisualizationRoutes);

    const mlPipelineRoutes = require('./routes/mlPipelineRoutes');
    this.app.use('/api/ml-pipeline', mlPipelineRoutes);

    const mlReportingRoutes = require('./routes/mlReportingRoutes');
    this.app.use('/api/ml-reports', mlReportingRoutes);

    // Advanced Features routes (v3.8.0) - Analytics, Streaming, Alerts, Ensembles
    const advancedFeaturesRoutes = require('./routes/advancedFeatures');
    this.app.use('/api', advancedFeaturesRoutes);

    // Advanced AI & ML Services (v4.0.0)
    const aiRoutes = require('./routes/ai');
    this.app.use('/api/ai', aiRoutes);

    // NLP Service endpoints
    this.app.post('/api/ai/nlp/sentiment', asyncHandler(async (req, res) => {
      const { text, context } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const result = await advancedNLP.analyzeSentiment(text, context);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/nlp/classify', asyncHandler(async (req, res) => {
      const { text, categories } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const result = await advancedNLP.classifyText(text, categories);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/nlp/entities', asyncHandler(async (req, res) => {
      const { text, entityTypes } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const result = await advancedNLP.extractEntities(text, entityTypes);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/nlp/translate', asyncHandler(async (req, res) => {
      const { text, fromLang, toLang } = req.body;
      if (!text || !fromLang || !toLang) {
        return res.status(400).json({ error: 'Text, fromLang, and toLang are required' });
      }

      const result = await advancedNLP.translateText(text, fromLang, toLang);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/nlp/summarize', asyncHandler(async (req, res) => {
      const { text, maxLength } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const result = await advancedNLP.summarizeText(text, maxLength);
      res.json({ success: true, data: result });
    }));

    // Computer Vision Service endpoints
    this.app.post('/api/ai/vision/analyze-chart', asyncHandler(async (req, res) => {
      const { imageData, options } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      const result = await advancedComputerVision.analyzeChart(imageData, options);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/vision/recognize-patterns', asyncHandler(async (req, res) => {
      const { imageData, patternTypes } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      const result = await advancedComputerVision.recognizePatterns(imageData, patternTypes);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/vision/extract-text', asyncHandler(async (req, res) => {
      const { imageData, options } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      const result = await advancedComputerVision.extractText(imageData, options);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/vision/detect-anomalies', asyncHandler(async (req, res) => {
      const { imageData, baselineImage } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      const result = await advancedComputerVision.detectAnomalies(imageData, baselineImage);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/vision/classify', asyncHandler(async (req, res) => {
      const { imageData, categories } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      const result = await advancedComputerVision.classifyImage(imageData, categories);
      res.json({ success: true, data: result });
    }));

    // Real-time AI Prediction endpoints
    this.app.post('/api/ai/predictions/price', asyncHandler(async (req, res) => {
      const { symbol, timeframe, horizon } = req.body;
      if (!symbol) {
        return res.status(400).json({ error: 'Symbol is required' });
      }

      const result = await realTimeAIPrediction.predictPrice(symbol, timeframe, horizon);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/predictions/signals', asyncHandler(async (req, res) => {
      const { symbol, strategy } = req.body;
      if (!symbol) {
        return res.status(400).json({ error: 'Symbol is required' });
      }

      const result = await realTimeAIPrediction.generateSignals(symbol, strategy);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/predictions/portfolio-risk', asyncHandler(async (req, res) => {
      const { portfolio } = req.body;
      if (!portfolio) {
        return res.status(400).json({ error: 'Portfolio is required' });
      }

      const result = await realTimeAIPrediction.assessPortfolioRisk(portfolio);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/predictions/portfolio-optimize', asyncHandler(async (req, res) => {
      const { portfolio, constraints } = req.body;
      if (!portfolio) {
        return res.status(400).json({ error: 'Portfolio is required' });
      }

      const result = await realTimeAIPrediction.optimizePortfolio(portfolio, constraints);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/predictions/sentiment-impact', asyncHandler(async (req, res) => {
      const { symbol, sentimentData } = req.body;
      if (!symbol || !sentimentData) {
        return res.status(400).json({ error: 'Symbol and sentiment data are required' });
      }

      const result = await realTimeAIPrediction.analyzeSentimentImpact(symbol, sentimentData);
      res.json({ success: true, data: result });
    }));

    // Reinforcement Learning endpoints
    this.app.post('/api/ai/rl/create-agent', asyncHandler(async (req, res) => {
      const { symbol, algorithm, strategy } = req.body;
      if (!symbol) {
        return res.status(400).json({ error: 'Symbol is required' });
      }

      const result = await reinforcementLearning.createAgent(symbol, algorithm, strategy);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/rl/trading-decision', asyncHandler(async (req, res) => {
      const { agentId, marketState } = req.body;
      if (!agentId || !marketState) {
        return res.status(400).json({ error: 'Agent ID and market state are required' });
      }

      const result = await reinforcementLearning.getTradingDecision(agentId, marketState);
      res.json({ success: true, data: result });
    }));

    this.app.post('/api/ai/rl/train', asyncHandler(async (req, res) => {
      const { episodes } = req.body;
      const numEpisodes = episodes || 100;

      await reinforcementLearning.trainModels(numEpisodes);
      res.json({
        success: true,
        data: {
          episodes: numEpisodes,
          message: `Training started for ${numEpisodes} episodes`
        }
      });
    }));

    // AI Service health endpoints
    this.app.get('/metrics/ai/nlp', (req, res) => {
      const health = advancedNLP.getHealth();
      res.json({ success: true, data: health, timestamp: new Date().toISOString() });
    });

    this.app.get('/metrics/ai/vision', (req, res) => {
      const health = advancedComputerVision.getHealth();
      res.json({ success: true, data: health, timestamp: new Date().toISOString() });
    });

    this.app.get('/metrics/ai/predictions', (req, res) => {
      const health = realTimeAIPrediction.getHealth();
      res.json({ success: true, data: health, timestamp: new Date().toISOString() });
    });

    this.app.get('/metrics/ai/rl', (req, res) => {
      const health = reinforcementLearning.getHealth();
      res.json({ success: true, data: health, timestamp: new Date().toISOString() });
    });

    // Serve static files (RUM SDK)
    const path = require('path');
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // Cache example for token list
    this.app.get('/api/tokens/list',
      cacheMiddleware({ ttl: 300 }), // 5 minute cache
      validatePagination(),
      (req, res) => {
        const etag = tokenRegistry.getEtag();

        if (req.headers['if-none-match'] === etag) {
          res.status(304).end();
          return;
        }

        const { offset, limit } = req.pagination;
        const { items, total } = tokenRegistry.listTokens({ offset, limit });

        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', tokenRegistry.getUpdatedAt());
        res.setHeader('Cache-Control', 'public, max-age=120, must-revalidate');
        res.setHeader('X-Total-Count', String(total));
        res.setHeader('X-Page-Offset', String(offset));
        res.setHeader('X-Page-Limit', String(limit));

        res.json({
          success: true,
          data: items,
          pagination: {
            ...req.pagination,
            total
          }
        });
      }
    );

    this.app.get('/metrics/dex-state',
      cacheMiddleware({ ttl: 5 }),
      asyncHandler(async (req, res) => {
        const metrics = await dexState.getPoolsMetricsAsync();
        const summary = await dexState.getSummaryAsync();

        res.setHeader('X-Total-Pools', String(summary.totalPools));
        res.setHeader('X-Total-Swaps', String(summary.totalSwaps));
        res.setHeader('X-Total-Pairs', String(summary.totalPairs));
        if (metrics.lastPersistDurationMs !== null) {
          res.setHeader('X-Persist-Duration-Ms', String(metrics.lastPersistDurationMs));
        }
        if (metrics.lastLoadDurationMs !== null) {
          res.setHeader('X-Load-Duration-Ms', String(metrics.lastLoadDurationMs));
        }

        res.json({
          success: true,
          data: {
            metrics,
            summary
          }
        });
      })
    );
  }

  // Helper functions for AI services
  getHTTPStatus(reason) {
    const statusMap = {
      'invalid_credentials': 401,
      'high_risk': 403,
      'device_verification_required': 403,
      'mfa_required': 403,
      'session_not_found': 401,
      'session_expired': 401,
      'risk_threshold_exceeded': 403,
      'invalid_token': 401,
      'token_expired': 401,
      'token_validation_error': 401
    };

    return statusMap[reason] || 400;
  }

  getErrorDetails(reason) {
    const detailsMap = {
      'invalid_credentials': 'The provided username or password is incorrect',
      'high_risk': 'Access blocked due to high security risk',
      'device_verification_required': 'Device verification required for security',
      'mfa_required': 'Multi-factor authentication required',
      'session_not_found': 'Session not found or expired',
      'session_expired': 'Session has expired, please login again',
      'risk_threshold_exceeded': 'Access blocked due to security policy',
      'invalid_token': 'Authentication token is invalid',
      'token_expired': 'Authentication token has expired',
      'token_validation_error': 'Token validation failed'
    };

    return detailsMap[reason] || 'Request validation failed';
  }

    // Advanced monitoring endpoints (Round 18)
    this.app.get('/metrics/system', (req, res) => {
      const healthStatus = healthMonitor.getStatus();
      const healthMetrics = healthMonitor.getMetrics();
      const validatorStats = requestValidator.getStatistics();
      const compressionStats = responseCompression.getStatistics();

      res.json({
        success: true,
        data: {
          health: healthStatus,
          system: healthMetrics.system,
          requests: healthMetrics.requests,
          validation: validatorStats,
          compression: compressionStats
        },
        timestamp: timestampUtils.now()
      });
    });

    this.app.get('/metrics/alerts', (req, res) => {
      const limit = parseInt(req.query.limit) || 10;
      const alerts = healthMonitor.getAlerts(limit);

      res.json({
        success: true,
        data: alerts,
        count: alerts.length,
        timestamp: new Date().toISOString()
      });
    });

    // Error tracking endpoints
    this.app.get('/metrics/errors', (req, res) => {
      const errorStats = errorTrackingSystem.getErrorStatistics();
      res.json({
        success: true,
        data: errorStats,
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/metrics/errors/report', (req, res) => {
      const timeRange = parseInt(req.query.range) || 3600000; // 1 hour default
      const report = errorTrackingSystem.generateErrorReport(timeRange);
      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/metrics/errors/:errorId', (req, res) => {
      const errorDetails = errorTrackingSystem.getErrorDetails(req.params.errorId);
      if (!errorDetails) {
        return res.status(404).json({
          success: false,
          error: 'Error not found'
        });
      }

      res.json({
        success: true,
        data: errorDetails,
        timestamp: new Date().toISOString()
      });
    });

    this.app.post('/metrics/errors/:errorId/resolve', (req, res) => {
      const { resolution, notes } = req.body;
      const success = errorTrackingSystem.updateErrorResolution(req.params.errorId, {
        status: 'resolved',
        resolution,
        notes: notes || []
      });

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Error not found'
        });
      }

      res.json({
        success: true,
        message: 'Error resolution updated',
        timestamp: new Date().toISOString()
      });
    });

    // Rate limiting endpoints
    this.app.get('/metrics/rate-limiting', (req, res) => {
      const rateLimitStats = intelligentRateLimitService.getStatistics();
      res.json({
        success: true,
        data: rateLimitStats,
        timestamp: new Date().toISOString()
      });
    });

    this.app.post('/metrics/rate-limiting/reset', (req, res) => {
      intelligentRateLimitService.resetStatistics();
      res.json({
        success: true,
        message: 'Rate limiting statistics reset',
        timestamp: new Date().toISOString()
      });
    });

    this.app.post('/metrics/rate-limiting/blacklist/:ip', (req, res) => {
      const { ip } = req.params;
      const { reason } = req.body;

      intelligentRateLimitService.blacklistIP(ip, reason || 'manual');
      res.json({
        success: true,
        message: `IP ${ip} blacklisted`,
        timestamp: new Date().toISOString()
      });
    });

    this.app.delete('/metrics/rate-limiting/blacklist/:ip', (req, res) => {
      const { ip } = req.params;

      intelligentRateLimitService.whitelistIP(ip);
      res.json({
        success: true,
        message: `IP ${ip} removed from blacklist`,
        timestamp: new Date().toISOString()
      });
    });

    // Ultimate performance metrics (Round 19)
    this.app.get('/metrics/performance', (req, res) => {
      const cacheStats = advancedCache.getStatistics();
      const retryStats = autoRetry.getStatistics();

      res.json({
        success: true,
        data: {
          cache: cacheStats,
          retry: retryStats
        },
        timestamp: new Date().toISOString()
      });
    });

    // Deduplication metrics (Round 21)
    this.app.get('/metrics/deduplication', (req, res) => {
      const dedupStats = deduplicationMiddleware.getStatistics();

      res.json({
        success: true,
        data: dedupStats,
        timestamp: new Date().toISOString()
      });
    });

    // Error registry (Round 21) - RFC 9457
    this.app.get('/errors/registry', (req, res) => {
      const registry = problemDetails.getErrorRegistry();

      res.json({
        success: true,
        data: registry,
        count: registry.length,
        timestamp: new Date().toISOString()
      });
    });

    // Real-time monitoring dashboard (Round 21)
    const dashboardRoutes = require('./routes/dashboard');
    this.app.use('/dashboard', dashboardRoutes);

  setupAuthentication() {
    // Zero Trust Authentication Routes (v4.0.0)
    this.app.get('/auth/nonce', web3AuthManager.nonceEndpoint());
    this.app.post('/auth/verify', web3AuthManager.authEndpoint());
    this.app.post('/auth/logout', web3AuthManager.logoutEndpoint());

    // Zero Trust Authentication Endpoints
    this.app.post('/auth/zero-trust/login', asyncHandler(async (req, res) => {
      const { username, password, deviceInfo, networkInfo, mfaToken } = req.body;

      const context = {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        deviceInfo: deviceInfo || {},
        networkInfo: networkInfo || {},
        timestamp: new Date()
      };

      const authResult = await zeroTrustAuth.authenticate({
        username,
        password,
        deviceInfo,
        networkInfo,
        mfaToken
      }, context);

      if (!authResult.success) {
        return res.status(getHTTPStatus(authResult.reason)).json({
          error: 'Authentication failed',
          code: authResult.reason.toUpperCase(),
          details: getErrorDetails(authResult.reason)
        });
      }

      res.json({
        success: true,
        data: {
          session: authResult.session,
          user: authResult.user,
          riskLevel: authResult.riskLevel,
          deviceTrust: authResult.deviceTrust
        }
      });
    }));

    this.app.get('/auth/zero-trust/validate', zeroTrustAuthMiddleware, (req, res) => {
      res.json({
        success: true,
        data: {
          user: req.user,
          session: req.session,
          riskLevel: req.riskLevel,
          deviceTrust: req.deviceTrust
        }
      });
    });

    // Advanced Rate Limiter Stats (Round 22)
    this.app.get('/metrics/rate-limit', (req, res) => {
      const stats = advancedRateLimiter.getStatistics();
      const bucketStates = advancedRateLimiter.getBucketStates();

      res.json({
        success: true,
        data: {
          stats,
          buckets: {
            summary: bucketStates,
            totalBuckets: bucketStates.users.length + bucketStates.ips.length + bucketStates.apiKeys.length
          }
        },
        timestamp: new Date().toISOString()
      });
    });

    // Web3 Auth Stats (Round 22)
    this.app.get('/metrics/auth', (req, res) => {
      const stats = web3AuthManager.getStatistics();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    });

    // Zero Trust Auth Stats (v4.0.0)
    this.app.get('/metrics/zero-trust', (req, res) => {
      const stats = zeroTrustAuth.getHealth();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    });
  }

  setupSmartOrderRouting() {
    // Smart Order Routing Endpoints (Round 24)
    this.app.post('/api/swap/route', asyncHandler(async (req, res) => {
      const { tokenIn, tokenOut, amountIn, options } = req.body;

      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json(
          problemDetails.create({
            type: 'validation-error',
            detail: 'Missing required fields: tokenIn, tokenOut, amountIn'
          })
        );
      }

      const route = await smartOrderRouter.findOptimalRoute(tokenIn, tokenOut, amountIn, options);

      res.json({
        success: true,
        data: route,
        timestamp: new Date().toISOString()
      });
    }));

    this.app.get('/api/swap/router-stats', (req, res) => {
      const stats = smartOrderRouter.getStatistics();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    });
  }

  setupImpermanentLossProtection() {
    // Impermanent Loss Protection Endpoints (Round 24)
    this.app.post('/api/liquidity/protect', asyncHandler(async (req, res) => {
      const { userId, poolId, token0, token1, amount0, amount1, liquidity, initialPrice, entryValue } = req.body;

      if (!userId || !poolId || !token0 || !token1 || !amount0 || !amount1 || !liquidity || !initialPrice || !entryValue) {
        return res.status(400).json(
          problemDetails.create({
            type: 'validation-error',
            detail: 'Missing required fields for position registration'
          })
        );
      }

      const positionId = impermanentLossProtection.registerPosition(userId, poolId, {
        token0,
        token1,
        amount0,
        amount1,
        liquidity,
        initialPrice,
        entryValue
      });

      res.json({
        success: true,
        data: {
          positionId,
          message: 'Position registered for impermanent loss protection'
        },
        timestamp: new Date().toISOString()
      });
    }));

    this.app.get('/api/liquidity/analyze/:positionId', asyncHandler(async (req, res) => {
      const { positionId } = req.params;
      const { currentPrice } = req.query;

      if (!currentPrice) {
        return res.status(400).json(
          problemDetails.create({
            type: 'validation-error',
            detail: 'Missing required query parameter: currentPrice'
          })
        );
      }

      const analysis = impermanentLossProtection.analyzePosition(positionId, parseFloat(currentPrice));

      res.json({
        success: true,
        data: analysis,
        timestamp: new Date().toISOString()
      });
    }));

    this.app.post('/api/liquidity/claim/:positionId', asyncHandler(async (req, res) => {
      const { positionId } = req.params;
      const { currentPrice } = req.body;

      if (!currentPrice) {
        return res.status(400).json(
          problemDetails.create({
            type: 'validation-error',
            detail: 'Missing required field: currentPrice'
          })
        );
      }

      const result = await impermanentLossProtection.processClaim(positionId, currentPrice);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    }));

    this.app.get('/api/liquidity/user/:userId', (req, res) => {
      const { userId } = req.params;
      const positions = impermanentLossProtection.getUserPositions(userId);

      res.json({
        success: true,
        data: positions,
        count: positions.length,
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/api/liquidity/stats', (req, res) => {
      const stats = impermanentLossProtection.getStatistics();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    });
  }

  start(port = 3000) {
    return new Promise((resolve, reject) => {
      try {
        // Initialize application
        this.initialize();
        this.setupSecurity();
        this.setupPerformance();
        this.setupMonitoring();
        this.setupRoutes();
        this.setupAdvancedFeatures();
        this.setupMonitoringEndpoints();
        this.setupAuthentication();

        // Initialize error tracking system
        errorTrackingSystem.initializeSystem().catch(err => {
          logger.warn('Error tracking system initialization failed:', err.message);
        });

        // Initialize intelligent rate limiting service
        intelligentRateLimitService.initializeService().catch(err => {
          logger.warn('Intelligent rate limiting service initialization failed:', err.message);
        });

        // Setup feature-specific routes
        if (smartOrderRouter) this.setupSmartOrderRouting();
        if (impermanentLossProtection) this.setupImpermanentLossProtection();

        // Setup remaining feature routes...

        // Error handling middleware (must be last)
        this.app.use(notFoundHandler);

        // Error tracing middleware (v3.0.0) - before errorHandler
        if (process.env.OTEL_ENABLED !== 'false') {
          const { errorTracingMiddleware } = require('./middleware/tracingMiddleware');
          this.app.use(errorTracingMiddleware());
        }

        this.app.use(errorHandler);

        // Start server
        this.server = this.app.listen(port, () => {
          logger.info(`Soba DEX API server started on port ${port}`, {
            environment: this.config.nodeEnv,
            nodeVersion: process.version,
            memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
          });
          resolve(this.server);
        });

        this.server.on('error', (error) => {
          logger.error('Server startup error', { error: error.message });
          reject(error);
        });

      } catch (error) {
        logger.error('Application initialization error', { error: error.message });
        reject(error);
      }
    });
  }

  async stop() {
    if (this.server) {
      this.server.close();
      logger.info('Soba DEX API server stopped');
    }
  }

  getApp() {
    return this.app;
  }

  getServer() {
    return this.server;
  }

  getConfig() {
    return this.config;
  }
}

// Export factory function for creating application instances
module.exports = {
  DEXApplication,
  createApp: () => new DEXApplication()
};
