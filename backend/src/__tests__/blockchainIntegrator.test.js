/**
 * Blockchain Integrator Tests for Soba DEX v3.4.0
 *
 * Unit tests for the multi-chain blockchain integration service
 */

const BlockchainIntegrator = require('../ml/blockchainIntegrator');
const Web3 = require('web3');

// Mock Web3 for testing
jest.mock('web3', () => {
  return jest.fn(() => ({
    eth: {
      getBlockNumber: jest.fn(() => Promise.resolve(1000)),
      getBlock: jest.fn(() => Promise.resolve({
        number: 1000,
        transactions: [
          {
            hash: '0x123',
            from: '0xuser1',
            to: '0xcontract',
            value: '0',
            input: '0xa9059cbb'
          },
          {
            hash: '0x456',
            from: '0xuser2',
            to: '0xrouter',
            value: '1000000000000000000',
            input: '0x7ff36ab5'
          }
        ]
      }))
    }
  }));
});

describe('BlockchainIntegrator', () => {
  let blockchainIntegrator;

  beforeEach(() => {
    blockchainIntegrator = new BlockchainIntegrator({
      supportedChains: ['ethereum', 'bsc'],
      syncInterval: 1000, // Faster for testing
      maxRetries: 1
    });
  });

  afterEach(async () => {
    if (blockchainIntegrator) {
      await blockchainIntegrator.cleanup();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(blockchainIntegrator.initialize()).resolves.not.toThrow();
      expect(blockchainIntegrator.initialized).toBe(true);
    });

    test('should initialize supported chains', async () => {
      await blockchainIntegrator.initialize();

      const chains = blockchainIntegrator.getSupportedChains();
      expect(chains.length).toBeGreaterThan(0);
      expect(chains.some(c => c.name === 'Ethereum')).toBe(true);
    });

    test('should initialize DeFi protocols', async () => {
      await blockchainIntegrator.initialize();

      const protocols = blockchainIntegrator.getDeFiProtocols();
      expect(protocols.length).toBeGreaterThan(0);
      expect(protocols.some(p => p.name === 'Uniswap')).toBe(true);
    });

    test('should setup Web3 instances', async () => {
      await blockchainIntegrator.initialize();

      expect(blockchainIntegrator.web3Instances.size).toBeGreaterThan(0);
    });
  });

  describe('Chain Management', () => {
    beforeEach(async () => {
      await blockchainIntegrator.initialize();
    });

    test('should get latest block number', async () => {
      const blockNumber = await blockchainIntegrator.getLatestBlock(1); // Ethereum
      expect(typeof blockNumber).toBe('number');
      expect(blockNumber).toBeGreaterThan(0);
    });

    test('should get block data', async () => {
      const blockData = await blockchainIntegrator.getBlockData(1, 1000);
      expect(blockData).toHaveProperty('transactions');
      expect(Array.isArray(blockData.transactions)).toBe(true);
    });

    test('should handle chain sync errors gracefully', async () => {
      Web3.mockImplementationOnce(() => ({
        eth: {
          getBlockNumber: jest.fn(() => Promise.reject(new Error('RPC Error')))
        }
      }));

      await expect(blockchainIntegrator.syncChain(1)).resolves.not.toThrow();
    });
  });

  describe('Transaction Processing', () => {
    beforeEach(async () => {
      await blockchainIntegrator.initialize();

      // Mock transaction processing methods
      blockchainIntegrator.detectSwapTransaction = jest.fn().mockResolvedValue(true);
      blockchainIntegrator.parseSwapTransaction = jest.fn().mockResolvedValue({
        protocol: 'uniswap',
        chainId: 1,
        txHash: '0x123',
        tokenIn: '0xA0b86a33E6C8DC8E4c2f5E6d2d5e4c5e8f5e6f7a8',
        tokenOut: '0x6B3595068778DD592e39A122f4f5a5CF09C90fE2',
        amountIn: '1000000000000000000',
        amountOut: '2000000000000000000000'
      });
      blockchainIntegrator.recordSwapEvent = jest.fn().mockResolvedValue();
    });

    test('should process transactions successfully', async () => {
      const mockTx = {
        hash: '0x123',
        from: '0xuser',
        to: '0xcontract',
        value: '0',
        input: '0xa9059cbb'
      };

      await blockchainIntegrator.processTransaction(1, mockTx);

      expect(blockchainIntegrator.detectSwapTransaction).toHaveBeenCalledWith('uniswap', 1, mockTx);
    });

    test('should detect and record swap events', async () => {
      const mockTx = { hash: '0x123' };

      await blockchainIntegrator.processProtocolTransaction('uniswap', 1, mockTx);

      expect(blockchainIntegrator.recordSwapEvent).toHaveBeenCalled();
    });

    test('should check for arbitrage opportunities', async () => {
      // Add some swap data
      const pairKey = '0xA0b86a33E6C8DC8E4c2f5E6d2d5e4c5e8f5e6f7a8-0x6B3595068778DD592e39A122f4f5a5CF09C90fE2';
      blockchainIntegrator.crossChainAnalytics.set(pairKey, {
        swaps: [{
          amountIn: '1000000000000000000',
          amountOut: '2000000000000000000000'
        }]
      });

      // Process another swap with different rate
      const swapData = {
        tokenIn: '0xA0b86a33E6C8DC8E4c2f5E6d2d5e4c5e8f5e6f7a8',
        tokenOut: '0x6B3595068778DD592e39A122f4f5a5CF09C90fE2',
        amountIn: '1000000000000000000',
        amountOut: '1500000000000000000000' // Different rate
      };

      await blockchainIntegrator.recordSwapEvent('uniswap', 1, swapData);

      // Should emit arbitrage opportunity event
      expect(blockchainIntegrator.listeners('arbitrageOpportunity').length).toBeGreaterThan(0);
    });
  });

  describe('NFT Collection Management', () => {
    beforeEach(async () => {
      await blockchainIntegrator.initialize();
    });

    test('should add NFT collection successfully', async () => {
      const collectionData = {
        name: 'Test Collection',
        contractAddress: '0x1234567890abcdef',
        chainId: 1,
        symbol: 'TEST',
        totalSupply: 1000
      };

      const collection = await blockchainIntegrator.addNFTCollection(collectionData);

      expect(collection).toHaveProperty('id');
      expect(collection.name).toBe('Test Collection');
      expect(blockchainIntegrator.nftCollections.has(collection.id)).toBe(true);
    });

    test('should get NFT analytics', () => {
      // Add a collection first
      const collection = {
        id: 'test-collection',
        name: 'Test Collection',
        chainId: 1,
        contractAddress: '0x123'
      };
      blockchainIntegrator.nftCollections.set(collection.id, collection);

      const analytics = blockchainIntegrator.getNFTAnalytics();

      expect(Array.isArray(analytics)).toBe(true);
      expect(analytics.length).toBeGreaterThan(0);
    });
  });

  describe('Cross-Chain Analytics', () => {
    beforeEach(async () => {
      await blockchainIntegrator.initialize();
    });

    test('should get cross-chain analytics for token pair', () => {
      const tokenIn = '0xA0b86a33E6C8DC8E4c2f5E6d2d5e4c5e8f5e6f7a8';
      const tokenOut = '0x6B3595068778DD592e39A122f4f5a5CF09C90fE2';

      const analytics = blockchainIntegrator.getCrossChainAnalytics(tokenIn, tokenOut);
      expect(analytics).toBeDefined();
    });

    test('should track swap events across chains', async () => {
      const swapData = {
        protocol: 'uniswap',
        chainId: 1,
        txHash: '0x123',
        tokenIn: '0xA0b86a33E6C8DC8E4c2f5E6d2d5e4c5e8f5e6f7a8',
        tokenOut: '0x6B3595068778DD592e39A122f4f5a5CF09C90fE2',
        amountIn: '1000000000000000000',
        amountOut: '2000000000000000000000'
      };

      await blockchainIntegrator.recordSwapEvent('uniswap', 1, swapData);

      const pairKey = `${swapData.tokenIn}-${swapData.tokenOut}`;
      const analytics = blockchainIntegrator.crossChainAnalytics.get(pairKey);

      expect(analytics).toBeDefined();
      expect(analytics.swaps).toContain(swapData);
      expect(analytics.volume24h).toBeGreaterThan(0);
    });
  });

  describe('DeFi Protocol Integration', () => {
    beforeEach(async () => {
      await blockchainIntegrator.initialize();
    });

    test('should detect swap transactions', async () => {
      const tx = {
        hash: '0x123',
        input: '0xa9059cbb', // Transfer function, not swap
        value: '0'
      };

      const isSwap = await blockchainIntegrator.detectSwapTransaction('uniswap', 1, tx);
      expect(typeof isSwap).toBe('boolean');
    });

    test('should parse swap transaction data', async () => {
      const tx = { hash: '0x123' };

      const swapData = await blockchainIntegrator.parseSwapTransaction('uniswap', 1, tx);

      expect(swapData).toHaveProperty('protocol');
      expect(swapData).toHaveProperty('txHash');
      expect(swapData).toHaveProperty('tokenIn');
      expect(swapData).toHaveProperty('tokenOut');
    });

    test('should record liquidity events', async () => {
      blockchainIntegrator.detectLiquidityEvent = jest.fn().mockResolvedValue(true);
      blockchainIntegrator.parseLiquidityEvent = jest.fn().mockResolvedValue({
        type: 'add_liquidity',
        token0: '0xA0b86a33E6C8DC8E4c2f5E6d2d5e4c5e8f5e6f7a8',
        token1: '0x6B3595068778DD592e39A122f4f5a5CF09C90fE2',
        amount0: '1000000000000000000',
        amount1: '2000000000000000000000'
      });
      blockchainIntegrator.recordLiquidityEvent = jest.fn().mockResolvedValue();

      const tx = { hash: '0x456' };

      await blockchainIntegrator.processProtocolTransaction('uniswap', 1, tx);

      expect(blockchainIntegrator.recordLiquidityEvent).toHaveBeenCalled();
    });
  });

  describe('NFT Event Processing', () => {
    beforeEach(async () => {
      await blockchainIntegrator.initialize();

      // Add test NFT collection
      const collection = {
        id: 'test-collection',
        contractAddress: '0x1234567890abcdef',
        chainId: 1
      };
      blockchainIntegrator.nftCollections.set(collection.id, collection);

      blockchainIntegrator.recordNFTEvent = jest.fn().mockResolvedValue();
    });

    test('should process NFT transactions', async () => {
      const nftTx = {
        hash: '0x789',
        from: '0xuser',
        to: '0x1234567890abcdef', // NFT contract address
        value: '0'
      };

      await blockchainIntegrator.processNFTTransaction(1, nftTx);

      expect(blockchainIntegrator.recordNFTEvent).toHaveBeenCalled();
    });

    test('should determine NFT event type', () => {
      const tx = { from: '0xuser', to: '0xcontract', value: '1000000000000000000' };

      const eventType = blockchainIntegrator.determineNFTEventType(tx);
      expect(typeof eventType).toBe('string');
    });
  });

  describe('Error Handling', () => {
    test('should handle Web3 connection errors', async () => {
      Web3.mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });

      await expect(blockchainIntegrator.initialize()).resolves.not.toThrow();
    });

    test('should handle transaction processing errors gracefully', async () => {
      await blockchainIntegrator.initialize();

      blockchainIntegrator.detectSwapTransaction = jest.fn().mockRejectedValue(new Error('Parse error'));

      const tx = { hash: '0x123' };

      await expect(blockchainIntegrator.processTransaction(1, tx)).resolves.not.toThrow();
    });

    test('should handle NFT processing errors', async () => {
      await blockchainIntegrator.initialize();

      blockchainIntegrator.recordNFTEvent = jest.fn().mockRejectedValue(new Error('NFT error'));

      const tx = { hash: '0x789' };

      await expect(blockchainIntegrator.processNFTTransaction(1, tx)).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await blockchainIntegrator.initialize();
    });

    test('should sync chains within reasonable time', async () => {
      const startTime = Date.now();

      // Mock faster sync for testing
      blockchainIntegrator.getLatestBlock = jest.fn().mockResolvedValue(1000);
      blockchainIntegrator.getLastSyncBlock = jest.fn().mockResolvedValue(999);
      blockchainIntegrator.getBlockData = jest.fn().mockResolvedValue({ transactions: [] });

      await blockchainIntegrator.syncChain(1);

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle large number of transactions', async () => {
      const largeTxArray = Array(1000).fill().map((_, i) => ({
        hash: `0x${i}`,
        from: `0xuser${i}`,
        to: '0xcontract',
        value: '0'
      }));

      blockchainIntegrator.detectSwapTransaction = jest.fn().mockResolvedValue(false);

      const startTime = Date.now();

      for (const tx of largeTxArray) {
        await blockchainIntegrator.processTransaction(1, tx);
      }

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Memory Management', () => {
    test('should cleanup all resources', async () => {
      await blockchainIntegrator.initialize();

      // Add some test data
      blockchainIntegrator.chains.set(999, { name: 'Test Chain' });
      blockchainIntegrator.nftCollections.set('test-collection', { name: 'Test Collection' });

      await blockchainIntegrator.cleanup();

      expect(blockchainIntegrator.chains.size).toBe(0);
      expect(blockchainIntegrator.nftCollections.size).toBe(0);
      expect(blockchainIntegrator.web3Instances.size).toBe(0);
    });

    test('should limit cross-chain analytics size', async () => {
      await blockchainIntegrator.initialize();

      // Add many swap events
      for (let i = 0; i < 200; i++) {
        const swapData = {
          tokenIn: `0xtoken${i}`,
          tokenOut: `0xtoken${i + 1}`,
          amountIn: '1000',
          amountOut: '2000'
        };

        await blockchainIntegrator.recordSwapEvent('uniswap', 1, swapData);
      }

      // Should limit to 100 swaps per pair
      const pairKeys = Array.from(blockchainIntegrator.crossChainAnalytics.keys());
      for (const pairKey of pairKeys) {
        const analytics = blockchainIntegrator.crossChainAnalytics.get(pairKey);
        expect(analytics.swaps.length).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Integration', () => {
    test('should work with multiple chains simultaneously', async () => {
      await blockchainIntegrator.initialize();

      const chains = blockchainIntegrator.getSupportedChains();
      expect(chains.length).toBeGreaterThan(1);

      // Should be able to sync multiple chains
      for (const chain of chains.slice(0, 2)) {
        await expect(blockchainIntegrator.syncChain(chain.chainId)).resolves.not.toThrow();
      }
    });

    test('should handle mixed transaction types', async () => {
      await blockchainIntegrator.initialize();

      const transactions = [
        { hash: '0x1', input: '0xa9059cbb' }, // Transfer
        { hash: '0x2', input: '0x7ff36ab5' }, // Swap
        { hash: '0x3', to: '0x1234567890abcdef' } // NFT
      ];

      blockchainIntegrator.detectSwapTransaction = jest.fn()
        .mockResolvedValueOnce(false) // Transfer
        .mockResolvedValueOnce(true)  // Swap
        .mockResolvedValueOnce(false); // NFT

      for (const tx of transactions) {
        await blockchainIntegrator.processTransaction(1, tx);
      }

      expect(blockchainIntegrator.detectSwapTransaction).toHaveBeenCalledTimes(3);
    });
  });
});
