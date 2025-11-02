/**
 * Application Configuration - Centralized Environment Variables
 * Performance optimized with cached environment variables
 */

class ConfigManager {
  constructor() {
    // Cache environment variables to avoid repeated process.env access
    this._cache = new Map();
    this._loadConfig();
  }

  _loadConfig() {
    // Core application settings
    this._cache.set('NODE_ENV', process.env.NODE_ENV || 'development');
    this._cache.set('PORT', parseInt(process.env.PORT) || 3001);

    // Rate limiting settings
    this._cache.set('RATE_LIMIT_WINDOW_MS', parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000);
    this._cache.set('RATE_LIMIT_MAX', parseInt(process.env.RATE_LIMIT_MAX) || 100);

    // Request body limits
    this._cache.set('REQUEST_BODY_LIMIT_BYTES', parseInt(process.env.REQUEST_BODY_LIMIT_BYTES) || (100 * 1024));

    // Security settings
    this._cache.set('ENFORCE_HTTPS', this._parseBoolean(process.env.ENFORCE_HTTPS, this.get('NODE_ENV') === 'production'));
    this._cache.set('REQUEST_ID_TRUST_HEADER', this._parseBoolean(process.env.REQUEST_ID_TRUST_HEADER, this.get('NODE_ENV') !== 'production'));
    this._cache.set('X_REQUEST_ID_HEADER', process.env.X_REQUEST_ID_HEADER || 'X-Request-ID');

    // CORS settings
    this._cache.set('CORS_ORIGINS', process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000']);

    // Database settings
    this._cache.set('DATABASE_URL', process.env.DATABASE_URL);
    this._cache.set('DB_POOL_SIZE', parseInt(process.env.DB_POOL_SIZE) || 10);

    // Cache settings
    this._cache.set('CACHE_ENABLED', this._parseBoolean(process.env.CACHE_ENABLED, true));
    this._cache.set('CACHE_DEFAULT_TTL', parseInt(process.env.CACHE_DEFAULT_TTL) || 60);
    this._cache.set('CACHE_MAX_SIZE', parseInt(process.env.CACHE_MAX_SIZE) || 10000);

    // Logging settings
    this._cache.set('LOG_LEVEL', process.env.LOG_LEVEL || 'info');
    this._cache.set('LOG_TO_FILE', this._parseBoolean(process.env.LOG_TO_FILE, false));

    // Feature flags (for optional components)
    this._cache.set('ENABLE_SWAGGER', this._parseBoolean(process.env.ENABLE_SWAGGER, false));
    this._cache.set('ENABLE_METRICS', this._parseBoolean(process.env.ENABLE_METRICS, true));
  }

  _parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    const normalized = String(value).trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
  }

  get(key, defaultValue = null) {
    return this._cache.get(key) ?? defaultValue;
  }

  set(key, value) {
    this._cache.set(key, value);
  }

  // Get all configuration as object
  getAll() {
    return Object.fromEntries(this._cache);
  }

  // Check if running in production
  isProduction() {
    return this.get('NODE_ENV') === 'production';
  }

  // Check if running in development
  isDevelopment() {
    return this.get('NODE_ENV') === 'development';
  }

  // Reload configuration (for dynamic config updates)
  reload() {
    this._cache.clear();
    this._loadConfig();
  }
}

// Singleton instance
const config = new ConfigManager();

module.exports = {
  config,
  ConfigManager
};
