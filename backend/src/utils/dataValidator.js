class DataValidator {
  constructor() {
    this.rules = new Map();
    this.customValidators = new Map();
    this.errorMessages = {
      required: 'Field is required',
      string: 'Must be a string',
      number: 'Must be a number',
      boolean: 'Must be a boolean',
      email: 'Must be a valid email address',
      url: 'Must be a valid URL',
      min: 'Value is too small',
      max: 'Value is too large',
      minLength: 'Too short',
      maxLength: 'Too long',
      pattern: 'Invalid format',
      enum: 'Invalid value',
      array: 'Must be an array',
      object: 'Must be an object'
    };
  }

  // Create validation schema
  schema(rules) {
    return new ValidationSchema(rules, this);
  }

  // Validate single value
  validate(value, rule, context = {}) {
    const errors = [];

    try {
      // Handle null/undefined
      if (value === null) {
        if (rule.required) {
          errors.push(this.getErrorMessage('required', rule, context));
        }
        return { valid: errors.length === 0, errors, value: rule.default || value };
      }

      // Type validation
      if (rule.type && !this.validateType(value, rule.type)) {
        errors.push(this.getErrorMessage(rule.type, rule, context));
        return { valid: false, errors, value };
      }

      // Custom validator
      if (rule.validator && typeof rule.validator === 'function') {
        const result = rule.validator(value, context);
        if (result !== true) {
          errors.push(typeof result === 'string' ? result : 'Validation failed');
        }
      }

      // Built-in validations
      const transformedValue = this.applyValidations(value, rule, errors, context);

      return {
        valid: errors.length === 0,
        errors,
        value: transformedValue
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`],
        value
      };
    }
  }

  // Validate type
  validateType(value, type) {
    switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && !Array.isArray(value) && value !== null;
    case 'email':
      return typeof value === 'string' && this.isValidEmail(value);
    case 'url':
      return typeof value === 'string' && this.isValidUrl(value);
    case 'date':
      return value instanceof Date || !isNaN(Date.parse(value));
    default:
      return true;
    }
  }

  // Apply validation rules
  applyValidations(value, rule, errors, context) {
    let transformedValue = value;

    // String validations
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        errors.push(this.getErrorMessage('minLength', rule, context));
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push(this.getErrorMessage('maxLength', rule, context));
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(this.getErrorMessage('pattern', rule, context));
      }
      if (rule.trim) {
        transformedValue = value.trim();
      }
      if (rule.lowercase) {
        transformedValue = transformedValue.toLowerCase();
      }
      if (rule.uppercase) {
        transformedValue = transformedValue.toUpperCase();
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push(this.getErrorMessage('min', rule, context));
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push(this.getErrorMessage('max', rule, context));
      }
      if (rule.integer && !Number.isInteger(value)) {
        errors.push('Must be an integer');
      }
    }

    // Array validations
    if (Array.isArray(value)) {
      if (rule.minItems && value.length < rule.minItems) {
        errors.push(`Must have at least ${rule.minItems} items`);
      }
      if (rule.maxItems && value.length > rule.maxItems) {
        errors.push(`Must have at most ${rule.maxItems} items`);
      }
      if (rule.uniqueItems && this.hasDuplicates(value)) {
        errors.push('Items must be unique');
      }
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push(this.getErrorMessage('enum', rule, context));
    }

    // Custom validations
    if (rule.custom) {
      Object.entries(rule.custom).forEach(([name, _validator]) => {
        if (this.customValidators.has(name)) {
          const result = this.customValidators.get(name)(value, context);
          if (result !== true) {
            errors.push(typeof result === 'string' ? result : `${name} validation failed`);
          }
        }
      });
    }

    return transformedValue;
  }

  // Check for duplicate items in array
  hasDuplicates(arr) {
    return new Set(arr).size !== arr.length;
  }

  // Validate email format
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate URL format
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Get error message
  getErrorMessage(type, rule, context) {
    if (rule.message) {
      return typeof rule.message === 'function' ? rule.message(context) : rule.message;
    }
    return this.errorMessages[type] || 'Validation failed';
  }

  // Add custom validator
  addValidator(name, validator) {
    this.customValidators.set(name, validator);
  }

  // Common validation rules
  static rules = {
    // User validation
    email: {
      type: 'email',
      required: true,
      trim: true,
      lowercase: true,
      maxLength: 255
    },

    password: {
      type: 'string',
      required: true,
      minLength: 8,
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      message: 'Password must contain uppercase, lowercase, and number'
    },

    username: {
      type: 'string',
      required: true,
      minLength: 3,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_]+$/,
      trim: true
    },

    // Trading validation
    amount: {
      type: 'number',
      required: true,
      min: 0.00001,
      max: 1000000
    },

    price: {
      type: 'number',
      required: true,
      min: 0
    },

    symbol: {
      type: 'string',
      required: true,
      pattern: /^[A-Z]+\/[A-Z]+$/,
      uppercase: true
    },

    orderType: {
      type: 'string',
      required: true,
      enum: ['market', 'limit', 'stop']
    },

    side: {
      type: 'string',
      required: true,
      enum: ['buy', 'sell']
    },

    // Common fields
    id: {
      type: 'string',
      required: true,
      pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    },

    page: {
      type: 'number',
      min: 1,
      integer: true,
      default: 1
    },

    limit: {
      type: 'number',
      min: 1,
      max: 100,
      integer: true,
      default: 20
    }
  };
}

// Validation Schema class
class ValidationSchema {
  constructor(rules, validator) {
    this.rules = rules;
    this.validator = validator;
  }

  // Validate object against schema
  validate(data) {
    const result = {
      valid: true,
      errors: {},
      data: {}
    };

    // Validate each field
    Object.entries(this.rules).forEach(([field, rule]) => {
      const value = data[field];
      const validation = this.validator.validate(value, rule, { field, data });

      if (!validation.valid) {
        result.valid = false;
        result.errors[field] = validation.errors;
      }

      result.data[field] = validation.value;
    });

    // Check for unknown fields
    Object.keys(data).forEach(field => {
      if (!this.rules[field]) {
        result.errors[field] = ['Unknown field'];
        result.valid = false;
      }
    });

    return result;
  }

  // Express middleware
  middleware() {
    return (req, res, next) => {
      const data = { ...req.body, ...req.query, ...req.params };
      const validation = this.validate(data);

      if (!validation.valid) {
        return res.status(400).json({
          error: true,
          message: 'Validation failed',
          errors: validation.errors
        });
      }

      req.validated = validation.data;
      next();
    };
  }
}

// Create validator instance
const validator = new DataValidator();

// Add common custom validators
validator.addValidator('cryptoAddress', (value) => {
  // Basic crypto address validation
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length < 20 || value.length > 100) {
    return false;
  }
  return /^[a-zA-Z0-9]+$/.test(value);
});

validator.addValidator('phoneNumber', (value) => {
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(value);
});

validator.addValidator('ipAddress', (value) => {
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipRegex.test(value);
});

module.exports = validator;