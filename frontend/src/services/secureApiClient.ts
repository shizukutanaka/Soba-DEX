/**
 * Secure API Client with Enhanced Security Features
 *
 * SECURITY ENHANCEMENTS:
 * - CSRF token management
 * - Request timeout protection
 * - Zod schema validation
 * - Retry logic with exponential backoff
 * - Rate limiting awareness
 */

import { z } from 'zod';
import { validateApiResponse, schemas } from './apiSchemas';
import type { ApiResponse } from '../types/api';

interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  validateSchema?: z.ZodType<any>;
}

class SecureApiClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;
  private csrfToken: string | null = null;
  private requestTimeout: number = 30000;
  private maxRetries: number = 3;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
    this.initializeCsrf();
  }

  /**
   * SECURITY: Fetch CSRF token on initialization
   */
  private async initializeCsrf(): Promise<void> {
    try {
      const response = await fetch(`${this.baseURL}/api/csrf-token`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        this.csrfToken = data.token;
        console.log('CSRF token initialized');
      }
    } catch (error) {
      console.warn('Failed to fetch CSRF token:', error);
    }
  }

  /**
   * SECURITY: Request with timeout protection
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * SECURITY: Validate response with Zod schema
   */
  private validateResponse<T>(
    data: unknown,
    schema: z.ZodType<T>
  ): { success: boolean; data?: T; error?: string } {
    const result = validateApiResponse(schema, data);
    if (!result.success) {
      console.error('API response validation failed:', result.error);
      return {
        success: false,
        error: result.error,
      };
    }
    return {
      success: true,
      data: result.data,
    };
  }

  /**
   * Core request method with retry logic
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      timeout = this.requestTimeout,
      retries = this.maxRetries,
      validateSchema,
      ...fetchOptions
    } = options;

    const url = `${this.baseURL}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Add CSRF token for state-changing requests
        const headers: HeadersInit = {
          ...this.defaultHeaders,
          ...fetchOptions.headers,
        };

        if (
          this.csrfToken &&
          ['POST', 'PUT', 'DELETE', 'PATCH'].includes(fetchOptions.method || 'GET')
        ) {
          headers['X-CSRF-Token'] = this.csrfToken;
        }

        const response = await this.fetchWithTimeout(
          url,
          {
            ...fetchOptions,
            headers,
            credentials: 'include',
          },
          timeout
        );

        const data = await response.json();

        if (!response.ok) {
          // Refresh CSRF token if it's invalid
          if (response.status === 403 && data.error?.includes('CSRF')) {
            await this.initializeCsrf();
            continue; // Retry with new token
          }

          return {
            success: false,
            error: data.error || `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const responseData = data.data || data;

        // Validate response if schema provided
        if (validateSchema) {
          const validation = this.validateResponse(responseData, validateSchema);
          if (!validation.success) {
            return {
              success: false,
              error: validation.error,
            };
          }
          return {
            success: true,
            data: validation.data as T,
            timestamp: data.timestamp,
          };
        }

        return {
          success: true,
          data: responseData,
          timestamp: data.timestamp,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on timeout or client errors
        if (
          lastError.message === 'Request timeout' ||
          lastError.message.includes('400')
        ) {
          break;
        }

        // Exponential backoff
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`API request failed after ${retries + 1} attempts: ${endpoint}`, lastError);
    return {
      success: false,
      error: lastError?.message || 'Network error',
    };
  }

  // HTTP Methods with schema validation

  async get<T>(endpoint: string, schema?: z.ZodType<T>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'GET',
      validateSchema: schema,
    });
  }

  async post<T>(
    endpoint: string,
    body?: any,
    schema?: z.ZodType<T>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      validateSchema: schema,
    });
  }

  async put<T>(
    endpoint: string,
    body?: any,
    schema?: z.ZodType<T>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      validateSchema: schema,
    });
  }

  async delete<T>(endpoint: string, schema?: z.ZodType<T>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      validateSchema: schema,
    });
  }

  // API Methods with automatic validation

  async getHealth() {
    return this.get('/health', schemas.HealthStatus);
  }

  async getPrice(symbol: string) {
    return this.get(`/api/prices/${symbol}`, schemas.PriceData);
  }

  async getTradingStats() {
    return this.get('/api/trading/stats', schemas.TradeStats);
  }

  async getSwapQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    return this.post(
      '/api/swap/quote',
      { tokenIn, tokenOut, amountIn },
      schemas.SwapQuote
    );
  }

  async getPools() {
    return this.get('/api/pools', z.array(schemas.Pool));
  }

  async getPool(poolId: string) {
    return this.get(`/api/pools/${poolId}`, schemas.Pool);
  }

  async getPortfolio(address: string) {
    return this.get(`/api/portfolio/${address}`, schemas.UserPortfolio);
  }

  async getGasEstimate(operation: string, params: any) {
    return this.post('/api/gas/estimate', { operation, params }, schemas.GasEstimate);
  }

  async getAIPrediction(symbol: string, model?: string) {
    const query = model ? `?model=${model}` : '';
    return this.get(`/api/ai/predict/${symbol}${query}`, schemas.AIPrediction);
  }

  async getTransactionHistory(address: string, limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return this.get(`/api/transactions/${address}${query}`, z.array(schemas.Transaction));
  }

  async getPriceAlerts(userId: string) {
    return this.get(`/api/trading/alerts/${userId}`, z.array(schemas.PriceAlert));
  }

  async createPriceAlert(
    symbol: string,
    targetPrice: number,
    condition: 'above' | 'below',
    userId: string
  ) {
    return this.post(
      '/api/trading/alerts',
      { symbol, targetPrice, condition, userId },
      schemas.PriceAlert
    );
  }
}

export const secureApiClient = new SecureApiClient();
export default secureApiClient;
