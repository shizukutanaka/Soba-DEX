/**
 * WebSocketメッセージ圧縮ユーティリティ
 * John Carmack, Robert C. Martin, Rob Pikeの設計原則に基づく
 * - 単一責任の原則（SRP）
 * - 関数の明確な分離
 * - 軽量で効率的な実装
 */

const createWebSocketCompressor = (logger, logSystemMessage) => {
  const zlib = require('zlib');
  const metrics = {
    totalMessages: 0,
    compressedMessages: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    compressionErrors: 0,
    averageCompressionRatio: 0,
    compressionTime: 0
  };

  const COMPRESSION_THRESHOLD = 1024; // 1KB以上で圧縮
  const MIN_COMPRESSION_RATIO = 0.8; // 80%以上の圧縮率を期待

  /**
   * メッセージを圧縮
   */
  const compressMessage = (message, options = {}) => {
    const startTime = Date.now();

    if (typeof message !== 'string' && !Buffer.isBuffer(message)) {
      message = JSON.stringify(message);
    }

    const originalBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
    const originalSize = originalBuffer.length;

    metrics.totalMessages++;
    metrics.totalOriginalSize += originalSize;

    // サイズが閾値未満の場合は圧縮しない
    if (originalSize < COMPRESSION_THRESHOLD) {
      return {
        data: originalBuffer,
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1
      };
    }

    try {
      const compressionLevel = options.level || 6;
      const compressedBuffer = zlib.deflateSync(originalBuffer, { level: compressionLevel });
      const compressedSize = compressedBuffer.length;
      const compressionRatio = originalSize > 0 ? compressedSize / originalSize : 1;

      metrics.compressedMessages++;
      metrics.totalCompressedSize += compressedSize;
      metrics.compressionTime += Date.now() - startTime;

      // 圧縮率が期待値未満の場合は圧縮しない
      if (compressionRatio >= MIN_COMPRESSION_RATIO) {
        logSystemMessage('debug', 'Compression skipped - insufficient ratio', {
          originalSize,
          compressedSize,
          ratio: compressionRatio
        });

        return {
          data: originalBuffer,
          compressed: false,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1
        };
      }

      // 平均圧縮率を更新
      metrics.averageCompressionRatio =
        (metrics.averageCompressionRatio * (metrics.compressedMessages - 1) + compressionRatio) / metrics.compressedMessages;

      return {
        data: compressedBuffer,
        compressed: true,
        originalSize,
        compressedSize,
        compressionRatio
      };

    } catch (error) {
      metrics.compressionErrors++;
      logSystemMessage('error', 'Message compression failed', {
        error: error.message,
        messageSize: originalSize
      });

      return {
        data: originalBuffer,
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        error: error.message
      };
    }
  };

  /**
   * メッセージを解凍
   */
  const decompressMessage = (compressedData, _options = {}) => {
    try {
      const decompressedBuffer = zlib.inflateSync(compressedData);
      return {
        data: decompressedBuffer,
        success: true
      };
    } catch (error) {
      logSystemMessage('error', 'Message decompression failed', {
        error: error.message,
        dataSize: compressedData.length
      });

      return {
        data: compressedData,
        success: false,
        error: error.message
      };
    }
  };

  /**
   * 最適な圧縮レベルを決定
   */
  const determineOptimalCompressionLevel = (messageSize) => {
    if (messageSize < 1024) {
      return 1;
    } // 小さいメッセージは低圧縮
    if (messageSize < 1024 * 10) {
      return 3;
    } // 中くらいのメッセージは中圧縮
    if (messageSize < 1024 * 100) {
      return 6;
    } // 大きいメッセージは高圧縮
    return 9; // 非常に大きいメッセージは最高圧縮
  };

  /**
   * 圧縮設定を最適化
   */
  const optimizeCompressionSettings = () => {
    const compressionRatio = metrics.totalOriginalSize > 0
      ? metrics.totalCompressedSize / metrics.totalOriginalSize
      : 1;

    const recommendations = [];

    if (compressionRatio > 0.9) {
      recommendations.push({
        action: 'increase_compression_level',
        reason: 'Low compression ratio detected',
        currentRatio: compressionRatio,
        suggestedLevel: 9
      });
    }

    if (metrics.compressionErrors > metrics.compressedMessages * 0.1) {
      recommendations.push({
        action: 'decrease_compression_level',
        reason: 'High compression error rate',
        errorRate: (metrics.compressionErrors / metrics.compressedMessages) * 100,
        suggestedLevel: 1
      });
    }

    if (metrics.averageCompressionRatio > 0.95) {
      recommendations.push({
        action: 'increase_threshold',
        reason: 'Compression not effective for most messages',
        currentThreshold: COMPRESSION_THRESHOLD,
        suggestedThreshold: COMPRESSION_THRESHOLD * 2
      });
    }

    return recommendations;
  };

  /**
   * 圧縮統計を取得
   */
  const getCompressionStats = () => {
    const compressionRatio = metrics.totalOriginalSize > 0
      ? metrics.totalCompressedSize / metrics.totalOriginalSize
      : 1;

    const averageCompressionTime = metrics.compressedMessages > 0
      ? metrics.compressionTime / metrics.compressedMessages
      : 0;

    return {
      ...metrics,
      compressionRatio: Math.round(compressionRatio * 10000) / 100,
      averageCompressionTime: Math.round(averageCompressionTime * 100) / 100,
      compressionEfficiency: metrics.compressedMessages > 0
        ? ((metrics.totalOriginalSize - metrics.totalCompressedSize) / metrics.totalOriginalSize * 100)
        : 0,
      spaceSaved: metrics.totalOriginalSize - metrics.totalCompressedSize,
      spaceSavedPercentage: metrics.totalOriginalSize > 0
        ? ((metrics.totalOriginalSize - metrics.totalCompressedSize) / metrics.totalOriginalSize * 100)
        : 0
    };
  };

  /**
   * 圧縮レポートを生成
   */
  const generateCompressionReport = () => {
    const stats = getCompressionStats();
    const recommendations = optimizeCompressionSettings();

    const report = {
      ...stats,
      recommendations,
      reportGeneratedAt: new Date().toISOString(),
      thresholds: {
        compression: COMPRESSION_THRESHOLD,
        minCompressionRatio: MIN_COMPRESSION_RATIO
      }
    };

    // 重要な統計をログ出力
    logSystemMessage('info', 'WebSocket compression report', {
      totalMessages: metrics.totalMessages,
      compressedMessages: metrics.compressedMessages,
      compressionRatio: `${stats.compressionRatio.toFixed(1)}%`,
      spaceSaved: `${Math.round(stats.spaceSaved / 1024)}KB`,
      spaceSavedPercentage: `${stats.spaceSavedPercentage.toFixed(1)}%`,
      averageCompressionTime: `${stats.averageCompressionTime.toFixed(0)}ms`,
      recommendations: recommendations.length
    });

    return report;
  };

  /**
   * 圧縮アラートをチェック
   */
  const checkCompressionAlerts = () => {
    const alerts = [];
    const stats = getCompressionStats();

    if (stats.compressionRatio > 0.95) {
      alerts.push({
        level: 'warning',
        message: `Poor compression efficiency: ${stats.compressionRatio.toFixed(1)}%`,
        metric: 'compressionRatio',
        value: stats.compressionRatio,
        threshold: 95,
        timestamp: new Date().toISOString()
      });
    }

    if (metrics.compressionErrors > 0) {
      const errorRate = (metrics.compressionErrors / metrics.compressedMessages) * 100;
      if (errorRate > 10) {
        alerts.push({
          level: 'critical',
          message: `High compression error rate: ${errorRate.toFixed(1)}%`,
          metric: 'compressionErrorRate',
          value: errorRate,
          threshold: 10,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (stats.averageCompressionTime > 50) {
      alerts.push({
        level: 'warning',
        message: `Slow compression performance: ${stats.averageCompressionTime.toFixed(0)}ms average`,
        metric: 'compressionTime',
        value: stats.averageCompressionTime,
        threshold: 50,
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  };

  /**
   * 定期的な最適化を実行
   */
  const startCompressionOptimization = () => {
    // 1分ごとに圧縮統計をチェック
    setInterval(() => {
      const alerts = checkCompressionAlerts();
      if (alerts.length > 0) {
        logSystemMessage('warn', 'Compression alerts detected', {
          alertCount: alerts.length,
          alerts: alerts.map(a => `${a.level}: ${a.message}`)
        });
      }
    }, 60000);

    // 5分ごとに詳細レポートを生成
    setInterval(() => {
      generateCompressionReport();
    }, 5 * 60 * 1000);

    logSystemMessage('info', 'WebSocket compression optimization started', {
      compressionThreshold: `${COMPRESSION_THRESHOLD}B`,
      minCompressionRatio: `${MIN_COMPRESSION_RATIO * 100}%`
    });
  };

  /**
   * 圧縮統計をリセット
   */
  const resetCompressionStats = () => {
    for (const key in metrics) {
      if (typeof metrics[key] === 'number') {
        metrics[key] = 0;
      }
    }
    logSystemMessage('info', 'Compression statistics reset');
  };

  /**
   * メッセージサイズを推定
   */
  const estimateMessageSize = (message) => {
    if (typeof message === 'string') {
      return Buffer.byteLength(message, 'utf8');
    }
    if (Buffer.isBuffer(message)) {
      return message.length;
    }
    return Buffer.byteLength(JSON.stringify(message), 'utf8');
  };

  return {
    compressMessage,
    decompressMessage,
    determineOptimalCompressionLevel,
    optimizeCompressionSettings,
    getCompressionStats,
    generateCompressionReport,
    checkCompressionAlerts,
    startCompressionOptimization,
    resetCompressionStats,
    estimateMessageSize
  };
};
