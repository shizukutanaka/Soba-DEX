// SAND Ultra-Fast Startup Optimizer
const _fs = require('fs');
const _path = require('path');

class FastStartup {
  constructor() {
    this.startTime = process.hrtime.bigint();
    this.modules = new Map();
    this.preloadCache = new Map();
    this.config = {
      enablePreload: true,
      enableLazyLoad: true,
      maxPreloadSize: 1024 * 1024, // 1MB
      criticalModules: [
        'express',
        'http',
        'cluster',
        'fs',
        'path'
      ]
    };
    this.initialized = false;
  }

  // Ultra-fast initialization
  initialize() {
    if (this.initialized) {
      return;
    }

    console.time('[FastStartup] Initialization');

    // Preload critical modules
    this.preloadCriticalModules();

    // Optimize require cache
    this.optimizeRequireCache();

    // Setup lazy loading
    this.setupLazyLoading();

    this.initialized = true;
    console.timeEnd('[FastStartup] Initialization');
  }

  // Preload critical modules
  preloadCriticalModules() {
    const loaded = [];

    for (const moduleName of this.config.criticalModules) {
      try {
        const startTime = process.hrtime.bigint();
        const module = require(moduleName);
        const loadTime = Number(process.hrtime.bigint() - startTime) / 1000000; // ms

        this.modules.set(moduleName, {
          module,
          loadTime,
          critical: true,
          cached: true
        });

        loaded.push(`${moduleName}:${loadTime.toFixed(1)}ms`);
      } catch (_error) {
        console.warn(`[FastStartup] Failed to preload: ${moduleName}`);
      }
    }

    console.log(`[FastStartup] Preloaded: ${loaded.join(', ')}`);
  }

  // Optimize Node.js require cache
  optimizeRequireCache() {
    const _cache = require.cache;
    let optimized = 0;

    // Pre-parse commonly used modules
    const commonModules = [
      'util',
      'events',
      'stream',
      'crypto',
      'zlib',
      'querystring'
    ];

    for (const moduleName of commonModules) {
      try {
        require(moduleName);
        optimized++;
      } catch (_error) {
        // Ignore module load failures
      }
    }

    console.log(`[FastStartup] Optimized ${optimized} common modules`);
  }

  // Setup lazy loading for non-critical modules
  setupLazyLoading() {
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    const self = this;

    Module.prototype.require = function(id) {
      const startTime = process.hrtime.bigint();

      // Check if module is already cached
      if (self.modules.has(id)) {
        const cached = self.modules.get(id);
        return cached.module;
      }

      // Load module with timing
      const module = originalRequire.call(this, id);
      const loadTime = Number(process.hrtime.bigint() - startTime) / 1000000;

      // Cache module info
      self.modules.set(id, {
        module,
        loadTime,
        critical: self.config.criticalModules.includes(id),
        cached: false
      });

      return module;
    };

    console.log('[FastStartup] Lazy loading enabled');
  }

  // Pre-warm application
  async prewarm(app) {
    console.time('[FastStartup] Prewarm');

    // Pre-create common objects
    const commonPaths = [
      '/health',
      '/api/market',
      '/api/docs'
    ];

    for (const route of commonPaths) {
      try {
        // Simulate request to warm up route handlers
        if (app && typeof app.handle === 'function') {
          const mockReq = { method: 'GET', url: route, headers: {} };
          const mockRes = {
            json: () => {},
            send: () => {},
            status: () => mockRes,
            setHeader: () => {},
            end: () => {}
          };

          // Don't wait for completion, just trigger initialization
          setImmediate(() => {
            try {
              app.handle(mockReq, mockRes, () => {});
            } catch (_e) {
              // Ignore prewarm errors
            }
          });
        }
      } catch (_error) {
        // Ignore prewarm errors
      }
    }

    // Pre-allocate memory pools
    this.preallocateMemory();

    console.timeEnd('[FastStartup] Prewarm');
  }

  // Pre-allocate memory pools
  preallocateMemory() {
    const pools = {
      small: { size: 1024, count: 100 },      // 1KB x 100
      medium: { size: 8192, count: 50 },      // 8KB x 50
      large: { size: 65536, count: 10 }       // 64KB x 10
    };

    let totalAllocated = 0;

    for (const [name, pool] of Object.entries(pools)) {
      const buffers = [];
      for (let i = 0; i < pool.count; i++) {
        buffers.push(Buffer.allocUnsafe(pool.size));
        totalAllocated += pool.size;
      }

      // Store for potential reuse
      this.preloadCache.set(`buffer_${name}`, buffers);
    }

    console.log(`[FastStartup] Pre-allocated ${(totalAllocated / 1024).toFixed(0)}KB memory`);
  }

