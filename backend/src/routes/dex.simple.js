/**
 * DEX Routes - Core Trading Functionality
 */

const express = require('express');
const router = express.Router();
const dexState = require('../services/dexState');
const { cacheMiddleware } = require('../middleware/cache');
const { optionalAuth } = require('../middleware/unifiedAuth');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  validateOptionalPattern,
  validateOptionalInt,
  validateOptionalBoolean,
  validateOptionalIsoTimestamp
} = require('../middleware/validation');

const RECENT_DEFAULT_LIMIT = 20;
const RECENT_MAX_SAMPLE = 50;

function resolveLatestTimestamp(current, candidate) {
  if (!candidate) {
    return current || null;
  }
  if (!current) {
    return candidate;
  }
  return new Date(candidate) > new Date(current) ? candidate : current;
}

function setSummaryHeaders(res, summary) {
  if (!summary || typeof summary !== 'object') {
    return;
  }

  if (summary.totalPools !== undefined && summary.totalPools !== null) {
    res.setHeader('X-Pool-Count', String(summary.totalPools));
  }

  if (summary.totalSwaps !== undefined && summary.totalSwaps !== null) {
    res.setHeader('X-Swap-Count', String(summary.totalSwaps));
  }

  if (summary.totalPairs !== undefined && summary.totalPairs !== null) {
    res.setHeader('X-Swap-Pairs', String(summary.totalPairs));
  }

  if (summary.lastSwapAt) {
    const timestamp = new Date(summary.lastSwapAt);
    if (!Number.isNaN(timestamp.getTime())) {
      res.setHeader('X-Last-Swap-At', timestamp.toISOString());
    }
  }
}

// List all liquidity pools with filtering/sorting
router.get('/pools',
  optionalAuth(),
  cacheMiddleware({ ttl: 10 }),
  validateOptionalPattern('token', {
    pattern: /^[A-Za-z0-9:_-]{2,64}$/,
    minLength: 2,
    maxLength: 64,
    transform: value => value.toLowerCase(),
    message: 'token filter must be alphanumeric (2-64 chars)'
  }),
  validateOptionalPattern('sortBy', {
    pattern: /^(liquidity|updatedAt|token0|token1)$/i,
    minLength: 5,
    maxLength: 9,
    transform: value => value.toLowerCase(),
    message: 'sortBy must be one of liquidity, updatedAt, token0, token1'
  }),
  validateOptionalPattern('order', {
    pattern: /^(asc|desc)$/i,
    minLength: 3,
    maxLength: 4,
    transform: value => value.toLowerCase(),
    message: 'order must be asc or desc'
  }),
  validateOptionalInt('page', {
    min: 1,
    max: 1000,
    transform: value => value
  }),
  validateOptionalInt('pageSize', {
    min: 1,
    max: 200,
    transform: value => value
  }),
  asyncHandler(async (req, res) => {
    const {
      token,
      sortBy,
      order = 'desc',
      page: rawPage,
      pageSize: rawPageSize
    } = req.query;
    const page = rawPage || 1;
    const pageSize = rawPageSize || 50;
    const allPools = await dexState.getPoolsAsync();
    const filteredPools = token
      ? allPools.filter(pool => {
        const identifiers = [
          pool.token0,
          pool.token1,
          pool.token0Symbol,
          pool.token1Symbol
        ]
          .filter(Boolean)
          .map(value => String(value).toLowerCase());
        return identifiers.some(value => value.includes(token));
      })
      : allPools;

    let resultPools = filteredPools;

    if (sortBy) {
      const direction = order === 'asc' ? 1 : -1;
      const accessor = {
        liquidity: pool => Number(pool.totalLiquidity) || 0,
        updatedat: pool => {
          const value = pool.updatedAt ? Date.parse(pool.updatedAt) : 0;
          return Number.isFinite(value) ? value : 0;
        },
        token0: pool => String(pool.token0Symbol || pool.token0 || '').toLowerCase(),
        token1: pool => String(pool.token1Symbol || pool.token1 || '').toLowerCase()
      };

      const key = sortBy.toLowerCase();
      const getter = accessor[key];

      if (typeof getter === 'function') {
        resultPools = [...filteredPools].sort((a, b) => {
          const aValue = getter(a);
          const bValue = getter(b);

          if (aValue < bValue) {
            return -1 * direction;
          }
          if (aValue > bValue) {
            return 1 * direction;
          }
          return 0;
        });
      }
    }

    const totalResults = resultPools.length;
    const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const paginatedPools = resultPools.slice(start, end);

    const summary = await dexState.getSummaryAsync();
    setSummaryHeaders(res, summary);
    res.json({
      success: true,
      data: paginatedPools,
      metadata: {
        count: paginatedPools.length,
        totalResults,
        totalPages,
        page: currentPage,
        pageSize,
        lastSwapAt: summary.lastSwapAt,
        filtered: Boolean(token),
        sortedBy: sortBy || null,
        order: sortBy ? order : null
      }
    });
  })
);

