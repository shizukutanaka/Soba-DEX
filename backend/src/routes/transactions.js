/**
 * Transaction Routes for Transaction History
 * Provides transaction history and details
 * Version: 2.7.0 - Database integration
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/winstonLogger');
const { responseMiddleware } = require('../utils/apiResponse');
const { isValidAddress, isValidTxHash, validatePagination } = require('../utils/validators');
const transactionService = require('../services/transactionService');

// Apply response middleware
router.use(responseMiddleware);

/**
 * GET /api/transactions/history
 * Get transaction history for an address
 */
router.get('/history',
  asyncHandler(async (req, res) => {
    const { address, limit = 20, page = 1, type, status } = req.query;

    // Validate address
    if (!address || !isValidAddress(address)) {
      return res.sendValidationError({
        field: 'address',
        message: 'Valid Ethereum address is required'
      });
    }

    // Validate pagination
    const paginationError = validatePagination(page, limit, 100);
    if (paginationError) {
      return res.sendValidationError({
        field: paginationError.field,
        message: paginationError.message
      });
    }

    try {
      const result = await transactionService.getTransactionsByAddress(
        address,
        {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          type,
          status
        }
      );

      res.sendPaginated(
        result.transactions,
        result.pagination.page,
        result.pagination.limit,
        result.pagination.total
      );

    } catch (error) {
      logger.error('[Transactions] Error fetching history', {
        error: error.message,
        address
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/transactions/:hash
 * Get transaction details by hash
 */
router.get('/:hash',
  asyncHandler(async (req, res) => {
    const { hash } = req.params;

    // Validate hash
    if (!hash || !isValidTxHash(hash)) {
      return res.sendValidationError({
        field: 'hash',
        message: 'Valid transaction hash is required'
      });
    }

    try {
      const transaction = await transactionService.getTransactionByHash(hash);

      res.sendSuccess(transaction);

    } catch (error) {
      if (error.name === 'NotFoundError') {
        return res.sendNotFound('Transaction not found');
      }

      logger.error('[Transactions] Error fetching transaction', {
        error: error.message,
        hash
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * POST /api/transactions/record
 * Record a new transaction
 */
router.post('/record',
  asyncHandler(async (req, res) => {
    const {
      hash,
      type,
      status,
      from,
      to,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      gasUsed,
      gasFee,
      gasPrice,
      blockNumber,
      blockHash,
      metadata
    } = req.body;

    // Validate required fields
    if (!hash || !isValidTxHash(hash)) {
      return res.sendValidationError({
        field: 'hash',
        message: 'Valid transaction hash is required'
      });
    }

    if (!type) {
      return res.sendValidationError({
        field: 'type',
        message: 'Transaction type is required'
      });
    }

    if (!from || !isValidAddress(from)) {
      return res.sendValidationError({
        field: 'from',
        message: 'Valid from address is required'
      });
    }

    // Validate to address if provided
    if (to && !isValidAddress(to)) {
      return res.sendValidationError({
        field: 'to',
        message: 'Invalid to address'
      });
    }

    try {
      const transactionData = {
        hash,
        type,
        status: status || 'PENDING',
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        gasUsed,
        gasCost: gasFee,
        gasPrice,
        blockNumber,
        blockHash,
        metadata
      };

      const transaction = await transactionService.recordTransaction(from, transactionData);

      logger.info('[Transactions] Transaction recorded', {
        hash,
        type,
        from
      });

      res.sendCreated(transaction);

    } catch (error) {
      logger.error('[Transactions] Error recording transaction', {
        error: error.message,
        hash
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * PUT /api/transactions/:hash/status
 * Update transaction status
 */
router.put('/:hash/status',
  asyncHandler(async (req, res) => {
    const { hash } = req.params;
    const { status, blockNumber, blockHash, gasFee, gasUsed, errorMessage } = req.body;

    // Validate hash
    if (!hash || !isValidTxHash(hash)) {
      return res.sendValidationError({
        field: 'hash',
        message: 'Valid transaction hash is required'
      });
    }

    // Validate status
    if (!status) {
      return res.sendValidationError({
        field: 'status',
        message: 'Status is required'
      });
    }

    const validStatuses = ['PENDING', 'CONFIRMED', 'FAILED'];
    const statusUpper = status.toUpperCase();
    if (!validStatuses.includes(statusUpper)) {
      return res.sendValidationError({
        field: 'status',
        message: 'Status must be one of: PENDING, CONFIRMED, FAILED'
      });
    }

    try {
      const updateData = {
        blockNumber,
        blockHash,
        gasCost: gasFee,
        gasUsed,
        errorMessage
      };

      const transaction = await transactionService.updateTransactionStatus(
        hash,
        status,
        updateData
      );

      logger.info('[Transactions] Status updated', {
        hash,
        status
      });

      res.sendSuccess({
        message: 'Transaction status updated',
        transaction
      });

    } catch (error) {
      if (error.code === 'P2025') {
        return res.sendNotFound('Transaction not found');
      }

      logger.error('[Transactions] Error updating status', {
        error: error.message,
        hash
      });

      return res.sendServerError(error);
    }
  })
);

/**
 * GET /api/transactions/stats/:address
 * Get transaction statistics for an address
 */
router.get('/stats/:address',
  asyncHandler(async (req, res) => {
    const { address } = req.params;

    // Validate address
    if (!address || !isValidAddress(address)) {
      return res.sendValidationError({
        field: 'address',
        message: 'Valid Ethereum address is required'
      });
    }

    try {
      const stats = await transactionService.getStatsByAddress(address);

      res.sendSuccess(stats);

    } catch (error) {
      logger.error('[Transactions] Error fetching stats', {
        error: error.message,
        address
      });

      return res.sendServerError(error);
    }
  })
);

module.exports = router;
