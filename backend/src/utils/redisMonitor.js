/**
 * Redisキャッシュ監視ユーティリティ
 * John Carmack, Robert C. Martin, Rob Pikeの設計原則に基づく
 * - 単一責任の原則（SRP）
 * - 関数の明確な分離
 * - 軽量で効率的な実装
 */

const createRedisMonitor = (logger, logSystemMessage) => {
  let redisCache = null;
  const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheErrors: 0,
    hitRate: 0,
    averageResponseTime: 0,
    maxResponseTime: 0,
    minResponseTime: Infinity,
    cacheSize: 0,
    memoryUsage: 0
  };

  /**
   * Redisキャッシュを設定
   */
  const setRedisCache = (cacheInstance) => {
    redisCache = cacheInstance;
    logSystemMessage('info', 'Redis cache monitor initialized');
  };

  /**
   * キャッシュ操作を監視
   */
  const monitorCacheOperation = async (operation, key, startTime = Date.now()) => {
    if (!redisCache) {
      return { success: false, error: 'Redis cache not available' };
    }

    metrics.totalRequests++;
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    try {
      let result;
      let isHit = false;

      switch (operation) {
      case 'get':
        result = await redisCache.get(key);
        isHit = result !== null && result !== undefined;
        if (isHit) {
          metrics.cacheHits++;
        } else {
          metrics.cacheMisses++;
        }
        break;

      case 'set':
        result = await redisCache.set(key, ...[].slice(3));
        isHit = true; // setは常に成功とみなす
        break;

      case 'del':
        result = await redisCache.del(key);
        isHit = result > 0; // 削除されたキーがあればヒット
        break;

      case 'exists':
        result = await redisCache.exists(key);
        isHit = result === 1;
        break;

      default:
        throw new Error(`Unsupported operation: ${operation}`);
      }

      // レスポンスタイムの統計を更新
      metrics.averageResponseTime =
        (metrics.averageResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;

      if (responseTime > metrics.maxResponseTime) {
        metrics.maxResponseTime = responseTime;
      }

      if (responseTime < metrics.minResponseTime) {
        metrics.minResponseTime = responseTime;
      }

      // ヒット率を更新
      const totalCacheOps = metrics.cacheHits + metrics.cacheMisses;
      metrics.hitRate = totalCacheOps > 0 ? (metrics.cacheHits / totalCacheOps * 100) : 0;

      return { success: true, result, isHit, responseTime };

    } catch (error) {
      metrics.cacheErrors++;
      logSystemMessage('error', 'Redis cache operation failed', {
        operation,
        key,
        error: error.message,
        responseTime
      });

      return { success: false, error: error.message, responseTime };
    }
  };

  /**
   * キャッシュ統計を取得
   */
  const getCacheStats = async () => {
    if (!redisCache) {
      return { ...metrics, available: false };
    }

    try {
      // Redisのinfoコマンドで統計情報を取得
      const info = await redisCache.info();
      const lines = info.split('\n');
      const stats = {};

      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          stats[key] = isNaN(value) ? value : Number(value);
        }
      }

      // メモリ使用量を取得
      const memoryUsage = stats.used_memory || 0;

      // キャッシュサイズを取得（keysコマンドで概算）
      let cacheSize = 0;
      try {
        cacheSize = await redisCache.dbsize() || 0;
      } catch (_error) {
        // dbsizeが利用できない場合
        cacheSize = metrics.cacheHits + metrics.cacheMisses;
      }

      return {
        ...metrics,
        available: true,
        memoryUsage,
        cacheSize,
        redisStats: {
          connectedClients: stats.connected_clients,
          totalConnections: stats.total_connections_received,
          totalCommands: stats.total_commands_processed,
          rejectedConnections: stats.rejected_connections,
          evictedKeys: stats.evicted_keys,
          keyspaceHits: stats.keyspace_hits,
          keyspaceMisses: stats.keyspace_misses
        }
      };

    } catch (error) {
      logSystemMessage('error', 'Failed to get Redis stats', { error: error.message });
      return { ...metrics, available: false, error: error.message };
    }
  };

  /**
   * キャッシュパフォーマンスレポートを生成
   */
  const generateCacheReport = async () => {
    const stats = await getCacheStats();
    const cacheEfficiency = stats.hitRate > 0 ? (stats.hitRate / 100) : 0;

    // キャッシュ効率の評価
    let efficiencyRating = 'poor';
    if (stats.hitRate >= 90) {
      efficiencyRating = 'excellent';
    } else if (stats.hitRate >= 75) {
      efficiencyRating = 'good';
    } else if (stats.hitRate >= 50) {
      efficiencyRating = 'fair';
    }

    const report = {
      ...stats,
      cacheEfficiency,
      efficiencyRating,
      recommendations: [],
      generatedAt: new Date().toISOString()
    };

    // 推奨事項を生成
    if (stats.hitRate < 50) {
      report.recommendations.push('Consider reviewing cache strategy - hit rate is very low');
    }

    if (stats.cacheErrors > stats.totalRequests * 0.1) {
      report.recommendations.push('High error rate detected - check Redis connectivity');
    }

    if (stats.averageResponseTime > 100) {
      report.recommendations.push('Slow cache response times - consider Redis optimization');
    }

    if (stats.memoryUsage > 100 * 1024 * 1024) { // 100MB
      report.recommendations.push('High memory usage - consider cache size optimization');
    }

    return report;
  };

  /**
   * アラートをチェック
   */
  const checkAlerts = async () => {
    const stats = await getCacheStats();
    const alerts = [];

    if (stats.hitRate < 30) {
      alerts.push({
        level: 'critical',
        message: `Very low cache hit rate: ${stats.hitRate.toFixed(2)}%`,
        metric: 'hitRate',
        value: stats.hitRate,
        threshold: 30
      });
    } else if (stats.hitRate < 50) {
      alerts.push({
        level: 'warning',
        message: `Low cache hit rate: ${stats.hitRate.toFixed(2)}%`,
        metric: 'hitRate',
        value: stats.hitRate,
        threshold: 50
      });
    }

    if (stats.cacheErrors > stats.totalRequests * 0.05) { // 5%以上のエラー
      alerts.push({
        level: 'critical',
        message: `High cache error rate: ${((stats.cacheErrors / stats.totalRequests) * 100).toFixed(2)}%`,
        metric: 'errorRate',
        value: (stats.cacheErrors / stats.totalRequests) * 100,
        threshold: 5
      });
    }

    if (stats.averageResponseTime > 200) { // 200ms以上の平均レスポンスタイム
      alerts.push({
        level: 'warning',
        message: `Slow cache response time: ${stats.averageResponseTime.toFixed(0)}ms`,
        metric: 'responseTime',
        value: stats.averageResponseTime,
        threshold: 200
      });
    }

    return alerts;
  };

  /**
   * 定期的なメンテナンス
   */
  const startMaintenanceTasks = () => {
    // 1分ごとにキャッシュ統計をチェック
    setInterval(async () => {
      const alerts = await checkAlerts();
      if (alerts.length > 0) {
        logSystemMessage('warn', 'Redis cache alerts detected', {
          alertCount: alerts.length,
          alerts: alerts.map(a => `${a.level}: ${a.message}`)
        });
      }
    }, 60000);

    // 5分ごとに詳細レポートを生成
    setInterval(async () => {
      const report = await generateCacheReport();
      logSystemMessage('info', 'Redis cache performance report', {
        hitRate: `${report.hitRate.toFixed(2)}%`,
        efficiency: report.efficiencyRating,
        totalRequests: report.totalRequests,
        errorRate: `${((report.cacheErrors / report.totalRequests) * 100).toFixed(2)}%`,
        recommendationCount: report.recommendations.length
      });
    }, 5 * 60 * 1000);

    logSystemMessage('info', 'Redis cache monitoring started');
  };

  /**
   * メトリクスをリセット
   */
  const resetMetrics = () => {
    for (const key in metrics) {
      if (typeof metrics[key] === 'number') {
        metrics[key] = 0;
      }
    }
    metrics.minResponseTime = Infinity;
    logSystemMessage('info', 'Redis cache metrics reset');
  };

  return {
    setRedisCache,
    monitorCacheOperation,
    getCacheStats,
    generateCacheReport,
    checkAlerts,
    startMaintenanceTasks,
    resetMetrics
  };
};
