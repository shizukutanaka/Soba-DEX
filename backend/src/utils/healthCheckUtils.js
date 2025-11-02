/**
 * ヘルスチェックユーティリティ関数
 * John Carmack, Robert C. Martin, Rob Pikeの設計原則に基づく
 * - 単一責任の原則（SRP）
 * - 関数の明確な分離
 * - 軽量で効率的な実装
 */

const createHealthCheckUtils = (logger, logSystemMessage, isShuttingDown, dependencyTracker, redisCache, enhancedWebSocketService, getRequestLifecycleSummary, getRequestLifecycleConfig, evaluateRequestLifecycleStatus) => {
  /**
   * 依存関係の統計情報を収集
   */
  const collectDependencyStats = () => {
    const defaultCacheStats = {
      enabled: false,
      hitRate: 0,
      fallbackCacheSize: 0,
      errors: 0
    };

    const defaultWebsocketStats = {
      enabled: false,
      activeClients: 0,
      activeChannels: 0,
      messages: 0,
      uptime: 0
    };

    let cacheStats = defaultCacheStats;
    if (redisCache && typeof redisCache.getStats === 'function') {
      try {
        cacheStats = { ...defaultCacheStats, ...redisCache.getStats() };
      } catch (error) {
        logSystemMessage('error', 'Failed to collect cache stats', { error: error.message });
      }
    }

    let websocketStats = defaultWebsocketStats;
    if (enhancedWebSocketService && typeof enhancedWebSocketService.getStats === 'function') {
      try {
        websocketStats = { ...defaultWebsocketStats, ...enhancedWebSocketService.getStats() };
      } catch (error) {
        logSystemMessage('error', 'Failed to collect WebSocket stats', { error: error.message });
      }
    }

    return { cacheStats, websocketStats };
  };

  /**
   * リクエストライフサイクルの統計情報を収集
   */
  const collectRequestLifecycleStats = () => {
    const requestSummary = getRequestLifecycleSummary();
    const { thresholds } = getRequestLifecycleConfig();
    const requestStats = requestSummary?.stats || {};
    const requestHealth = evaluateRequestLifecycleStatus(requestStats, thresholds);

    return { requestSummary, thresholds, requestStats, requestHealth };
  };

  /**
   * 失敗している依存関係を判定
   */
  const getFailingDependencies = (cacheStats, websocketStats) => {
    const failingDependencies = [];
    if (!cacheStats.enabled) {
      failingDependencies.push('cache');
    }
    if (!websocketStats.enabled) {
      failingDependencies.push('websocket');
    }
    return failingDependencies;
  };

  return {
    collectDependencyStats,
    collectRequestLifecycleStats,
    getFailingDependencies
  };
};
