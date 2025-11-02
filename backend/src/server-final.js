'use strict';

require('dotenv').config();

const app = require('./app');
const { logger } = require('./utils/productionLogger');
const { secureAuth } = require('./utils/secureAuth');
const { dbPool } = require('./database/pool');
const { parseAndValidateOrigins } = require('./utils/originUtils');
const configValidator = require('./utils/configValidator');
const lifecycle = require('./utils/lifecycle');
const dexState = require('./services/dexState');
const { autonomousOperations } = require('./services/autonomousOps');
const { featureManager } = require('./config/features');

const CONFIG = {
  DEFAULT_PORT: 3001,
  DEFAULT_HOST: '0.0.0.0',
  DEFAULT_NODE_ENV: 'development',
  MIN_JWT_SECRET_LENGTH: 32,
  PORT_MIN: 1,
  PORT_MAX: 65535,
  SHUTDOWN_TIMEOUT_MS: 10000
};

const NODE_ENV = process.env.NODE_ENV || CONFIG.DEFAULT_NODE_ENV;
const PORT = resolvePort(process.env.PORT, CONFIG.DEFAULT_PORT);
const HOST = process.env.HOST || CONFIG.DEFAULT_HOST;

const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5000;
const DEFAULT_HEADERS_TIMEOUT_MS = 6000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;

