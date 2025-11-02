/**
 * Real-time Monitoring Dashboard Routes
 * リアルタイム監視ダッシュボード - 2025 DEXベストプラクティス
 */

const express = require('express');
const router = express.Router();
const os = require('os');
const { logger } = require('../utils/productionLogger');

// ミドルウェアとサービスのインポート
let healthMonitor, advancedCache, autoRetry, deduplicationMiddleware, responseCompression, requestValidator;

try {
  healthMonitor = require('../middleware/healthMonitor');
  advancedCache = require('../middleware/advancedCache');
  autoRetry = require('../middleware/autoRetry').autoRetry;
  deduplicationMiddleware = require('../middleware/deduplication').deduplicationMiddleware;
  responseCompression = require('../middleware/responseCompression');
  requestValidator = require('../middleware/requestValidator');
} catch (error) {
  logger.warn('[Dashboard] Some monitoring modules not available', { error: error.message });
}

// システム全体の統計情報取得
router.get('/stats', (req, res) => {
  const stats = {
    system: getSystemStats(),
    performance: getPerformanceStats(),
    security: getSecurityStats(),
    requests: getRequestStats(),
    timestamp: new Date().toISOString()
  };

  res.json({
    success: true,
    data: stats
  });
});

// システムメトリクス
router.get('/metrics/system', (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const loadAvg = os.loadavg();
  const uptime = process.uptime();

  const memoryUsage = process.memoryUsage();

  res.json({
    success: true,
    data: {
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        loadAverage: {
          '1min': loadAvg[0].toFixed(2),
          '5min': loadAvg[1].toFixed(2),
          '15min': loadAvg[2].toFixed(2)
        },
        usage: getCpuUsage()
      },
      memory: {
        total: formatBytes(totalMem),
        used: formatBytes(usedMem),
        free: formatBytes(freeMem),
        usagePercent: ((usedMem / totalMem) * 100).toFixed(2),
        process: {
          heapUsed: formatBytes(memoryUsage.heapUsed),
          heapTotal: formatBytes(memoryUsage.heapTotal),
          external: formatBytes(memoryUsage.external),
          rss: formatBytes(memoryUsage.rss)
        }
      },
      system: {
        platform: os.platform(),
        release: os.release(),
        hostname: os.hostname(),
        uptime: formatDuration(os.uptime()),
        processUptime: formatDuration(uptime)
      },
      node: {
        version: process.version,
        pid: process.pid
      }
    },
    timestamp: new Date().toISOString()
  });
});

// パフォーマンスメトリクス
router.get('/metrics/performance', (req, res) => {
  const stats = {
    cache: advancedCache ? advancedCache.getStatistics() : null,
    retry: autoRetry ? autoRetry.getStatistics() : null,
    compression: responseCompression ? responseCompression.getStatistics() : null,
    deduplication: deduplicationMiddleware ? deduplicationMiddleware.getStatistics() : null
  };

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});

// セキュリティメトリクス
router.get('/metrics/security', (req, res) => {
  const stats = {
    validation: requestValidator ? requestValidator.getStatistics() : null,
    health: healthMonitor ? healthMonitor.getStatus() : null
  };

  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});

// ヘルスチェック（詳細版）
router.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    checks: {
      memory: checkMemoryHealth(),
      cpu: checkCpuHealth(),
      uptime: checkUptimeHealth()
    },
    timestamp: new Date().toISOString()
  };

  // 1つでもunhealthyがあれば全体をdegradedに
  const hasUnhealthy = Object.values(health.checks).some(check => check.status === 'unhealthy');
  if (hasUnhealthy) {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    success: health.status === 'healthy',
    data: health
  });
});

// リアルタイムアラート取得
router.get('/alerts', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const severity = req.query.severity; // critical, warning, info

  const alerts = healthMonitor ? healthMonitor.getAlerts(limit) : [];

  // 重要度フィルタリング
  const filtered = severity
    ? alerts.filter(alert => alert.severity === severity)
    : alerts;

  res.json({
    success: true,
    data: filtered,
    count: filtered.length,
    timestamp: new Date().toISOString()
  });
});

