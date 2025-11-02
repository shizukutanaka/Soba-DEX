// SAND Hot Reload System
const fs = require('fs');
const path = require('path');
const cluster = require('cluster');

class HotReload {
  constructor() {
    this.watchers = new Map();
    this.lastRestart = 0;
    this.restartDelay = 1000; // 1 second cooldown
    this.config = {
      watchPaths: ['src/', 'config/'],
      ignore: ['.log', '.tmp', 'node_modules', '.git'],
      debounce: 200,
      maxRestarts: 5,
      resetInterval: 60000 // Reset restart counter every minute
    };
    this.restartCount = 0;
    this.active = false;
  }

  // Ultra-fast file watching
  start() {
    if (this.active) {
      return;
    }
    this.active = true;

    console.log('[HotReload] Starting...');

    // Watch configured paths
    for (const watchPath of this.config.watchPaths) {
      this.watchPath(watchPath);
    }

    // Reset restart counter periodically
    this.resetTimer = setInterval(() => {
      this.restartCount = 0;
    }, this.config.resetInterval);

    console.log('[HotReload] Active');
  }

  // Stop watching
  stop() {
    this.active = false;

    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    if (this.resetTimer) {
      clearInterval(this.resetTimer);
    }

    console.log('[HotReload] Stopped');
  }

  // Watch directory recursively
  watchPath(dir) {
    const fullPath = path.resolve(dir);

    if (!fs.existsSync(fullPath)) {
      console.warn(`[HotReload] Path not found: ${fullPath}`);
      return;
    }

    // Fast directory traversal
    const watchFiles = (currentDir) => {
      try {
        const files = fs.readdirSync(currentDir);

        for (const file of files) {
          const filePath = path.join(currentDir, file);

          // Skip ignored files
          if (this.shouldIgnore(filePath)) {
            continue;
          }

          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            // Recursively watch subdirectories
            watchFiles(filePath);
          } else if (stat.isFile() && this.shouldWatch(filePath)) {
            this.watchFile(filePath);
          }
        }
      } catch (_err) {
        console.warn(`[HotReload] Cannot read directory: ${currentDir}`);
      }
    };

    watchFiles(fullPath);
  }

  // Watch single file
  watchFile(filePath) {
    if (this.watchers.has(filePath)) {
      return;
    }

    try {
      const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          this.handleFileChange(filePath);
        }
      });

      this.watchers.set(filePath, watcher);
    } catch (_err) {
      console.warn(`[HotReload] Cannot watch file: ${filePath}`);
    }
  }

  // Handle file change
  handleFileChange(filePath) {
    const now = Date.now();

    // Debounce rapid changes
    if (now - this.lastRestart < this.config.debounce) {
      return;
    }

    console.log(`[HotReload] File changed: ${path.relative(process.cwd(), filePath)}`);

    // Check restart limits
    if (this.restartCount >= this.config.maxRestarts) {
      console.warn('[HotReload] Max restarts reached, ignoring change');
      return;
    }

    this.triggerReload(filePath);
  }

  // Trigger hot reload
  triggerReload(changedFile) {
    const now = Date.now();

    // Cooldown check
    if (now - this.lastRestart < this.restartDelay) {
      return;
    }

    this.lastRestart = now;
    this.restartCount++;

    console.log(`[HotReload] Reloading... (${this.restartCount}/${this.config.maxRestarts})`);

    // Clear module cache for changed file
    this.clearModuleCache(changedFile);

    // Emit reload event
    process.emit('hotReload', changedFile);

    // Cluster mode restart
    if (cluster.isMaster) {
      this.restartWorkers();
    } else {
      // Graceful worker restart
      setTimeout(() => {
        process.exit(0);
      }, 100);
    }
  }

  // Clear Node.js module cache
  clearModuleCache(changedFile) {
    const resolvedPath = path.resolve(changedFile);

    // Clear main file and dependencies
    const toClear = [];

    for (const id in require.cache) {
      if (id.startsWith(resolvedPath) || id.includes(path.dirname(resolvedPath))) {
        toClear.push(id);
      }
    }

    for (const id of toClear) {
      delete require.cache[id];
    }

    console.log(`[HotReload] Cleared ${toClear.length} cached modules`);
  }

  // Restart cluster workers
  restartWorkers() {
    if (!cluster.isMaster) {
      return;
    }

    console.log('[HotReload] Restarting workers...');

    const workers = Object.values(cluster.workers);
    let restarted = 0;

    // Graceful restart with rolling deployment
    const restartNext = () => {
      if (restarted >= workers.length) {
        return;
      }

      const worker = workers[restarted];
      if (worker && !worker.isDead()) {
        // Spawn new worker before killing old one
        const newWorker = cluster.fork();

        newWorker.on('listening', () => {
          worker.kill('SIGTERM');
          restarted++;

          // Restart next worker after delay
          setTimeout(restartNext, 100);
        });
      } else {
        restarted++;
        restartNext();
      }
    };

    restartNext();
  }

  // Check if file should be ignored
  shouldIgnore(filePath) {
    const relativePath = path.relative(process.cwd(), filePath);

    for (const ignore of this.config.ignore) {
      if (relativePath.includes(ignore)) {
        return true;
      }
    }

    return false;
  }

  // Check if file should be watched
  shouldWatch(filePath) {
    const ext = path.extname(filePath);
    const watchExts = ['.js', '.json', '.env'];

    return watchExts.includes(ext);
  }

  // Get status
  getStatus() {
    return {
      active: this.active,
      watching: this.watchers.size,
      restartCount: this.restartCount,
      lastRestart: this.lastRestart,
      maxRestarts: this.config.maxRestarts
    };
  }

  // Update configuration
  configure(newConfig) {
    Object.assign(this.config, newConfig);

    if (this.active) {
      this.stop();
      this.start();
    }
  }

  // Manual reload trigger
  reload(reason = 'manual') {
    console.log(`[HotReload] Manual reload: ${reason}`);
    this.triggerReload(reason);
  }

  // Development mode setup
  setupDevMode() {
    // Only enable in development
    if (process.env.NODE_ENV === 'production') {
      console.log('[HotReload] Disabled in production');
      return;
    }

    // Auto-start on process events
    process.on('SIGUSR1', () => {
      this.reload('SIGUSR1 signal');
    });

    process.on('SIGUSR2', () => {
      this.reload('SIGUSR2 signal');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      this.stop();
    });

    this.start();
    console.log('[HotReload] Development mode active');
  }

  // Express.js middleware
  middleware() {
    return (req, res, next) => {
      // Add reload endpoint for manual triggering
      if (req.path === '/dev/reload' && req.method === 'POST') {
        this.reload('API request');
        res.json({
          status: 'reloading',
          restartCount: this.restartCount
        });
        return;
      }

      // Add status endpoint
      if (req.path === '/dev/reload/status' && req.method === 'GET') {
        res.json(this.getStatus());
        return;
      }

      next();
    };
  }
}

module.exports = new HotReload();