/**
 * Dependency Injection Container
 * Enterprise-grade IoC container for managing service dependencies
 */

const { logger } = require('../utils/productionLogger');

/**
 * Dependency Injection Container
 */
class DependencyInjectionContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.factories = new Map();
    this.aliases = new Map();
    this.decorators = new Map();
    this.middleware = [];
    this.initialized = false;
    this.dependencyGraph = new Map();
    this.circularDependencyCheck = new Set();
  }

  /**
   * Register a service
   */
  register(name, implementation, options = {}) {
    const {
      singleton = true,
      dependencies = [],
      factory = false,
      lazy = false,
      tags = [],
      alias = null
    } = options;

    // Store service definition
    this.services.set(name, {
      implementation,
      singleton,
      dependencies,
      factory,
      lazy,
      tags,
      instances: 0
    });

    // Store dependency graph
    this.dependencyGraph.set(name, dependencies);

    // Register alias if provided
    if (alias) {
      this.aliases.set(alias, name);
    }

    logger.debug('[DI] Service registered', {
      name,
      singleton,
      dependencies: dependencies.length
    });

    return this;
  }

  /**
   * Register a factory function
   */
  registerFactory(name, factory, options = {}) {
    this.factories.set(name, factory);
    return this.register(name, factory, { ...options, factory: true });
  }

  /**
   * Register multiple services at once
   */
  registerAll(services) {
    for (const [name, config] of Object.entries(services)) {
      if (typeof config === 'function') {
        this.register(name, config);
      } else {
        this.register(name, config.implementation, config);
      }
    }
    return this;
  }

  /**
   * Get a service instance
   */
  get(name, context = {}) {
    try {
      // Check for alias
      const serviceName = this.aliases.has(name) ? this.aliases.get(name) : name;

      // Check circular dependencies
      if (this.circularDependencyCheck.has(serviceName)) {
        throw new Error(`Circular dependency detected: ${Array.from(this.circularDependencyCheck).join(' -> ')} -> ${serviceName}`);
      }

      const service = this.services.get(serviceName);

      if (!service) {
        throw new Error(`Service "${serviceName}" not found`);
      }

      // Check for singleton instance
      if (service.singleton && this.singletons.has(serviceName)) {
        return this.singletons.get(serviceName);
      }

      // Mark as being resolved
      this.circularDependencyCheck.add(serviceName);

      try {
        // Resolve dependencies
        const dependencies = this.resolveDependencies(service.dependencies, context);

        // Create instance
        let instance;

        if (service.factory) {
          const factory = this.factories.get(serviceName);
          instance = factory(...dependencies);
        } else {
          instance = new service.implementation(...dependencies);
        }

        // Apply decorators
        instance = this.applyDecorators(serviceName, instance);

        // Apply middleware
        instance = this.applyMiddleware(instance, serviceName);

        // Store singleton
        if (service.singleton) {
          this.singletons.set(serviceName, instance);
        }

        // Update statistics
        service.instances++;

        logger.debug('[DI] Service instantiated', {
          name: serviceName,
          singleton: service.singleton,
          instance: service.instances
        });

        return instance;
      } finally {
        // Clear circular dependency check
        this.circularDependencyCheck.delete(serviceName);
      }
    } catch (error) {
      logger.error('[DI] Failed to get service', {
        name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Resolve dependencies
   */
  resolveDependencies(dependencies, context) {
    return dependencies.map(dep => {
      if (typeof dep === 'string') {
        // Service dependency
        return this.get(dep, context);
      } else if (typeof dep === 'object' && dep.value !== undefined) {
        // Value dependency
        return dep.value;
      } else if (typeof dep === 'object' && dep.factory) {
        // Factory dependency
        return dep.factory(context);
      } else if (typeof dep === 'object' && dep.optional) {
        // Optional dependency
        try {
          return this.get(dep.service, context);
        } catch {
          return dep.default || null;
        }
      } else {
        return dep;
      }
    });
  }

  /**
   * Register a decorator
   */
  registerDecorator(serviceName, decorator, priority = 0) {
    if (!this.decorators.has(serviceName)) {
      this.decorators.set(serviceName, []);
    }

    this.decorators.get(serviceName).push({ decorator, priority });

    // Sort by priority
    this.decorators.get(serviceName).sort((a, b) => b.priority - a.priority);

    return this;
  }

  /**
   * Apply decorators to service instance
   */
  applyDecorators(serviceName, instance) {
    const decorators = this.decorators.get(serviceName) || [];

    return decorators.reduce((inst, { decorator }) => {
      return decorator(inst);
    }, instance);
  }

  /**
   * Register global middleware
   */
  registerMiddleware(middleware, priority = 0) {
    this.middleware.push({ middleware, priority });
    this.middleware.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /**
   * Apply middleware to service instance
   */
  applyMiddleware(instance, serviceName) {
    return this.middleware.reduce((inst, { middleware }) => {
      return middleware(inst, serviceName);
    }, instance);
  }

  /**
   * Check if service exists
   */
  has(name) {
    const serviceName = this.aliases.has(name) ? this.aliases.get(name) : name;
    return this.services.has(serviceName);
  }

  /**
   * Get all services with a specific tag
   */
  getByTag(tag) {
    const tagged = [];

    for (const [name, service] of this.services) {
      if (service.tags.includes(tag)) {
        tagged.push(this.get(name));
      }
    }

    return tagged;
  }

  /**
   * Create a child container
   */
  createChild() {
    const child = new DependencyInjectionContainer();

    // Copy service definitions
    for (const [name, service] of this.services) {
      child.services.set(name, { ...service });
    }

    // Copy factories
    for (const [name, factory] of this.factories) {
      child.factories.set(name, factory);
    }

    // Copy aliases
    for (const [alias, name] of this.aliases) {
      child.aliases.set(alias, name);
    }

    return child;
  }

  /**
   * Validate dependency graph
   */
  validateDependencies() {
    const visited = new Set();
    const stack = new Set();
    const errors = [];

    const visit = (node) => {
      if (stack.has(node)) {
        errors.push(`Circular dependency detected: ${Array.from(stack).join(' -> ')} -> ${node}`);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      stack.add(node);

      const dependencies = this.dependencyGraph.get(node) || [];
      for (const dep of dependencies) {
        if (!this.services.has(dep)) {
          errors.push(`Missing dependency: ${node} requires ${dep}`);
        } else {
          visit(dep);
        }
      }

      stack.delete(node);
    };

    for (const node of this.dependencyGraph.keys()) {
      visit(node);
    }

    if (errors.length > 0) {
      throw new Error(`Dependency validation failed:\n${errors.join('\n')}`);
    }

    return true;
  }

  /**
   * Initialize all eager services
   */
  async initialize() {
    logger.info('[DI] Initializing dependency injection container');

    try {
      // Validate dependencies
      this.validateDependencies();

      // Initialize eager singletons
      for (const [name, service] of this.services) {
        if (service.singleton && !service.lazy) {
          this.get(name);
        }
      }

      this.initialized = true;
      logger.info('[DI] Container initialized successfully', {
        services: this.services.size,
        singletons: this.singletons.size
      });
    } catch (error) {
      logger.error('[DI] Initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Dispose all services
   */
  async dispose() {
    logger.info('[DI] Disposing services');

    for (const [name, instance] of this.singletons) {
      if (typeof instance.dispose === 'function') {
        try {
          await instance.dispose();
          logger.debug('[DI] Service disposed', { name });
        } catch (error) {
          logger.error('[DI] Failed to dispose service', {
            name,
            error: error.message
          });
        }
      }
    }

    this.singletons.clear();
    this.initialized = false;

    logger.info('[DI] All services disposed');
  }

  /**
   * Get container statistics
   */
  getStatistics() {
    const stats = {
      totalServices: this.services.size,
      singletons: 0,
      factories: 0,
      instances: 0,
      lazy: 0,
      tags: {}
    };

    for (const [name, service] of this.services) {
      if (service.singleton) stats.singletons++;
      if (service.factory) stats.factories++;
      if (service.lazy) stats.lazy++;
      stats.instances += service.instances;

      for (const tag of service.tags) {
        stats.tags[tag] = (stats.tags[tag] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Create a service locator proxy
   */
  createServiceLocator() {
    return new Proxy({}, {
      get: (target, prop) => {
        if (this.has(prop)) {
          return this.get(prop);
        }
        return undefined;
      },
      has: (target, prop) => {
        return this.has(prop);
      }
    });
  }
}

/**
 * Service registration decorator
 */
function Injectable(options = {}) {
  return function(target) {
    target.__injectable = true;
    target.__injectOptions = options;
    return target;
  };
}

/**
 * Dependency injection decorator
 */
function Inject(serviceName) {
  return function(target, propertyKey, parameterIndex) {
    if (!target.__dependencies) {
      target.__dependencies = [];
    }
    target.__dependencies[parameterIndex] = serviceName;
  };
}

/**
 * Auto-wire decorator
 */
function AutoWire(container) {
  return function(target) {
    const dependencies = target.__dependencies || [];
    const resolved = dependencies.map(dep => container.get(dep));

    return new target(...resolved);
  };
}

/**
 * Create a configured container with all services
 */
function createContainer() {
  const container = new DependencyInjectionContainer();

  // Register core services
  container.registerAll({
    // Database services
    'database': {
      implementation: require('../database/optimizedDatabase').OptimizedDatabaseClient,
      singleton: true,
      dependencies: []
    },

    // Cache service
    'cache': {
      implementation: require('../services/unifiedCacheService').UnifiedCacheService,
      singleton: true,
      dependencies: []
    },

    // Authentication service
    'auth': {
      implementation: require('../services/jwtSecretRotation').JWTSecretRotationService,
      singleton: true,
      dependencies: []
    },

    // Audit logger
    'auditLogger': {
      implementation: require('../services/auditLogger').AuditLogger,
      singleton: true,
      dependencies: ['database']
    },

    // A/B Testing
    'abTesting': {
      implementation: require('../services/unifiedABTestingService').UnifiedABTestingService,
      singleton: true,
      dependencies: ['database', 'cache']
    },

    // Error handler
    'errorHandler': {
      implementation: require('../middleware/unifiedErrorHandler').UnifiedErrorHandler,
      singleton: true,
      dependencies: ['auditLogger']
    },

    // Input validator
    'validator': {
      implementation: require('../middleware/comprehensiveInputValidation').ComprehensiveInputValidator,
      singleton: true,
      dependencies: []
    }
  });

  // Register middleware
  container.registerMiddleware((instance, name) => {
    logger.debug('[DI] Service accessed', { name });
    return instance;
  });

  // Register decorators for specific services
  container.registerDecorator('database', (db) => {
    // Add performance monitoring
    return new Proxy(db, {
      get(target, prop) {
        if (typeof target[prop] === 'function') {
          return async (...args) => {
            const start = Date.now();
            try {
              return await target[prop](...args);
            } finally {
              const duration = Date.now() - start;
              if (duration > 1000) {
                logger.warn('[DI] Slow database operation', {
                  method: prop,
                  duration
                });
              }
            }
          };
        }
        return target[prop];
      }
    });
  });

  return container;
}

// Create global container instance
const container = createContainer();

// Export container and decorators
module.exports = {
  DependencyInjectionContainer,
  container,
  Injectable,
  Inject,
  AutoWire,
  createContainer,

  // Service accessor shortcuts
  get: (name) => container.get(name),
  has: (name) => container.has(name),
  register: (name, impl, options) => container.register(name, impl, options),
  registerFactory: (name, factory, options) => container.registerFactory(name, factory, options),
  getByTag: (tag) => container.getByTag(tag),
  initialize: () => container.initialize(),
  dispose: () => container.dispose(),

  // Service locator
  services: container.createServiceLocator()
};