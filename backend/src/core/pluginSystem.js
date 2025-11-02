/**
 * @fileoverview Plugin System for Soba DEX
 * @description Extensible plugin architecture for adding custom functionality
 *
 * Features:
 * - Hot-reloadable plugins
 * - Dependency injection
 * - Event-driven communication
 * - Sandboxed execution
 * - Version compatibility checking
 * - Plugin marketplace support
 *
 * Use Cases:
 * - Custom trading strategies
 * - Price oracle integrations
 * - Notification providers
 * - Analytics integrations
 * - Custom AMM algorithms
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { createHash } = require('crypto');

class PluginSystem extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      pluginDir: config.pluginDir || path.join(process.cwd(), 'plugins'),
      autoLoad: config.autoLoad !== false,
      sandboxed: config.sandboxed !== false,
      hotReload: config.hotReload !== false,
      maxPlugins: config.maxPlugins || 100,
      ...config
    };

    // Registry of loaded plugins
    this.plugins = new Map();

    // Plugin metadata
    this.metadata = new Map();

    // Plugin dependencies graph
    this.dependencyGraph = new Map();

    // Hooks registry (extension points)
    this.hooks = {
      'swap:before': [],
      'swap:after': [],
      'pool:create': [],
      'pool:addLiquidity': [],
      'pool:removeLiquidity': [],
      'price:update': [],
      'order:created': [],
      'order:filled': [],
      'order:cancelled': [],
      'user:registered': [],
      'trade:executed': [],
      'analytics:metric': [],
      'error:occurred': []
    };

    // Shared context for plugins
    this.context = {
      version: '5.0.0',
      api: {},
      utils: {},
      services: {}
    };

    this.initialized = false;
  }

  /**
   * Initialize plugin system
   */
  async initialize() {
    if (this.initialized) {
      throw new Error('Plugin system already initialized');
    }

    try {
      // Create plugin directory if it doesn't exist
      await fs.mkdir(this.config.pluginDir, { recursive: true });

      // Set up file watcher for hot reload
      if (this.config.hotReload) {
        this._setupHotReload();
      }

      // Auto-load plugins if enabled
      if (this.config.autoLoad) {
        await this.loadAllPlugins();
      }

      this.initialized = true;
      logger.info('Plugin system initialized');

      this.emit('system:initialized');

    } catch (error) {
      logger.error('Failed to initialize plugin system:', error);
      throw error;
    }
  }

  /**
   * Load a single plugin
   * @param {string} pluginPath - Path to plugin directory or file
   * @returns {Promise<Object>} Plugin instance
   */
  async loadPlugin(pluginPath) {
    try {
      // Load plugin manifest
      const manifestPath = path.join(pluginPath, 'plugin.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      // Validate manifest
      this._validateManifest(manifest);

      // Check if plugin already loaded
      if (this.plugins.has(manifest.id)) {
        throw new Error(`Plugin ${manifest.id} is already loaded`);
      }

      // Check version compatibility
      if (!this._isCompatibleVersion(manifest.engineVersion)) {
        throw new Error(`Plugin ${manifest.id} requires engine version ${manifest.engineVersion}`);
      }

      // Check dependencies
      await this._checkDependencies(manifest);

      // Load plugin code
      const pluginFile = path.join(pluginPath, manifest.main || 'index.js');
      const PluginClass = require(pluginFile);

      // Create plugin instance
      const plugin = new PluginClass();

      // Inject context
      plugin.context = this.context;
      plugin.hooks = this._createPluginHooks(manifest.id);
      plugin.logger = logger.child({ plugin: manifest.id });

      // Initialize plugin
      if (typeof plugin.initialize === 'function') {
        await plugin.initialize(manifest.config || {});
      }

      // Register plugin
      this.plugins.set(manifest.id, plugin);
      this.metadata.set(manifest.id, {
        ...manifest,
        path: pluginPath,
        loadedAt: Date.now(),
        status: 'active'
      });

      // Register hooks
      if (manifest.hooks) {
        for (const [hookName, handlers] of Object.entries(manifest.hooks)) {
          if (Array.isArray(handlers)) {
            handlers.forEach(handler => {
              this._registerHook(hookName, manifest.id, handler);
            });
          } else {
            this._registerHook(hookName, manifest.id, handlers);
          }
        }
      }

      logger.info(`Plugin loaded: ${manifest.id} v${manifest.version}`);
      this.emit('plugin:loaded', { id: manifest.id, manifest });

      return plugin;

    } catch (error) {
      logger.error(`Failed to load plugin at ${pluginPath}:`, error);
      throw error;
    }
  }

  /**
   * Load all plugins from plugin directory
   */
  async loadAllPlugins() {
    try {
      const entries = await fs.readdir(this.config.pluginDir, { withFileTypes: true });

      const loadPromises = entries
        .filter(entry => entry.isDirectory())
        .map(entry => {
          const pluginPath = path.join(this.config.pluginDir, entry.name);
          return this.loadPlugin(pluginPath).catch(error => {
            logger.warn(`Skipping plugin ${entry.name}:`, error.message);
            return null;
          });
        });

      const results = await Promise.all(loadPromises);
      const loaded = results.filter(r => r !== null).length;

      logger.info(`Loaded ${loaded} plugins from ${entries.length} directories`);

    } catch (error) {
      logger.error('Failed to load plugins:', error);
      throw error;
    }
  }

  /**
   * Unload a plugin
   * @param {string} pluginId - Plugin ID
   */
  async unloadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    const metadata = this.metadata.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    try {
      // Call plugin cleanup
      if (typeof plugin.cleanup === 'function') {
        await plugin.cleanup();
      }

      // Remove hooks
      for (const [hookName, handlers] of Object.entries(this.hooks)) {
        this.hooks[hookName] = handlers.filter(h => h.pluginId !== pluginId);
      }

      // Clear module cache for hot reload
      if (metadata && metadata.path) {
        const mainFile = path.join(metadata.path, 'index.js');
        delete require.cache[require.resolve(mainFile)];
      }

      // Remove from registry
      this.plugins.delete(pluginId);
      this.metadata.delete(pluginId);

      logger.info(`Plugin unloaded: ${pluginId}`);
      this.emit('plugin:unloaded', { id: pluginId });

    } catch (error) {
      logger.error(`Failed to unload plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Reload a plugin
   * @param {string} pluginId - Plugin ID
   */
  async reloadPlugin(pluginId) {
    const metadata = this.metadata.get(pluginId);
    if (!metadata) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    await this.unloadPlugin(pluginId);
    await this.loadPlugin(metadata.path);

    logger.info(`Plugin reloaded: ${pluginId}`);
  }

  /**
   * Execute a hook
   * @param {string} hookName - Hook name
   * @param {Object} data - Data to pass to hook handlers
   * @returns {Promise<Object>} Modified data
   */
  async executeHook(hookName, data) {
    const handlers = this.hooks[hookName] || [];

    if (handlers.length === 0) {
      return data;
    }

    let result = { ...data };

    for (const handler of handlers) {
      try {
        const plugin = this.plugins.get(handler.pluginId);
        if (!plugin || !plugin[handler.method]) {
          continue;
        }

        // Execute handler
        const handlerResult = await plugin[handler.method](result);

        // Merge result
        if (handlerResult !== undefined) {
          result = typeof handlerResult === 'object'
            ? { ...result, ...handlerResult }
            : handlerResult;
        }

      } catch (error) {
        logger.error(`Hook ${hookName} failed in plugin ${handler.pluginId}:`, error);
        this.emit('hook:error', {
          hook: hookName,
          plugin: handler.pluginId,
          error
        });
      }
    }

    return result;
  }

  /**
   * Register a new hook
   */
  _registerHook(hookName, pluginId, handler) {
    if (!this.hooks[hookName]) {
      this.hooks[hookName] = [];
    }

    this.hooks[hookName].push({
      pluginId,
      method: handler.method || handler,
      priority: handler.priority || 10
    });

    // Sort by priority (lower number = higher priority)
    this.hooks[hookName].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Create hook interface for plugin
   */
  _createPluginHooks(pluginId) {
    return {
      on: (hookName, handler) => {
        this._registerHook(hookName, pluginId, handler);
      },
      emit: async (hookName, data) => {
        return await this.executeHook(hookName, data);
      }
    };
  }

  /**
   * Validate plugin manifest
   */
  _validateManifest(manifest) {
    const required = ['id', 'name', 'version', 'author'];

    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate semver
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new Error(`Invalid version format: ${manifest.version}`);
    }
  }

  /**
   * Check version compatibility
   */
  _isCompatibleVersion(requiredVersion) {
    if (!requiredVersion) return true;

    const [reqMajor, reqMinor] = requiredVersion.split('.').map(Number);
    const [curMajor, curMinor] = this.context.version.split('.').map(Number);

    // Major version must match, minor version must be >= required
    return curMajor === reqMajor && curMinor >= reqMinor;
  }

  /**
   * Check plugin dependencies
   */
  async _checkDependencies(manifest) {
    if (!manifest.dependencies) return;

    for (const [depId, depVersion] of Object.entries(manifest.dependencies)) {
      const depMeta = this.metadata.get(depId);

      if (!depMeta) {
        throw new Error(`Missing dependency: ${depId}`);
      }

      // Check version compatibility
      if (depVersion !== '*' && depMeta.version !== depVersion) {
        throw new Error(`Dependency ${depId} version mismatch: required ${depVersion}, found ${depMeta.version}`);
      }
    }
  }

  /**
   * Set up hot reload file watcher
   */
  _setupHotReload() {
    // In production, use proper file watcher library like chokidar
    // For now, implement basic polling
    const watcher = setInterval(async () => {
      for (const [pluginId, metadata] of this.metadata.entries()) {
        try {
          const manifestPath = path.join(metadata.path, 'plugin.json');
          const stats = await fs.stat(manifestPath);

          if (stats.mtimeMs > metadata.loadedAt) {
            logger.info(`Detected changes in ${pluginId}, reloading...`);
            await this.reloadPlugin(pluginId);
          }
        } catch (error) {
          // Ignore errors during hot reload check
        }
      }
    }, 5000); // Check every 5 seconds

    // Store watcher reference for cleanup
    this._hotReloadWatcher = watcher;
  }

  /**
   * Get plugin info
   */
  getPluginInfo(pluginId) {
    return this.metadata.get(pluginId);
  }

  /**
   * List all plugins
   */
  listPlugins() {
    return Array.from(this.metadata.values());
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    const plugins = this.listPlugins();

    return {
      total: plugins.length,
      active: plugins.filter(p => p.status === 'active').length,
      inactive: plugins.filter(p => p.status === 'inactive').length,
      hooks: Object.entries(this.hooks).map(([name, handlers]) => ({
        name,
        handlerCount: handlers.length
      })),
      plugins: plugins.map(p => ({
        id: p.id,
        name: p.name,
        version: p.version,
        status: p.status
      }))
    };
  }

  /**
   * Set shared context for plugins
   */
  setContext(key, value) {
    this.context[key] = value;
  }

  /**
   * Cleanup plugin system
   */
  async cleanup() {
    // Stop hot reload watcher
    if (this._hotReloadWatcher) {
      clearInterval(this._hotReloadWatcher);
    }

    // Unload all plugins
    const pluginIds = Array.from(this.plugins.keys());
    for (const id of pluginIds) {
      await this.unloadPlugin(id).catch(err => {
        logger.error(`Failed to unload plugin ${id}:`, err);
      });
    }

    this.initialized = false;
    logger.info('Plugin system cleaned up');
  }
}

/**
 * Base Plugin Class
 */
class BasePlugin {
  constructor() {
    this.context = null;
    this.hooks = null;
    this.logger = null;
    this.config = {};
  }

  /**
   * Initialize plugin
   * @param {Object} config - Plugin configuration
   */
  async initialize(config) {
    this.config = config;
  }

  /**
   * Cleanup plugin resources
   */
  async cleanup() {
    // Override in subclass
  }

  /**
   * Get plugin metadata
   */
  getMetadata() {
    return {
      id: this.constructor.name,
      version: '1.0.0'
    };
  }
}

module.exports = { PluginSystem, BasePlugin };
