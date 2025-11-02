/**
 * Gas Optimization Utilities for Soba DEX
 * Provides gas price estimation, optimization, and transaction batching
 */

import { ethers } from 'ethers';

export interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  estimatedCost: string;
  estimatedCostUSD?: string;
  estimatedTime: string;
}

export type GasPriority = 'low' | 'medium' | 'high' | 'instant';

/**
 * Optimize gas price based on priority level
 */
export async function optimizeGasPrice(
  provider: ethers.BrowserProvider,
  priority: GasPriority = 'medium'
): Promise<GasEstimate> {
  const feeData = await provider.getFeeData();
  const block = await provider.getBlock('latest');

  if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
    throw new Error('Unable to fetch gas fee data');
  }

  // Priority multipliers
  const multipliers: Record<GasPriority, number> = {
    low: 0.85,      // 15% discount, slower
    medium: 1.0,    // Standard speed
    high: 1.2,      // 20% premium, faster
    instant: 1.5    // 50% premium, very fast
  };

  const multiplier = multipliers[priority];

  let maxFeePerGas = (feeData.maxFeePerGas * BigInt(Math.floor(multiplier * 100))) / 100n;
  let maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 100))) / 100n;

  // Ensure maxFeePerGas is at least maxPriorityFeePerGas + baseFee
  const baseFee = block?.baseFeePerGas || 0n;
  const minMaxFeePerGas = maxPriorityFeePerGas + baseFee;

  if (maxFeePerGas < minMaxFeePerGas) {
    maxFeePerGas = minMaxFeePerGas;
  }

  // Estimated gas limit (will be refined per transaction)
  const gasLimit = 200000n; // Default estimate

  // Calculate estimated cost
  const estimatedCost = ethers.formatEther(maxFeePerGas * gasLimit);

  // Estimated time based on priority
  const estimatedTimes: Record<GasPriority, string> = {
    low: '5-10 minutes',
    medium: '1-3 minutes',
    high: '< 1 minute',
    instant: '< 30 seconds'
  };

  return {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    estimatedCost,
    estimatedTime: estimatedTimes[priority]
  };
}

/**
 * Estimate gas for a specific transaction
 */
export async function estimateTransactionGas(
  provider: ethers.BrowserProvider,
  transaction: ethers.TransactionRequest,
  priority: GasPriority = 'medium'
): Promise<GasEstimate> {
  const gasEstimate = await optimizeGasPrice(provider, priority);

  try {
    // Get accurate gas limit for this specific transaction
    const estimatedGasLimit = await provider.estimateGas(transaction);

    // Add 20% buffer for safety
    const gasLimit = (estimatedGasLimit * 120n) / 100n;

    const estimatedCost = ethers.formatEther(gasEstimate.maxFeePerGas * gasLimit);

    return {
      ...gasEstimate,
      gasLimit,
      estimatedCost
    };
  } catch (error) {
    console.error('Failed to estimate gas:', error);
    return gasEstimate;
  }
}

/**
 * Get current gas price in Gwei
 */
export async function getCurrentGasPrice(provider: ethers.BrowserProvider): Promise<{
  slow: string;
  standard: string;
  fast: string;
  instant: string;
}> {
  const feeData = await provider.getFeeData();

  if (!feeData.maxFeePerGas) {
    throw new Error('Unable to fetch gas price');
  }

  const basePrice = feeData.maxFeePerGas;

  return {
    slow: ethers.formatUnits((basePrice * 85n) / 100n, 'gwei'),
    standard: ethers.formatUnits(basePrice, 'gwei'),
    fast: ethers.formatUnits((basePrice * 120n) / 100n, 'gwei'),
    instant: ethers.formatUnits((basePrice * 150n) / 100n, 'gwei')
  };
}

/**
 * Batch multiple transactions using Multicall3
 */
export async function batchTransactions(
  provider: ethers.BrowserProvider,
  transactions: Array<{ target: string; callData: string; allowFailure?: boolean }>
): Promise<ethers.TransactionResponse> {
  const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

  const multicallAbi = [
    'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[] returnData)'
  ];

  const multicall = new ethers.Contract(MULTICALL3_ADDRESS, multicallAbi, await provider.getSigner());

  const calls = transactions.map(tx => ({
    target: tx.target,
    allowFailure: tx.allowFailure ?? false,
    callData: tx.callData
  }));

  return await multicall.aggregate3(calls);
}

