import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';

// Scheduler for batching updates
class UpdateScheduler {
  private static instance: UpdateScheduler;
  private updateQueue: Set<() => void> = new Set();
  private isScheduled = false;

  static getInstance(): UpdateScheduler {
    if (!UpdateScheduler.instance) {
      UpdateScheduler.instance = new UpdateScheduler();
    }
    return UpdateScheduler.instance;
  }

  schedule(callback: () => void): void {
    this.updateQueue.add(callback);

    if (!this.isScheduled) {
      this.isScheduled = true;

      // Use requestIdleCallback if available, otherwise fallback to requestAnimationFrame
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => this.flush());
      } else {
        requestAnimationFrame(() => this.flush());
      }
    }
  }

  private flush(): void {
    const callbacks = Array.from(this.updateQueue);
    this.updateQueue.clear();
    this.isScheduled = false;

    callbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in scheduled update:', error);
      }
    });
  }
}

// Hook for batching state updates
export function useBatchedState<T>(
  initialState: T
): [T, (newState: T | ((prevState: T) => T)) => void] {
  const [state, setState] = useState(initialState);
  const pendingStateRef = useRef<T | null>(null);
  const scheduler = UpdateScheduler.getInstance();

  const batchedSetState = useCallback((newState: T | ((prevState: T) => T)) => {
    const nextState = typeof newState === 'function'
      ? (newState as (prevState: T) => T)(pendingStateRef.current ?? state)
      : newState;

    pendingStateRef.current = nextState;

    scheduler.schedule(() => {
      setState(pendingStateRef.current!);
      pendingStateRef.current = null;
    });
  }, [state, scheduler]);

  return [pendingStateRef.current ?? state, batchedSetState];
}

// Hook for conditional rendering based on visibility
export function useVisibilityOptimization(threshold = 0.1) {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
      observer.disconnect();
    };
  }, [threshold]);

  return { elementRef, isVisible };
}

