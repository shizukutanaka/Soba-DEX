/**
 * 統合パフォーマンス管理システム
 * ベンチマークと最適化を統合
 * 軽量で効率的な実装
 */

const { performance } = require('perf_hooks');

class UnifiedPerformanceManager {
  constructor() {
    this.cache = new Map();
    this.cacheSize = 0;
    this.maxCacheSize = 1000;
    this.compressionThreshold = 1024; // 1KB
    this.requestPool = [];
    this.poolSize = 0;
    this.maxPoolSize = 100;
    this.benchmarkResults = new Map();
    this.metrics = {
      totalRequests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      errorCount: 0,
      successCount: 0
    };
  }

  /**
   * シンプルなLRUキャッシュ
   */
  memoize(fn, keyFn = (...args) => JSON.stringify(args), ttl = 300000) {
    return (...args) => {
      const key = keyFn(...args);
      const now = Date.now();

      if (this.cache.has(key)) {
        const cached = this.cache.get(key);
        if (now - cached.timestamp < ttl) {
          return cached.value;
        }
        this.cache.delete(key);
        this.cacheSize--;
      }

      const result = fn(...args);

      // キャッシュが大きすぎる場合はクリーンアップ
      if (this.cacheSize >= this.maxCacheSize) {
        this.cleanOldestCache();
      }

      this.cache.set(key, {
        value: result,
        timestamp: now
      });
      this.cacheSize++;

      return result;
    };
  }

