/**
 * Server Entry Point - Production Ready
 * Version: 3.0.0 - OpenTelemetry tracing integration
 */

// Validate environment variables BEFORE loading anything else
const { validateEnvironment, getConfig } = require('./config/validateEnv');
validateEnvironment();
const config = getConfig();

const app = require('./app');
const { logger } = require('./utils/productionLogger');
const { dbPool } = require('./database/pool');
const { prisma } = require('./db/prisma');
const cacheService = require('./services/cacheService');
const gasPriceFetcher = require('./jobs/gasPriceFetcher');
const priceFetcher = require('./jobs/priceFetcher');
const websocketService = require('./services/websocketService');
const metricsService = require('./services/metricsService');
const tracerService = require('./services/tracerService');

// v3.1.0 Analytics Services
const traceAnalytics = require('./services/traceAnalyticsService');
const sloMonitoring = require('./services/sloMonitoringService');
const alerting = require('./services/alertingService');
const baseline = require('./services/baselineService');

// v3.2.0 RUM Services
const rumService = require('./services/rumService');
const traceCorrelation = require('./services/traceCorrelationService');

// v3.4.0 ML & Analytics Services
const mlAnomalyDetection = require('./services/mlAnomalyDetection');
const predictiveScaling = require('./services/predictiveScaling');
const abTesting = require('./services/abTesting');
const advancedABTesting = require('./services/advancedABTesting');
const userBehaviorAnalytics = require('./services/userBehaviorAnalytics');
const autoTuningService = require('./services/autoTuningService');

// v3.5.0 ML Model Management Services
const mlModelPersistence = require('./services/mlModelPersistence');
const mlRetrainingService = require('./services/mlRetrainingService');
const mlFeatureEngineering = require('./services/mlFeatureEngineering');
const mlDriftDetection = require('./services/mlDriftDetection');
const mlModelABTesting = require('./services/mlModelABTesting');

// v4.0.0 Advanced Blockchain & DeFi Services
const advancedCrossChainBridge = require('./services/advancedCrossChainBridge');

// v4.0.0 Advanced Internationalization Service
const advancedI18n = require('./services/advancedI18nService');

// v3.7.0 ML Visualization, Automation & Reporting Services
const mlVisualization = require('./services/mlVisualization');
const mlPipeline = require('./services/mlPipeline');
const mlReporting = require('./services/mlReporting');

// v6.0.0 Performance Monitoring API Routes
const performanceMonitoringRoutes = require('./routes/performanceMonitoring');

// v6.0.0 Enhanced User Engagement API Routes
const userEngagementRoutes = require('./routes/userEngagement');

// v3.9.0 Experimentation Platform Services
const abTesting = require('./services/abTesting');
const predictiveCohorts = require('./services/predictiveCohorts');
const funnelAnomalyDetection = require('./services/funnelAnomalyDetection');

const PORT = config.port;
const HOST = config.host;

// Initialize database connection
dbPool.initialize();

// Initialize OpenTelemetry tracing
if (process.env.OTEL_ENABLED !== 'false') {
  tracerService.initialize({
    serviceName: 'soba-dex-backend',
    serviceVersion: '3.2.0',
    exporterType: process.env.OTEL_EXPORTER_TYPE || 'jaeger',
    jaegerEndpoint: process.env.JAEGER_ENDPOINT,
    zipkinEndpoint: process.env.ZIPKIN_ENDPOINT,
    otlpEndpoint: process.env.OTLP_ENDPOINT,
  }).then(() => {
    logger.info('OpenTelemetry tracing initialized', {
      exporter: process.env.OTEL_EXPORTER_TYPE || 'jaeger',
    });
  }).catch((error) => {
    logger.error('Failed to initialize OpenTelemetry:', error);
  });
}

// Initialize Prometheus metrics
if (process.env.PROMETHEUS_ENABLED !== 'false') {
  metricsService.initialize();
  logger.info('Prometheus metrics initialized');
}

