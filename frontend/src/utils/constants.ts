// Essential DEX constants
export const DEX_CONSTANTS = {
  // Default fee tiers (in basis points)
  DEFAULT_FEE: 30, // 0.3%
  LOW_FEE: 5,      // 0.05%
  MEDIUM_FEE: 30,  // 0.3%
  HIGH_FEE: 100,   // 1%

  // Slippage limits
  MIN_SLIPPAGE: 0.1,
  MAX_SLIPPAGE: 50,
  DEFAULT_SLIPPAGE: 0.5,

  // Transaction timeouts
  TX_TIMEOUT: 60000, // 60 seconds
  PRICE_UPDATE_INTERVAL: 5000, // 5 seconds

  // Minimum amounts
  MIN_ETH: 0.001,
  MIN_TOKEN: 0.000001,

  // Gas limits
  SWAP_GAS_LIMIT: 200000,
  ADD_LIQUIDITY_GAS_LIMIT: 300000,
  REMOVE_LIQUIDITY_GAS_LIMIT: 250000,

  // Common token addresses (example - would be network specific)
  TOKENS: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86a33E6417c0e30F9C4c5B94E6c5f4a5e6D1E',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },

  // Network configurations (configure via environment variables)
  NETWORKS: {
    MAINNET: {
      chainId: 1,
      name: 'Ethereum Mainnet',
      rpcUrl: process.env.REACT_APP_RPC_URL_MAINNET || '',
    },
    GOERLI: {
      chainId: 5,
      name: 'Goerli Testnet',
      rpcUrl: process.env.REACT_APP_RPC_URL_GOERLI || '',
    },
  },

  // UI Constants
  CHART_TIMEFRAMES: ['1m', '5m', '15m', '1h', '4h', '1d'],
  QUICK_AMOUNTS: [25, 50, 75, 100],
  MAX_PRICE_IMPACT_WARNING: 5, // 5%
  HIGH_PRICE_IMPACT_WARNING: 15, // 15%
};