/**
 * GraphQL Data Sources
 * Provides clean API for data fetching with caching and batching
 */

const { logger } = require('../utils/productionLogger');

class UserAPI {
  constructor(db, loaders) {
    this.db = db;
    this.loaders = loaders;
  }

  async getUserByAddress(address) {
    return this.loaders.userLoader.load(address);
  }

  async getUsers({ first = 10, after }) {
    const offset = after ? parseInt(Buffer.from(after, 'base64').toString()) : 0;
    const result = await this.db.query(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [first, offset]
    );
    return result.rows;
  }

  async searchUsers(query, limit = 10) {
    const result = await this.db.query(
      `SELECT * FROM users
       WHERE address ILIKE $1
       OR LOWER(ens_name) ILIKE $1
       LIMIT $2`,
      [`%${query.toLowerCase()}%`, limit]
    );
    return result.rows;
  }
}

class TokenAPI {
  constructor(db, loaders) {
    this.db = db;
    this.loaders = loaders;
  }

  async getTokenByAddress(address) {
    return this.loaders.tokenLoader.load(address);
  }

  async getTokens({ first = 10, after, orderBy = 'VOLUME', orderDirection = 'DESC' }) {
    const offset = after ? parseInt(Buffer.from(after, 'base64').toString()) : 0;

    const orderByMap = {
      PRICE: 'price',
      VOLUME: 'volume_24h',
      MARKET_CAP: 'market_cap',
      CREATED_AT: 'created_at'
    };

    const orderColumn = orderByMap[orderBy] || 'volume_24h';
    const direction = orderDirection === 'ASC' ? 'ASC' : 'DESC';

    const result = await this.db.query(
      `SELECT * FROM tokens
       ORDER BY ${orderColumn} ${direction}
       LIMIT $1 OFFSET $2`,
      [first, offset]
    );

    return result.rows;
  }

  async searchTokens(query, limit = 10) {
    const result = await this.db.query(
      `SELECT * FROM tokens
       WHERE LOWER(symbol) LIKE $1
       OR LOWER(name) LIKE $1
       OR address ILIKE $1
       LIMIT $2`,
      [`%${query.toLowerCase()}%`, limit]
    );
    return result.rows;
  }
}

class PriceAPI {
  constructor(db, loaders, redis) {
    this.db = db;
    this.loaders = loaders;
    this.redis = redis;
  }

  async getPrice(symbol) {
    return this.loaders.priceLoader.load(symbol);
  }

  async getPrices(symbols) {
    return this.loaders.priceLoader.loadMany(symbols);
  }
}

class OrderAPI {
  constructor(db, loaders, redis) {
    this.db = db;
    this.loaders = loaders;
    this.redis = redis;
  }

  async getOrderById(id) {
    return this.loaders.orderLoader.load(id);
  }

  async getOrders({ first = 10, after, where, orderBy = 'CREATED_AT', orderDirection = 'DESC' }) {
    const offset = after ? parseInt(Buffer.from(after, 'base64').toString()) : 0;

    let whereClause = 'WHERE 1=1';
    const params = [first, offset];
    let paramIndex = 3;

    if (where) {
      if (where.user) {
        whereClause += ` AND user_address = $${paramIndex}`;
        params.push(where.user);
        paramIndex++;
      }
      if (where.type) {
        whereClause += ` AND type = $${paramIndex}`;
        params.push(where.type);
        paramIndex++;
      }
      if (where.status) {
        whereClause += ` AND status = $${paramIndex}`;
        params.push(where.status);
        paramIndex++;
      }
      if (where.tokenIn) {
        whereClause += ` AND token_in_address = $${paramIndex}`;
        params.push(where.tokenIn);
        paramIndex++;
      }
      if (where.tokenOut) {
        whereClause += ` AND token_out_address = $${paramIndex}`;
        params.push(where.tokenOut);
        paramIndex++;
      }
    }

    const orderByMap = {
      CREATED_AT: 'created_at',
      PRICE: 'price',
      AMOUNT: 'amount_in'
    };

    const orderColumn = orderByMap[orderBy] || 'created_at';
    const direction = orderDirection === 'ASC' ? 'ASC' : 'DESC';

    const result = await this.db.query(
      `SELECT * FROM orders
       ${whereClause}
       ORDER BY ${orderColumn} ${direction}
       LIMIT $1 OFFSET $2`,
      params
    );

    return result.rows;
  }

  async getUserOrders(address, { first = 10, after, status }) {
    return this.loaders.userOrdersLoader.load(address);
  }

