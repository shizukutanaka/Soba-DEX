/**
 * Performance optimization configuration for React application
 */

export const PERFORMANCE_CONFIG = {
  // Lazy loading thresholds
  lazy: {
    componentLoadDelay: 200, // ms
    imageIntersectionThreshold: 0.1,
    preloadDistance: '200px'
  },

  // Debounce/Throttle timings
  timing: {
    searchDebounce: 300,
    scrollThrottle: 100,
    resizeDebounce: 250,
    inputDebounce: 150
  },

  // Virtualization
  virtualization: {
    overscan: 3,
    estimatedItemSize: 50,
    bufferSize: 10
  },

  // Cache settings
  cache: {
    maxSize: 100,
    ttl: 5 * 60 * 1000, // 5 minutes
    staleWhileRevalidate: true
  },

  // Web Vitals thresholds (Google recommendations)
  vitals: {
    LCP: 2500, // Largest Contentful Paint (ms)
    FID: 100,  // First Input Delay (ms)
    CLS: 0.1,  // Cumulative Layout Shift
    FCP: 1800, // First Contentful Paint (ms)
    TTFB: 800  // Time to First Byte (ms)
  },

  // Component optimization
  components: {
    memoize: true,
    useCallback: true,
    useMemo: true,
    lazyLoad: true
  },

  // Network optimization
  network: {
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
    cacheStrategy: 'cache-first'
  }
} as const;

/**
 * Check if performance monitoring is enabled
 */
export const isPerformanceMonitoringEnabled = (): boolean => {
  return process.env.NODE_ENV === 'production' ||
         process.env.REACT_APP_ENABLE_PERFORMANCE_MONITORING === 'true';
};

/**
 * Report Web Vitals to analytics
 */
export const reportWebVitals = (metric: {
  id: string;
  name: string;
  value: number;
  delta: number;
}): void => {
  if (!isPerformanceMonitoringEnabled()) {
    return;
  }

  const { name, value, delta } = metric;
  const threshold = PERFORMANCE_CONFIG.vitals[name as keyof typeof PERFORMANCE_CONFIG.vitals];

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    const status = threshold && value > threshold ? '⚠️' : '✅';
    console.log(`${status} ${name}: ${value.toFixed(2)}ms (Δ ${delta.toFixed(2)}ms)`);
  }

  // Send to analytics service in production
  if (process.env.NODE_ENV === 'production') {
    // TODO: Implement analytics reporting
    // analytics.track('web-vitals', { name, value, delta });
  }
};

/**
 * Performance optimization utilities
 */
export const PerformanceUtils = {
  /**
   * Debounce function execution
   */
  debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: Parameters<T>) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function execution
   */
  throttle<T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return function executedFunction(...args: Parameters<T>) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  /**
   * Request idle callback wrapper
   */
  runWhenIdle(callback: () => void, options?: IdleRequestOptions): number {
    if (typeof (window as any).requestIdleCallback === 'function') {
      return (window as any).requestIdleCallback(callback, options);
    }
    // Fallback for browsers without requestIdleCallback
    return (window as any).setTimeout(callback, 1);
  },

  /**
   * Cancel idle callback
   */
  cancelIdle(handle: number): void {
    if ('cancelIdleCallback' in window) {
      window.cancelIdleCallback(handle);
    } else {
      clearTimeout(handle);
    }
  },

  /**
   * Measure component render time
   */
  measureRender(componentName: string, startMark: string, endMark: string): void {
    if (!performance || !performance.measure) {
      return;
    }

    try {
      performance.measure(`${componentName} render`, startMark, endMark);
      const measure = performance.getEntriesByName(`${componentName} render`)[0];

      if (process.env.NODE_ENV === 'development') {
        console.log(`⏱️ ${componentName} rendered in ${measure.duration.toFixed(2)}ms`);
      }

      // Cleanup
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(`${componentName} render`);
    } catch (error) {
      // Silently fail if marks don't exist
    }
  }
};

export default PERFORMANCE_CONFIG;