// Initialize v3.1.0 Analytics Services
if (process.env.ANALYTICS_ENABLED !== 'false') {
  // Trace Analytics
  traceAnalytics.initialize({
    anomalyThreshold: parseInt(process.env.ANOMALY_THRESHOLD) || 3,
    regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 0.5,
    analysisInterval: parseInt(process.env.ANALYTICS_INTERVAL) || 60000,
  }).then(() => {
    logger.info('Trace Analytics initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Trace Analytics:', error);
  });

  // SLO Monitoring
  sloMonitoring.initialize({
    checkInterval: parseInt(process.env.SLO_CHECK_INTERVAL) || 60000,
  }).then(() => {
    logger.info('SLO Monitoring initialized');
  }).catch((error) => {
    logger.error('Failed to initialize SLO Monitoring:', error);
  });

  // Alerting
  alerting.initialize({
    email: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    deduplicationWindow: parseInt(process.env.ALERT_DEDUP_WINDOW) || 300000,
  }).then(() => {
    logger.info('Alerting Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Alerting:', error);
  });

  // Baseline Management
  baseline.initialize({
    rollingWindowDays: parseInt(process.env.BASELINE_ROLLING_WINDOW) || 7,
    updateInterval: parseInt(process.env.BASELINE_UPDATE_INTERVAL) || 3600000,
  }).then(() => {
    logger.info('Baseline Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Baseline Service:', error);
  });
}

// Initialize v3.2.0 RUM Services
if (process.env.RUM_ENABLED !== 'false') {
  // Real User Monitoring
  rumService.initialize({
    retentionDays: parseInt(process.env.RUM_RETENTION_DAYS) || 30,
    sampleRate: parseFloat(process.env.RUM_SAMPLE_RATE) || 1.0,
    apdexThreshold: parseInt(process.env.RUM_APDEX_THRESHOLD) || 2500,
    slowPageThreshold: parseInt(process.env.RUM_SLOW_PAGE_THRESHOLD) || 3000,
    batchSize: parseInt(process.env.RUM_BATCH_SIZE) || 100,
    batchInterval: parseInt(process.env.RUM_BATCH_INTERVAL) || 10000,
  }).then(() => {
    logger.info('RUM Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize RUM Service:', error);
  });

  // Trace Correlation
  traceCorrelation.initialize({
    retentionMinutes: parseInt(process.env.TRACE_CORRELATION_RETENTION) || 60,
    maxSpansPerTrace: parseInt(process.env.TRACE_CORRELATION_MAX_SPANS) || 1000,
  }).then(() => {
    logger.info('Trace Correlation Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Trace Correlation Service:', error);
  });
}

// Initialize v3.4.0 ML & Analytics Services
if (process.env.ML_ENABLED !== 'false') {
  // ML Anomaly Detection
  mlAnomalyDetection.initialize().then(() => {
    logger.info('ML Anomaly Detection initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Anomaly Detection:', error);
  });

  // Predictive Scaling
  predictiveScaling.initialize().then(() => {
    logger.info('Predictive Scaling initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Predictive Scaling:', error);
  });

  // Advanced A/B Testing
  advancedABTesting.initialize().then(() => {
    logger.info('Advanced A/B Testing initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Advanced A/B Testing:', error);
  });

  // User Behavior Analytics
  userBehaviorAnalytics.initialize().then(() => {
    logger.info('User Behavior Analytics initialized');
  }).catch((error) => {
    logger.error('Failed to initialize User Behavior Analytics:', error);
  });

  // Auto-tuning Service
  autoTuningService.initialize().then(() => {
    logger.info('Auto-tuning Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Auto-tuning Service:', error);
  });
}

