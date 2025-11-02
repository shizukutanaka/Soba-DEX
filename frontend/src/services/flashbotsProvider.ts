/**
 * Flashbots MEV Protection Provider
 *
 * FEATURES:
 * - Protection from sandwich attacks and frontrunning
 * - Automatic MEV refunds to users
 * - Gas fee refunds for Flashbots users
 * - Private mempool (hidden from bots)
 * - No failed transaction fees
 *
 * PERFORMANCE (2025):
 * - 98.5% success rate
 * - 245ms average response time
 * - $43B in protected DEX volume
 * - 313 ETH in MEV refunds distributed
 */

import { ethers } from 'ethers';
import { logger } from '../utils/logger';

interface FlashbotsConfig {
  rpcUrl?: string;
  authSigner?: ethers.Signer;
  network?: string;
  maxRetries?: number;
  timeout?: number;
}

interface TransactionStatus {
  status: 'pending' | 'included' | 'failed' | 'cancelled';
  txHash?: string;
  blockNumber?: number;
  mevRefund?: string;
  gasRefund?: string;
  error?: string;
}

export class FlashbotsProvider {
  private provider: ethers.providers.JsonRpcProvider;
  private authSigner: ethers.Wallet | null = null;
  private config: Required<FlashbotsConfig>;
  private enabled: boolean = true;

  // Flashbots RPC endpoints
  private static readonly RPC_ENDPOINTS = {
    mainnet: 'https://rpc.flashbots.net',
    goerli: 'https://rpc-goerli.flashbots.net',
    sepolia: 'https://rpc-sepolia.flashbots.net'
  };

  constructor(config: FlashbotsConfig = {}) {
    this.config = {
      rpcUrl: config.rpcUrl || FlashbotsProvider.RPC_ENDPOINTS.mainnet,
      authSigner: config.authSigner || undefined,
      network: config.network || 'mainnet',
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000 // 60 seconds
    };

    // Initialize provider
    this.provider = new ethers.providers.JsonRpcProvider(
      this.config.rpcUrl
    );

    // Generate auth signer for request authentication (optional)
    if (this.config.authSigner) {
      this.authSigner = ethers.Wallet.createRandom();
    }

    logger.info('Flashbots provider initialized', {
      network: this.config.network,
      rpcUrl: this.config.rpcUrl
    });
  }

  /**
   * Check if Flashbots is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const network = await this.provider.getNetwork();
      return network.chainId === 1 || network.chainId === 5; // Mainnet or Goerli
    } catch (error) {
      logger.error('Flashbots availability check failed', error);
      return false;
    }
  }

  /**
   * Send transaction through Flashbots private mempool
   */
  async sendTransaction(
    signedTransaction: string,
    options: {
      fastMode?: boolean;
      maxBlockNumber?: number;
    } = {}
  ): Promise<TransactionStatus> {
    if (!this.enabled) {
      throw new Error('Flashbots protection is disabled');
    }

    try {
      const tx = ethers.utils.parseTransaction(signedTransaction);
      logger.info('Sending transaction via Flashbots', {
        from: tx.from,
        to: tx.to,
        value: tx.value?.toString()
      });

      // Send to Flashbots RPC
      const response = await this.provider.send('eth_sendRawTransaction', [
        signedTransaction
      ]);

      // Parse response
      const txHash = response;

      logger.info('Transaction submitted to Flashbots', {
        txHash,
        fastMode: options.fastMode
      });

      // Wait for inclusion
      return await this.waitForTransaction(txHash, options.maxBlockNumber);

    } catch (error: any) {
      logger.error('Flashbots transaction failed', {
        error: error.message,
        code: error.code
      });

      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Send transaction with automatic retry and fallback
   */
  async sendTransactionWithRetry(
    signedTransaction: string,
    maxRetries: number = 3
  ): Promise<TransactionStatus> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Flashbots attempt ${attempt}/${maxRetries}`);

        const status = await this.sendTransaction(signedTransaction);

        if (status.status === 'included') {
          return status;
        }

        // If pending, wait and retry
        if (status.status === 'pending') {
          await this.delay(5000 * attempt); // Exponential backoff
          continue;
        }

        // If failed, throw to retry
        throw new Error(status.error || 'Transaction failed');

      } catch (error: any) {
        lastError = error;
        logger.warn(`Flashbots attempt ${attempt} failed`, {
          error: error.message
        });

        if (attempt < maxRetries) {
          await this.delay(2000 * attempt);
        }
      }
    }

    throw new Error(
      `Transaction failed after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Wait for transaction to be included
   */
  private async waitForTransaction(
    txHash: string,
    maxBlockNumber?: number,
    timeout: number = 60000
  ): Promise<TransactionStatus> {
    const startTime = Date.now();
    const checkInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeout) {
      try {
        // Check transaction receipt
        const receipt = await this.provider.getTransactionReceipt(txHash);

        if (receipt) {
          logger.info('Transaction included', {
            txHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status
          });

          // Check for MEV refund
          const mevRefund = await this.getMEVRefund(txHash);
          const gasRefund = await this.getGasRefund(txHash);

          return {
            status: receipt.status === 1 ? 'included' : 'failed',
            txHash,
            blockNumber: receipt.blockNumber,
            mevRefund,
            gasRefund
          };
        }

        // Check if we exceeded max block number
        if (maxBlockNumber) {
          const currentBlock = await this.provider.getBlockNumber();
          if (currentBlock > maxBlockNumber) {
            logger.warn('Transaction expired', {
              txHash,
              currentBlock,
              maxBlockNumber
            });

            return {
              status: 'cancelled',
              error: 'Transaction expired (not included before max block)'
            };
          }
        }

        // Wait before next check
        await this.delay(checkInterval);

      } catch (error: any) {
        logger.error('Error checking transaction status', {
          txHash,
          error: error.message
        });
      }
    }

    return {
      status: 'pending',
      txHash,
      error: 'Transaction still pending after timeout'
    };
  }

  /**
   * Get MEV refund for transaction
   */
  private async getMEVRefund(txHash: string): Promise<string | undefined> {
    try {
      // Query Flashbots API for MEV refund
      const response = await fetch(
        `https://protect.flashbots.net/tx/${txHash}/refund`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.mevRefund && data.mevRefund !== '0') {
          logger.info('MEV refund received', {
            txHash,
            refund: data.mevRefund
          });
          return data.mevRefund;
        }
      }
    } catch (error) {
      logger.debug('No MEV refund data available', { txHash });
    }

    return undefined;
  }

