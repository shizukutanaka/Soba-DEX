/**
 * Simple DEX Server - Clean, Fast, Production-Ready
 * Following Carmack/Martin/Pike principles
 */

require('dotenv').config();
const express = require('express');
const compression = require('compression');
const { corsMiddleware } = require('./middleware/cors');
const { errorHandler, notFoundHandler, setupGlobalHandlers } = require('./middleware/errorHandler');
const { logger } = require('./utils/productionLogger');
const { securityService } = require('./middleware/security');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// Setup global error handlers
setupGlobalHandlers();

// Basic middleware
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Security
app.use(securityService.helmetMiddleware());
app.use(securityService.securityHeaders());
app.use(securityService.ipBlocker());
app.use(securityService.sanitizeInput());

// CORS
app.use(corsMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });
  next();
});

// Health routes
app.use('/health', require('./routes/health'));
app.use('/api/health', require('./routes/health'));

// API routes
app.get('/', (req, res) => {
  res.json({
    name: 'Soba DEX API',
    version: '2.1.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api'
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forcing shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
