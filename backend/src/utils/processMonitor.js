// SAND Process Monitor - Lightweight health monitoring
const os = require('os');
const cluster = require('cluster');
const fs = require('fs');
const path = require('path');

class ProcessMonitor {
  constructor(options = {}) {
    this.name = options.name || 'SAND';
    this.checkInterval = options.checkInterval || 10000; // 10 seconds
    this.maxMemory = options.maxMemory || 100 * 1024 * 1024; // 100MB
    this.maxCpu = options.maxCpu || 80; // 80%
    this.autoRestart = options.autoRestart !== false;
    this.restartDelay = options.restartDelay || 3000;
    this.maxRestarts = options.maxRestarts || 5;

    this.stats = {
      startTime: Date.now(),
      restarts: 0,
      crashes: 0,
      healthChecks: 0,
      lastCheck: null
    };

    this.workers = new Map();
    this.isRunning = false;
  }

  // Start monitoring
  start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    console.log(`[${this.name}] Process Monitor started`);

    // Setup monitoring interval
    this.interval = setInterval(() => this.check(), this.checkInterval);

    // Setup process handlers
    this.setupHandlers();

    // Initial check
    this.check();
  }

  // Stop monitoring
  stop() {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log(`[${this.name}] Process Monitor stopped`);
  }

  // Health check
  check() {
    this.stats.healthChecks++;
    this.stats.lastCheck = Date.now();

    const metrics = this.getMetrics();

    // Check memory
    if (metrics.memory.used > this.maxMemory) {
      console.warn(`[${this.name}] High memory usage: ${Math.round(metrics.memory.used / 1048576)}MB`);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log(`[${this.name}] Garbage collection triggered`);
      }
    }

    // Check CPU
    if (metrics.cpu.percent > this.maxCpu) {
      console.warn(`[${this.name}] High CPU usage: ${metrics.cpu.percent}%`);
    }

    // Check workers (if cluster mode)
    if (cluster.isMaster) {
      this.checkWorkers();
    }

    return metrics;
  }

  // Get system metrics
  getMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    // Calculate CPU percentage
    const cpuPercent = Math.round(
      ((cpuUsage.user + cpuUsage.system) / 1000000) / uptime * 100
    );

    return {
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        rss: memUsage.rss,
        percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        percent: cpuPercent
      },
      system: {
        loadavg: os.loadavg(),
        freemem: os.freemem(),
        totalmem: os.totalmem(),
        uptime: os.uptime()
      },
      process: {
        pid: process.pid,
        uptime: uptime,
        version: process.version,
        platform: process.platform
      },
      stats: this.stats
    };
  }

  // Setup process event handlers
  setupHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error(`[${this.name}] Uncaught Exception:`, error);
      this.stats.crashes++;

      if (this.autoRestart && this.stats.restarts < this.maxRestarts) {
        this.restart('uncaughtException');
      } else {
        process.exit(1);
      }
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, _promise) => {
      console.error(`[${this.name}] Unhandled Rejection:`, reason);
    });

    // Handle termination signals
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    // Handle worker exit (cluster mode)
    if (cluster.isMaster) {
      cluster.on('exit', (worker, code, signal) => {
        console.log(`[${this.name}] Worker ${worker.process.pid} died (${signal || code})`);
        this.workers.delete(worker.id);

        if (this.autoRestart && !this.shuttingDown) {
          this.spawnWorker();
        }
      });
    }
  }

  // Restart process
  restart(reason) {
    console.log(`[${this.name}] Restarting due to ${reason}...`);
    this.stats.restarts++;

    setTimeout(() => {
      if (cluster.isMaster) {
        // Restart all workers
        for (const worker of this.workers.values()) {
          worker.kill();
        }
      } else {
        // Restart single process
        process.exit(0);
      }
    }, this.restartDelay);
  }

  // Graceful shutdown
  shutdown(signal) {
    console.log(`[${this.name}] Shutting down gracefully (${signal})...`);
    this.shuttingDown = true;

    this.stop();

    // Save stats
    this.saveStats();

    // Close workers
    if (cluster.isMaster) {
      for (const worker of this.workers.values()) {
        worker.kill('SIGTERM');
      }
    }

    setTimeout(() => {
      console.log(`[${this.name}] Shutdown complete`);
      process.exit(0);
    }, 3000);
  }

  // Save statistics to file
  saveStats() {
    const statsFile = path.join(__dirname, '../../logs', `${this.name.toLowerCase()}-stats.json`);
    const logDir = path.dirname(statsFile);

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    try {
      fs.writeFileSync(statsFile, JSON.stringify({
        ...this.stats,
        metrics: this.getMetrics(),
        timestamp: Date.now()
      }, null, 2));
      console.log(`[${this.name}] Stats saved to ${statsFile}`);
    } catch (error) {
      console.error(`[${this.name}] Failed to save stats:`, error.message);
    }
  }

  // Cluster management
  setupCluster(workers = os.cpus().length) {
    if (!cluster.isMaster) {
      return;
    }

    console.log(`[${this.name}] Setting up cluster with ${workers} workers`);

    for (let i = 0; i < workers; i++) {
      this.spawnWorker();
    }
  }

  spawnWorker() {
    const worker = cluster.fork();
    this.workers.set(worker.id, worker);

    worker.on('message', (msg) => {
      if (msg.type === 'metrics') {
        // Handle worker metrics
        console.log(`[Worker ${worker.id}] Metrics:`, msg.data);
      }
    });

    console.log(`[${this.name}] Worker ${worker.process.pid} spawned`);
  }

  checkWorkers() {
    for (const [id, worker] of this.workers.entries()) {
      if (worker.isDead()) {
        console.warn(`[${this.name}] Worker ${id} is dead`);
        this.workers.delete(id);

        if (this.autoRestart) {
          this.spawnWorker();
        }
      }
    }
  }

  // Get combined stats from all workers
  async getClusterStats() {
    if (!cluster.isMaster) {
      return this.getMetrics();
    }

    const stats = {
      master: this.getMetrics(),
      workers: []
    };

    for (const worker of this.workers.values()) {
      worker.send({ type: 'get-metrics' });
    }

    // Wait for responses (simplified)
    await new Promise(resolve => setTimeout(resolve, 100));

    return stats;
  }
}

// Singleton instance
let monitor = null;

module.exports = {
  ProcessMonitor,

  // Start monitoring
  start: (options) => {
    if (!monitor) {
      monitor = new ProcessMonitor(options);
    }
    monitor.start();
    return monitor;
  },

  // Stop monitoring
  stop: () => {
    if (monitor) {
      monitor.stop();
    }
  },

  // Get metrics
  getMetrics: () => {
    if (monitor) {
      return monitor.getMetrics();
    }
    return null;
  },

  // Get instance
  getInstance: () => monitor
};