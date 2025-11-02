/**
 * Soba DEX SDK
 * @version 5.0.0
 * @description Official JavaScript/TypeScript SDK for interacting with Soba DEX
 *
 * Features:
 * - Simple swap execution
 * - Liquidity management
 * - Pool creation and management
 * - Price queries
 * - Order book access
 * - WebSocket real-time updates
 * - Multi-chain support
 * - TypeScript support
 *
 * Installation:
 * ```
 * npm install @soba-dex/sdk
 * ```
 *
 * Usage:
 * ```javascript
 * const { SobaSDK } = require('@soba-dex/sdk');
 *
 * const sdk = new SobaSDK({
 *   apiUrl: 'https://api.soba-dex.com',
 *   chainId: 1
 * });
 *
 * // Execute swap
 * const result = await sdk.swap({
 *   tokenIn: '0x...',
 *   tokenOut: '0x...',
 *   amountIn: '1000000000000000000',
 *   slippage: 0.5
 * });
 * ```
 */

const axios = require('axios');
const { EventEmitter } = require('events');
const WebSocket = require('ws');
const { ethers } = require('ethers');

class SobaSDK extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      apiUrl: config.apiUrl || 'https://api.soba-dex.com',
      wsUrl: config.wsUrl || 'wss://ws.soba-dex.com',
      chainId: config.chainId || 1,
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      ...config
    };

    this.http = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Soba-SDK/5.0.0`
      }
    });

    this.ws = null;
    this.subscriptions = new Map();
  }

  // ============ Swap Methods ============

  /**
   * Get swap quote
   * @param {Object} params - Swap parameters
   * @returns {Promise<Object>} Quote details
   */
  async getQuote(params) {
    const { tokenIn, tokenOut, amountIn, slippage = 0.5 } = params;

    const response = await this.http.get('/v1/swap/quote', {
      params: {
        tokenIn,
        tokenOut,
        amountIn,
        slippage
      }
    });

    return response.data.data;
  }

  /**
   * Execute swap
   * @param {Object} params - Swap parameters
   * @returns {Promise<Object>} Transaction result
   */
  async swap(params) {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      slippage = 0.5,
      deadline,
      recipient
    } = params;

    // Get quote first
    const quote = await this.getQuote({ tokenIn, tokenOut, amountIn, slippage });

    // Execute swap
    const response = await this.http.post('/v1/swap/execute', {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut: minAmountOut || quote.minOutput,
      deadline: deadline || Math.floor(Date.now() / 1000) + 1200, // 20 minutes
      recipient,
      route: quote.route
    });

    return response.data.data;
  }

  /**
   * Get best route using aggregator
   * @param {Object} params - Route parameters
   * @returns {Promise<Object>} Best route
   */
  async getBestRoute(params) {
    const { tokenIn, tokenOut, amountIn } = params;

    const response = await this.http.get('/v1/aggregator/quote', {
      params: { tokenIn, tokenOut, amountIn }
    });

    return response.data.data;
  }

  // ============ Liquidity Methods ============

  /**
   * Add liquidity to pool
   * @param {Object} params - Liquidity parameters
   * @returns {Promise<Object>} Transaction result
   */
  async addLiquidity(params) {
    const {
      poolAddress,
      token0Amount,
      token1Amount,
      minLPTokens,
      deadline
    } = params;

    const response = await this.http.post('/v1/liquidity/add', {
      poolAddress,
      amounts: [token0Amount, token1Amount],
      minLPTokens,
      deadline: deadline || Math.floor(Date.now() / 1000) + 1200
    });

    return response.data.data;
  }

  /**
   * Remove liquidity from pool
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Transaction result
   */
  async removeLiquidity(params) {
    const {
      poolAddress,
      lpTokenAmount,
      minToken0,
      minToken1,
      deadline
    } = params;

    const response = await this.http.post('/v1/liquidity/remove', {
      poolAddress,
      lpTokenAmount,
      minAmounts: [minToken0, minToken1],
      deadline: deadline || Math.floor(Date.now() / 1000) + 1200
    });

    return response.data.data;
  }

  // ============ Pool Methods ============

  /**
   * Get pool information
   * @param {string} poolAddress - Pool address
   * @returns {Promise<Object>} Pool details
   */
  async getPool(poolAddress) {
    const response = await this.http.get(`/v1/pools/${poolAddress}`);
    return response.data.data;
  }

  /**
   * List all pools
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} List of pools
   */
  async listPools(filters = {}) {
    const response = await this.http.get('/v1/pools', { params: filters });
    return response.data.data;
  }

  /**
   * Create new pool
   * @param {Object} params - Pool parameters
   * @returns {Promise<Object>} Transaction result
   */
  async createPool(params) {
    const {
      type, // 'constant-product', 'stable-swap', 'weighted'
      tokens,
      weights, // For weighted pools
      fee,
      initialLiquidity
    } = params;

    const response = await this.http.post('/v1/pools/create', {
      type,
      tokens,
      weights,
      fee,
      initialLiquidity
    });

    return response.data.data;
  }

  // ============ Price Methods ============

  /**
   * Get token price
   * @param {string} tokenAddress - Token address
   * @returns {Promise<Object>} Price data
   */
  async getPrice(tokenAddress) {
    const response = await this.http.get(`/v1/prices/${tokenAddress}`);
    return response.data.data;
  }

  /**
   * Get price history
   * @param {string} tokenAddress - Token address
   * @param {Object} options - Time range options
   * @returns {Promise<Array>} Historical prices
   */
  async getPriceHistory(tokenAddress, options = {}) {
    const { from, to, interval = '1h' } = options;

    const response = await this.http.get(`/v1/prices/${tokenAddress}/history`, {
      params: { from, to, interval }
    });

    return response.data.data;
  }

  // ============ Order Methods ============

  /**
   * Create limit order
   * @param {Object} params - Order parameters
   * @returns {Promise<Object>} Order details
   */
  async createLimitOrder(params) {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      limitPrice,
      expiry
    } = params;

    const response = await this.http.post('/v1/orders/limit', {
      tokenIn,
      tokenOut,
      amountIn,
      limitPrice,
      expiry
    });

    return response.data.data;
  }

  /**
   * Cancel order
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Result
   */
  async cancelOrder(orderId) {
    const response = await this.http.delete(`/v1/orders/${orderId}`);
    return response.data.data;
  }

  /**
   * Get user orders
   * @param {string} userAddress - User address
   * @returns {Promise<Array>} List of orders
   */
  async getUserOrders(userAddress) {
    const response = await this.http.get(`/v1/orders/user/${userAddress}`);
    return response.data.data;
  }

  // ============ Analytics Methods ============

  /**
   * Get platform statistics
   * @returns {Promise<Object>} Platform stats
   */
  async getStats() {
    const response = await this.http.get('/v1/analytics/stats');
    return response.data.data;
  }

  /**
   * Get TVL (Total Value Locked)
   * @returns {Promise<Object>} TVL data
   */
  async getTVL() {
    const response = await this.http.get('/v1/analytics/tvl');
    return response.data.data;
  }

  /**
   * Get trading volume
   * @param {Object} options - Time range
   * @returns {Promise<Object>} Volume data
   */
  async getVolume(options = {}) {
    const { from, to, interval = '1d' } = options;

    const response = await this.http.get('/v1/analytics/volume', {
      params: { from, to, interval }
    });

    return response.data.data;
  }

  // ============ WebSocket Methods ============

  /**
   * Connect to WebSocket
   */
  async connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.on('open', () => {
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this._handleWebSocketMessage(message);
        } catch (error) {
          this.emit('error', error);
        }
      });

      this.ws.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });

      this.ws.on('close', () => {
        this.emit('disconnected');
        this._reconnect();
      });
    });
  }

  /**
   * Subscribe to price updates
   * @param {string} tokenAddress - Token address
   * @param {Function} callback - Callback function
   */
  async subscribeToPrice(tokenAddress, callback) {
    await this.connectWebSocket();

    const subscriptionId = `price:${tokenAddress}`;
    this.subscriptions.set(subscriptionId, callback);

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      channel: 'price',
      token: tokenAddress
    }));
  }

  /**
   * Subscribe to order book updates
   * @param {string} pair - Trading pair
   * @param {Function} callback - Callback function
   */
  async subscribeToOrderBook(pair, callback) {
    await this.connectWebSocket();

    const subscriptionId = `orderbook:${pair}`;
    this.subscriptions.set(subscriptionId, callback);

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      channel: 'orderbook',
      pair
    }));
  }

  /**
   * Subscribe to trade events
   * @param {string} pair - Trading pair
   * @param {Function} callback - Callback function
   */
  async subscribeToTrades(pair, callback) {
    await this.connectWebSocket();

    const subscriptionId = `trades:${pair}`;
    this.subscriptions.set(subscriptionId, callback);

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      channel: 'trades',
      pair
    }));
  }

  /**
   * Unsubscribe from channel
   * @param {string} channel - Channel name
   * @param {string} identifier - Channel identifier
   */
  async unsubscribe(channel, identifier) {
    const subscriptionId = `${channel}:${identifier}`;
    this.subscriptions.delete(subscriptionId);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel,
        identifier
      }));
    }
  }

  /**
   * Handle WebSocket messages
   */
  _handleWebSocketMessage(message) {
    const { type, channel, data } = message;

    if (type === 'update') {
      const subscriptionId = `${channel}:${data.identifier || data.token || data.pair}`;
      const callback = this.subscriptions.get(subscriptionId);

      if (callback) {
        callback(data);
      }
    }

    this.emit('message', message);
  }

  /**
   * Reconnect WebSocket
   */
  _reconnect() {
    setTimeout(() => {
      this.connectWebSocket().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, 5000);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }

  // ============ Utility Methods ============

  /**
   * Calculate price impact
   * @param {Object} params - Parameters
   * @returns {number} Price impact percentage
   */
  async calculatePriceImpact(params) {
    const { poolAddress, tokenIn, amountIn } = params;

    const response = await this.http.post('/v1/utils/price-impact', {
      poolAddress,
      tokenIn,
      amountIn
    });

    return response.data.data.priceImpact;
  }

  /**
   * Estimate gas
   * @param {Object} transaction - Transaction parameters
   * @returns {Promise<string>} Gas estimate
   */
  async estimateGas(transaction) {
    const response = await this.http.post('/v1/utils/estimate-gas', transaction);
    return response.data.data.gasEstimate;
  }
}

// ============ Exports ============

module.exports = {
  SobaSDK,
  // Re-export ethers for convenience
  ethers
};

// ============ TypeScript Definitions ============

/**
 * @typedef {Object} SwapParams
 * @property {string} tokenIn - Input token address
 * @property {string} tokenOut - Output token address
 * @property {string} amountIn - Amount to swap
 * @property {string} [minAmountOut] - Minimum output amount
 * @property {number} [slippage] - Slippage tolerance (0-100)
 * @property {number} [deadline] - Unix timestamp deadline
 * @property {string} [recipient] - Recipient address
 */

/**
 * @typedef {Object} QuoteResult
 * @property {string} expectedOutput - Expected output amount
 * @property {string} minOutput - Minimum output with slippage
 * @property {number} priceImpact - Price impact percentage
 * @property {Object} route - Route details
 * @property {string} gasEstimate - Gas estimate
 */
