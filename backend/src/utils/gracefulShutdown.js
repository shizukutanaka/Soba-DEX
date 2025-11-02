class GracefulShutdown {
  constructor() {
    this.shutdown = false;
    this.connections = new Set();
    this.tasks = new Map();
    this.timeouts = new Map();
    this.gracePeriod = 30000; // 30 seconds
    this.forcePeriod = 10000; // 10 seconds for force shutdown
    this.logger = console; // Can be replaced with custom logger
  }

  // Initialize graceful shutdown handlers
  init(server, options = {}) {
    this.server = server;
    this.gracePeriod = options.gracePeriod || this.gracePeriod;
    this.forcePeriod = options.forcePeriod || this.forcePeriod;
    this.logger = options.logger || this.logger;

    // Track connections
    if (server) {
      server.on('connection', (socket) => {
        this.connections.add(socket);
        socket.on('close', () => {
          this.connections.delete(socket);
        });
      });
    }

    // Handle shutdown signals
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGHUP', () => this.handleShutdown('SIGHUP'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      this.handleShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.handleShutdown('UNHANDLED_REJECTION');
    });

    this.logger.info('Graceful shutdown handlers initialized');
  }

  // Handle shutdown signal
  async handleShutdown(signal) {
    if (this.shutdown) {
      this.logger.warn(`Already shutting down, ignoring ${signal}`);
      return;
    }

    this.shutdown = true;
    this.logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Set force shutdown timer
    const forceTimer = setTimeout(() => {
      this.logger.error('Force shutdown timeout reached, terminating...');
      process.exit(1);
    }, this.gracePeriod + this.forcePeriod);

    try {
      await this.performShutdown();
      clearTimeout(forceTimer);
      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceTimer);
      this.logger.error('Shutdown error:', error);
      process.exit(1);
    }
  }

  // Perform graceful shutdown
  async performShutdown() {
    const startTime = Date.now();

    // Step 1: Stop accepting new connections
    if (this.server) {
      this.logger.info('Stopping server from accepting new connections...');
      this.server.close();
    }

    // Step 2: Complete pending tasks
    await this.completePendingTasks();

    // Step 3: Close existing connections
    await this.closeConnections();

    // Step 4: Cleanup resources
    await this.cleanup();

    const duration = Date.now() - startTime;
    this.logger.info(`Shutdown completed in ${duration}ms`);
  }

  // Complete pending tasks
  async completePendingTasks() {
    if (this.tasks.size === 0) {
      this.logger.info('No pending tasks to complete');
      return;
    }

    this.logger.info(`Waiting for ${this.tasks.size} pending tasks to complete...`);

    const promises = Array.from(this.tasks.values());
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task completion timeout')), this.gracePeriod);
    });

    try {
      await Promise.race([
        Promise.allSettled(promises),
        timeoutPromise
      ]);
      this.logger.info('All pending tasks completed');
    } catch (error) {
      this.logger.warn('Some tasks did not complete in time:', error.message);
    }
  }

  // Close connections
  async closeConnections() {
    if (this.connections.size === 0) {
      this.logger.info('No active connections to close');
      return;
    }

    this.logger.info(`Closing ${this.connections.size} active connections...`);

    // Give connections time to close gracefully
    const closePromises = Array.from(this.connections).map(socket => {
      return new Promise((resolve) => {
        socket.on('close', resolve);
        socket.end();

        // Force close after timeout
        setTimeout(() => {
          if (!socket.destroyed) {
            socket.destroy();
          }
          resolve();
        }, 5000);
      });
    });

    await Promise.allSettled(closePromises);
    this.logger.info('All connections closed');
  }

  // Cleanup resources
  async cleanup() {
    this.logger.info('Cleaning up resources...');

    // Clear all timeouts
    this.timeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.timeouts.clear();

    // Clear intervals
    if (global.gc) {
      global.gc();
    }

    this.logger.info('Resource cleanup completed');
  }

  // Register a task to be completed before shutdown
  registerTask(id, promise) {
    if (this.shutdown) {
      this.logger.warn(`Cannot register task ${id} - shutdown in progress`);
      return false;
    }

    this.tasks.set(id, promise);

    // Remove task when completed
    promise.finally(() => {
      this.tasks.delete(id);
    });

    return true;
  }

  // Register a timeout to be cleared on shutdown
  registerTimeout(id, timeout) {
    this.timeouts.set(id, timeout);
    return timeout;
  }

  // Check if shutdown is in progress
  isShuttingDown() {
    return this.shutdown;
  }

  // Get shutdown status
  getStatus() {
    return {
      shuttingDown: this.shutdown,
      activeTasks: this.tasks.size,
      activeConnections: this.connections.size,
      activeTimeouts: this.timeouts.size
    };
  }

  // Express middleware to handle shutdown state
  middleware() {
    return (req, res, next) => {
      if (this.shutdown) {
        res.status(503).json({
          error: true,
          message: 'Server is shutting down',
          code: 'SHUTTING_DOWN'
        });
        return;
      }
      next();
    };
  }

  // Health check that considers shutdown state
  healthCheck() {
    return {
      status: this.shutdown ? 'shutting_down' : 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      ...this.getStatus()
    };
  }

  // Manually trigger shutdown (for testing)
  triggerShutdown(reason = 'MANUAL') {
    this.handleShutdown(reason);
  }
}

// Singleton instance
const gracefulShutdown = new GracefulShutdown();

// Helper function for async operations with shutdown awareness
function withShutdownAwareness(operation, taskId = null) {
  return async (...args) => {
    if (gracefulShutdown.isShuttingDown()) {
      throw new Error('Operation cancelled - server is shutting down');
    }

    const promise = Promise.resolve(operation(...args));

    if (taskId) {
      gracefulShutdown.registerTask(taskId, promise);
    }

    return promise;
  };
}

module.exports = { gracefulShutdown, withShutdownAwareness };