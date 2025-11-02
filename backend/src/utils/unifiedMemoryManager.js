/**
 * 統合メモリ管理システム
 * メモリリーク検出と最適化を統合
 * John Carmackの設計原則に基づく効率的な実装
 */

const { EventEmitter } = require('events');

class UnifiedMemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      gcInterval: 30000, // 30 seconds
      memoryThreshold: 0.85, // 85% of heap
      cleanupThreshold: 0.75, // 75% of heap
      maxHeapSize: 1024 * 1024 * 1024, // 1GB default
      enableAutoCleanup: true,
      enableGC: true,
      snapshotInterval: 60000, // 1 minute
      maxSnapshots: 100,
      heapGrowthThreshold: 50, // MB
      alertThreshold: 80, // % of max heap
      maxAlerts: 10,
      ...options
    };

    this.pools = new Map(); // Object pools
    this.watchers = new Set(); // Memory watchers
    this.gcTimer = null;
    this.monitoringTimer = null;
    this.baseline = null;
    this.snapshots = [];
    this.alerts = [];
    this.stats = {
      gcCalls: 0,
      cleanupCalls: 0,
      memoryFreed: 0,
      peakUsage: 0,
      leakDetected: false
    };

    this.startMonitoring();
    this.startLeakDetection();
  }

  /**
   * メモリ監視の開始
   */
  startMonitoring() {
    this.gcTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, this.options.gcInterval);

    // ピーク使用量の追跡
    this.updatePeakUsage();
  }

  /**
   * メモリリーク検出の開始
   */
  startLeakDetection() {
    this.baseline = this.takeSnapshot();

    this.monitoringTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, this.options.snapshotInterval);
  }

  /**
   * メモリ使用量のチェックとクリーンアップ
   */
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed;
    const heapTotal = usage.heapTotal;
    const usageRatio = heapUsed / heapTotal;

    // ピーク使用量の更新
    if (heapUsed > this.stats.peakUsage) {
      this.stats.peakUsage = heapUsed;
    }

    // メモリ使用量が閾値を超えた場合の処理
    if (usageRatio > this.options.memoryThreshold) {
      this.emit('memoryHigh', {
        usageRatio: (usageRatio * 100).toFixed(2) + '%',
        heapUsed: Math.round(heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(heapTotal / 1024 / 1024) + 'MB'
      });

      if (this.options.enableAutoCleanup) {
        this.performCleanup();
      }
    }

    // メモリリークの検出
    this.detectMemoryLeaks(usage);
  }

  /**
   * メモリスナップショットの取得
   */
  takeSnapshot() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const snapshot = {
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      cpuUser: cpuUsage.user,
      cpuSystem: cpuUsage.system,
      pools: this.pools.size,
      watchers: this.watchers.size
    };

    this.snapshots.push(snapshot);

    // スナップショットの最大数を制限
    if (this.snapshots.length > this.options.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * メモリリークの検出
   */
  detectMemoryLeaks(currentUsage) {
    if (!this.baseline) {
      return;
    }

    const heapGrowth = currentUsage.heapUsed - this.baseline.heapUsed;
    const growthInMB = heapGrowth / 1024 / 1024;

    // ヒープ使用量が大幅に増加した場合
    if (growthInMB > this.options.heapGrowthThreshold) {
      this.stats.leakDetected = true;

      this.emit('memoryLeak', {
        growth: Math.round(growthInMB) + 'MB',
        threshold: this.options.heapGrowthThreshold + 'MB',
        currentUsage: Math.round(currentUsage.heapUsed / 1024 / 1024) + 'MB',
        baseline: Math.round(this.baseline.heapUsed / 1024 / 1024) + 'MB'
      });

      // 自動クリーンアップの実行
      this.performCleanup();
    }
  }

  /**
   * クリーンアップの実行
   */
  performCleanup() {
    this.stats.cleanupCalls++;

    // ガベージコレクションの実行
    if (this.options.enableGC && global.gc) {
      const beforeGC = process.memoryUsage().heapUsed;
      global.gc();
      const afterGC = process.memoryUsage().heapUsed;
      const freed = beforeGC - afterGC;

      this.stats.memoryFreed += freed;

      this.emit('gcCompleted', {
        freed: Math.round(freed / 1024 / 1024) + 'MB',
        before: Math.round(beforeGC / 1024 / 1024) + 'MB',
        after: Math.round(afterGC / 1024 / 1024) + 'MB'
      });
    }

    // オブジェクトプールのクリーンアップ
    this.cleanupObjectPools();

    // メモリウォッチャーのクリーンアップ
    this.cleanupWatchers();

    // 古いスナップショットのクリーンアップ
    this.cleanupOldSnapshots();
  }

  /**
   * オブジェクトプールのクリーンアップ
   */
  cleanupObjectPools() {
    for (const [name, pool] of this.pools) {
      if (pool.size > pool.maxSize) {
        pool.clear();
        this.emit('poolCleaned', { pool: name });
      }
    }
  }

  /**
   * メモリウォッチャーのクリーンアップ
   */
  cleanupWatchers() {
    // 不要なウォッチャーを削除
    for (const watcher of this.watchers) {
      if (watcher.isExpired && watcher.isExpired()) {
        this.watchers.delete(watcher);
      }
    }
  }

  /**
   * 古いスナップショットのクリーンアップ
   */
  cleanupOldSnapshots() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24時間前

    this.snapshots = this.snapshots.filter(snapshot =>
      snapshot.timestamp > cutoff
    );
  }

  /**
   * オブジェクトプールの作成
   */
  createPool(name, factory, options = {}) {
    const pool = {
      name,
      factory,
      items: [],
      size: 0,
      maxSize: options.maxSize || 100,
      created: 0,
      reused: 0,
      clear: () => {
        pool.items = [];
        pool.size = 0;
      },
      get: () => {
        const item = pool.items.pop();
        if (item) {
          pool.reused++;
          return item;
        }

        pool.created++;
        return pool.factory();
      },
      release: (item) => {
        if (pool.size < pool.maxSize) {
          pool.items.push(item);
          pool.size++;
        }
      }
    };

    this.pools.set(name, pool);
    return pool;
  }

  /**
   * メモリウォッチャーの追加
   */
  addWatcher(watcher) {
    this.watchers.add(watcher);
    return watcher;
  }

  /**
   * メモリウォッチャーの削除
   */
  removeWatcher(watcher) {
    this.watchers.delete(watcher);
  }

  /**
   * メモリ統計の取得
   */
  getMemoryStats() {
    const usage = process.memoryUsage();
    const usageRatio = usage.heapUsed / usage.heapTotal;

    return {
      current: {
        rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(usage.external / 1024 / 1024) + 'MB',
        usageRatio: (usageRatio * 100).toFixed(2) + '%'
      },
      stats: {
        ...this.stats,
        peakUsageMB: Math.round(this.stats.peakUsage / 1024 / 1024) + 'MB'
      },
      pools: Object.fromEntries(
        Array.from(this.pools.entries()).map(([name, pool]) => [
          name,
          {
            size: pool.size,
            maxSize: pool.maxSize,
            created: pool.created,
            reused: pool.reused
          }
        ])
      ),
      snapshots: this.snapshots.length,
      watchers: this.watchers.size,
      alerts: this.alerts.length
    };
  }

  /**
   * メモリ使用量の最適化
   */
  optimizeMemory() {
    // すべてのプールを最適化
    for (const pool of this.pools.values()) {
      if (pool.size > pool.maxSize * 0.5) {
        pool.clear();
      }
    }

    // 不要なウォッチャーを削除
    this.cleanupWatchers();

    // ガベージコレクションの実行
    if (global.gc) {
      global.gc();
    }

    this.emit('memoryOptimized', {
      poolsCleared: this.pools.size,
      watchersRemoved: this.watchers.size
    });
  }

  /**
   * 監視の停止
   */
  stopMonitoring() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * ピーク使用量の更新
   */
  updatePeakUsage() {
    const usage = process.memoryUsage();
    if (usage.heapUsed > this.stats.peakUsage) {
      this.stats.peakUsage = usage.heapUsed;
    }
  }
}

// シングルトンインスタンス
let unifiedMemoryManager = null;

const createUnifiedMemoryManager = (options = {}) => {
  if (!unifiedMemoryManager) {
    unifiedMemoryManager = new UnifiedMemoryManager(options);
  }
  return unifiedMemoryManager;
};

module.exports = {
  UnifiedMemoryManager,
  createUnifiedMemoryManager
};
