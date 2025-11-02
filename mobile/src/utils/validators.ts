/**
 * Validators Utility
 *
 * Common validation functions for forms and user input
 * Centralized for consistency and reusability
 *
 * @version 1.0.0
 */

/**
 * Validate wallet address format
 */
export const isValidAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate amount for trading
 */
export const isValidAmount = (amount: string | number): boolean => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return !isNaN(num) && num > 0 && num < Number.MAX_SAFE_INTEGER;
};

/**
 * Validate email address
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate trading amount string
 */
export const validateTradingAmount = (amount: string): { valid: boolean; error?: string } => {
  if (!amount || amount.trim() === '') {
    return { valid: false, error: 'Amount is required' };
  }

  const num = parseFloat(amount);
  if (isNaN(num)) {
    return { valid: false, error: 'Invalid amount format' };
  }

  if (num <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  if (num > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: 'Amount too large' };
  }

  // Check decimal places
  const decimalPlaces = (amount.split('.')[1] || '').length;
  if (decimalPlaces > 8) {
    return { valid: false, error: 'Too many decimal places' };
  }

  return { valid: true };
};

/**
 * Validate slippage tolerance
 */
export const validateSlippageTolerance = (slippage: string): { valid: boolean; error?: string } => {
  const num = parseFloat(slippage);

  if (isNaN(num)) {
    return { valid: false, error: 'Invalid slippage value' };
  }

  if (num < 0) {
    return { valid: false, error: 'Slippage cannot be negative' };
  }

  if (num > 50) {
    return { valid: false, error: 'Slippage cannot exceed 50%' };
  }

  return { valid: true };
};

/**
 * Validate deadline for transactions
 */
export const validateDeadline = (deadline: string): { valid: boolean; error?: string } => {
  const num = parseInt(deadline);

  if (isNaN(num)) {
    return { valid: false, error: 'Invalid deadline' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (num <= now) {
    return { valid: false, error: 'Deadline must be in the future' };
  }

  const maxDeadline = now + (24 * 60 * 60); // 24 hours from now
  if (num > maxDeadline) {
    return { valid: false, error: 'Deadline too far in the future' };
  }

  return { valid: true };
};

/**
 * Validate gas price
 */
export const validateGasPrice = (gasPrice: string): { valid: boolean; error?: string } => {
  const num = parseFloat(gasPrice);

  if (isNaN(num)) {
    return { valid: false, error: 'Invalid gas price' };
  }

  if (num < 1) {
    return { valid: false, error: 'Gas price too low' };
  }

  if (num > 1000) {
    return { valid: false, error: 'Gas price too high' };
  }

  return { valid: true };
};

/**
 * Validate phone number (basic)
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

/**
 * Validate URL
 */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate required field
 */
export const isRequired = (value: any): { valid: boolean; error?: string } => {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: 'This field is required' };
  }
  return { valid: true };
};
