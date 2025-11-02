/**
 * Circuit Breaker Pattern
 * Prevent cascading failures in critical operations
 */

const { EventEmitter } = require('events');

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      failureThreshold: 5, // Number of failures to trip circuit
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 600000, // 10 minutes
      volumeThreshold: 10, // Minimum requests before failure rate matters
      halfOpenMaxCalls: 3, // Max calls in half-open state
      ...options
    };

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitOpenTime: 0,
      lastReset: Date.now(),
      circuitOpens: 0,
      lastFailure: null,
      lastSuccess: null
    };
    this.requests = []; // Track request history for monitoring
    this.halfOpenCount = 0;
  }

  // Execute function with circuit breaker protection
  async execute(fn, ...args) {
    this.stats.totalRequests++;

    if (this.state === 'OPEN') {
      if (this.canAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.halfOpenCount = 0;
        this.emit('halfOpen');
      } else {
        this.emit('rejected', 'Circuit breaker is OPEN');
        throw new Error('Circuit breaker is OPEN - request rejected');
      }
    }

    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenCount >= this.options.halfOpenMaxCalls) {
        this.emit('rejected', 'Half-open limit exceeded');
        throw new Error('Circuit breaker half-open limit exceeded');
      }
      this.halfOpenCount++;
    }

    try {
      const result = await this.callFunction(fn, ...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  // Execute function with timeout
  async callFunction(fn, ...args) {
    const timeout = this.options.timeout || 5000;

    return new Promise((resolve, reject) => {
      // Execute async operation inside
      const timer = setTimeout(() => {
        reject(new Error('Function timeout'));
      }, timeout);

      Promise.resolve(fn(...args))
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // Handle successful execution
  onSuccess() {
    this.failureCount = 0;
    this.stats.successfulRequests++;
    this.stats.lastSuccess = Date.now();
    this.recordRequest(true);

    if (this.state === 'HALF_OPEN') {
      this.reset();
    }

    this.emit('success');
  }

  // Handle failed execution
  onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.stats.failedRequests++;
    this.stats.lastFailure = Date.now();
    this.recordRequest(false);

    this.emit('failure', error);

    if (this.state === 'HALF_OPEN') {
      this.trip();
    } else if (this.shouldTrip()) {
      this.trip();
    }
  }

  // Check if circuit should trip
  shouldTrip() {
    return this.failureCount >= this.options.failureThreshold &&
           this.stats.totalRequests >= this.options.volumeThreshold;
  }

  // Trip the circuit breaker
  trip() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.options.resetTimeout;
    this.stats.circuitOpenTime = Date.now();
    this.stats.circuitOpens++;
    this.emit('open');
    console.log(`⚡ Circuit breaker OPENED after ${this.failureCount} failures`);
  }

  // Reset circuit breaker
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.halfOpenCount = 0;
    this.stats.lastReset = Date.now();
    this.emit('closed');
    console.log('✅ Circuit breaker RESET to CLOSED state');
  }

  // Check if reset attempt can be made
  canAttemptReset() {
    return this.nextAttempt && Date.now() >= this.nextAttempt;
  }

  // Get current state
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      halfOpenCount: this.halfOpenCount,
      errorRate: this.getErrorRate(),
      recentVolume: this.getRecentVolume()
    };
  }

  // Get statistics
  getStats() {
    const now = Date.now();
    const uptime = now - this.stats.lastReset;
    const successRate = this.stats.totalRequests > 0
      ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2)
      : 100;

    return {
      ...this.stats,
      state: this.state,
      successRate: `${successRate}%`,
      uptime,
      failureCount: this.failureCount
    };
  }

  // Force reset (manual intervention)
  forceReset() {
    this.reset();
    console.log('🔧 Circuit breaker FORCE RESET');
  }

  // Force open (manual intervention)
  forceOpen() {
    this.trip();
    console.log('🔧 Circuit breaker FORCE OPENED');
  }

  // Record request for monitoring
  recordRequest(success) {
    const now = Date.now();
    this.requests.push({ timestamp: now, success });

    // Clean old requests (keep only last monitoring period)
    const cutoff = now - this.options.monitoringPeriod;
    this.requests = this.requests.filter(r => r.timestamp > cutoff);
  }

  // Get recent request volume
  getRecentVolume() {
    const now = Date.now();
    const cutoff = now - this.options.monitoringPeriod;
    return this.requests.filter(r => r.timestamp > cutoff).length;
  }

  // Get error rate percentage
  getErrorRate() {
    if (this.requests.length === 0) {
      return 0;
    }
    const failures = this.requests.filter(r => !r.success).length;
    return (failures / this.requests.length) * 100;
  }

  // Health check
  healthCheck() {
    const stats = this.getStats();
    return {
      healthy: this.state !== 'OPEN',
      state: this.state,
      successRate: stats.successRate,
      failureCount: this.failureCount,
      errorRate: this.getErrorRate()
    };
  }
}

