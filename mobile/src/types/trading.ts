/**
 * Trading Types
 *
 * Type definitions for trading-related functionality
 * Centralized for consistency and reusability
 *
 * @version 1.0.0
 */

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
}

export interface TradingPair {
  baseToken: Token;
  quoteToken: Token;
  pairAddress: string;
  liquidity: string;
  fee: number;
  apy: number;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  deadline: number;
  recipient?: string;
}

export interface LiquidityParams {
  tokenA: string;
  tokenB: string;
  amountA: string;
  amountB: string;
  deadline: number;
}

export interface Trade {
  id: string;
  type: 'buy' | 'sell' | 'swap';
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  amountOut: string;
  price: number;
  fee: string;
  timestamp: Date;
  txHash?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface PortfolioPosition {
  token: Token;
  amount: string;
  value: number;
  profitLoss: number;
  profitLossPercentage: number;
  averageCost: number;
}

export interface PriceAlert {
  id: string;
  token: string;
  condition: 'above' | 'below';
  targetPrice: number;
  isActive: boolean;
  createdAt: Date;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  estimatedCost: string;
  estimatedTime: string;
}

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  gasUsed: string;
  blockNumber: number;
  timestamp: Date;
}

export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export interface Order {
  id: string;
  type: OrderType;
  side: 'buy' | 'sell';
  token: string;
  amount: string;
  price?: string;
  stopPrice?: string;
  timeInForce: TimeInForce;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  filledAmount: string;
  remainingAmount: string;
  averageFillPrice: string;
  createdAt: Date;
  updatedAt: Date;
}
