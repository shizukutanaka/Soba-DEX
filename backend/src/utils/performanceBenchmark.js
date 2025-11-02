const axios = require('axios');
const { performance } = require('perf_hooks');

/**
 * DEX Performance Benchmark Suite
 * Comprehensive performance testing for DEX platform
 */
class DEXBenchmarks {
  constructor(baseUrl = process.env.API_BASE_URL || 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.axios = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DEX-Benchmark/1.0.0'
      }
    });
  }

  /**
   * Generate HTML report from benchmark results
   */
  generateHTMLReport(results) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DEX Performance Benchmark Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 40px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 6px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 24px; font-weight: bold; color: #007bff; }
        .suite { margin: 30px 0; }
        .suite h3 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .benchmark { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; padding: 10px; background: #f8f9fa; margin: 5px 0; border-radius: 4px; }
        .benchmark:nth-child(even) { background: #e9ecef; }
        .name { font-weight: 500; }
        .ops { text-align: right; font-family: monospace; }
        .time { text-align: right; font-family: monospace; color: #666; }
        .timestamp { color: #666; text-align: center; margin-top: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 DEX Performance Benchmark Report</h1>
            <p>Generated on ${new Date().toISOString()}</p>
        </div>

        <div class="summary">
            <div class="metric">
                <h3>Total Suites</h3>
                <div class="value">${results.length}</div>
            </div>
            <div class="metric">
                <h3>Total Benchmarks</h3>
                <div class="value">${results.reduce((sum, suite) => sum + suite.benchmarks.length, 0)}</div>
            </div>
            <div class="metric">
                <h3>Avg Operations/sec</h3>
                <div class="value">${Math.round(results.reduce((sum, suite) => {
    const suiteAvg = suite.benchmarks.reduce((s, b) => s + b.opsPerSecond, 0) / suite.benchmarks.length;
    return sum + suiteAvg;
  }, 0) / results.length).toLocaleString()}</div>
            </div>
            <div class="metric">
                <h3>Total Time</h3>
                <div class="value">${results.reduce((sum, suite) => sum + suite.totalTime, 0).toFixed(2)}ms</div>
            </div>
        </div>

        ${results.map(suite => `
            <div class="suite">
                <h3>📈 ${suite.suite}</h3>
                ${suite.benchmarks.map(benchmark => `
                    <div class="benchmark">
                        <div class="name">${benchmark.name}</div>
                        <div class="ops">${benchmark.opsPerSecond.toLocaleString()} ops/sec</div>
                        <div class="time">${benchmark.averageTime}ms avg</div>
                    </div>
                `).join('')}
            </div>
        `).join('')}

        <div class="timestamp">
            <p><small>Report generated at ${new Date().toLocaleString()}</small></p>
        </div>
    </div>
</body>
</html>`;
    return html;
  }

  /**
   * Run a single benchmark test
   */
  async runBenchmark(name, testFunction, iterations = 1000) {
    const results = [];
    console.log(`Running ${name}...`);

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await testFunction();
      const end = performance.now();
      results.push(end - start);
    }

    const averageTime = results.reduce((sum, time) => sum + time, 0) / results.length;
    const opsPerSecond = 1000 / averageTime;

    return {
      name,
      averageTime: averageTime.toFixed(2),
      opsPerSecond: Math.round(opsPerSecond),
      minTime: Math.min(...results).toFixed(2),
      maxTime: Math.max(...results).toFixed(2)
    };
  }

  /**
   * Health check benchmark
   */
  async healthCheckBenchmark() {
    return this.runBenchmark('Health Check', async () => {
      await this.axios.get('/api/health');
    });
  }

  /**
   * Order creation benchmark
   */
  async orderCreationBenchmark() {
    return this.runBenchmark('Order Creation', async () => {
      await this.axios.post('/api/trading/orders', {
        instrument: 'BTC/USD',
        side: 'buy',
        quantity: '1.0',
        orderType: 'market'
      });
    });
  }

  /**
   * Market data benchmark
   */
  async marketDataBenchmark() {
    return this.runBenchmark('Market Data Fetch', async () => {
      await this.axios.get('/api/market/data');
    });
  }

  /**
   * Authentication benchmark
   */
  async authBenchmark() {
    return this.runBenchmark('Authentication', async () => {
      await this.axios.post('/api/auth/login', {
        email: 'test@example.com',
        password: 'test123'
      });
    });
  }

  /**
   * Portfolio query benchmark
   */
  async portfolioBenchmark() {
    return this.runBenchmark('Portfolio Query', async () => {
      await this.axios.get('/api/portfolio/balance');
    });
  }

  /**
   * Run all benchmark suites
   */
  async runAllBenchmarks() {
    console.log('Starting DEX Benchmark Suite...\n');

    const suites = [
      {
        suite: 'API Performance',
        benchmarks: [
          await this.healthCheckBenchmark(),
          await this.marketDataBenchmark(),
          await this.authBenchmark()
        ]
      },
      {
        suite: 'Trading Operations',
        benchmarks: [
          await this.orderCreationBenchmark(),
          await this.portfolioBenchmark()
        ]
      }
    ];

    // Calculate suite totals
    suites.forEach(suite => {
      suite.totalTime = suite.benchmarks.reduce((sum, b) => sum + parseFloat(b.averageTime), 0);
    });

    return suites;
  }
}

module.exports = { DEXBenchmarks };
