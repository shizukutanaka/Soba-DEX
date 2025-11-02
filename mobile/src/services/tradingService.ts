/**
 * Trading Service
 *
 * Centralized trading operations and API calls
 * Handles all trading-related functionality
 *
 * @version 1.0.0
 */

import { apiClient } from './apiClient';
import {
  SwapParams,
  LiquidityParams,
  Trade,
  Token,
  GasEstimate,
  TransactionStatus,
  ApiResponse
} from '../types';

class TradingService {
  /**
   * Execute token swap
   */
  async executeSwap(params: SwapParams): Promise<ApiResponse<Trade>> {
    try {
      const response = await apiClient.post('/api/trading/swap', params);
      return response.data;
    } catch (error) {
      console.error('Swap execution failed:', error);
      throw error;
    }
  }

  /**
   * Add liquidity to pool
   */
  async addLiquidity(params: LiquidityParams): Promise<ApiResponse<Trade>> {
    try {
      const response = await apiClient.post('/api/trading/add-liquidity', params);
      return response.data;
    } catch (error) {
      console.error('Add liquidity failed:', error);
      throw error;
    }
  }

  /**
   * Remove liquidity from pool
   */
  async removeLiquidity(params: Partial<LiquidityParams>): Promise<ApiResponse<Trade>> {
    try {
      const response = await apiClient.post('/api/trading/remove-liquidity', params);
      return response.data;
    } catch (error) {
      console.error('Remove liquidity failed:', error);
      throw error;
    }
  }

  /**
   * Get token price
   */
  async getTokenPrice(tokenAddress: string): Promise<ApiResponse<{ price: number; change24h: number }>> {
    try {
      const response = await apiClient.get(`/api/tokens/${tokenAddress}/price`);
      return response.data;
    } catch (error) {
      console.error('Get token price failed:', error);
      throw error;
    }
  }

  /**
   * Get gas estimate for transaction
   */
  async getGasEstimate(txParams: any): Promise<ApiResponse<GasEstimate>> {
    try {
      const response = await apiClient.post('/api/trading/gas-estimate', txParams);
      return response.data;
    } catch (error) {
      console.error('Get gas estimate failed:', error);
      throw error;
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txHash: string): Promise<ApiResponse<TransactionStatus>> {
    try {
      const response = await apiClient.get(`/api/transactions/${txHash}/status`);
      return response.data;
    } catch (error) {
      console.error('Get transaction status failed:', error);
      throw error;
    }
  }

  /**
   * Get user trading history
   */
  async getTradingHistory(
    address: string,
    params?: {
      limit?: number;
      offset?: number;
      token?: string;
      type?: 'buy' | 'sell' | 'swap';
    }
  ): Promise<ApiResponse<Trade[]>> {
    try {
      const queryParams = new URLSearchParams();

      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      if (params?.token) queryParams.append('token', params.token);
      if (params?.type) queryParams.append('type', params.type);

      const response = await apiClient.get(
        `/api/trading/history/${address}?${queryParams.toString()}`
      );
      return response.data;
    } catch (error) {
      console.error('Get trading history failed:', error);
      throw error;
    }
  }

  /**
   * Get portfolio summary
   */
  async getPortfolio(address: string): Promise<ApiResponse<{
    totalValue: number;
    tokens: Array<{
      token: Token;
      balance: string;
      value: number;
      profitLoss: number;
      profitLossPercentage: number;
    }>;
    profitLoss24h: number;
    profitLossPercentage24h: number;
  }>> {
    try {
      const response = await apiClient.get(`/api/portfolio/${address}`);
      return response.data;
    } catch (error) {
      console.error('Get portfolio failed:', error);
      throw error;
    }
  }

  /**
   * Get available trading pairs
   */
  async getTradingPairs(): Promise<ApiResponse<Array<{
    pairAddress: string;
    baseToken: Token;
    quoteToken: Token;
    liquidity: string;
    volume24h: string;
    fee: number;
    apy: number;
  }>>> {
    try {
      const response = await apiClient.get('/api/trading/pairs');
      return response.data;
    } catch (error) {
      console.error('Get trading pairs failed:', error);
      throw error;
    }
  }

  /**
   * Get price alerts
   */
  async getPriceAlerts(address: string): Promise<ApiResponse<Array<{
    id: string;
    token: string;
    condition: 'above' | 'below';
    targetPrice: number;
    isActive: boolean;
    createdAt: string;
  }>>> {
    try {
      const response = await apiClient.get(`/api/alerts/${address}`);
      return response.data;
    } catch (error) {
      console.error('Get price alerts failed:', error);
      throw error;
    }
  }

  /**
   * Create price alert
   */
  async createPriceAlert(
    address: string,
    alert: {
      token: string;
      condition: 'above' | 'below';
      targetPrice: number;
    }
  ): Promise<ApiResponse<{ id: string }>> {
    try {
      const response = await apiClient.post(`/api/alerts/${address}`, alert);
      return response.data;
    } catch (error) {
      console.error('Create price alert failed:', error);
      throw error;
    }
  }

  /**
   * Delete price alert
   */
  async deletePriceAlert(address: string, alertId: string): Promise<ApiResponse<boolean>> {
    try {
      const response = await apiClient.delete(`/api/alerts/${address}/${alertId}`);
      return response.data;
    } catch (error) {
      console.error('Delete price alert failed:', error);
      throw error;
    }
  }

  /**
   * Get market data for multiple tokens
   */
  async getMarketData(tokenAddresses: string[]): Promise<ApiResponse<Array<{
    address: string;
    price: number;
    change24h: number;
    volume24h: string;
    marketCap: string;
    liquidity: string;
  }>>> {
    try {
      const response = await apiClient.post('/api/market/batch', {
        tokens: tokenAddresses
      });
      return response.data;
    } catch (error) {
      console.error('Get market data failed:', error);
      throw error;
    }
  }

  /**
   * Get trending tokens
   */
  async getTrendingTokens(limit: number = 20): Promise<ApiResponse<Array<{
    token: Token;
    priceChange24h: number;
    volume24h: string;
    rank: number;
  }>>> {
    try {
      const response = await apiClient.get(`/api/market/trending?limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Get trending tokens failed:', error);
      throw error;
    }
  }

  /**
   * Get DEX statistics
   */
  async getDexStats(): Promise<ApiResponse<{
    totalVolume24h: string;
    totalLiquidity: string;
    totalPairs: number;
    activeUsers24h: number;
    totalValueLocked: string;
    averageBlockTime: number;
  }>> {
    try {
      const response = await apiClient.get('/api/stats');
      return response.data;
    } catch (error) {
      console.error('Get DEX stats failed:', error);
      throw error;
    }
  }
}

export const tradingService = new TradingService();
export default tradingService;