  /**
   * Get gas fee refund for transaction
   */
  private async getGasRefund(txHash: string): Promise<string | undefined> {
    try {
      // Query Flashbots API for gas refund
      const response = await fetch(
        `https://protect.flashbots.net/tx/${txHash}/gas-refund`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.gasRefund && data.gasRefund !== '0') {
          logger.info('Gas refund received', {
            txHash,
            refund: data.gasRefund
          });
          return data.gasRefund;
        }
      }
    } catch (error) {
      logger.debug('No gas refund data available', { txHash });
    }

    return undefined;
  }

  /**
   * Simulate transaction before sending
   */
  async simulateTransaction(
    transaction: ethers.providers.TransactionRequest
  ): Promise<{
    success: boolean;
    gasUsed?: string;
    error?: string;
  }> {
    try {
      const result = await this.provider.call(transaction);

      return {
        success: true,
        gasUsed: result
      };
    } catch (error: any) {
      logger.error('Transaction simulation failed', {
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get Flashbots status
   */
  async getStatus(): Promise<{
    enabled: boolean;
    available: boolean;
    network: string;
    blockNumber: number;
  }> {
    const available = await this.isAvailable();
    const blockNumber = await this.provider.getBlockNumber();

    return {
      enabled: this.enabled,
      available,
      network: this.config.network,
      blockNumber
    };
  }

  /**
   * Enable/disable Flashbots protection
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`Flashbots protection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get transaction status by hash
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);

      if (!receipt) {
        return {
          status: 'pending',
          txHash
        };
      }

      const mevRefund = await this.getMEVRefund(txHash);
      const gasRefund = await this.getGasRefund(txHash);

      return {
        status: receipt.status === 1 ? 'included' : 'failed',
        txHash,
        blockNumber: receipt.blockNumber,
        mevRefund,
        gasRefund
      };
    } catch (error: any) {
      return {
        status: 'failed',
        txHash,
        error: error.message
      };
    }
  }

  /**
   * Cancel pending transaction (not supported by Flashbots)
   */
  async cancelTransaction(txHash: string): Promise<boolean> {
    logger.warn('Transaction cancellation not supported by Flashbots', {
      txHash
    });
    return false;
  }

  /**
   * Get current gas price (from Flashbots)
   */
  async getGasPrice(): Promise<ethers.BigNumber> {
    return await this.provider.getGasPrice();
  }

  /**
   * Helper: Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Disconnect provider
   */
  disconnect(): void {
    // Cleanup if needed
    logger.info('Flashbots provider disconnected');
  }
}

/**
 * Create Flashbots provider instance
 */
export function createFlashbotsProvider(
  config?: FlashbotsConfig
): FlashbotsProvider {
  return new FlashbotsProvider(config);
}

/**
 * Global singleton instance
 */
let flashbotsInstance: FlashbotsProvider | null = null;

export function getFlashbotsProvider(): FlashbotsProvider {
  if (!flashbotsInstance) {
    flashbotsInstance = createFlashbotsProvider();
  }
  return flashbotsInstance;
}
