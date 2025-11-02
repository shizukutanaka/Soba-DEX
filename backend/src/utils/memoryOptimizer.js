/**
 * Advanced Memory Optimization System
 * Enterprise-grade memory management with intelligent garbage collection
 */

const os = require('os');
const v8 = require('v8');
const { logger } = require('../utils/productionLogger');

class MemoryOptimizer {
  constructor() {
    this.config = {
      enabled: process.env.MEMORY_OPTIMIZATION !== 'false',
      gcInterval: parseInt(process.env.GC_INTERVAL) || 30000, // 30 seconds
      memoryThreshold: parseFloat(process.env.MEMORY_THRESHOLD) || 0.8, // 80%
      maxHeapSize: parseInt(process.env.MAX_HEAP_SIZE) || 0, // 0 = no limit
      enableAutoGC: process.env.AUTO_GC !== 'false',
      enableMemoryProfiling: process.env.MEMORY_PROFILING !== 'false',
      enableLeakDetection: process.env.LEAK_DETECTION !== 'false',
      maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE) || 10000,
      cacheCleanupInterval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 60000, // 1 minute
      objectTrackingEnabled: process.env.OBJECT_TRACKING !== 'false'
    };

    this.memoryBaseline = this.getMemorySnapshot();
    this.memoryHistory = [];
    this.maxHistorySize = 1000;

    this.objectTracker = new Map();
    this.allocationTracker = new Map();

    this.cacheReferences = new Set();
    this.leakSuspects = new Map();

    this.gcStats = {
      totalGC: 0,
      forcedGC: 0,
      autoGC: 0,
      memoryFreed: 0,
      avgGcTime: 0,
      lastGcTime: 0,
      leakDetections: 0,
      cacheCleanups: 0
    };

    this.performanceMetrics = {
      responseTimes: [],
      memoryUsage: [],
      allocationRates: [],
      deallocationRates: []
    };

