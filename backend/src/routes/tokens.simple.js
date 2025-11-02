/**
 * Token Routes - Token Information
 */

const express = require('express');
const router = express.Router();
const { cacheMiddleware } = require('../middleware/cache');
const { validatePagination, validatePathParam } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/unifiedAuth');
const tokenRegistry = require('../services/tokenRegistry');

// Get all tokens
router.get('/',
  optionalAuth(),
  cacheMiddleware({ ttl: 300 }),
  validatePagination({ defaultLimit: 25, maxLimit: 50 }),
  asyncHandler(async (req, res) => {
    const { offset, limit } = req.pagination;
    const etag = tokenRegistry.getEtag();

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    const { items, total } = tokenRegistry.listTokens({ offset, limit });

    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', tokenRegistry.getUpdatedAt());
    res.setHeader('Cache-Control', 'public, max-age=120, must-revalidate');
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page-Offset', String(offset));
    res.setHeader('X-Page-Limit', String(limit));

    res.json({
      success: true,
      data: items,
      pagination: {
        total,
        page: req.pagination.page,
        limit: req.pagination.limit,
        offset,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: offset + limit < total,
        hasPrev: req.pagination.page > 1
      }
    });
  })
);

// Get token by address
router.get('/:address',
  optionalAuth(),
  cacheMiddleware({ ttl: 60 }),
  validatePathParam('address', {
    minLength: 5,
    maxLength: 44,
    pattern: /^0x[a-fA-F0-9]{4,40}$/,
    transform: value => value.toLowerCase()
  }),
  asyncHandler(async (req, res) => {
    const token = tokenRegistry.getTokenByAddress(req.params.address);

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found'
      });
    }

    res.setHeader('ETag', tokenRegistry.getEtag());
    res.setHeader('Last-Modified', tokenRegistry.getUpdatedAt());
    res.json({ success: true, data: token });
  })
);

module.exports = router;
