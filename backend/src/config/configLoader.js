const fs = require('fs');
const path = require('path');
const { createDEXValidator } = require('./envValidator');

class ConfigLoader {
  constructor() {
    this.config = new Map();
    this.watchers = new Map();
    this.validators = new Map();
    this.cache = new Map();
    this.initialized = false;
  }

  // Initialize configuration system
  async init() {
    if (this.initialized) {
      return this.getAll();
    }

    // Validate environment variables first
    const envValidator = createDEXValidator();
    const validation = envValidator.validate();

    if (!validation.valid) {
      console.error('Environment validation failed:', validation.errors);
      throw new Error('Invalid environment configuration');
    }

    if (validation.warnings.length > 0) {
      console.warn('Environment warnings:', validation.warnings);
    }

    // Load configuration files
    await this.loadConfigs();

    // Apply environment overrides
    this.applyEnvironmentOverrides();

    // Set up file watchers in development
    if (process.env.NODE_ENV === 'development') {
      this.setupFileWatchers();
    }

    this.initialized = true;
    console.log('Configuration system initialized');
    return this.getAll();
  }

  // Load configuration files
  async loadConfigs() {
    const configDir = __dirname;
    const configFiles = [
      'default.json',
      `${process.env.NODE_ENV || 'development'}.json`,
      'local.json'
    ];

    for (const file of configFiles) {
      const filePath = path.join(configDir, file);
      await this.loadConfigFile(filePath);
    }
  }

  // Load single configuration file
  async loadConfigFile(filePath) {
    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(content);

      this.mergeConfig(config);
      console.log(`Loaded config: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`Failed to load config file ${filePath}:`, error.message);
    }
  }

  // Merge configuration object
  mergeConfig(newConfig, prefix = '') {
    Object.keys(newConfig).forEach(key => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = newConfig[key];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.mergeConfig(value, fullKey);
      } else {
        this.config.set(fullKey, value);
      }
    });
  }

  // Apply environment variable overrides
  applyEnvironmentOverrides() {
    // Convert environment variables to config keys
    Object.keys(process.env).forEach(envKey => {
      const configKey = this.envToConfigKey(envKey);
      if (configKey) {
        const value = this.parseEnvValue(process.env[envKey]);
        this.config.set(configKey, value);
      }
    });
  }

  // Convert environment variable name to config key
  envToConfigKey(envKey) {
    // Skip non-app environment variables
    if (!envKey.startsWith('APP_') && !this.isKnownConfigKey(envKey)) {
      return null;
    }

    // Convert APP_DATABASE_HOST -> database.host
    const key = envKey
      .replace(/^APP_/, '')
      .toLowerCase()
      .replace(/_/g, '.');

    return key;
  }

  // Check if it's a known configuration key
  isKnownConfigKey(envKey) {
    const knownKeys = [
      'NODE_ENV', 'PORT', 'HOST',
      'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
      'REDIS_URL', 'JWT_SECRET', 'SESSION_SECRET',
      'LOG_LEVEL', 'CORS_ORIGIN'
    ];

    return knownKeys.includes(envKey);
  }

  // Parse environment value to appropriate type
  parseEnvValue(value) {
    if (!value) {
      return value;
    }

    // Boolean
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }

    // Number
    if (/^\d+$/.test(value)) {
      return parseInt(value);
    }
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    // Comma-separated array
    if (value.includes(',')) {
      return value.split(',').map(s => s.trim());
    }

    return value;
  }

  // Get configuration value
  get(key, defaultValue = null) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    let value = this.config.get(key);

    // Try nested key access
    if (value === undefined && key.includes('.')) {
      value = this.getNestedValue(key);
    }

    if (value === undefined) {
      value = defaultValue;
    }

    this.cache.set(key, value);
    return value;
  }

  // Get nested value by dot notation
  getNestedValue(key) {
    const parts = key.split('.');
    let current = this.configToObject();

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  // Set configuration value
  set(key, value) {
    this.config.set(key, value);
    this.cache.delete(key);
    return this;
  }

  // Check if key exists
  has(key) {
    return this.config.has(key) || this.getNestedValue(key) !== undefined;
  }

  // Get all configuration as object
  getAll() {
    return this.configToObject();
  }

  // Convert config map to nested object
  configToObject() {
    const result = {};

    this.config.forEach((value, key) => {
      this.setNestedValue(result, key, value);
    });

    return result;
  }

  // Set nested value in object
  setNestedValue(obj, key, value) {
    const parts = key.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  // Add configuration validator
  addValidator(key, validator, message) {
    if (!this.validators.has(key)) {
      this.validators.set(key, []);
    }
    this.validators.get(key).push({ validator, message });
    return this;
  }

  // Validate configuration
  validate() {
    const errors = [];

    this.validators.forEach((validatorList, key) => {
      const value = this.get(key);

      validatorList.forEach(({ validator, message }) => {
        try {
          if (!validator(value)) {
            errors.push(`${key}: ${message}`);
          }
        } catch (error) {
          errors.push(`${key}: Validation error - ${error.message}`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Setup file watchers
  setupFileWatchers() {
    const configDir = __dirname;
    const watchFiles = ['default.json', 'development.json', 'local.json'];

    watchFiles.forEach(file => {
      const filePath = path.join(configDir, file);

      if (fs.existsSync(filePath)) {
        const watcher = fs.watchFile(filePath, { interval: 1000 }, () => {
          console.log(`Config file changed: ${file}`);
          this.reloadConfig();
        });

        this.watchers.set(file, watcher);
      }
    });
  }

  // Reload configuration
  async reloadConfig() {
    this.cache.clear();
    this.config.clear();
    await this.loadConfigs();
    this.applyEnvironmentOverrides();
    console.log('Configuration reloaded');
  }

  // Get configuration schema
  getSchema() {
    return {
      server: {
        port: { type: 'number', default: 3001 },
        host: { type: 'string', default: '0.0.0.0' },
        environment: { type: 'string', default: 'development' }
      },
      database: {
        host: { type: 'string', default: 'localhost' },
        port: { type: 'number', default: 5432 },
        name: { type: 'string', default: 'dex' },
        user: { type: 'string', default: 'postgres' },
        password: { type: 'string', default: '' }
      },
      security: {
        jwtSecret: { type: 'string', required: true },
        sessionSecret: { type: 'string' },
        corsOrigin: { type: 'array', default: ['*'] }
      },
      cache: {
        ttl: { type: 'number', default: 300 },
        maxSize: { type: 'number', default: 1000 }
      },
      logging: {
        level: { type: 'string', default: 'info' },
        file: { type: 'boolean', default: true }
      }
    };
  }

  // Generate configuration template
  generateTemplate() {
    const schema = this.getSchema();
    const template = {};

    Object.keys(schema).forEach(section => {
      template[section] = {};
      Object.keys(schema[section]).forEach(key => {
        const config = schema[section][key];
        template[section][key] = config.default || null;
      });
    });

    return JSON.stringify(template, null, 2);
  }

  // Cleanup
  cleanup() {
    this.watchers.forEach((watcher, file) => {
      fs.unwatchFile(path.join(__dirname, file));
    });
    this.watchers.clear();
  }
}

// Create singleton instance
const configLoader = new ConfigLoader();

module.exports = configLoader;