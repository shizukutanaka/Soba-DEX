/**
 * Database Test Helper
 * Provides utilities for database setup, teardown, and seeding
 * @ai-generated Test helper utilities
 */

const { PrismaClient } = require('@prisma/client');

let prismaInstance = null;

/**
 * Get or create Prisma instance for testing
 * @returns {PrismaClient} Prisma client instance
 */
const getPrismaInstance = () => {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'postgresql://test:test@localhost/dex_test'
        }
      }
    });
  }
  return prismaInstance;
};

/**
 * Connect to test database
 * @async
 * @returns {Promise<void>}
 */
const connectToDatabase = async () => {
  try {
    const prisma = getPrismaInstance();
    await prisma.$connect();
    console.log('✓ Connected to test database');
  } catch (error) {
    console.error('✗ Failed to connect to test database:', error.message);
    throw error;
  }
};

/**
 * Disconnect from test database
 * @async
 * @returns {Promise<void>}
 */
const disconnectDatabase = async () => {
  if (prismaInstance) {
    try {
      await prismaInstance.$disconnect();
      prismaInstance = null;
      console.log('✓ Disconnected from test database');
    } catch (error) {
      console.error('✗ Failed to disconnect from test database:', error.message);
      throw error;
    }
  }
};

/**
 * Clear all tables in test database
 * @async
 * @returns {Promise<void>}
 */
const clearDatabase = async () => {
  const prisma = getPrismaInstance();
  try {
    // Delete in reverse order of foreign key dependencies
    await prisma.priceAlert.deleteMany({});
    await prisma.gasAlert.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.portfolioSnapshot.deleteMany({});
    await prisma.portfolioHolding.deleteMany({});
    await prisma.portfolio.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.gasHistory.deleteMany({});
    await prisma.priceHistory.deleteMany({});
    await prisma.apiKey.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});

    console.log('✓ Cleared all test database tables');
  } catch (error) {
    console.error('✗ Failed to clear database:', error.message);
    throw error;
  }
};

/**
 * Seed database with test data
 * @async
 * @param {Object} data - Data to seed
 * @returns {Promise<Object>} Seeded data
 */
const seedDatabase = async (data = {}) => {
  const prisma = getPrismaInstance();
  const seededData = {};

  try {
    // Seed users
    if (data.users) {
      seededData.users = await Promise.all(
        data.users.map(user => prisma.user.create({ data: user }))
      );
    }

    // Seed transactions
    if (data.transactions) {
      seededData.transactions = await Promise.all(
        data.transactions.map(tx => prisma.transaction.create({ data: tx }))
      );
    }

    // Seed price history
    if (data.prices) {
      seededData.prices = await Promise.all(
        data.prices.map(price => prisma.priceHistory.create({ data: price }))
      );
    }

    // Seed portfolios
    if (data.portfolios) {
      seededData.portfolios = await Promise.all(
        data.portfolios.map(portfolio => prisma.portfolio.create({ data: portfolio }))
      );
    }

    console.log(`✓ Seeded database with test data`);
    return seededData;
  } catch (error) {
    console.error('✗ Failed to seed database:', error.message);
    throw error;
  }
};

/**
 * Create test transaction in database
 * @async
 * @param {Object} data - Transaction data
 * @returns {Promise<Object>} Created transaction
 */
const createTestTransaction = async (data) => {
  const prisma = getPrismaInstance();
  return prisma.transaction.create({ data });
};

/**
 * Create test user in database
 * @async
 * @param {Object} data - User data
 * @returns {Promise<Object>} Created user
 */
const createTestUser = async (data) => {
  const prisma = getPrismaInstance();
  return prisma.user.create({ data });
};

/**
 * Create test price in database
 * @async
 * @param {Object} data - Price data
 * @returns {Promise<Object>} Created price
 */
const createTestPrice = async (data) => {
  const prisma = getPrismaInstance();
  return prisma.priceHistory.create({ data });
};

/**
 * Fetch user from database
 * @async
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User object or null
 */
const getTestUser = async (userId) => {
  const prisma = getPrismaInstance();
  return prisma.user.findUnique({ where: { id: userId } });
};

/**
 * Fetch transaction from database
 * @async
 * @param {string} txId - Transaction ID
 * @returns {Promise<Object|null>} Transaction object or null
 */
const getTestTransaction = async (txId) => {
  const prisma = getPrismaInstance();
  return prisma.transaction.findUnique({ where: { id: txId } });
};

/**
 * Fetch price from database
 * @async
 * @param {string} priceId - Price ID
 * @returns {Promise<Object|null>} Price object or null
 */
const getTestPrice = async (priceId) => {
  const prisma = getPrismaInstance();
  return prisma.priceHistory.findUnique({ where: { id: priceId } });
};

module.exports = {
  // Instance management
  getPrismaInstance,
  connectToDatabase,
  disconnectDatabase,

  // Database operations
  clearDatabase,
  seedDatabase,

  // Create operations
  createTestTransaction,
  createTestUser,
  createTestPrice,

  // Read operations
  getTestUser,
  getTestTransaction,
  getTestPrice
};