/**
 * Calculate gas savings percentage compared to Ethereum mainnet
 */
export function calculateGasSavings(chainId: number): number {
  const savings: Record<number, number> = {
    1: 0,       // Ethereum - baseline
    42161: 95,  // Arbitrum - 95% cheaper
    10: 90,     // Optimism - 90% cheaper
    137: 99     // Polygon - 99% cheaper
  };

  return savings[chainId] || 0;
}

/**
 * Get gas price history for the last N blocks
 */
export async function getGasPriceHistory(
  provider: ethers.BrowserProvider,
  blocks: number = 10
): Promise<Array<{ blockNumber: number; gasPrice: string }>> {
  const currentBlock = await provider.getBlockNumber();
  const history: Array<{ blockNumber: number; gasPrice: string }> = [];

  for (let i = 0; i < blocks; i++) {
    const blockNumber = currentBlock - i;
    const block = await provider.getBlock(blockNumber);

    if (block && block.baseFeePerGas) {
      history.push({
        blockNumber,
        gasPrice: ethers.formatUnits(block.baseFeePerGas, 'gwei')
      });
    }
  }

  return history;
}

/**
 * Recommend optimal gas priority based on network congestion
 */
export async function recommendGasPriority(
  provider: ethers.BrowserProvider
): Promise<{ priority: GasPriority; reason: string }> {
  try {
    const history = await getGasPriceHistory(provider, 5);

    if (history.length < 2) {
      return { priority: 'medium', reason: 'Insufficient data' };
    }

    const latestGasPrice = parseFloat(history[0].gasPrice);
    const avgGasPrice = history.reduce((sum, h) => sum + parseFloat(h.gasPrice), 0) / history.length;

    // Network is congested
    if (latestGasPrice > avgGasPrice * 1.5) {
      return {
        priority: 'high',
        reason: 'Network is congested. Consider using high priority or waiting.'
      };
    }

    // Network is less congested
    if (latestGasPrice < avgGasPrice * 0.7) {
      return {
        priority: 'low',
        reason: 'Network is quiet. Low priority recommended to save gas.'
      };
    }

    // Normal conditions
    return {
      priority: 'medium',
      reason: 'Normal network conditions'
    };
  } catch (error) {
    console.error('Failed to recommend gas priority:', error);
    return { priority: 'medium', reason: 'Error analyzing network' };
  }
}

/**
 * Format gas price for display
 */
export function formatGasPrice(gasPrice: bigint, unit: 'wei' | 'gwei' | 'ether' = 'gwei'): string {
  const formatted = ethers.formatUnits(gasPrice, unit);
  const number = parseFloat(formatted);

  if (unit === 'gwei') {
    return `${number.toFixed(2)} Gwei`;
  } else if (unit === 'ether') {
    return `${number.toFixed(6)} ETH`;
  }

  return formatted;
}

/**
 * Convert USD to gas cost estimate (requires ETH price)
 */
export function estimateGasCostInUSD(
  gasCostETH: string,
  ethPriceUSD: number
): string {
  const costInETH = parseFloat(gasCostETH);
  const costInUSD = costInETH * ethPriceUSD;
  return `$${costInUSD.toFixed(2)}`;
}

/**
 * Get optimal gas parameters for transaction
 */
export async function getOptimalGasParams(
  provider: ethers.BrowserProvider,
  transaction: ethers.TransactionRequest,
  urgency: 'low' | 'normal' | 'urgent' = 'normal'
): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
  estimatedCost: string;
  recommendation: string;
}> {
  const priorityMap: Record<string, GasPriority> = {
    low: 'low',
    normal: 'medium',
    urgent: 'instant'
  };

  const priority = priorityMap[urgency];
  const estimate = await estimateTransactionGas(provider, transaction, priority);
  const recommendation = await recommendGasPriority(provider);

  return {
    maxFeePerGas: estimate.maxFeePerGas,
    maxPriorityFeePerGas: estimate.maxPriorityFeePerGas,
    gasLimit: estimate.gasLimit,
    estimatedCost: estimate.estimatedCost,
    recommendation: recommendation.reason
  };
}
