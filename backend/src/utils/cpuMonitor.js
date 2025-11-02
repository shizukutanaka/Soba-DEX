/**
 * CPU使用率監視・最適化ユーティリティ
 * John Carmack, Robert C. Martin, Rob Pikeの設計原則に基づく
 * - 単一責任の原則（SRP）
 * - 関数の明確な分離
 * - 軽量で効率的な実装
 */

const createCpuMonitor = (logger, logSystemMessage) => {
  const os = require('os');
  const metrics = {
    totalCpuUsage: 0,
    systemCpuUsage: 0,
    userCpuUsage: 0,
    processCpuUsage: 0,
    loadAverage: [0, 0, 0],
    cpuCount: os.cpus().length,
    lastMeasurement: Date.now(),
    measurements: []
  };

  const HIGH_CPU_THRESHOLD = 80; // 80%
  const CRITICAL_CPU_THRESHOLD = 90; // 90%
  const MEASUREMENT_INTERVAL = 5000; // 5秒

  /**
   * CPU使用率を測定
   */
  const measureCpuUsage = () => {
    const now = Date.now();
    const elapsedMs = now - metrics.lastMeasurement;

    if (elapsedMs < 1000) {
      // 1秒未満の場合は前回の値を返す
      return metrics;
    }

    try {
      const cpus = os.cpus();
      const currentLoad = os.loadavg();

      // システム全体のCPU使用率を計算
      let totalIdle = 0;
      let totalTick = 0;

      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });

      const totalUsage = ((totalTick - totalIdle) / totalTick) * 100;

      // プロセスごとのCPU使用率を取得
      const processUsage = process.cpuUsage();

      // ロードアベレージを取得
      const loadAverage = os.loadavg();

      // 統計を更新
      metrics.totalCpuUsage = Math.round(totalUsage * 100) / 100;
      metrics.systemCpuUsage = Math.round(((totalTick - totalIdle - (cpus[0].times.user + cpus[0].times.nice)) / totalTick) * 100 * 100) / 100;
      metrics.userCpuUsage = Math.round((cpus[0].times.user + cpus[0].times.nice) / totalTick * 100 * 100) / 100;
      metrics.processCpuUsage = Math.round(((processUsage.user + processUsage.system) / (elapsedMs * 1000)) * 100 * 100) / 100;
      metrics.loadAverage = loadAverage.map(val => Math.round(val * 100) / 100);
      metrics.lastMeasurement = now;

      // 測定履歴を保存（最新100件）
      metrics.measurements.push({
        timestamp: now,
        totalCpuUsage: metrics.totalCpuUsage,
        processCpuUsage: metrics.processCpuUsage,
        loadAverage: [...metrics.loadAverage]
      });

      if (metrics.measurements.length > 100) {
        metrics.measurements.shift();
      }

      return { ...metrics };

    } catch (error) {
      logSystemMessage('error', 'Failed to measure CPU usage', { error: error.message });
      return metrics;
    }
  };

  /**
   * CPU使用率の傾向を分析
   */
  const analyzeCpuTrend = () => {
    if (metrics.measurements.length < 2) {
      return { trend: 'stable', direction: 0, volatility: 0 };
    }

    const recent = metrics.measurements.slice(-10); // 最新10件
    const older = metrics.measurements.slice(-20, -10); // 10件前

    if (recent.length < 5 || older.length < 5) {
      return { trend: 'insufficient_data', direction: 0, volatility: 0 };
    }

    const recentAvg = recent.reduce((sum, m) => sum + m.totalCpuUsage, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.totalCpuUsage, 0) / older.length;

    const direction = recentAvg - olderAvg;

    // 変動性の計算
    const recentVariance = recent.reduce((sum, m) => sum + Math.pow(m.totalCpuUsage - recentAvg, 2), 0) / recent.length;
    const volatility = Math.sqrt(recentVariance);

    let trend = 'stable';
    if (Math.abs(direction) > 5) {
      trend = direction > 0 ? 'increasing' : 'decreasing';
    }

    return { trend, direction: Math.round(direction * 100) / 100, volatility: Math.round(volatility * 100) / 100 };
  };

  /**
   * CPU最適化の提案を生成
   */
  const generateOptimizationSuggestions = () => {
    const suggestions = [];
    const currentUsage = metrics.totalCpuUsage;
    const trend = analyzeCpuTrend();

    if (currentUsage > HIGH_CPU_THRESHOLD) {
      suggestions.push({
        priority: 'high',
        category: 'performance',
        title: 'High CPU Usage Detected',
        description: `Current CPU usage is ${currentUsage.toFixed(1)}%, which exceeds the threshold of ${HIGH_CPU_THRESHOLD}%`,
        actions: [
          'Consider optimizing database queries',
          'Review and optimize algorithms',
          'Check for memory leaks',
          'Consider load balancing'
        ]
      });
    }

    if (trend.trend === 'increasing' && trend.direction > 10) {
      suggestions.push({
        priority: 'medium',
        category: 'monitoring',
        title: 'CPU Usage Trending Upward',
        description: `CPU usage is increasing by ${trend.direction.toFixed(1)}% per measurement interval`,
        actions: [
          'Monitor for potential memory leaks',
          'Review recent code changes',
          'Consider scaling up resources'
        ]
      });
    }

    if (metrics.processCpuUsage > 50) {
      suggestions.push({
        priority: 'medium',
        category: 'process',
        title: 'High Process CPU Usage',
        description: `The application process is using ${metrics.processCpuUsage.toFixed(1)}% of CPU`,
        actions: [
          'Profile the application for bottlenecks',
          'Optimize synchronous operations',
          'Consider using worker threads'
        ]
      });
    }

    if (currentUsage > CRITICAL_CPU_THRESHOLD) {
      suggestions.push({
        priority: 'critical',
        category: 'immediate',
        title: 'Critical CPU Usage',
        description: `CPU usage has reached ${currentUsage.toFixed(1)}%, which is above the critical threshold`,
        actions: [
          'Immediate investigation required',
          'Consider emergency scaling',
          'Check for infinite loops or blocking operations'
        ]
      });
    }

    return suggestions;
  };

  /**
   * CPUアラートをチェック
   */
  const checkCpuAlerts = () => {
    const alerts = [];
    const currentUsage = metrics.totalCpuUsage;

    if (currentUsage >= CRITICAL_CPU_THRESHOLD) {
      alerts.push({
        level: 'critical',
        message: `Critical CPU usage: ${currentUsage.toFixed(1)}%`,
        metric: 'cpuUsage',
        value: currentUsage,
        threshold: CRITICAL_CPU_THRESHOLD,
        timestamp: new Date().toISOString()
      });
    } else if (currentUsage >= HIGH_CPU_THRESHOLD) {
      alerts.push({
        level: 'warning',
        message: `High CPU usage: ${currentUsage.toFixed(1)}%`,
        metric: 'cpuUsage',
        value: currentUsage,
        threshold: HIGH_CPU_THRESHOLD,
        timestamp: new Date().toISOString()
      });
    }

    // ロードアベレージチェック
    const loadAvg = metrics.loadAverage[0]; // 1分平均
    if (loadAvg > metrics.cpuCount * 1.5) {
      alerts.push({
        level: 'warning',
        message: `High system load average: ${loadAvg.toFixed(2)} (CPU count: ${metrics.cpuCount})`,
        metric: 'loadAverage',
        value: loadAvg,
        threshold: metrics.cpuCount * 1.5,
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  };

  /**
   * CPU使用率レポートを生成
   */
  const generateCpuReport = () => {
    const currentMetrics = measureCpuUsage();
    const trend = analyzeCpuTrend();
    const alerts = checkCpuAlerts();
    const suggestions = generateOptimizationSuggestions();

    const report = {
      ...currentMetrics,
      trend,
      alerts,
      suggestions,
      reportGeneratedAt: new Date().toISOString(),
      measurementInterval: MEASUREMENT_INTERVAL,
      thresholds: {
        high: HIGH_CPU_THRESHOLD,
        critical: CRITICAL_CPU_THRESHOLD
      }
    };

    // 重要なメトリクスをログ出力
    logSystemMessage('info', 'CPU usage report', {
      totalCpuUsage: `${currentMetrics.totalCpuUsage.toFixed(1)}%`,
      processCpuUsage: `${currentMetrics.processCpuUsage.toFixed(1)}%`,
      loadAverage: currentMetrics.loadAverage.map(val => val.toFixed(2)).join('/'),
      trend: trend.trend,
      alertCount: alerts.length,
      suggestionCount: suggestions.length
    });

    return report;
  };

  /**
   * CPU最適化を実行
   */
  const optimizeCpuUsage = () => {
    const suggestions = generateOptimizationSuggestions();

    // 軽量な最適化を自動実行
    const optimizations = [];

    // ガベージコレクションの提案
    if (metrics.totalCpuUsage > 70) {
      if (global.gc && typeof global.gc === 'function') {
        global.gc();
        optimizations.push('Manual garbage collection executed');
      }
    }

    // キャッシュクリアの提案
    if (metrics.totalCpuUsage > 60) {
      optimizations.push('Consider clearing application caches');
    }

    // ログレベル調整の提案
    if (metrics.totalCpuUsage > 50) {
      optimizations.push('Consider reducing log verbosity for high CPU periods');
    }

    return {
      optimizations,
      suggestionCount: suggestions.length,
      executedOptimizations: optimizations.length
    };
  };

  /**
   * 定期的なCPU監視を開始
   */
  const startCpuMonitoring = () => {
    // 5秒ごとにCPU使用率を測定
    setInterval(() => {
      const report = measureCpuUsage();
      const alerts = checkCpuAlerts();

      if (alerts.length > 0) {
        logSystemMessage('warn', 'CPU usage alerts detected', {
          alertCount: alerts.length,
          alerts: alerts.map(a => `${a.level}: ${a.message}`)
        });
      }

      // CPU使用率が80%を超えた場合に最適化を試行
      if (report.totalCpuUsage > HIGH_CPU_THRESHOLD) {
        const optimization = optimizeCpuUsage();
        if (optimization.optimizations.length > 0) {
          logSystemMessage('info', 'CPU optimization executed', {
            optimizations: optimization.optimizations,
            suggestionCount: optimization.suggestionCount
          });
        }
      }
    }, MEASUREMENT_INTERVAL);

    // 1分ごとに詳細レポートを生成
    setInterval(() => {
      generateCpuReport();
    }, 60000);

    logSystemMessage('info', 'CPU monitoring started', {
      measurementInterval: `${MEASUREMENT_INTERVAL}ms`,
      highThreshold: `${HIGH_CPU_THRESHOLD}%`,
      criticalThreshold: `${CRITICAL_CPU_THRESHOLD}%`
    });
  };

  /**
   * CPU統計を取得
   */
  const getCpuStats = () => {
    return {
      ...measureCpuUsage(),
      trend: analyzeCpuTrend(),
      alerts: checkCpuAlerts(),
      suggestions: generateOptimizationSuggestions()
    };
  };

  /**
   * CPU監視をリセット
   */
  const resetCpuMonitoring = () => {
    metrics.measurements = [];
    metrics.lastMeasurement = Date.now();
    logSystemMessage('info', 'CPU monitoring reset');
  };

  return {
    measureCpuUsage,
    analyzeCpuTrend,
    generateOptimizationSuggestions,
    checkCpuAlerts,
    generateCpuReport,
    optimizeCpuUsage,
    startCpuMonitoring,
    getCpuStats,
    resetCpuMonitoring
  };
};
