/**
 * API Response Types
 * Type definitions for backend API responses
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface TradeStats {
  totalVolume24h: number;
  totalTrades24h: number;
  activeUsers24h: number;
  averageTradeSize: number;
  topPairs: TradingPair[];
  marketCap: number;
  liquidityLocked: number;
}

export interface TradingPair {
  symbol: string;
  volume: number;
  trades: number;
  price?: number;
  change24h?: number;
}

export interface Pool {
  id: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  totalLiquidity: string;
  apr?: number;
  volume24h?: number;
}

export interface LiquidityPosition {
  poolId: string;
  liquidity: string;
  token0Amount: string;
  token1Amount: string;
  share: number;
  rewards?: string;
}

export interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  fee: string;
  route: string[];
  minimumReceived: string;
}

export interface Transaction {
  hash: string;
  type: 'swap' | 'add_liquidity' | 'remove_liquidity' | 'approve';
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  from: string;
  to?: string;
  value?: string;
  gasUsed?: string;
  details?: any;
}

export interface PriceAlert {
  id: number;
  symbol: string;
  targetPrice: number;
  currentPrice: number;
  condition: 'above' | 'below';
  isActive: boolean;
  createdAt: string;
}

export interface UserPortfolio {
  totalValue: number;
  tokens: TokenBalance[];
  positions: LiquidityPosition[];
  performance24h: number;
  performanceAll: number;
}

export interface TokenBalance {
  symbol: string;
  address: string;
  balance: string;
  value: number;
  price: number;
  change24h: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  timestamp: string;
  version?: string;
  environment?: string;
}

export interface MetricsData {
  requests: number;
  errors: number;
  avgResponseTime: number;
  uptime: number;
  memoryUsage: number;
  activeConnections: number;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  estimatedCost: string;
}

export interface AIPrediction {
  symbol: string;
  currentPrice: number;
  predictedPrice: number;
  confidence: number;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  timeframe: string;
  factors: string[];
}

export interface NotificationSettings {
  priceAlerts: boolean;
  transactionUpdates: boolean;
  liquidityChanges: boolean;
  email?: string;
  telegram?: string;
}

export interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
  timestamp?: number;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  lastUpdate: number;
}
