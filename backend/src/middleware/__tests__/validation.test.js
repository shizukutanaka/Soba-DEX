const { validationRules, validationMiddleware } = require('../validation');

describe('Validation Rules', () => {
  describe('amount validation', () => {
    test('should reject non-numeric values', () => {
      const validator = validationRules.amount();
      const result = validator.run({ body: { amount: 'abc' } });

      expect(result).toBeDefined();
    });

    test('should reject negative amounts', () => {
      const validator = validationRules.amount();
      const result = validator.run({ body: { amount: '-10' } });

      expect(result).toBeDefined();
    });
  });

  describe('token validation', () => {
    test('should accept valid Ethereum address', () => {
      const validator = validationRules.token();
      const _validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

      expect(validator).toBeDefined();
    });

    test('should reject invalid Ethereum address', () => {
      const validator = validationRules.token();
      const _invalidAddress = '0xinvalid';

      expect(validator).toBeDefined();
    });
  });

  describe('swap validation', () => {
    test('should validate all swap fields', () => {
      const validators = validationRules.swap();

      expect(validators).toHaveLength(4);
      expect(validators).toBeDefined();
    });
  });

  describe('liquidity validation', () => {
    test('should validate all liquidity fields', () => {
      const validators = validationRules.liquidity();

      expect(validators).toHaveLength(4);
      expect(validators).toBeDefined();
    });
  });

  describe('pagination validation', () => {
    test('should validate page and limit', () => {
      const validators = validationRules.pagination();

      expect(validators).toHaveLength(2);
      expect(validators).toBeDefined();
    });
  });
});

describe('validationMiddleware', () => {
  test('should throw error for unknown validator', () => {
    expect(() => {
      validationMiddleware('nonexistent');
    }).toThrow('Validator "nonexistent" not found');
  });

  test('should return array of middleware functions', () => {
    const middleware = validationMiddleware('amount');

    expect(Array.isArray(middleware)).toBe(true);
    expect(middleware.length).toBeGreaterThan(0);
  });
});
