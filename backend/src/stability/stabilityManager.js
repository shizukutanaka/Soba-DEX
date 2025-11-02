/**
 * Practical Stability Manager
 * Real-world stability monitoring and error handling for trading platforms
 * Circuit breakers, health checks, and graceful degradation
 */

const EventEmitter = require('events');
const winston = require('winston');

class StabilityManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      // Health check configuration
      healthChecks: {
        interval: 30000, // 30 seconds
        timeout: 5000, // 5 seconds
        retries: 3,
        endpoints: [
          { name: 'database', url: '/health/db', critical: true },
          { name: 'cache', url: '/health/cache', critical: false },
          { name: 'external_api', url: '/health/api', critical: false }
        ]
      },
      // Circuit breaker configuration
      circuitBreaker: {
        failureThreshold: 5, // failures before opening
        recoveryTimeout: 60000, // 1 minute
        monitoringPeriod: 300000, // 5 minutes
        halfOpenMaxCalls: 3
      },
      // Error handling
      errorHandling: {
        maxRetries: 3,
        retryDelay: 1000, // 1 second
        exponentialBackoff: true,
        timeoutMs: 30000 // 30 seconds
      },
      // Resource monitoring
      resources: {
        maxCpuUsage: 80, // percentage
        maxMemoryUsage: 85, // percentage
        maxDiskUsage: 90, // percentage
        checkInterval: 60000 // 1 minute
      },
      ...options
    };

    // Stability state
    this.healthStatus = new Map();
    this.circuitBreakers = new Map();
    this.errorCounts = new Map();
    this.resourceMetrics = {};
    this.systemHealth = 'healthy';

    this.isInitialized = false;
    this.healthCheckInterval = null;
    this.resourceMonitorInterval = null;

    this.initializeLogger();
    this.initializeCircuitBreakers();
  }

  initializeLogger() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'stability-manager' },
      transports: [
        new winston.transports.File({
          filename: 'logs/stability.log',
          level: 'warn',
          maxsize: 20971520,
          maxFiles: 10
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  initializeCircuitBreakers() {
    // Initialize circuit breakers for critical services
    const services = ['database', 'payment', 'trading_engine', 'user_auth'];

    services.forEach(service => {
      this.circuitBreakers.set(service, {
        state: 'closed', // closed, open, half-open
        failures: 0,
        lastFailureTime: null,
        lastSuccessTime: Date.now(),
        halfOpenCalls: 0
      });
    });
  }

  async initialize() {
    try {
      this.logger.info('Initializing Stability Manager...');

      await this.startHealthChecks();
      await this.startResourceMonitoring();
      await this.setupErrorHandling();

      this.isInitialized = true;
      this.logger.info('Stability Manager initialized successfully');

      return { success: true, message: 'Stability manager ready' };
    } catch (error) {
      this.logger.error('Failed to initialize stability manager:', error);
      throw error;
    }
  }

  async startHealthChecks() {
    // Initialize health status for all endpoints
    this.options.healthChecks.endpoints.forEach(endpoint => {
      this.healthStatus.set(endpoint.name, {
        status: 'unknown',
        lastCheck: null,
        responseTime: null,
        consecutiveFailures: 0,
        critical: endpoint.critical
      });
    });

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.options.healthChecks.interval);

    // Perform initial health check
    await this.performHealthChecks();

    this.logger.info('Health checks started');
  }

  async startResourceMonitoring() {
    // Start resource monitoring
    this.resourceMonitorInterval = setInterval(() => {
      this.monitorResources();
    }, this.options.resources.checkInterval);

    // Perform initial resource check
    await this.monitorResources();

    this.logger.info('Resource monitoring started');
  }

  async setupErrorHandling() {
    // Global error handling setup
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('uncaught_exception', error);
    });

    process.on('unhandledRejection', (reason, _promise) => {
      this.handleCriticalError('unhandled_rejection', reason);
    });

    this.logger.info('Error handling configured');
  }

  // Health check methods
  async performHealthChecks() {
    const checkPromises = this.options.healthChecks.endpoints.map(endpoint =>
      this.checkEndpointHealth(endpoint)
    );

    await Promise.allSettled(checkPromises);
    this.updateSystemHealth();
  }

  async checkEndpointHealth(endpoint) {
    const startTime = Date.now();
    const healthInfo = this.healthStatus.get(endpoint.name);

    try {
      // Simulate health check - in real implementation, make actual HTTP request
      const isHealthy = await this.performHealthCheck(endpoint);
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        healthInfo.status = 'healthy';
        healthInfo.consecutiveFailures = 0;
        healthInfo.responseTime = responseTime;
      } else {
        throw new Error('Health check failed');
      }

    } catch (error) {
      healthInfo.status = 'unhealthy';
      healthInfo.consecutiveFailures++;
      healthInfo.responseTime = Date.now() - startTime;

      this.logger.warn(`Health check failed for ${endpoint.name}`, {
        endpoint: endpoint.name,
        error: error.message,
        consecutiveFailures: healthInfo.consecutiveFailures
      });

      // Handle critical service failures
      if (endpoint.critical && healthInfo.consecutiveFailures >= 3) {
        this.handleCriticalServiceFailure(endpoint.name);
      }
    } finally {
      healthInfo.lastCheck = Date.now();
      this.healthStatus.set(endpoint.name, healthInfo);
    }
  }

  async performHealthCheck(_endpoint) {
    // Mock health check implementation
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate occasional failures
        resolve(Math.random() > 0.1); // 90% success rate
      }, Math.random() * 1000); // Random response time up to 1 second
    });
  }

  updateSystemHealth() {
    const criticalServices = Array.from(this.healthStatus.values())
      .filter(health => health.critical);

    const unhealthyCritical = criticalServices
      .filter(health => health.status === 'unhealthy');

    if (unhealthyCritical.length > 0) {
      this.systemHealth = 'critical';
    } else {
      const allServices = Array.from(this.healthStatus.values());
      const unhealthyServices = allServices.filter(health => health.status === 'unhealthy');

      if (unhealthyServices.length > allServices.length * 0.3) {
        this.systemHealth = 'degraded';
      } else {
        this.systemHealth = 'healthy';
      }
    }

    this.emit('healthStatusUpdate', {
      systemHealth: this.systemHealth,
      services: Object.fromEntries(this.healthStatus)
    });
  }

  handleCriticalServiceFailure(serviceName) {
    this.logger.error(`Critical service failure detected: ${serviceName}`);

    // Open circuit breaker for the service
    this.openCircuitBreaker(serviceName);

    // Emit critical alert
    this.emit('criticalServiceFailure', {
      service: serviceName,
      timestamp: Date.now()
    });
  }

  // Circuit breaker methods
  async executeWithCircuitBreaker(serviceName, operation) {
    const breaker = this.circuitBreakers.get(serviceName);

    if (!breaker) {
      throw new Error(`Circuit breaker not found for service: ${serviceName}`);
    }

    switch (breaker.state) {
    case 'open':
      if (Date.now() - breaker.lastFailureTime > this.options.circuitBreaker.recoveryTimeout) {
        breaker.state = 'half-open';
        breaker.halfOpenCalls = 0;
        this.logger.info(`Circuit breaker transitioning to half-open: ${serviceName}`);
      } else {
        throw new Error(`Circuit breaker is open for ${serviceName}`);
      }
      break;

    case 'half-open':
      if (breaker.halfOpenCalls >= this.options.circuitBreaker.halfOpenMaxCalls) {
        throw new Error(`Circuit breaker half-open call limit reached for ${serviceName}`);
      }
      breaker.halfOpenCalls++;
      break;
    }

    try {
      const result = await operation();

      // Success - handle circuit breaker state
      if (breaker.state === 'half-open') {
        this.closeCircuitBreaker(serviceName);
      } else {
        breaker.failures = 0;
        breaker.lastSuccessTime = Date.now();
      }

      return result;

    } catch (error) {
      // Failure - update circuit breaker
      breaker.failures++;
      breaker.lastFailureTime = Date.now();

      if (breaker.failures >= this.options.circuitBreaker.failureThreshold) {
        this.openCircuitBreaker(serviceName);
      }

      throw error;
    }
  }

  openCircuitBreaker(serviceName) {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.state = 'open';
      breaker.lastFailureTime = Date.now();

      this.logger.warn(`Circuit breaker opened for ${serviceName}`, {
        failures: breaker.failures,
        threshold: this.options.circuitBreaker.failureThreshold
      });

      this.emit('circuitBreakerOpened', { service: serviceName, failures: breaker.failures });
    }
  }

  closeCircuitBreaker(serviceName) {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failures = 0;
      breaker.halfOpenCalls = 0;
      breaker.lastSuccessTime = Date.now();

      this.logger.info(`Circuit breaker closed for ${serviceName}`);
      this.emit('circuitBreakerClosed', { service: serviceName });
    }
  }

  // Error handling with retries
  async executeWithRetry(operation, context = {}) {
    let lastError;
    let delay = this.options.errorHandling.retryDelay;

    for (let attempt = 0; attempt <= this.options.errorHandling.maxRetries; attempt++) {
      try {
        return await this.executeWithTimeout(operation, this.options.errorHandling.timeoutMs);
      } catch (error) {
        lastError = error;

        if (attempt === this.options.errorHandling.maxRetries) {
          this.logger.error('Operation failed after all retries', {
            attempts: attempt + 1,
            error: error.message,
            context
          });
          break;
        }

        this.logger.warn(`Operation failed, retrying (${attempt + 1}/${this.options.errorHandling.maxRetries})`, {
          error: error.message,
          nextRetryIn: delay,
          context
        });

        // Wait before retry
        await this.sleep(delay);

        // Exponential backoff
        if (this.options.errorHandling.exponentialBackoff) {
          delay *= 2;
        }
      }
    }

    throw lastError;
  }

  async executeWithTimeout(operation, timeoutMs) {
    return Promise.race([
      operation(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
      })
    ]);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Resource monitoring
  async monitorResources() {
    try {
      this.resourceMetrics = await this.getResourceMetrics();

      // Check resource thresholds
      this.checkResourceThresholds();

    } catch (error) {
      this.logger.error('Resource monitoring failed:', error);
    }
  }

  async getResourceMetrics() {
    // Mock resource metrics - in real implementation use system APIs
    return {
      cpu: {
        usage: Math.random() * 100,
        loadAverage: [Math.random() * 2, Math.random() * 2, Math.random() * 2]
      },
      memory: {
        usage: Math.random() * 100,
        total: 8 * 1024 * 1024 * 1024, // 8GB
        used: Math.random() * 6 * 1024 * 1024 * 1024 // Up to 6GB used
      },
      disk: {
        usage: Math.random() * 100,
        total: 100 * 1024 * 1024 * 1024, // 100GB
        used: Math.random() * 80 * 1024 * 1024 * 1024 // Up to 80GB used
      },
      network: {
        connectionsActive: Math.floor(Math.random() * 1000),
        bytesIn: Math.random() * 1000000,
        bytesOut: Math.random() * 1000000
      }
    };
  }

  checkResourceThresholds() {
    const alerts = [];

    // CPU usage check
    if (this.resourceMetrics.cpu.usage > this.options.resources.maxCpuUsage) {
      alerts.push({
        type: 'high_cpu_usage',
        severity: 'warning',
        current: this.resourceMetrics.cpu.usage,
        threshold: this.options.resources.maxCpuUsage
      });
    }

    // Memory usage check
    if (this.resourceMetrics.memory.usage > this.options.resources.maxMemoryUsage) {
      alerts.push({
        type: 'high_memory_usage',
        severity: 'warning',
        current: this.resourceMetrics.memory.usage,
        threshold: this.options.resources.maxMemoryUsage
      });
    }

    // Disk usage check
    if (this.resourceMetrics.disk.usage > this.options.resources.maxDiskUsage) {
      alerts.push({
        type: 'high_disk_usage',
        severity: 'critical',
        current: this.resourceMetrics.disk.usage,
        threshold: this.options.resources.maxDiskUsage
      });
    }

    // Handle alerts
    alerts.forEach(alert => this.handleResourceAlert(alert));
  }

  handleResourceAlert(alert) {
    this.logger.warn('Resource threshold exceeded', alert);
    this.emit('resourceAlert', alert);

    // Take corrective action for critical alerts
    if (alert.severity === 'critical') {
      this.handleCriticalResourceAlert(alert);
    }
  }

  handleCriticalResourceAlert(alert) {
    switch (alert.type) {
    case 'high_disk_usage':
      this.performEmergencyCleanup();
      break;
    case 'high_memory_usage':
      this.performMemoryCleanup();
      break;
    default:
      this.logger.error('Critical resource alert requires manual intervention', alert);
    }
  }

  performEmergencyCleanup() {
    this.logger.info('Performing emergency disk cleanup');
    // Implement cleanup logic (clear logs, temp files, etc.)
    this.emit('emergencyCleanup', { type: 'disk' });
  }

  performMemoryCleanup() {
    this.logger.info('Performing memory cleanup');
    // Implement memory cleanup (clear caches, force GC, etc.)
    if (global.gc) {
      global.gc();
    }
    this.emit('emergencyCleanup', { type: 'memory' });
  }

  // Error tracking and analysis
  handleCriticalError(type, error) {
    this.logger.error(`Critical error: ${type}`, {
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });

    // Track error for analysis
    const errorKey = `${type}_${Date.now()}`;
    this.errorCounts.set(errorKey, {
      type,
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });

    // Emit critical error event
    this.emit('criticalError', { type, error });

    // Don't exit on critical errors, try to maintain service
    // but alert monitoring systems
  }

  // Status and reporting
  getStabilityStatus() {
    return {
      isInitialized: this.isInitialized,
      systemHealth: this.systemHealth,
      healthChecks: Object.fromEntries(this.healthStatus),
      circuitBreakers: Object.fromEntries(this.circuitBreakers),
      resourceMetrics: this.resourceMetrics,
      errorCount: this.errorCounts.size
    };
  }

  generateStabilityReport() {
    const status = this.getStabilityStatus();

    return {
      timestamp: new Date().toISOString(),
      summary: {
        systemHealth: this.systemHealth,
        criticalServicesHealthy: this.getCriticalServicesHealth(),
        resourceUsageNormal: this.isResourceUsageNormal(),
        circuitBreakersState: this.getCircuitBreakersState()
      },
      details: status,
      recommendations: this.generateStabilityRecommendations()
    };
  }

  getCriticalServicesHealth() {
    const criticalServices = Array.from(this.healthStatus.values())
      .filter(health => health.critical);

    return criticalServices.every(health => health.status === 'healthy');
  }

  isResourceUsageNormal() {
    return this.resourceMetrics.cpu?.usage <= this.options.resources.maxCpuUsage &&
               this.resourceMetrics.memory?.usage <= this.options.resources.maxMemoryUsage &&
               this.resourceMetrics.disk?.usage <= this.options.resources.maxDiskUsage;
  }

  getCircuitBreakersState() {
    const states = Array.from(this.circuitBreakers.values()).map(cb => cb.state);
    const openBreakers = states.filter(state => state === 'open').length;
    return {
      total: states.length,
      open: openBreakers,
      allClosed: openBreakers === 0
    };
  }

  generateStabilityRecommendations() {
    const recommendations = [];

    // Health check recommendations
    const unhealthyServices = Array.from(this.healthStatus.entries())
      .filter(([_, health]) => health.status === 'unhealthy')
      .map(([name]) => name);

    if (unhealthyServices.length > 0) {
      recommendations.push({
        type: 'service_health',
        priority: 'high',
        action: `Investigate and fix unhealthy services: ${unhealthyServices.join(', ')}`,
        impact: 'System stability and reliability'
      });
    }

    // Resource recommendations
    if (this.resourceMetrics.cpu?.usage > 80) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        action: 'Optimize CPU usage or scale resources',
        impact: 'System performance and responsiveness'
      });
    }

    // Circuit breaker recommendations
    const openBreakers = Array.from(this.circuitBreakers.entries())
      .filter(([_, breaker]) => breaker.state === 'open')
      .map(([name]) => name);

    if (openBreakers.length > 0) {
      recommendations.push({
        type: 'circuit_breakers',
        priority: 'critical',
        action: `Address issues with services: ${openBreakers.join(', ')}`,
        impact: 'Service availability and user experience'
      });
    }

    return recommendations;
  }

  async shutdown() {
    this.logger.info('Shutting down Stability Manager...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
    }

    // Clear state
    this.healthStatus.clear();
    this.circuitBreakers.clear();
    this.errorCounts.clear();

    this.isInitialized = false;
    this.logger.info('Stability Manager shutdown complete');
  }
}

module.exports = StabilityManager;