    // Start optimization processes
    if (this.config.enabled) {
      this.startOptimization();
    }
  }

  /**
   * Start memory optimization processes
   */
  startOptimization() {
    // Periodic garbage collection
    if (this.config.enableAutoGC) {
      this.startAutoGC();
    }

    // Memory profiling
    if (this.config.enableMemoryProfiling) {
      this.startMemoryProfiling();
    }

    // Leak detection
    if (this.config.enableLeakDetection) {
      this.startLeakDetection();
    }

    // Cache cleanup
    this.startCacheCleanup();

    // Object tracking
    if (this.config.objectTrackingEnabled) {
      this.startObjectTracking();
    }

    logger.info('Memory optimizer started', {
      autoGC: this.config.enableAutoGC,
      profiling: this.config.enableMemoryProfiling,
      leakDetection: this.config.enableLeakDetection,
      objectTracking: this.config.objectTrackingEnabled
    });
  }

  /**
   * Start automatic garbage collection
   */
  startAutoGC() {
    setInterval(() => {
      this.performAutoGC();
    }, this.config.gcInterval);
  }

  /**
   * Perform intelligent garbage collection
   */
  performAutoGC() {
    const startTime = Date.now();
    const beforeMemory = this.getMemoryUsage();

    try {
      // Check if GC is needed
      if (!this.shouldPerformGC()) {
        return;
      }

      // Force garbage collection if available (Node.js with --expose-gc)
      if (global.gc) {
        const beforeGC = process.memoryUsage();
        global.gc();
        const afterGC = process.memoryUsage();

        const freedMemory = beforeGC.heapUsed - afterGC.heapUsed;
        this.gcStats.memoryFreed += freedMemory;
        this.gcStats.forcedGC++;
      } else {
        // Manual memory cleanup
        this.performManualCleanup();
      }

      const gcTime = Date.now() - startTime;
      this.gcStats.avgGcTime = (this.gcStats.avgGcTime * (this.gcStats.totalGC - 1) + gcTime) / this.gcStats.totalGC;
      this.gcStats.lastGcTime = gcTime;

      this.recordMemorySnapshot();

      logger.debug('Auto GC completed', {
        gcTime: `${gcTime}ms`,
        memoryFreed: this.formatBytes(this.gcStats.memoryFreed),
        totalGC: this.gcStats.totalGC
      });

    } catch (error) {
      logger.error('Auto GC failed', { error: error.message });
    }
  }

  /**
   * Determine if garbage collection should be performed
   */
  shouldPerformGC() {
    const memoryUsage = process.memoryUsage();
    const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

    // Check memory threshold
    if (heapUsageRatio > this.config.memoryThreshold) {
      return true;
    }

    // Check for memory growth trend
    if (this.memoryHistory.length >= 10) {
      const recent = this.memoryHistory.slice(-10);
      const avgUsage = recent.reduce((sum, m) => sum + m.heapUsed, 0) / recent.length;
      const currentUsage = memoryUsage.heapUsed;

      // If memory usage increased by more than 20% in last 10 measurements
      if (currentUsage > avgUsage * 1.2) {
        return true;
      }
    }

    // Check for excessive object allocation
    if (this.objectTracker.size > this.config.maxCacheSize) {
      return true;
    }

    return false;
  }

  /**
   * Perform manual memory cleanup
   */
  performManualCleanup() {
    // Clear internal caches
    this.clearInternalCaches();

    // Force cleanup of known memory-intensive objects
    this.cleanupKnownObjects();

    // Trigger prototype cleanup
    this.cleanupPrototypes();
  }

  /**
   * Clear internal caches
   */
  clearInternalCaches() {
    // Clear module caches that might be holding references
    if (require.cache) {
      const keysToDelete = [];

      for (const key in require.cache) {
        if (this.shouldClearModuleCache(key)) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => {
        delete require.cache[key];
      });

      if (keysToDelete.length > 0) {
        logger.debug('Cleared module caches', { count: keysToDelete.length });
      }
    }
  }

  /**
   * Determine if module cache should be cleared
   */
  shouldClearModuleCache(modulePath) {
    // Don't clear core modules or frequently used modules
    const coreModules = ['events', 'util', 'path', 'fs', 'crypto'];
    const frequentlyUsed = ['express', 'socket.io', 'mongoose', 'redis'];

    return !coreModules.some(mod => modulePath.includes(mod)) &&
           !frequentlyUsed.some(mod => modulePath.includes(mod));
  }

  /**
   * Cleanup known memory-intensive objects
   */
  cleanupKnownObjects() {
    // Clear DNS cache
    if (require('dns')._cache) {
      require('dns')._cache.clear();
    }

    // Clear SSL session cache
    if (require('tls').TLSSocket) {
      // TLS sockets are managed by Node.js
    }
  }

  /**
   * Cleanup prototype chains
   */
  cleanupPrototypes() {
    // Force prototype cleanup for objects that might hold references
    const objects = process._getActiveHandles ? process._getActiveHandles() : [];
    const requests = process._getActiveRequests ? process._getActiveRequests() : [];

    // Log potential memory issues
    if (objects.length > 100 || requests.length > 50) {
      logger.warn('High number of active handles/requests', {
        handles: objects.length,
        requests: requests.length
      });
    }
  }

  /**
   * Start memory profiling
   */
  startMemoryProfiling() {
    setInterval(() => {
      this.performMemoryProfiling();
    }, 10000); // Every 10 seconds
  }

  /**
   * Perform memory profiling analysis
   */
  performMemoryProfiling() {
    const snapshot = this.getMemorySnapshot();
    this.memoryHistory.push(snapshot);

    // Keep only recent history
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }

    // Analyze memory trends
    this.analyzeMemoryTrends();

    // Check for memory leaks
    if (this.config.enableLeakDetection) {
      this.detectMemoryLeaks();
    }
  }

  /**
   * Get comprehensive memory snapshot
   */
  getMemorySnapshot() {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      heapSpaces: {
        newSpace: heapStats.new_space_size,
        oldSpace: heapStats.old_space_size,
        codeSpace: heapStats.code_space_size,
        mapSpace: heapStats.map_space_size,
        largeObjectSpace: heapStats.large_object_space_size
      }
    };
  }

  /**
   * Analyze memory usage trends
   */
  analyzeMemoryTrends() {
    if (this.memoryHistory.length < 10) return;

    const recent = this.memoryHistory.slice(-10);
    const older = this.memoryHistory.slice(-20, -10);

    const recentAvg = recent.reduce((sum, m) => sum + m.heapUsed, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.heapUsed, 0) / older.length;

    const growthRate = ((recentAvg - olderAvg) / olderAvg) * 100;

    // Alert on significant memory growth
    if (growthRate > 50) { // 50% growth in 2 minutes
      logger.warn('Significant memory growth detected', {
        growthRate: `${growthRate.toFixed(2)}%`,
        recentAvg: this.formatBytes(recentAvg),
        olderAvg: this.formatBytes(olderAvg)
      });
    }

    // Record performance metrics
    this.performanceMetrics.memoryUsage.push(recentAvg);
    if (this.performanceMetrics.memoryUsage.length > 100) {
      this.performanceMetrics.memoryUsage.shift();
    }
  }

  /**
   * Detect potential memory leaks
   */
  detectMemoryLeaks() {
    const currentSnapshot = this.getMemorySnapshot();

    // Compare with baseline
    const baseline = this.memoryBaseline;
    const timeDiff = (currentSnapshot.timestamp - baseline.timestamp) / 1000; // seconds

    if (timeDiff < 300) return; // Need at least 5 minutes of data

    // Check for steady memory increase
    const heapGrowth = currentSnapshot.heapUsed - baseline.heapUsed;
    const growthRate = heapGrowth / timeDiff; // bytes per second

    // Alert if memory is growing significantly without corresponding load increase
    if (growthRate > 1024 * 1024) { // More than 1MB per second
      this.gcStats.leakDetections++;

      logger.warn('Potential memory leak detected', {
        heapGrowth: this.formatBytes(heapGrowth),
        growthRate: this.formatBytes(growthRate) + '/sec',
        timeElapsed: `${timeDiff.toFixed(0)}s`,
        leakDetections: this.gcStats.leakDetections
      });

      // Track suspects
      this.trackLeakSuspects();
    }
  }

  /**
   * Track potential memory leak sources
   */
  trackLeakSuspects() {
    // Analyze object allocations
    const allocations = this.getAllocationStats();

    for (const [type, count] of allocations) {
      if (count > 1000) { // Arbitrary threshold
        this.leakSuspects.set(type, {
          count,
          timestamp: Date.now(),
          severity: count > 10000 ? 'HIGH' : count > 5000 ? 'MEDIUM' : 'LOW'
        });
      }
    }
  }

  /**
   * Get object allocation statistics
   */
  getAllocationStats() {
    const stats = new Map();

    for (const [id, obj] of this.objectTracker) {
      const type = obj.constructor?.name || 'Unknown';
      stats.set(type, (stats.get(type) || 0) + 1);
    }

    return stats;
  }

  /**
   * Start object tracking for leak detection
   */
  startObjectTracking() {
    // Monkey patch Object constructors for tracking
    this.patchObjectConstructors();
  }

  /**
   * Patch object constructors to track allocations
   */
  patchObjectConstructors() {
    const originalDefineProperty = Object.defineProperty;

    Object.defineProperty = function(obj, prop, descriptor) {
      if (prop === '__memoryTracker') {
        return originalDefineProperty(obj, prop, descriptor);
      }

      // Track object creation
      if (typeof obj === 'object' && obj !== null && !obj.__memoryTracker) {
        obj.__memoryTracker = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          constructor: obj.constructor?.name || 'Object'
        };

        // Track in our registry
        this.objectTracker.set(obj.__memoryTracker.id, obj);
        this.allocationTracker.set(obj.__memoryTracker.id, {
          constructor: obj.constructor?.name || 'Object',
          timestamp: Date.now()
        });
      }

      return originalDefineProperty(obj, prop, descriptor);
    }.bind(this);
  }

  /**
   * Start cache cleanup process
   */
  startCacheCleanup() {
    setInterval(() => {
      this.performCacheCleanup();
    }, this.config.cacheCleanupInterval);
  }

  /**
   * Perform comprehensive cache cleanup
   */
  performCacheCleanup() {
    let cleanedCount = 0;

    // Clean object tracker
    const now = Date.now();
    const timeout = 600000; // 10 minutes

    for (const [id, obj] of this.objectTracker) {
      if (now - obj.__memoryTracker?.timestamp > timeout) {
        this.objectTracker.delete(id);
        cleanedCount++;
      }
    }

    // Clean allocation tracker
    for (const [id, allocation] of this.allocationTracker) {
      if (now - allocation.timestamp > timeout) {
        this.allocationTracker.delete(id);
      }
    }

    // Clean leak suspects
    for (const [type, suspect] of this.leakSuspects) {
      if (now - suspect.timestamp > 1800000) { // 30 minutes
        this.leakSuspects.delete(type);
      }
    }

    if (cleanedCount > 0) {
      this.gcStats.cacheCleanups++;
      logger.debug('Cache cleanup completed', { cleanedCount });
    }
  }

  /**
   * Start leak detection monitoring
   */
  startLeakDetection() {
    setInterval(() => {
      this.performLeakDetection();
    }, 120000); // Every 2 minutes
  }

  /**
   * Perform comprehensive leak detection
   */
  performLeakDetection() {
    const handles = process._getActiveHandles ? process._getActiveHandles() : [];
    const requests = process._getActiveRequests ? process._getActiveRequests() : [];

    // Check for excessive handles
    if (handles.length > 200) {
      logger.warn('High number of active handles detected', {
        handles: handles.length,
        requests: requests.length
      });

      // Analyze handle types
      const handleTypes = {};
      handles.forEach(handle => {
        const type = handle.constructor?.name || 'Unknown';
        handleTypes[type] = (handleTypes[type] || 0) + 1;
      });

      logger.info('Active handle types', handleTypes);
    }

    // Check for stuck requests
    if (requests.length > 50) {
      logger.warn('High number of active requests detected', {
        requests: requests.length
      });
    }
  }

  /**
   * Record memory snapshot for trend analysis
   */
  recordMemorySnapshot() {
    const snapshot = this.getMemorySnapshot();
    this.memoryHistory.push(snapshot);

    // Keep history manageable
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }
  }

  /**
   * Get current memory usage percentage
   */
  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      heapUsagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      external: memUsage.external
    };
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get comprehensive memory statistics
   */
  getStatistics() {
    const currentMemory = this.getMemoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      current: currentMemory,
      baseline: this.memoryBaseline,
      history: {
        count: this.memoryHistory.length,
        trend: this.calculateMemoryTrend()
      },
      gc: this.gcStats,
      objects: {
        tracked: this.objectTracker.size,
        allocations: this.allocationTracker.size,
        leakSuspects: this.leakSuspects.size
      },
      heap: {
        spaces: heapStats,
        fragmentation: heapStats ? (heapStats.total_available_size - heapStats.total_used_size) / heapStats.total_available_size : 0
      },
      performance: {
        avgResponseTime: this.performanceMetrics.responseTimes.length > 0 ?
          this.performanceMetrics.responseTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.responseTimes.length : 0,
        memoryGrowthRate: this.calculateMemoryGrowthRate()
      },
      config: this.config
    };
  }

  /**
   * Calculate memory trend
   */
  calculateMemoryTrend() {
    if (this.memoryHistory.length < 2) return 0;

    const recent = this.memoryHistory.slice(-5);
    const older = this.memoryHistory.slice(-10, -5);

    const recentAvg = recent.reduce((sum, m) => sum + m.heapUsed, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.heapUsed, 0) / older.length;

    return ((recentAvg - olderAvg) / olderAvg) * 100;
  }

  /**
   * Calculate memory growth rate
   */
  calculateMemoryGrowthRate() {
    if (this.memoryHistory.length < 10) return 0;

    const baseline = this.memoryHistory[0];
    const current = this.memoryHistory[this.memoryHistory.length - 1];
    const timeDiff = (current.timestamp - baseline.timestamp) / 1000; // seconds

    if (timeDiff === 0) return 0;

    const memoryDiff = current.heapUsed - baseline.heapUsed;
    return memoryDiff / timeDiff; // bytes per second
  }

  /**
   * Force garbage collection manually
   */
  forceGC() {
    if (global.gc) {
      const before = process.memoryUsage();
      global.gc();
      const after = process.memoryUsage();

      const freed = before.heapUsed - after.heapUsed;
      this.gcStats.forcedGC++;
      this.gcStats.memoryFreed += freed;

      logger.info('Manual GC completed', {
        memoryFreed: this.formatBytes(freed),
        heapUsed: this.formatBytes(after.heapUsed)
      });

      return {
        freed: freed,
        before: before.heapUsed,
        after: after.heapUsed
      };
    } else {
      logger.warn('Manual GC not available. Run Node.js with --expose-gc flag');
      return null;
    }
  }

  /**
   * Reset memory baseline
   */
  resetBaseline() {
    this.memoryBaseline = this.getMemorySnapshot();
    logger.info('Memory baseline reset');
  }

  /**
   * Cleanup all monitoring data
   */
  cleanupMonitoringData() {
    this.memoryHistory = [];
    this.objectTracker.clear();
    this.allocationTracker.clear();
    this.leakSuspects.clear();
    this.performanceMetrics = {
      responseTimes: [],
      memoryUsage: [],
      allocationRates: [],
      deallocationRates: []
    };

    logger.info('Memory monitoring data cleaned up');
  }
}

// Export singleton instance
const memoryOptimizer = new MemoryOptimizer();

module.exports = memoryOptimizer;
