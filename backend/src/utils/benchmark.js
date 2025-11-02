// SAND Performance Benchmark Tool
const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

class Benchmark {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3001';
    this.concurrent = options.concurrent || 10;
    this.requests = options.requests || 1000;
    this.timeout = options.timeout || 5000;
    this.verbose = options.verbose || false;

    this.results = {
      total: 0,
      success: 0,
      failed: 0,
      times: [],
      errors: [],
      startTime: null,
      endTime: null
    };
  }

  // Run single request
  async request(url, method = 'GET', data = null) {
    return new Promise((resolve, _reject) => {
      const startTime = performance.now();
      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;

      const options = {
        method,
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SAND-Benchmark/1.0'
        }
      };

      const req = client.request(url, options, (res) => {
        let body = '';

        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const endTime = performance.now();
          const duration = endTime - startTime;

          resolve({
            success: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            duration,
            size: Buffer.byteLength(body),
            headers: res.headers
          });
        });
      });

      req.on('error', (err) => {
        const endTime = performance.now();
        resolve({
          success: false,
          error: err.message,
          duration: endTime - startTime
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Timeout',
          duration: this.timeout
        });
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // Run concurrent requests
  async runConcurrent(url, count) {
    const promises = [];

    for (let i = 0; i < count; i++) {
      promises.push(this.request(url));
    }

    return await Promise.all(promises);
  }

  // Run benchmark test
  async run(endpoints = []) {
    console.log('[Benchmark] Starting test...');
    console.log(`[Config] Requests: ${this.requests}, Concurrent: ${this.concurrent}`);
    console.log(`[Target] ${this.baseUrl}\n`);

    this.results.startTime = Date.now();

    // Default endpoints
    if (endpoints.length === 0) {
      endpoints = [
        { path: '/health', method: 'GET' },
        { path: '/api/market', method: 'GET' },
        { path: '/api/book/ETH-USDT', method: 'GET' }
      ];
    }

    for (const endpoint of endpoints) {
      await this.testEndpoint(endpoint);
    }

    this.results.endTime = Date.now();

    return this.generateReport();
  }

  // Test single endpoint
  async testEndpoint(endpoint) {
    const url = this.baseUrl + endpoint.path;
    console.log(`\n[Testing] ${endpoint.method} ${endpoint.path}`);

    const batches = Math.ceil(this.requests / this.concurrent);
    const results = [];

    for (let i = 0; i < batches; i++) {
      const batchSize = Math.min(this.concurrent, this.requests - i * this.concurrent);

      if (this.verbose) {
        process.stdout.write(`\rProgress: ${i + 1}/${batches} batches`);
      }

      const batchResults = await this.runConcurrent(url, batchSize);
      results.push(...batchResults);
    }

    // Process results
    results.forEach(result => {
      this.results.total++;

      if (result.success) {
        this.results.success++;
        this.results.times.push(result.duration);
      } else {
        this.results.failed++;
        this.results.errors.push(result.error);
      }
    });

    const times = results.filter(r => r.success).map(r => r.duration);
    this.printEndpointStats(endpoint.path, times);
  }

  // Print endpoint statistics
  printEndpointStats(path, times) {
    if (times.length === 0) {
      console.log('  No successful requests');
      return;
    }

    times.sort((a, b) => a - b);

    const stats = {
      min: times[0],
      max: times[times.length - 1],
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      median: times[Math.floor(times.length / 2)],
      p95: times[Math.floor(times.length * 0.95)],
      p99: times[Math.floor(times.length * 0.99)]
    };

    console.log(`\n  Success: ${times.length}`);
    console.log(`  Min: ${stats.min.toFixed(2)}ms`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
    console.log(`  Median: ${stats.median.toFixed(2)}ms`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
    console.log(`  P99: ${stats.p99.toFixed(2)}ms`);
    console.log(`  Max: ${stats.max.toFixed(2)}ms`);
  }

  // Generate final report
  generateReport() {
    const duration = (this.results.endTime - this.results.startTime) / 1000;
    const rps = this.results.total / duration;

    console.log(`\n${'='.repeat(50)}`);
    console.log('BENCHMARK REPORT');
    console.log(`${'='.repeat(50)}`);

    console.log('\nSummary:');
    console.log(`  Total Requests: ${this.results.total}`);
    console.log(`  Successful: ${this.results.success} (${(this.results.success / this.results.total * 100).toFixed(1)}%)`);
    console.log(`  Failed: ${this.results.failed} (${(this.results.failed / this.results.total * 100).toFixed(1)}%)`);
    console.log(`  Duration: ${duration.toFixed(2)}s`);
    console.log(`  Requests/sec: ${rps.toFixed(2)}`);

    if (this.results.times.length > 0) {
      this.results.times.sort((a, b) => a - b);

      console.log('\nResponse Times:');
      console.log(`  Min: ${this.results.times[0].toFixed(2)}ms`);
      console.log(`  Avg: ${(this.results.times.reduce((a, b) => a + b, 0) / this.results.times.length).toFixed(2)}ms`);
      console.log(`  Median: ${this.results.times[Math.floor(this.results.times.length / 2)].toFixed(2)}ms`);
      console.log(`  P95: ${this.results.times[Math.floor(this.results.times.length * 0.95)].toFixed(2)}ms`);
      console.log(`  P99: ${this.results.times[Math.floor(this.results.times.length * 0.99)].toFixed(2)}ms`);
      console.log(`  Max: ${this.results.times[this.results.times.length - 1].toFixed(2)}ms`);
    }

    if (this.results.errors.length > 0) {
      const errorCounts = {};
      this.results.errors.forEach(err => {
        errorCounts[err] = (errorCounts[err] || 0) + 1;
      });

      console.log('\nErrors:');
      Object.entries(errorCounts).forEach(([error, count]) => {
        console.log(`  ${error}: ${count}`);
      });
    }

    console.log(`\n${'='.repeat(50)}`);

    return this.results;
  }

  // Compare multiple servers
  async compare(servers) {
    console.log(`[Benchmark] Comparing ${servers.length} servers...\n`);

    const results = [];

    for (const server of servers) {
      console.log(`\n[Testing] ${server.name} - ${server.url}`);
      console.log('-'.repeat(40));

      this.baseUrl = server.url;
      this.results = {
        total: 0,
        success: 0,
        failed: 0,
        times: [],
        errors: [],
        startTime: null,
        endTime: null
      };

      await this.run(server.endpoints || []);

      results.push({
        name: server.name,
        url: server.url,
        ...this.results
      });
    }

    this.printComparison(results);
    return results;
  }

  // Print comparison results
  printComparison(results) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('COMPARISON RESULTS');
    console.log(`${'='.repeat(60)}`);

    console.log('\n| Server | Success Rate | Avg Response | RPS |');
    console.log('|--------|-------------|--------------|-----|');

    results.forEach(result => {
      const successRate = (result.success / result.total * 100).toFixed(1);
      const avgTime = result.times.length > 0
        ? (result.times.reduce((a, b) => a + b, 0) / result.times.length).toFixed(2)
        : 'N/A';
      const duration = (result.endTime - result.startTime) / 1000;
      const rps = (result.total / duration).toFixed(2);

      console.log(`| ${result.name.padEnd(6)} | ${successRate.padStart(11)}% | ${avgTime.padStart(11)}ms | ${rps.padStart(3)} |`);
    });

    console.log(`\n${'='.repeat(60)}`);
  }
}

// CLI interface
if (require.main === module) {
  const benchmark = new Benchmark({
    baseUrl: process.argv[2] || 'http://localhost:3001',
    requests: parseInt(process.argv[3]) || 1000,
    concurrent: parseInt(process.argv[4]) || 10
  });

  // Compare all SAND servers
  benchmark.compare([
    { name: 'v1.0', url: 'http://localhost:3002' },
    { name: 'v2.1', url: 'http://localhost:3003' },
    { name: 'v3.0', url: 'http://localhost:3004' }
  ]).then(() => {
    console.log('\n[Benchmark] Test completed');
    process.exit(0);
  }).catch(err => {
    console.error('[Benchmark] Error:', err);
    process.exit(1);
  });
}

module.exports = Benchmark;