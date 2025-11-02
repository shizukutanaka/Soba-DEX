/**
 * Multi-Chain Configuration for Soba DEX
 * Supports Ethereum, Arbitrum, Optimism, and Polygon
 */

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  layer: 1 | 2;
  gasOptimization: number; // Percentage reduction vs Ethereum
  logo: string;
  color: string;
  isTestnet: boolean;
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  // Mainnet Chains
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    rpcUrl: process.env.REACT_APP_ETH_RPC || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    layer: 1,
    gasOptimization: 0,
    logo: '⟠',
    color: '#627EEA',
    isTestnet: false
  },

  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    rpcUrl: process.env.REACT_APP_ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://arbiscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    layer: 2,
    gasOptimization: 95, // 95% cheaper than Ethereum
    logo: '🔷',
    color: '#28A0F0',
    isTestnet: false
  },

  10: {
    chainId: 10,
    name: 'Optimism',
    shortName: 'Optimism',
    rpcUrl: process.env.REACT_APP_OPTIMISM_RPC || 'https://mainnet.optimism.io',
    blockExplorer: 'https://optimistic.etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    layer: 2,
    gasOptimization: 90, // 90% cheaper than Ethereum
    logo: '🔴',
    color: '#FF0420',
    isTestnet: false
  },

  137: {
    chainId: 137,
    name: 'Polygon',
    shortName: 'Polygon',
    rpcUrl: process.env.REACT_APP_POLYGON_RPC || 'https://polygon-rpc.com',
    blockExplorer: 'https://polygonscan.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    layer: 2,
    gasOptimization: 99, // 99% cheaper than Ethereum
    logo: '⬣',
    color: '#8247E5',
    isTestnet: false
  },

  // Testnet Chains
  5: {
    chainId: 5,
    name: 'Goerli Testnet',
    shortName: 'Goerli',
    rpcUrl: process.env.REACT_APP_GOERLI_RPC || 'https://goerli.infura.io/v3/demo',
    blockExplorer: 'https://goerli.etherscan.io',
    nativeCurrency: {
      name: 'Goerli Ether',
      symbol: 'ETH',
      decimals: 18
    },
    layer: 1,
    gasOptimization: 0,
    logo: '⟠',
    color: '#627EEA',
    isTestnet: true
  },

  11155111: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    shortName: 'Sepolia',
    rpcUrl: process.env.REACT_APP_SEPOLIA_RPC || 'https://sepolia.infura.io/v3/demo',
    blockExplorer: 'https://sepolia.etherscan.io',
    nativeCurrency: {
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18
    },
    layer: 1,
    gasOptimization: 0,
    logo: '⟠',
    color: '#627EEA',
    isTestnet: true
  },

  421613: {
    chainId: 421613,
    name: 'Arbitrum Goerli',
    shortName: 'Arb Goerli',
    rpcUrl: process.env.REACT_APP_ARB_GOERLI_RPC || 'https://goerli-rollup.arbitrum.io/rpc',
    blockExplorer: 'https://goerli.arbiscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    layer: 2,
    gasOptimization: 95,
    logo: '🔷',
    color: '#28A0F0',
    isTestnet: true
  },

  80001: {
    chainId: 80001,
    name: 'Mumbai Testnet',
    shortName: 'Mumbai',
    rpcUrl: process.env.REACT_APP_MUMBAI_RPC || 'https://rpc-mumbai.maticvigil.com',
    blockExplorer: 'https://mumbai.polygonscan.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    layer: 2,
    gasOptimization: 99,
    logo: '⬣',
    color: '#8247E5',
    isTestnet: true
  }
};

/**
 * Get chain configuration by chain ID
 */
export const getChainConfig = (chainId: number): ChainConfig | undefined => {
  return SUPPORTED_CHAINS[chainId];
};

/**
 * Check if chain is Layer 2
 */
export const isLayer2 = (chainId: number): boolean => {
  const chain = getChainConfig(chainId);
  return chain?.layer === 2;
};

/**
 * Check if chain is testnet
 */
export const isTestnet = (chainId: number): boolean => {
  const chain = getChainConfig(chainId);
  return chain?.isTestnet || false;
};

/**
 * Get mainnet chains only
 */
export const getMainnetChains = (): ChainConfig[] => {
  return Object.values(SUPPORTED_CHAINS).filter(chain => !chain.isTestnet);
};

/**
 * Get testnet chains only
 */
export const getTestnetChains = (): ChainConfig[] => {
  return Object.values(SUPPORTED_CHAINS).filter(chain => chain.isTestnet);
};

/**
 * Get Layer 2 chains
 */
export const getLayer2Chains = (): ChainConfig[] => {
  return Object.values(SUPPORTED_CHAINS).filter(chain => chain.layer === 2);
};

/**
 * Get gas savings estimate for a chain
 */
export const getGasSavings = (chainId: number): {
  savingsPercentage: number;
  averageCost: string;
  estimatedTime: string;
} => {
  const chain = getChainConfig(chainId);

  if (!chain) {
    return {
      savingsPercentage: 0,
      averageCost: 'N/A',
      estimatedTime: 'N/A'
    };
  }

  const costEstimates: Record<number, { cost: string; time: string }> = {
    1: { cost: '$15-50', time: '15 seconds - 5 minutes' },
    42161: { cost: '$0.50-2', time: '1-3 seconds' },
    10: { cost: '$1-3', time: '1-5 seconds' },
    137: { cost: '$0.01-0.10', time: '2-5 seconds' },
    5: { cost: '$0.00 (Testnet)', time: '15 seconds - 5 minutes' },
    11155111: { cost: '$0.00 (Testnet)', time: '15 seconds - 5 minutes' },
    421613: { cost: '$0.00 (Testnet)', time: '1-3 seconds' },
    80001: { cost: '$0.00 (Testnet)', time: '2-5 seconds' }
  };

  const estimate = costEstimates[chainId] || { cost: 'N/A', time: 'N/A' };

  return {
    savingsPercentage: chain.gasOptimization,
    averageCost: estimate.cost,
    estimatedTime: estimate.time
  };
};

/**
 * Format chain ID to hex for MetaMask
 */
export const formatChainIdToHex = (chainId: number): string => {
  return `0x${chainId.toString(16)}`;
};

/**
 * Get explorer URL for address
 */
export const getExplorerAddressUrl = (chainId: number, address: string): string => {
  const chain = getChainConfig(chainId);
  return chain ? `${chain.blockExplorer}/address/${address}` : '';
};

/**
 * Get explorer URL for transaction
 */
export const getExplorerTxUrl = (chainId: number, txHash: string): string => {
  const chain = getChainConfig(chainId);
  return chain ? `${chain.blockExplorer}/tx/${txHash}` : '';
};

/**
 * Get explorer URL for token
 */
export const getExplorerTokenUrl = (chainId: number, tokenAddress: string): string => {
  const chain = getChainConfig(chainId);
  return chain ? `${chain.blockExplorer}/token/${tokenAddress}` : '';
};

/**
 * Default chain ID (use from env or fallback to Ethereum)
 */
export const DEFAULT_CHAIN_ID = parseInt(
  process.env.REACT_APP_DEFAULT_CHAIN_ID || '1',
  10
);

/**
 * Check if chain is supported
 */
export const isChainSupported = (chainId: number): boolean => {
  return chainId in SUPPORTED_CHAINS;
};

/**
 * Get all supported chain IDs
 */
export const getSupportedChainIds = (): number[] => {
  return Object.keys(SUPPORTED_CHAINS).map(Number);
};
