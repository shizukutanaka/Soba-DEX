/**
 * API Input Validation Schemas
 *
 * Comprehensive Joi validation schemas for all API endpoints
 * FEATURES:
 * - Request body validation
 * - Query parameter validation
 * - Path parameter validation
 * - Custom validators for Web3 addresses
 * - Sanitization rules
 */

const Joi = require('joi');

/**
 * Custom validators
 */
const customValidators = {
  // Ethereum address validator
  ethereumAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .message('Must be a valid Ethereum address'),

  // Transaction hash validator
  txHash: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{64}$/)
    .message('Must be a valid transaction hash'),

  // Token amount (18 decimals max)
  tokenAmount: Joi.string()
    .pattern(/^\d+(\.\d{1,18})?$/)
    .message('Must be a valid token amount with max 18 decimals'),

  // Chain ID
  chainId: Joi.number()
    .integer()
    .positive()
    .valid(1, 3, 4, 5, 42, 137, 80001, 56, 97)
    .message('Must be a supported chain ID'),

  // UUID
  uuid: Joi.string()
    .uuid()
    .message('Must be a valid UUID'),

  // Pagination limit
  paginationLimit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),

  // Pagination offset
  paginationOffset: Joi.number()
    .integer()
    .min(0)
    .default(0)
};

/**
 * User/Wallet schemas
 */
const userSchemas = {
  // Connect wallet
  connectWallet: Joi.object({
    address: customValidators.ethereumAddress.required(),
    chainId: customValidators.chainId.required(),
    signature: Joi.string().required(),
    message: Joi.string().required()
  }),

  // Get user profile
  getUserProfile: {
    params: Joi.object({
      address: customValidators.ethereumAddress.required()
    })
  },

  // Update user settings
  updateUserSettings: Joi.object({
    slippageTolerance: Joi.number().min(0).max(50).optional(),
    gasPreference: Joi.string().valid('slow', 'medium', 'fast').optional(),
    notifications: Joi.object({
      email: Joi.boolean().optional(),
      push: Joi.boolean().optional(),
      transactionUpdates: Joi.boolean().optional()
    }).optional()
  })
};

/**
 * Swap schemas
 */
const swapSchemas = {
  // Get quote
  getQuote: {
    query: Joi.object({
      tokenIn: customValidators.ethereumAddress.required(),
      tokenOut: customValidators.ethereumAddress.required(),
      amountIn: customValidators.tokenAmount.required(),
      slippage: Joi.number().min(0).max(50).default(0.5)
    })
  },

  // Execute swap
  executeSwap: Joi.object({
    tokenIn: customValidators.ethereumAddress.required(),
    tokenOut: customValidators.ethereumAddress.required(),
    amountIn: customValidators.tokenAmount.required(),
    amountOutMin: customValidators.tokenAmount.required(),
    recipient: customValidators.ethereumAddress.required(),
    deadline: Joi.number().integer().positive().required(),
    slippage: Joi.number().min(0).max(50).required()
  }),

  // Get swap history
  getSwapHistory: {
    query: Joi.object({
      address: customValidators.ethereumAddress.required(),
      limit: customValidators.paginationLimit,
      offset: customValidators.paginationOffset,
      tokenIn: customValidators.ethereumAddress.optional(),
      tokenOut: customValidators.ethereumAddress.optional(),
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
    })
  }
};

/**
 * Liquidity schemas
 */
const liquiditySchemas = {
  // Add liquidity
  addLiquidity: Joi.object({
    tokenA: customValidators.ethereumAddress.required(),
    tokenB: customValidators.ethereumAddress.required(),
    amountA: customValidators.tokenAmount.required(),
    amountB: customValidators.tokenAmount.required(),
    amountAMin: customValidators.tokenAmount.required(),
    amountBMin: customValidators.tokenAmount.required(),
    recipient: customValidators.ethereumAddress.required(),
    deadline: Joi.number().integer().positive().required()
  }),

  // Remove liquidity
  removeLiquidity: Joi.object({
    tokenA: customValidators.ethereumAddress.required(),
    tokenB: customValidators.ethereumAddress.required(),
    liquidity: customValidators.tokenAmount.required(),
    amountAMin: customValidators.tokenAmount.required(),
    amountBMin: customValidators.tokenAmount.required(),
    recipient: customValidators.ethereumAddress.required(),
    deadline: Joi.number().integer().positive().required()
  }),

  // Get pool info
  getPoolInfo: {
    query: Joi.object({
      tokenA: customValidators.ethereumAddress.required(),
      tokenB: customValidators.ethereumAddress.required()
    })
  },

  // Get user positions
  getUserPositions: {
    params: Joi.object({
      address: customValidators.ethereumAddress.required()
    }),
    query: Joi.object({
      limit: customValidators.paginationLimit,
      offset: customValidators.paginationOffset
    })
  }
};

/**
 * Token schemas
 */
const tokenSchemas = {
  // Get token info
  getTokenInfo: {
    params: Joi.object({
      address: customValidators.ethereumAddress.required()
    })
  },

  // Get token list
  getTokenList: {
    query: Joi.object({
      search: Joi.string().max(100).optional(),
      limit: customValidators.paginationLimit,
      offset: customValidators.paginationOffset,
      sortBy: Joi.string().valid('name', 'symbol', 'volume', 'price').default('volume')
    })
  },

  // Get token price
  getTokenPrice: {
    params: Joi.object({
      address: customValidators.ethereumAddress.required()
    }),
    query: Joi.object({
      currency: Joi.string().valid('USD', 'EUR', 'GBP', 'ETH').default('USD')
    })
  },

  // Get token balance
  getTokenBalance: {
    query: Joi.object({
      address: customValidators.ethereumAddress.required(),
      token: customValidators.ethereumAddress.required()
    })
  }
};

