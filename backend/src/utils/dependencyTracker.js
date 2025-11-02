/**
 * 依存関係ステータストラッキングユーティリティ
 * John Carmack, Robert C. Martin, Rob Pikeの設計原則に基づく
 * - 単一責任の原則（SRP）
 * - 関数の明確な分離
 * - 軽量で効率的な実装
 */

const createDependencyTracker = () => {
  const trackers = {
    cache: {
      enabled: undefined,
      lastChangedAt: null,
      changeCount: 0,
      disabledCount: 0
    },
    websocket: {
      enabled: undefined,
      lastChangedAt: null,
      changeCount: 0,
      disabledCount: 0
    }
  };

  /**
   * 依存関係のステータスを更新
   */
  const updateStatus = (dependencyName, isEnabled) => {
    const tracker = trackers[dependencyName];

    if (!tracker) {
      return false; // 無効な依存関係名
    }

    if (tracker.enabled === isEnabled) {
      return false; // ステータス変更なし
    }

    tracker.enabled = isEnabled;
    tracker.lastChangedAt = new Date().toISOString();
    tracker.changeCount = (tracker.changeCount || 0) + 1;
    if (!isEnabled) {
      tracker.disabledCount = (tracker.disabledCount || 0) + 1;
    }

    return true; // ステータスが変更された
  };

  /**
   * 依存関係のステータスを取得
   */
  const getStatus = (dependencyName) => {
    return trackers[dependencyName] || null;
  };

  /**
   * 全ての依存関係のステータスを取得
   */
  const getAllStatuses = () => {
    return { ...trackers };
  };

  /**
   * 依存関係の統計情報を取得
   */
  const getStats = (dependencyName) => {
    const tracker = trackers[dependencyName];
    if (!tracker) {
      return null;
    }

    const now = Date.now();
    const lastChangedAt = tracker.lastChangedAt ? new Date(tracker.lastChangedAt).getTime() : null;
    const timeSinceLastChangeMs = lastChangedAt ? Math.max(0, now - lastChangedAt) : null;

    return {
      enabled: tracker.enabled,
      lastChangedAt: tracker.lastChangedAt,
      timeSinceLastChangeMs,
      changeCount: tracker.changeCount,
      disabledCount: tracker.disabledCount
    };
  };

  /**
   * 依存関係のメタデータを構築
   */
  const buildMeta = (dependencyName) => {
    return getStats(dependencyName);
  };

  return {
    updateStatus,
    getStatus,
    getAllStatuses,
    getStats,
    buildMeta
  };
};