function resolveIntegerEnv(value, fallback, {
  min = Number.MIN_SAFE_INTEGER,
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

function resolvePort(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < CONFIG.PORT_MIN || parsed > CONFIG.PORT_MAX) {
    throw new Error(`PORT must be an integer between ${CONFIG.PORT_MIN} and ${CONFIG.PORT_MAX}`);
  }
  return parsed;
}

function validateEnvironment() {
  const errors = [];

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required');
  } else if (jwtSecret.length < CONFIG.MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET must be at least ${CONFIG.MIN_JWT_SECRET_LENGTH} characters long`);
  }

  if (!['development', 'production', 'test'].includes(NODE_ENV)) {
    errors.push('NODE_ENV must be one of development, production, or test');
  }

  if (NODE_ENV === 'production') {
    const rawOrigins = process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || '';
    const {
      validOrigins,
      invalidOrigins,
      duplicateOrigins
    } = parseAndValidateOrigins(rawOrigins);

    if (validOrigins.length === 0) {
      errors.push('CORS_ORIGINS must be configured with at least one valid domain in production');
    }

    if (invalidOrigins.length > 0) {
      invalidOrigins.forEach(origin => {
        logger.error('Invalid CORS origin configured', { origin });
      });
      errors.push('CORS_ORIGINS contains invalid entries');
    }

    if (duplicateOrigins.length > 0) {
      duplicateOrigins.forEach(origin => {
        logger.warn('Duplicate CORS origin detected', { origin });
      });
    }

    process.env.CORS_ORIGINS = validOrigins.join(',');
    logger.info('Validated CORS origins', { count: validOrigins.length, origins: validOrigins });
  }

  if (errors.length > 0) {
    errors.forEach(message => logger.error(message));
    throw new Error('Environment validation failed');
  }
}

validateEnvironment();

const configReport = configValidator.getReport();
if (!configReport.validation.valid) {
  logger.error('Configuration validation failed', configReport.validation);
  throw new Error('Configuration validation failed');
}

configReport.validation.warnings.forEach(warning => {
  logger.warn('Configuration warning', warning);
});

logger.info('Configuration validation passed', {
  warnings: configReport.validation.warnings,
  environment: configReport.environment
});

const enabledFeatures = featureManager.getEnabledFeatures();
const disabledFeatures = Object.entries(featureManager.getAllFeatures())
  .filter(([_, config]) => !config.enabled)
  .map(([name, _]) => name);

logger.info('Feature matrix initialized', {
  enabled: enabledFeatures,
  disabled: disabledFeatures,
  summary: `${enabledFeatures.length} enabled, ${disabledFeatures.length} disabled`
});

const keepAliveTimeoutMs = resolveIntegerEnv(
  process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS,
  DEFAULT_KEEP_ALIVE_TIMEOUT_MS,
  { min: 1000, max: 600000, settingName: 'SERVER_KEEP_ALIVE_TIMEOUT_MS' }
);

const resolvedHeadersTimeout = resolveIntegerEnv(
  process.env.SERVER_HEADERS_TIMEOUT_MS,
  DEFAULT_HEADERS_TIMEOUT_MS,
  { min: keepAliveTimeoutMs + 1000, max: 601000, settingName: 'SERVER_HEADERS_TIMEOUT_MS' }
);

const headersTimeoutMs = Math.max(resolvedHeadersTimeout, keepAliveTimeoutMs + 1000);

if (headersTimeoutMs !== resolvedHeadersTimeout) {
  logger.warn('Adjusted SERVER_HEADERS_TIMEOUT_MS to exceed SERVER_KEEP_ALIVE_TIMEOUT_MS by 1000ms', {
    requested: resolvedHeadersTimeout,
    applied: headersTimeoutMs
  });
}

const requestTimeoutMs = resolveIntegerEnv(
  process.env.SERVER_REQUEST_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  { min: 1000, max: 1800000, settingName: 'SERVER_REQUEST_TIMEOUT_MS' }
);

let server;

bootstrap().catch(error => {
  logger.error('Failed to start Soba DEX backend', { error: error.message });
  process.exit(1);
});

async function bootstrap() {
  await dexState.loadState();
  dbPool.initialize();
  lifecycle.setStatus('starting', {
    environment: NODE_ENV,
    host: HOST,
    port: PORT,
    timeouts: {
      keepAliveTimeoutMs,
      headersTimeoutMs,
      requestTimeoutMs
    }
  });

  server = app.listen(PORT, HOST, () => {
    const lifecycleMetadata = {
      environment: NODE_ENV,
      host: HOST,
      port: PORT,
      pid: process.pid,
      warnings: configReport.validation.warnings
    };

    if (configReport.validation.warnings.length > 0) {
      lifecycle.markDegraded(lifecycleMetadata);
    } else {
      lifecycle.markHealthy(lifecycleMetadata);
    }
    logger.info('Soba DEX backend started', {
      environment: NODE_ENV,
      host: HOST,
      port: PORT,
      pid: process.pid,
      nodeVersion: process.version
    });

    logger.info('HTTP server timeouts configured', {
      keepAliveTimeoutMs,
      headersTimeoutMs,
      requestTimeoutMs
    });

    if (configReport.configuration) {
      logger.info('Runtime configuration snapshot', {
        port: configReport.configuration.port,
        rateLimitMax: configReport.configuration.rateLimitMax,
        rateLimitWindowMs: configReport.configuration.rateLimitWindowMs,
        requestBodyLimitBytes: configReport.configuration.requestBodyLimitBytes
      });
    }

    autonomousOperations.initialize();
    logger.info('Autonomous operations initialized', {
      healthIntervalMs: autonomousOperations.healthIntervalMs,
      backupIntervalMs: autonomousOperations.backupIntervalMs
    });
  });

  if (typeof server.keepAliveTimeout === 'number') {
    server.keepAliveTimeout = keepAliveTimeoutMs;
  }

  if (typeof server.headersTimeout === 'number') {
    server.headersTimeout = headersTimeoutMs;
  }

  if (typeof server.requestTimeout === 'number') {
    server.requestTimeout = requestTimeoutMs;
  }

  server.on('error', (error) => {
    logger.error('HTTP server error', { error: error.message, stack: error.stack });
    lifecycle.markDegraded({ reason: 'server_error', error: error.message });
    shutdown('serverError', 1);
  });

  server.on('clientError', (error, socket) => {
    logger.warn('Client connection error', { error: error.message });
    if (socket && typeof socket.destroy === 'function') {
      socket.destroy();
    }
  });
}

let isShuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.warn(`${signal} received. Commencing graceful shutdown.`);
  lifecycle.markShuttingDown({ signal });

  const timeout = setTimeout(() => {
    logger.error('Shutdown timed out. Forcing exit.');
    lifecycle.markStopped({ forced: true });
    process.exit(1);
  }, CONFIG.SHUTDOWN_TIMEOUT_MS).unref();

  try {
    if (server) {
      await new Promise(resolve => {
        server.close(err => {
          if (err) {
            logger.error('Error closing HTTP server', { error: err.message });
          }
          resolve();
        });
      });
    }

    await dbPool.close();
    secureAuth.stopCleanup();
    await dexState.flush().catch(error => {
      logger.error('Failed to flush dex state during shutdown', { error: error.message });
    });

    clearTimeout(timeout);
    logger.info('Shutdown completed successfully.');
    lifecycle.markStopped({ exitCode });
    process.exit(exitCode);
  } catch (error) {
    clearTimeout(timeout);
    logger.error('Error during shutdown', { error: error.message });
    lifecycle.markStopped({ exitCode: 1, error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException', 1);
});

process.on('warning', (warning) => {
  logger.warn('Process warning emitted', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

module.exports = server;