/**
 * Transaction schemas
 */
const transactionSchemas = {
  // Get transaction
  getTransaction: {
    params: Joi.object({
      hash: customValidators.txHash.required()
    })
  },

  // Get transaction history
  getTransactionHistory: {
    params: Joi.object({
      address: customValidators.ethereumAddress.required()
    }),
    query: Joi.object({
      limit: customValidators.paginationLimit,
      offset: customValidators.paginationOffset,
      type: Joi.string().valid('swap', 'liquidity', 'all').default('all'),
      status: Joi.string().valid('pending', 'confirmed', 'failed', 'all').default('all'),
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
    })
  },

  // Submit transaction
  submitTransaction: Joi.object({
    hash: customValidators.txHash.required(),
    from: customValidators.ethereumAddress.required(),
    to: customValidators.ethereumAddress.required(),
    value: customValidators.tokenAmount.optional(),
    data: Joi.string().pattern(/^0x[a-fA-F0-9]*$/).optional(),
    chainId: customValidators.chainId.required()
  })
};

/**
 * Order schemas (limit orders)
 */
const orderSchemas = {
  // Create order
  createOrder: Joi.object({
    tokenIn: customValidators.ethereumAddress.required(),
    tokenOut: customValidators.ethereumAddress.required(),
    amountIn: customValidators.tokenAmount.required(),
    minAmountOut: customValidators.tokenAmount.required(),
    limitPrice: customValidators.tokenAmount.required(),
    expiresAt: Joi.date().iso().greater('now').required(),
    recipient: customValidators.ethereumAddress.required()
  }),

  // Cancel order
  cancelOrder: {
    params: Joi.object({
      orderId: customValidators.uuid.required()
    })
  },

  // Get orders
  getOrders: {
    query: Joi.object({
      address: customValidators.ethereumAddress.optional(),
      status: Joi.string().valid('open', 'filled', 'cancelled', 'expired', 'all').default('open'),
      limit: customValidators.paginationLimit,
      offset: customValidators.paginationOffset
    })
  }
};

/**
 * Analytics schemas
 */
const analyticsSchemas = {
  // Get pool analytics
  getPoolAnalytics: {
    params: Joi.object({
      poolId: Joi.string().required()
    }),
    query: Joi.object({
      period: Joi.string().valid('24h', '7d', '30d', '90d', '1y').default('7d')
    })
  },

  // Get token analytics
  getTokenAnalytics: {
    params: Joi.object({
      address: customValidators.ethereumAddress.required()
    }),
    query: Joi.object({
      period: Joi.string().valid('24h', '7d', '30d', '90d', '1y').default('7d')
    })
  },

  // Get platform stats
  getPlatformStats: {
    query: Joi.object({
      period: Joi.string().valid('24h', '7d', '30d', '90d', '1y', 'all').default('24h')
    })
  }
};

/**
 * Governance schemas
 */
const governanceSchemas = {
  // Create proposal
  createProposal: Joi.object({
    title: Joi.string().min(10).max(200).required(),
    description: Joi.string().min(50).max(5000).required(),
    category: Joi.string().valid('protocol', 'treasury', 'parameter', 'other').required(),
    actions: Joi.array().items(Joi.object({
      target: customValidators.ethereumAddress.required(),
      value: customValidators.tokenAmount.default('0'),
      signature: Joi.string().required(),
      calldata: Joi.string().pattern(/^0x[a-fA-F0-9]*$/).required()
    })).min(1).required()
  }),

  // Vote on proposal
  voteOnProposal: {
    params: Joi.object({
      proposalId: Joi.string().required()
    }),
    body: Joi.object({
      support: Joi.boolean().required(),
      reason: Joi.string().max(500).optional()
    })
  },

  // Get proposal
  getProposal: {
    params: Joi.object({
      proposalId: Joi.string().required()
    })
  }
};

/**
 * Validation middleware factory
 */
function validateRequest(schema, property = 'body') {
  return (req, res, next) => {
    const dataToValidate = property === 'query' ? req.query :
                          property === 'params' ? req.params :
                          req.body;

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors
      });
    }

    // Replace request data with validated and sanitized data
    if (property === 'query') {
      req.query = value;
    } else if (property === 'params') {
      req.params = value;
    } else {
      req.body = value;
    }

    next();
  };
}

/**
 * Composite validation (body + query + params)
 */
function validateComposite(schemas) {
  return async (req, res, next) => {
    const errors = [];

    // Validate body
    if (schemas.body) {
      const { error, value } = schemas.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        errors.push(...error.details.map(d => ({
          location: 'body',
          field: d.path.join('.'),
          message: d.message
        })));
      } else {
        req.body = value;
      }
    }

    // Validate query
    if (schemas.query) {
      const { error, value } = schemas.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        errors.push(...error.details.map(d => ({
          location: 'query',
          field: d.path.join('.'),
          message: d.message
        })));
      } else {
        req.query = value;
      }
    }

    // Validate params
    if (schemas.params) {
      const { error, value } = schemas.params.validate(req.params, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        errors.push(...error.details.map(d => ({
          location: 'params',
          field: d.path.join('.'),
          message: d.message
        })));
      } else {
        req.params = value;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors
      });
    }

    next();
  };
}

module.exports = {
  // Schemas
  userSchemas,
  swapSchemas,
  liquiditySchemas,
  tokenSchemas,
  transactionSchemas,
  orderSchemas,
  analyticsSchemas,
  governanceSchemas,
  customValidators,

  // Middleware
  validateRequest,
  validateComposite
};