// Initialize v3.5.0 ML Model Management Services
if (process.env.ML_ENABLED !== 'false') {
  // ML Model Persistence
  mlModelPersistence.initialize().then(() => {
    logger.info('ML Model Persistence initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Model Persistence:', error);
  });

  // ML Retraining Service
  mlRetrainingService.initialize().then(() => {
    logger.info('ML Retraining Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Retraining Service:', error);
  });

  // Feature Engineering
  mlFeatureEngineering.initialize().then(() => {
    logger.info('ML Feature Engineering initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Feature Engineering:', error);
  });

  // Drift Detection
  mlDriftDetection.initialize().then(() => {
    logger.info('ML Drift Detection initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Drift Detection:', error);
  });

  // Model A/B Testing
  mlModelABTesting.initialize().then(() => {
    logger.info('ML Model A/B Testing initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Model A/B Testing:', error);
  });

  // v3.6.0 ML Monitoring & Explainability Services
  // ML Explainability
  mlExplainability.initialize().then(() => {
    logger.info('ML Explainability Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Explainability Service:', error);
  });

  // ML Performance Monitoring
  mlPerformanceMonitoring.initialize().then(() => {
    logger.info('ML Performance Monitoring Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Performance Monitoring Service:', error);
  });

  // ML Data Quality
  mlDataQuality.initialize().then(() => {
    logger.info('ML Data Quality Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Data Quality Service:', error);
  });

  // ML Model Comparison
  mlModelComparison.initialize().then(() => {
    logger.info('ML Model Comparison Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Model Comparison Service:', error);
  });

  // v3.7.0 ML Visualization, Automation & Reporting Services
  // ML Visualization
  mlVisualization.initialize().then(() => {
    logger.info('ML Visualization Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Visualization Service:', error);
  });

  // ML Pipeline & Workflow Orchestration
  mlPipeline.initialize().then(() => {
    logger.info('ML Pipeline Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Pipeline Service:', error);
  });

  // ML Reporting
  mlReporting.initialize().then(() => {
    logger.info('ML Reporting Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize ML Reporting Service:', error);
  });

  // v6.0.0 Performance Monitoring API Routes
  app.use('/api/v6/monitoring', performanceMonitoringRoutes);

  // v6.0.0 Enhanced User Engagement API Routes
  app.use('/api/v6/engagement', userEngagementRoutes);

  // v3.8.0 Advanced Analytics & Intelligence Services
  // Advanced Analytics
  advancedAnalytics.initialize().then(() => {
    logger.info('Advanced Analytics Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Advanced Analytics Service:', error);
  });

  // Real-time Streaming
  realTimeStreaming.initialize().then(() => {
    logger.info('Real-time Streaming Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Real-time Streaming Service:', error);
  });

  // Custom Alerting
  customAlerting.initialize().then(() => {
    logger.info('Custom Alerting Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Custom Alerting Service:', error);
  });

  // Model Ensemble
  modelEnsemble.initialize().then(() => {
    logger.info('Model Ensemble Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Model Ensemble Service:', error);
  });

  // v3.9.0 Experimentation Platform Services
  // A/B Testing
  abTesting.initialize().then(() => {
    logger.info('A/B Testing Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize A/B Testing Service:', error);
  });

  // Predictive Cohorts
  predictiveCohorts.initialize().then(() => {
    logger.info('Predictive Cohorts Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Predictive Cohorts Service:', error);
  });

  // Funnel Anomaly Detection
  funnelAnomalyDetection.initialize().then(() => {
    logger.info('Funnel Anomaly Detection Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Funnel Anomaly Detection Service:', error);
  });

  // v4.0.0 Advanced Performance Services
  // Advanced Cache Service
  advancedCache.initialize({
    memory: {
      maxSize: 1000,
      maxMemory: 100 * 1024 * 1024, // 100MB
      ttl: 300,
    },
    redis: {
      enabled: process.env.REDIS_ENABLED !== 'false',
      ttl: 3600,
    }
  }).then(() => {
    logger.info('Advanced Cache Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Advanced Cache Service:', error);
  });

  // Advanced Memory Manager
  advancedMemoryManager.initialize({
    memory: {
      maxHeapSize: 512 * 1024 * 1024, // 512MB
      warningThreshold: 0.8,
      criticalThreshold: 0.9,
    }
  }).then(() => {
    logger.info('Advanced Memory Manager initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Advanced Memory Manager:', error);
  });

  // Zero Trust Authentication Service
  zeroTrustAuth.initialize({
    session: {
      timeout: 3600000, // 1 hour
      maxSessionsPerUser: 3,
      continuousValidationInterval: 300000, // 5 minutes
    },
    risk: {
      lowThreshold: 0.3,
      mediumThreshold: 0.6,
      highThreshold: 0.8,
      blockThreshold: 0.9,
    }
  }).then(() => {
    logger.info('Zero Trust Authentication Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Zero Trust Authentication Service:', error);
  });

  // Advanced NLP Service
  advancedNLP.initialize({
    maxTextLength: 10000,
    batchSize: 32,
    confidenceThreshold: 0.8,
    supportedLanguages: ['en', 'es', 'fr', 'de', 'ja', 'ko', 'zh']
  }).then(() => {
    logger.info('Advanced NLP Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Advanced NLP Service:', error);
  });

  // Advanced Computer Vision Service
  advancedComputerVision.initialize({
    maxImageSize: 10 * 1024 * 1024,
    supportedFormats: ['png', 'jpg', 'jpeg', 'gif', 'bmp'],
    models: {
      chartRecognition: 'resnet50',
      patternDetection: 'yolov5',
      ocr: 'tesseract'
    }
  }).then(() => {
    logger.info('Advanced Computer Vision Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Advanced Computer Vision Service:', error);
  });

  // Real-time AI Prediction Service
  realTimeAIPrediction.initialize({
    prediction: {
      horizon: [5, 15, 30, 60, 240],
      updateInterval: 1000,
      confidenceThreshold: 0.7
    },
    models: {
      price: {
        architecture: 'lstm',
        layers: 3,
        units: 128,
        dropout: 0.2
      }
    }
  }).then(() => {
    logger.info('Real-time AI Prediction Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Real-time AI Prediction Service:', error);
  });

  // Reinforcement Learning Trading Service
  reinforcementLearning.initialize({
    agents: {
      maxAgents: 10,
      learningRate: 0.001,
      explorationRate: 0.1
    },
    training: {
      episodes: 1000,
      batchSize: 32
    }
  }).then(() => {
    logger.info('Reinforcement Learning Trading Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Reinforcement Learning Trading Service:', error);
  });

  // Advanced Cross-Chain Bridge Service
  advancedCrossChainBridge.initialize({
    chains: {
      ethereum: {
        rpc: process.env.ETH_RPC_URL,
        confirmations: 12
      },
      bsc: {
        rpc: process.env.BSC_RPC_URL,
        confirmations: 15
      },
      polygon: {
        rpc: process.env.POLYGON_RPC_URL,
        confirmations: 256
      },
      arbitrum: {
        rpc: process.env.ARBITRUM_RPC_URL,
        confirmations: 1
      },
      optimism: {
        rpc: process.env.OPTIMISM_RPC_URL,
        confirmations: 1
      }
    },
    security: {
      maxTransferAmount: '1000000',
      minConfirmations: 6
    }
  }).then(() => {
    logger.info('Advanced Cross-Chain Bridge Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Advanced Cross-Chain Bridge Service:', error);
  });

  // Advanced Internationalization Service
  advancedI18n.initialize({
    defaultLocale: 'en',
    fallbackLocale: 'en',
    autoDetect: true,
    enableFallback: true,
    cacheTranslations: true,
    preloadCommonTranslations: true
  }).then(() => {
    logger.info('Advanced Internationalization Service initialized');
  }).catch((error) => {
    logger.error('Failed to initialize Advanced Internationalization Service:', error);
  });
}

