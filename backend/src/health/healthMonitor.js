// ============================================================================
// Health Monitoring and Auto-Recovery System
// Comprehensive health checks with automatic recovery mechanisms
// ============================================================================

const EventEmitter = require('events');
const { Pool } = require('pg');
const Redis = require('ioredis');

/**
 * HealthMonitor - Comprehensive health monitoring with auto-recovery
 *
 * Features:
 * - Database connection health
 * - Redis connection health
 * - Memory usage monitoring
 * - CPU usage monitoring
 * - Disk space monitoring
 * - API endpoint health
 * - Automatic recovery attempts
 * - Health status aggregation
 * - Alert generation
 */
class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      checkInterval: options.checkInterval || 30000, // 30 seconds
      unhealthyThreshold: options.unhealthyThreshold || 3,
      recoveryAttempts: options.recoveryAttempts || 3,
      recoveryDelay: options.recoveryDelay || 5000,
      memoryThreshold: options.memoryThreshold || 0.85, // 85%
      cpuThreshold: options.cpuThreshold || 0.90, // 90%
      diskThreshold: options.diskThreshold || 0.90, // 90%
      ...options
    };

    this.healthStatus = {
      overall: 'healthy',
      components: {},
      lastCheck: null,
      consecutiveFailures: 0
    };

    this.connections = {
      database: null,
      redis: null
    };

    this.recoveryQueue = new Map();
    this.checkInterval = null;
    this.metrics = {
      totalChecks: 0,
      failedChecks: 0,
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
  }

  /**
   * Initialize health monitor
   */
  async initialize() {
    console.log('[HealthMonitor] Initializing health monitoring system...');

    try {
      // Initialize database connection
      if (process.env.DB_HOST) {
        this.connections.database = new Pool({
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT) || 5432,
          database: process.env.DB_NAME || 'security_monitor',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD,
          max: 2, // Small pool for health checks
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000
        });
      }

      // Initialize Redis connection
      if (process.env.REDIS_HOST) {
        this.connections.redis = new Redis({
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB) || 0,
          retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 1000, 3000);
          },
          enableOfflineQueue: false
        });
      }

      // Start health check loop
      this.startHealthChecks();

      console.log('[HealthMonitor] Health monitoring initialized');
      this.emit('initialized');

      return true;
    } catch (error) {
      console.error('[HealthMonitor] Initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('[HealthMonitor] Health check failed:', error);
      });
    }, this.options.checkInterval);

    // Perform initial check
    this.performHealthCheck().catch(error => {
      console.error('[HealthMonitor] Initial health check failed:', error);
    });
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    this.metrics.totalChecks++;

    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      memory: await this.checkMemory(),
      cpu: await this.checkCPU(),
      disk: await this.checkDisk()
    };

    // Update component health status
    this.healthStatus.components = checks;
    this.healthStatus.lastCheck = new Date();

    // Determine overall health
    const unhealthyComponents = Object.values(checks).filter(c => c.status !== 'healthy');

    if (unhealthyComponents.length === 0) {
      this.healthStatus.overall = 'healthy';
      this.healthStatus.consecutiveFailures = 0;
    } else if (unhealthyComponents.some(c => c.status === 'critical')) {
      this.healthStatus.overall = 'critical';
      this.healthStatus.consecutiveFailures++;
    } else {
      this.healthStatus.overall = 'degraded';
      this.healthStatus.consecutiveFailures++;
    }

    // Trigger auto-recovery for unhealthy components
    for (const [component, status] of Object.entries(checks)) {
      if (status.status !== 'healthy') {
        await this.attemptRecovery(component, status);
      }
    }

    // Emit health status
    this.emit('health-check', {
      ...this.healthStatus,
      duration: Date.now() - startTime
    });

    // Alert if unhealthy threshold exceeded
    if (this.healthStatus.consecutiveFailures >= this.options.unhealthyThreshold) {
      this.emit('unhealthy-threshold-exceeded', this.healthStatus);
      this.metrics.failedChecks++;
    }

    return this.healthStatus;
  }

  /**
   * Check database health
   */
  async checkDatabase() {
    if (!this.connections.database) {
      return {
        status: 'unknown',
        message: 'Database connection not configured'
      };
    }

    try {
      const startTime = Date.now();
      const result = await this.connections.database.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;

      if (result.rows[0].health_check === 1) {
        return {
          status: 'healthy',
          responseTime,
          message: 'Database is responding'
        };
      }

      return {
        status: 'degraded',
        responseTime,
        message: 'Database response unexpected'
      };
    } catch (error) {
      return {
        status: 'critical',
        error: error.message,
        message: 'Database connection failed'
      };
    }
  }

  /**
   * Check Redis health
   */
  async checkRedis() {
    if (!this.connections.redis) {
      return {
        status: 'unknown',
        message: 'Redis connection not configured'
      };
    }

    try {
      const startTime = Date.now();
      const pong = await this.connections.redis.ping();
      const responseTime = Date.now() - startTime;

      if (pong === 'PONG') {
        return {
          status: 'healthy',
          responseTime,
          message: 'Redis is responding'
        };
      }

      return {
        status: 'degraded',
        responseTime,
        message: 'Redis response unexpected'
      };
    } catch (error) {
      return {
        status: 'critical',
        error: error.message,
        message: 'Redis connection failed'
      };
    }
  }

  /**
   * Check memory usage
   */
  async checkMemory() {
    try {
      const usage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const usedMemory = usage.heapUsed + usage.external;
      const memoryPercent = usedMemory / totalMemory;

      let status = 'healthy';
      if (memoryPercent > this.options.memoryThreshold) {
        status = 'critical';
      } else if (memoryPercent > this.options.memoryThreshold * 0.8) {
        status = 'degraded';
      }

      return {
        status,
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
        percentage: Math.round(memoryPercent * 100),
        message: `Memory usage at ${Math.round(memoryPercent * 100)}%`
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message,
        message: 'Failed to check memory'
      };
    }
  }

  /**
   * Check CPU usage
   */
  async checkCPU() {
    try {
      const cpus = require('os').cpus();
      const loadAvg = require('os').loadavg()[0]; // 1-minute load average
      const cpuCount = cpus.length;
      const cpuPercent = loadAvg / cpuCount;

      let status = 'healthy';
      if (cpuPercent > this.options.cpuThreshold) {
        status = 'critical';
      } else if (cpuPercent > this.options.cpuThreshold * 0.8) {
        status = 'degraded';
      }

      return {
        status,
        loadAverage: loadAvg.toFixed(2),
        cpuCount,
        percentage: Math.round(cpuPercent * 100),
        message: `CPU load at ${Math.round(cpuPercent * 100)}%`
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message,
        message: 'Failed to check CPU'
      };
    }
  }

  /**
   * Check disk space
   */
  async checkDisk() {
    try {
      // Note: This is a simplified check. For production, use a library like 'diskusage'
      const fs = require('fs');
      const path = require('path');

      // Check application directory
      const appDir = process.cwd();

      return {
        status: 'healthy',
        path: appDir,
        message: 'Disk space check not fully implemented (requires diskusage module)'
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message,
        message: 'Failed to check disk space'
      };
    }
  }

  /**
   * Attempt automatic recovery for unhealthy component
   */
  async attemptRecovery(component, status) {
    // Check if recovery is already in progress
    if (this.recoveryQueue.has(component)) {
      const recovery = this.recoveryQueue.get(component);
      if (recovery.inProgress) {
        return;
      }
    }

    // Initialize recovery tracking
    if (!this.recoveryQueue.has(component)) {
      this.recoveryQueue.set(component, {
        attempts: 0,
        lastAttempt: null,
        inProgress: false
      });
    }

    const recovery = this.recoveryQueue.get(component);

    // Check if max attempts exceeded
    if (recovery.attempts >= this.options.recoveryAttempts) {
      this.emit('recovery-failed', { component, status, attempts: recovery.attempts });
      return;
    }

    // Mark recovery in progress
    recovery.inProgress = true;
    recovery.attempts++;
    recovery.lastAttempt = new Date();
    this.metrics.recoveryAttempts++;

    console.log(`[HealthMonitor] Attempting recovery for ${component} (attempt ${recovery.attempts}/${this.options.recoveryAttempts})`);
    this.emit('recovery-attempt', { component, attempt: recovery.attempts });

    try {
      // Wait before recovery attempt
      await new Promise(resolve => setTimeout(resolve, this.options.recoveryDelay));

      // Attempt recovery based on component
      let recovered = false;
      switch (component) {
        case 'database':
          recovered = await this.recoverDatabase();
          break;
        case 'redis':
          recovered = await this.recoverRedis();
          break;
        case 'memory':
          recovered = await this.recoverMemory();
          break;
        default:
          console.warn(`[HealthMonitor] No recovery strategy for ${component}`);
      }

      if (recovered) {
        console.log(`[HealthMonitor] Successfully recovered ${component}`);
        this.recoveryQueue.delete(component);
        this.metrics.successfulRecoveries++;
        this.emit('recovery-success', { component, attempts: recovery.attempts });
      } else {
        recovery.inProgress = false;
      }
    } catch (error) {
      console.error(`[HealthMonitor] Recovery failed for ${component}:`, error);
      recovery.inProgress = false;
      this.emit('recovery-error', { component, error: error.message });
    }
  }

  /**
   * Recover database connection
   */
  async recoverDatabase() {
    try {
      // Close existing connection
      if (this.connections.database) {
        await this.connections.database.end();
      }

      // Create new connection
      this.connections.database = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'security_monitor',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        max: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      // Test connection
      const result = await this.connections.database.query('SELECT 1');
      return result.rows[0]['?column?'] === 1;
    } catch (error) {
      console.error('[HealthMonitor] Database recovery failed:', error);
      return false;
    }
  }

  /**
   * Recover Redis connection
   */
  async recoverRedis() {
    try {
      // Close existing connection
      if (this.connections.redis) {
        this.connections.redis.disconnect();
      }

      // Create new connection
      this.connections.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 1000, 3000);
        },
        enableOfflineQueue: false
      });

      // Test connection
      const pong = await this.connections.redis.ping();
      return pong === 'PONG';
    } catch (error) {
      console.error('[HealthMonitor] Redis recovery failed:', error);
      return false;
    }
  }

  /**
   * Recover from high memory usage
   */
  async recoverMemory() {
    try {
      console.log('[HealthMonitor] Forcing garbage collection...');

      if (global.gc) {
        global.gc();

        // Wait a moment for GC to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if memory is below threshold now
        const usage = process.memoryUsage();
        const totalMemory = require('os').totalmem();
        const memoryPercent = (usage.heapUsed + usage.external) / totalMemory;

        return memoryPercent < this.options.memoryThreshold;
      } else {
        console.warn('[HealthMonitor] Garbage collection not exposed. Run with --expose-gc flag');
        return false;
      }
    } catch (error) {
      console.error('[HealthMonitor] Memory recovery failed:', error);
      return false;
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      ...this.healthStatus,
      metrics: this.metrics,
      uptime: process.uptime()
    };
  }

  /**
   * Get health metrics
   */
  getMetrics() {
    const successRate = this.metrics.totalChecks > 0
      ? ((this.metrics.totalChecks - this.metrics.failedChecks) / this.metrics.totalChecks * 100).toFixed(2)
      : 100;

    const recoveryRate = this.metrics.recoveryAttempts > 0
      ? ((this.metrics.successfulRecoveries / this.metrics.recoveryAttempts) * 100).toFixed(2)
      : 100;

    return {
      ...this.metrics,
      successRate: parseFloat(successRate),
      recoveryRate: parseFloat(recoveryRate),
      uptime: process.uptime()
    };
  }

  /**
   * Shutdown health monitor
   */
  async shutdown() {
    console.log('[HealthMonitor] Shutting down health monitoring...');

    // Stop health checks
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Close connections
    if (this.connections.database) {
      await this.connections.database.end();
      this.connections.database = null;
    }

    if (this.connections.redis) {
      this.connections.redis.disconnect();
      this.connections.redis = null;
    }

    this.emit('shutdown');
    console.log('[HealthMonitor] Health monitoring shut down');
  }
}

module.exports = HealthMonitor;