  /**
   * 古いキャッシュエントリを削除
   */
  cleanOldestCache() {
    const entries = Array.from(this.cache.entries());
    entries.sort(([,a], [,b]) => a.timestamp - b.timestamp);

    const toRemove = Math.floor(this.maxCacheSize * 0.3); // 30%削除
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
      this.cacheSize--;
    }
  }

  /**
   * オブジェクトプールの作成
   */
  createPool(factory, options = {}) {
    const pool = {
      factory,
      items: [],
      size: 0,
      maxSize: options.maxSize || this.maxPoolSize,
      created: 0,
      reused: 0,
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
      },
      clear: () => {
        pool.items = [];
        pool.size = 0;
      }
    };

    this.requestPool.push(pool);
    return pool;
  }

  /**
   * リクエスト処理時間の測定
   */
  measureRequest(handler) {
    return async (...args) => {
      const startTime = performance.now();
      this.metrics.totalRequests++;

      try {
        const result = await handler(...args);
        const responseTime = performance.now() - startTime;

        this.updateMetrics(responseTime, true);
        return result;
      } catch (error) {
        const responseTime = performance.now() - startTime;
        this.updateMetrics(responseTime, false);
        throw error;
      }
    };
  }

  /**
   * メトリクスの更新
   */
  updateMetrics(responseTime, success) {
    this.metrics.totalResponseTime += responseTime;
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.totalRequests;
    this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, responseTime);
    this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, responseTime);

    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.errorCount++;
    }
  }

  /**
   * ベンチマークの実行
   */
  async runBenchmark(name, fn, iterations = 100) {
    const results = [];
    const times = [];

    console.log(`Running benchmark: ${name} (${iterations} iterations)`);

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await fn();
      const endTime = performance.now();

      const iterationTime = endTime - startTime;
      times.push(iterationTime);
      results.push({
        iteration: i + 1,
        time: iterationTime,
        timestamp: new Date().toISOString()
      });
    }

    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const medianTime = this.calculateMedian(times);

    const benchmarkResult = {
      name,
      iterations,
      averageTime,
      minTime,
      maxTime,
      medianTime,
      totalTime: times.reduce((sum, time) => sum + time, 0),
      operationsPerSecond: 1000 / averageTime,
      results,
      timestamp: new Date().toISOString()
    };

    this.benchmarkResults.set(name, benchmarkResult);

    console.log(`Benchmark ${name} completed:`);
    console.log(`  Average: ${averageTime.toFixed(2)}ms`);
    console.log(`  Min: ${minTime.toFixed(2)}ms`);
    console.log(`  Max: ${maxTime.toFixed(2)}ms`);
    console.log(`  Median: ${medianTime.toFixed(2)}ms`);
    console.log(`  Ops/sec: ${(1000 / averageTime).toFixed(0)}`);

    return benchmarkResult;
  }

  /**
   * 中央値の計算
   */
  calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  /**
   * 比較ベンチマークの実行
   */
  async runComparisonBenchmark(name, benchmarks) {
    const results = {};

    for (const [benchmarkName, benchmarkFn] of Object.entries(benchmarks)) {
      results[benchmarkName] = await this.runBenchmark(
        `${name}_${benchmarkName}`,
        benchmarkFn,
        50 // 比較用は少ないイテレーション
      );
    }

    // 結果の比較
    const comparison = this.compareResults(results);

    console.log(`Comparison benchmark ${name} completed`);
    console.log(comparison);

    return {
      name,
      results,
      comparison,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 結果の比較
   */
  compareResults(results) {
    const comparison = {
      fastest: null,
      slowest: null,
      summary: {}
    };

    const entries = Object.entries(results);

    if (entries.length === 0) {
      return comparison;
    }

    // 最も速い/遅いものを特定
    comparison.fastest = entries.reduce((fastest, [name, result]) =>
      result.averageTime < fastest.averageTime ? { name, ...result } : fastest
    );

    comparison.slowest = entries.reduce((slowest, [name, result]) =>
      result.averageTime > slowest.averageTime ? { name, ...result } : slowest
    );

    // サマリーの作成
    comparison.summary = entries.map(([name, result]) => ({
      name,
      averageTime: result.averageTime,
      operationsPerSecond: result.operationsPerSecond,
      relativeSpeed: (comparison.fastest.averageTime / result.averageTime * 100).toFixed(1) + '%'
    }));

    return comparison;
  }

  /**
   * パフォーマンスレポートの生成
   */
  generatePerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      cache: {
        size: this.cacheSize,
        maxSize: this.maxCacheSize,
        utilization: ((this.cacheSize / this.maxCacheSize) * 100).toFixed(2) + '%'
      },
      pools: this.requestPool.map(pool => ({
        size: pool.size,
        maxSize: pool.maxSize,
        utilization: ((pool.size / pool.maxSize) * 100).toFixed(2) + '%',
        created: pool.created,
        reused: pool.reused
      })),
      metrics: {
        ...this.metrics,
        successRate: ((this.metrics.successCount / this.metrics.totalRequests) * 100).toFixed(2) + '%',
        errorRate: ((this.metrics.errorCount / this.metrics.totalRequests) * 100).toFixed(2) + '%'
      },
      benchmarks: Object.fromEntries(this.benchmarkResults)
    };

    return report;
  }

  /**
   * キャッシュのクリア
   */
  clearCache() {
    this.cache.clear();
    this.cacheSize = 0;
  }

  /**
   * プールのクリア
   */
  clearPools() {
    this.requestPool.forEach(pool => pool.clear());
    this.poolSize = 0;
  }

  /**
   * 最適化の実行
   */
  optimize() {
    // キャッシュの最適化
    if (this.cacheSize > this.maxCacheSize * 0.8) {
      this.cleanOldestCache();
    }

    // プールの最適化
    this.requestPool.forEach(pool => {
      if (pool.size > pool.maxSize * 0.8) {
        pool.clear();
      }
    });

    // メトリクスのリセット（オプション）
    this.resetMetrics();

    console.log('Performance optimization completed');
  }

  /**
   * メトリクスのリセット
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      errorCount: 0,
      successCount: 0
    };
  }

  /**
   * ベンチマーク結果の取得
   */
  getBenchmarkResult(name) {
    return this.benchmarkResults.get(name);
  }

  /**
   * すべてのベンチマーク結果の取得
   */
  getAllBenchmarkResults() {
    return Object.fromEntries(this.benchmarkResults);
  }
}

// シングルトンインスタンス
let unifiedPerformanceManager = null;

const createUnifiedPerformanceManager = () => {
  if (!unifiedPerformanceManager) {
    unifiedPerformanceManager = new UnifiedPerformanceManager();
  }
  return unifiedPerformanceManager;
};

module.exports = {
  UnifiedPerformanceManager,
  createUnifiedPerformanceManager
};
