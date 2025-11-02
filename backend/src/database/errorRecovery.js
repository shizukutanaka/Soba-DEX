const { logger } = require('../services/logger');

class DatabaseErrorRecovery {
  constructor() {
    this.connectionPool = null;
    this.isInitialized = false;
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2
    };
    this.circuitBreaker = {
      failureThreshold: 5,
      timeout: 60000,
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failures: 0,
      nextAttempt: 0
    };
  }

  initialize() {
    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;
    logger.info('Database error recovery system initialized');
  }

  async executeWithRetry(operation, context = {}) {
    const { maxRetries = this.retryConfig.maxRetries } = context;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.circuitBreaker.state === 'OPEN') {
          if (Date.now() < this.circuitBreaker.nextAttempt) {
            throw new Error('Circuit breaker is OPEN');
          }
          this.circuitBreaker.state = 'HALF_OPEN';
        }

        const result = await operation();

        // Reset circuit breaker on success
        if (this.circuitBreaker.state === 'HALF_OPEN') {
          this.circuitBreaker.state = 'CLOSED';
          this.circuitBreaker.failures = 0;
        }

        return result;
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          this.handleCircuitBreaker(error);
          break;
        }

        if (this.isRetryableError(error)) {
          const delay = this.calculateDelay(attempt);
          logger.warn(
            `Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`,
            {
              error: error.message,
              context
            }
          );
          await this.sleep(delay);
        } else {
          // Non-retryable error, fail immediately
          break;
        }
      }
    }

    throw lastError;
  }

  isRetryableError(error) {
    const retryablePatterns = [
      /connection terminated/i,
      /connection refused/i,
      /timeout/i,
      /network error/i,
      /temporary failure/i,
      /deadlock/i,
      /lock timeout/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  calculateDelay(attempt) {
    const delay =
      this.retryConfig.baseDelay *
      Math.pow(this.retryConfig.backoffFactor, attempt - 1);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  handleCircuitBreaker() {
    this.circuitBreaker.failures++;

    if (this.circuitBreaker.failures >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      this.circuitBreaker.nextAttempt =
        Date.now() + this.circuitBreaker.timeout;

      logger.error('Database circuit breaker opened due to repeated failures', {
        failures: this.circuitBreaker.failures,
        nextAttempt: new Date(this.circuitBreaker.nextAttempt).toISOString()
      });
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async healthCheck() {
    if (!this.connectionPool) {
      return { status: 'unhealthy', message: 'No connection pool available' };
    }

    try {
      await this.executeWithRetry(async () => {
        const connection = await this.connectionPool.getConnection();
        await connection.query('SELECT 1');
        connection.release();
      });

      return {
        status: 'healthy',
        circuitBreaker: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        circuitBreaker: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures
      };
    }
  }

  reset() {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.nextAttempt = 0;
    logger.info('Database error recovery system reset');
  }

  getStats() {
    return {
      circuitBreaker: { ...this.circuitBreaker },
      retryConfig: { ...this.retryConfig },
      isInitialized: this.isInitialized
    };
  }
}

module.exports = new DatabaseErrorRecovery();