// Hook for managing component mounting state
export function useMountedState() {
  const mountedRef = useRef(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    setIsMounted(true);

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetState = useCallback(<T>(
    setter: React.Dispatch<React.SetStateAction<T>>,
    value: React.SetStateAction<T>
  ) => {
    if (mountedRef.current) {
      setter(value);
    }
  }, []);

  return { isMounted, safeSetState };
}

// Hook for expensive computations with web workers
export function useWebWorkerMemo<T, R>(
  fn: (data: T) => R,
  data: T,
  deps: React.DependencyList
): R | null {
  const [result, setResult] = useState<R | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!data) return;

    setIsComputing(true);

    // Create worker script blob
    const workerScript = `
      self.onmessage = function(e) {
        const { fn, data } = e.data;
        try {
          const func = new Function('return ' + fn)();
          const result = func(data);
          self.postMessage({ success: true, result });
        } catch (error) {
          self.postMessage({ success: false, error: error.message });
        }
      };
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { success, result, error } = e.data;

      if (success) {
        setResult(result);
      } else {
        console.error('Web worker computation error:', error);
        // Fallback to main thread computation
        try {
          const fallbackResult = fn(data);
          setResult(fallbackResult);
        } catch (fallbackError) {
          console.error('Fallback computation error:', fallbackError);
        }
      }

      setIsComputing(false);
    };

    worker.onerror = () => {
      console.error('Web worker error, falling back to main thread');
      try {
        const fallbackResult = fn(data);
        setResult(fallbackResult);
      } catch (fallbackError) {
        console.error('Fallback computation error:', fallbackError);
      }
      setIsComputing(false);
    };

    // Send computation to worker
    worker.postMessage({
      fn: fn.toString(),
      data: data
    });

    return () => {
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
    };
  }, deps);

  return result;
}

// Hook for render optimization with time slicing
export function useTimeSlicedRender<T>(
  items: T[],
  renderItem: (item: T, index: number) => ReactNode,
  batchSize = 50,
  frameTime = 16 // ~60fps
) {
  const [renderedItems, setRenderedItems] = useState<ReactNode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isRenderingRef = useRef(false);

  const renderBatch = useCallback(() => {
    if (isRenderingRef.current || currentIndex >= items.length) {
      return;
    }

    isRenderingRef.current = true;
    const startTime = performance.now();
    const newItems: ReactNode[] = [];

    let index = currentIndex;
    while (
      index < items.length &&
      newItems.length < batchSize &&
      performance.now() - startTime < frameTime
    ) {
      newItems.push(renderItem(items[index], index));
      index++;
    }

    setRenderedItems(prev => [...prev, ...newItems]);
    setCurrentIndex(index);
    isRenderingRef.current = false;

    // Schedule next batch
    if (index < items.length) {
      requestAnimationFrame(renderBatch);
    }
  }, [items, renderItem, currentIndex, batchSize, frameTime]);

  useEffect(() => {
    setRenderedItems([]);
    setCurrentIndex(0);
    isRenderingRef.current = false;

    // Start rendering
    requestAnimationFrame(renderBatch);
  }, [items, renderBatch]);

  const isComplete = currentIndex >= items.length;
  const progress = items.length > 0 ? (currentIndex / items.length) * 100 : 0;

  return {
    renderedItems,
    isComplete,
    progress,
  };
}

// Hook for preventing unnecessary re-renders
export function useShallowMemo<T extends Record<string, any>>(obj: T): T {
  const ref = useRef<T>(obj);

  return useMemo(() => {
    const keys = Object.keys(obj);
    const prevKeys = Object.keys(ref.current);

    // Check if keys changed
    if (keys.length !== prevKeys.length) {
      ref.current = obj;
      return obj;
    }

    // Check if any value changed (shallow comparison)
    for (const key of keys) {
      if (obj[key] !== ref.current[key]) {
        ref.current = obj;
        return obj;
      }
    }

    // No changes, return previous reference
    return ref.current;
  }, [obj]);
}

// Hook for component performance profiling
export function useRenderProfiler(componentName: string, enabled = false) {
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(0);
  const totalRenderTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const start = performance.now();
    renderCountRef.current++;

    return () => {
      const end = performance.now();
      const renderTime = end - start;
      lastRenderTimeRef.current = renderTime;
      totalRenderTimeRef.current += renderTime;

      // Log performance data periodically
      if (renderCountRef.current % 10 === 0) {
        console.log(`[${componentName}] Performance Stats:`, {
          renders: renderCountRef.current,
          lastRenderTime: `${renderTime.toFixed(2)}ms`,
          avgRenderTime: `${(totalRenderTimeRef.current / renderCountRef.current).toFixed(2)}ms`,
          totalRenderTime: `${totalRenderTimeRef.current.toFixed(2)}ms`,
        });
      }
    };
  });

  return {
    renderCount: renderCountRef.current,
    lastRenderTime: lastRenderTimeRef.current,
    avgRenderTime: renderCountRef.current > 0
      ? totalRenderTimeRef.current / renderCountRef.current
      : 0,
  };
}

// Hook for optimized list rendering
export function useOptimizedList<T>(
  items: T[],
  keyExtractor: (item: T, index: number) => string | number,
  itemHeight?: number
) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: Math.min(50, items.length) });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!containerRef.current || !itemHeight) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(
      start + Math.ceil(containerHeight / itemHeight) + 5,
      items.length
    );

    setVisibleRange({ start, end });
  }, [itemHeight, items.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end).map((item, index) => ({
      item,
      index: visibleRange.start + index,
      key: keyExtractor(item, visibleRange.start + index),
    }));
  }, [items, visibleRange, keyExtractor]);

  return {
    containerRef,
    visibleItems,
    totalHeight: itemHeight ? items.length * itemHeight : undefined,
    offsetY: itemHeight ? visibleRange.start * itemHeight : 0,
  };
}