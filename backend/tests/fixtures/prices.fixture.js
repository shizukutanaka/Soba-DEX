/**
 * Price Fixtures for Testing
 * Provides reusable test data for price-related tests
 * @ai-generated Test fixture data
 */

const generateTestPrice = (overrides = {}) => ({
  id: 'price-' + Math.random().toString(36).substr(2, 9),
  token: '0x' + Math.random().toString(16).substr(2, 40),
  price: (Math.random() * 10000).toString(),
  priceUSD: (Math.random() * 10000).toString(),
  marketCap: (Math.random() * 1000000000).toString(),
  volume24h: (Math.random() * 100000000).toString(),
  change24h: ((Math.random() - 0.5) * 10).toString(),
  timestamp: Math.floor(Date.now() / 1000),
  source: 'COINGECKO',
  createdAt: new Date(),
  ...overrides
});

const generateTestPrices = (count = 3, baseOverrides = {}) => {
  return Array.from({ length: count }, (_, i) =>
    generateTestPrice({
      id: `price-${i}`,
      ...baseOverrides
    })
  );
};

const testPriceData = {
  // ETH current price
  eth: {
    token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    price: '2500.50',
    priceUSD: '2500.50',
    marketCap: '300000000000',
    volume24h: '15000000000',
    change24h: '2.5'
  },

  // USDC current price
  usdc: {
    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    price: '1.00',
    priceUSD: '1.00',
    marketCap: '50000000000',
    volume24h: '5000000000',
    change24h: '0.01'
  },

  // DAI current price
  dai: {
    token: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    price: '0.999',
    priceUSD: '0.999',
    marketCap: '6000000000',
    volume24h: '500000000',
    change24h: '-0.02'
  },

  // High volatility token
  volatile: {
    token: '0x' + Math.random().toString(16).substr(2, 40),
    price: '0.0001',
    priceUSD: '0.0001',
    marketCap: '100000000',
    volume24h: '50000000',
    change24h: '50.5'
  },

  // Price with historical variation
  historical: [
    { price: '2400.00', timestamp: Math.floor(Date.now() / 1000) - 3600 * 24 },
    { price: '2450.00', timestamp: Math.floor(Date.now() / 1000) - 3600 * 12 },
    { price: '2475.00', timestamp: Math.floor(Date.now() / 1000) - 3600 * 6 },
    { price: '2500.50', timestamp: Math.floor(Date.now() / 1000) }
  ]
};

const testTokens = {
  weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  usdp: '0x8E870D67F660D95d5be530380D0eC0bd388289E1',
  unknown: '0x' + Math.random().toString(16).substr(2, 40)
};

const testPriceSources = ['COINGECKO', 'COINMARKETCAP', 'CHAINLINK', 'UNISWAP', 'CUSTOM'];

const testPriceTimestamps = {
  now: Math.floor(Date.now() / 1000),
  oneHourAgo: Math.floor(Date.now() / 1000) - 3600,
  oneDayAgo: Math.floor(Date.now() / 1000) - 86400,
  oneWeekAgo: Math.floor(Date.now() / 1000) - 604800,
  oneMonthAgo: Math.floor(Date.now() / 1000) - 2592000
};

module.exports = {
  generateTestPrice,
  generateTestPrices,
  testPriceData,
  testTokens,
  testPriceSources,
  testPriceTimestamps
};
