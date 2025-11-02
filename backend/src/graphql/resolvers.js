/**
 * GraphQL Resolvers
 * 効率的なデータ取得、N+1問題解決（DataLoader使用）
 */

const { GraphQLScalarType, Kind } = require('graphql');
const { logger } = require('../utils/productionLogger');

// スカラー型定義
const dateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value) {
    return value instanceof Date ? value.toISOString() : value;
  },
  parseValue(value) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  }
});

const bigIntScalar = new GraphQLScalarType({
  name: 'BigInt',
  description: 'BigInt custom scalar type',
  serialize(value) {
    return value.toString();
  },
  parseValue(value) {
    return BigInt(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
      return BigInt(ast.value);
    }
    return null;
  }
});

// リゾルバー
const resolvers = {
  DateTime: dateTimeScalar,
  BigInt: bigIntScalar,

  Query: {
    // ユーザー関連
    user: async (_, { address }, { dataSources }) => {
      try {
        return await dataSources.userAPI.getUserByAddress(address);
      } catch (error) {
        logger.error('[GraphQL] Error fetching user', { address, error: error.message });
        throw error;
      }
    },

    users: async (_, { first = 10, after }, { dataSources }) => {
      try {
        return await dataSources.userAPI.getUsers({ first, after });
      } catch (error) {
        logger.error('[GraphQL] Error fetching users', { error: error.message });
        throw error;
      }
    },

    // トークン関連
    token: async (_, { address }, { dataSources }) => {
      try {
        return await dataSources.tokenAPI.getTokenByAddress(address);
      } catch (error) {
        logger.error('[GraphQL] Error fetching token', { address, error: error.message });
        throw error;
      }
    },

    tokens: async (_, args, { dataSources }) => {
      try {
        return await dataSources.tokenAPI.getTokens(args);
      } catch (error) {
        logger.error('[GraphQL] Error fetching tokens', { error: error.message });
        throw error;
      }
    },

    tokenPrice: async (_, { symbol }, { dataSources }) => {
      try {
        return await dataSources.priceAPI.getPrice(symbol);
      } catch (error) {
        logger.error('[GraphQL] Error fetching token price', { symbol, error: error.message });
        throw error;
      }
    },

    tokenPrices: async (_, { symbols }, { dataSources }) => {
      try {
        return await dataSources.priceAPI.getPrices(symbols);
      } catch (error) {
        logger.error('[GraphQL] Error fetching token prices', { error: error.message });
        throw error;
      }
    },

    // オーダー関連
    order: async (_, { id }, { dataSources }) => {
      try {
        return await dataSources.orderAPI.getOrderById(id);
      } catch (error) {
        logger.error('[GraphQL] Error fetching order', { id, error: error.message });
        throw error;
      }
    },

    orders: async (_, args, { dataSources }) => {
      try {
        const orders = await dataSources.orderAPI.getOrders(args);
        return {
          edges: orders.map(order => ({
            node: order,
            cursor: order.id
          })),
          pageInfo: {
            hasNextPage: orders.length === args.first,
            hasPreviousPage: !!args.after,
            totalCount: orders.length
          }
        };
      } catch (error) {
        logger.error('[GraphQL] Error fetching orders', { error: error.message });
        throw error;
      }
    },

    userOrders: async (_, { address, first = 10, after, status }, { dataSources }) => {
      try {
        const orders = await dataSources.orderAPI.getUserOrders(address, { first, after, status });
        return {
          edges: orders.map(order => ({
            node: order,
            cursor: order.id
          })),
          pageInfo: {
            hasNextPage: orders.length === first,
            hasPreviousPage: !!after,
            totalCount: orders.length
          }
        };
      } catch (error) {
        logger.error('[GraphQL] Error fetching user orders', { address, error: error.message });
        throw error;
      }
    },

    // トランザクション関連
    transaction: async (_, { id }, { dataSources }) => {
      try {
        return await dataSources.transactionAPI.getTransactionById(id);
      } catch (error) {
        logger.error('[GraphQL] Error fetching transaction', { id, error: error.message });
        throw error;
      }
    },

    transactions: async (_, args, { dataSources }) => {
      try {
        const transactions = await dataSources.transactionAPI.getTransactions(args);
        return {
          edges: transactions.map(tx => ({
            node: tx,
            cursor: tx.id
          })),
          pageInfo: {
            hasNextPage: transactions.length === args.first,
            hasPreviousPage: !!args.after,
            totalCount: transactions.length
          }
        };
      } catch (error) {
        logger.error('[GraphQL] Error fetching transactions', { error: error.message });
        throw error;
      }
    },

    userTransactions: async (_, { address, first = 10, after, type }, { dataSources }) => {
      try {
        const transactions = await dataSources.transactionAPI.getUserTransactions(address, { first, after, type });
        return {
          edges: transactions.map(tx => ({
            node: tx,
            cursor: tx.id
          })),
          pageInfo: {
            hasNextPage: transactions.length === first,
            hasPreviousPage: !!after,
            totalCount: transactions.length
          }
        };
      } catch (error) {
        logger.error('[GraphQL] Error fetching user transactions', { address, error: error.message });
        throw error;
      }
    },

    // 流動性プール関連
    pool: async (_, { id }, { dataSources }) => {
      try {
        return await dataSources.poolAPI.getPoolById(id);
      } catch (error) {
        logger.error('[GraphQL] Error fetching pool', { id, error: error.message });
        throw error;
      }
    },

    pools: async (_, args, { dataSources }) => {
      try {
        return await dataSources.poolAPI.getPools(args);
      } catch (error) {
        logger.error('[GraphQL] Error fetching pools', { error: error.message });
        throw error;
      }
    },

    userPositions: async (_, { address }, { dataSources }) => {
      try {
        return await dataSources.poolAPI.getUserPositions(address);
      } catch (error) {
        logger.error('[GraphQL] Error fetching user positions', { address, error: error.message });
        throw error;
      }
    },

    // 統計
    statistics: async (_, __, { dataSources }) => {
      try {
        return await dataSources.statsAPI.getStatistics();
      } catch (error) {
        logger.error('[GraphQL] Error fetching statistics', { error: error.message });
        throw error;
      }
    },

    // 検索
    search: async (_, { query, first = 10 }, { dataSources }) => {
      try {
        const [tokens, pools, users] = await Promise.all([
          dataSources.tokenAPI.searchTokens(query, first),
          dataSources.poolAPI.searchPools(query, first),
          dataSources.userAPI.searchUsers(query, first)
        ]);

        return { tokens, pools, users };
      } catch (error) {
        logger.error('[GraphQL] Error in search', { query, error: error.message });
        throw error;
      }
    }
  },

  Mutation: {
    // オーダー操作
    createOrder: async (_, { input }, { dataSources, user }) => {
      try {
        if (!user) {
          throw new Error('Authentication required');
        }

        return await dataSources.orderAPI.createOrder(user.address, input);
      } catch (error) {
        logger.error('[GraphQL] Error creating order', { error: error.message });
        throw error;
      }
    },

    cancelOrder: async (_, { id }, { dataSources, user }) => {
      try {
        if (!user) {
          throw new Error('Authentication required');
        }

        return await dataSources.orderAPI.cancelOrder(user.address, id);
      } catch (error) {
        logger.error('[GraphQL] Error cancelling order', { id, error: error.message });
        throw error;
      }
    },

    // 流動性操作
    addLiquidity: async (_, { input }, { dataSources, user }) => {
      try {
        if (!user) {
          throw new Error('Authentication required');
        }

        return await dataSources.poolAPI.addLiquidity(user.address, input);
      } catch (error) {
        logger.error('[GraphQL] Error adding liquidity', { error: error.message });
        throw error;
      }
    },

    removeLiquidity: async (_, { input }, { dataSources, user }) => {
      try {
        if (!user) {
          throw new Error('Authentication required');
        }

        return await dataSources.poolAPI.removeLiquidity(user.address, input);
      } catch (error) {
        logger.error('[GraphQL] Error removing liquidity', { error: error.message });
        throw error;
      }
    },

    // スワップ
    swap: async (_, { input }, { dataSources, user }) => {
      try {
        if (!user) {
          throw new Error('Authentication required');
        }

        return await dataSources.swapAPI.executeSwap(user.address, input);
      } catch (error) {
        logger.error('[GraphQL] Error executing swap', { error: error.message });
        throw error;
      }
    }
  },

  Subscription: {
    // 価格更新
    priceUpdate: {
      subscribe: (_, { symbols }, { pubsub }) => {
        return pubsub.asyncIterator(symbols.map(s => `PRICE_${s}`));
      }
    },

    // オーダーブック更新
    orderBookUpdate: {
      subscribe: (_, { poolId }, { pubsub }) => {
        return pubsub.asyncIterator(`ORDERBOOK_${poolId}`);
      }
    },

    // トランザクション更新
    transactionUpdate: {
      subscribe: (_, { address }, { pubsub }) => {
        return pubsub.asyncIterator(`TX_${address}`);
      }
    },

    // プール更新
    poolUpdate: {
      subscribe: (_, { poolId }, { pubsub }) => {
        return pubsub.asyncIterator(`POOL_${poolId}`);
      }
    }
  },

  // ネストされたリゾルバー
  User: {
    balances: async (user, _, { dataSources }) => {
      return await dataSources.balanceAPI.getUserBalances(user.address);
    },
    orders: async (user, _, { dataSources }) => {
      return await dataSources.orderAPI.getUserOrders(user.address);
    },
    transactions: async (user, _, { dataSources }) => {
      return await dataSources.transactionAPI.getUserTransactions(user.address);
    },
    liquidityPositions: async (user, _, { dataSources }) => {
      return await dataSources.poolAPI.getUserPositions(user.address);
    }
  },

  Token: {
    price: async (token, _, { dataSources }) => {
      const priceData = await dataSources.priceAPI.getPrice(token.symbol);
      return priceData?.price;
    },
    priceChange24h: async (token, _, { dataSources }) => {
      const priceData = await dataSources.priceAPI.getPrice(token.symbol);
      return priceData?.change24h;
    }
  },

  Order: {
    user: async (order, _, { dataSources }) => {
      return await dataSources.userAPI.getUserByAddress(order.userAddress);
    },
    tokenIn: async (order, _, { dataSources }) => {
      return await dataSources.tokenAPI.getTokenByAddress(order.tokenInAddress);
    },
    tokenOut: async (order, _, { dataSources }) => {
      return await dataSources.tokenAPI.getTokenByAddress(order.tokenOutAddress);
    }
  },

  LiquidityPool: {
    token0: async (pool, _, { dataSources }) => {
      return await dataSources.tokenAPI.getTokenByAddress(pool.token0Address);
    },
    token1: async (pool, _, { dataSources }) => {
      return await dataSources.tokenAPI.getTokenByAddress(pool.token1Address);
    },
    positions: async (pool, _, { dataSources }) => {
      return await dataSources.poolAPI.getPoolPositions(pool.id);
    },
    transactions: async (pool, _, { dataSources }) => {
      return await dataSources.transactionAPI.getPoolTransactions(pool.id);
    }
  }
};

module.exports = resolvers;