  async createOrder(userAddress, input) {
    const result = await this.db.query(
      `INSERT INTO orders (
        user_address, type, status, token_in_address, token_out_address,
        amount_in, amount_out, price, slippage, deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userAddress,
        input.type,
        'PENDING',
        input.tokenIn,
        input.tokenOut,
        input.amountIn,
        input.amountOut,
        input.amountOut ? (input.amountOut / input.amountIn) : 0,
        input.slippage || 0.5,
        input.deadline || new Date(Date.now() + 600000) // 10 min default
      ]
    );

    // Invalidate user orders cache
    this.loaders.userOrdersLoader.clear(userAddress);

    return result.rows[0];
  }

  async cancelOrder(userAddress, orderId) {
    const result = await this.db.query(
      `UPDATE orders
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND user_address = $2
       RETURNING *`,
      [orderId, userAddress]
    );

    if (result.rows.length === 0) {
      throw new Error('Order not found or unauthorized');
    }

    // Invalidate caches
    this.loaders.orderLoader.clear(orderId);
    this.loaders.userOrdersLoader.clear(userAddress);
    await this.redis.del(`order:${orderId}`);

    return result.rows[0];
  }
}

class TransactionAPI {
  constructor(db, loaders) {
    this.db = db;
    this.loaders = loaders;
  }

  async getTransactionById(id) {
    return this.loaders.transactionLoader.load(id);
  }

  async getTransactions({ first = 10, after, where, orderBy = 'TIMESTAMP', orderDirection = 'DESC' }) {
    const offset = after ? parseInt(Buffer.from(after, 'base64').toString()) : 0;

    let whereClause = 'WHERE 1=1';
    const params = [first, offset];
    let paramIndex = 3;

    if (where) {
      if (where.user) {
        whereClause += ` AND user_address = $${paramIndex}`;
        params.push(where.user);
        paramIndex++;
      }
      if (where.type) {
        whereClause += ` AND type = $${paramIndex}`;
        params.push(where.type);
        paramIndex++;
      }
      if (where.status) {
        whereClause += ` AND status = $${paramIndex}`;
        params.push(where.status);
        paramIndex++;
      }
    }

    const orderByMap = {
      TIMESTAMP: 'timestamp',
      AMOUNT: 'amount_in',
      GAS_USED: 'gas_used'
    };

    const orderColumn = orderByMap[orderBy] || 'timestamp';
    const direction = orderDirection === 'ASC' ? 'ASC' : 'DESC';

    const result = await this.db.query(
      `SELECT * FROM transactions
       ${whereClause}
       ORDER BY ${orderColumn} ${direction}
       LIMIT $1 OFFSET $2`,
      params
    );

    return result.rows;
  }

  async getUserTransactions(address, { first = 10, after, type }) {
    const offset = after ? parseInt(Buffer.from(after, 'base64').toString()) : 0;
    let whereClause = 'WHERE user_address = $1';
    const params = [address, first, offset];

    if (type) {
      whereClause += ' AND type = $4';
      params.push(type);
    }

    const result = await this.db.query(
      `SELECT * FROM transactions
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    return result.rows;
  }

  async getPoolTransactions(poolId) {
    const result = await this.db.query(
      `SELECT * FROM transactions
       WHERE pool_id = $1
       ORDER BY timestamp DESC
       LIMIT 100`,
      [poolId]
    );

    return result.rows;
  }
}

class PoolAPI {
  constructor(db, loaders, redis) {
    this.db = db;
    this.loaders = loaders;
    this.redis = redis;
  }

  async getPoolById(id) {
    return this.loaders.poolLoader.load(id);
  }

  async getPools({ first = 10, after, orderBy = 'LIQUIDITY', orderDirection = 'DESC' }) {
    const offset = after ? parseInt(Buffer.from(after, 'base64').toString()) : 0;

    const orderByMap = {
      LIQUIDITY: 'total_liquidity',
      VOLUME: 'volume_24h',
      APR: 'apr',
      CREATED_AT: 'created_at'
    };

    const orderColumn = orderByMap[orderBy] || 'total_liquidity';
    const direction = orderDirection === 'ASC' ? 'ASC' : 'DESC';

    const result = await this.db.query(
      `SELECT * FROM liquidity_pools
       ORDER BY ${orderColumn} ${direction}
       LIMIT $1 OFFSET $2`,
      [first, offset]
    );

    return result.rows;
  }

  async getUserPositions(address) {
    const result = await this.db.query(
      `SELECT * FROM liquidity_positions
       WHERE user_address = $1
       ORDER BY created_at DESC`,
      [address]
    );

    return result.rows;
  }

  async getPoolPositions(poolId) {
    const result = await this.db.query(
      `SELECT * FROM liquidity_positions
       WHERE pool_id = $1
       ORDER BY liquidity DESC
       LIMIT 100`,
      [poolId]
    );

    return result.rows;
  }

  async searchPools(query, limit = 10) {
    const result = await this.db.query(
      `SELECT p.* FROM liquidity_pools p
       JOIN tokens t0 ON p.token0_address = t0.address
       JOIN tokens t1 ON p.token1_address = t1.address
       WHERE LOWER(t0.symbol) LIKE $1
       OR LOWER(t1.symbol) LIKE $1
       OR LOWER(t0.name) LIKE $1
       OR LOWER(t1.name) LIKE $1
       LIMIT $2`,
      [`%${query.toLowerCase()}%`, limit]
    );

    return result.rows;
  }

