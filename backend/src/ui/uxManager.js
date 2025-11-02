/**
 * Practical UX Manager
 * Real-world user experience optimization for trading platforms
 * Performance monitoring and accessibility compliance
 */

const EventEmitter = require('events');
const winston = require('winston');

class UXManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      // Performance targets
      performance: {
        targetLoadTime: 200, // milliseconds
        targetInteractionLatency: 50, // milliseconds
        errorRateThreshold: 0.01, // 1%
        memoryThreshold: 80 // 80% usage
      },
      // Accessibility compliance
      accessibility: {
        wcagLevel: 'AA',
        contrastRatio: 4.5,
        keyboardNavigation: true,
        screenReaderSupport: true
      },
      // User tracking (privacy-compliant)
      tracking: {
        anonymized: true,
        cookieConsent: true,
        dataRetention: 2592000000, // 30 days
        gdprCompliant: true
      },
      // Responsive design
      responsive: {
        breakpoints: {
          mobile: 768,
          tablet: 1024,
          desktop: 1200
        },
        touchOptimized: true
      },
      ...options
    };

    // UX state
    this.performanceMetrics = new Map();
    this.userSessions = new Map();
    this.errorLogs = [];
    this.accessibilityReport = {};

    this.isInitialized = false;
    this.monitoringInterval = null;

    this.initializeLogger();
  }

  initializeLogger() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'ux-manager' },
      transports: [
        new winston.transports.File({
          filename: 'logs/ux.log',
          maxsize: 10485760,
          maxFiles: 5
        })
      ]
    });
  }

  async initialize() {
    try {
      this.logger.info('Initializing UX Manager...');

      await this.setupPerformanceMonitoring();
      await this.initializeAccessibilityFeatures();
      await this.setupErrorTracking();
      await this.startMonitoring();

      this.isInitialized = true;
      this.logger.info('UX Manager initialized successfully');

      return { success: true, message: 'UX manager ready' };
    } catch (error) {
      this.logger.error('Failed to initialize UX manager:', error);
      throw error;
    }
  }

  async setupPerformanceMonitoring() {
    // Initialize performance tracking
    this.performanceTracker = {
      startTime: Date.now(),
      pageLoads: 0,
      interactions: 0,
      errors: 0,
      totalLoadTime: 0,
      totalInteractionTime: 0
    };

    this.logger.info('Performance monitoring setup complete');
  }

  async initializeAccessibilityFeatures() {
    // Setup accessibility compliance checking
    this.accessibilityChecker = {
      contrastRatios: new Map(),
      keyboardPaths: new Set(),
      ariaLabels: new Set(),
      altTexts: new Set()
    };

    this.logger.info('Accessibility features initialized');
  }

  async setupErrorTracking() {
    // Setup client-side error tracking
    this.errorTracker = {
      jsErrors: [],
      networkErrors: [],
      userErrors: [],
      lastCleanup: Date.now()
    };

    this.logger.info('Error tracking setup complete');
  }

  async startMonitoring() {
    // Start performance and UX monitoring
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCheck();
    }, 60000); // Every minute

    this.logger.info('UX monitoring started');
  }

  // Performance tracking
  trackPageLoad(loadData) {
    try {
      const { loadTime, page, device, user } = loadData;

      // Update performance metrics
      this.performanceTracker.pageLoads++;
      this.performanceTracker.totalLoadTime += loadTime;

      // Check if load time exceeds target
      if (loadTime > this.options.performance.targetLoadTime) {
        this.logger.warn('Slow page load detected', {
          page,
          loadTime,
          target: this.options.performance.targetLoadTime
        });

        this.emit('slowPageLoad', { page, loadTime, device, user });
      }

      // Store detailed metrics
      const metricKey = `${page}_${Date.now()}`;
      this.performanceMetrics.set(metricKey, {
        page,
        loadTime,
        device,
        timestamp: Date.now()
      });

      // Clean old metrics
      this.cleanupOldMetrics();

    } catch (error) {
      this.logger.error('Error tracking page load:', error);
    }
  }

  trackUserInteraction(interactionData) {
    try {
      const { type, duration, element, user } = interactionData;

      this.performanceTracker.interactions++;
      this.performanceTracker.totalInteractionTime += duration;

      // Check interaction latency
      if (duration > this.options.performance.targetInteractionLatency) {
        this.logger.warn('Slow interaction detected', {
          type,
          element,
          duration,
          target: this.options.performance.targetInteractionLatency
        });

        this.emit('slowInteraction', { type, element, duration, user });
      }

      // Track interaction patterns
      this.trackInteractionPattern(interactionData);

    } catch (error) {
      this.logger.error('Error tracking interaction:', error);
    }
  }

  trackInteractionPattern(interaction) {
    const { user, type, element } = interaction;

    if (!user) {
      return;
    }

    let session = this.userSessions.get(user);
    if (!session) {
      session = {
        startTime: Date.now(),
        interactions: [],
        patterns: {
          clickFrequency: 0,
          errorCount: 0,
          taskCompletions: 0
        }
      };
      this.userSessions.set(user, session);
    }

    session.interactions.push({
      type,
      element,
      timestamp: Date.now()
    });

    // Update patterns
    session.patterns.clickFrequency = session.interactions.length;

    // Keep sessions manageable
    if (session.interactions.length > 100) {
      session.interactions = session.interactions.slice(-50);
    }
  }

  // Error tracking
  trackError(errorData) {
    try {
      const { type, message, stack, page, user, device } = errorData;

      this.performanceTracker.errors++;

      const error = {
        type,
        message,
        stack,
        page,
        user,
        device,
        timestamp: Date.now()
      };

      // Categorize error
      switch (type) {
      case 'javascript':
        this.errorTracker.jsErrors.push(error);
        break;
      case 'network':
        this.errorTracker.networkErrors.push(error);
        break;
      case 'user':
        this.errorTracker.userErrors.push(error);
        break;
      default:
        this.errorLogs.push(error);
      }

      // Check error rate
      this.checkErrorRate();

      this.logger.error('Error tracked', error);

    } catch (err) {
      this.logger.error('Error tracking error:', err);
    }
  }

  checkErrorRate() {
    const totalInteractions = this.performanceTracker.interactions || 1;
    const errorRate = this.performanceTracker.errors / totalInteractions;

    if (errorRate > this.options.performance.errorRateThreshold) {
      this.logger.warn('High error rate detected', {
        errorRate,
        threshold: this.options.performance.errorRateThreshold,
        totalErrors: this.performanceTracker.errors,
        totalInteractions
      });

      this.emit('highErrorRate', { errorRate, threshold: this.options.performance.errorRateThreshold });
    }
  }

  // Accessibility methods
  checkAccessibility(element, context) {
    try {
      const issues = [];

      // Check contrast ratio
      if (context.colors) {
        const contrastRatio = this.calculateContrastRatio(
          context.colors.foreground,
          context.colors.background
        );

        if (contrastRatio < this.options.accessibility.contrastRatio) {
          issues.push({
            type: 'contrast',
            severity: 'high',
            expected: this.options.accessibility.contrastRatio,
            actual: contrastRatio
          });
        }
      }

      // Check ARIA labels
      if (element.interactive && !element.ariaLabel && !element.ariaLabelledBy) {
        issues.push({
          type: 'aria_label',
          severity: 'medium',
          message: 'Interactive element missing ARIA label'
        });
      }

      // Check keyboard navigation
      if (element.interactive && !element.tabIndex && element.tabIndex !== 0) {
        issues.push({
          type: 'keyboard_navigation',
          severity: 'medium',
          message: 'Interactive element not keyboard accessible'
        });
      }

      // Check alt text for images
      if (element.type === 'img' && !element.altText) {
        issues.push({
          type: 'alt_text',
          severity: 'high',
          message: 'Image missing alternative text'
        });
      }

      return issues;

    } catch (error) {
      this.logger.error('Accessibility check failed:', error);
      return [];
    }
  }

  calculateContrastRatio(foreground, background) {
    // Simplified contrast ratio calculation
    // In a real implementation, use a proper library like 'color-contrast'
    const fgLuminance = this.getLuminance(foreground);
    const bgLuminance = this.getLuminance(background);

    const lighter = Math.max(fgLuminance, bgLuminance);
    const darker = Math.min(fgLuminance, bgLuminance);

    return (lighter + 0.05) / (darker + 0.05);
  }

  getLuminance(color) {
    // Simplified luminance calculation
    // Convert hex to RGB and calculate relative luminance
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Performance optimization
  optimizeAssetLoading(assets) {
    const optimizations = [];

    assets.forEach(asset => {
      switch (asset.type) {
      case 'image':
        if (asset.size > 100000) { // 100KB
          optimizations.push({
            asset: asset.name,
            recommendation: 'compress_image',
            expectedImprovement: '30-50% size reduction'
          });
        }
        break;

      case 'javascript':
        if (asset.size > 200000) { // 200KB
          optimizations.push({
            asset: asset.name,
            recommendation: 'code_splitting',
            expectedImprovement: 'Faster initial load'
          });
        }
        break;

      case 'css':
        if (asset.size > 50000) { // 50KB
          optimizations.push({
            asset: asset.name,
            recommendation: 'minify_css',
            expectedImprovement: '10-20% size reduction'
          });
        }
        break;
      }
    });

    return optimizations;
  }

  // Responsive design helpers
  getOptimalLayout(deviceInfo) {
    const { screenWidth, _screenHeight, _deviceType, _orientation } = deviceInfo;

    if (screenWidth <= this.options.responsive.breakpoints.mobile) {
      return {
        layout: 'mobile',
        navigation: 'bottom-tabs',
        fontSize: 'large',
        touchTargetSize: 44 // pixels
      };
    } else if (screenWidth <= this.options.responsive.breakpoints.tablet) {
      return {
        layout: 'tablet',
        navigation: 'side-panel',
        fontSize: 'medium',
        touchTargetSize: 36
      };
    } else {
      return {
        layout: 'desktop',
        navigation: 'top-menu',
        fontSize: 'normal',
        touchTargetSize: 0 // Not touch-optimized
      };
    }
  }

  // Monitoring and cleanup
  async performMonitoringCheck() {
    try {
      // Check performance metrics
      await this.checkPerformanceHealth();

      // Clean up old data
      await this.cleanupOldData();

      // Generate insights
      const insights = this.generatePerformanceInsights();
      if (insights.length > 0) {
        this.emit('performanceInsights', insights);
      }

    } catch (error) {
      this.logger.error('Monitoring check failed:', error);
    }
  }

  checkPerformanceHealth() {
    const averageLoadTime = this.performanceTracker.pageLoads > 0
      ? this.performanceTracker.totalLoadTime / this.performanceTracker.pageLoads
      : 0;

    const averageInteractionTime = this.performanceTracker.interactions > 0
      ? this.performanceTracker.totalInteractionTime / this.performanceTracker.interactions
      : 0;

    const errorRate = this.performanceTracker.interactions > 0
      ? this.performanceTracker.errors / this.performanceTracker.interactions
      : 0;

    // Log performance health
    this.logger.info('Performance health check', {
      averageLoadTime,
      averageInteractionTime,
      errorRate,
      totalPageLoads: this.performanceTracker.pageLoads,
      totalInteractions: this.performanceTracker.interactions
    });

    return {
      averageLoadTime,
      averageInteractionTime,
      errorRate,
      healthy: averageLoadTime <= this.options.performance.targetLoadTime &&
                    averageInteractionTime <= this.options.performance.targetInteractionLatency &&
                    errorRate <= this.options.performance.errorRateThreshold
    };
  }

  cleanupOldMetrics() {
    const cutoff = Date.now() - 3600000; // 1 hour

    for (const [key, metric] of this.performanceMetrics) {
      if (metric.timestamp < cutoff) {
        this.performanceMetrics.delete(key);
      }
    }
  }

  cleanupOldData() {
    const cutoff = Date.now() - this.options.tracking.dataRetention;

    // Clean user sessions
    for (const [userId, session] of this.userSessions) {
      if (session.startTime < cutoff) {
        this.userSessions.delete(userId);
      }
    }

    // Clean error logs
    this.errorLogs = this.errorLogs.filter(error => error.timestamp > cutoff);
    this.errorTracker.jsErrors = this.errorTracker.jsErrors.filter(error => error.timestamp > cutoff);
    this.errorTracker.networkErrors = this.errorTracker.networkErrors.filter(error => error.timestamp > cutoff);
    this.errorTracker.userErrors = this.errorTracker.userErrors.filter(error => error.timestamp > cutoff);
  }

  generatePerformanceInsights() {
    const insights = [];

    // Analyze performance trends
    const recentMetrics = Array.from(this.performanceMetrics.values())
      .filter(m => m.timestamp > Date.now() - 3600000); // Last hour

    if (recentMetrics.length > 10) {
      const averageLoadTime = recentMetrics.reduce((sum, m) => sum + m.loadTime, 0) / recentMetrics.length;

      if (averageLoadTime > this.options.performance.targetLoadTime * 1.5) {
        insights.push({
          type: 'performance_degradation',
          severity: 'high',
          message: 'Page load times have significantly increased',
          data: { averageLoadTime, target: this.options.performance.targetLoadTime }
        });
      }
    }

    // Analyze error patterns
    const recentErrors = this.errorLogs.filter(e => e.timestamp > Date.now() - 3600000);
    if (recentErrors.length > 10) {
      insights.push({
        type: 'error_spike',
        severity: 'medium',
        message: 'Unusual increase in error frequency',
        data: { errorCount: recentErrors.length }
      });
    }

    return insights;
  }

  // Status and reporting
  getUXStatus() {
    const health = this.checkPerformanceHealth();

    return {
      isInitialized: this.isInitialized,
      performance: {
        healthy: health.healthy,
        averageLoadTime: health.averageLoadTime,
        averageInteractionTime: health.averageInteractionTime,
        errorRate: health.errorRate
      },
      tracking: {
        activeSessions: this.userSessions.size,
        totalPageLoads: this.performanceTracker.pageLoads,
        totalInteractions: this.performanceTracker.interactions,
        totalErrors: this.performanceTracker.errors
      },
      accessibility: {
        wcagLevel: this.options.accessibility.wcagLevel,
        contrastRatio: this.options.accessibility.contrastRatio,
        keyboardNavigation: this.options.accessibility.keyboardNavigation
      }
    };
  }

  generateUXReport() {
    const status = this.getUXStatus();
    const insights = this.generatePerformanceInsights();

    return {
      timestamp: new Date().toISOString(),
      status,
      insights,
      recommendations: this.generateRecommendations(status, insights)
    };
  }

  generateRecommendations(status, _insights) {
    const recommendations = [];

    if (!status.performance.healthy) {
      if (status.performance.averageLoadTime > this.options.performance.targetLoadTime) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          action: 'Optimize asset loading and implement caching',
          expectedImpact: 'Reduce load times by 20-40%'
        });
      }

      if (status.performance.errorRate > this.options.performance.errorRateThreshold) {
        recommendations.push({
          type: 'reliability',
          priority: 'critical',
          action: 'Investigate and fix error patterns',
          expectedImpact: 'Improve user experience and reduce frustration'
        });
      }
    }

    return recommendations;
  }

  async shutdown() {
    this.logger.info('Shutting down UX Manager...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Clear data
    this.performanceMetrics.clear();
    this.userSessions.clear();

    this.isInitialized = false;
    this.logger.info('UX Manager shutdown complete');
  }
}

module.exports = UXManager;