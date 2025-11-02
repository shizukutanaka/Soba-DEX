/**
 * Performance Benchmark Suite
 * Comprehensive benchmarking for security monitoring system
 *
 * Features:
 * - Security monitor performance
 * - Database query performance
 * - Redis cache performance
 * - Attack detection accuracy
 * - Memory usage profiling
 * - Concurrent request handling
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

class PerformanceBenchmark {
  constructor(config = {}) {
    this.config = {
      baseURL: config.baseURL || 'http://localhost:3000',
      iterations: config.iterations || 1000,
      concurrency: config.concurrency || 10,
      warmupIterations: config.warmupIterations || 100,
      ...config
    };

    this.results = {
      tests: [],
      summary: {},
      startTime: null,
      endTime: null
    };
  }

  /**
   * Run all benchmarks
   */
  async runAll() {
    console.log('🚀 Starting Performance Benchmark Suite\n');
    console.log(`Configuration:`);
    console.log(`  Base URL: ${this.config.baseURL}`);
    console.log(`  Iterations: ${this.config.iterations}`);
    console.log(`  Concurrency: ${this.config.concurrency}`);
    console.log(`  Warmup Iterations: ${this.config.warmupIterations}\n`);

    this.results.startTime = Date.now();

    // Run warmup
    await this.warmup();

    // Run individual benchmarks
    await this.benchmarkHealthCheck();
    await this.benchmarkStatistics();
    await this.benchmarkEventRetrieval();
    await this.benchmarkEventCreation();
    await this.benchmarkThreatDetection();
    await this.benchmarkRateLimiting();
    await this.benchmarkDatabaseQueries();
    await this.benchmarkCacheOperations();
    await this.benchmarkConcurrentRequests();
    await this.benchmarkMemoryUsage();

    this.results.endTime = Date.now();
    this.calculateSummary();
    this.printResults();

    return this.results;
  }

  /**
   * Warmup phase
   */
  async warmup() {
    console.log('⏳ Warming up...');
    const start = performance.now();

    for (let i = 0; i < this.config.warmupIterations; i++) {
      try {
        await axios.get(`${this.config.baseURL}/health`);
      } catch (error) {
        // Ignore warmup errors
      }
    }

    const duration = performance.now() - start;
    console.log(`✅ Warmup complete (${duration.toFixed(2)}ms)\n`);
  }

  /**
   * Benchmark health check endpoint
   */
  async benchmarkHealthCheck() {
    console.log('📊 Benchmarking: Health Check');
    const timings = [];

    for (let i = 0; i < this.config.iterations; i++) {
      const start = performance.now();
      try {
        await axios.get(`${this.config.baseURL}/health`);
        const duration = performance.now() - start;
        timings.push(duration);
      } catch (error) {
        timings.push(null); // Mark as failed
      }
    }

    this.recordResult('Health Check', timings);
  }

  /**
   * Benchmark statistics endpoint
   */
  async benchmarkStatistics() {
    console.log('📊 Benchmarking: Statistics Retrieval');
    const timings = [];

    for (let i = 0; i < this.config.iterations; i++) {
      const start = performance.now();
      try {
        await axios.get(`${this.config.baseURL}/api/stats`);
        const duration = performance.now() - start;
        timings.push(duration);
      } catch (error) {
        timings.push(null);
      }
    }

    this.recordResult('Statistics', timings);
  }

  /**
   * Benchmark event retrieval
   */
  async benchmarkEventRetrieval() {
    console.log('📊 Benchmarking: Event Retrieval');
    const timings = [];
    const limits = [10, 50, 100, 500];

    for (const limit of limits) {
      const limitTimings = [];
      const iterations = Math.floor(this.config.iterations / limits.length);

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        try {
          await axios.get(`${this.config.baseURL}/api/events?limit=${limit}`);
          const duration = performance.now() - start;
          limitTimings.push(duration);
        } catch (error) {
          limitTimings.push(null);
        }
      }

      this.recordResult(`Event Retrieval (limit=${limit})`, limitTimings);
    }
  }

  /**
   * Benchmark event creation
   */
  async benchmarkEventCreation() {
    console.log('📊 Benchmarking: Event Creation');
    const timings = [];

    for (let i = 0; i < this.config.iterations; i++) {
      const start = performance.now();
      try {
        await axios.post(`${this.config.baseURL}/api/events`, {
          type: 'SQL_INJECTION',
          ip: `192.168.1.${(i % 254) + 1}`,
          userAgent: 'Benchmark/1.0',
          url: '/test',
          method: 'GET',
          details: { benchmark: true }
        });
        const duration = performance.now() - start;
        timings.push(duration);
      } catch (error) {
        timings.push(null);
      }
    }

    this.recordResult('Event Creation', timings);
  }

  /**
   * Benchmark threat detection
   */
  async benchmarkThreatDetection() {
    console.log('📊 Benchmarking: Threat Detection');

    const attackPayloads = [
      { type: 'SQL Injection', url: '/test?id=1 OR 1=1' },
      { type: 'XSS', url: '/test?name=<script>alert(1)</script>' },
      { type: 'Path Traversal', url: '/test?file=../../etc/passwd' },
      { type: 'LDAP Injection', url: '/test?filter=admin)(uid=*' },
      { type: 'NoSQL Injection', data: { username: { "$ne": null } } }
    ];

    for (const attack of attackPayloads) {
      const timings = [];
      const iterations = Math.floor(this.config.iterations / attackPayloads.length);

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        try {
          if (attack.url) {
            await axios.get(`${this.config.baseURL}${attack.url}`);
          } else {
            await axios.post(`${this.config.baseURL}/test`, attack.data);
          }
          const duration = performance.now() - start;
          timings.push(duration);
        } catch (error) {
          const duration = performance.now() - start;
          timings.push(duration); // Include detection time even if blocked
        }
      }

      this.recordResult(`Threat Detection (${attack.type})`, timings);
    }
  }

  /**
   * Benchmark rate limiting
   */
  async benchmarkRateLimiting() {
    console.log('📊 Benchmarking: Rate Limiting');
    const timings = [];
    const ip = '10.0.0.1';

    // Rapid requests from same IP to trigger rate limiting
    for (let i = 0; i < 200; i++) {
      const start = performance.now();
      try {
        await axios.get(`${this.config.baseURL}/api/test/normal`, {
          headers: { 'X-Forwarded-For': ip }
        });
        const duration = performance.now() - start;
        timings.push({ duration, blocked: false });
      } catch (error) {
        const duration = performance.now() - start;
        const blocked = error.response?.status === 429;
        timings.push({ duration, blocked });
      }
    }

    const blockedCount = timings.filter(t => t.blocked).length;
    const avgDuration = timings.reduce((sum, t) => sum + t.duration, 0) / timings.length;

    console.log(`  Blocked: ${blockedCount}/${timings.length} (${((blockedCount / timings.length) * 100).toFixed(1)}%)`);
    console.log(`  Avg duration: ${avgDuration.toFixed(2)}ms\n`);

    this.results.tests.push({
      name: 'Rate Limiting',
      totalRequests: timings.length,
      blockedRequests: blockedCount,
      blockRate: (blockedCount / timings.length) * 100,
      avgDuration
    });
  }

  /**
   * Benchmark database queries
   */
  async benchmarkDatabaseQueries() {
    console.log('📊 Benchmarking: Database Queries');

    const queries = [
      { name: 'Simple Select', params: { limit: 10 } },
      { name: 'Filtered Select', params: { type: 'SQL_INJECTION', limit: 100 } },
      { name: 'Range Query', params: { startTime: Date.now() - 86400000, endTime: Date.now(), limit: 500 } },
      { name: 'Aggregation', params: { groupBy: 'type' } }
    ];

    for (const query of queries) {
      const timings = [];
      const iterations = Math.floor(this.config.iterations / queries.length);

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        try {
          const params = new URLSearchParams(query.params);
          await axios.get(`${this.config.baseURL}/api/events?${params}`);
          const duration = performance.now() - start;
          timings.push(duration);
        } catch (error) {
          timings.push(null);
        }
      }

      this.recordResult(`DB Query (${query.name})`, timings);
    }
  }

  /**
   * Benchmark cache operations
   */
  async benchmarkCacheOperations() {
    console.log('📊 Benchmarking: Cache Operations');

    // Test cache statistics retrieval
    const timings = [];

    for (let i = 0; i < this.config.iterations; i++) {
      const start = performance.now();
      try {
        await axios.get(`${this.config.baseURL}/api/cache/stats`);
        const duration = performance.now() - start;
        timings.push(duration);
      } catch (error) {
        timings.push(null);
      }
    }

    this.recordResult('Cache Stats', timings);

    // Test blacklist operations
    const blacklistTimings = [];

    for (let i = 0; i < Math.floor(this.config.iterations / 10); i++) {
      const ip = `10.0.${Math.floor(i / 254)}.${(i % 254) + 1}`;
      const start = performance.now();
      try {
        // Add to blacklist
        await axios.post(`${this.config.baseURL}/api/cache/blacklist`, {
          ip,
          reason: 'Benchmark test',
          durationSeconds: 60
        });
        // Remove from blacklist
        await axios.delete(`${this.config.baseURL}/api/cache/blacklist/${ip}`);
        const duration = performance.now() - start;
        blacklistTimings.push(duration);
      } catch (error) {
        blacklistTimings.push(null);
      }
    }

    this.recordResult('Blacklist Operations', blacklistTimings);
  }

  /**
   * Benchmark concurrent requests
   */
  async benchmarkConcurrentRequests() {
    console.log('📊 Benchmarking: Concurrent Requests');

    const concurrencyLevels = [10, 50, 100, 200];

    for (const concurrency of concurrencyLevels) {
      const timings = [];
      const iterations = Math.floor(this.config.iterations / concurrencyLevels.length);
      const batches = Math.ceil(iterations / concurrency);

      for (let batch = 0; batch < batches; batch++) {
        const start = performance.now();
        const promises = [];

        for (let i = 0; i < concurrency; i++) {
          promises.push(
            axios.get(`${this.config.baseURL}/health`)
              .catch(error => error)
          );
        }

        await Promise.all(promises);
        const duration = performance.now() - start;
        timings.push(duration / concurrency); // Average per request
      }

      this.recordResult(`Concurrent Requests (${concurrency})`, timings);
    }
  }

  /**
   * Benchmark memory usage
   */
  async benchmarkMemoryUsage() {
    console.log('📊 Benchmarking: Memory Usage');

    const memorySnapshots = [];

    // Take memory snapshot before
    const before = await this.getMemoryUsage();
    memorySnapshots.push({ point: 'Before', ...before });

    // Generate load
    console.log('  Generating load...');
    for (let i = 0; i < 1000; i++) {
      try {
        await axios.post(`${this.config.baseURL}/api/events`, {
          type: 'SQL_INJECTION',
          ip: `192.168.${Math.floor(i / 254)}.${(i % 254) + 1}`,
          userAgent: 'MemoryTest/1.0',
          url: '/test',
          method: 'GET'
        });

        if (i % 250 === 0) {
          const snapshot = await this.getMemoryUsage();
          memorySnapshots.push({ point: `After ${i}`, ...snapshot });
        }
      } catch (error) {
        // Continue on error
      }
    }

    // Take memory snapshot after
    const after = await this.getMemoryUsage();
    memorySnapshots.push({ point: 'After', ...after });

    // Calculate memory growth
    const memoryGrowth = after.used - before.used;
    const percentageGrowth = (memoryGrowth / before.used) * 100;

    console.log(`  Memory Before: ${this.formatBytes(before.used)}`);
    console.log(`  Memory After: ${this.formatBytes(after.used)}`);
    console.log(`  Growth: ${this.formatBytes(memoryGrowth)} (${percentageGrowth.toFixed(2)}%)\n`);

    this.results.tests.push({
      name: 'Memory Usage',
      snapshots: memorySnapshots,
      growth: memoryGrowth,
      percentageGrowth
    });
  }

  /**
   * Get memory usage from API
   */
  async getMemoryUsage() {
    try {
      const response = await axios.get(`${this.config.baseURL}/api/stats`);
      return response.data.memoryUsage || { used: 0, total: 0, percentage: 0 };
    } catch (error) {
      return { used: 0, total: 0, percentage: 0 };
    }
  }

  /**
   * Record benchmark result
   */
  recordResult(name, timings) {
    const validTimings = timings.filter(t => t !== null);
    const failedCount = timings.length - validTimings.length;

    if (validTimings.length === 0) {
      console.log(`  ❌ All requests failed\n`);
      return;
    }

    const sorted = validTimings.sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    const stats = {
      name,
      iterations: timings.length,
      successful: validTimings.length,
      failed: failedCount,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / validTimings.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      throughput: (1000 / (sum / validTimings.length)).toFixed(2)
    };

    this.results.tests.push(stats);

    console.log(`  Min: ${stats.min.toFixed(2)}ms`);
    console.log(`  Max: ${stats.max.toFixed(2)}ms`);
    console.log(`  Mean: ${stats.mean.toFixed(2)}ms`);
    console.log(`  Median: ${stats.median.toFixed(2)}ms`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
    console.log(`  P99: ${stats.p99.toFixed(2)}ms`);
    console.log(`  Throughput: ${stats.throughput} req/s`);
    if (failedCount > 0) {
      console.log(`  ⚠️  Failed: ${failedCount}/${timings.length}`);
    }
    console.log('');
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary() {
    const totalDuration = this.results.endTime - this.results.startTime;
    const successfulTests = this.results.tests.filter(t => !t.failed || t.successful > 0);
    const failedTests = this.results.tests.length - successfulTests.length;

    const allMeans = this.results.tests
      .filter(t => t.mean)
      .map(t => t.mean);

    this.results.summary = {
      totalDuration,
      totalTests: this.results.tests.length,
      successfulTests: successfulTests.length,
      failedTests,
      avgResponseTime: allMeans.reduce((a, b) => a + b, 0) / allMeans.length,
      totalRequests: this.results.tests.reduce((sum, t) => sum + (t.iterations || 0), 0)
    };
  }

  /**
   * Print results
   */
  printResults() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                     BENCHMARK RESULTS                          ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('Summary:');
    console.log(`  Total Duration: ${this.results.summary.totalDuration}ms`);
    console.log(`  Total Tests: ${this.results.summary.totalTests}`);
    console.log(`  Successful: ${this.results.summary.successfulTests}`);
    console.log(`  Failed: ${this.results.summary.failedTests}`);
    console.log(`  Avg Response Time: ${this.results.summary.avgResponseTime.toFixed(2)}ms`);
    console.log(`  Total Requests: ${this.results.summary.totalRequests}\n`);

    console.log('Top 10 Fastest Tests:');
    const sorted = [...this.results.tests]
      .filter(t => t.mean)
      .sort((a, b) => a.mean - b.mean)
      .slice(0, 10);

    sorted.forEach((test, i) => {
      console.log(`  ${i + 1}. ${test.name}: ${test.mean.toFixed(2)}ms`);
    });

    console.log('\nTop 10 Slowest Tests:');
    const slowest = [...this.results.tests]
      .filter(t => t.mean)
      .sort((a, b) => b.mean - a.mean)
      .slice(0, 10);

    slowest.forEach((test, i) => {
      console.log(`  ${i + 1}. ${test.name}: ${test.mean.toFixed(2)}ms`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════\n');
  }

  /**
   * Format bytes to human-readable
   */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
  }

  /**
   * Export results to JSON
   */
  exportResults(filename = 'benchmark-results.json') {
    const fs = require('fs');
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(`📁 Results exported to ${filename}`);
  }
}

// Run benchmark if executed directly
if (require.main === module) {
  const benchmark = new PerformanceBenchmark({
    baseURL: process.env.BENCHMARK_URL || 'http://localhost:3000',
    iterations: parseInt(process.env.BENCHMARK_ITERATIONS) || 1000,
    concurrency: parseInt(process.env.BENCHMARK_CONCURRENCY) || 10,
    warmupIterations: parseInt(process.env.BENCHMARK_WARMUP) || 100
  });

  benchmark.runAll()
    .then(results => {
      benchmark.exportResults();
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    });
}

module.exports = PerformanceBenchmark;