  async addLiquidity(userAddress, input) {
    // This would interact with smart contracts
    // For now, simplified database operation
    const result = await this.db.query(
      `INSERT INTO liquidity_positions (
        user_address, pool_id, liquidity, token0_amount, token1_amount
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [userAddress, input.poolId, input.amount0 + input.amount1, input.amount0, input.amount1]
    );

    // Invalidate pool cache
    this.loaders.poolLoader.clear(input.poolId);
    await this.redis.del(`pool:${input.poolId}`);

    return result.rows[0];
  }

  async removeLiquidity(userAddress, input) {
    const result = await this.db.query(
      `UPDATE liquidity_positions
       SET liquidity = liquidity - $3,
           updated_at = NOW()
       WHERE id = $1 AND user_address = $2
       RETURNING *`,
      [input.positionId, userAddress, input.liquidity]
    );

    if (result.rows.length === 0) {
      throw new Error('Position not found or unauthorized');
    }

    const position = result.rows[0];

    // Invalidate pool cache
    this.loaders.poolLoader.clear(position.pool_id);
    await this.redis.del(`pool:${position.pool_id}`);

    return {
      position,
      token0Amount: input.liquidity / 2,
      token1Amount: input.liquidity / 2,
      transaction: { id: 'mock-tx-id' } // Would be real transaction
    };
  }
}

class BalanceAPI {
  constructor(db, loaders) {
    this.db = db;
    this.loaders = loaders;
  }

  async getUserBalances(address) {
    return this.loaders.balanceLoader.load(address);
  }
}

class StatsAPI {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
  }

  async getStatistics() {
    // Check cache first
    const cached = await this.redis.get('stats:global');
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const [volume, tvl, users, transactions, pools] = await Promise.all([
      this.db.query('SELECT COALESCE(SUM(volume_24h), 0) as total FROM liquidity_pools'),
      this.db.query('SELECT COALESCE(SUM(total_liquidity), 0) as total FROM liquidity_pools'),
      this.db.query('SELECT COUNT(*) as total FROM users'),
      this.db.query('SELECT COUNT(*) as total FROM transactions'),
      this.db.query('SELECT COUNT(*) as total FROM liquidity_pools WHERE total_liquidity > 0')
    ]);

    const topPools = await this.db.query(
      'SELECT * FROM liquidity_pools ORDER BY volume_24h DESC LIMIT 5'
    );

    const topTokens = await this.db.query(
      'SELECT * FROM tokens ORDER BY volume_24h DESC LIMIT 5'
    );

    const stats = {
      totalVolume24h: volume.rows[0].total,
      totalValueLocked: tvl.rows[0].total,
      totalUsers: parseInt(users.rows[0].total),
      totalTransactions: parseInt(transactions.rows[0].total),
      activePools: parseInt(pools.rows[0].total),
      topPools: topPools.rows,
      topTokens: topTokens.rows
    };

    // Cache for 1 minute
    await this.redis.setex('stats:global', 60, JSON.stringify(stats));

    return stats;
  }
}

class SwapAPI {
  constructor(db, loaders, redis) {
    this.db = db;
    this.loaders = loaders;
    this.redis = redis;
  }

  async executeSwap(userAddress, input) {
    // This would interact with smart contracts
    // For now, create a transaction record
    const result = await this.db.query(
      `INSERT INTO transactions (
        hash, user_address, type, status, token_in_address, token_out_address,
        amount_in, amount_out, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        `0x${Math.random().toString(16).substr(2, 64)}`, // Mock hash
        userAddress,
        'SWAP',
        'PENDING',
        input.tokenIn,
        input.tokenOut,
        input.amountIn,
        input.minAmountOut
      ]
    );

    return result.rows[0];
  }
}

function createDataSources(db, loaders, redis) {
  return {
    userAPI: new UserAPI(db, loaders),
    tokenAPI: new TokenAPI(db, loaders),
    priceAPI: new PriceAPI(db, loaders, redis),
    orderAPI: new OrderAPI(db, loaders, redis),
    transactionAPI: new TransactionAPI(db, loaders),
    poolAPI: new PoolAPI(db, loaders, redis),
    balanceAPI: new BalanceAPI(db, loaders),
    statsAPI: new StatsAPI(db, redis),
    swapAPI: new SwapAPI(db, loaders, redis)
  };
}

module.exports = {
  createDataSources,
  UserAPI,
  TokenAPI,
  PriceAPI,
  OrderAPI,
  TransactionAPI,
  PoolAPI,
  BalanceAPI,
  StatsAPI,
  SwapAPI
};
