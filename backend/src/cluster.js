/**
 * Node.js Clustering - Multi-Core Optimization
 * 全CPUコアを活用し、パフォーマンスとフォールトトレランスを向上
 */

const cluster = require('cluster');
const os = require('os');
const { logger } = require('./utils/productionLogger');

const numCPUs = os.cpus().length;

// クラスター設定
const CLUSTER_CONFIG = {
  // ワーカー数（0 = CPU数、正数 = 指定数）
  workers: process.env.CLUSTER_WORKERS
    ? parseInt(process.env.CLUSTER_WORKERS)
    : numCPUs,

  // 最大ワーカー数
  maxWorkers: numCPUs * 2,

  // ワーカー再起動遅延（ミリ秒）
  restartDelay: 1000,

  // グレースフルシャットダウンタイムアウト（ミリ秒）
  gracefulShutdownTimeout: 30000,

  // ヘルスチェック間隔（ミリ秒）
  healthCheckInterval: 30000,

  // ワーカーメモリ制限（MB）
  memoryLimit: 512
};

class ClusterManager {
  constructor() {
    this.workers = new Map();
    this.workerRestarts = new Map();
    this.isShuttingDown = false;

    // 統計情報
    this.stats = {
      totalWorkers: 0,
      activeWorkers: 0,
      restarts: 0,
      crashes: 0,
      startTime: Date.now()
    };
  }

  // マスタープロセス初期化
  initializeMaster() {
    logger.info('[Cluster] Master process starting', {
      pid: process.pid,
      cpus: numCPUs,
      workersToSpawn: CLUSTER_CONFIG.workers
    });

    // ワーカー生成
    for (let i = 0; i < CLUSTER_CONFIG.workers; i++) {
      this.createWorker();
    }

    // クラスターイベントリスナー
    this.setupClusterListeners();

    // シグナルハンドラー
    this.setupSignalHandlers();

    // ヘルスチェック開始
    this.startHealthCheck();

    logger.info('[Cluster] Master process initialized', {
      workers: this.stats.activeWorkers
    });
  }

  // ワーカー作成
  createWorker() {
    if (this.isShuttingDown) {
      return null;
    }

    const worker = cluster.fork();
    const workerId = worker.id;

    this.workers.set(workerId, {
      worker,
      startTime: Date.now(),
      requests: 0,
      errors: 0,
      memory: 0
    });

    this.stats.totalWorkers++;
    this.stats.activeWorkers++;

    logger.info('[Cluster] Worker spawned', {
      workerId,
      pid: worker.process.pid,
      activeWorkers: this.stats.activeWorkers
    });

    return worker;
  }

  // クラスターイベントリスナー設定
  setupClusterListeners() {
    // ワーカーオンライン
    cluster.on('online', (worker) => {
      logger.info('[Cluster] Worker is online', {
        workerId: worker.id,
        pid: worker.process.pid
      });
    });

    // ワーカーリスニング開始
    cluster.on('listening', (worker, address) => {
      logger.info('[Cluster] Worker is listening', {
        workerId: worker.id,
        pid: worker.process.pid,
        port: address.port
      });
    });

    // ワーカー切断
    cluster.on('disconnect', (worker) => {
      logger.warn('[Cluster] Worker disconnected', {
        workerId: worker.id,
        pid: worker.process.pid
      });
    });

    // ワーカー終了
    cluster.on('exit', (worker, code, signal) => {
      this.handleWorkerExit(worker, code, signal);
    });

    // ワーカーからのメッセージ
    cluster.on('message', (worker, message) => {
      this.handleWorkerMessage(worker, message);
    });
  }

  // ワーカー終了処理
  handleWorkerExit(worker, code, signal) {
    const workerId = worker.id;

    this.workers.delete(workerId);
    this.stats.activeWorkers--;

    const exitReason = signal ? `signal ${signal}` : `code ${code}`;
    const isAbnormal = code !== 0 && !signal;

    if (isAbnormal) {
      this.stats.crashes++;
    }

    logger.warn('[Cluster] Worker exited', {
      workerId,
      pid: worker.process.pid,
      exitReason,
      isAbnormal,
      activeWorkers: this.stats.activeWorkers
    });

    // 異常終了の場合、再起動
    if (!this.isShuttingDown && isAbnormal) {
      this.restartWorker(workerId);
    }
  }

  // ワーカー再起動
  restartWorker(workerId) {
    this.stats.restarts++;

    // 再起動回数追跡
    const restarts = this.workerRestarts.get(workerId) || 0;
    this.workerRestarts.set(workerId, restarts + 1);

    // 頻繁な再起動の場合、遅延を増やす
    const delay = CLUSTER_CONFIG.restartDelay * Math.min(restarts + 1, 5);

    logger.info('[Cluster] Scheduling worker restart', {
      workerId,
      restarts: restarts + 1,
      delay
    });

    setTimeout(() => {
      this.createWorker();
    }, delay);
  }

