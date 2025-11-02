/**
 * Soba RUM SDK - Real User Monitoring for Browsers
 *
 * A lightweight JavaScript SDK for browser monitoring with zero dependencies.
 * Tracks performance metrics, Core Web Vitals, errors, and user interactions.
 *
 * @version 3.2.0
 * @license MIT
 */

(function(window) {
  'use strict';

  const SobaRUM = {
    version: '3.2.0',
    config: {
      endpoint: null,
      appName: 'soba-app',
      environment: 'production',
      version: '1.0.0',

      // Sampling
      sampleRate: 1.0,
      errorSampleRate: 1.0,

      // Features
      captureErrors: true,
      captureWebVitals: true,
      captureResources: true,
      captureInteractions: false,

      // Session
      sessionId: null,
      userId: null,

      // Batching
      batchSize: 10,
      batchInterval: 5000,

      // Custom attributes
      attributes: {},

      // Trace context
      propagateTraceContext: true
    },

    // Internal state
    _initialized: false,
    _sessionId: null,
    _eventQueue: [],
    _batchTimer: null,
    _observers: {},

    /**
     * Initialize RUM SDK
     */
    init: function(userConfig) {
      if (this._initialized) {
        console.warn('[SobaRUM] Already initialized');
        return;
      }

      // Merge config
      Object.assign(this.config, userConfig);

      if (!this.config.endpoint) {
        console.error('[SobaRUM] endpoint is required');
        return;
      }

      // Generate or use provided session ID
      this._sessionId = this.config.sessionId || this._generateSessionId();

      // Apply sampling
      if (Math.random() > this.config.sampleRate) {
        console.log('[SobaRUM] Session not sampled');
        return;
      }

      // Start capturing
      this._setupPageViewCapture();

      if (this.config.captureErrors) {
        this._setupErrorCapture();
      }

      if (this.config.captureWebVitals) {
        this._setupWebVitalsCapture();
      }

      if (this.config.captureResources) {
        this._setupResourceCapture();
      }

      // Start batch processor
      this._startBatchProcessor();

      // Track initial page view
      this._trackPageView();

      this._initialized = true;
      console.log('[SobaRUM] Initialized', {
        version: this.version,
        appName: this.config.appName,
        sessionId: this._sessionId
      });
    },

    /**
     * Track page view (manual for SPAs)
     */
    trackPageView: function(url, options) {
      if (!this._initialized) return;

      const pageUrl = url || window.location.href;
      const timing = this._getPageTiming();
      const webVitals = this._getWebVitals();

      this._sendEvent({
        type: 'pageview',
        data: {
          sessionId: this._sessionId,
          userId: this.config.userId,
          url: pageUrl,
          referrer: document.referrer,
          timestamp: Date.now(),
          timing,
          webVitals,
          screenResolution: `${screen.width}x${screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          connection: this._getConnectionInfo(),
          attributes: this.config.attributes,
          ...options
        }
      });
    },

    /**
     * Track custom event
     */
    trackEvent: function(name, data) {
      if (!this._initialized) return;

      this._sendEvent({
        type: 'event',
        data: {
          sessionId: this._sessionId,
          userId: this.config.userId,
          name,
          timestamp: Date.now(),
          url: window.location.href,
          ...data
        }
      });
    },

    /**
     * Track error
     */
    trackError: function(error, context) {
      if (!this._initialized) return;

      // Apply error sampling
      if (Math.random() > this.config.errorSampleRate) {
        return;
      }

      const errorData = {
        sessionId: this._sessionId,
        userId: this.config.userId,
        url: window.location.href,
        timestamp: Date.now(),
        type: 'error',
        message: error.message || String(error),
        stack: error.stack,
        attributes: {
          ...this.config.attributes,
          ...context
        }
      };

      this._sendEvent({
        type: 'error',
        data: errorData
      });
    },

    /**
     * Record custom metric
     */
    recordMetric: function(name, value, unit) {
      if (!this._initialized) return;

      this._sendEvent({
        type: 'metric',
        data: {
          sessionId: this._sessionId,
          name,
          value,
          unit: unit || 'ms',
          timestamp: Date.now()
        }
      });
    },

    /**
     * Performance mark
     */
    mark: function(name) {
      if (window.performance && window.performance.mark) {
        window.performance.mark(name);
      }
    },

    /**
     * Performance measure
     */
    measure: function(name, startMark, endMark) {
      if (window.performance && window.performance.measure) {
        try {
          window.performance.measure(name, startMark, endMark);
          const measurement = window.performance.getEntriesByName(name)[0];
          if (measurement) {
            this.recordMetric(name, measurement.duration);
          }
        } catch (e) {
          console.warn('[SobaRUM] Measure failed:', e);
        }
      }
    },

    /**
     * Set user ID
     */
    setUserId: function(userId) {
      this.config.userId = userId;
    },

    /**
     * Set session attribute
     */
    setSessionAttribute: function(key, value) {
      this.config.attributes[key] = value;
    },

    // ========================================================================
    // Internal Methods
    // ========================================================================

    /**
     * Setup automatic page view capture
     */
    _setupPageViewCapture: function() {
      // Capture on load
      if (document.readyState === 'complete') {
        this._trackPageView();
      } else {
        window.addEventListener('load', () => {
          setTimeout(() => this._trackPageView(), 0);
        });
      }

      // For SPAs, capture on history changes
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      const self = this;

      history.pushState = function() {
        originalPushState.apply(this, arguments);
        self._trackPageView();
      };

      history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        self._trackPageView();
      };

      window.addEventListener('popstate', () => {
        this._trackPageView();
      });
    },

    /**
     * Track page view internally
     */
    _trackPageView: function() {
      // Wait for performance data to be available
      setTimeout(() => {
        this.trackPageView();
      }, 0);
    },

    /**
     * Setup error capture
     */
    _setupErrorCapture: function() {
      const self = this;

      // JavaScript errors
      window.addEventListener('error', function(event) {
        self.trackError(event.error || {
          message: event.message,
          source: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }, {
          type: 'javascript_error'
        });
      });

      // Unhandled promise rejections
      window.addEventListener('unhandledrejection', function(event) {
        self.trackError(event.reason || {
          message: 'Unhandled Promise Rejection'
        }, {
          type: 'unhandled_rejection'
        });
      });
    },

    /**
     * Setup Web Vitals capture
     */
    _setupWebVitalsCapture: function() {
      const self = this;

      // LCP - Largest Contentful Paint
      if ('PerformanceObserver' in window) {
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];

            self._sendEvent({
              type: 'webvital',
              data: {
                sessionId: self._sessionId,
                url: window.location.href,
                name: 'LCP',
                value: lastEntry.renderTime || lastEntry.loadTime,
                timestamp: Date.now()
              }
            });
          });

          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
          this._observers.lcp = lcpObserver;
        } catch (e) {
          console.warn('[SobaRUM] LCP observer failed:', e);
        }

        // FID - First Input Delay
        try {
          const fidObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach(entry => {
              self._sendEvent({
                type: 'webvital',
                data: {
                  sessionId: self._sessionId,
                  url: window.location.href,
                  name: 'FID',
                  value: entry.processingStart - entry.startTime,
                  timestamp: Date.now()
                }
              });
            });
          });

          fidObserver.observe({ entryTypes: ['first-input'] });
          this._observers.fid = fidObserver;
        } catch (e) {
          console.warn('[SobaRUM] FID observer failed:', e);
        }

        // CLS - Cumulative Layout Shift
        try {
          let clsValue = 0;
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
          });

          clsObserver.observe({ entryTypes: ['layout-shift'] });
          this._observers.cls = clsObserver;

          // Send CLS on page hide
          window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
              self._sendEvent({
                type: 'webvital',
                data: {
                  sessionId: self._sessionId,
                  url: window.location.href,
                  name: 'CLS',
                  value: clsValue,
                  timestamp: Date.now()
                }
              });
            }
          });
        } catch (e) {
          console.warn('[SobaRUM] CLS observer failed:', e);
        }
      }

      // FCP - First Contentful Paint (from Navigation Timing)
      window.addEventListener('load', () => {
        const fcp = this._getFCP();
        if (fcp) {
          self._sendEvent({
            type: 'webvital',
            data: {
              sessionId: self._sessionId,
              url: window.location.href,
              name: 'FCP',
              value: fcp,
              timestamp: Date.now()
            }
          });
        }
      });
    },

    /**
     * Setup resource capture
     */
    _setupResourceCapture: function() {
      const self = this;

      if ('PerformanceObserver' in window) {
        try {
          const resourceObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const resources = entries.map(entry => ({
              name: entry.name,
              type: entry.initiatorType,
              duration: entry.duration,
              size: entry.transferSize,
              startTime: entry.startTime
            }));

            if (resources.length > 0) {
              self._sendEvent({
                type: 'resource',
                data: {
                  sessionId: self._sessionId,
                  url: window.location.href,
                  resources,
                  timestamp: Date.now()
                }
              });
            }
          });

          resourceObserver.observe({ entryTypes: ['resource'] });
          this._observers.resource = resourceObserver;
        } catch (e) {
          console.warn('[SobaRUM] Resource observer failed:', e);
        }
      }
    },

    /**
     * Get page timing
     */
    _getPageTiming: function() {
      if (!window.performance || !window.performance.timing) {
        return {};
      }

      const timing = window.performance.timing;
      const navigationStart = timing.navigationStart;

      return {
        dns: timing.domainLookupEnd - timing.domainLookupStart,
        tcp: timing.connectEnd - timing.connectStart,
        tls: timing.secureConnectionStart > 0
          ? timing.connectEnd - timing.secureConnectionStart
          : 0,
        ttfb: timing.responseStart - navigationStart,
        download: timing.responseEnd - timing.responseStart,
        domInteractive: timing.domInteractive - navigationStart,
        domComplete: timing.domComplete - navigationStart,
        loadComplete: timing.loadEventEnd - navigationStart
      };
    },

    /**
     * Get Web Vitals (snapshot)
     */
    _getWebVitals: function() {
      return {
        fcp: this._getFCP(),
        ttfb: this._getTTFB()
      };
    },

    /**
     * Get First Contentful Paint
     */
    _getFCP: function() {
      if (!window.performance || !window.performance.getEntriesByType) {
        return null;
      }

      const paintEntries = window.performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');

      return fcpEntry ? fcpEntry.startTime : null;
    },

    /**
     * Get Time to First Byte
     */
    _getTTFB: function() {
      if (!window.performance || !window.performance.timing) {
        return null;
      }

      const timing = window.performance.timing;
      return timing.responseStart - timing.navigationStart;
    },

    /**
     * Get connection info
     */
    _getConnectionInfo: function() {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

      if (!connection) {
        return {};
      }

      return {
        type: connection.type,
        effectiveType: connection.effectiveType,
        rtt: connection.rtt,
        downlink: connection.downlink
      };
    },

    /**
     * Send event
     */
    _sendEvent: function(event) {
      this._eventQueue.push(event);

      // If batch is full, send immediately
      if (this._eventQueue.length >= this.config.batchSize) {
        this._sendBatch();
      }
    },

    /**
     * Start batch processor
     */
    _startBatchProcessor: function() {
      this._batchTimer = setInterval(() => {
        if (this._eventQueue.length > 0) {
          this._sendBatch();
        }
      }, this.config.batchInterval);

      // Send batch on page unload
      window.addEventListener('beforeunload', () => {
        this._sendBatch(true);
      });

      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this._sendBatch(true);
        }
      });
    },

    /**
     * Send batch
     */
    _sendBatch: function(useBeacon) {
      if (this._eventQueue.length === 0) return;

      const batch = this._eventQueue.splice(0, this.config.batchSize);
      const payload = JSON.stringify({ events: batch });

      // Use Beacon API if available and requested (for unload events)
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(this.config.endpoint + '/batch', payload);
      } else {
        // Use fetch
        fetch(this.config.endpoint + '/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: payload,
          keepalive: true
        }).catch(err => {
          console.error('[SobaRUM] Failed to send batch:', err);
        });
      }
    },

    /**
     * Generate session ID
     */
    _generateSessionId: function() {
      return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  };

  // Export
  window.SobaRUM = SobaRUM;

})(window);
