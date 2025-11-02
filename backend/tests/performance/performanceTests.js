// ============================================================================
// Performance Benchmark Tests
// Comprehensive performance testing and benchmarking
// ============================================================================

const axios = require('axios');
const { performance } = require('perf_hooks');
const os = require('os');

/**
 * Performance Test Suite
 *
 * Tests:
 * - Throughput benchmarks
 * - Latency percentiles (P50, P95, P99)
 * - Concurrent request handling
 * - Memory usage under load
 * - Cache efficiency
 * - Database query performance
 * - API endpoint response times
 * - Resource utilization
 */
class PerformanceTests {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      warmupRequests: config.warmupRequests || 100,
      testDuration: config.testDuration || 60000, // 60 seconds
      concurrencyLevels: config.concurrencyLevels || [1, 10, 50, 100, 200],
      ...config
    };

    this.results = {
      throughput: [],
      latency: [],
      memory: [],
      cache: [],
      endpoints: []
    };
  }

  /**
   * Run all performance tests
   */
  async runAllTests() {
    console.log('=== Starting Performance Benchmark Tests ===\n');

    // Warmup
    await this.warmup();

    // Run tests
    await this.testThroughput();
    await this.testLatencyPercentiles();
    await this.testConcurrentRequests();
    await this.testMemoryUsage();
    await this.testCacheEfficiency();
    await this.testEndpointPerformance();
    await this.testDatabasePerformance();
    await this.testResourceUtilization();

    console.log('\n=== Performance Benchmark Tests Complete ===');
    this.printSummary();
  }

  /**
   * Warmup phase to stabilize system
   */
  async warmup() {
    console.log(`Warmup: Sending ${this.config.warmupRequests} requests...\n`);

    const requests = [];
    for (let i = 0; i < this.config.warmupRequests; i++) {
      requests.push(
        axios.get(`${this.config.baseUrl}/health`, {
          validateStatus: () => true
        }).catch(() => {})
      );
    }

    await Promise.all(requests);
    console.log('Warmup completed\n');
  }

  /**
   * Test 1: Throughput benchmark
   */
  async testThroughput() {
    console.log('Test 1: Throughput Benchmark');
    console.log(`Testing maximum throughput for ${this.config.testDuration}ms...\n`);

    const startTime = Date.now();
    const endTime = startTime + this.config.testDuration;
    let requestCount = 0;
    let successCount = 0;
    let errorCount = 0;

    const workers = [];
    const workerCount = 10;

    // Spawn workers to send requests continuously
    for (let i = 0; i < workerCount; i++) {
      workers.push(this.throughputWorker(endTime, (success) => {
        requestCount++;
        if (success) successCount++;
        else errorCount++;
      }));
    }

    await Promise.all(workers);

    const duration = (Date.now() - startTime) / 1000;
    const throughput = requestCount / duration;
    const successRate = (successCount / requestCount) * 100;

    this.results.throughput.push({
      requestsPerSecond: throughput.toFixed(2),
      totalRequests: requestCount,
      successCount,
      errorCount,
      successRate: successRate.toFixed(2),
      duration: duration.toFixed(2)
    });

    console.log(` Throughput: ${throughput.toFixed(2)} req/s`);
    console.log(`   Total Requests: ${requestCount}`);
    console.log(`   Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`   Duration: ${duration.toFixed(2)}s\n`);
  }

  /**
   * Throughput worker
   */
  async throughputWorker(endTime, callback) {
    while (Date.now() < endTime) {
      try {
        const response = await axios.get(`${this.config.baseUrl}/health`, {
          timeout: 5000,
          validateStatus: () => true
        });
        callback(response.status === 200);
      } catch (error) {
        callback(false);
      }
    }
  }

  /**
   * Test 2: Latency percentiles
   */
  async testLatencyPercentiles() {
    console.log('Test 2: Latency Percentiles');
    console.log('Measuring P50, P95, P99 latencies...\n');

    const measurements = [];
    const sampleSize = 1000;

    for (let i = 0; i < sampleSize; i++) {
      const start = performance.now();
      try {
        await axios.get(`${this.config.baseUrl}/health`, { timeout: 10000 });
        measurements.push(performance.now() - start);
      } catch (error) {
        // Record timeout as max latency
        measurements.push(10000);
      }
    }

    measurements.sort((a, b) => a - b);

    const p50 = measurements[Math.floor(sampleSize * 0.50)];
    const p95 = measurements[Math.floor(sampleSize * 0.95)];
    const p99 = measurements[Math.floor(sampleSize * 0.99)];
    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const min = measurements[0];
    const max = measurements[measurements.length - 1];

    this.results.latency.push({
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      p99: p99.toFixed(2),
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2)
    });

    console.log(` Latency Percentiles:`);
    console.log(`   P50: ${p50.toFixed(2)}ms`);
    console.log(`   P95: ${p95.toFixed(2)}ms`);
    console.log(`   P99: ${p99.toFixed(2)}ms`);
    console.log(`   Avg: ${avg.toFixed(2)}ms`);
    console.log(`   Min: ${min.toFixed(2)}ms`);
    console.log(`   Max: ${max.toFixed(2)}ms\n`);
  }

  /**
   * Test 3: Concurrent request handling
   */
  async testConcurrentRequests() {
    console.log('Test 3: Concurrent Request Handling');
    console.log('Testing different concurrency levels...\n');

    for (const concurrency of this.config.concurrencyLevels) {
      console.log(`Testing with ${concurrency} concurrent requests...`);

      const requests = Array(concurrency).fill(null).map(() => ({
        type: 'XSS',
        ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        url: '/test',
        userAgent: 'PerformanceTest/1.0'
      }));

      const start = performance.now();
      const responses = await Promise.all(
        requests.map(req =>
          axios.post(`${this.config.baseUrl}/api/events`, req, {
            validateStatus: () => true,
            timeout: 30000
          }).catch(() => ({ status: 0 }))
        )
      );
      const duration = performance.now() - start;

      const successCount = responses.filter(r => r.status >= 200 && r.status < 400).length;
      const successRate = (successCount / concurrency) * 100;
      const avgLatency = duration / concurrency;

      console.log(`   Success Rate: ${successRate.toFixed(2)}%`);
      console.log(`   Total Duration: ${duration.toFixed(2)}ms`);
      console.log(`   Avg Latency: ${avgLatency.toFixed(2)}ms\n`);
    }
  }

  /**
   * Test 4: Memory usage under load
   */
  async testMemoryUsage() {
    console.log('Test 4: Memory Usage Under Load');
    console.log('Monitoring memory usage during load test...\n');

    const memorySnapshots = [];

    // Record initial memory
    const initialMemory = process.memoryUsage();
    memorySnapshots.push({
      time: 0,
      ...initialMemory
    });

    // Generate load
    const loadDuration = 30000; // 30 seconds
    const startTime = Date.now();

    const loadTest = async () => {
      while (Date.now() - startTime < loadDuration) {
        const promises = [];
        for (let i = 0; i < 50; i++) {
          promises.push(
            axios.post(`${this.config.baseUrl}/api/events`, {
              type: 'SQL_INJECTION',
              ip: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
              url: '/test',
              payload: 'x'.repeat(1000)
            }, {
              validateStatus: () => true
            }).catch(() => {})
          );
        }
        await Promise.all(promises);

        // Record memory snapshot
        memorySnapshots.push({
          time: Date.now() - startTime,
          ...process.memoryUsage()
        });

        await this.sleep(1000);
      }
    };

    await loadTest();

    // Record final memory
    const finalMemory = process.memoryUsage();
    memorySnapshots.push({
      time: loadDuration,
      ...finalMemory
    });

    // Analyze memory growth
    const heapGrowth = ((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2);
    const maxHeap = Math.max(...memorySnapshots.map(s => s.heapUsed)) / 1024 / 1024;

    this.results.memory.push({
      initialHeap: (initialMemory.heapUsed / 1024 / 1024).toFixed(2),
      finalHeap: (finalMemory.heapUsed / 1024 / 1024).toFixed(2),
      heapGrowth,
      maxHeap: maxHeap.toFixed(2)
    });

    console.log(` Memory Usage:`);
    console.log(`   Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Heap Growth: ${heapGrowth} MB`);
    console.log(`   Max Heap: ${maxHeap.toFixed(2)} MB\n`);
  }

  /**
   * Test 5: Cache efficiency
   */
  async testCacheEfficiency() {
    console.log('Test 5: Cache Efficiency');
    console.log('Testing cache hit rates and performance...\n');

    const testIP = '8.8.8.8';

    // First request (cache miss)
    const miss1 = performance.now();
    await axios.get(`${this.config.baseUrl}/api/threat-intelligence/check/${testIP}`, {
      validateStatus: () => true
    }).catch(() => {});
    const missTime = performance.now() - miss1;

    // Second request (cache hit)
    const hit1 = performance.now();
    await axios.get(`${this.config.baseUrl}/api/threat-intelligence/check/${testIP}`, {
      validateStatus: () => true
    }).catch(() => {});
    const hitTime = performance.now() - hit1;

    // Multiple cached requests
    const cachedRequests = [];
    const cacheStart = performance.now();
    for (let i = 0; i < 100; i++) {
      cachedRequests.push(
        axios.get(`${this.config.baseUrl}/api/threat-intelligence/check/${testIP}`, {
          validateStatus: () => true
        }).catch(() => {})
      );
    }
    await Promise.all(cachedRequests);
    const avgCachedTime = (performance.now() - cacheStart) / 100;

    const speedup = (missTime / hitTime).toFixed(2);

    this.results.cache.push({
      cacheMissTime: missTime.toFixed(2),
      cacheHitTime: hitTime.toFixed(2),
      avgCachedTime: avgCachedTime.toFixed(2),
      speedup
    });

    console.log(` Cache Efficiency:`);
    console.log(`   Cache Miss Time: ${missTime.toFixed(2)}ms`);
    console.log(`   Cache Hit Time: ${hitTime.toFixed(2)}ms`);
    console.log(`   Avg Cached Time: ${avgCachedTime.toFixed(2)}ms`);
    console.log(`   Speedup: ${speedup}x\n`);
  }

  /**
   * Test 6: Endpoint performance
   */
  async testEndpointPerformance() {
    console.log('Test 6: Endpoint Performance');
    console.log('Benchmarking all API endpoints...\n');

    const endpoints = [
      { method: 'GET', path: '/health', name: 'Health Check' },
      { method: 'GET', path: '/api/events', name: 'List Events' },
      { method: 'POST', path: '/api/events', name: 'Create Event', data: { type: 'XSS', ip: '1.2.3.4' } },
      { method: 'GET', path: '/api/incidents', name: 'List Incidents' },
      { method: 'GET', path: '/metrics', name: 'Prometheus Metrics' },
      { method: 'POST', path: '/api/ml/predict', name: 'ML Prediction', data: { features: { requestRate: 10 } } },
      // A/B Testing endpoints
      { method: 'POST', path: '/api/ab-testing/experiments', name: 'Create AB Experiment', data: { name: 'Test Exp', variants: [{ name: 'A' }, { name: 'B' }] } },
      { method: 'GET', path: '/api/ab-testing/experiments', name: 'List AB Experiments' },
      { method: 'POST', path: '/api/ab-testing/assign', name: 'AB User Assignment', data: { experimentId: 'test', userId: 'user123' } },
      { method: 'POST', path: '/api/ab-testing/events', name: 'Track AB Event', data: { experimentId: 'test', variantId: 'A', userId: 'user123', eventType: 'impression' } },
      { method: 'GET', path: '/api/ab-testing/experiments/test/results', name: 'Get AB Results' }
    ];

    for (const endpoint of endpoints) {
      const measurements = [];

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        try {
          if (endpoint.method === 'GET') {
            await axios.get(`${this.config.baseUrl}${endpoint.path}`, {
              validateStatus: () => true,
              timeout: 10000
            });
          } else {
            await axios.post(`${this.config.baseUrl}${endpoint.path}`, endpoint.data, {
              validateStatus: () => true,
              timeout: 10000
            });
          }
          measurements.push(performance.now() - start);
        } catch (error) {
          measurements.push(10000);
        }
      }

      measurements.sort((a, b) => a - b);
      const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95 = measurements[Math.floor(measurements.length * 0.95)];

      this.results.endpoints.push({
        name: endpoint.name,
        method: endpoint.method,
        path: endpoint.path,
        avg: avg.toFixed(2),
        p95: p95.toFixed(2)
      });

      console.log(`   ${endpoint.name} (${endpoint.method} ${endpoint.path})`);
      console.log(`      Avg: ${avg.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms`);
    }
    console.log();
  }

  /**
   * Test 7: Database performance
   */
  async testDatabasePerformance() {
    console.log('Test 7: Database Performance');
    console.log('Testing database query performance...\n');

    // Create many events to test query performance
    const createStart = performance.now();
    const createPromises = [];
    for (let i = 0; i < 100; i++) {
      createPromises.push(
        axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'SQL_INJECTION',
          ip: `192.168.${Math.floor(i / 255)}.${i % 255}`,
          url: '/test'
        }, {
          validateStatus: () => true
        }).catch(() => {})
      );
    }
    await Promise.all(createPromises);
    const createTime = (performance.now() - createStart) / 100;

    // Test read performance
    const readStart = performance.now();
    const readPromises = [];
    for (let i = 0; i < 50; i++) {
      readPromises.push(
        axios.get(`${this.config.baseUrl}/api/events?limit=100`, {
          validateStatus: () => true
        }).catch(() => {})
      );
    }
    await Promise.all(readPromises);
    const readTime = (performance.now() - readStart) / 50;

    console.log(` Database Performance:`);
    console.log(`   Avg Write Time: ${createTime.toFixed(2)}ms`);
    console.log(`   Avg Read Time: ${readTime.toFixed(2)}ms\n`);
  }

  /**
   * Test 8: Resource utilization
   */
  async testResourceUtilization() {
    console.log('Test 8: Resource Utilization');
    console.log('Monitoring system resources...\n');

    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = (usedMem / totalMem) * 100;

    console.log(` Resource Utilization:`);
    console.log(`   Uptime: ${uptime.toFixed(2)}s`);
    console.log(`   CPU User: ${(cpuUsage.user / 1000000).toFixed(2)}s`);
    console.log(`   CPU System: ${(cpuUsage.system / 1000000).toFixed(2)}s`);
    console.log(`   Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   System Memory: ${memUsagePercent.toFixed(2)}% (${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB)\n`);
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n==========================================');
    console.log('Performance Test Summary');
    console.log('==========================================\n');

    if (this.results.throughput.length > 0) {
      const t = this.results.throughput[0];
      console.log('Throughput:');
      console.log(`  ${t.requestsPerSecond} req/s (${t.successRate}% success rate)`);
      console.log();
    }

    if (this.results.latency.length > 0) {
      const l = this.results.latency[0];
      console.log('Latency:');
      console.log(`  P50: ${l.p50}ms, P95: ${l.p95}ms, P99: ${l.p99}ms`);
      console.log();
    }

    if (this.results.memory.length > 0) {
      const m = this.results.memory[0];
      console.log('Memory:');
      console.log(`  Heap Growth: ${m.heapGrowth} MB (max: ${m.maxHeap} MB)`);
      console.log();
    }

    if (this.results.cache.length > 0) {
      const c = this.results.cache[0];
      console.log('Cache:');
      console.log(`  ${c.speedup}x speedup (miss: ${c.cacheMissTime}ms, hit: ${c.cacheHitTime}ms)`);
      console.log();
    }

    console.log('==========================================\n');
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
  const tests = new PerformanceTests({
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    testDuration: parseInt(process.env.TEST_DURATION) || 60000
  });

  tests.runAllTests()
    .then(() => {
      console.log('Performance tests completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Performance tests failed:', error);
      process.exit(1);
    });
}

module.exports = PerformanceTests;
