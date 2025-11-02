/**
 * API Client Service
 * Type-safe HTTP client for backend communication
 */

import type {
  ApiResponse,
  PriceData,
  TradeStats,
  Pool,
  SwapQuote,
  Transaction,
  PriceAlert,
  UserPortfolio,
  HealthStatus,
  GasEstimate,
  AIPrediction,
} from '../types/api';

class ApiClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        data: data.data || data,
        timestamp: data.timestamp,
      };
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Health & Status
  async getHealth(): Promise<ApiResponse<HealthStatus>> {
    return this.get<HealthStatus>('/health');
  }

  async getApiHealth(): Promise<ApiResponse<HealthStatus>> {
    return this.get<HealthStatus>('/api/health');
  }

  // Trading & Prices
  async getPrice(symbol: string): Promise<ApiResponse<PriceData>> {
    return this.get<PriceData>(`/api/prices/${symbol}`);
  }

  async getTradingStats(): Promise<ApiResponse<TradeStats>> {
    return this.get<TradeStats>('/api/trading/stats');
  }

  async getSwapQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<ApiResponse<SwapQuote>> {
    return this.post<SwapQuote>('/api/swap/quote', {
      tokenIn,
      tokenOut,
      amountIn,
    });
  }

  async executeSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    minAmountOut: string,
    slippage: number
  ): Promise<ApiResponse<Transaction>> {
    return this.post<Transaction>('/api/swap/execute', {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      slippage,
    });
  }

  // Liquidity
  async getPools(): Promise<ApiResponse<Pool[]>> {
    return this.get<Pool[]>('/api/pools');
  }

  async getPool(poolId: string): Promise<ApiResponse<Pool>> {
    return this.get<Pool>(`/api/pools/${poolId}`);
  }

  async addLiquidity(
    token0: string,
    token1: string,
    amount0: string,
    amount1: string
  ): Promise<ApiResponse<Transaction>> {
    return this.post<Transaction>('/api/liquidity/add', {
      token0,
      token1,
      amount0,
      amount1,
    });
  }

  async removeLiquidity(
    poolId: string,
    liquidityAmount: string
  ): Promise<ApiResponse<Transaction>> {
    return this.post<Transaction>('/api/liquidity/remove', {
      poolId,
      liquidityAmount,
    });
  }

  // Alerts
  async getPriceAlerts(userId: string): Promise<ApiResponse<PriceAlert[]>> {
    return this.get<PriceAlert[]>(`/api/trading/alerts/${userId}`);
  }

  async createPriceAlert(
    symbol: string,
    targetPrice: number,
    condition: 'above' | 'below',
    userId: string
  ): Promise<ApiResponse<PriceAlert>> {
    return this.post<PriceAlert>('/api/trading/alerts', {
      symbol,
      targetPrice,
      condition,
      userId,
    });
  }

  async deletePriceAlert(alertId: number): Promise<ApiResponse<void>> {
    return this.delete<void>(`/api/trading/alerts/${alertId}`);
  }

  // Portfolio
  async getPortfolio(address: string): Promise<ApiResponse<UserPortfolio>> {
    return this.get<UserPortfolio>(`/api/portfolio/${address}`);
  }

  // Gas Optimization
  async getGasEstimate(
    operation: string,
    params: any
  ): Promise<ApiResponse<GasEstimate>> {
    return this.post<GasEstimate>('/api/gas/estimate', {
      operation,
      params,
    });
  }

  async getOptimalGasPrice(): Promise<ApiResponse<{ gasPrice: string }>> {
    return this.get<{ gasPrice: string }>('/api/gas/optimal');
  }

  // AI Predictions
  async getAIPrediction(
    symbol: string,
    model?: string
  ): Promise<ApiResponse<AIPrediction>> {
    const query = model ? `?model=${model}` : '';
    return this.get<AIPrediction>(`/api/ai/predict/${symbol}${query}`);
  }

  // Transactions
  async getTransactionHistory(
    address: string,
    limit?: number
  ): Promise<ApiResponse<Transaction[]>> {
    const query = limit ? `?limit=${limit}` : '';
    return this.get<Transaction[]>(`/api/transactions/${address}${query}`);
  }

  async getTransactionStatus(
    txHash: string
  ): Promise<ApiResponse<Transaction>> {
    return this.get<Transaction>(`/api/transactions/status/${txHash}`);
  }
}

export const apiClient = new ApiClient();
export default apiClient;
