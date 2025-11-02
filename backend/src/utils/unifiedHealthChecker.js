/**
 * 統合ヘルスチェックシステム
 * ヘルスチェックと集約を統合
 * 軽量で効率的な実装
 */

const { EventEmitter } = require('events');

class UnifiedHealthChecker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      timeout: 5000,
      retries: 2,
      warningThreshold: 80, // % of services that must be healthy
      criticalThreshold: 50, // % of services that must be healthy
      cacheTTL: 30000, // 30 seconds
      ...options
    };

    this.services = new Map();
    this.cache = null;
    this.cacheExpiry = 0;
    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      lastCheckTime: null
    };
  }

  /**
   * サービスのヘルスチェックを登録
   */
  register(name, healthCheckFunction, options = {}) {
    const service = {
      name,
      check: healthCheckFunction,
      weight: options.weight || 1,
      timeout: options.timeout || this.config.timeout,
      retries: options.retries || this.config.retries,
      critical: options.critical || false,
      lastCheck: null,
      lastResult: null,
      errorCount: 0,
      successCount: 0,
      responseTimes: [],
      metadata: options.metadata || {}
    };

    this.services.set(name, service);

    this.emit('serviceRegistered', { name, service });

    return service;
  }

  /**
   * サービスの登録を解除
   */
  unregister(name) {
    const removed = this.services.delete(name);
    if (removed) {
      this.emit('serviceUnregistered', { name });
    }
    return removed;
  }

  /**
   * 単一のヘルスチェックを実行
   */
  async checkService(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    const startTime = Date.now();
    let attempts = 0;
    let lastError = null;

    while (attempts <= service.retries) {
      attempts++;

      try {
        const result = await Promise.race([
          service.check(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), service.timeout)
          )
        ]);

        const responseTime = Date.now() - startTime;
        service.responseTimes.push(responseTime);

        // レスポンスタイムの履歴を制限
        if (service.responseTimes.length > 100) {
          service.responseTimes.shift();
        }

        service.lastCheck = new Date().toISOString();
        service.lastResult = result;
        service.successCount++;
        service.errorCount = 0;

        this.updateStats(responseTime, true);

        return {
          name,
          status: 'healthy',
          responseTime,
          result,
          timestamp: service.lastCheck
        };

      } catch (error) {
        lastError = error;
        service.errorCount++;

        if (attempts <= service.retries) {
          // 再試行前に待機
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }

    // すべての再試行が失敗
    service.lastCheck = new Date().toISOString();
    service.lastResult = null;

    this.updateStats(Date.now() - startTime, false);

    return {
      name,
      status: 'unhealthy',
      error: lastError.message,
      responseTime: Date.now() - startTime,
      attempts,
      timestamp: service.lastCheck
    };
  }

  /**
   * すべてのヘルスチェックを実行
   */
  async checkAll() {
    // キャッシュされた結果を返す（有効期限内の場合）
    if (this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }

    const startTime = Date.now();
    const results = new Map();
    const promises = [];

    // 並行してヘルスチェックを実行
    for (const [name, _service] of this.services) {
      promises.push(
        this.checkService(name).then(result => {
          results.set(name, result);
        }).catch(error => {
          results.set(name, {
            name,
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        })
      );
    }

    await Promise.all(promises);

    const totalServices = this.services.size;
    const healthyServices = Array.from(results.values()).filter(r => r.status === 'healthy').length;
    const unhealthyServices = Array.from(results.values()).filter(r => r.status === 'unhealthy').length;
    const errorServices = Array.from(results.values()).filter(r => r.status === 'error').length;

    const overallHealth = this.calculateOverallHealth(results);
    const totalTime = Date.now() - startTime;

    const report = {
      timestamp: new Date().toISOString(),
      totalTime,
      summary: {
        total: totalServices,
        healthy: healthyServices,
        unhealthy: unhealthyServices,
        error: errorServices,
        overall: overallHealth.status,
        healthScore: overallHealth.score
      },
      services: Object.fromEntries(results),
      stats: { ...this.stats }
    };

    // キャッシュの更新
    this.cache = report;
    this.cacheExpiry = Date.now() + this.config.cacheTTL;

    this.emit('healthCheckCompleted', report);

    return report;
  }

  /**
   * 全体的なヘルスを計算
   */
  calculateOverallHealth(results) {
    const services = Array.from(results.values());
    const criticalServices = services.filter(s => {
      const service = this.services.get(s.name);
      return service && service.critical;
    });

    const healthyServices = services.filter(s => s.status === 'healthy');
    const totalServices = services.length;

    // クリティカルサービスがすべて正常かチェック
    const criticalHealthy = criticalServices.filter(s => s.status === 'healthy').length;
    const criticalTotal = criticalServices.length;

    if (criticalTotal > 0 && criticalHealthy < criticalTotal) {
      return {
        status: 'unhealthy',
        score: 0,
        reason: 'Critical services are unhealthy'
      };
    }

    // 全体的なヘルススコアを計算
    const healthyCount = healthyServices.length;
    const healthPercentage = totalServices > 0 ? (healthyCount / totalServices) * 100 : 100;

    let status = 'healthy';
    if (healthPercentage < this.config.criticalThreshold) {
      status = 'unhealthy';
    } else if (healthPercentage < this.config.warningThreshold) {
      status = 'degraded';
    }

    return {
      status,
      score: Math.round(healthPercentage),
      healthyCount,
      totalCount: totalServices
    };
  }

  /**
   * 統計の更新
   */
  updateStats(responseTime, success) {
    this.stats.totalChecks++;
    this.stats.averageResponseTime =
      (this.stats.averageResponseTime * (this.stats.totalChecks - 1) + responseTime) / this.stats.totalChecks;

    if (success) {
      this.stats.successfulChecks++;
    } else {
      this.stats.failedChecks++;
    }

    this.stats.lastCheckTime = new Date().toISOString();
  }

  /**
   * ヘルスレポートの生成
   */
  generateHealthReport() {
    const servicesReport = {};

    for (const [name, service] of this.services) {
      const avgResponseTime = service.responseTimes.length > 0
        ? service.responseTimes.reduce((sum, time) => sum + time, 0) / service.responseTimes.length
        : 0;

      servicesReport[name] = {
        name,
        critical: service.critical,
        weight: service.weight,
        lastCheck: service.lastCheck,
        lastResult: service.lastResult,
        stats: {
          successCount: service.successCount,
          errorCount: service.errorCount,
          successRate: service.successCount + service.errorCount > 0
            ? (service.successCount / (service.successCount + service.errorCount) * 100).toFixed(2) + '%'
            : '0%',
          averageResponseTime: Math.round(avgResponseTime) + 'ms'
        },
        metadata: service.metadata
      };
    }

    return {
      timestamp: new Date().toISOString(),
      services: servicesReport,
      summary: {
        totalServices: this.services.size,
        criticalServices: Array.from(this.services.values()).filter(s => s.critical).length,
        averageSuccessRate: this.calculateAverageSuccessRate(),
        averageResponseTime: Math.round(this.stats.averageResponseTime) + 'ms'
      },
      stats: { ...this.stats }
    };
  }

  /**
   * 平均成功率の計算
   */
  calculateAverageSuccessRate() {
    const services = Array.from(this.services.values());
    if (services.length === 0) {
      return '0%';
    }

    const totalSuccessRate = services.reduce((sum, service) => {
      const total = service.successCount + service.errorCount;
      const rate = total > 0 ? service.successCount / total : 0;
      return sum + rate;
    }, 0);

    return (totalSuccessRate / services.length * 100).toFixed(2) + '%';
  }

  /**
   * キャッシュのクリア
   */
  clearCache() {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  /**
   * 統計のリセット
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      lastCheckTime: null
    };
  }

  /**
   * サービスの取得
   */
  getService(name) {
    return this.services.get(name);
  }

  /**
   * すべてのサービスを取得
   */
  getAllServices() {
    return Object.fromEntries(this.services);
  }

  /**
   * サービス数の取得
   */
  getServiceCount() {
    return this.services.size;
  }

  /**
   * ヘルスチェックの開始（定期実行）
   */
  startPeriodicCheck(interval = 60000) {
    this.stopPeriodicCheck(); // 既存のタイマーを停止

    this.periodicTimer = setInterval(async () => {
      try {
        const report = await this.checkAll();
        this.emit('periodicHealthCheck', report);
      } catch (error) {
        this.emit('periodicHealthCheckError', error);
      }
    }, interval);

    this.emit('periodicCheckStarted', { interval });
  }

  /**
   * 定期ヘルスチェックの停止
   */
  stopPeriodicCheck() {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
      this.emit('periodicCheckStopped');
    }
  }
}

// シングルトンインスタンス
let unifiedHealthChecker = null;

const createUnifiedHealthChecker = (options = {}) => {
  if (!unifiedHealthChecker) {
    unifiedHealthChecker = new UnifiedHealthChecker(options);
  }
  return unifiedHealthChecker;
};

module.exports = {
  UnifiedHealthChecker,
  createUnifiedHealthChecker
};
