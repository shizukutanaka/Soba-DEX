process.env.NODE_ENV = 'test';
process.env.REQUEST_HISTORY_LIMIT = '5';
process.env.REQUEST_THRESHOLD_ERROR_RATE_PERCENT = '15';
process.env.REQUEST_THRESHOLD_LONGEST_ACTIVE_MS = '25000';
process.env.REQUEST_THRESHOLD_ACTIVE_REQUESTS = '150';

const request = require('supertest');
const requestIdTracker = require('../middleware/requestId');
const { configureRequestLifecycle, getRequestLifecycleConfig } = require('../middleware/requestLifecycle');

const app = require('../server');

const resetRequestTracker = () => {
  if (process.env.REQUEST_HISTORY_LIMIT) {
    requestIdTracker.setMaxHistorySize(process.env.REQUEST_HISTORY_LIMIT);
  }
  if (typeof requestIdTracker.resetStats === 'function') {
    requestIdTracker.resetStats();
  }
  if (typeof requestIdTracker.clearHistory === 'function') {
    requestIdTracker.clearHistory();
  }
  if (requestIdTracker.activeRequests && typeof requestIdTracker.activeRequests.clear === 'function') {
    requestIdTracker.activeRequests.clear();
  }
};

beforeEach(() => {
  resetRequestTracker();
});

describe('GET /api/health/requests', () => {
  test('returns healthy snapshot with default configuration', async () => {
    const response = await request(app).get('/api/health/requests');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('snapshot.summary.stats');
    expect(response.body.snapshot.summary).toHaveProperty('timestamp');
    expect(response.body.snapshot.summary.stats).toHaveProperty('activeRequests');
  });

  test('respects query parameters toggling optional sections', async () => {
    const response = await request(app)
      .get('/api/health/requests')
      .query({
        active: 'false',
        includeSlow: 'false',
        includeErrors: 'false',
        includeHistory: 'true',
        historyLimit: 5
      });

    expect(response.status).toBe(200);
    expect(response.body.snapshot).not.toHaveProperty('activeRequests');
    expect(response.body.snapshot).not.toHaveProperty('slowRequests');
    expect(response.body.snapshot).not.toHaveProperty('errorRequests');
    expect(response.body.snapshot).toHaveProperty('recentHistory');
    expect(Array.isArray(response.body.snapshot.recentHistory)).toBe(true);
    expect(response.body.snapshot.recentHistory.length).toBeLessThanOrEqual(5);
  });

  test('reports degraded status when error rate exceeds threshold', async () => {
    await request(app).get('/non-existent-route');

    const response = await request(app).get('/api/health/requests');

    expect(response.status).toBe(503);
    expect(response.body).toHaveProperty('status', 'degraded');
    expect(response.body).toHaveProperty('metrics.errorRate');
    expect(response.body.metrics.errorRate).toBeGreaterThan(Number(process.env.REQUEST_THRESHOLD_ERROR_RATE_PERCENT));
  });

  test('reports degraded status when slow requests exceed threshold', async () => {
    const slowRequestId = 'req_slow_test';
    const thirtyFiveSecondsAgo = Date.now() - 35000;

    requestIdTracker.activeRequests.set(slowRequestId, {
      id: slowRequestId,
      method: 'GET',
      url: '/api/test/slow',
      ip: '127.0.0.1',
      userAgent: 'jest-test',
      startTime: thirtyFiveSecondsAgo
    });

    const response = await request(app)
      .get('/api/health/requests')
      .query({ slowThresholdMs: 1000, includeActive: 'true' });

    expect(response.status).toBe(503);
    expect(response.body).toHaveProperty('status', 'degraded');
    expect(response.body.metrics.longestActiveRequest).toBeGreaterThan(Number(process.env.REQUEST_THRESHOLD_LONGEST_ACTIVE_MS));

    requestIdTracker.activeRequests.clear();
  });

  test('respects configured request history limit', async () => {
    const limit = Number(process.env.REQUEST_HISTORY_LIMIT);

    for (let i = 0; i < limit + 5; i += 1) {
      const requestId = `req_history_${i}`;
      requestIdTracker.trackRequestStart(requestId, {
        method: 'GET',
        originalUrl: `/api/test/history/${i}`,
        ip: '127.0.0.1',
        get: () => 'jest-test'
      });

      const startRecord = requestIdTracker.activeRequests.get(requestId);
      requestIdTracker.trackRequestEnd(requestId, 200, startRecord.startTime, true);
    }

    const snapshot = await request(app)
      .get('/api/health/requests')
      .query({ includeHistory: 'true', historyLimit: 100 });

    expect(snapshot.status).toBe(200);
    expect(snapshot.body.snapshot.summary.stats.historySize).toBeLessThanOrEqual(limit);
    expect(
      snapshot.body.snapshot.recentHistory ? snapshot.body.snapshot.recentHistory.length : 0
    ).toBeLessThanOrEqual(limit);
  });

  test('warns and retains defaults when invalid configuration is provided', () => {
    const originalConfig = getRequestLifecycleConfig();
    const warnings = [];

    configureRequestLifecycle({
      historyLimit: '-10',
      thresholds: {
        errorRatePercent: 'abc',
        longestActiveMs: '-1',
        activeRequests: '0'
      },
      logger: (level, message, meta) => {
        if (level === 'warn') {
          warnings.push({ message, meta });
        }
      }
    });

    const updatedConfig = getRequestLifecycleConfig();

    expect(warnings.length).toBeGreaterThanOrEqual(4);
    expect(updatedConfig).toEqual(originalConfig);

    configureRequestLifecycle({
      historyLimit: originalConfig.historyLimit,
      thresholds: originalConfig.thresholds,
      logger: () => {}
    });
  });
});
