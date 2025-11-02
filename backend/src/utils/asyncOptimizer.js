/**
 * 非同期処理最適化ユーティリティ
 * John Carmack, Robert C. Martin, Rob Pikeの設計原則に基づく
 * - 単一責任の原則（SRP）
 * - 関数の明確な分離
 * - 軽量で効率的な実装
 */

const createAsyncOptimizer = (logger, logSystemMessage) => {
  const activePromises = new Map();
  const promisePool = new Map();
  const metrics = {
    totalPromises: 0,
    completedPromises: 0,
    failedPromises: 0,
    averageExecutionTime: 0,
    maxExecutionTime: 0,
    minExecutionTime: Infinity,
    timeoutCount: 0,
    retryCount: 0,
    concurrentLimit: 10,
    currentConcurrent: 0,
    maxConcurrent: 0
  };

  const PROMISE_TIMEOUT = 30000; // 30秒
  const MAX_RETRY_ATTEMPTS = 3;
  const BATCH_SIZE = 5;

  /**
   * Promiseを最適化して実行
   */
  const executePromise = async (promiseFn, options = {}) => {
    const promiseId = `promise_${Date.now()}_${Math.random()}`;
    const startTime = Date.now();

    const config = {
      timeout: options.timeout || PROMISE_TIMEOUT,
      retries: options.retries || MAX_RETRY_ATTEMPTS,
      priority: options.priority || 'normal',
      batchable: options.batchable !== false,
      ...options
    };

    metrics.totalPromises++;

    // 同時実行数の追跡
    metrics.currentConcurrent++;
    if (metrics.currentConcurrent > metrics.maxConcurrent) {
      metrics.maxConcurrent = metrics.currentConcurrent;
    }

    try {
      // Promiseを登録
      activePromises.set(promiseId, {
        startTime,
        config,
        status: 'running'
      });

      // Promiseを実行
      const result = await executeWithTimeout(promiseFn, config.timeout, promiseId);

      // 統計を更新
      const executionTime = Date.now() - startTime;
      updatePromiseStats(executionTime, true);

      activePromises.delete(promiseId);
      metrics.currentConcurrent--;

      return result;

    } catch (error) {
      metrics.failedPromises++;
      updatePromiseStats(Date.now() - startTime, false);

      activePromises.delete(promiseId);
      metrics.currentConcurrent--;

      logSystemMessage('error', 'Promise execution failed', {
        promiseId,
        error: error.message,
        executionTime: Date.now() - startTime
      });

      throw error;
    }
  };

  /**
   * タイムアウト付きでPromiseを実行
   */
  const executeWithTimeout = (promiseFn, timeout, _promiseId) => {
    return new Promise((resolve, reject) => {
      // Execute async operations inside promise body
      const timeoutId = setTimeout(() => {
        metrics.timeoutCount++;
        reject(new Error(`Promise timeout after ${timeout}ms`));
      }, timeout);

      promiseFn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  };

  /**
   * Promise統計を更新
   */
  const updatePromiseStats = (executionTime, success) => {
    if (executionTime < metrics.minExecutionTime) {
      metrics.minExecutionTime = executionTime;
    }

    if (executionTime > metrics.maxExecutionTime) {
      metrics.maxExecutionTime = executionTime;
    }

    metrics.averageExecutionTime =
      (metrics.averageExecutionTime * (metrics.completedPromises + metrics.failedPromises - 1) + executionTime) /
      (metrics.completedPromises + metrics.failedPromises);

    if (success) {
      metrics.completedPromises++;
    }
  };

  /**
   * Promiseを並列実行（最適化）
   */
  const executeParallel = async (promiseFns, options = {}) => {
    const batchSize = options.batchSize || BATCH_SIZE;
    const results = [];
    const errors = [];

    for (let i = 0; i < promiseFns.length; i += batchSize) {
      const batch = promiseFns.slice(i, i + batchSize);
      const batchPromises = batch.map(promiseFn => executePromise(promiseFn, options));

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        errors.push(error);
      }

      // バッチ間に小さな遅延を入れて負荷を分散
      if (i + batchSize < promiseFns.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return { results, errors };
  };

  /**
   * Promiseを逐次実行（最適化）
   */
  const executeSequential = async (promiseFns, options = {}) => {
    const results = [];

    for (const promiseFn of promiseFns) {
      try {
        const result = await executePromise(promiseFn, options);
        results.push({ status: 'fulfilled', value: result });
      } catch (error) {
        results.push({ status: 'rejected', reason: error });

        // エラーが発生した場合でも継続するかチェック
        if (options.stopOnError) {
          break;
        }
      }
    }

    return results;
  };

  /**
   * Promiseの再試行機能付き実行
   */
  const executeWithRetry = async (promiseFn, options = {}) => {
    const maxRetries = options.maxRetries || MAX_RETRY_ATTEMPTS;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await executePromise(promiseFn, { ...options, retries: 1 });
      } catch (error) {
        lastError = error;
        metrics.retryCount++;

        if (attempt < maxRetries) {
          // 指数バックオフ
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));

          logSystemMessage('debug', `Promise retry attempt ${attempt}/${maxRetries}`, {
            error: error.message,
            delay: `${delay}ms`
          });
        }
      }
    }

    throw lastError;
  };

  /**
   * Promiseのプーリング
   */
  const createPromisePool = (size = metrics.concurrentLimit) => {
    const pool = {
      size,
      active: 0,
      queue: [],
      results: [],

      execute: async (promiseFn, options = {}) => {
        return new Promise((resolve, reject) => {
          const task = {
            promiseFn,
            options,
            resolve,
            reject,
            queuedAt: Date.now()
          };

          pool.queue.push(task);
          processQueue();
        });
      }
    };

    const processQueue = async () => {
      if (pool.active >= pool.size || pool.queue.length === 0) {
        return;
      }

      const task = pool.queue.shift();
      pool.active++;

      try {
        const result = await executePromise(task.promiseFn, task.options);
        task.resolve(result);
        pool.results.push({ status: 'fulfilled', value: result });
      } catch (error) {
        task.reject(error);
        pool.results.push({ status: 'rejected', reason: error });
      } finally {
        pool.active--;
        process.nextTick(processQueue); // 非同期で次のタスクを処理
      }
    };

    return pool;
  };

  /**
   * Promiseのバッチ処理
   */
  const executeBatch = async (items, processor, options = {}) => {
    const batchSize = options.batchSize || BATCH_SIZE;
    const concurrency = options.concurrency || metrics.concurrentLimit;
    const batches = [];

    // アイテムをバッチに分割
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    // バッチを並列処理
    const pool = createPromisePool(concurrency);

    const batchPromises = batches.map(batch =>
      () => executePromise(() => processor(batch), options)
    );

    const results = await executeParallel(batchPromises, options);
    return results.results;
  };

  /**
   * Promiseのタイムアウト管理
   */
  const withTimeout = (promise, timeout = PROMISE_TIMEOUT) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timeout after ${timeout}ms`)), timeout)
      )
    ]);
  };

  /**
   * Promiseの統計を取得
   */
  const getPromiseStats = () => {
    const activeCount = activePromises.size;
    const queuedCount = Array.from(promisePool.values())
      .reduce((sum, pool) => sum + pool.queue.length, 0);

    return {
      ...metrics,
      activePromises: activeCount,
      queuedPromises: queuedCount,
      utilizationRate: metrics.maxConcurrent > 0 ? (metrics.maxConcurrent / metrics.concurrentLimit * 100) : 0,
      successRate: metrics.totalPromises > 0 ? ((metrics.completedPromises / metrics.totalPromises) * 100) : 0,
      failureRate: metrics.totalPromises > 0 ? ((metrics.failedPromises / metrics.totalPromises) * 100) : 0
    };
  };

  /**
   * 非同期処理の最適化提案を生成
   */
  const generateOptimizationSuggestions = () => {
    const stats = getPromiseStats();
    const suggestions = [];

    if (stats.utilizationRate > 90) {
      suggestions.push({
        priority: 'high',
        category: 'concurrency',
        title: 'High Concurrency Utilization',
        description: `Promise pool utilization is ${stats.utilizationRate.toFixed(1)}%`,
        actions: [
          'Consider increasing concurrent limit',
          'Optimize promise execution time',
          'Implement better load balancing'
        ]
      });
    }

    if (stats.successRate < 80) {
      suggestions.push({
        priority: 'high',
        category: 'reliability',
        title: 'Low Promise Success Rate',
        description: `Success rate is ${stats.successRate.toFixed(1)}%, failure rate is ${stats.failureRate.toFixed(1)}%`,
        actions: [
          'Improve error handling',
          'Implement retry mechanisms',
          'Add timeout handling'
        ]
      });
    }

    if (stats.timeoutCount > 0) {
      suggestions.push({
        priority: 'medium',
        category: 'timeout',
        title: 'Promise Timeouts Detected',
        description: `${stats.timeoutCount} promises have timed out`,
        actions: [
          'Review timeout settings',
          'Optimize long-running operations',
          'Implement progressive timeouts'
        ]
      });
    }

    if (stats.averageExecutionTime > 5000) {
      suggestions.push({
        priority: 'medium',
        category: 'performance',
        title: 'Slow Promise Execution',
        description: `Average execution time is ${stats.averageExecutionTime.toFixed(0)}ms`,
        actions: [
          'Optimize promise implementations',
          'Consider parallel processing',
          'Cache expensive operations'
        ]
      });
    }

    return suggestions;
  };

  /**
   * 非同期処理レポートを生成
   */
  const generateAsyncReport = () => {
    const stats = getPromiseStats();
    const suggestions = generateOptimizationSuggestions();

    const report = {
      ...stats,
      suggestions,
      reportGeneratedAt: new Date().toISOString(),
      configuration: {
        timeout: PROMISE_TIMEOUT,
        maxRetries: MAX_RETRY_ATTEMPTS,
        batchSize: BATCH_SIZE,
        concurrentLimit: metrics.concurrentLimit
      }
    };

    // 重要な統計をログ出力
    logSystemMessage('info', 'Async processing report', {
      totalPromises: metrics.totalPromises,
      completedPromises: metrics.completedPromises,
      failedPromises: metrics.failedPromises,
      successRate: `${stats.successRate.toFixed(1)}%`,
      averageExecutionTime: `${stats.averageExecutionTime.toFixed(0)}ms`,
      maxConcurrent: metrics.maxConcurrent,
      utilizationRate: `${stats.utilizationRate.toFixed(1)}%`,
      suggestions: suggestions.length
    });

    return report;
  };

  /**
   * 非同期処理アラートをチェック
   */
  const checkAsyncAlerts = () => {
    const stats = getPromiseStats();
    const alerts = [];

    if (stats.successRate < 50) {
      alerts.push({
        level: 'critical',
        message: `Critical low success rate: ${stats.successRate.toFixed(1)}%`,
        metric: 'successRate',
        value: stats.successRate,
        threshold: 50,
        timestamp: new Date().toISOString()
      });
    } else if (stats.successRate < 80) {
      alerts.push({
        level: 'warning',
        message: `Low success rate: ${stats.successRate.toFixed(1)}%`,
        metric: 'successRate',
        value: stats.successRate,
        threshold: 80,
        timestamp: new Date().toISOString()
      });
    }

    if (stats.utilizationRate > 95) {
      alerts.push({
        level: 'warning',
        message: `High concurrency utilization: ${stats.utilizationRate.toFixed(1)}%`,
        metric: 'utilizationRate',
        value: stats.utilizationRate,
        threshold: 95,
        timestamp: new Date().toISOString()
      });
    }

    if (stats.timeoutCount > 10) {
      alerts.push({
        level: 'warning',
        message: `Multiple timeouts detected: ${stats.timeoutCount}`,
        metric: 'timeoutCount',
        value: stats.timeoutCount,
        threshold: 10,
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  };

  /**
   * 定期的な最適化を実行
   */
  const startAsyncOptimization = () => {
    // 1分ごとに非同期処理統計をチェック
    setInterval(() => {
      const alerts = checkAsyncAlerts();
      if (alerts.length > 0) {
        logSystemMessage('warn', 'Async processing alerts detected', {
          alertCount: alerts.length,
          alerts: alerts.map(a => `${a.level}: ${a.message}`)
        });
      }
    }, 60000);

    // 5分ごとに詳細レポートを生成
    setInterval(() => {
      generateAsyncReport();
    }, 5 * 60 * 1000);

    logSystemMessage('info', 'Async processing optimization started', {
      concurrentLimit: metrics.concurrentLimit,
      timeout: `${PROMISE_TIMEOUT}ms`,
      maxRetries: MAX_RETRY_ATTEMPTS
    });
  };

  /**
   * 非同期処理統計をリセット
   */
  const resetAsyncStats = () => {
    metrics.totalPromises = 0;
    metrics.completedPromises = 0;
    metrics.failedPromises = 0;
    metrics.averageExecutionTime = 0;
    metrics.maxExecutionTime = 0;
    metrics.minExecutionTime = Infinity;
    metrics.timeoutCount = 0;
    metrics.retryCount = 0;
    metrics.currentConcurrent = 0;
    metrics.maxConcurrent = 0;
    activePromises.clear();
    promisePool.clear();
    logSystemMessage('info', 'Async processing statistics reset');
  };

  return {
    executePromise,
    executeParallel,
    executeSequential,
    executeWithRetry,
    executeBatch,
    withTimeout,
    createPromisePool,
    getPromiseStats,
    generateOptimizationSuggestions,
    generateAsyncReport,
    checkAsyncAlerts,
    startAsyncOptimization,
    resetAsyncStats
  };
};
