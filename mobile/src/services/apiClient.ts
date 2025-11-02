/**
 * API Client Service
 *
 * Centralized API communication for the mobile app:
 * - HTTP client configuration
 * - Request/response interceptors
 * - Authentication handling
 * - Error handling
 * - Retry logic
 * - Offline support
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Types
import { ApiResponse, ApiError } from './api';

class ApiClient {
  private client: AxiosInstance;
  private isOnline: boolean = true;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue: boolean = false;

  constructor() {
    this.client = axios.create({
      baseURL: __DEV__ ? 'http://localhost:3001/api' : (process.env.REACT_APP_API_URL || 'http://localhost:3001/api'),
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DEX-Mobile/1.0.0',
      },
    });

    this.setupInterceptors();
    this.setupNetworkListener();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Add authentication token
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add device info
        config.headers['X-Device-ID'] = await this.getDeviceId();
        config.headers['X-Platform'] = 'mobile';
        config.headers['X-App-Version'] = '1.0.0';

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Handle authentication errors
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          // Attempt to refresh token
          const refreshed = await this.refreshToken();
          if (refreshed) {
            const token = await AsyncStorage.getItem('authToken');
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return this.client(originalRequest);
          } else {
            // Logout user
            await this.logout();
            return Promise.reject(error);
          }
        }

        // Handle network errors
        if (!error.response) {
          this.isOnline = false;
          this.addToQueue(originalRequest);
          return Promise.reject(new ApiError('Network error', 'NETWORK_ERROR'));
        }

        // Handle server errors
        return Promise.reject(
          new ApiError(
            error.response?.data?.message || 'Server error',
            error.response?.data?.code || 'SERVER_ERROR',
            error.response?.status
          )
        );
      }
    );
  }

  private setupNetworkListener() {
    NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected === true;

      if (wasOffline && this.isOnline) {
        this.processQueue();
      }
    });
  }

  private async getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = `mobile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      if (!refreshToken) return false;

      const response = await axios.post('/auth/refresh', { refreshToken });
      const { token } = response.data.data;

      await AsyncStorage.setItem('authToken', token);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async logout() {
    await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'userProfile']);
    // Navigate to login screen
  }

  private addToQueue(request: AxiosRequestConfig) {
    this.requestQueue.push(() => this.client(request));
  }

  private async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0 && this.isOnline) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          // Handle failed request
        }
      }
    }

    this.isProcessingQueue = false;
  }

  // Public API methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.get(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.post(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.put(url, data, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.patch(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.delete(url, config);
    return response.data;
  }

  // Upload file
  async upload<T = any>(url: string, file: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    const uploadConfig = {
      ...config,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
    };

    const response = await this.client.post(url, formData, uploadConfig);
    return response.data;
  }

  // WebSocket connection
  createWebSocketConnection(url: string): WebSocket {
    // Validate URL format and origin
    try {
      const wsUrl = new URL(url.replace('http', 'ws'));
      const baseUrl = new URL(this.client.defaults.baseURL || '');

      // Only allow connections to the same origin or configured API domain
      if (wsUrl.origin !== baseUrl.origin && !wsUrl.origin.includes('localhost')) {
        throw new Error('WebSocket connection to unauthorized origin');
      }

      return new WebSocket(wsUrl.toString());
    } catch (error) {
      throw new Error('Invalid WebSocket URL format');
    }
  }

  // Network status
  getNetworkStatus(): { isOnline: boolean; isProcessingQueue: boolean } {
    return {
      isOnline: this.isOnline,
      isProcessingQueue: this.isProcessingQueue,
    };
  }
}

export const apiClient = new ApiClient();
export default apiClient;