// Recent swap history (read-only)
router.get('/swaps/recent',
  optionalAuth(),
  cacheMiddleware({ ttl: 5 }),
  validateOptionalPattern('tokenIn', {
    pattern: /^0x[a-f0-9]{4,40}$/,
    minLength: 5,
    maxLength: 44,
    transform: value => value.toLowerCase(),
    message: 'tokenIn must be a valid token address'
  }),
  validateOptionalPattern('tokenOut', {
    pattern: /^0x[a-f0-9]{4,40}$/,
    minLength: 5,
    maxLength: 44,
    transform: value => value.toLowerCase(),
    message: 'tokenOut must be a valid token address'
  }),
  validateOptionalPattern('pair', {
    pattern: /^[a-z0-9]{4,40}->[a-z0-9]{4,40}$/,
    minLength: 11,
    maxLength: 91,
    transform: value => value.toLowerCase(),
    message: 'pair must be formatted as tokenin->tokenout'
  }),
  validateOptionalIsoTimestamp('since', {
    transform: (parsed) => new Date(parsed).toISOString()
  }),
  validateOptionalIsoTimestamp('until', {
    transform: (parsed) => new Date(parsed).toISOString()
  }),
  validateOptionalInt('limit', {
    min: 1,
    max: 50,
    transform: value => value
  }),
  asyncHandler(async (req, res) => {
    const {
      tokenIn,
      tokenOut,
      pair,
      since,
      until,
      limit
    } = req.query;

    let minAmountInValue = null;
    if (req.query.minAmountIn !== undefined) {
      const parsed = Number(req.query.minAmountIn);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({
          success: false,
          error: 'minAmountIn must be a non-negative number',
          code: 'INVALID_MIN_AMOUNT_IN'
        });
      }
      minAmountInValue = parsed;
    }

    let minAmountOutValue = null;
    if (req.query.minAmountOut !== undefined) {
      const parsed = Number(req.query.minAmountOut);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({
          success: false,
          error: 'minAmountOut must be a non-negative number',
          code: 'INVALID_MIN_AMOUNT_OUT'
        });
      }
      minAmountOutValue = parsed;
    }

    const sinceTime = since ? Date.parse(since) : null;
    const untilTime = until ? Date.parse(until) : null;

    if (sinceTime !== null && untilTime !== null && sinceTime > untilTime) {
      return res.status(400).json({
        success: false,
        error: 'since must be earlier than or equal to until',
        code: 'INVALID_TIME_RANGE'
      });
    }

    const requestedLimit = typeof limit === 'number' ? limit : undefined;
    const responseLimit = requestedLimit || RECENT_DEFAULT_LIMIT;
    const filtersApplied = Boolean(
      tokenIn ||
      tokenOut ||
      pair ||
      sinceTime !== null ||
      untilTime !== null ||
      minAmountInValue !== null ||
      minAmountOutValue !== null
    );

    const sampleLimit = filtersApplied && responseLimit < RECENT_MAX_SAMPLE
      ? RECENT_MAX_SAMPLE
      : responseLimit;

    let recent = await dexState.getRecentSwapsAsync(sampleLimit);
    const recentSampleSize = recent.length;

    if (tokenIn) {
      const normalized = tokenIn.toLowerCase();
      recent = recent.filter(swap => swap.tokenIn && String(swap.tokenIn).toLowerCase() === normalized);
    }

    if (tokenOut) {
      const normalized = tokenOut.toLowerCase();
      recent = recent.filter(swap => swap.tokenOut && String(swap.tokenOut).toLowerCase() === normalized);
    }

    if (pair) {
      const [pairIn, pairOut] = pair.split('->');
      recent = recent.filter(swap => {
        const swapIn = swap.tokenIn && String(swap.tokenIn).toLowerCase();
        const swapOut = swap.tokenOut && String(swap.tokenOut).toLowerCase();
        return swapIn === pairIn && swapOut === pairOut;
      });
    }

    if (minAmountInValue !== null) {
      recent = recent.filter(swap => Number(swap.amountIn) >= minAmountInValue);
    }

    if (minAmountOutValue !== null) {
      recent = recent.filter(swap => Number(swap.amountOut) >= minAmountOutValue);
    }

    if (sinceTime !== null || untilTime !== null) {
      recent = recent.filter(swap => {
        const swapTime = Date.parse(swap.timestamp);
        if (Number.isNaN(swapTime)) {
          return false;
        }
        if (sinceTime !== null && swapTime < sinceTime) {
          return false;
        }
        if (untilTime !== null && swapTime > untilTime) {
          return false;
        }
        return true;
      });
    }

    const limitedRecent = responseLimit ? recent.slice(0, responseLimit) : recent;

    const summary = await dexState.getSummaryAsync();
    setSummaryHeaders(res, summary);
    res.json({
      success: true,
      data: limitedRecent,
      metadata: {
        count: limitedRecent.length,
        totalTracked: summary.totalSwaps,
        maxRetention: 100,
        lastSwapAt: summary.lastSwapAt,
        sampled: recentSampleSize,
        filters: {
          tokenIn: tokenIn || null,
          tokenOut: tokenOut || null,
          pair: pair || null,
          minAmountIn: minAmountInValue,
          minAmountOut: minAmountOutValue,
          since: sinceTime !== null ? new Date(sinceTime).toISOString() : null,
          until: untilTime !== null ? new Date(untilTime).toISOString() : null,
          limit: responseLimit
        }
      }
    });
  })
);