// Circuit breaker registry for multiple services
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
    this.defaultOptions = {
      failureThreshold: 5,
      resetTimeout: 60000,
      timeout: 5000
    };
  }

  // Get or create circuit breaker for service
  getBreaker(serviceName, options = {}) {
    if (!this.breakers.has(serviceName)) {
      const breakerOptions = { ...this.defaultOptions, ...options };
      const breaker = new CircuitBreaker(breakerOptions);

      // Setup logging
      breaker.on('open', () => {
        console.log(`🚨 Circuit breaker OPEN for service: ${serviceName}`);
      });

      breaker.on('halfOpen', () => {
        console.log(`🔄 Circuit breaker HALF-OPEN for service: ${serviceName}`);
      });

      breaker.on('closed', () => {
        console.log(`✅ Circuit breaker CLOSED for service: ${serviceName}`);
      });

      this.breakers.set(serviceName, breaker);
    }

    return this.breakers.get(serviceName);
  }

  // Execute function with circuit breaker
  async execute(serviceName, fn, options = {}) {
    const breaker = this.getBreaker(serviceName, options);
    return breaker.execute(fn);
  }

  // Get all breaker states
  getAllStates() {
    const states = {};
    for (const [name, breaker] of this.breakers) {
      states[name] = breaker.getState();
    }
    return states;
  }

  // Get all breaker stats
  getAllStats() {
    const stats = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  // Reset all circuit breakers
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    console.log('🔄 All circuit breakers reset');
  }

  // Health check for all breakers
  healthCheck() {
    const health = {};
    let allHealthy = true;

    for (const [name, breaker] of this.breakers) {
      health[name] = breaker.healthCheck();
      if (!health[name].healthy) {
        allHealthy = false;
      }
    }

    return {
      healthy: allHealthy,
      services: health,
      count: this.breakers.size
    };
  }
}

// Create global registry
const circuitBreakerRegistry = new CircuitBreakerRegistry();

// Convenience functions for common services
const withCircuitBreaker = {
  database: (fn, options = {}) => {
    return circuitBreakerRegistry.execute('database', fn, {
      failureThreshold: 3,
      resetTimeout: 30000,
      timeout: 5000,
      ...options
    });
  },

  api: (fn, options = {}) => {
    return circuitBreakerRegistry.execute('api', fn, {
      failureThreshold: 5,
      resetTimeout: 60000,
      timeout: 10000,
      ...options
    });
  },

  websocket: (fn, options = {}) => {
    return circuitBreakerRegistry.execute('websocket', fn, {
      failureThreshold: 3,
      resetTimeout: 30000,
      timeout: 3000,
      ...options
    });
  },

  cache: (fn, options = {}) => {
    return circuitBreakerRegistry.execute('cache', fn, {
      failureThreshold: 10,
      resetTimeout: 15000,
      timeout: 1000,
      ...options
    });
  },

  external: (serviceName, fn, options = {}) => {
    return circuitBreakerRegistry.execute(`external_${serviceName}`, fn, {
      failureThreshold: 3,
      resetTimeout: 120000,
      timeout: 15000,
      ...options
    });
  }
};

module.exports = {
  CircuitBreaker,
  CircuitBreakerRegistry,
  circuitBreakerRegistry,
  withCircuitBreaker
};