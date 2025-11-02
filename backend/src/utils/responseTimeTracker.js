/**
 * レスポンスタイム測定ユーティリティ
 * John Carmack, Robert C. Martin, Rob Pikeの設計原則に基づく
 * - 単一責任の原則（SRP）
 * - 関数の明確な分離
 * - 軽量で効率的な実装
 */

const createResponseTimeTracker = (logger, logSystemMessage) => {
  const responseTimes = new Map();
  const slowQueryThreshold = 1000; // 1秒
  const metrics = {
    totalRequests: 0,
    slowRequests: 0,
    averageResponseTime: 0,
    maxResponseTime: 0,
    minResponseTime: Infinity,
    responseTimeBuckets: {
      '<100ms': 0,
      '100-500ms': 0,
      '500-1000ms': 0,
      '1-5s': 0,
      '>5s': 0
    }
  };

  /**
   * レスポンスタイムを測定
   */
  const recordResponseTime = (endpoint, method, responseTime) => {
    const _requestId = `${endpoint}_${method}_${Date.now()}_${Math.random()}`;

    metrics.totalRequests++;

    // レスポンスタイムを分類
    const bucket = getResponseTimeBucket(responseTime);
    metrics.responseTimeBuckets[bucket]++;

    // 統計情報の更新
    metrics.averageResponseTime =
      (metrics.averageResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;

    if (responseTime > metrics.maxResponseTime) {
      metrics.maxResponseTime = responseTime;
    }

    if (responseTime < metrics.minResponseTime) {
      metrics.minResponseTime = responseTime;
    }

    if (responseTime > slowQueryThreshold) {
      metrics.slowRequests++;
      logSystemMessage('warn', 'Slow response detected', {
        endpoint,
        method,
        responseTime: `${responseTime}ms`,
        threshold: `${slowQueryThreshold}ms`
      });
    }

    // エンドポイント別の統計を更新
    const endpointKey = `${method} ${endpoint}`;
    if (!responseTimes.has(endpointKey)) {
      responseTimes.set(endpointKey, []);
    }
    const endpointData = responseTimes.get(endpointKey);
    endpointData.push(responseTime);

    // 履歴サイズを制限
    if (endpointData.length > 100) {
      endpointData.shift();
    }
  };

  /**
   * レスポンスタイム測定ミドルウェア
   */
  const measureResponseTime = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const endpoint = req.route?.path || req.path;
      const method = req.method;
      recordResponseTime(endpoint, method, duration);
    });

    next();
  };

  /**
   * レスポンスタイムを分類
   */
  const getResponseTimeBucket = (responseTime) => {
    if (responseTime < 100) {
      return '<100ms';
    }
    if (responseTime < 500) {
      return '100-500ms';
    }
    if (responseTime < 1000) {
      return '500-1000ms';
    }
    if (responseTime < 5000) {
      return '1-5s';
    }
    return '>5s';
  };

  /**
   * メトリクスを取得
   */
  const getMetrics = () => {
    const slowRequestRate = metrics.totalRequests > 0
      ? (metrics.slowRequests / metrics.totalRequests * 100).toFixed(2)
      : 0;

    return {
      ...metrics,
      slowRequestRate: `${slowRequestRate}%`,
      totalResponseTimes: responseTimes.size,
      lastUpdated: new Date().toISOString()
    };
  };

  /**
   * エンドポイント別の統計を取得
   */
  const getEndpointStats = () => {
    const endpointStats = new Map();

    for (const [_requestId, data] of responseTimes) {
      if (!endpointStats.has(data.endpoint)) {
        endpointStats.set(data.endpoint, {
          totalRequests: 0,
          totalResponseTime: 0,
          slowRequests: 0,
          averageResponseTime: 0,
          maxResponseTime: 0,
          minResponseTime: Infinity
        });
      }

      const stats = endpointStats.get(data.endpoint);
      stats.totalRequests++;
      stats.totalResponseTime += data.responseTime;

      if (data.responseTime > stats.maxResponseTime) {
        stats.maxResponseTime = data.responseTime;
      }

      if (data.responseTime < stats.minResponseTime) {
        stats.minResponseTime = data.responseTime;
      }

      if (data.responseTime > slowQueryThreshold) {
        stats.slowRequests++;
      }
    }

    // 平均レスポンスタイムを計算
    for (const [_endpoint, stats] of endpointStats) {
      stats.averageResponseTime = stats.totalRequests > 0
        ? stats.totalResponseTime / stats.totalRequests
        : 0;
    }

    return Object.fromEntries(endpointStats);
  };

  /**
   * スロークエリレポートを生成
   */
  const generateSlowQueryReport = () => {
    const slowQueries = Array.from(responseTimes.values())
      .filter(data => data.responseTime > slowQueryThreshold)
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 10); // 最新10件

    return {
      totalSlowQueries: metrics.slowRequests,
      slowQueryRate: `${((metrics.slowRequests / metrics.totalRequests) * 100).toFixed(2)}%`,
      slowestQueries: slowQueries,
      threshold: slowQueryThreshold,
      generatedAt: new Date().toISOString()
    };
  };

  /**
   * アラートをチェック
   */
  const checkAlerts = () => {
    const alerts = [];

    if (metrics.totalRequests > 0) {
      const slowRate = (metrics.slowRequests / metrics.totalRequests) * 100;

      if (slowRate > 10) { // 10%以上のスロークエリ
        alerts.push({
          level: 'warning',
          message: `High slow query rate: ${slowRate.toFixed(2)}%`,
          metric: 'slowQueryRate',
          value: slowRate,
          threshold: 10
        });
      }

      if (metrics.averageResponseTime > 2000) { // 平均2秒以上
        alerts.push({
          level: 'warning',
          message: `High average response time: ${metrics.averageResponseTime.toFixed(0)}ms`,
          metric: 'averageResponseTime',
          value: metrics.averageResponseTime,
          threshold: 2000
        });
      }
    }

    return alerts;
  };

  /**
   * 定期的なレポートを生成
   */
  const generatePerformanceReport = () => {
    const report = {
      ...getMetrics(),
      endpointStats: getEndpointStats(),
      slowQueryReport: generateSlowQueryReport(),
      alerts: checkAlerts(),
      reportGeneratedAt: new Date().toISOString()
    };

    // 重要なメトリクスだけをログ出力
    logSystemMessage('info', 'Performance metrics summary', {
      totalRequests: metrics.totalRequests,
      slowRequestRate: `${((metrics.slowRequests / metrics.totalRequests) * 100).toFixed(2)}%`,
      averageResponseTime: `${metrics.averageResponseTime.toFixed(0)}ms`,
      maxResponseTime: `${metrics.maxResponseTime}ms`,
      alertCount: report.alerts.length
    });

    return report;
  };

  /**
   * 統計情報をリセット
   */
  const resetMetrics = () => {
    for (const key in metrics) {
      if (typeof metrics[key] === 'number') {
        metrics[key] = 0;
      } else if (typeof metrics[key] === 'object') {
        for (const bucket in metrics[key]) {
          metrics[key][bucket] = 0;
        }
      }
    }
    metrics.minResponseTime = Infinity;
    responseTimes.clear();
  };

  return {
    measureResponseTime,
    recordResponseTime,
    getMetrics,
    getEndpointStats,
    generateSlowQueryReport,
    generatePerformanceReport,
    checkAlerts,
    resetMetrics
  };
};

module.exports = { createResponseTimeTracker };

