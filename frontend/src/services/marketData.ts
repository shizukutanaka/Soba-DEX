// Lightweight market data service connected to backend API
import type { ApiResponse, SwapQuote as ApiSwapQuote, OrderBook, Pool } from '../types/api';

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  timestamp: number;
}

interface SwapQuote extends Omit<ApiSwapQuote, 'amountIn' | 'amountOut' | 'fee' | 'minimumReceived'> {
  amountIn: number;
  amountOut: number;
  fee: number;
  exchangeRate: number;
  minimumReceived: number;
}

class MarketDataService {
  private baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3003';
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTTL = 5000; // 5 seconds

  // Get cached data if available and fresh
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  // Set cache data
  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // Fetch with error handling
  private async fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // Get price for a single token
  async getPrice(symbol: string): Promise<number> {
    const cacheKey = `price_${symbol}`;
    const cached = this.getCached<{ price: number }>(cacheKey);
    if (cached) return cached.price;

    try {
      const data = await this.fetchAPI<{ price: number }>(`/api/dex/prices/${symbol}`);
      this.setCache(cacheKey, data);
      return data.price;
    } catch (error) {
      console.error(`Failed to get price for ${symbol}:`, error);
      return 0;
    }
  }

  // Get multiple prices
  async getPrices(symbols: string[]): Promise<Record<string, number>> {
    try {
      const data = await this.fetchAPI<Record<string, number>>('/api/dex/prices/batch', {
        method: 'POST',
        body: JSON.stringify({ symbols }),
      });

      // Cache individual prices
      for (const [symbol, price] of Object.entries(data)) {
        this.setCache(`price_${symbol}`, { price });
      }

      return data;
    } catch (error) {
      console.error('Failed to get batch prices:', error);
      return {};
    }
  }

  // Get market data for a symbol
  async getMarketData(symbol: string): Promise<MarketData | null> {
    const cacheKey = `market_${symbol}`;
    const cached = this.getCached<MarketData>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.fetchAPI<MarketData>(`/api/dex/market/${symbol}`);
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Failed to get market data for ${symbol}:`, error);
      return null;
    }
  }

  // Get order book
  async getOrderBook(tokenA: string, tokenB: string, depth = 20): Promise<OrderBook | null> {
    const cacheKey = `orderbook_${tokenA}_${tokenB}_${depth}`;
    const cached = this.getCached<OrderBook>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.fetchAPI<OrderBook>(`/api/dex/orderbook/${tokenA}/${tokenB}?depth=${depth}`);
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Failed to get order book for ${tokenA}/${tokenB}:`, error);
      return null;
    }
  }

  // Generate mock order book
  async generateMockOrderBook(tokenA: string, tokenB: string): Promise<OrderBook | null> {
    try {
      const data = await this.fetchAPI<OrderBook>(`/api/dex/orderbook/${tokenA}/${tokenB}/mock`, {
        method: 'POST',
      });
      return data;
    } catch (error) {
      console.error(`Failed to generate mock order book for ${tokenA}/${tokenB}:`, error);
      return null;
    }
  }

  // Get swap quote
  async getSwapQuote(tokenIn: string, tokenOut: string, amountIn: number): Promise<SwapQuote | null> {
    try {
      const data = await this.fetchAPI<SwapQuote>('/api/dex/swap/quote', {
        method: 'POST',
        body: JSON.stringify({ tokenIn, tokenOut, amountIn }),
      });
      return data;
    } catch (error) {
      console.error(`Failed to get swap quote:`, error);
      return null;
    }
  }

  // Execute swap
  async executeSwap(tokenIn: string, tokenOut: string, amountIn: number, minAmountOut?: number): Promise<any> {
    try {
      const data = await this.fetchAPI('/api/dex/swap/execute', {
        method: 'POST',
        body: JSON.stringify({ tokenIn, tokenOut, amountIn, minAmountOut }),
      });
      return data;
    } catch (error) {
      console.error('Failed to execute swap:', error);
      throw error;
    }
  }

  // Place order
  async placeOrder(order: {
    tokenA: string;
    tokenB: string;
    type: 'buy' | 'sell';
    price: number;
    amount: number;
  }): Promise<any> {
    try {
      const data = await this.fetchAPI('/api/dex/orders', {
        method: 'POST',
        body: JSON.stringify(order),
        headers: {
          'X-User-ID': 'demo-user', // Demo user ID
        },
      });
      return data;
    } catch (error) {
      console.error('Failed to place order:', error);
      throw error;
    }
  }

  // Cancel order
  async cancelOrder(orderId: number): Promise<any> {
    try {
      const data = await this.fetchAPI(`/api/dex/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'X-User-ID': 'demo-user',
        },
      });
      return data;
    } catch (error) {
      console.error('Failed to cancel order:', error);
      throw error;
    }
  }

  // Get user orders
  async getUserOrders(userId = 'demo-user'): Promise<any[]> {
    try {
      const data = await this.fetchAPI<{ orders: any[] }>(`/api/dex/orders/user/${userId}`);
      return data.orders;
    } catch (error) {
      console.error('Failed to get user orders:', error);
      return [];
    }
  }

  // Add liquidity
  async addLiquidity(tokenA: string, tokenB: string, amountA: number, amountB: number): Promise<any> {
    try {
      const data = await this.fetchAPI('/api/dex/liquidity/add', {
        method: 'POST',
        body: JSON.stringify({ tokenA, tokenB, amountA, amountB }),
      });
      return data;
    } catch (error) {
      console.error('Failed to add liquidity:', error);
      throw error;
    }
  }

  // Remove liquidity
  async removeLiquidity(tokenA: string, tokenB: string, liquidityTokens: number): Promise<any> {
    try {
      const data = await this.fetchAPI('/api/dex/liquidity/remove', {
        method: 'POST',
        body: JSON.stringify({ tokenA, tokenB, liquidityTokens }),
      });
      return data;
    } catch (error) {
      console.error('Failed to remove liquidity:', error);
      throw error;
    }
  }

  // Get pool info
  async getPoolInfo(tokenA: string, tokenB: string): Promise<any> {
    try {
      const data = await this.fetchAPI(`/api/dex/pools/${tokenA}/${tokenB}`);
      return data;
    } catch (error) {
      console.error(`Failed to get pool info for ${tokenA}/${tokenB}:`, error);
      return null;
    }
  }

  // Get all pools
  async getAllPools(): Promise<any[]> {
    try {
      const data = await this.fetchAPI<{ pools: any[] }>('/api/dex/pools');
      return data.pools;
    } catch (error) {
      console.error('Failed to get all pools:', error);
      return [];
    }
  }

  // Initialize DEX with default data
  async initializeDEX(): Promise<boolean> {
    try {
      await this.fetchAPI('/api/dex/init', { method: 'POST' });
      return true;
    } catch (error) {
      console.error('Failed to initialize DEX:', error);
      return false;
    }
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
  }

  // Get common trading pairs
  getCommonPairs(): Array<{ tokenA: string; tokenB: string; label: string }> {
    return [
      { tokenA: 'ETH', tokenB: 'USDC', label: 'ETH/USDC' },
      { tokenA: 'BTC', tokenB: 'USDC', label: 'BTC/USDC' },
      { tokenA: 'ETH', tokenB: 'DAI', label: 'ETH/DAI' },
      { tokenA: 'USDC', tokenB: 'DAI', label: 'USDC/DAI' },
    ];
  }
}

export const marketDataService = new MarketDataService();
export type { MarketData, SwapQuote };