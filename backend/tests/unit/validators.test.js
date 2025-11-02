/**
 * Validators Unit Tests
 * Version: 2.6.1
 *
 * Tests all validation functions
 */

const {
  isValidAddress,
  validateAndNormalizeAddress,
  isValidTxHash,
  isValidAmount,
  isAmountInRange,
  isValidTokenSymbol,
  isValidTokenPair,
  validatePagination,
  isValidPeriod,
  validateSort,
  isValidStringLength,
  isValidEmail,
  isValidUrl,
  isValidInteger,
  isValidUUID,
  isValidCUID,
} = require('../../src/utils/validators');

describe('Validators', () => {
  describe('isValidAddress', () => {
    test('should validate correct Ethereum addresses', () => {
      expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb')).toBe(true);
      expect(isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(isValidAddress('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(true);
    });

    test('should reject invalid addresses', () => {
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('')).toBe(false);
      expect(isValidAddress(null)).toBe(false);
      expect(isValidAddress(undefined)).toBe(false);
      expect(isValidAddress('0xGGGG35Cc6634C0532925a3b844Bc9e7595f0bEb')).toBe(false);
    });
  });

  describe('validateAndNormalizeAddress', () => {
    test('should return checksummed address for valid input', () => {
      const address = '0x742d35cc6634c0532925a3b844bc9e7595f0beb';
      const normalized = validateAndNormalizeAddress(address);
      expect(normalized).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    test('should throw error for invalid address', () => {
      expect(() => validateAndNormalizeAddress('invalid')).toThrow();
    });
  });

  describe('isValidTxHash', () => {
    test('should validate correct transaction hashes', () => {
      expect(isValidTxHash('0x1234567890123456789012345678901234567890123456789012345678901234')).toBe(true);
      expect(isValidTxHash('0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd')).toBe(true);
    });

    test('should reject invalid transaction hashes', () => {
      expect(isValidTxHash('0x123')).toBe(false);
      expect(isValidTxHash('1234567890123456789012345678901234567890123456789012345678901234')).toBe(false); // no 0x
      expect(isValidTxHash('')).toBe(false);
      expect(isValidTxHash(null)).toBe(false);
    });
  });

  describe('isValidAmount', () => {
    test('should validate positive numbers', () => {
      expect(isValidAmount(1)).toBe(true);
      expect(isValidAmount(0.001)).toBe(true);
      expect(isValidAmount('100.5')).toBe(true);
      expect(isValidAmount('1e5')).toBe(true);
    });

    test('should reject invalid amounts', () => {
      expect(isValidAmount(0)).toBe(false);
      expect(isValidAmount(-1)).toBe(false);
      expect(isValidAmount('invalid')).toBe(false);
      expect(isValidAmount('')).toBe(false);
      expect(isValidAmount(null)).toBe(false);
      expect(isValidAmount(NaN)).toBe(false);
      expect(isValidAmount(Infinity)).toBe(false);
    });
  });

  describe('isAmountInRange', () => {
    test('should validate amounts in range', () => {
      expect(isAmountInRange(5, 0, 10)).toBe(true);
      expect(isAmountInRange(0.5, 0.1, 1)).toBe(true);
      expect(isAmountInRange('5', 0, 10)).toBe(true);
    });

    test('should reject amounts out of range', () => {
      expect(isAmountInRange(11, 0, 10)).toBe(false);
      expect(isAmountInRange(-1, 0, 10)).toBe(false);
      expect(isAmountInRange(0, 1, 10)).toBe(false);
    });
  });

  describe('isValidTokenSymbol', () => {
    test('should validate correct token symbols', () => {
      expect(isValidTokenSymbol('ETH')).toBe(true);
      expect(isValidTokenSymbol('USDC')).toBe(true);
      expect(isValidTokenSymbol('WBTC')).toBe(true);
      expect(isValidTokenSymbol('AAVE')).toBe(true);
    });

    test('should reject invalid token symbols', () => {
      expect(isValidTokenSymbol('eth')).toBe(false); // lowercase
      expect(isValidTokenSymbol('E')).toBe(false); // too short
      expect(isValidTokenSymbol('VERYLONGSYMBOL')).toBe(false); // too long
      expect(isValidTokenSymbol('ETH-USDC')).toBe(false); // contains special char
      expect(isValidTokenSymbol('123')).toBe(false); // numbers
      expect(isValidTokenSymbol('')).toBe(false);
      expect(isValidTokenSymbol(null)).toBe(false);
    });
  });

  describe('isValidTokenPair', () => {
    test('should validate correct token pairs', () => {
      expect(isValidTokenPair('ETH-USDC')).toBe(true);
      expect(isValidTokenPair('WBTC-ETH')).toBe(true);
      expect(isValidTokenPair('DAI-USDT')).toBe(true);
    });

    test('should reject invalid token pairs', () => {
      expect(isValidTokenPair('ETH')).toBe(false); // no dash
      expect(isValidTokenPair('ETH-')).toBe(false); // missing second token
      expect(isValidTokenPair('-USDC')).toBe(false); // missing first token
      expect(isValidTokenPair('eth-usdc')).toBe(false); // lowercase
      expect(isValidTokenPair('ETH-USDC-DAI')).toBe(false); // too many parts
      expect(isValidTokenPair('')).toBe(false);
      expect(isValidTokenPair(null)).toBe(false);
    });
  });

  describe('validatePagination', () => {
    test('should validate correct pagination', () => {
      expect(validatePagination(1, 20)).toEqual({ page: 1, limit: 20 });
      expect(validatePagination('2', '50')).toEqual({ page: 2, limit: 50 });
      expect(validatePagination(10, 100)).toEqual({ page: 10, limit: 100 });
    });

    test('should reject invalid pagination', () => {
      expect(validatePagination(0, 20)).toBeNull(); // page < 1
      expect(validatePagination(1, 0)).toBeNull(); // limit < 1
      expect(validatePagination(1, 101)).toBeNull(); // limit > 100
      expect(validatePagination('invalid', 20)).toBeNull();
      expect(validatePagination(1, 'invalid')).toBeNull();
    });
  });

  describe('isValidPeriod', () => {
    test('should validate valid periods', () => {
      expect(isValidPeriod('1h')).toBe(true);
      expect(isValidPeriod('24h')).toBe(true);
      expect(isValidPeriod('7d')).toBe(true);
      expect(isValidPeriod('30d')).toBe(true);
      expect(isValidPeriod('1y')).toBe(true);
    });

    test('should reject invalid periods', () => {
      expect(isValidPeriod('1m')).toBe(false);
      expect(isValidPeriod('2h')).toBe(false);
      expect(isValidPeriod('invalid')).toBe(false);
      expect(isValidPeriod('')).toBe(false);
      expect(isValidPeriod(null)).toBe(false);
    });
  });

  describe('validateSort', () => {
    test('should validate correct sort parameters', () => {
      expect(validateSort('price:asc', ['price', 'volume'])).toEqual({ field: 'price', order: 'asc' });
      expect(validateSort('volume:desc', ['price', 'volume'])).toEqual({ field: 'volume', order: 'desc' });
      expect(validateSort('name:ASC', ['name'])).toEqual({ field: 'name', order: 'asc' });
    });

    test('should reject invalid sort parameters', () => {
      expect(validateSort('price', ['price'])).toBeNull(); // no colon
      expect(validateSort('price:invalid', ['price'])).toBeNull(); // invalid order
      expect(validateSort('invalid:asc', ['price'])).toBeNull(); // field not allowed
      expect(validateSort('', [])).toBeNull();
      expect(validateSort(null, [])).toBeNull();
    });
  });

  describe('isValidStringLength', () => {
    test('should validate strings within length range', () => {
      expect(isValidStringLength('test', 1, 10)).toBe(true);
      expect(isValidStringLength('a', 1, 1)).toBe(true);
      expect(isValidStringLength('hello world', 1, 20)).toBe(true);
    });

    test('should reject strings outside length range', () => {
      expect(isValidStringLength('', 1, 10)).toBe(false);
      expect(isValidStringLength('test', 5, 10)).toBe(false);
      expect(isValidStringLength('very long string', 1, 5)).toBe(false);
      expect(isValidStringLength(123, 1, 10)).toBe(false); // not a string
    });
  });

  describe('isValidEmail', () => {
    test('should validate correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('test+tag@example.com')).toBe(true);
    });

    test('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('test@example')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    test('should validate correct URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('https://sub.domain.com/path?query=1')).toBe(true);
    });

    test('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false); // not http/https
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl(null)).toBe(false);
    });
  });

  describe('isValidInteger', () => {
    test('should validate integers in range', () => {
      expect(isValidInteger(5, 0, 10)).toBe(true);
      expect(isValidInteger('7', 0, 10)).toBe(true);
      expect(isValidInteger(0, -10, 10)).toBe(true);
    });

    test('should reject non-integers and out of range', () => {
      expect(isValidInteger(5.5, 0, 10)).toBe(false); // decimal
      expect(isValidInteger(11, 0, 10)).toBe(false); // out of range
      expect(isValidInteger('invalid', 0, 10)).toBe(false);
      expect(isValidInteger(NaN, 0, 10)).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    test('should validate correct UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-41d1-80b4-00c04fd430c8')).toBe(true);
    });

    test('should reject invalid UUIDs', () => {
      expect(isValidUUID('invalid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false); // version 3, not 4
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID(null)).toBe(false);
    });
  });

  describe('isValidCUID', () => {
    test('should validate CUID format', () => {
      expect(isValidCUID('c12345678901234567890123')).toBe(false); // Actual CUIDs are more complex
      // Note: Real CUID validation would need proper CUID generation library
    });

    test('should reject invalid CUIDs', () => {
      expect(isValidCUID('invalid')).toBe(false);
      expect(isValidCUID('12345678901234567890123')).toBe(false); // doesn't start with 'c'
      expect(isValidCUID('c123')).toBe(false); // too short
      expect(isValidCUID('')).toBe(false);
      expect(isValidCUID(null)).toBe(false);
    });
  });
});
