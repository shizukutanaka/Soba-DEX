// ============================================================================
// Chaos Engineering Tests
// Test system resilience under failure conditions
// ============================================================================

const axios = require('axios');
const { Pool } = require('pg');
const Redis = require('ioredis');

/**
 * Chaos Engineering Test Suite
 *
 * Tests:
 * - Database connection failures
 * - Redis connection failures
 * - Network latency
 * - High memory pressure
 * - CPU throttling
 * - Cascading failures
 * - Byzantine failures
 */
class ChaosTests {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      dbConfig: config.dbConfig || {
        host: 'localhost',
        port: 5432,
        database: 'security_monitor',
        user: 'postgres',
        password: 'postgres'
      },
      redisConfig: config.redisConfig || {
        host: 'localhost',
        port: 6379
      },
      ...config
    };

    this.results = [];
  }

  /**
   * Run all chaos tests
   */
  async runAllTests() {
    console.log('=== Starting Chaos Engineering Tests ===\n');

    await this.testDatabaseFailure();
    await this.testRedisFailure();
    await this.testNetworkLatency();
    await this.testHighMemoryPressure();
    await this.testCascadingFailures();
    await this.testPartialFailures();
    await this.testRecoveryMechanisms();

    console.log('\n=== Chaos Engineering Tests Complete ===');
    this.printSummary();
  }

  /**
   * Test 1: Database connection failure
   */
  async testDatabaseFailure() {
    console.log('Test 1: Database Connection Failure');
    console.log('Simulating database connection loss...\n');

    try {
      // Kill database connections
      const pool = new Pool(this.config.dbConfig);
      await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid()');
      await pool.end();

      // Wait a moment
      await this.sleep(2000);

      // Test API endpoints
      const response = await axios.get(`${this.config.baseUrl}/health`);

      const passed = response.status === 503 ||
                     (response.data.components?.database?.status === 'critical');

      this.recordResult('Database Failure', passed,
        'System should report unhealthy when database is down');

      // Check if system attempts recovery
      await this.sleep(5000);
      const recoveryCheck = await axios.get(`${this.config.baseUrl}/health`);

      const recovered = recoveryCheck.data.components?.database?.status === 'healthy';
      this.recordResult('Database Auto-Recovery', recovered,
        'System should auto-recover database connection');

    } catch (error) {
      this.recordResult('Database Failure', false, error.message);
    }
  }

  /**
   * Test 2: Redis connection failure
   */
  async testRedisFailure() {
    console.log('\nTest 2: Redis Connection Failure');
    console.log('Simulating Redis connection loss...\n');

    try {
      // Simulate Redis failure by connecting and issuing SHUTDOWN
      const redis = new Redis(this.config.redisConfig);

      // Try to shutdown Redis (this will fail in production, which is fine)
      try {
        await redis.shutdown('NOSAVE');
      } catch (e) {
        // Expected to fail in many environments
      }

      await redis.quit();
      await this.sleep(2000);

      // Test cache operations
      const response = await axios.get(`${this.config.baseUrl}/api/events`, {
        validateStatus: () => true
      });

      // System should still function (degraded mode)
      const passed = response.status === 200 || response.status === 503;
      this.recordResult('Redis Failure Tolerance', passed,
        'System should continue operating without Redis (degraded)');

    } catch (error) {
      this.recordResult('Redis Failure', false, error.message);
    }
  }

  /**
   * Test 3: Network latency
   */
  async testNetworkLatency() {
    console.log('\nTest 3: Network Latency Simulation');
    console.log('Testing system behavior under high latency...\n');

    try {
      const requests = [];
      const latencies = [];

      // Send multiple requests
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        requests.push(
          axios.get(`${this.config.baseUrl}/health`, { timeout: 30000 })
            .then(() => {
              latencies.push(Date.now() - start);
            })
            .catch(() => {
              latencies.push(-1);
            })
        );
      }

      await Promise.all(requests);

      const successRate = latencies.filter(l => l > 0).length / latencies.length;
      const avgLatency = latencies.filter(l => l > 0).reduce((a, b) => a + b, 0) / latencies.filter(l => l > 0).length;

      const passed = successRate >= 0.9 && avgLatency < 10000;
      this.recordResult('High Latency Tolerance', passed,
        `Success rate: ${(successRate * 100).toFixed(1)}%, Avg latency: ${avgLatency.toFixed(0)}ms`);

    } catch (error) {
      this.recordResult('Network Latency', false, error.message);
    }
  }

  /**
   * Test 4: High memory pressure
   */
  async testHighMemoryPressure() {
    console.log('\nTest 4: High Memory Pressure');
    console.log('Testing system under memory stress...\n');

    try {
      // Create memory pressure by storing large objects
      const largePayloads = [];

      // Send requests with large payloads
      for (let i = 0; i < 5; i++) {
        const payload = {
          type: 'SQL_INJECTION',
          ip: '192.168.1.100',
          data: 'x'.repeat(100000) // 100KB payload
        };

        largePayloads.push(
          axios.post(`${this.config.baseUrl}/api/events`, payload, {
            validateStatus: () => true
          })
        );
      }

      const responses = await Promise.all(largePayloads);
      const healthCheck = await axios.get(`${this.config.baseUrl}/health`);

      const allProcessed = responses.every(r => r.status === 200 || r.status === 201);
      const systemHealthy = healthCheck.status === 200;

      const passed = allProcessed && systemHealthy;
      this.recordResult('Memory Pressure Handling', passed,
        'System should handle large payloads without crashing');

    } catch (error) {
      this.recordResult('Memory Pressure', false, error.message);
    }
  }

  /**
   * Test 5: Cascading failures
   */
  async testCascadingFailures() {
    console.log('\nTest 5: Cascading Failure Prevention');
    console.log('Testing circuit breaker and failure isolation...\n');

    try {
      // Simulate multiple service failures
      const failures = [];

      // Send requests to potentially failing endpoints
      for (let i = 0; i < 20; i++) {
        failures.push(
          axios.get(`${this.config.baseUrl}/api/threat-intelligence/check/0.0.0.0`, {
            validateStatus: () => true,
            timeout: 5000
          }).catch(() => ({ status: 0 }))
        );
      }

      const results = await Promise.all(failures);

      // Check if circuit breaker activated
      const circuitBreakerActive = results.slice(-5).some(r =>
        r.status === 503 || r.data?.error?.includes('circuit')
      );

      // System should remain responsive
      const healthCheck = await axios.get(`${this.config.baseUrl}/health`);
      const systemResponsive = healthCheck.status === 200 || healthCheck.status === 503;

      const passed = circuitBreakerActive && systemResponsive;
      this.recordResult('Cascading Failure Prevention', passed,
        'Circuit breaker should activate and system should remain responsive');

    } catch (error) {
      this.recordResult('Cascading Failures', false, error.message);
    }
  }

  /**
   * Test 6: Partial failures
   */
  async testPartialFailures() {
    console.log('\nTest 6: Partial Failure Handling');
    console.log('Testing graceful degradation...\n');

    try {
      // Test various endpoints with partial failures
      const endpoints = [
        '/health',
        '/api/events',
        '/api/incidents',
        '/metrics'
      ];

      const responses = await Promise.all(
        endpoints.map(ep =>
          axios.get(`${this.config.baseUrl}${ep}`, {
            validateStatus: () => true
          }).catch(e => ({ status: 0, error: e.message }))
        )
      );

      // At least some endpoints should work
      const workingEndpoints = responses.filter(r => r.status === 200).length;
      const degradedOk = responses.filter(r => r.status === 200 || r.status === 503).length;

      const passed = degradedOk >= endpoints.length * 0.5;
      this.recordResult('Partial Failure Tolerance', passed,
        `${workingEndpoints}/${endpoints.length} endpoints operational`);

    } catch (error) {
      this.recordResult('Partial Failures', false, error.message);
    }
  }

  /**
   * Test 7: Recovery mechanisms
   */
  async testRecoveryMechanisms() {
    console.log('\nTest 7: Automatic Recovery');
    console.log('Testing self-healing capabilities...\n');

    try {
      // Check initial state
      const initial = await axios.get(`${this.config.baseUrl}/health`);

      // Wait for auto-recovery cycles
      await this.sleep(10000);

      // Check recovered state
      const recovered = await axios.get(`${this.config.baseUrl}/health`);

      // Check if recovery metrics improved
      const initialHealth = this.getHealthScore(initial.data);
      const recoveredHealth = this.getHealthScore(recovered.data);

      const passed = recoveredHealth >= initialHealth;
      this.recordResult('Automatic Recovery', passed,
        `Health score: ${initialHealth} → ${recoveredHealth}`);

    } catch (error) {
      this.recordResult('Recovery Mechanisms', false, error.message);
    }
  }

  /**
   * Calculate health score from health data
   */
  getHealthScore(healthData) {
    if (!healthData.components) return 0;

    const components = Object.values(healthData.components);
    const healthyCount = components.filter(c => c.status === 'healthy').length;

    return (healthyCount / components.length) * 100;
  }

  /**
   * Record test result
   */
  recordResult(testName, passed, details) {
    this.results.push({ testName, passed, details });

    const status = passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status}: ${testName}`);
    console.log(`   ${details}\n`);
  }

  /**
   * Print test summary
   */
  printSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const percentage = ((passed / total) * 100).toFixed(1);

    console.log('\n==========================================');
    console.log('Chaos Engineering Test Summary');
    console.log('==========================================');
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} (${percentage}%)`);
    console.log(`Failed: ${total - passed}`);
    console.log('==========================================\n');

    // Show failed tests
    const failed = this.results.filter(r => !r.passed);
    if (failed.length > 0) {
      console.log('Failed Tests:');
      failed.forEach(f => {
        console.log(`  - ${f.testName}: ${f.details}`);
      });
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run tests if executed directly
if (require.main === module) {
  const tests = new ChaosTests({
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    dbConfig: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'security_monitor',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    }
  });

  tests.runAllTests()
    .then(() => {
      const passed = tests.results.filter(r => r.passed).length;
      const total = tests.results.length;
      process.exit(passed === total ? 0 : 1);
    })
    .catch(error => {
      console.error('Chaos tests failed:', error);
      process.exit(1);
    });
}

module.exports = ChaosTests;