// Start server
const server = app.listen(PORT, HOST, () => {
  logger.info('Server started successfully', {
    port: PORT,
    host: HOST,
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid,
    nodeVersion: process.version
  });

  // Log database status
  dbPool.healthCheck()
    .then(health => {
      if (health.healthy) {
        logger.info('Database connection established');
      } else {
        logger.warn('Database connection failed', { error: health.error });
      }
    })
    .catch(err => {
      logger.error('Database health check failed', err);
    });

  // Initialize WebSocket server
  if (process.env.ENABLE_WEBSOCKET !== 'false') {
    websocketService.initialize(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
    logger.info('WebSocket service initialized');
  }

  // Start background jobs
  if (process.env.ENABLE_GAS_FETCHER !== 'false') {
    gasPriceFetcher.start();
    logger.info('Gas price fetcher started');
  }

  if (process.env.ENABLE_PRICE_FETCHER !== 'false') {
    priceFetcher.start();
    logger.info('Price fetcher started');
  }
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    // Close all connections in parallel
    const cleanupTasks = [];

    // Close database pool
    cleanupTasks.push(
      dbPool.close()
        .then(() => logger.info('Database pool closed'))
        .catch(err => logger.error('Error closing database pool', err))
    );

    // Close Prisma connection
    cleanupTasks.push(
      prisma.$disconnect()
        .then(() => logger.info('Prisma disconnected'))
        .catch(err => logger.error('Error disconnecting Prisma', err))
    );

    // Close Advanced Cache Service
    cleanupTasks.push(
      advancedCache.cleanup()
        .then(() => logger.info('Advanced Cache Service closed'))
        .catch(err => logger.error('Error closing Advanced Cache Service', err))
    );

    // Close Advanced Memory Manager
    cleanupTasks.push(
      advancedMemoryManager.cleanup()
        .then(() => logger.info('Advanced Memory Manager closed'))
        .catch(err => logger.error('Error closing Advanced Memory Manager', err))
    );

    // Close Zero Trust Authentication Service
    cleanupTasks.push(
      zeroTrustAuth.cleanup()
        .then(() => logger.info('Zero Trust Authentication Service closed'))
        .catch(err => logger.error('Error closing Zero Trust Authentication Service', err))
    );

    // Close Advanced AI Services
    cleanupTasks.push(
      advancedNLP.cleanup()
        .then(() => logger.info('Advanced NLP Service closed'))
        .catch(err => logger.error('Error closing Advanced NLP Service', err))
    );

    cleanupTasks.push(
      advancedComputerVision.cleanup()
        .then(() => logger.info('Advanced Computer Vision Service closed'))
        .catch(err => logger.error('Error closing Advanced Computer Vision Service', err))
    );

    cleanupTasks.push(
      realTimeAIPrediction.cleanup()
        .then(() => logger.info('Real-time AI Prediction Service closed'))
        .catch(err => logger.error('Error closing Real-time AI Prediction Service', err))
    );

    cleanupTasks.push(
      reinforcementLearning.cleanup()
        .then(() => logger.info('Reinforcement Learning Trading Service closed'))
        .catch(err => logger.error('Error closing Reinforcement Learning Trading Service', err))
    );

    // Close Advanced Cross-Chain Bridge Service
    cleanupTasks.push(
      advancedCrossChainBridge.cleanup()
        .then(() => logger.info('Advanced Cross-Chain Bridge Service closed'))
        .catch(err => logger.error('Error closing Advanced Cross-Chain Bridge Service', err))
    );

    // Close Advanced Internationalization Service
    cleanupTasks.push(
      advancedI18n.cleanup()
        .then(() => logger.info('Advanced Internationalization Service closed'))
        .catch(err => logger.error('Error closing Advanced Internationalization Service', err))
    );

    // Stop background jobs
    if (gasPriceFetcher.getStatus().running) {
      gasPriceFetcher.stop();
      logger.info('Gas price fetcher stopped');
    }

    if (priceFetcher.getStatus().running) {
      priceFetcher.stop();
      logger.info('Price fetcher stopped');
    }

    // Close WebSocket connections
    if (websocketService.isInitialized()) {
      cleanupTasks.push(
        websocketService.shutdown()
          .then(() => logger.info('WebSocket service shut down'))
          .catch(err => logger.error('Error shutting down WebSocket', err))
      );
    }

    // Shutdown OpenTelemetry tracing
    if (tracerService.isEnabled()) {
      cleanupTasks.push(
        tracerService.shutdown()
          .then(() => logger.info('OpenTelemetry tracing shut down'))
          .catch(err => logger.error('Error shutting down OpenTelemetry', err))
      );
    }

    // Wait for all cleanup tasks
    try {
      await Promise.allSettled(cleanupTasks);
      logger.info('All connections closed successfully');
      process.exit(0);
    } catch (err) {
      logger.error('Error during cleanup', err);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors (already handled by setupGlobalHandlers, but add process-level handling)
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception - Shutting down', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, _promise) => {
  logger.error('Unhandled Rejection - Shutting down', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  shutdown('unhandledRejection');
});

module.exports = server;
