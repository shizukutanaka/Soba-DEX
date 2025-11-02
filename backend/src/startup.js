const express = require('express');
const http = require('http');

// Core utilities
const configLoader = require('./config/configLoader');
const { gracefulShutdown } = require('./utils/gracefulShutdown');
const unifiedLogger = require('./utils/unifiedLogger');
const { metricsCollector } = require('./monitoring/metricsCollector');
const memoryLeakDetector = require('./utils/memoryLeakDetector');
const scheduler = require('./utils/scheduler');

// Middleware
const requestId = require('./middleware/requestId');
const timeout = require('./middleware/timeout');
const rateLimiter = require('./middleware/rateLimiter');
const corsOptimized = require('./middleware/corsOptimized');
const requestCompression = require('./middleware/requestCompression');

// Services
const wsManager = require('./services/wsManager');
const sessionManager = require('./services/sessionManager');
const connectionPool = require('./database/connectionPool');

// Routes
const routes = require('./routes');

class DEXServer {
  constructor() {
    this.app = null;
    this.server = null;
    this.config = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      throw new Error('Server already initialized');
    }

    console.log('🚀 Starting DEX Platform...');

    try {
      // Load configuration
      this.config = await configLoader.init();
      console.log('✅ Configuration loaded');

      // Initialize Express app
      this.app = express();
      this.server = http.createServer(this.app);

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      // Initialize services
      await this.initializeServices();

      // Setup graceful shutdown
      gracefulShutdown.init(this.server, {
        logger: unifiedLogger
      });

      this.initialized = true;
      console.log('✅ Server initialized');

    } catch (error) {
      console.error('❌ Failed to initialize server:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Trust proxy
    this.app.set('trust proxy', 1);

    // Core middleware
    this.app.use(requestId.middleware());
    this.app.use(unifiedLogger.middleware());
    this.app.use(metricsCollector.middleware());

    // Security middleware
    this.app.use(corsOptimized.init());
    this.app.use(rateLimiter.getIpLimiter());

    // Performance middleware
    this.app.use(requestCompression.smartCompression());
    this.app.use(timeout.adaptiveTimeout());

    // Session middleware
    this.app.use(sessionManager.middleware());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    console.log('✅ Middleware configured');
  }

  setupRoutes() {
    // API routes
    this.app.use('/', routes);

    // Static files
    this.app.use('/uploads', express.static('uploads'));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: true,
        message: 'Endpoint not found',
        path: req.originalUrl
      });
    });

    console.log('✅ Routes configured');
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use(unifiedLogger.errorMiddleware());

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      unifiedLogger.error('Uncaught Exception:', { stack: error.stack });
      gracefulShutdown.triggerShutdown('UNCAUGHT_EXCEPTION');
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      unifiedLogger.error('Unhandled Rejection:', { reason, promise });
      gracefulShutdown.triggerShutdown('UNHANDLED_REJECTION');
    });

    console.log('✅ Error handling configured');
  }

  async initializeServices() {
    try {
      // Start metrics collection
      metricsCollector.start();

      // Start memory leak detection
      memoryLeakDetector.startMonitoring();

      // Initialize WebSocket manager
      wsManager.initialize(this.server);

      // Start scheduler
      scheduler.start();
      scheduler.addMaintenanceJobs();

      // Test database connection
      await this.testDatabaseConnection();

      console.log('✅ Services initialized');

    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
      throw error;
    }
  }

  async testDatabaseConnection() {
    try {
      const result = await connectionPool.query('SELECT NOW() as current_time');
      console.log('✅ Database connected:', result.rows[0].current_time);
    } catch (error) {
      console.warn('⚠️  Database connection failed:', error.message);
      // Don't throw - allow server to start without DB
    }
  }

  async start() {
    if (!this.initialized) {
      await this.init();
    }

    const port = this.config.server?.port || process.env.PORT || 3001;
    const host = this.config.server?.host || '0.0.0.0';

    return new Promise((resolve, reject) => {
      this.server.listen(port, host, (err) => {
        if (err) {
          reject(err);
          return;
        }

        console.log(`🌟 DEX Platform running on http://${host}:${port}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

        resolve({ host, port });
      });
    });
  }

  async stop() {
    console.log('🛑 Stopping DEX Platform...');

    try {
      // Stop services
      scheduler.stop();
      metricsCollector.stop();
      memoryLeakDetector.stopMonitoring();
      sessionManager.stopCleanup();
      wsManager.close();

      // Close database connections
      await connectionPool.closeAllPools();

      // Close server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }

      console.log('✅ Server stopped gracefully');

    } catch (error) {
      console.error('❌ Error stopping server:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      initialized: this.initialized,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: wsManager.getStats(),
      metrics: metricsCollector.getSummary(),
      config: {
        environment: process.env.NODE_ENV,
        port: this.config?.server?.port
      }
    };
  }

  async healthCheck() {
    const status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.APP_VERSION || '1.0.0'
    };

    // Check services
    const checks = {
      server: this.server?.listening || false,
      database: false,
      websocket: wsManager.getStats().totalClients >= 0,
      memory: memoryLeakDetector.healthCheck(),
      scheduler: scheduler.healthCheck(),
      sessions: sessionManager.getStats()
    };

    // Test database
    try {
      await connectionPool.query('SELECT 1');
      checks.database = true;
    } catch (_error) {
      checks.database = false;
    }

    // Determine overall status
    const healthyServices = Object.values(checks).filter(Boolean).length;
    const totalServices = Object.keys(checks).length;

    if (healthyServices === totalServices) {
      status.status = 'healthy';
    } else if (healthyServices >= totalServices * 0.7) {
      status.status = 'degraded';
    } else {
      status.status = 'unhealthy';
    }

    status.checks = checks;
    status.healthyServices = `${healthyServices}/${totalServices}`;

    return status;
  }
}

// Create singleton instance
const dexServer = new DEXServer();

// Export for use in other modules
module.exports = dexServer;

// Start server if this file is run directly
if (require.main === module) {
  dexServer.start().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}