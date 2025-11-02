/**
 * Authentication Routes
 * Wallet-based authentication for DEX platform
 * Version: 2.6.1 - With validators and standardized responses
 */

const express = require('express');
const { ethers } = require('ethers');
const { logger } = require('../utils/productionLogger');
const { ValidationError, AuthenticationError } = require('../middleware/globalErrorHandler');
const { authMiddleware } = require('../middleware/auth');
const userService = require('../services/userService');
const { isValidAddress, validateAndNormalizeAddress, isValidStringLength } = require('../utils/validators');
const { responseMiddleware } = require('../utils/apiResponse');

const router = express.Router();

// Apply response middleware to all routes
router.use(responseMiddleware);

// In-memory store for nonces (use Redis in production)
const nonces = new Map();
const NONCE_EXPIRY = 5 * 60 * 1000; // 5 minutes

/**
 * Generate cryptographically secure nonce
 */
function generateNonce() {
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Clean up expired nonces
 */
function cleanupExpiredNonces() {
  const now = Date.now();
  for (const [address, data] of nonces.entries()) {
    if (now - data.createdAt > NONCE_EXPIRY) {
      nonces.delete(address);
    }
  }
}

// Cleanup interval
setInterval(cleanupExpiredNonces, 60 * 1000); // Every minute

/**
 * POST /api/auth/nonce
 * Request nonce for wallet signature
 */
router.post('/nonce', (req, res, next) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.sendValidationError({ field: 'address', message: 'Wallet address is required' });
    }

    // Validate Ethereum address using validator
    if (!isValidAddress(address)) {
      return res.sendValidationError({ field: 'address', message: 'Invalid Ethereum address' });
    }

    const nonce = generateNonce();
    const normalizedAddress = address.toLowerCase();

    nonces.set(normalizedAddress, {
      nonce,
      createdAt: Date.now()
    });

    logger.info('Nonce generated', { address: normalizedAddress });

    res.sendSuccess({
      nonce,
      message: `Sign this message to authenticate with Soba DEX: ${nonce}`,
      expiresIn: NONCE_EXPIRY
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/verify
 * Verify wallet signature and create session
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { address, signature, message } = req.body;

    // Validate required fields
    if (!address || !signature || !message) {
      return res.sendValidationError([
        { field: 'address', message: 'Address is required' },
        { field: 'signature', message: 'Signature is required' },
        { field: 'message', message: 'Message is required' }
      ].filter(e => !req.body[e.field]));
    }

    // Validate address using validator
    if (!isValidAddress(address)) {
      return res.sendValidationError({ field: 'address', message: 'Invalid Ethereum address' });
    }

    const normalizedAddress = address.toLowerCase();
    const nonceData = nonces.get(normalizedAddress);

    if (!nonceData) {
      return res.sendUnauthorized('Nonce not found or expired. Please request a new nonce');
    }

    // Check nonce expiry
    if (Date.now() - nonceData.createdAt > NONCE_EXPIRY) {
      nonces.delete(normalizedAddress);
      return res.sendUnauthorized('Nonce expired. Please request a new nonce');
    }

    // Verify signature using ethers.js
    let recoveredAddress;
    try {
      recoveredAddress = ethers.utils.verifyMessage(message, signature);
    } catch (error) {
      logger.error('Signature verification failed', { error: error.message });
      return res.sendUnauthorized('Invalid signature format');
    }

    // Check if recovered address matches provided address
    if (recoveredAddress.toLowerCase() !== normalizedAddress) {
      logger.warn('Address mismatch', {
        provided: normalizedAddress,
        recovered: recoveredAddress.toLowerCase()
      });
      return res.sendUnauthorized('Signature does not match address');
    }

    // Verify message contains the correct nonce
    if (!message.includes(nonceData.nonce)) {
      return res.sendUnauthorized('Message does not contain valid nonce');
    }

    // Delete used nonce
    nonces.delete(normalizedAddress);

    // Create or get user from database
    const user = await userService.createOrGetUser(normalizedAddress, {
      preferences: { theme: 'dark', language: 'en' }
    });

    // Create session
    const sessionData = authMiddleware.createSession(
      user.id,
      req.get('user-agent'),
      req.ip
    );

    logger.info('User authenticated', {
      userId: user.id,
      address: normalizedAddress
    });

    res.sendSuccess({
      user: {
        id: user.id,
        address: user.address,
        username: user.username,
        role: user.role
      },
      session: {
        token: sessionData.token,
        expiresAt: sessionData.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout user and invalidate session
 */
router.post('/logout', authMiddleware.requireAuth(), (req, res, next) => {
  try {
    const sessionToken = req.headers['x-session-token'];

    if (sessionToken) {
      authMiddleware.invalidateSession(sessionToken);
    }

    logger.info('User logged out', { userId: req.user?.id });

    res.sendSuccess({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authMiddleware.requireAuth(), (req, res, next) => {
  try {
    // In production, fetch full user data from database
    const user = {
      id: req.user.id,
      address: req.user.id,
      role: 'user'
    };

    res.sendSuccess({ user });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/sessions
 * Get user's active sessions
 */
router.get('/sessions', authMiddleware.requireAuth(), (req, res, next) => {
  try {
    const sessions = authMiddleware.getUserSessions(req.user.id);

    res.sendSuccess({ sessions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/api-key
 * Create API key for programmatic access
 */
router.post('/api-key', authMiddleware.requireAuth(), (req, res, next) => {
  try {
    const { permissions = [], label, expiresAt } = req.body;

    // Validate label if provided
    if (label && !isValidStringLength(label, 1, 100)) {
      return res.sendValidationError({ field: 'label', message: 'Label must be 1-100 characters' });
    }

    const metadata = {};
    if (label) metadata.label = label;
    if (expiresAt) metadata.expiresAt = expiresAt;

    const apiKeyData = authMiddleware.createApiKey(req.user.id, {
      permissions,
      metadata
    });

    logger.info('API key created', {
      userId: req.user.id,
      label: apiKeyData.label
    });

    res.sendCreated({
      apiKey: apiKeyData.apiKey,
      fingerprint: apiKeyData.fingerprint,
      expiresAt: apiKeyData.expiresAt,
      label: apiKeyData.label,
      message: 'Store this API key securely. It will not be shown again.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/api-keys
 * List user's API keys
 */
router.get('/api-keys', authMiddleware.requireAuth(), (req, res, next) => {
  try {
    const apiKeys = authMiddleware.getUserApiKeys(req.user.id);

    res.sendSuccess({ apiKeys });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/stats
 * Get authentication statistics (admin only)
 */
router.get('/stats', authMiddleware.requireAuth(), (req, res, next) => {
  try {
    // In production, check if user has admin role
    const stats = authMiddleware.getStats();

    res.sendSuccess(stats);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
