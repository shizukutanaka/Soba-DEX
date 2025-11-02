const path = require('path');
const fs = require('fs');

class ConfigManager {
  constructor() {
    this.config = new Map();
    this.defaults = new Map();
    this.watchers = new Map();
    this.configPath = process.env.CONFIG_PATH || './config';

    this.initializeDefaults();
    this.loadConfigs();
  }

  initializeDefaults() {
    this.setDefault('server.port', 3001);
    this.setDefault('server.host', 'localhost');
    this.setDefault('server.cors.enabled', true);
    this.setDefault('server.compression.enabled', true);

    this.setDefault('websocket.enabled', true);
    this.setDefault('websocket.path', '/ws');
    this.setDefault('websocket.heartbeat.interval', 30000);
    this.setDefault('websocket.batch.interval', 50);
    this.setDefault('websocket.batch.maxSize', 100);

    this.setDefault('database.host', 'localhost');
    this.setDefault('database.port', 5432);
    this.setDefault('database.name', 'dex');
    this.setDefault('database.pool.min', 5);
    this.setDefault('database.pool.max', 20);

    this.setDefault('cache.enabled', true);
    this.setDefault('cache.ttl', 300000);
    this.setDefault('cache.maxSize', 1000);

    this.setDefault('rateLimiter.enabled', true);
    this.setDefault('rateLimiter.windowMs', 60000);
    this.setDefault('rateLimiter.maxRequests', 100);

    this.setDefault('logging.level', 'info');
    this.setDefault('logging.console', true);
    this.setDefault('logging.file', true);
    this.setDefault('logging.dir', './logs');

    this.setDefault('metrics.enabled', true);
    this.setDefault('metrics.interval', 30000);

    this.setDefault('backup.enabled', true);
    this.setDefault('backup.interval', 86400000);
    this.setDefault('backup.maxBackups', 10);

    this.setDefault('session.ttl', 86400000);
    this.setDefault('session.maxSessions', 10000);

    this.setDefault('security.helmet.enabled', true);
    this.setDefault('security.cors.origins', ['http://localhost:3000']);
  }

  setDefault(key, value) {
    this.defaults.set(key, value);
    if (!this.config.has(key)) {
      this.config.set(key, value);
    }
  }

  get(key, defaultValue = null) {
    if (this.config.has(key)) {
      return this.config.get(key);
    }

    if (this.defaults.has(key)) {
      return this.defaults.get(key);
    }

    // Check environment variables
    const envKey = key.toUpperCase().replace(/\./g, '_');
    if (process.env[envKey] !== undefined) {
      const envValue = this.parseEnvValue(process.env[envKey]);
      this.config.set(key, envValue);
      return envValue;
    }

    return defaultValue;
  }

  set(key, value) {
    const oldValue = this.config.get(key);
    this.config.set(key, value);

    // Notify watchers
    if (this.watchers.has(key)) {
      this.watchers.get(key).forEach(callback => {
        try {
          callback(value, oldValue, key);
        } catch (error) {
          console.error(`Config watcher error for ${key}:`, error);
        }
      });
    }

    return this;
  }

  has(key) {
    return (
      this.config.has(key) ||
      this.defaults.has(key) ||
      process.env[key.toUpperCase().replace(/\./g, '_')] !== undefined
    );
  }

  delete(key) {
    return this.config.delete(key);
  }

  watch(key, callback) {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, new Set());
    }
    this.watchers.get(key).add(callback);

    return () => {
      this.watchers.get(key).delete(callback);
      if (this.watchers.get(key).size === 0) {
        this.watchers.delete(key);
      }
    };
  }

  parseEnvValue(value) {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Handle boolean strings
      if (value.toLowerCase() === 'true') {
        return true;
      }
      if (value.toLowerCase() === 'false') {
        return false;
      }

      // Handle numbers
      const num = Number(value);
      if (!isNaN(num)) {
        return num;
      }

      // Return as string
      return value;
    }
  }

  loadConfigs() {
    try {
      if (!fs.existsSync(this.configPath)) {
        fs.mkdirSync(this.configPath, { recursive: true });
      }

      // Load main config file
      const mainConfigPath = path.join(this.configPath, 'config.json');
      if (fs.existsSync(mainConfigPath)) {
        const configData = JSON.parse(fs.readFileSync(mainConfigPath, 'utf8'));
        this.mergeConfig(configData);
      }

      // Load environment-specific config
      const env = process.env.NODE_ENV || 'development';
      const envConfigPath = path.join(this.configPath, `${env}.json`);
      if (fs.existsSync(envConfigPath)) {
        const envConfigData = JSON.parse(
          fs.readFileSync(envConfigPath, 'utf8')
        );
        this.mergeConfig(envConfigData);
      }
    } catch (error) {
      console.warn('Failed to load config files:', error.message);
    }
  }

  mergeConfig(configData, prefix = '') {
    for (const [key, value] of Object.entries(configData)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        this.mergeConfig(value, fullKey);
      } else {
        this.config.set(fullKey, value);
      }
    }
  }

  saveConfig(filename = 'config.json') {
    try {
      const configObject = {};

      for (const [key, value] of this.config) {
        this.setNestedValue(configObject, key, value);
      }

      const configPath = path.join(this.configPath, filename);
      fs.writeFileSync(configPath, JSON.stringify(configObject, null, 2));

      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  getSection(prefix) {
    const section = {};
    const prefixWithDot = `${prefix  }.`;

    for (const [key, value] of this.config) {
      if (key.startsWith(prefixWithDot)) {
        const subKey = key.substring(prefixWithDot.length);
        section[subKey] = value;
      }
    }

    return section;
  }

  getAllConfig() {
    const result = {};

    for (const [key, value] of this.config) {
      this.setNestedValue(result, key, value);
    }

    return result;
  }

  validate(schema = {}) {
    const errors = [];

    for (const [key, rules] of Object.entries(schema)) {
      const value = this.get(key);

      if (rules.required && (value === null || value === undefined)) {
        errors.push(`${key} is required`);
        continue;
      }

      if (value !== null && value !== undefined) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${key} must be of type ${rules.type}`);
        }

        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${key} must be at least ${rules.min}`);
        }

        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${key} must be at most ${rules.max}`);
        }

        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(`${key} must be one of: ${rules.enum.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  reset() {
    this.config.clear();
    for (const [key, value] of this.defaults) {
      this.config.set(key, value);
    }
  }

  createSnapshot() {
    return new Map(this.config);
  }

  restoreSnapshot(snapshot) {
    this.config = new Map(snapshot);
  }
}

// Create singleton instance
const config = new ConfigManager();

module.exports = {
  ConfigManager,
  config
};
