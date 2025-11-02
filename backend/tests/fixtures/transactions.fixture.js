/**
 * Transaction Fixtures for Testing
 * Provides reusable test data for transaction-related tests
 * @ai-generated Test fixture data
 */

const generateTestTransaction = (overrides = {}) => ({
  id: 'tx-' + Math.random().toString(36).substr(2, 9),
  hash: '0x' + Math.random().toString(16).substr(2, 64),
  type: 'SWAP',
  status: 'PENDING',
  userId: 'user-test',
  amount: '1000000000000000000', // 1 token in wei
  tokenIn: '0x' + Math.random().toString(16).substr(2, 40),
  tokenOut: '0x' + Math.random().toString(16).substr(2, 40),
  amountOut: '500000000000000000',
  slippage: '0.5',
  gasPrice: '50000000000',
  gasLimit: '300000',
  fee: '5000000000000000',
  blockNumber: Math.floor(Math.random() * 10000000),
  timestamp: Math.floor(Date.now() / 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
  error: null,
  ...overrides
});

const generateTestTransactions = (count = 3, baseOverrides = {}) => {
  return Array.from({ length: count }, (_, i) =>
    generateTestTransaction({
      hash: '0x' + i.toString().padStart(64, '0'),
      id: `tx-${i}`,
      ...baseOverrides
    })
  );
};

const testTransactionData = {
  // Pending swap
  pendingSwap: {
    type: 'SWAP',
    status: 'PENDING',
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    amount: '1000000000', // 1000 USDC
    amountOut: '500000000000000000', // 0.5 ETH
    slippage: '0.5',
    gasPrice: '50000000000'
  },

  // Completed swap
  completedSwap: {
    type: 'SWAP',
    status: 'CONFIRMED',
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    amount: '1000000000',
    amountOut: '500000000000000000',
    blockNumber: 16000000,
    completedAt: new Date(),
    error: null
  },

  // Failed transaction
  failedTransaction: {
    type: 'SWAP',
    status: 'FAILED',
    amount: '1000000000',
    error: 'Slippage exceeded',
    completedAt: new Date()
  },

  // Add liquidity
  addLiquidity: {
    type: 'ADD_LIQUIDITY',
    status: 'CONFIRMED',
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    amount: '1000000000',
    blockNumber: 16000000
  },

  // Remove liquidity
  removeLiquidity: {
    type: 'REMOVE_LIQUIDITY',
    status: 'CONFIRMED',
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    amount: '500000000000000000',
    blockNumber: 16000000
  },

  // Approval
  approval: {
    type: 'APPROVE',
    status: 'CONFIRMED',
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amount: '999999999999999999999', // Max uint256 essentially
    blockNumber: 16000000
  },

  // Transfer
  transfer: {
    type: 'TRANSFER',
    status: 'CONFIRMED',
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amount: '1000000000',
    blockNumber: 16000000
  }
};

const testTransactionStatuses = ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'];
const testTransactionTypes = ['SWAP', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY', 'APPROVE', 'TRANSFER'];

module.exports = {
  generateTestTransaction,
  generateTestTransactions,
  testTransactionData,
  testTransactionStatuses,
  testTransactionTypes
};
