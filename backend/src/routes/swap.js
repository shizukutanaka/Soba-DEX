/**
 * Swap Routes with Advanced Security
 * Integrates MEV Protection, Price Oracle Redundancy, and Slippage Protection
 * Version: 2.6.1 - With validators and standardized responses
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/productionLogger');
const { mevProtectionAdvanced } = require('../security/mevProtectionAdvanced');
const { priceOracleRedundancy } = require('../security/priceOracleRedundancy');
const { advancedSlippageProtection } = require('../security/advancedSlippageProtection');
const dexState = require('../services/dexState');
const { isValidTokenSymbol, isValidAmount, isValidAddress } = require('../utils/validators');
const { responseMiddleware } = require('../utils/apiResponse');

// Apply response middleware
router.use(responseMiddleware);

/**
 * POST /api/swap/quote
 * Get swap quote with optimal slippage and price verification
 */
router.post('/quote',
  asyncHandler(async (req, res) => {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      userSlippage = null
    } = req.body;

    // Validate inputs
    if (!tokenIn || !tokenOut) {
      return res.sendValidationError([
        { field: 'tokenIn', message: 'Token in is required' },
        { field: 'tokenOut', message: 'Token out is required' }
      ].filter(e => !req.body[e.field.replace('Token ', 'token')]));
    }

    if (!isValidTokenSymbol(tokenIn)) {
      return res.sendValidationError({ field: 'tokenIn', message: 'Invalid token symbol format' });
    }

    if (!isValidTokenSymbol(tokenOut)) {
      return res.sendValidationError({ field: 'tokenOut', message: 'Invalid token symbol format' });
    }

    if (!isValidAmount(amountIn)) {
      return res.sendValidationError({ field: 'amountIn', message: 'Amount must be a positive number' });
    }

    try {
      // 1. Get optimal slippage with dynamic calculation
      const slippageData = await advancedSlippageProtection.calculateOptimalSlippage({
        tokenIn,
        tokenOut,
        amountIn: parseFloat(amountIn),
        userSlippage
      });

      // 2. Get price from multiple oracles with consensus
      const priceData = await priceOracleRedundancy.getPrice(tokenIn, tokenOut);

      if (!priceData.valid) {
        return res.status(503).json({
          success: false,
          error: 'Unable to get reliable price data',
          code: 'PRICE_UNAVAILABLE',
          details: priceData.reason
        });
      }

      // 3. Calculate expected output
      const expectedAmountOut = amountIn * priceData.price;
      const minAmountOut = expectedAmountOut * (1 - (slippageData.slippage || slippageData.recommended || 0.5) / 100);

      // 4. Build quote response
      const quote = {
        tokenIn,
        tokenOut,
        amountIn: parseFloat(amountIn),
        expectedAmountOut: parseFloat(expectedAmountOut.toFixed(8)),
        minAmountOut: parseFloat(minAmountOut.toFixed(8)),
        price: priceData.price,
        priceImpact: 0, // Calculate based on pool size
        slippage: slippageData.slippage || slippageData.recommended,
        route: [tokenIn, tokenOut],
        executionTime: Date.now()
      };

      // 5. Add warnings if any
      const warnings = [];
      if (slippageData.warning) {
        warnings.push(slippageData.warning);
      }
      if (priceData.confidence < 70) {
        warnings.push(`Low price confidence: ${priceData.confidence}%`);
      }

      res.json({
        success: true,
        data: quote,
        metadata: {
          slippageBreakdown: slippageData.breakdown,
          slippageConfidence: slippageData.confidence,
          slippageRiskLevel: slippageData.riskLevel,
          priceConfidence: priceData.confidence,
          priceDeviation: priceData.deviation,
          oracleSources: priceData.sources,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      });

    } catch (error) {
      logger.error('[Swap] Quote error', {
        error: error.message,
        tokenIn,
        tokenOut,
        amountIn
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to generate quote',
        code: 'QUOTE_ERROR'
      });
    }
  })
);

/**
 * POST /api/swap/execute
 * Execute swap with full MEV protection
 */
