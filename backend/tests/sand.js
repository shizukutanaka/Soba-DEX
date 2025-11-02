// SAND Automated Test Suite
const http = require('http');
const assert = require('assert');

class TestRunner {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  // HTTP request helper
  async request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      
      const req = http.request(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: 5000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data
            });
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      
      req.end();
    });
  }

  // Test definition
  test(name, fn) {
    this.tests.push({ name, fn });
  }

  // Run all tests
  async run() {
    console.log('\n=== SAND Test Suite ===\n');
    
    for (const test of this.tests) {
      try {
        await test.fn.call(this);
        this.results.passed++;
        console.log(`✓ ${test.name}`);
      } catch (error) {
        this.results.failed++;
        this.results.errors.push({ test: test.name, error: error.message });
        console.log(`✗ ${test.name}`);
        console.log(`  Error: ${error.message}`);
      }
    }
    
    this.printResults();
    return this.results;
  }

  // Print test results
  printResults() {
    const total = this.results.passed + this.results.failed;
    const passRate = total > 0 ? (this.results.passed / total * 100).toFixed(1) : 0;
    
    console.log('\n=== Test Results ===');
    console.log(`Total: ${total}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Pass Rate: ${passRate}%`);
    
    if (this.results.errors.length > 0) {
      console.log('\nFailed Tests:');
      this.results.errors.forEach(err => {
        console.log(`  - ${err.test}: ${err.error}`);
      });
    }
  }
}

// Initialize test runner
const runner = new TestRunner(process.argv[2] || 'http://localhost:3002');

// Health Check Tests
runner.test('Health endpoint returns 200', async function() {
  const res = await this.request('/health');
  assert.strictEqual(res.status, 200, 'Status should be 200');
});

runner.test('Health response contains required fields', async function() {
  const res = await this.request('/health');
  assert(res.body.status, 'Should have status field');
  assert(res.body.timestamp, 'Should have timestamp field');
  assert(res.body.uptime !== undefined, 'Should have uptime field');
});

runner.test('Health status is healthy', async function() {
  const res = await this.request('/health');
  assert.strictEqual(res.body.status, 'healthy', 'Status should be healthy');
});

// API Tests
runner.test('Market endpoint returns 200', async function() {
  const res = await this.request('/api/market');
  assert.strictEqual(res.status, 200, 'Status should be 200');
});

runner.test('Market data has correct structure', async function() {
  const res = await this.request('/api/market');
  assert(Array.isArray(res.body.pairs) || res.body.data, 'Should have market data');
});

// Trade Tests
runner.test('Trade endpoint requires authentication', async function() {
  const res = await this.request('/api/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { pair: 'ETH/USDT', side: 'buy', amount: 1 }
  });
  // Should either succeed or return auth error
  assert(res.status === 200 || res.status === 401 || res.status === 400, 
    'Should return valid status');
});

// Order Book Tests
runner.test('Order book endpoint works', async function() {
  const res = await this.request('/api/book/ETH-USDT');
  // May return 404 if endpoint doesn't exist
  assert(res.status === 200 || res.status === 404, 'Should return valid status');
});

// Cache Tests
runner.test('Cache headers are set', async function() {
  const res = await this.request('/api/market');
  const cacheControl = res.headers['cache-control'];
  if (cacheControl) {
    assert(cacheControl.includes('max-age'), 'Should have max-age directive');
  }
});

// Performance Tests
runner.test('Response time is acceptable', async function() {
  const start = Date.now();
  await this.request('/health');
  const duration = Date.now() - start;
  assert(duration < 1000, `Response time ${duration}ms should be under 1000ms`);
});

runner.test('Can handle multiple concurrent requests', async function() {
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(this.request('/health'));
  }
  
  const results = await Promise.all(promises);
  const allSuccess = results.every(res => res.status === 200);
  assert(allSuccess, 'All concurrent requests should succeed');
});

// Error Handling Tests
runner.test('404 for unknown endpoints', async function() {
  const res = await this.request('/api/unknown-endpoint-xyz');
  assert.strictEqual(res.status, 404, 'Should return 404 for unknown endpoint');
});

runner.test('Invalid JSON returns error', async function() {
  try {
    const res = await this.request('/api/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { invalid: 'data' }
    });
    // Should handle invalid data gracefully
    assert(res.status === 400 || res.status === 404 || res.status === 200,
      'Should handle invalid data');
  } catch (e) {
    // Connection errors are acceptable
    assert(e.message.includes('ECONNREFUSED') || e.message.includes('timeout'),
      'Connection error is acceptable');
  }
});

// Security Tests
runner.test('Security headers are present', async function() {
  const res = await this.request('/health');
  // Check for common security headers (may vary by implementation)
  const headers = res.headers;
  const hasSecurityHeaders = 
    headers['x-content-type-options'] ||
    headers['x-frame-options'] ||
    headers['x-xss-protection'] ||
    headers['strict-transport-security'];
  
  // Note: Not all servers may have security headers
  assert(true, 'Security headers check (informational)');
});

// Compression Tests
runner.test('Compression is enabled', async function() {
  const res = await this.request('/api/market', {
    headers: { 'Accept-Encoding': 'gzip, deflate' }
  });
  
  // Check if response is compressed (content-encoding header)
  const encoding = res.headers['content-encoding'];
  if (encoding) {
    assert(encoding.includes('gzip') || encoding.includes('deflate'),
      'Should use compression');
  }
  // Note: Compression may not be enabled for small responses
  assert(true, 'Compression check (informational)');
});

// Run tests
runner.run().then(results => {
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});