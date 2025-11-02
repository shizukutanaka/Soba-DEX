import { useEffect, useRef } from 'react';
import { PerformanceUtils } from '../config/performance';

interface PerformanceMetrics {
  renderCount: number;
  lastRenderTime: number;
  avgRenderTime: number;
  totalRenderTime: number;
}

/**
 * Hook to monitor component performance
 * @param componentName Name of the component to monitor
 * @param enabled Whether monitoring is enabled
 */
export const usePerformanceMonitor = (
  componentName: string,
  enabled: boolean = process.env.NODE_ENV === 'development'
) => {
  const metricsRef = useRef<PerformanceMetrics>({
    renderCount: 0,
    lastRenderTime: 0,
    avgRenderTime: 0,
    totalRenderTime: 0
  });

  const startMarkRef = useRef<string>('');
  const endMarkRef = useRef<string>('');

  useEffect(() => {
    if (!enabled || !performance) {
      return;
    }

    const startMark = `${componentName}-render-start-${Date.now()}`;
    const endMark = `${componentName}-render-end-${Date.now()}`;

    startMarkRef.current = startMark;
    endMarkRef.current = endMark;

    performance.mark(startMark);

    return () => {
      performance.mark(endMark);

      try {
        const measureName = `${componentName}-render`;
        performance.measure(measureName, startMark, endMark);

        const measure = performance.getEntriesByName(measureName)[0];
        const duration = measure?.duration || 0;

        // Update metrics
        const metrics = metricsRef.current;
        metrics.renderCount++;
        metrics.lastRenderTime = duration;
        metrics.totalRenderTime += duration;
        metrics.avgRenderTime = metrics.totalRenderTime / metrics.renderCount;

        // Log in development
        if (process.env.NODE_ENV === 'development' && duration > 16) {
          console.warn(
            `⚠️ Slow render: ${componentName} took ${duration.toFixed(2)}ms ` +
            `(renders: ${metrics.renderCount}, avg: ${metrics.avgRenderTime.toFixed(2)}ms)`
          );
        }

        // Cleanup
        performance.clearMarks(startMark);
        performance.clearMarks(endMark);
        performance.clearMeasures(measureName);
      } catch (error) {
        // Silently fail
      }
    };
  });

  return {
    getMetrics: () => ({ ...metricsRef.current }),
    logMetrics: () => {
      const metrics = metricsRef.current;
      console.log(`📊 ${componentName} Performance:`, {
        renders: metrics.renderCount,
        lastRender: `${metrics.lastRenderTime.toFixed(2)}ms`,
        avgRender: `${metrics.avgRenderTime.toFixed(2)}ms`,
        totalTime: `${metrics.totalRenderTime.toFixed(2)}ms`
      });
    }
  };
};

/**
 * Hook to measure async operation performance
 */
export const useAsyncPerformance = () => {
  const measureAsync = async <T,>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    const startTime = performance.now();

    try {
      const result = await operation();
      const duration = performance.now() - startTime;

      if (process.env.NODE_ENV === 'development') {
        console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
      }

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`❌ ${name} failed after ${duration.toFixed(2)}ms`, error);
      throw error;
    }
  };

  return { measureAsync };
};

export default usePerformanceMonitor;