router.post('/execute',
  asyncHandler(async (req, res) => {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      maxSlippage,
      from,
      gasPrice,
      priorityFee
    } = req.body;

    // Validate inputs
    if (!tokenIn || !tokenOut || !from) {
      return res.status(400).json({
        success: false,
        error: 'tokenIn, tokenOut, and from address are required',
        code: 'MISSING_PARAMS'
      });
    }

    if (!amountIn || isNaN(amountIn) || amountIn <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amountIn must be a positive number',
        code: 'INVALID_AMOUNT'
      });
    }

    try {
      // 1. Create transaction context
      const txContext = {
        tokenIn,
        tokenOut,
        tokenPair: `${tokenIn}/${tokenOut}`,
        amountIn: parseFloat(amountIn),
        minAmountOut: minAmountOut ? parseFloat(minAmountOut) : undefined,
        maxSlippage: maxSlippage ? parseFloat(maxSlippage) : 5.0,
        from,
        gasPrice: gasPrice ? parseFloat(gasPrice) : undefined,
        priorityFee: priorityFee ? parseFloat(priorityFee) : undefined,
        timestamp: Date.now(),
        type: 'swap'
      };

      // 2. Run MEV protection checks
      const mevCheck = await mevProtectionAdvanced.protectTransaction(txContext, {
        userAddress: from,
        tokenPair: txContext.tokenPair
      });

      if (mevCheck.blocked) {
        logger.warn('[Swap] Transaction blocked by MEV protection', {
          reason: mevCheck.reason,
          attackType: mevCheck.attackType,
          from
        });

        return res.status(403).json({
          success: false,
          error: 'Transaction blocked for security',
          code: 'MEV_PROTECTION_BLOCK',
          reason: mevCheck.reason,
          attackType: mevCheck.attackType
        });
      }

      // 3. Verify price hasn't changed significantly
      const priceData = await priceOracleRedundancy.getPrice(tokenIn, tokenOut);
      if (!priceData.valid) {
        return res.status(503).json({
          success: false,
          error: 'Price data unavailable',
          code: 'PRICE_UNAVAILABLE'
        });
      }

      const expectedAmountOut = amountIn * priceData.price;
      const calculatedSlippage = minAmountOut
        ? ((expectedAmountOut - minAmountOut) / expectedAmountOut) * 100
        : maxSlippage;

      // 4. Validate slippage
      const slippageValidation = await advancedSlippageProtection.validateSlippage({
        expectedAmountOut,
        actualAmountOut: minAmountOut || expectedAmountOut * (1 - maxSlippage / 100),
        maxSlippage: maxSlippage || 5.0,
        hash: `sim-${Date.now()}`
      });

      if (!slippageValidation.valid) {
        return res.status(400).json({
          success: false,
          error: slippageValidation.message,
          code: 'SLIPPAGE_EXCEEDED'
        });
      }

      // 5. Execute swap (simulate for now)
      const swapResult = {
        hash: `0x${Math.random().toString(16).substring(2, 66)}`,
        status: 'pending',
        tokenIn,
        tokenOut,
        amountIn: parseFloat(amountIn),
        expectedAmountOut: parseFloat(expectedAmountOut.toFixed(8)),
        minAmountOut: minAmountOut || parseFloat((expectedAmountOut * (1 - maxSlippage / 100)).toFixed(8)),
        slippage: calculatedSlippage,
        price: priceData.price,
        from,
        timestamp: new Date().toISOString(),
        gasPrice: gasPrice || null,
        priorityFee: priorityFee || null
      };

      // 6. Record swap in state
      await dexState.recordSwap({
        tokenIn,
        tokenOut,
        amountIn: parseFloat(amountIn),
        amountOut: swapResult.expectedAmountOut,
        timestamp: swapResult.timestamp,
        hash: swapResult.hash,
        from
      });

      logger.info('[Swap] Execute successful', {
        hash: swapResult.hash,
        tokenIn,
        tokenOut,
        amountIn,
        from
      });

      res.json({
        success: true,
        data: swapResult,
        metadata: {
          mevWarning: mevCheck.warning,
          priceConfidence: priceData.confidence,
          slippageValid: slippageValidation.valid,
          protectionEnabled: true
        }
      });

    } catch (error) {
      logger.error('[Swap] Execute error', {
        error: error.message,
        stack: error.stack,
        tokenIn,
        tokenOut,
        from
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to execute swap',
        code: 'SWAP_EXECUTE_ERROR'
      });
    }
  })
);

/**
 * GET /api/swap/security-stats
 * Get MEV protection and security statistics
 */
router.get('/security-stats',
  asyncHandler(async (req, res) => {
    const mevStats = mevProtectionAdvanced.getStatistics();
    const slippageStats = advancedSlippageProtection.getStatistics();
    const oracleStats = priceOracleRedundancy.getStatistics();

    res.json({
      success: true,
      data: {
        mev: mevStats,
        slippage: slippageStats,
        oracle: oracleStats,
        timestamp: new Date().toISOString()
      }
    });
  })
);

module.exports = router;
