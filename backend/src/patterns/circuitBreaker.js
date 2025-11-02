/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by detecting and isolating failing services
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 *
 * Features:
 * - Configurable failure threshold
 * - Automatic recovery testing
 * - Metrics and monitoring
 * - Event callbacks
 */

const { logger } = require('../utils/productionLogger');
const EventEmitter = require('events');

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      // Failure threshold (percentage)
      failureThreshold: options.failureThreshold || 50,

      // Minimum number of requests before evaluating
      minimumRequests: options.minimumRequests || 10,

      // Time window for evaluation (ms)
      windowDuration: options.windowDuration || 60000, // 1 minute

      // Time to wait before attempting recovery (ms)
      openDuration: options.openDuration || 30000, // 30 seconds

      // Number of successful requests needed to close circuit in HALF_OPEN state
      successThreshold: options.successThreshold || 3,

      // Timeout for each request (ms)
      timeout: options.timeout || 5000,

      // Name for logging
      name: options.name || 'circuit-breaker',

      // Fallback function
      fallback: options.fallback || null
    };

    // Current state
    this.state = CircuitState.CLOSED;

    // Request tracking
    this.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      timeout: 0,
      rejected: 0
    };

    // Metrics for current window
    this.windowStart = Date.now();
    this.consecutiveSuccesses = 0;

    // Timer for state transitions
    this.openTimer = null;

    // Statistics
    this.stats = {
      stateChanges: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastStateChange: null,
      uptime: Date.now()
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, ...args) {
    // Check if circuit is OPEN
    if (this.state === CircuitState.OPEN) {
      this.requests.rejected++;
      this.emit('reject', { state: this.state, requests: this.requests });

      if (this.options.fallback) {
        logger.debug('Circuit OPEN, using fallback', { name: this.options.name });
        return this.options.fallback(...args);
      }

      throw new Error(`Circuit breaker is OPEN for ${this.options.name}`);
    }

    // Execute the function
    try {
      const result = await this.executeWithTimeout(fn, args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);

      if (this.options.fallback) {
        logger.debug('Request failed, using fallback', {
          name: this.options.name,
          error: error.message
        });
        return this.options.fallback(...args);
      }

      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, args) {
    return Promise.race([
      fn(...args),
      this.createTimeoutPromise()
    ]);
  }

  /**
   * Create a timeout promise
   */
  createTimeoutPromise() {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });
  }

  /**
   * Handle successful request
   */
  onSuccess() {
    this.requests.total++;
    this.requests.successful++;
    this.stats.totalRequests++;
    this.stats.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses++;

      // Check if we can close the circuit
      if (this.consecutiveSuccesses >= this.options.successThreshold) {
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.checkWindow();
    }

    this.emit('success', {
      state: this.state,
      consecutiveSuccesses: this.consecutiveSuccesses
    });
  }

  /**
   * Handle failed request
   */
  onFailure(error) {
    this.requests.total++;
    this.requests.failed++;
    this.stats.totalRequests++;
    this.stats.totalFailures++;

    // Check if it was a timeout
    if (error.message.includes('timeout')) {
      this.requests.timeout++;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Immediately open if failure in HALF_OPEN state
      this.open();
    } else if (this.state === CircuitState.CLOSED) {
      this.consecutiveSuccesses = 0;
      this.checkWindow();
      this.evaluateCircuit();
    }

    this.emit('failure', {
      state: this.state,
      error: error.message,
      requests: this.requests
    });
  }

  /**
   * Check if window should reset
   */
  checkWindow() {
    const now = Date.now();
    const windowElapsed = now - this.windowStart;

    if (windowElapsed >= this.options.windowDuration) {
      this.resetWindow();
    }
  }

  /**
   * Reset the tracking window
   */
  resetWindow() {
    this.windowStart = Date.now();
    this.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      timeout: 0,
      rejected: 0
    };
  }

  /**
   * Evaluate if circuit should open
   */
  evaluateCircuit() {
    // Need minimum requests to evaluate
    if (this.requests.total < this.options.minimumRequests) {
      return;
    }

    // Calculate failure rate
    const failureRate = (this.requests.failed / this.requests.total) * 100;

    // Open circuit if failure rate exceeds threshold
    if (failureRate >= this.options.failureThreshold) {
      this.open();
    }
  }

  /**
   * Open the circuit
   */
  open() {
    if (this.state === CircuitState.OPEN) {
      return;
    }

    this.state = CircuitState.OPEN;
    this.consecutiveSuccesses = 0;
    this.stats.stateChanges++;
    this.stats.lastStateChange = Date.now();

    logger.warn('Circuit breaker opened', {
      name: this.options.name,
      failureRate: this.getFailureRate(),
      requests: this.requests
    });

    this.emit('open', {
      failureRate: this.getFailureRate(),
      requests: this.requests
    });

    // Set timer to attempt recovery
    this.openTimer = setTimeout(() => {
      this.halfOpen();
    }, this.options.openDuration);
  }

  /**
   * Transition to HALF_OPEN state
   */
  halfOpen() {
    this.state = CircuitState.HALF_OPEN;
    this.consecutiveSuccesses = 0;
    this.resetWindow();
    this.stats.stateChanges++;
    this.stats.lastStateChange = Date.now();

    logger.info('Circuit breaker half-open, testing recovery', {
      name: this.options.name
    });

    this.emit('halfOpen', {
      successThreshold: this.options.successThreshold
    });
  }

  /**
   * Close the circuit
   */
  close() {
    if (this.state === CircuitState.CLOSED) {
      return;
    }

    this.state = CircuitState.CLOSED;
    this.consecutiveSuccesses = 0;
    this.resetWindow();
    this.stats.stateChanges++;
    this.stats.lastStateChange = Date.now();

    logger.info('Circuit breaker closed, normal operation resumed', {
      name: this.options.name
    });

    this.emit('close', {
      requests: this.requests
    });

    // Clear open timer if exists
    if (this.openTimer) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  /**
   * Manually open the circuit
   */
  forceOpen() {
    logger.warn('Circuit breaker manually opened', {
      name: this.options.name
    });
    this.open();
  }

  /**
   * Manually close the circuit
   */
  forceClose() {
    logger.info('Circuit breaker manually closed', {
      name: this.options.name
    });
    this.close();
  }

  /**
   * Get current failure rate
   */
  getFailureRate() {
    if (this.requests.total === 0) {
      return 0;
    }
    return ((this.requests.failed / this.requests.total) * 100).toFixed(2);
  }

  /**
   * Get current success rate
   */
  getSuccessRate() {
    if (this.requests.total === 0) {
      return 0;
    }
    return ((this.requests.successful / this.requests.total) * 100).toFixed(2);
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.options.name,
      state: this.state,
      requests: { ...this.requests },
      failureRate: this.getFailureRate() + '%',
      successRate: this.getSuccessRate() + '%',
      consecutiveSuccesses: this.consecutiveSuccesses,
      windowAge: Date.now() - this.windowStart,
      stats: { ...this.stats },
      uptime: Date.now() - this.stats.uptime
    };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      state: this.state,
      totalRequests: this.stats.totalRequests,
      totalSuccesses: this.stats.totalSuccesses,
      totalFailures: this.stats.totalFailures,
      overallSuccessRate: this.stats.totalRequests > 0
        ? ((this.stats.totalSuccesses / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : 'N/A',
      stateChanges: this.stats.stateChanges,
      lastStateChange: this.stats.lastStateChange,
      uptime: Date.now() - this.stats.uptime
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      stateChanges: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastStateChange: null,
      uptime: Date.now()
    };
    this.resetWindow();
  }

  /**
   * Shutdown the circuit breaker
   */
  shutdown() {
    if (this.openTimer) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    this.removeAllListeners();
    logger.info('Circuit breaker shut down', { name: this.options.name });
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Create a new circuit breaker
   */
  create(name, options = {}) {
    if (this.breakers.has(name)) {
      logger.warn('Circuit breaker already exists', { name });
      return this.breakers.get(name);
    }

    const breaker = new CircuitBreaker({
      ...options,
      name
    });

    this.breakers.set(name, breaker);

    logger.info('Circuit breaker created', { name });

    return breaker;
  }

  /**
   * Get a circuit breaker by name
   */
  get(name) {
    return this.breakers.get(name);
  }

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(name, options = {}) {
    return this.breakers.get(name) || this.create(name, options);
  }

  /**
   * Remove a circuit breaker
   */
  remove(name) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.shutdown();
      this.breakers.delete(name);
      logger.info('Circuit breaker removed', { name });
    }
  }

  /**
   * Get all circuit breakers
   */
  getAll() {
    return Array.from(this.breakers.values());
  }

  /**
   * Get status of all circuit breakers
   */
  getAllStatus() {
    const statuses = {};
    for (const [name, breaker] of this.breakers) {
      statuses[name] = breaker.getStatus();
    }
    return statuses;
  }

  /**
   * Get health overview
   */
  getHealthOverview() {
    const overview = {
      total: this.breakers.size,
      closed: 0,
      open: 0,
      halfOpen: 0,
      breakers: []
    };

    for (const [name, breaker] of this.breakers) {
      const status = breaker.getStatus();

      switch (status.state) {
        case CircuitState.CLOSED:
          overview.closed++;
          break;
        case CircuitState.OPEN:
          overview.open++;
          break;
        case CircuitState.HALF_OPEN:
          overview.halfOpen++;
          break;
      }

      overview.breakers.push({
        name,
        state: status.state,
        failureRate: status.failureRate,
        requests: status.requests.total
      });
    }

    return overview;
  }

  /**
   * Shutdown all circuit breakers
   */
  shutdownAll() {
    for (const breaker of this.breakers.values()) {
      breaker.shutdown();
    }
    this.breakers.clear();
    logger.info('All circuit breakers shut down');
  }
}

// Export
module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitState
};

// Export singleton manager
module.exports.circuitBreakerManager = new CircuitBreakerManager();