// イベントログストリーム（Server-Sent Events）
router.get('/events', (req, res) => {
  // SSE用ヘッダー設定
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginxバッファリング無効化

  // 初期接続メッセージ
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  // 定期的にシステムメトリクスを送信
  const interval = setInterval(() => {
    const stats = {
      type: 'metrics',
      data: {
        memory: process.memoryUsage().heapUsed,
        cpu: getCpuUsage(),
        requests: healthMonitor ? healthMonitor.getMetrics().requests : {}
      },
      timestamp: new Date().toISOString()
    };

    res.write(`data: ${JSON.stringify(stats)}\n\n`);
  }, 5000); // 5秒ごと

  // クライアント切断時のクリーンアップ
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// パフォーマンスヒストリー
router.get('/history/performance', (req, res) => {
  const duration = parseInt(req.query.duration) || 60; // デフォルト60分

  // TODO: 実際の履歴データは時系列DBから取得
  // 今はモックデータを返す
  const history = generateMockHistory(duration);

  res.json({
    success: true,
    data: {
      duration: `${duration} minutes`,
      points: history
    },
    timestamp: new Date().toISOString()
  });
});

// トップエラー
router.get('/errors/top', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  // TODO: 実際のエラー統計は集計DBから取得
  const topErrors = [
    { code: 'VALIDATION_ERROR', count: 156, lastOccurred: new Date().toISOString() },
    { code: 'RATE_LIMITED', count: 89, lastOccurred: new Date().toISOString() },
    { code: 'UNAUTHORIZED', count: 45, lastOccurred: new Date().toISOString() }
  ].slice(0, limit);

  res.json({
    success: true,
    data: topErrors,
    count: topErrors.length,
    timestamp: new Date().toISOString()
  });
});

// === ヘルパー関数 ===

function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    cpuCount: os.cpus().length,
    memoryUsage: ((usedMem / totalMem) * 100).toFixed(2) + '%',
    uptime: formatDuration(process.uptime()),
    platform: os.platform(),
    nodeVersion: process.version
  };
}

function getPerformanceStats() {
  return {
    cacheHitRate: advancedCache ? advancedCache.getStatistics().hitRate : 'N/A',
    compressionRatio: responseCompression ? responseCompression.getStatistics().averageCompressionRatio.toFixed(2) + '%' : 'N/A',
    retrySuccessRate: autoRetry ? autoRetry.getStatistics().successRate : 'N/A',
    duplicateRate: deduplicationMiddleware ? deduplicationMiddleware.getStatistics().duplicateRate : 'N/A'
  };
}

function getSecurityStats() {
  const validatorStats = requestValidator ? requestValidator.getStatistics() : null;

  return {
    threatsBlocked: validatorStats ? validatorStats.blocked : 0,
    totalRequests: validatorStats ? validatorStats.totalRequests : 0,
    blockRate: validatorStats && validatorStats.totalRequests > 0
      ? ((validatorStats.blocked / validatorStats.totalRequests) * 100).toFixed(2) + '%'
      : '0%'
  };
}

function getRequestStats() {
  const healthMetrics = healthMonitor ? healthMonitor.getMetrics() : null;

  return {
    total: healthMetrics ? healthMetrics.requests.total : 0,
    successful: healthMetrics ? healthMetrics.requests.successful : 0,
    failed: healthMetrics ? healthMetrics.requests.failed : 0,
    errorRate: healthMetrics && healthMetrics.requests.total > 0
      ? ((healthMetrics.requests.failed / healthMetrics.requests.total) * 100).toFixed(2) + '%'
      : '0%'
  };
}

function checkMemoryHealth() {
  const memoryUsage = process.memoryUsage();
  const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  if (heapUsedPercent > 90) {
    return { status: 'unhealthy', message: 'Memory usage critical', value: heapUsedPercent.toFixed(2) + '%' };
  } else if (heapUsedPercent > 75) {
    return { status: 'degraded', message: 'Memory usage high', value: heapUsedPercent.toFixed(2) + '%' };
  }

  return { status: 'healthy', message: 'Memory usage normal', value: heapUsedPercent.toFixed(2) + '%' };
}

function checkCpuHealth() {
  const loadAvg = os.loadavg();
  const cpuCount = os.cpus().length;
  const loadPercent = (loadAvg[0] / cpuCount) * 100;

  if (loadPercent > 90) {
    return { status: 'unhealthy', message: 'CPU load critical', value: loadPercent.toFixed(2) + '%' };
  } else if (loadPercent > 75) {
    return { status: 'degraded', message: 'CPU load high', value: loadPercent.toFixed(2) + '%' };
  }

  return { status: 'healthy', message: 'CPU load normal', value: loadPercent.toFixed(2) + '%' };
}

function checkUptimeHealth() {
  const uptime = process.uptime();

  if (uptime < 60) {
    return { status: 'degraded', message: 'Process recently restarted', value: formatDuration(uptime) };
  }

  return { status: 'healthy', message: 'Process running stable', value: formatDuration(uptime) };
}

function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);

  return `${usage}%`;
}

function formatBytes(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) {
    return '0 B';
  }
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function generateMockHistory(duration) {
  const points = [];
  const now = Date.now();
  const interval = 60000; // 1分間隔

  for (let i = duration; i >= 0; i--) {
    points.push({
      timestamp: new Date(now - i * interval).toISOString(),
      cpu: Math.random() * 50 + 20,
      memory: Math.random() * 30 + 40,
      requests: Math.floor(Math.random() * 100) + 50
    });
  }

  return points;
}

module.exports = router;
