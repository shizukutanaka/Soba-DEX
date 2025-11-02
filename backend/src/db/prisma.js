/**
 * Prisma Client Instance
 * Singleton pattern for database connection
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/productionLogger');

// Prisma Client options
const prismaOptions = {
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
  errorFormat: 'pretty',
};

// Create Prisma Client instance
const prisma = new PrismaClient(prismaOptions);

// Log queries in development
if (process.env.NODE_ENV === 'development' && process.env.DEBUG === 'true') {
  prisma.$on('query', (e) => {
    logger.debug('Prisma Query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  });
}

// Log errors
prisma.$on('error', (e) => {
  logger.error('Prisma Error', {
    message: e.message,
    target: e.target,
  });
});

// Log info
prisma.$on('info', (e) => {
  logger.info('Prisma Info', {
    message: e.message,
  });
});

// Log warnings
prisma.$on('warn', (e) => {
  logger.warn('Prisma Warning', {
    message: e.message,
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Prisma connection');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Prisma connection');
  await prisma.$disconnect();
  process.exit(0);
});

// Test connection
async function testConnection() {
  try {
    await prisma.$connect();
    logger.info('✅ Database connection established');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed', {
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
}

// Disconnect helper
async function disconnect() {
  await prisma.$disconnect();
  logger.info('Database connection closed');
}

module.exports = {
  prisma,
  testConnection,
  disconnect,
};