// Top swap pairs
router.get('/swaps/top',
  optionalAuth(),
  cacheMiddleware({ ttl: 3 }),
  validateOptionalInt('limit', {
    min: 1,
    max: 25,
    transform: value => value
  }),
  validateOptionalBoolean('includeMetadata'),
  asyncHandler(async (req, res) => {
    const { limit, includeMetadata } = req.query;
    const stats = await dexState.getSwapStatsAsync({
      limit,
      includeMetadata
    });

    const summary = await dexState.getSummaryAsync();

    setSummaryHeaders(res, summary);
    res.json({
      success: true,
      data: stats,
      metadata: {
        count: stats.length,
        totalPairs: summary.totalPairs,
        totalSwaps: summary.totalSwaps,
        lastSwapAt: summary.lastSwapAt,
        limit: limit || null,
        includeMetadata: includeMetadata ?? null
      }
    });
  })
);

// Swap volume summary
router.get('/swaps/volume',
  optionalAuth(),
  cacheMiddleware({ ttl: 3 }),
  validateOptionalPattern('token', {
    pattern: /^0x[a-f0-9]{4,40}$/,
    minLength: 5,
    maxLength: 44,
    transform: value => value.toLowerCase(),
    message: 'token must be a valid token address'
  }),
  validateOptionalPattern('pair', {
    pattern: /^[a-z0-9]{4,40}->[a-z0-9]{4,40}$/,
    minLength: 11,
    maxLength: 91,
    transform: value => value.toLowerCase(),
    message: 'pair must be formatted as tokenin->tokenout'
  }),
  validateOptionalPattern('period', {
    pattern: /^(24h|7d|30d)$/,
    minLength: 2,
    maxLength: 3,
    transform: value => value.toLowerCase(),
    message: 'period must be one of 24h, 7d, 30d'
  }),
  asyncHandler(async (req, res) => {
    const { token, pair, period = '24h' } = req.query;

    const millisecondsByPeriod = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    const cutoff = Date.now() - millisecondsByPeriod[period];
    const recent = await dexState.getRecentSwapsAsync(100);

    const filtered = recent.filter(swap => {
      const timestamp = Date.parse(swap.timestamp);
      if (Number.isNaN(timestamp) || timestamp < cutoff) {
        return false;
      }

      if (pair) {
        const key = `${String(swap.tokenIn).toLowerCase()}->${String(swap.tokenOut).toLowerCase()}`;
        if (key !== pair) {
          return false;
        }
      }

      if (token) {
        const inMatch = swap.tokenIn && String(swap.tokenIn).toLowerCase() === token;
        const outMatch = swap.tokenOut && String(swap.tokenOut).toLowerCase() === token;
        if (!inMatch && !outMatch) {
          return false;
        }
      }

      return true;
    });

    const totals = filtered.reduce((acc, swap) => {
      acc.volumeIn += Number(swap.amountIn) || 0;
      acc.volumeOut += Number(swap.amountOut) || 0;
      acc.count += 1;
      return acc;
    }, { volumeIn: 0, volumeOut: 0, count: 0 });

    const averageAmountIn = totals.count > 0 ? totals.volumeIn / totals.count : 0;
    const averageAmountOut = totals.count > 0 ? totals.volumeOut / totals.count : 0;

    const summary = await dexState.getSummaryAsync();
    setSummaryHeaders(res, summary);
    res.json({
      success: true,
      data: {
        period,
        token: token || null,
        pair: pair || null,
        volumeIn: Number(totals.volumeIn.toFixed(8)),
        volumeOut: Number(totals.volumeOut.toFixed(8)),
        averageAmountIn: Number(averageAmountIn.toFixed(8)),
        averageAmountOut: Number(averageAmountOut.toFixed(8)),
        swapCount: totals.count
      },
      metadata: {
        windowSize: millisecondsByPeriod[period],
        evaluatedSwaps: filtered.length,
        recentBufferSize: recent.length
      }
    });
  })
);

