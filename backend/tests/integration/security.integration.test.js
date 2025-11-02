/**
 * Security Monitor Integration Tests
 * Tests full integration of security components
 */

const request = require('supertest');
const { Pool } = require('pg');
const redis = require('redis');

// テスト用のアプリケーションセットアップ
const setupTestApp = async () => {
  const express = require('express');
  const app = express();

  // データベース接続（テスト用）
  const pgPool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: 'security_monitor_test',
    user: 'security_user',
    password: process.env.POSTGRES_PASSWORD || 'test_password'
  });

  // Redis接続（テスト用）
  const redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    }
  });
  await redisClient.connect();

  // セキュリティモジュール
  const securityMonitor = require('../../src/security/realTimeSecurityMonitor');
  const advancedThreatDetection = require('../../src/security/advancedThreatDetection');
  const prometheusMetrics = require('../../src/monitoring/prometheusMetrics');
  const webhookNotifier = require('../../src/notifications/webhookNotifier');
  const { PostgresSecurityRepository } = require('../../src/database/securityEventRepository');
  const { getInstance: getRedisCache } = require('../../src/cache/redisSecurityCache');

  // リポジトリ初期化
  const securityRepo = new PostgresSecurityRepository(pgPool);
  await securityRepo.initialize();

  const redisCache = getRedisCache({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  });
  await redisCache.connect();

  // ミドルウェア
  app.use(express.json());
  app.use(advancedThreatDetection.middleware());
  app.use(securityMonitor.middleware());

  // テスト用エンドポイント
  app.get('/test/normal', (req, res) => {
    res.json({ status: 'ok', message: 'Normal request' });
  });

  app.post('/test/data', (req, res) => {
    res.json({ status: 'ok', received: req.body });
  });

  app.get('/test/error', (req, res) => {
    res.status(500).json({ error: 'Internal server error' });
  });

  app.get('/metrics', prometheusMetrics.metricsEndpoint());

  app.get('/api/stats', (req, res) => {
    res.json(securityMonitor.getStatistics());
  });

  return {
    app,
    pgPool,
    redisClient,
    redisCache,
    securityRepo,
    securityMonitor,
    advancedThreatDetection,
    prometheusMetrics,
    webhookNotifier,
    cleanup: async () => {
      await pgPool.end();
      await redisClient.quit();
      await redisCache.disconnect();
    }
  };
};

