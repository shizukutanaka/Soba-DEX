/**
 * Mocks Helper
 * Provides utilities for creating mocks and stubs
 * @ai-generated Test mock utilities
 */

const sinon = require('sinon');

/**
 * Create Redis mock
 * @returns {Object} Redis client mock
 */
const createRedisMock = () => ({
  get: sinon.stub().resolves(null),
  set: sinon.stub().resolves('OK'),
  del: sinon.stub().resolves(1),
  clear: sinon.stub().resolves('OK'),
  exists: sinon.stub().resolves(0),
  expire: sinon.stub().resolves(1),
  ttl: sinon.stub().resolves(-2),
  connect: sinon.stub().resolves(),
  disconnect: sinon.stub().resolves(),
  quit: sinon.stub().resolves('OK')
});

/**
 * Create Prisma mock
 * @returns {Object} Prisma client mock
 */
const createPrismaMock = () => ({
  user: {
    create: sinon.stub(),
    findUnique: sinon.stub(),
    findMany: sinon.stub(),
    update: sinon.stub(),
    delete: sinon.stub(),
    deleteMany: sinon.stub()
  },
  transaction: {
    create: sinon.stub(),
    findUnique: sinon.stub(),
    findMany: sinon.stub(),
    update: sinon.stub(),
    delete: sinon.stub(),
    deleteMany: sinon.stub()
  },
  priceHistory: {
    create: sinon.stub(),
    findUnique: sinon.stub(),
    findMany: sinon.stub(),
    deleteMany: sinon.stub()
  },
  portfolio: {
    create: sinon.stub(),
    findUnique: sinon.stub(),
    findMany: sinon.stub(),
    update: sinon.stub(),
    deleteMany: sinon.stub()
  },
  session: {
    create: sinon.stub(),
    findUnique: sinon.stub(),
    update: sinon.stub(),
    delete: sinon.stub(),
    deleteMany: sinon.stub()
  },
  $connect: sinon.stub().resolves(),
  $disconnect: sinon.stub().resolves()
});

/**
 * Create logger mock
 * @returns {Object} Logger mock
 */
const createLoggerMock = () => ({
  debug: sinon.stub(),
  info: sinon.stub(),
  warn: sinon.stub(),
  error: sinon.stub(),
  fatal: sinon.stub(),
  child: sinon.stub().returns({
    debug: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub()
  })
});

/**
 * Create response mock
 * @returns {Object} Express response mock
 */
const createResponseMock = () => ({
  status: sinon.stub().returnsThis(),
  json: sinon.stub().returnsThis(),
  send: sinon.stub().returnsThis(),
  setHeader: sinon.stub().returnsThis(),
  getHeader: sinon.stub(),
  end: sinon.stub().returnsThis()
});

/**
 * Create request mock
 * @param {Object} overrides - Request properties to override
 * @returns {Object} Express request mock
 */
const createRequestMock = (overrides = {}) => ({
  method: 'GET',
  path: '/',
  url: '/',
  headers: {},
  query: {},
  params: {},
  body: {},
  user: null,
  session: null,
  ...overrides
});

/**
 * Create next mock (middleware)
 * @returns {Function} Next middleware function
 */
const createNextMock = () => sinon.stub();

/**
 * Create price oracle mock
 * @returns {Object} Price oracle mock
 */
const createPriceOracleMock = () => ({
  getPrice: sinon.stub().resolves('2500.50'),
  getPrices: sinon.stub().resolves({ ETH: '2500.50', USDC: '1.00' }),
  subscribe: sinon.stub().resolves(),
  unsubscribe: sinon.stub().resolves(),
  isConnected: sinon.stub().returns(true)
});

/**
 * Create blockchain RPC mock
 * @returns {Object} Blockchain RPC mock
 */
const createRpcMock = () => ({
  call: sinon.stub().resolves('0x'),
  getBalance: sinon.stub().resolves('1000000000000000000'),
  getTransactionCount: sinon.stub().resolves(5),
  getGasPrice: sinon.stub().resolves('50000000000'),
  estimateGas: sinon.stub().resolves(300000),
  sendTransaction: sinon.stub().resolves('0x' + '0'.repeat(64)),
  getTransactionReceipt: sinon.stub().resolves(null),
  getBlock: sinon.stub().resolves({ number: 16000000 })
});

/**
 * Create timer mocks for testing async delays
 * @returns {Object} Timer utilities
 */
const createTimerMocks = () => {
  jest.useFakeTimers();
  return {
    advance: (ms) => jest.advanceTimersByTime(ms),
    advanceToNextTimer: () => jest.runOnlyPendingTimers(),
    advanceAll: () => jest.runAllTimers(),
    reset: () => jest.clearAllTimers(),
    restore: () => jest.useRealTimers()
  };
};

/**
 * Create crypto/signing mock
 * @returns {Object} Crypto utilities
 */
const createCryptoMock = () => ({
  sign: sinon.stub().returns('0x' + '0'.repeat(130)), // 65 bytes hex
  verify: sinon.stub().returns(true),
  hash: sinon.stub().returns('0x' + '0'.repeat(64)), // 32 bytes hex
  keccak256: sinon.stub().returns('0x' + '0'.repeat(64))
});

module.exports = {
  // Mock creators
  createRedisMock,
  createPrismaMock,
  createLoggerMock,
  createResponseMock,
  createRequestMock,
  createNextMock,
  createPriceOracleMock,
  createRpcMock,
  createTimerMocks,
  createCryptoMock,

  // Sinon utilities
  sinon
};