// Swap token aggregates
router.get('/swaps/tokens',
  optionalAuth(),
  cacheMiddleware({ ttl: 3 }),
  validateOptionalInt('limit', {
    min: 1,
    max: 50,
    transform: value => value
  }),
  asyncHandler(async (req, res) => {
    const limit = req.query.limit || 10;
    const stats = await dexState.getSwapStatsAsync({ includeMetadata: true });

    const aggregateMap = new Map();

    stats.forEach(stat => {
      const tokenIn = String(stat.tokenIn).toLowerCase();
      const tokenOut = String(stat.tokenOut).toLowerCase();

      const tokenInEntry = aggregateMap.get(tokenIn) || {
        token: tokenIn,
        swapsAsIn: 0,
        swapsAsOut: 0,
        totalIn: 0,
        totalOut: 0,
        lastSwapAt: null
      };

      tokenInEntry.swapsAsIn += stat.swapCount;
      tokenInEntry.totalIn += stat.totalAmountIn;
      tokenInEntry.lastSwapAt = resolveLatestTimestamp(tokenInEntry.lastSwapAt, stat.lastSwapAt);
      aggregateMap.set(tokenIn, tokenInEntry);

      const tokenOutEntry = aggregateMap.get(tokenOut) || {
        token: tokenOut,
        swapsAsIn: 0,
        swapsAsOut: 0,
        totalIn: 0,
        totalOut: 0,
        lastSwapAt: null
      };

      tokenOutEntry.swapsAsOut += stat.swapCount;
      tokenOutEntry.totalOut += stat.totalAmountOut;
      tokenOutEntry.lastSwapAt = resolveLatestTimestamp(tokenOutEntry.lastSwapAt, stat.lastSwapAt);
      aggregateMap.set(tokenOut, tokenOutEntry);
    });

    const aggregates = Array.from(aggregateMap.values())
      .map(entry => ({
        token: entry.token,
        totalSwaps: entry.swapsAsIn + entry.swapsAsOut,
        swapsAsIn: entry.swapsAsIn,
        swapsAsOut: entry.swapsAsOut,
        totalAmountIn: Number(entry.totalIn.toFixed(8)),
        totalAmountOut: Number(entry.totalOut.toFixed(8)),
        netFlow: Number((entry.totalOut - entry.totalIn).toFixed(8)),
        lastSwapAt: entry.lastSwapAt
      }))
      .sort((a, b) => b.totalSwaps - a.totalSwaps)
      .slice(0, limit);

    const summary = await dexState.getSummaryAsync();
    setSummaryHeaders(res, summary);
    res.json({
      success: true,
      data: aggregates,
      metadata: {
        count: aggregates.length,
        limit,
        totalPairs: summary.totalPairs,
        totalSwaps: summary.totalSwaps
      }
    });
  })
);

