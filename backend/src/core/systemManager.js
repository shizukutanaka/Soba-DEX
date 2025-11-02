/**
 * Unified System Manager
 * Central coordination of all optimized systems
 */

const SecurityManager = require('../security/securityManager');
const PerformanceOptimizer = require('../performance/performanceOptimizer');
const StabilityManager = require('../stability/stabilityManager');
const UXManager = require('../ui/uxManager');
const { errorManager } = require('../utils/errorManager');
const { memoryManager } = require('../utils/memoryManager');
const { fastWebSocket } = require('../services/fastWebSocket');
const { fastDB } = require('../database/fastDB');
const { requestBatcher } = require('../middleware/requestBatching');
const { intelligentPreloader } = require('../services/intelligentPreloader');
const { performanceBenchmark } = require('../utils/performanceBenchmark');
const { loadTester } = require('../testing/loadTester');
const { alertingSystem } = require('../services/alertingSystem');

class SystemManager {
  constructor(options = {}) {
    this.options = {
      enableSecurity: true,
      enablePerformance: true,
      enableStability: true,
      enableUX: true,
      enableMonitoring: true,
      shutdownTimeout: 30000, // 30 seconds
      ...options
    };

    this.managers = {};
    this.isInitialized = false;
    this.startTime = Date.now();
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Unified System Manager...');

      // Initialize managers in order of dependency
      if (this.options.enableSecurity) {
        this.managers.security = new SecurityManager();
        await this.managers.security.initialize();
        console.log('✅ Security Manager initialized');
      }

      if (this.options.enablePerformance) {
        this.managers.performance = new PerformanceOptimizer();
        await this.managers.performance.initialize();
        console.log('✅ Performance Optimizer initialized');
      }

      if (this.options.enableStability) {
        this.managers.stability = new StabilityManager();
        await this.managers.stability.initialize();
        console.log('✅ Stability Manager initialized');
      }

      if (this.options.enableUX) {
        this.managers.ux = new UXManager();
        await this.managers.ux.initialize();
        console.log('✅ UX Manager initialized');
      }

      // Initialize advanced optimization systems
      this.managers.memoryManager = memoryManager;
      this.managers.fastDB = fastDB;
      this.managers.fastWebSocket = fastWebSocket;
      this.managers.requestBatcher = requestBatcher;
      this.managers.intelligentPreloader = intelligentPreloader;
      this.managers.performanceBenchmark = performanceBenchmark;
      this.managers.loadTester = loadTester;
      this.managers.alertingSystem = alertingSystem;

      console.log('✅ Advanced optimization systems integrated');

      // Setup inter-manager communication
      this.setupManagerCommunication();

      this.isInitialized = true;
      console.log('🎉 All systems initialized successfully');

      return {
        success: true,
        message: 'System manager initialized',
        managers: Object.keys(this.managers),
        initTime: Date.now() - this.startTime
      };

    } catch (error) {
      console.error('❌ Failed to initialize system manager:', error);
      throw error;
    }
  }

  setupManagerCommunication() {
    // Connect security events to stability manager
    if (this.managers.security && this.managers.stability) {
      this.managers.security.on('criticalThreat', (threat) => {
        this.managers.stability.emit('securityAlert', threat);
      });
    }

    // Connect performance issues to UX manager
    if (this.managers.performance && this.managers.ux) {
      this.managers.performance.on('performanceIssue', (issue) => {
        this.managers.ux.emit('performanceAlert', issue);
      });
    }

    // Connect stability events to error manager
    if (this.managers.stability) {
      this.managers.stability.on('criticalServiceFailure', (failure) => {
        errorManager.logError(new Error(`Critical service failure: ${failure.service}`), {
          type: 'system_failure',
          service: failure.service
        });
      });
    }

    console.log('📡 Manager communication setup complete');
  }

  // Get comprehensive system status
  getSystemStatus() {
    const status = {
      isInitialized: this.isInitialized,
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
      managers: {},
      overall: 'unknown'
    };

    let healthyCount = 0;
    let totalCount = 0;

    for (const [name, manager] of Object.entries(this.managers)) {
      try {
        let managerStatus;

        // Get status from each manager
        switch (name) {
        case 'security':
          managerStatus = manager.getSecurityStatus();
          break;
        case 'performance':
          managerStatus = manager.getPerformanceStatus();
          break;
        case 'stability':
          managerStatus = manager.getStabilityStatus();
          break;
        case 'ux':
          managerStatus = manager.getUXStatus();
          break;
        default:
          managerStatus = { status: 'unknown' };
        }

        status.managers[name] = managerStatus;

        // Count healthy managers
        if (managerStatus.isInitialized || managerStatus.status === 'healthy') {
          healthyCount++;
        }
        totalCount++;

      } catch (error) {
        status.managers[name] = {
          status: 'error',
          error: error.message
        };
        totalCount++;
      }
    }

    // Determine overall status
    if (healthyCount === totalCount) {
      status.overall = 'healthy';
    } else if (healthyCount > totalCount * 0.5) {
      status.overall = 'degraded';
    } else {
      status.overall = 'critical';
    }

    return status;
  }

  // Get comprehensive system metrics
  getSystemMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      system: {
        memory: process.memoryUsage(),
        cpu: require('os').loadavg(),
        platform: process.platform,
        nodeVersion: process.version
      },
      managers: {}
    };

    // Collect metrics from all managers
    if (this.managers.performance) {
      metrics.managers.performance = this.managers.performance.getPerformanceStatus();
    }

    if (this.managers.security) {
      metrics.managers.security = this.managers.security.getSecurityStatus();
    }

    if (this.managers.stability) {
      metrics.managers.stability = this.managers.stability.getStabilityStatus();
    }

    if (this.managers.ux) {
      metrics.managers.ux = this.managers.ux.getUXStatus();
    }

    // Add monitoring data
    if (this.options.enableMonitoring) {
      metrics.monitoring = {
        errors: errorManager.getErrorStats(),
        memory: memoryManager.getMemoryInfo()
      };
    }

    return metrics;
  }

  // Generate comprehensive system report
  generateSystemReport() {
    const status = this.getSystemStatus();
    const metrics = this.getSystemMetrics();

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        status: status.overall,
        uptime: this.formatUptime(status.uptime),
        managersHealthy: Object.values(status.managers).filter(m =>
          m.isInitialized || m.status === 'healthy'
        ).length,
        totalManagers: Object.keys(status.managers).length
      },
      status,
      metrics,
      recommendations: this.generateRecommendations(status, metrics)
    };

    return report;
  }

  // Generate system recommendations
  generateRecommendations(status, metrics) {
    const recommendations = [];

    // Check overall system health
    if (status.overall === 'critical') {
      recommendations.push({
        type: 'critical',
        priority: 'immediate',
        message: 'Multiple system components are failing',
        action: 'Investigate failed managers and restart if necessary'
      });
    }

    // Check memory usage
    const memoryUsage = metrics.system.memory.heapUsed / metrics.system.memory.heapTotal;
    if (memoryUsage > 0.85) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'High memory usage detected',
        action: 'Consider increasing heap size or optimizing memory usage'
      });
    }

    // Check CPU load
    const cpuLoad = metrics.system.cpu[0];
    const cpuCount = require('os').cpus().length;
    if (cpuLoad > cpuCount * 0.8) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'High CPU load detected',
        action: 'Consider horizontal scaling or CPU optimization'
      });
    }

    // Manager-specific recommendations
    if (this.managers.performance) {
      const perfRecommendations = this.managers.performance.generateRecommendations?.() || [];
      recommendations.push(...perfRecommendations);
    }

    return recommendations;
  }

  // Format uptime for display
  formatUptime(uptimeMs) {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  // Health check for load balancers
  async healthCheck() {
    if (!this.isInitialized) {
      return {
        status: 'starting',
        healthy: false,
        message: 'System is still initializing'
      };
    }

    const status = this.getSystemStatus();

    return {
      status: status.overall,
      healthy: status.overall === 'healthy',
      managers: Object.keys(status.managers).length,
      uptime: this.formatUptime(status.uptime),
      timestamp: new Date().toISOString()
    };
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🔄 Starting graceful shutdown...');

    const shutdownPromises = [];

    // Shutdown all managers
    for (const [name, manager] of Object.entries(this.managers)) {
      if (typeof manager.shutdown === 'function') {
        console.log(`🔄 Shutting down ${name} manager...`);
        shutdownPromises.push(
          Promise.race([
            manager.shutdown(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`${name} shutdown timeout`)), 5000)
            )
          ]).catch(error => {
            console.error(`❌ Error shutting down ${name}:`, error.message);
          })
        );
      }
    }

    // Stop monitoring
    if (this.options.enableMonitoring) {
      // Cleanup monitoring resources
      memoryManager.cleanup();
    }

    // Wait for all shutdowns with timeout
    try {
      await Promise.race([
        Promise.all(shutdownPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Global shutdown timeout')), this.options.shutdownTimeout)
        )
      ]);
      console.log('✅ All managers shut down successfully');
    } catch (error) {
      console.error('⚠️ Some managers did not shut down cleanly:', error.message);
    }

    this.isInitialized = false;
    console.log('🛑 System manager shutdown complete');
  }
}

// Create singleton instance
const systemManager = new SystemManager();

module.exports = {
  SystemManager,
  systemManager
};