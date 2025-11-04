/**
 * K6 Load Testing - Smoke Tests
 *
 * Baseline performance testing to ensure critical paths work correctly
 * under load and meet SLA targets.
 *
 * Run with: k6 run smoke.test.js
 * Or with options: k6 run --vus 10 --duration 30s smoke.test.js
 *
 * @version 1.0.0
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Custom metrics
const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');
const requestSuccess = new Counter('request_success');
const activeConnections = new Gauge('active_connections');

export const options = {
  stages: [
    // Warm up
    { duration: '10s', target: 10 },
    // Ramp up
    { duration: '30s', target: 50 },
    // Sustained load
    { duration: '60s', target: 50 },
    // Ramp down
    { duration: '20s', target: 0 }
  ],
  thresholds: {
    // 95% of requests must complete below 500ms
    'request_duration': ['p(95)<500'],
    // Error rate must be below 1%
    'errors': ['rate<0.01'],
    // 95% of health check requests must complete below 100ms
    'http_req_duration{endpoint:health}': ['p(95)<100'],
  },
  ext: {
    loadimpact: {
      projectID: 3356643,
      name: 'Soba DEX - Smoke Test'
    }
  }
};

// Auth token for protected endpoints
let authToken = '';

export function setup() {
  // Setup phase - create test data
  console.log('Setting up test environment...');

  // Generate auth token
  const loginPayload = JSON.stringify({
    email: 'test@example.com',
    password: 'test123456'
  });

  const loginParams = {
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const loginResponse = http.post(
    `${BASE_URL}/api/auth/login`,
    loginPayload,
    loginParams
  );

  if (loginResponse.status === 200) {
    const data = JSON.parse(loginResponse.body);
    authToken = data.token || 'test-token';
    console.log('✅ Auth token generated');
  } else {
    console.warn('⚠️ Login failed, using test token');
    authToken = 'test-token';
  }

  return { authToken };
}

export default function (data) {
  authToken = data.authToken;

  // Health Check Tests
  group('Health Checks', () => {
    const healthResponse = http.get(`${BASE_URL}/api/python/health`, {
      tags: { endpoint: 'health' }
    });

    check(healthResponse, {
      'health status is 200': (r) => r.status === 200,
      'health response includes services': (r) => r.body.includes('services'),
      'health check completes quickly': (r) => r.timings.duration < 100
    });

    requestDuration.add(healthResponse.timings.duration, { endpoint: 'health' });
    errorRate.add(healthResponse.status !== 200);
    if (healthResponse.status === 200) {
      requestSuccess.add(1);
    }
  });

  sleep(1);

  // ML Models Tests
  group('ML Models', () => {
    const mlPayload = JSON.stringify({
      BTC: 45000,
      ETH: 2500,
      features: [1, 2, 3]
    });

    const mlParams = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };

    const mlResponse = http.post(
      `${BASE_URL}/api/python/ml/predict`,
      mlPayload,
      mlParams
    );

    check(mlResponse, {
      'ML predict status is 200': (r) => r.status === 200,
      'ML response includes prediction': (r) => r.body.includes('predicted'),
      'ML prediction completes in time': (r) => r.timings.duration < 500
    });

    requestDuration.add(mlResponse.timings.duration, { endpoint: 'ml' });
    errorRate.add(mlResponse.status !== 200);
    if (mlResponse.status === 200) {
      requestSuccess.add(1);
    }
  });

  sleep(1);

  // NLP Translation Tests
  group('NLP Translation', () => {
    const nlpPayload = JSON.stringify({
      text: 'Hello world, this is a test',
      source_language: 'en',
      target_language: 'ja'
    });

    const nlpParams = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };

    const nlpResponse = http.post(
      `${BASE_URL}/api/python/nlp/translate`,
      nlpPayload,
      nlpParams
    );

    check(nlpResponse, {
      'NLP translate status is 200': (r) => r.status === 200,
      'NLP response includes translation': (r) => r.body.includes('translated'),
      'NLP translation completes in time': (r) => r.timings.duration < 500
    });

    requestDuration.add(nlpResponse.timings.duration, { endpoint: 'nlp' });
    errorRate.add(nlpResponse.status !== 200);
    if (nlpResponse.status === 200) {
      requestSuccess.add(1);
    }
  });

  sleep(1);

  // Fraud Detection Tests
  group('Fraud Detection', () => {
    const fraudPayload = JSON.stringify({
      user_id: 'user-123',
      transaction_amount: 1000,
      transaction_type: 'swap',
      ip_address: '192.168.1.1'
    });

    const fraudParams = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };

    const fraudResponse = http.post(
      `${BASE_URL}/api/python/fraud/assess-risk`,
      fraudPayload,
      fraudParams
    );

    check(fraudResponse, {
      'Fraud assess status is 200': (r) => r.status === 200,
      'Fraud response includes risk level': (r) => r.body.includes('risk'),
      'Fraud assessment completes in time': (r) => r.timings.duration < 200
    });

    requestDuration.add(fraudResponse.timings.duration, { endpoint: 'fraud' });
    errorRate.add(fraudResponse.status !== 200);
    if (fraudResponse.status === 200) {
      requestSuccess.add(1);
    }
  });

  sleep(1);

  // Data Processing Tests
  group('Data Processing', () => {
    const dataPayload = JSON.stringify({
      token: 'BTC',
      price: 45000,
      volume: 1000000,
      timestamp: Date.now()
    });

    const dataParams = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };

    const dataResponse = http.post(
      `${BASE_URL}/api/python/data/validate-market-data`,
      dataPayload,
      dataParams
    );

    check(dataResponse, {
      'Data validation status is 200': (r) => r.status === 200,
      'Data response includes validity': (r) => r.body.includes('is_valid'),
      'Data validation completes in time': (r) => r.timings.duration < 300
    });

    requestDuration.add(dataResponse.timings.duration, { endpoint: 'data' });
    errorRate.add(dataResponse.status !== 200);
    if (dataResponse.status === 200) {
      requestSuccess.add(1);
    }
  });

  sleep(1);

  // Blockchain Intelligence Tests
  group('Blockchain Intelligence', () => {
    const blockchainParams = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };

    const graphResponse = http.get(
      `${BASE_URL}/api/python/blockchain/transaction-graph`,
      blockchainParams
    );

    check(graphResponse, {
      'Blockchain graph status is 200': (r) => r.status === 200,
      'Blockchain response includes nodes': (r) => r.body.includes('nodes'),
      'Blockchain query completes in time': (r) => r.timings.duration < 500
    });

    requestDuration.add(graphResponse.timings.duration, { endpoint: 'blockchain' });
    errorRate.add(graphResponse.status !== 200);
    if (graphResponse.status === 200) {
      requestSuccess.add(1);
    }
  });

  sleep(2);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

// Helper function for text summary
function textSummary(data, options) {
  let summary = '';
  summary += '\n╔════════════════════════════════════════╗\n';
  summary += '║        K6 Load Test Summary             ║\n';
  summary += '╚════════════════════════════════════════╝\n\n';

  if (data.metrics) {
    summary += '📊 Performance Metrics:\n';
    summary += `├─ Total Requests: ${data.metrics.http_reqs?.values?.count || 0}\n`;
    summary += `├─ Error Rate: ${(data.metrics.http_req_failed?.values?.rate * 100 || 0).toFixed(2)}%\n`;
    summary += `├─ Success Rate: ${(100 - (data.metrics.http_req_failed?.values?.rate * 100 || 0)).toFixed(2)}%\n`;
    summary += `├─ Avg Duration: ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms\n`;
    summary += `├─ P95 Duration: ${(data.metrics.http_req_duration?.values?.p(95) || 0).toFixed(2)}ms\n`;
    summary += `└─ P99 Duration: ${(data.metrics.http_req_duration?.values?.p(99) || 0).toFixed(2)}ms\n`;
  }

  summary += '\n✅ Test complete!\n';
  return summary;
}
