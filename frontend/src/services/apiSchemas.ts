/**
 * API Response Schemas with Zod
 * SECURITY: Runtime validation of API responses
 */

import { z } from 'zod';

// Base API Response Schema
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    timestamp: z.number().optional(),
  });

// Price Data Schema
export const PriceDataSchema = z.object({
  symbol: z.string(),
  price: z.number().positive(),
  change24h: z.number(),
  volume24h: z.number().nonnegative(),
  timestamp: z.number(),
  high24h: z.number().optional(),
  low24h: z.number().optional(),
});

// Trade Stats Schema
export const TradeStatsSchema = z.object({
  totalVolume: z.number().nonnegative(),
  totalTrades: z.number().int().nonnegative(),
  activePairs: z.number().int().nonnegative(),
  topPairs: z.array(
    z.object({
      pair: z.string(),
      volume: z.number().nonnegative(),
      trades: z.number().int().nonnegative(),
    })
  ),
});

// Pool Schema
export const PoolSchema = z.object({
  id: z.string(),
  token0: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  token1: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  reserve0: z.string(),
  reserve1: z.string(),
  totalLiquidity: z.string(),
  lpTokenSupply: z.string(),
  fee: z.number().min(0).max(10000),
  apr: z.number().optional(),
});

// Swap Quote Schema
export const SwapQuoteSchema = z.object({
  amountIn: z.string(),
  amountOut: z.string(),
  priceImpact: z.number().min(0).max(100),
  minimumAmountOut: z.string(),
  path: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)),
  fee: z.string(),
  gasEstimate: z.string().optional(),
});

// Transaction Schema
export const TransactionSchema = z.object({
  hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  value: z.string(),
  gasUsed: z.string().optional(),
  gasPrice: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  timestamp: z.number(),
  type: z.enum(['swap', 'liquidity', 'transfer', 'approve']).optional(),
});

// Price Alert Schema
export const PriceAlertSchema = z.object({
  id: z.number(),
  userId: z.string(),
  symbol: z.string(),
  targetPrice: z.number().positive(),
  condition: z.enum(['above', 'below']),
  active: z.boolean(),
  triggered: z.boolean(),
  createdAt: z.number(),
  triggeredAt: z.number().optional(),
});

// User Portfolio Schema
export const UserPortfolioSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  totalValue: z.number().nonnegative(),
  tokens: z.array(
    z.object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      symbol: z.string(),
      balance: z.string(),
      value: z.number().nonnegative(),
      price: z.number().positive(),
    })
  ),
  positions: z.array(
    z.object({
      poolId: z.string(),
      liquidityTokens: z.string(),
      value: z.number().nonnegative(),
      share: z.number().min(0).max(100),
    })
  ),
});

// Health Status Schema
export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  uptime: z.number().nonnegative(),
  version: z.string(),
  timestamp: z.number(),
  checks: z
    .object({
      database: z.boolean(),
      redis: z.boolean().optional(),
      blockchain: z.boolean().optional(),
    })
    .optional(),
});

// Gas Estimate Schema
export const GasEstimateSchema = z.object({
  gasLimit: z.string(),
  gasPrice: z.string(),
  maxFeePerGas: z.string().optional(),
  maxPriorityFeePerGas: z.string().optional(),
  estimatedCost: z.string(),
  estimatedCostUSD: z.number().optional(),
});

// AI Prediction Schema
export const AIPredictionSchema = z.object({
  symbol: z.string(),
  prediction: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(100),
  targetPrice: z.number().positive().optional(),
  timeframe: z.string(),
  factors: z.array(z.string()).optional(),
  timestamp: z.number(),
});

// Export all schemas
export const schemas = {
  PriceData: PriceDataSchema,
  TradeStats: TradeStatsSchema,
  Pool: PoolSchema,
  SwapQuote: SwapQuoteSchema,
  Transaction: TransactionSchema,
  PriceAlert: PriceAlertSchema,
  UserPortfolio: UserPortfolioSchema,
  HealthStatus: HealthStatusSchema,
  GasEstimate: GasEstimateSchema,
  AIPrediction: AIPredictionSchema,
};

/**
 * Validate API response data
 */
export function validateApiResponse<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return { success: false, error: `Validation failed: ${errorMessage}` };
    }
    return { success: false, error: 'Unknown validation error' };
  }
}