  // ワーカーからのメッセージ処理
  handleWorkerMessage(worker, message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    const workerInfo = this.workers.get(worker.id);
    if (!workerInfo) {
      return;
    }

    // メトリクス更新
    if (message.type === 'metrics') {
      workerInfo.requests = message.requests || 0;
      workerInfo.errors = message.errors || 0;
      workerInfo.memory = message.memory || 0;

      // メモリ制限チェック
      if (message.memory > CLUSTER_CONFIG.memoryLimit * 1024 * 1024) {
        logger.warn('[Cluster] Worker exceeding memory limit', {
          workerId: worker.id,
          memory: (message.memory / 1024 / 1024).toFixed(2) + ' MB',
          limit: CLUSTER_CONFIG.memoryLimit + ' MB'
        });
      }
    }

    // ヘルスチェックレスポンス
    if (message.type === 'health') {
      workerInfo.lastHealthCheck = Date.now();
      workerInfo.healthy = message.healthy;
    }
  }

  // ヘルスチェック開始
  startHealthCheck() {
    setInterval(() => {
      const workers = Object.values(cluster.workers);

      for (const worker of workers) {
        if (worker) {
          worker.send({ type: 'health-check' });
        }
      }

      // 応答のないワーカーをチェック
      const now = Date.now();
      for (const [workerId, info] of this.workers.entries()) {
        if (info.lastHealthCheck &&
            now - info.lastHealthCheck > CLUSTER_CONFIG.healthCheckInterval * 2) {
          logger.error('[Cluster] Worker not responding to health checks', {
            workerId,
            lastCheck: new Date(info.lastHealthCheck).toISOString()
          });

          // ワーカーを強制終了
          if (info.worker.isConnected()) {
            info.worker.kill('SIGTERM');
          }
        }
      }
    }, CLUSTER_CONFIG.healthCheckInterval);
  }

  // シグナルハンドラー設定
  setupSignalHandlers() {
    const shutdown = (signal) => {
      if (this.isShuttingDown) {
        return;
      }

      this.isShuttingDown = true;

      logger.info('[Cluster] Received shutdown signal', {
        signal,
        activeWorkers: this.stats.activeWorkers
      });

      this.gracefulShutdown();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  // グレースフルシャットダウン
  gracefulShutdown() {
    const workers = Object.values(cluster.workers);
    let completed = 0;

    logger.info('[Cluster] Starting graceful shutdown', {
      workers: workers.length
    });

    const timeout = setTimeout(() => {
      logger.warn('[Cluster] Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, CLUSTER_CONFIG.gracefulShutdownTimeout);

    for (const worker of workers) {
      if (!worker) {
        continue;
      }

      worker.once('exit', () => {
        completed++;

        if (completed === workers.length) {
          clearTimeout(timeout);
          logger.info('[Cluster] All workers exited gracefully');
          process.exit(0);
        }
      });

      // ワーカーにシャットダウンメッセージ送信
      worker.send({ type: 'shutdown' });

      // 2秒後に強制終了
      setTimeout(() => {
        if (worker.isConnected()) {
          worker.kill('SIGTERM');
        }
      }, 2000);
    }

    // ワーカーがいない場合
    if (workers.length === 0) {
      clearTimeout(timeout);
      process.exit(0);
    }
  }

  // 統計情報取得
  getStatistics() {
    const uptime = Date.now() - this.stats.startTime;
    const workers = [];

    for (const [workerId, info] of this.workers.entries()) {
      workers.push({
        id: workerId,
        pid: info.worker.process.pid,
        uptime: Date.now() - info.startTime,
        requests: info.requests,
        errors: info.errors,
        memory: (info.memory / 1024 / 1024).toFixed(2) + ' MB',
        healthy: info.healthy !== false
      });
    }

    return {
      ...this.stats,
      uptime: Math.floor(uptime / 1000),
      workers,
      config: CLUSTER_CONFIG
    };
  }
}

// クラスターモード実行
if (cluster.isMaster || cluster.isPrimary) {
  // マスタープロセス
  const manager = new ClusterManager();
  manager.initializeMaster();

  // 統計情報エンドポイント（内部使用）
  global.clusterManager = manager;
} else {
  // ワーカープロセス
  const app = require('./app');
  const PORT = process.env.PORT || 3001;

  const server = app.listen(PORT, () => {
    logger.info('[Cluster] Worker listening', {
      workerId: cluster.worker.id,
      pid: process.pid,
      port: PORT
    });
  });

  // ワーカープロセスイベント
  process.on('message', (message) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    // ヘルスチェック
    if (message.type === 'health-check') {
      process.send({
        type: 'health',
        healthy: true
      });
    }

    // シャットダウン
    if (message.type === 'shutdown') {
      logger.info('[Cluster] Worker received shutdown signal', {
        workerId: cluster.worker.id
      });

      server.close(() => {
        process.exit(0);
      });
    }
  });

  // 定期メトリクス送信
  setInterval(() => {
    const memory = process.memoryUsage();
    process.send({
      type: 'metrics',
      memory: memory.heapUsed,
      requests: global.requestCount || 0,
      errors: global.errorCount || 0
    });
  }, 30000);

  // エラーハンドラー
  process.on('uncaughtException', (error) => {
    logger.error('[Cluster] Uncaught exception in worker', {
      workerId: cluster.worker.id,
      error: error.message,
      stack: error.stack
    });

    // グレースフルシャットダウン試行
    server.close(() => {
      process.exit(1);
    });

    // 強制終了（5秒後）
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  });

  process.on('unhandledRejection', (reason, _promise) => {
    logger.error('[Cluster] Unhandled rejection in worker', {
      workerId: cluster.worker.id,
      reason
    });
  });
}

module.exports = ClusterManager;
