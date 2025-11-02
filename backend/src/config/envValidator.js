class EnvValidator {
  constructor() {
    this.requiredVars = new Map();
    this.optionalVars = new Map();
    this.validationRules = new Map();
    this.errors = [];
    this.warnings = [];
  }

  // Define required environment variables
  require(name, description = '', defaultValue = null) {
    this.requiredVars.set(name, { description, defaultValue });
    return this;
  }

  // Define optional environment variables
  optional(name, description = '', defaultValue = null) {
    this.optionalVars.set(name, { description, defaultValue });
    return this;
  }

  // Add validation rules
  addRule(name, validator, errorMessage) {
    if (!this.validationRules.has(name)) {
      this.validationRules.set(name, []);
    }
    this.validationRules.get(name).push({ validator, errorMessage });
    return this;
  }

  // Common validation rules
  isPort(name) {
    return this.addRule(name,
      (value) => {
        const port = parseInt(value);
        return !isNaN(port) && port >= 1 && port <= 65535;
      },
      `${name} must be a valid port number (1-65535)`
    );
  }

  isUrl(name) {
    return this.addRule(name,
      (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      `${name} must be a valid URL`
    );
  }

  isEmail(name) {
    return this.addRule(name,
      (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      `${name} must be a valid email address`
    );
  }

  isBoolean(name) {
    return this.addRule(name,
      (value) => ['true', 'false', '1', '0'].includes(value.toLowerCase()),
      `${name} must be a boolean value (true/false)`
    );
  }

  isNumber(name, min = null, max = null) {
    return this.addRule(name,
      (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) {
          return false;
        }
        if (min !== null && num < min) {
          return false;
        }
        if (max !== null && num > max) {
          return false;
        }
        return true;
      },
      `${name} must be a number${min !== null ? ` >= ${min}` : ''}${max !== null ? ` <= ${max}` : ''}`
    );
  }

  oneOf(name, allowedValues) {
    return this.addRule(name,
      (value) => allowedValues.includes(value),
      `${name} must be one of: ${allowedValues.join(', ')}`
    );
  }

  // Validate all environment variables
  validate() {
    this.errors = [];
    this.warnings = [];

    // Check required variables
    this.requiredVars.forEach((config, name) => {
      const value = process.env[name];

      if (!value) {
        if (config.defaultValue !== null) {
          process.env[name] = config.defaultValue.toString();
          this.warnings.push(`Using default value for ${name}: ${config.defaultValue}`);
        } else {
          this.errors.push(`Required environment variable ${name} is not set`);
        }
      }
    });

    // Set defaults for optional variables
    this.optionalVars.forEach((config, name) => {
      if (!process.env[name] && config.defaultValue !== null) {
        process.env[name] = config.defaultValue.toString();
      }
    });

    // Run validation rules
    this.validationRules.forEach((rules, name) => {
      const value = process.env[name];

      if (value) {
        rules.forEach(({ validator, errorMessage }) => {
          if (!validator(value)) {
            this.errors.push(errorMessage);
          }
        });
      }
    });

    // Check for undefined but commonly needed variables
    this.checkCommonVariables();

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  checkCommonVariables() {
    const commonVars = [
      'NODE_ENV',
      'PORT',
      'DATABASE_URL',
      'JWT_SECRET',
      'REDIS_URL'
    ];

    commonVars.forEach(varName => {
      if (!process.env[varName] &&
          !this.requiredVars.has(varName) &&
          !this.optionalVars.has(varName)) {
        this.warnings.push(`Common environment variable ${varName} is not defined`);
      }
    });
  }

  // Generate environment template
  generateTemplate() {
    let template = '# Environment Variables Template\n\n';

    template += '# Required Variables\n';
    this.requiredVars.forEach((config, name) => {
      template += `${name}=${config.defaultValue || ''} # ${config.description}\n`;
    });

    template += '\n# Optional Variables\n';
    this.optionalVars.forEach((config, name) => {
      template += `# ${name}=${config.defaultValue || ''} # ${config.description}\n`;
    });

    return template;
  }

  // Get configuration object
  getConfig() {
    const config = {};

    // Add required variables
    this.requiredVars.forEach((_, name) => {
      config[name] = this.parseValue(process.env[name]);
    });

    // Add optional variables
    this.optionalVars.forEach((_, name) => {
      if (process.env[name]) {
        config[name] = this.parseValue(process.env[name]);
      }
    });

    return config;
  }

  parseValue(value) {
    if (!value) {
      return value;
    }

    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, return as string
      return value;
    }
  }

  // Print validation results
  printResults() {
    if (this.errors.length > 0) {
      console.error('❌ Environment validation failed:');
      this.errors.forEach(error => console.error(`  - ${error}`));
    }

    if (this.warnings.length > 0) {
      console.warn('⚠️  Environment warnings:');
      this.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    if (this.errors.length === 0) {
      console.log('✅ Environment validation passed');
    }
  }
}

// Create validator for DEX platform
function createDEXValidator() {
  return new EnvValidator()
    // Server configuration
    .require('NODE_ENV', 'Application environment', 'development')
    .require('PORT', 'Server port', '3001')
    .require('HOST', 'Server host', '0.0.0.0')

    // Database configuration
    .require('DB_HOST', 'Database host', 'localhost')
    .require('DB_PORT', 'Database port', '5432')
    .require('DB_NAME', 'Database name', 'dex')
    .require('DB_USER', 'Database user', 'postgres')
    .optional('DB_PASSWORD', 'Database password', '')
    .optional('DATABASE_URL', 'Complete database URL')

    // Security
    .require('JWT_SECRET', 'JWT signing secret')
    .optional('SESSION_SECRET', 'Session secret')
    .optional('ENCRYPTION_KEY', 'Data encryption key')

    // External services
    .optional('REDIS_URL', 'Redis connection URL', 'redis://localhost:6379')
    .optional('SMTP_HOST', 'Email server host')
    .optional('SMTP_PORT', 'Email server port', '587')
    .optional('SMTP_USER', 'Email username')
    .optional('SMTP_PASS', 'Email password')

    // API configuration
    .optional('API_RATE_LIMIT', 'API rate limit per minute', '100')
    .optional('MAX_FILE_SIZE', 'Maximum upload file size', '5MB')
    .optional('CORS_ORIGIN', 'CORS allowed origins', '*')

    // Monitoring
    .optional('LOG_LEVEL', 'Logging level', 'info')
    .optional('ENABLE_METRICS', 'Enable metrics collection', 'true')

    // Validation rules
    .isPort('PORT')
    .isPort('DB_PORT')
    .oneOf('NODE_ENV', ['development', 'production', 'test'])
    .oneOf('LOG_LEVEL', ['error', 'warn', 'info', 'debug'])
    .isBoolean('ENABLE_METRICS')
    .isNumber('API_RATE_LIMIT', 1, 10000);
}

module.exports = { EnvValidator, createDEXValidator };