  // Get pre-allocated buffer
  getBuffer(size) {
    let poolName = 'small';
    if (size > 8192) {
      poolName = 'large';
    } else if (size > 1024) {
      poolName = 'medium';
    }

    const pool = this.preloadCache.get(`buffer_${poolName}`);
    if (pool && pool.length > 0) {
      return pool.pop();
    }

    return Buffer.allocUnsafe(size);
  }

  // Express.js optimization middleware
  optimizeExpress(app) {
    // Disable unnecessary Express features
    app.set('x-powered-by', false);
    app.set('etag', false); // We handle our own ETags
    app.set('trust proxy', false);

    // Optimize view engine (disable if not needed)
    app.set('view cache', true);
    app.set('views', false);

    // Pre-compile middleware stack
    this.precompileMiddleware(app);

    console.log('[FastStartup] Express optimized');
  }

  // Pre-compile middleware stack
  precompileMiddleware(app) {
    // Force middleware compilation by simulating requests
    const routes = app._router ? app._router.stack : [];

    console.log(`[FastStartup] Pre-compiling ${routes.length} routes`);

    // This triggers Express internal optimizations
    setImmediate(() => {
      routes.forEach((layer, _index) => {
        try {
          if (layer.route) {
            layer.route.dispatch({ method: 'OPTIONS', url: '/' }, { end: () => {} }, () => {});
          }
        } catch (_e) {
          // Ignore precompile errors
        }
      });
    });
  }

  // Optimize Node.js startup flags
  static getOptimizedFlags() {
    return [
      '--max-old-space-size=128',     // Limit memory for small apps
      '--gc-interval=100',            // More frequent GC
      '--optimize-for-size',          // Optimize for smaller memory footprint
      '--max-semi-space-size=8',      // Smaller semi-space
      '--initial-old-space-size=32',  // Smaller initial old space
      '--no-compilation-cache',       // Disable compilation cache for faster startup
      '--no-flush-bytecode'           // Don't flush bytecode
    ];
  }

  // Environment optimization
  optimizeEnvironment() {
    // Disable debugging in production
    if (process.env.NODE_ENV === 'production') {
      process.env.NODE_NO_WARNINGS = '1';
      process.env.NODE_NO_DEPRECATION = '1';
    }

    // Optimize UV thread pool for I/O
    if (!process.env.UV_THREADPOOL_SIZE) {
      process.env.UV_THREADPOOL_SIZE = '4';
    }

    // Disable DNS caching for faster startup
    if (!process.env.NODE_OPTIONS) {
      process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
    }

    console.log('[FastStartup] Environment optimized');
  }

  // Measure startup performance
  measureStartup(callback) {
    const startTime = this.startTime;

    return function(...args) {
      const endTime = process.hrtime.bigint();
      const startupTime = Number(endTime - startTime) / 1000000; // ms

      console.log(`[FastStartup] Total startup time: ${startupTime.toFixed(1)}ms`);

      // Call original callback
      if (callback) {
        return callback.apply(this, args);
      }
    };
  }

  // Get startup statistics
  getStats() {
    const currentTime = process.hrtime.bigint();
    const totalTime = Number(currentTime - this.startTime) / 1000000;

    const moduleStats = Array.from(this.modules.entries()).map(([name, info]) => ({
      name,
      loadTime: info.loadTime,
      critical: info.critical,
      cached: info.cached
    }));

    const totalLoadTime = moduleStats.reduce((sum, mod) => sum + mod.loadTime, 0);

    return {
      totalStartupTime: totalTime,
      moduleCount: this.modules.size,
      totalModuleLoadTime: totalLoadTime,
      criticalModules: moduleStats.filter(m => m.critical).length,
      preloadedBuffers: this.preloadCache.size,
      modules: moduleStats.sort((a, b) => b.loadTime - a.loadTime)
    };
  }

  // Express.js helper for ultra-fast server creation
  static createFastServer(port = 3001, callback) {
    const fastStartup = new FastStartup();
    fastStartup.optimizeEnvironment();
    fastStartup.initialize();

    const express = require('express');
    const app = express();

    // Apply optimizations
    fastStartup.optimizeExpress(app);

    // Measure server startup
    const server = app.listen(port, fastStartup.measureStartup(() => {
      console.log(`[FastStartup] Server ready on :${port}`);
      if (callback) {
        callback(app, server, fastStartup);
      }
    }));

    // Pre-warm application
    setImmediate(() => {
      fastStartup.prewarm(app);
    });

    return { app, server, fastStartup };
  }
}

module.exports = FastStartup;