// Swap statistics
router.get('/swaps/stats',
  optionalAuth(),
  cacheMiddleware({ ttl: 2 }),
  validateOptionalPattern('tokenIn', {
    pattern: /^0x[a-f0-9]{4,40}$/,
    minLength: 5,
    maxLength: 44,
    transform: value => value.toLowerCase(),
    message: 'tokenIn must be a valid token address'
  }),
  validateOptionalPattern('tokenOut', {
    pattern: /^0x[a-f0-9]{4,40}$/,
    minLength: 5,
    maxLength: 44,
    transform: value => value.toLowerCase(),
    message: 'tokenOut must be a valid token address'
  }),
  validateOptionalPattern('pair', {
    pattern: /^[a-z0-9]{4,40}->[a-z0-9]{4,40}$/,
    minLength: 11,
    maxLength: 91,
    transform: value => value.toLowerCase(),
    message: 'pair must be formatted as tokenin->tokenout'
  }),
  validateOptionalInt('limit', {
    min: 1,
    max: 100,
    transform: value => value
  }),
  validateOptionalBoolean('includeMetadata'),
  asyncHandler(async (req, res) => {
    const stats = await dexState.getSwapStatsAsync({
      tokenIn: req.query.tokenIn,
      tokenOut: req.query.tokenOut,
      pair: req.query.pair,
      limit: req.query.limit,
      includeMetadata: req.query.includeMetadata
    });

    const summary = await dexState.getSummaryAsync();
    setSummaryHeaders(res, summary);

    res.json({
      success: true,
      data: stats,
      metadata: {
        count: stats.length,
        totalPairs: summary.totalPairs,
        totalSwaps: summary.totalSwaps,
        lastSwapAt: summary.lastSwapAt
      }
    });
  })
);

// Service metrics (lightweight)
router.get('/metrics',
  optionalAuth(),
  cacheMiddleware({ ttl: 2 }),
  asyncHandler(async (req, res) => {
    const [metrics, summary] = await Promise.all([
      dexState.getPoolsMetricsAsync(),
      dexState.getSummaryAsync()
    ]);

    setSummaryHeaders(res, summary);
    res.json({
      success: true,
      data: metrics
    });
  })
);

// Consolidated overview snapshot
router.get('/overview',
  optionalAuth(),
  cacheMiddleware({ ttl: 3 }),
  asyncHandler(async (req, res) => {
    const [summary, metrics, pools, recentSwaps] = await Promise.all([
      dexState.getSummaryAsync(),
      dexState.getPoolsMetricsAsync(),
      dexState.getPoolsAsync(),
      dexState.getRecentSwapsAsync(5)
    ]);

    const topPools = pools
      .map(pool => ({
        id: pool.id,
        token0: pool.token0,
        token1: pool.token1,
        totalLiquidity: pool.totalLiquidity,
        fee: pool.fee,
        updatedAt: pool.updatedAt,
        liquidityValue: Number(pool.totalLiquidity)
      }))
      .sort((a, b) => (b.liquidityValue || 0) - (a.liquidityValue || 0))
      .slice(0, 5)
      .map(({ _liquidityValue, ...pool }) => pool);

    setSummaryHeaders(res, summary);

    res.json({
      success: true,
      data: {
        summary,
        metrics,
        topPools,
        recentSwaps
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        recentSwapsLimit: 5
      }
    });
  })
);

// Service health probe
router.get('/health',
  cacheMiddleware({ ttl: 1 }),
  validateOptionalBoolean('includeMetrics'),
  asyncHandler(async (req, res) => {
    const includeMetrics = req.query.includeMetrics === true;
    const start = Date.now();
    let storeStatus = 'unknown';
    let storeLatency = null;
    let summary = null;

    try {
      summary = await dexState.getSummaryAsync();
      storeStatus = 'ok';
      storeLatency = Date.now() - start;
    } catch (_error) {
      storeStatus = 'error';
      storeLatency = Date.now() - start;
    }

    if (!summary) {
      summary = {
        totalPools: 0,
        totalSwaps: 0,
        totalPairs: 0,
        lastSwapAt: null
      };
    }

    let metrics = null;
    if (includeMetrics) {
      try {
        metrics = await dexState.getPoolsMetricsAsync();
      } catch (error) {
        metrics = {
          error: 'metrics_unavailable',
          message: error.message
        };
      }
    }

    setSummaryHeaders(res, summary);

    res.json({
      success: true,
      data: {
        status: storeStatus,
        latencyMs: storeLatency,
        timestamp: new Date().toISOString(),
        pools: summary.totalPools,
        swaps: summary.totalSwaps,
        pairs: summary.totalPairs,
        lastSwapAt: summary.lastSwapAt,
        metrics: includeMetrics ? metrics : undefined
      }
    });
  })
);

module.exports = router;
