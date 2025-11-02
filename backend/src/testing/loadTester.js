/**
 * Advanced Load Testing Framework
 * Comprehensive load testing and stress testing for DEX platform
 */

const { EventEmitter } = require('events');
const http = require('http');
const https = require('https');
const { URL } = require('url');

class LoadTester extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      baseUrl: 'http://localhost:3001',
      defaultConcurrency: 10,
      defaultDuration: 60000, // 1 minute
      defaultRampUp: 10000, // 10 seconds
      defaultThinkTime: 1000, // 1 second between requests
      maxConcurrency: 1000,
      timeout: 30000, // 30 seconds
      keepAlive: true,
      scenarios: {},
      ...options
    };

    this.activeTests = new Map();
    this.results = new Map();
    this.agents = new Map();
    this.stats = {
      totalTests: 0,
      runningTests: 0,
      completedTests: 0,
      totalRequests: 0,
      totalErrors: 0
    };

    this.setupHttpAgents();
  }

  // Setup HTTP agents for connection pooling
  setupHttpAgents() {
    this.agents.set('http', new http.Agent({
      keepAlive: this.options.keepAlive,
      maxSockets: this.options.maxConcurrency,
      maxFreeSockets: 256
    }));

    this.agents.set('https', new https.Agent({
      keepAlive: this.options.keepAlive,
      maxSockets: this.options.maxConcurrency,
      maxFreeSockets: 256
    }));
  }

  // Define load test scenarios
  defineScenario(name, config) {
    this.options.scenarios[name] = {
      name,
      requests: [],
      concurrency: 10,
      duration: 30000,
      rampUp: 5000,
      thinkTime: 500,
      ...config
    };
  }

  // Add request to scenario
  addRequest(scenarioName, request) {
    const scenario = this.options.scenarios[scenarioName];
    if (!scenario) {
      throw new Error(`Scenario ${scenarioName} not found`);
    }

    scenario.requests.push({
      method: 'GET',
      path: '/',
      headers: {},
      body: null,
      weight: 1,
      ...request
    });
  }

  // Run load test
  async runLoadTest(config = {}) {
    const testConfig = {
      scenario: null,
      concurrency: this.options.defaultConcurrency,
      duration: this.options.defaultDuration,
      rampUp: this.options.defaultRampUp,
      baseUrl: this.options.baseUrl,
      ...config
    };

    const testId = `load_${Date.now()}`;
    this.stats.totalTests++;
    this.stats.runningTests++;

    console.log(`🚀 Starting load test: ${testId}`);
    console.log(`   Concurrency: ${testConfig.concurrency}`);
    console.log(`   Duration: ${testConfig.duration}ms`);
    console.log(`   Ramp-up: ${testConfig.rampUp}ms`);

    const testData = {
      testId,
      config: testConfig,
      startTime: Date.now(),
      workers: [],
      requests: [],
      errors: [],
      summary: {}
    };

    this.activeTests.set(testId, testData);
    this.emit('testStarted', { testId, config: testConfig });

    try {
      // Start workers with ramp-up
      await this.startWorkers(testData);

      // Wait for test completion
      await this.waitForCompletion(testData);

      // Calculate results
      testData.summary = this.calculateSummary(testData);
      testData.endTime = Date.now();
      testData.actualDuration = testData.endTime - testData.startTime;

      this.results.set(testId, testData);
      this.stats.runningTests--;
      this.stats.completedTests++;

      console.log(`✅ Load test completed: ${testId}`);
      this.emit('testCompleted', { testId, results: testData });

      return testData;
    } catch (error) {
      console.error(`❌ Load test failed: ${testId}`, error.message);
      this.activeTests.delete(testId);
      this.stats.runningTests--;
      throw error;
    }
  }

  // Start worker threads/processes
  async startWorkers(testData) {
    const { config } = testData;
    const workerStartInterval = config.rampUp / config.concurrency;

    for (let i = 0; i < config.concurrency; i++) {
      const workerId = `worker_${i}`;
      const worker = {
        id: workerId,
        startTime: Date.now() + (i * workerStartInterval),
        requests: 0,
        errors: 0,
        active: false
      };

      testData.workers.push(worker);

      // Start worker after ramp-up delay
      setTimeout(() => {
        this.startWorker(testData, worker);
      }, i * workerStartInterval);
    }
  }

  // Start individual worker
  async startWorker(testData, worker) {
    const { config } = testData;
    const testEndTime = testData.startTime + config.duration;

    worker.active = true;
    worker.actualStartTime = Date.now();

    while (Date.now() < testEndTime && this.activeTests.has(testData.testId)) {
      try {
        const request = this.selectRequest(config);
        const requestData = await this.executeRequest(config.baseUrl, request);

        testData.requests.push({
          workerId: worker.id,
          timestamp: Date.now(),
          ...requestData
        });

        worker.requests++;
        this.stats.totalRequests++;

        // Think time between requests
        if (config.thinkTime > 0) {
          await this.sleep(config.thinkTime + Math.random() * config.thinkTime * 0.5);
        }
      } catch (error) {
        testData.errors.push({
          workerId: worker.id,
          timestamp: Date.now(),
          error: error.message,
          type: error.code || 'UNKNOWN'
        });

        worker.errors++;
        this.stats.totalErrors++;
      }
    }

    worker.active = false;
    worker.endTime = Date.now();
  }

  // Select request based on scenario or weight
  selectRequest(config) {
    if (config.scenario && this.options.scenarios[config.scenario]) {
      const scenario = this.options.scenarios[config.scenario];
      return this.selectWeightedRequest(scenario.requests);
    }

    // Default health check request
    return {
      method: 'GET',
      path: '/api/system/health',
      headers: {}
    };
  }

  // Select weighted request from scenario
  selectWeightedRequest(requests) {
    const totalWeight = requests.reduce((sum, req) => sum + (req.weight || 1), 0);
    const random = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const request of requests) {
      currentWeight += request.weight || 1;
      if (random <= currentWeight) {
        return request;
      }
    }

    return requests[0]; // Fallback
  }

  // Execute HTTP request
  async executeRequest(baseUrl, request) {
    return new Promise((resolve, reject) => {
      const url = new URL(request.path, baseUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      const agent = this.agents.get(isHttps ? 'https' : 'http');

      const startTime = process.hrtime.bigint();
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: request.method,
        headers: {
          'User-Agent': 'LoadTester/1.0',
          ...request.headers
        },
        agent,
        timeout: this.options.timeout
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const endTime = process.hrtime.bigint();
          const responseTime = Number(endTime - startTime) / 1000000; // Convert to ms

          resolve({
            method: request.method,
            path: request.path,
            statusCode: res.statusCode,
            responseTime,
            responseSize: Buffer.byteLength(data),
            success: res.statusCode >= 200 && res.statusCode < 400
          });
        });
      });

      req.on('error', (error) => {
        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000;

        reject({
          ...error,
          responseTime,
          code: error.code || 'REQUEST_ERROR'
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000;

        reject({
          message: 'Request timeout',
          responseTime,
          code: 'TIMEOUT'
        });
      });

      // Send request body if provided
      if (request.body) {
        req.write(typeof request.body === 'string' ? request.body : JSON.stringify(request.body));
      }

      req.end();
    });
  }

  // Wait for test completion
  async waitForCompletion(testData) {
    const { config } = testData;
    const completionTime = testData.startTime + config.duration + config.rampUp + 10000; // Extra buffer

    while (Date.now() < completionTime) {
      const activeWorkers = testData.workers.filter(w => w.active);
      if (activeWorkers.length === 0) {
        break;
      }
      await this.sleep(1000);
    }

    // Force stop any remaining workers
    testData.workers.forEach(worker => worker.active = false);
  }

  // Calculate test summary
  calculateSummary(testData) {
    const { requests, errors } = testData;

    if (requests.length === 0) {
      return { error: 'No requests completed' };
    }

    const responseTimes = requests.map(r => r.responseTime);
    const successful = requests.filter(r => r.success);
    const failed = requests.filter(r => !r.success);

    const sorted = [...responseTimes].sort((a, b) => a - b);
    const sum = responseTimes.reduce((a, b) => a + b, 0);

    const duration = testData.actualDuration || testData.config.duration;
    const rps = (requests.length / (duration / 1000)).toFixed(2);

    // Group errors by type
    const errorsByType = {};
    errors.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
    });

    // Calculate status code distribution
    const statusCodes = {};
    requests.forEach(req => {
      statusCodes[req.statusCode] = (statusCodes[req.statusCode] || 0) + 1;
    });

    return {
      duration,
      totalRequests: requests.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      totalErrors: errors.length,
      requestsPerSecond: parseFloat(rps),
      errorRate: ((failed.length + errors.length) / requests.length * 100).toFixed(2),
      responseTime: {
        average: (sum / requests.length).toFixed(2),
        min: Math.min(...responseTimes).toFixed(2),
        max: Math.max(...responseTimes).toFixed(2),
        p50: sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
        p90: sorted[Math.floor(sorted.length * 0.9)].toFixed(2),
        p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
        p99: sorted[Math.floor(sorted.length * 0.99)].toFixed(2)
      },
      throughput: {
        requestsPerSecond: parseFloat(rps),
        bytesPerSecond: (requests.reduce((sum, r) => sum + (r.responseSize || 0), 0) / (duration / 1000)).toFixed(0)
      },
      workers: {
        total: testData.workers.length,
        avgRequestsPerWorker: (requests.length / testData.workers.length).toFixed(2)
      },
      statusCodes,
      errorsByType
    };
  }

  // Run stress test
  async runStressTest(config = {}) {
    const stressConfig = {
      maxConcurrency: 100,
      stepSize: 10,
      stepDuration: 30000,
      breakpoint: 'response_time', // or 'error_rate'
      breakpointThreshold: 1000, // ms or %
      ...config
    };

    console.log('🔥 Starting stress test');
    const results = [];
    let currentConcurrency = stressConfig.stepSize;

    while (currentConcurrency <= stressConfig.maxConcurrency) {
      console.log(`Testing with ${currentConcurrency} concurrent users`);

      const testResult = await this.runLoadTest({
        concurrency: currentConcurrency,
        duration: stressConfig.stepDuration,
        rampUp: Math.min(stressConfig.stepDuration / 4, 10000)
      });

      results.push({
        concurrency: currentConcurrency,
        summary: testResult.summary
      });

      // Check breakpoint
      if (this.checkBreakpoint(testResult.summary, stressConfig)) {
        console.log(`💥 Breakpoint reached at ${currentConcurrency} concurrent users`);
        break;
      }

      currentConcurrency += stressConfig.stepSize;
    }

    const stressResults = {
      testType: 'stress',
      config: stressConfig,
      results,
      breakpoint: currentConcurrency - stressConfig.stepSize,
      timestamp: Date.now()
    };

    console.log('✅ Stress test completed');
    return stressResults;
  }

  // Check if stress test breakpoint is reached
  checkBreakpoint(summary, config) {
    switch (config.breakpoint) {
    case 'response_time':
      return parseFloat(summary.responseTime.average) > config.breakpointThreshold;
    case 'error_rate':
      return parseFloat(summary.errorRate) > config.breakpointThreshold;
    case 'rps':
      return summary.requestsPerSecond < config.breakpointThreshold;
    default:
      return false;
    }
  }

  // Run spike test
  async runSpikeTest(config = {}) {
    const spikeConfig = {
      normalLoad: 10,
      spikeLoad: 100,
      spikeDuration: 10000,
      normalDuration: 30000,
      spikes: 3,
      ...config
    };

    console.log('⚡ Starting spike test');
    const results = [];

    for (let i = 0; i < spikeConfig.spikes; i++) {
      // Normal load phase
      console.log(`Normal load phase ${i + 1}`);
      const normalResult = await this.runLoadTest({
        concurrency: spikeConfig.normalLoad,
        duration: spikeConfig.normalDuration
      });

      results.push({
        phase: 'normal',
        iteration: i + 1,
        summary: normalResult.summary
      });

      // Spike phase
      console.log(`Spike phase ${i + 1}`);
      const spikeResult = await this.runLoadTest({
        concurrency: spikeConfig.spikeLoad,
        duration: spikeConfig.spikeDuration,
        rampUp: 1000 // Quick ramp-up for spike
      });

      results.push({
        phase: 'spike',
        iteration: i + 1,
        summary: spikeResult.summary
      });
    }

    const spikeResults = {
      testType: 'spike',
      config: spikeConfig,
      results,
      timestamp: Date.now()
    };

    console.log('✅ Spike test completed');
    return spikeResults;
  }

  // Get test results
  getResults(testId = null) {
    if (testId) {
      return this.results.get(testId);
    }
    return Object.fromEntries(this.results);
  }

  // Get current statistics
  getStats() {
    return {
      ...this.stats,
      activeTests: Array.from(this.activeTests.keys()),
      scenarios: Object.keys(this.options.scenarios).length
    };
  }

  // Stop specific test
  stopTest(testId) {
    if (this.activeTests.has(testId)) {
      this.activeTests.delete(testId);
      this.stats.runningTests--;
      console.log(`🛑 Test stopped: ${testId}`);
      return true;
    }
    return false;
  }

  // Stop all tests
  stopAllTests() {
    const stoppedTests = Array.from(this.activeTests.keys());
    this.activeTests.clear();
    this.stats.runningTests = 0;
    console.log(`🛑 All tests stopped: ${stoppedTests.length} tests`);
    return stoppedTests;
  }

  // Health check
  healthCheck() {
    return {
      status: 'healthy',
      activeTests: this.activeTests.size,
      completedTests: this.results.size,
      scenarios: Object.keys(this.options.scenarios).length
    };
  }

  // Utility sleep function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup and shutdown
  shutdown() {
    this.stopAllTests();

    // Close HTTP agents
    for (const agent of this.agents.values()) {
      agent.destroy();
    }

    console.log('🛑 Load tester shutdown complete');
  }
}

// Create singleton instance
const loadTester = new LoadTester();

// Define common scenarios
loadTester.defineScenario('api_basic', {
  name: 'Basic API Test',
  concurrency: 10,
  duration: 30000
});

loadTester.addRequest('api_basic', {
  method: 'GET',
  path: '/api/system/health',
  weight: 3
});

loadTester.addRequest('api_basic', {
  method: 'GET',
  path: '/api/system/metrics',
  weight: 2
});

loadTester.addRequest('api_basic', {
  method: 'GET',
  path: '/api/trading/ticker/BTC-USDT',
  weight: 5
});

module.exports = {
  LoadTester,
  loadTester
};