describe('Security Monitor Integration Tests', () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await setupTestApp();
  });

  afterAll(async () => {
    if (testEnv && testEnv.cleanup) {
      await testEnv.cleanup();
    }
  });

  afterEach(async () => {
    // テスト間でRedisをクリア
    if (testEnv && testEnv.redisCache) {
      await testEnv.redisCache.clearAll();
    }
  });

  describe('Basic Security Monitoring', () => {
    test('should process normal request successfully', async () => {
      const response = await request(testEnv.app)
        .get('/test/normal')
        .expect(200);

      expect(response.body.status).toBe('ok');

      // 統計を確認
      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.eventsProcessed).toBeGreaterThan(0);
    });

    test('should track request metrics', async () => {
      await request(testEnv.app).get('/test/normal');

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.performanceMetrics.requestCount).toBeGreaterThan(0);
      expect(stats.performanceMetrics.avgProcessingTime).toBeGreaterThan(0);
    });

    test('should handle errors properly', async () => {
      await request(testEnv.app)
        .get('/test/error')
        .expect(500);

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe('SQL Injection Detection', () => {
    test('should detect SQL injection in query parameters', async () => {
      const response = await request(testEnv.app)
        .get('/test/normal?id=1 OR 1=1')
        .expect(200);

      // 脅威が検出されたことを確認
      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.threatsDetected).toBeGreaterThan(0);
    });

    test('should detect SQL injection in POST body', async () => {
      await request(testEnv.app)
        .post('/test/data')
        .send({ query: "'; DROP TABLE users--" })
        .expect(200);

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.threatsDetected).toBeGreaterThan(0);
    });
  });

  describe('XSS Attack Detection', () => {
    test('should detect XSS in user agent', async () => {
      await request(testEnv.app)
        .get('/test/normal')
        .set('User-Agent', '<script>alert("XSS")</script>')
        .expect(200);

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.threatsDetected).toBeGreaterThan(0);
    });

    test('should detect XSS in query parameters', async () => {
      await request(testEnv.app)
        .get('/test/normal?name=<script>alert(1)</script>')
        .expect(200);

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.threatsDetected).toBeGreaterThan(0);
    });
  });

  describe('Path Traversal Detection', () => {
    test('should detect path traversal attempts', async () => {
      await request(testEnv.app)
        .get('/test/../../../etc/passwd')
        .expect(400);

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.blockedRequests).toBeGreaterThan(0);
    });

    test('should detect URL encoded path traversal', async () => {
      await request(testEnv.app)
        .get('/test/%2e%2e%2f%2e%2e%2fetc%2fpasswd')
        .expect(400);

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.blockedRequests).toBeGreaterThan(0);
    });
  });

  describe('Advanced Threat Detection', () => {
    test('should detect LDAP injection', async () => {
      await request(testEnv.app)
        .get('/test/normal?filter=admin)(uid=*')
        .expect(200);

      const advancedStats = testEnv.advancedThreatDetection.getStatistics();
      expect(advancedStats.ldapDetected).toBeGreaterThan(0);
    });

    test('should detect XXE attack', async () => {
      const xxePayload = '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>';

      await request(testEnv.app)
        .post('/test/data')
        .set('Content-Type', 'application/xml')
        .send(xxePayload)
        .expect(200);

      const advancedStats = testEnv.advancedThreatDetection.getStatistics();
      expect(advancedStats.xxeDetected).toBeGreaterThan(0);
    });

    test('should detect prototype pollution', async () => {
      await request(testEnv.app)
        .post('/test/data')
        .send({ '__proto__': { admin: true } })
        .expect(200);

      const advancedStats = testEnv.advancedThreatDetection.getStatistics();
      expect(advancedStats.prototypePollutionDetected).toBeGreaterThan(0);
    });

    test('should detect NoSQL injection', async () => {
      await request(testEnv.app)
        .post('/test/data')
        .send({ username: { '$ne': null }, password: { '$ne': null } })
        .expect(200);

      const advancedStats = testEnv.advancedThreatDetection.getStatistics();
      expect(advancedStats.nosqlDetected).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const requests = [];

      // 101リクエストを送信（制限は100）
      for (let i = 0; i < 101; i++) {
        requests.push(request(testEnv.app).get('/test/normal'));
      }

      const responses = await Promise.all(requests);

      // 最後のリクエストは429エラーになるはず
      const blockedRequests = responses.filter(r => r.status === 429);
      expect(blockedRequests.length).toBeGreaterThan(0);
    });

    test('should track rate limit violations', async () => {
      // レート制限を超える
      const requests = [];
      for (let i = 0; i < 150; i++) {
        requests.push(request(testEnv.app).get('/test/normal'));
      }
      await Promise.all(requests);

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.blockedRequests).toBeGreaterThan(0);
    });
  });

  describe('Database Integration', () => {
    test('should save events to database', async () => {
      await request(testEnv.app).get('/test/normal');

      // データベースにイベントが保存されているか確認
      const events = await testEnv.securityRepo.queryEvents(
        { type: 'REQUEST' },
        { limit: 10 }
      );

      expect(events.length).toBeGreaterThan(0);
    });

    test('should save incidents to database', async () => {
      // 脅威を発生させる
      await request(testEnv.app)
        .get('/test/normal?id=1 OR 1=1');

      // インシデントが保存されているか確認
      const incidents = await testEnv.securityRepo.queryIncidents(
        {},
        { limit: 10 }
      );

      expect(incidents.length).toBeGreaterThan(0);
    });

    test('should query events by filters', async () => {
      // いくつかのリクエストを送信
      await request(testEnv.app).get('/test/normal');
      await request(testEnv.app).get('/test/error');

      const now = Date.now();
      const events = await testEnv.securityRepo.queryEvents(
        {
          startTime: now - 60000,
          endTime: now
        },
        { limit: 100 }
      );

      expect(events.length).toBeGreaterThan(0);
    });

    test('should get database statistics', async () => {
      await request(testEnv.app).get('/test/normal');

      const stats = await testEnv.securityRepo.getStatistics({
        startTime: Date.now() - 60000,
        endTime: Date.now()
      });

      expect(stats.totalEvents).toBeGreaterThan(0);
    });
  });

  describe('Redis Cache Integration', () => {
    test('should use distributed rate limiting', async () => {
      const ip = '192.168.1.100';

      const result1 = await testEnv.redisCache.checkRateLimit(ip, 5, 60);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      // 5回のリクエスト後
      for (let i = 0; i < 5; i++) {
        await testEnv.redisCache.checkRateLimit(ip, 5, 60);
      }

      const result2 = await testEnv.redisCache.checkRateLimit(ip, 5, 60);
      expect(result2.allowed).toBe(false);
    });

    test('should manage IP blacklist', async () => {
      const ip = '10.0.0.1';

      // ブラックリストに追加
      await testEnv.redisCache.addToBlacklist(ip, 'Test blacklist', 60);

      // ブラックリストをチェック
      const check = await testEnv.redisCache.isBlacklisted(ip);
      expect(check.blacklisted).toBe(true);
      expect(check.reason).toBe('Test blacklist');

      // ブラックリストから削除
      await testEnv.redisCache.removeFromBlacklist(ip);

      const check2 = await testEnv.redisCache.isBlacklisted(ip);
      expect(check2.blacklisted).toBe(false);
    });

    test('should manage IP whitelist', async () => {
      const ip = '172.16.0.1';

      // ホワイトリストに追加
      await testEnv.redisCache.addToWhitelist(ip, 'Trusted IP');

      // ホワイトリストをチェック
      const check = await testEnv.redisCache.isWhitelisted(ip);
      expect(check.whitelisted).toBe(true);
    });

    test('should cache threat intelligence', async () => {
      const threatData = {
        type: 'SQL_INJECTION',
        patterns: ['OR 1=1', 'UNION SELECT'],
        severity: 'HIGH'
      };

      // キャッシュに保存
      await testEnv.redisCache.cacheThreatIntelligence('sql_injection', threatData, 300);

      // キャッシュから取得
      const cached = await testEnv.redisCache.getThreatIntelligence('sql_injection');
      expect(cached).toEqual(threatData);
    });

    test('should increment threat counters', async () => {
      const count1 = await testEnv.redisCache.incrementThreatCounter('xss_attack');
      expect(count1).toBe(1);

      const count2 = await testEnv.redisCache.incrementThreatCounter('xss_attack');
      expect(count2).toBe(2);

      const currentCount = await testEnv.redisCache.getThreatCounter('xss_attack');
      expect(currentCount).toBe(2);
    });
  });

  describe('Prometheus Metrics', () => {
    test('should expose metrics endpoint', async () => {
      const response = await request(testEnv.app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('security_events_total');
      expect(response.text).toContain('security_threats_detected_total');
    });

    test('should record security events', async () => {
      testEnv.prometheusMetrics.recordEvent('REQUEST', 'LOW');

      const metrics = await testEnv.prometheusMetrics.getMetricsJSON();
      const eventMetric = metrics.find(m => m.name === 'security_events_total');

      expect(eventMetric).toBeDefined();
    });

    test('should record threats', async () => {
      testEnv.prometheusMetrics.recordThreat('SQL_INJECTION', 'HIGH', true);

      const metrics = await testEnv.prometheusMetrics.getMetricsJSON();
      const threatMetric = metrics.find(m => m.name === 'security_threats_detected_total');

      expect(threatMetric).toBeDefined();
    });
  });

  describe('Webhook Notifications', () => {
    test('should register webhook', () => {
      const webhook = testEnv.webhookNotifier.registerWebhook('test_webhook', {
        url: 'http://localhost:9999/webhook',
        filters: { severity: ['HIGH', 'CRITICAL'] }
      });

      expect(webhook.id).toBe('test_webhook');
      expect(webhook.url).toBe('http://localhost:9999/webhook');
    });

    test('should filter alerts by severity', () => {
      testEnv.webhookNotifier.registerWebhook('filtered_webhook', {
        url: 'http://localhost:9999/webhook',
        filters: { severity: ['CRITICAL'] }
      });

      const alert1 = { severity: 'LOW', type: 'TEST' };
      const alert2 = { severity: 'CRITICAL', type: 'TEST' };

      const webhook = testEnv.webhookNotifier.getWebhook('filtered_webhook');
      const matches1 = testEnv.webhookNotifier.matchesFilters(alert1, webhook.filters);
      const matches2 = testEnv.webhookNotifier.matchesFilters(alert2, webhook.filters);

      expect(matches1).toBe(false);
      expect(matches2).toBe(true);
    });

    test('should track webhook statistics', () => {
      testEnv.webhookNotifier.registerWebhook('stats_webhook', {
        url: 'http://localhost:9999/webhook'
      });

      const stats = testEnv.webhookNotifier.getWebhookStats('stats_webhook');

      expect(stats.totalSent).toBe(0);
      expect(stats.totalSuccess).toBe(0);
      expect(stats.totalFailed).toBe(0);
    });
  });

  describe('End-to-End Scenarios', () => {
    test('complete attack detection and response flow', async () => {
      // 1. 攻撃リクエストを送信
      await request(testEnv.app)
        .get('/test/normal?id=1 UNION SELECT * FROM users')
        .expect(200);

      // 2. 脅威が検出されたことを確認
      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.threatsDetected).toBeGreaterThan(0);

      // 3. インシデントが作成されたことを確認
      expect(stats.incidentsCreated).toBeGreaterThan(0);

      // 4. データベースに保存されたことを確認
      const incidents = await testEnv.securityRepo.queryIncidents(
        { type: 'SQL_INJECTION' },
        { limit: 1 }
      );
      expect(incidents.length).toBeGreaterThan(0);

      // 5. メトリクスが記録されたことを確認
      const metricsResponse = await request(testEnv.app).get('/metrics');
      expect(metricsResponse.text).toContain('security_threats_detected_total');
    });

    test('rate limiting and blacklisting flow', async () => {
      const maliciousIP = '192.168.100.100';

      // 1. レート制限を超える大量のリクエスト
      const requests = [];
      for (let i = 0; i < 150; i++) {
        requests.push(
          request(testEnv.app)
            .get('/test/normal')
            .set('X-Forwarded-For', maliciousIP)
        );
      }
      await Promise.all(requests);

      // 2. IPがブラックリストに追加される
      await testEnv.redisCache.addToBlacklist(maliciousIP, 'Rate limit exceeded', 3600);

      // 3. ブラックリストされたIPからのリクエストがブロックされる
      const blacklistCheck = await testEnv.redisCache.isBlacklisted(maliciousIP);
      expect(blacklistCheck.blacklisted).toBe(true);

      // 4. 統計が正しく記録される
      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.blockedRequests).toBeGreaterThan(0);
    });

    test('multi-layer threat detection', async () => {
      // 複数の脅威を含むリクエスト
      await request(testEnv.app)
        .post('/test/data')
        .set('User-Agent', '<script>alert(1)</script>')
        .send({
          query: "' OR 1=1--",
          __proto__: { admin: true }
        })
        .expect(200);

      // 複数の脅威が検出されることを確認
      const stats = testEnv.securityMonitor.getStatistics();
      const advancedStats = testEnv.advancedThreatDetection.getStatistics();

      expect(stats.threatsDetected).toBeGreaterThan(0);
      expect(advancedStats.totalThreats).toBeGreaterThan(1);
    });
  });

  describe('Performance Tests', () => {
    test('should handle high request volume', async () => {
      const startTime = Date.now();
      const requests = [];

      // 1000リクエストを並行処理
      for (let i = 0; i < 1000; i++) {
        requests.push(request(testEnv.app).get('/test/normal'));
      }

      await Promise.all(requests);
      const duration = Date.now() - startTime;

      // 1000リクエストが30秒以内に処理されることを確認
      expect(duration).toBeLessThan(30000);

      const stats = testEnv.securityMonitor.getStatistics();
      expect(stats.eventsProcessed).toBeGreaterThanOrEqual(1000);
    });

    test('should maintain low memory usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // 大量のリクエストを処理
      const requests = [];
      for (let i = 0; i < 5000; i++) {
        requests.push(request(testEnv.app).get('/test/normal'));
      }
      await Promise.all(requests);

      // メモリクリーンアップを実行
      global.gc && global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // メモリ増加が500MB未満であることを確認
      expect(memoryIncrease).toBeLessThan(500);
    });

    test('should have low average response time', async () => {
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(request(testEnv.app).get('/test/normal'));
      }

      await Promise.all(requests);

      const stats = testEnv.securityMonitor.getStatistics();

      // 平均応答時間が50ms未満であることを確認
      expect(stats.performanceMetrics.avgProcessingTime).toBeLessThan(50);
    });
  });
});
