#!/usr/bin/env node
/**
 * パフォーマンス監査スクリプト
 * アプリケーションのパフォーマンスメトリクスを収集・分析
 */

const http = require('http');
const { performance } = require('perf_hooks');

const CONFIG = {
  baseURL: process.env.API_URL || 'http://localhost:3001',
  endpoints: [
    '/health',
    '/api/health',
    '/api/market',
  ],
  requests: parseInt(process.env.REQUESTS || '100'),
  concurrency: parseInt(process.env.CONCURRENCY || '10'),
};

class PerformanceAuditor {
  constructor(config) {
    this.config = config;
    this.results = [];
  }

  async makeRequest(endpoint) {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();

      const url = new URL(endpoint, this.config.baseURL);
      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'GET',
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const endTime = performance.now();
          const duration = endTime - startTime;

          resolve({
            endpoint,
            statusCode: res.statusCode,
            duration,
            size: Buffer.byteLength(data),
            timestamp: new Date().toISOString(),
          });
        });
      });

      req.on('error', (error) => {
        const endTime = performance.now();
        reject({
          endpoint,
          error: error.message,
          duration: endTime - startTime,
        });
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject({
          endpoint,
          error: 'Request timeout',
          duration: 30000,
        });
      });

      req.end();
    });
  }

  async runBatch(endpoint, count) {
    const promises = [];

    for (let i = 0; i < count; i++) {
      promises.push(
        this.makeRequest(endpoint)
          .catch(err => ({ ...err, failed: true }))
      );

      // Throttle requests based on concurrency
      if (promises.length >= this.config.concurrency) {
        const results = await Promise.all(promises.splice(0, this.config.concurrency));
        this.results.push(...results);
      }
    }

    // Process remaining requests
    if (promises.length > 0) {
      const results = await Promise.all(promises);
      this.results.push(...results);
    }
  }

  calculateStats(results) {
    const durations = results
      .filter(r => !r.failed)
      .map(r => r.duration);

    if (durations.length === 0) {
      return {
        count: 0,
        failed: results.length,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    durations.sort((a, b) => a - b);

    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const min = durations[0];
    const max = durations[durations.length - 1];

    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];

    const failed = results.filter(r => r.failed).length;

    return {
      count: durations.length,
      failed,
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      p99: p99.toFixed(2),
    };
  }

  printResults() {
    console.log('\n📊 Performance Audit Results\n');
    console.log('='.repeat(80));

    const byEndpoint = {};

    for (const result of this.results) {
      if (!byEndpoint[result.endpoint]) {
        byEndpoint[result.endpoint] = [];
      }
      byEndpoint[result.endpoint].push(result);
    }

    for (const [endpoint, results] of Object.entries(byEndpoint)) {
      const stats = this.calculateStats(results);

      console.log(`\nEndpoint: ${endpoint}`);
      console.log('-'.repeat(80));
      console.log(`Total Requests: ${stats.count + stats.failed}`);
      console.log(`Successful:     ${stats.count}`);
      console.log(`Failed:         ${stats.failed}`);
      console.log(`\nResponse Times (ms):`);
      console.log(`  Average:      ${stats.avg}ms`);
      console.log(`  Min:          ${stats.min}ms`);
      console.log(`  Max:          ${stats.max}ms`);
      console.log(`  Median (P50): ${stats.p50}ms`);
      console.log(`  P95:          ${stats.p95}ms`);
      console.log(`  P99:          ${stats.p99}ms`);

      // Performance rating
      const avgNum = parseFloat(stats.avg);
      let rating = '🔴 Poor';
      if (avgNum < 50) rating = '🟢 Excellent';
      else if (avgNum < 100) rating = '🟡 Good';
      else if (avgNum < 200) rating = '🟠 Fair';

      console.log(`\nPerformance:    ${rating}`);
    }

    console.log('\n' + '='.repeat(80));

    // Overall statistics
    const overallStats = this.calculateStats(this.results);
    console.log('\n📈 Overall Statistics\n');
    console.log(`Total Requests:     ${overallStats.count + overallStats.failed}`);
    console.log(`Success Rate:       ${((overallStats.count / (overallStats.count + overallStats.failed)) * 100).toFixed(2)}%`);
    console.log(`Average Response:   ${overallStats.avg}ms`);
    console.log(`P95 Response:       ${overallStats.p95}ms`);

    // Recommendations
    console.log('\n💡 Recommendations\n');

    const avgNum = parseFloat(overallStats.avg);
    if (avgNum > 200) {
      console.log('⚠️  Response times are high. Consider:');
      console.log('   - Database query optimization');
      console.log('   - Caching implementation');
      console.log('   - Connection pooling');
    } else if (avgNum > 100) {
      console.log('ℹ️  Response times are acceptable but can be improved:');
      console.log('   - Review slow endpoints');
      console.log('   - Implement caching for frequently accessed data');
    } else {
      console.log('✅ Performance is excellent!');
    }

    if (overallStats.failed > 0) {
      console.log(`\n⚠️  ${overallStats.failed} requests failed. Check server logs.`);
    }

    console.log();
  }

  async run() {
    console.log('🚀 Starting Performance Audit...\n');
    console.log(`Configuration:`);
    console.log(`  Base URL:     ${this.config.baseURL}`);
    console.log(`  Endpoints:    ${this.config.endpoints.length}`);
    console.log(`  Requests:     ${this.config.requests} per endpoint`);
    console.log(`  Concurrency:  ${this.config.concurrency}`);
    console.log();

    for (const endpoint of this.config.endpoints) {
      process.stdout.write(`Testing ${endpoint}... `);
      await this.runBatch(endpoint, this.config.requests);
      console.log('✓');
    }

    this.printResults();
  }
}

// Run audit
if (require.main === module) {
  const auditor = new PerformanceAuditor(CONFIG);

  auditor.run()
    .then(() => {
      console.log('✅ Audit complete\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Audit failed:', error.message);
      process.exit(1);
    });
}

module.exports = PerformanceAuditor;
