/**
 * Input Validation Utilities
 * Version: 2.6.1 - Practical improvements
 *
 * Centralized validation functions for:
 * - Ethereum addresses
 * - Token amounts
 * - Transaction hashes
 * - Pagination parameters
 * - Common inputs
 */

const { ethers } = require('ethers');

/**
 * Validate Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean} - True if valid
 */
function isValidAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }

  try {
    return ethers.utils.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * Validate and normalize Ethereum address
 * @param {string} address - Address to validate
 * @returns {string} - Normalized (checksummed) address
 * @throws {Error} - If address is invalid
 */
function validateAndNormalizeAddress(address) {
  if (!isValidAddress(address)) {
    throw new Error('Invalid Ethereum address');
  }

  return ethers.utils.getAddress(address); // Returns checksummed address
}

/**
 * Validate transaction hash
 * @param {string} hash - Transaction hash to validate
 * @returns {boolean} - True if valid
 */
function isValidTxHash(hash) {
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  // Must be 66 characters (0x + 64 hex characters)
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Validate token amount (must be positive number or numeric string)
 * @param {string|number} amount - Amount to validate
 * @returns {boolean} - True if valid
 */
function isValidAmount(amount) {
  if (amount === null || amount === undefined || amount === '') {
    return false;
  }

  try {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return !isNaN(num) && num > 0 && isFinite(num);
  } catch {
    return false;
  }
}

/**
 * Validate amount is within range
 * @param {string|number} amount - Amount to validate
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @returns {boolean} - True if valid
 */
function isAmountInRange(amount, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!isValidAmount(amount)) {
    return false;
  }

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num >= min && num <= max;
}

/**
 * Validate token symbol (2-10 uppercase letters)
 * @param {string} symbol - Token symbol to validate
 * @returns {boolean} - True if valid
 */
function isValidTokenSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    return false;
  }

  return /^[A-Z]{2,10}$/.test(symbol);
}

/**
 * Validate token pair (e.g., "ETH-USDC")
 * @param {string} pair - Token pair to validate
 * @returns {boolean} - True if valid
 */
function isValidTokenPair(pair) {
  if (!pair || typeof pair !== 'string') {
    return false;
  }

  const parts = pair.split('-');
  if (parts.length !== 2) {
    return false;
  }

  return parts.every(isValidTokenSymbol);
}

/**
 * Validate pagination parameters
 * @param {number|string} page - Page number
 * @param {number|string} limit - Items per page
 * @returns {Object} - Validated { page, limit } or null if invalid
 */
function validatePagination(page, limit) {
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum < 1) {
    return null;
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return null;
  }

  return { page: pageNum, limit: limitNum };
}

/**
 * Validate time period (1h, 24h, 7d, 30d, 1y)
 * @param {string} period - Time period to validate
 * @returns {boolean} - True if valid
 */
function isValidPeriod(period) {
  const validPeriods = ['1h', '24h', '7d', '30d', '1y'];
  return validPeriods.includes(period);
}

/**
 * Validate sorting parameter (field:order)
 * @param {string} sort - Sort parameter (e.g., "price:asc")
 * @param {Array<string>} allowedFields - Allowed field names
 * @returns {Object|null} - { field, order } or null if invalid
 */
function validateSort(sort, allowedFields = []) {
  if (!sort || typeof sort !== 'string') {
    return null;
  }

  const parts = sort.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const [field, order] = parts;

  // Check if field is allowed
  if (allowedFields.length > 0 && !allowedFields.includes(field)) {
    return null;
  }

  // Check if order is valid
  if (!['asc', 'desc'].includes(order.toLowerCase())) {
    return null;
  }

  return { field, order: order.toLowerCase() };
}

/**
 * Validate string length
 * @param {string} str - String to validate
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @returns {boolean} - True if valid
 */
function isValidStringLength(str, min = 1, max = 255) {
  if (typeof str !== 'string') {
    return false;
  }

  return str.length >= min && str.length <= max;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Simple but effective email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate integer in range
 * @param {number|string} value - Value to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} - True if valid
 */
function isValidInteger(value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;

  if (isNaN(num) || !Number.isInteger(num)) {
    return false;
  }

  return num >= min && num <= max;
}

/**
 * Sanitize string (remove special characters)
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeString(str) {
  if (typeof str !== 'string') {
    return '';
  }

  // Remove any characters that are not alphanumeric, space, dash, or underscore
  return str.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim();
}

/**
 * Validate UUID v4
 * @param {string} uuid - UUID to validate
 * @returns {boolean} - True if valid
 */
function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate CUID (Prisma default ID format)
 * @param {string} cuid - CUID to validate
 * @returns {boolean} - True if valid
 */
function isValidCUID(cuid) {
  if (!cuid || typeof cuid !== 'string') {
    return false;
  }

  // CUID format: starts with 'c', followed by timestamp and random string
  return /^c[a-z0-9]{24}$/i.test(cuid);
}

/**
 * Express validator middleware for common validations
 */
const validationMiddleware = {
  /**
   * Validate Ethereum address in request
   */
  address: (field = 'address') => {
    return (req, res, next) => {
      const address = req.body[field] || req.params[field] || req.query[field];

      if (!isValidAddress(address)) {
        return res.status(400).json({
          success: false,
          error: `Invalid Ethereum address: ${field}`,
        });
      }

      // Normalize and attach to request
      req.validated = req.validated || {};
      req.validated[field] = ethers.utils.getAddress(address);

      next();
    };
  },

  /**
   * Validate amount in request
   */
  amount: (field = 'amount', min = 0, max = Number.MAX_SAFE_INTEGER) => {
    return (req, res, next) => {
      const amount = req.body[field] || req.params[field] || req.query[field];

      if (!isAmountInRange(amount, min, max)) {
        return res.status(400).json({
          success: false,
          error: `Invalid amount: ${field} (must be between ${min} and ${max})`,
        });
      }

      req.validated = req.validated || {};
      req.validated[field] = typeof amount === 'string' ? parseFloat(amount) : amount;

      next();
    };
  },

  /**
   * Validate pagination in request
   */
  pagination: () => {
    return (req, res, next) => {
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;

      const validated = validatePagination(page, limit);

      if (!validated) {
        return res.status(400).json({
          success: false,
          error: 'Invalid pagination parameters (page >= 1, limit 1-100)',
        });
      }

      req.validated = req.validated || {};
      req.validated.pagination = validated;

      next();
    };
  },
};

module.exports = {
  // Address validation
  isValidAddress,
  validateAndNormalizeAddress,

  // Transaction validation
  isValidTxHash,

  // Amount validation
  isValidAmount,
  isAmountInRange,

  // Token validation
  isValidTokenSymbol,
  isValidTokenPair,

  // Pagination
  validatePagination,

  // Time periods
  isValidPeriod,

  // Sorting
  validateSort,

  // String validation
  isValidStringLength,
  sanitizeString,

  // Email and URL
  isValidEmail,
  isValidUrl,

  // Numbers
  isValidInteger,

  // IDs
  isValidUUID,
  isValidCUID,

  // Express middleware
  validationMiddleware,
};
