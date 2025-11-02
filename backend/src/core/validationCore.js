/**
 * Validation Core - Comprehensive Input Validation
 * Production-grade validation for all API inputs
 */

class ValidationCore {
  constructor() {
    this.schemas = new Map();
    this.customValidators = new Map();
  }

  // Register validation schema
  registerSchema(name, schema) {
    this.schemas.set(name, schema);
  }

  // Register custom validator
  registerValidator(name, validatorFn) {
    this.customValidators.set(name, validatorFn);
  }

  // Validate against schema
  validate(data, schemaName) {
    const schema = this.schemas.get(schemaName);
    if (!schema) {
      return { valid: false, errors: [`Schema '${schemaName}' not found`] };
    }

    return this.validateObject(data, schema);
  }

  validateObject(data, schema) {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      const fieldErrors = this.validateField(value, rules, field);

      if (fieldErrors.length > 0) {
        errors.push(...fieldErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  validateField(value, rules, fieldName) {
    const errors = [];

    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${fieldName} is required`);
      return errors;
    }

    // If not required and empty, skip other validations
    if (!rules.required && (value === undefined || value === null || value === '')) {
      return errors;
    }

    // Type validation
    if (rules.type) {
      const typeError = this.validateType(value, rules.type, fieldName);
      if (typeError) {
        errors.push(typeError);
      }
    }

    // String validations
    if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${fieldName} must be at least ${rules.minLength} characters`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${fieldName} must be at most ${rules.maxLength} characters`);
      }
      if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
        errors.push(`${fieldName} format is invalid`);
      }
      if (rules.email && !this.isValidEmail(value)) {
        errors.push(`${fieldName} must be a valid email`);
      }
      if (rules.url && !this.isValidURL(value)) {
        errors.push(`${fieldName} must be a valid URL`);
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${fieldName} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${fieldName} must be at most ${rules.max}`);
      }
      if (rules.integer && !Number.isInteger(value)) {
        errors.push(`${fieldName} must be an integer`);
      }
      if (rules.positive && value <= 0) {
        errors.push(`${fieldName} must be positive`);
      }
    }

    // Array validations
    if (Array.isArray(value)) {
      if (rules.minItems && value.length < rules.minItems) {
        errors.push(`${fieldName} must have at least ${rules.minItems} items`);
      }
      if (rules.maxItems && value.length > rules.maxItems) {
        errors.push(`${fieldName} must have at most ${rules.maxItems} items`);
      }
      if (rules.uniqueItems && new Set(value).size !== value.length) {
        errors.push(`${fieldName} must have unique items`);
      }
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${fieldName} must be one of: ${rules.enum.join(', ')}`);
    }

    // Custom validator
    if (rules.custom) {
      const validator = this.customValidators.get(rules.custom);
      if (validator) {
        const result = validator(value);
        if (result !== true) {
          errors.push(result || `${fieldName} is invalid`);
        }
      }
    }

    return errors;
  }

  validateType(value, type, fieldName) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (type === 'number' && actualType !== 'number') {
      return `${fieldName} must be a number`;
    }
    if (type === 'string' && actualType !== 'string') {
      return `${fieldName} must be a string`;
    }
    if (type === 'boolean' && actualType !== 'boolean') {
      return `${fieldName} must be a boolean`;
    }
    if (type === 'array' && !Array.isArray(value)) {
      return `${fieldName} must be an array`;
    }
    if (type === 'object' && (actualType !== 'object' || Array.isArray(value))) {
      return `${fieldName} must be an object`;
    }

    return null;
  }

  // Built-in validators
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  isValidAddress(address) {
    // Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  // Common schemas
  registerCommonSchemas() {
    // User registration
    this.registerSchema('userRegister', {
      username: {
        required: true,
        type: 'string',
        minLength: 3,
        maxLength: 30,
        pattern: '^[a-zA-Z0-9_-]+$'
      },
      email: {
        required: true,
        type: 'string',
        email: true
      },
      password: {
        required: true,
        type: 'string',
        minLength: 8,
        maxLength: 100
      }
    });

    // Trading order
    this.registerSchema('tradeOrder', {
      pair: {
        required: true,
        type: 'string',
        pattern: '^[A-Z]+-[A-Z]+$'
      },
      side: {
        required: true,
        type: 'string',
        enum: ['buy', 'sell']
      },
      type: {
        required: true,
        type: 'string',
        enum: ['market', 'limit']
      },
      amount: {
        required: true,
        type: 'number',
        positive: true
      },
      price: {
        required: false,
        type: 'number',
        positive: true
      }
    });

    // Swap request
    this.registerSchema('swapRequest', {
      fromToken: {
        required: true,
        type: 'string',
        custom: 'ethereumAddress'
      },
      toToken: {
        required: true,
        type: 'string',
        custom: 'ethereumAddress'
      },
      amount: {
        required: true,
        type: 'string',
        pattern: '^\\d+$'
      },
      slippage: {
        required: false,
        type: 'number',
        min: 0,
        max: 50
      }
    });

    // Register custom validators
    this.registerValidator('ethereumAddress', (value) => {
      return this.isValidAddress(value) || 'Invalid Ethereum address';
    });

    this.registerValidator('uuid', (value) => {
      return this.isValidUUID(value) || 'Invalid UUID';
    });
  }

  // Middleware generator
  createValidationMiddleware(schemaName) {
    return (req, res, next) => {
      const result = this.validate(req.body, schemaName);

      if (!result.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          errors: result.errors
        });
      }

      next();
    };
  }

  // Query parameter validation
  validateQuery(query, rules) {
    const errors = [];

    for (const [param, rule] of Object.entries(rules)) {
      const value = query[param];

      if (rule.required && !value) {
        errors.push(`Query parameter '${param}' is required`);
        continue;
      }

      if (value && rule.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`Query parameter '${param}' must be a number`);
        } else {
          query[param] = num;
        }
      }

      if (value && rule.type === 'boolean') {
        if (value === 'true' || value === '1') {
          query[param] = true;
        } else if (value === 'false' || value === '0') {
          query[param] = false;
        } else {
          errors.push(`Query parameter '${param}' must be a boolean`);
        }
      }

      if (value && rule.enum && !rule.enum.includes(value)) {
        errors.push(`Query parameter '${param}' must be one of: ${rule.enum.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      query
    };
  }
}

const validationCore = new ValidationCore();
validationCore.registerCommonSchemas();

module.exports = validationCore;