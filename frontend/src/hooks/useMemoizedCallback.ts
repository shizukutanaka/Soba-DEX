import { useCallback, useRef, useMemo } from 'react';

// Memoized callback with dependency tracking
export const useMemoizedCallback = <T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T => {
  return useCallback(callback, deps);
};

// Stable callback that never changes reference but always has latest values
export const useStableCallback = <T extends (...args: any[]) => any>(
  callback: T
): T => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useMemo(
    () => ((...args: Parameters<T>) => callbackRef.current(...args)) as T,
    []
  );
};

// Event callback with automatic cleanup
export const useEventCallback = <T extends (...args: any[]) => any>(
  callback: T
): T => {
  const callbackRef = useRef<T>();
  const stableCallback = useRef<T>();

  callbackRef.current = callback;

  if (!stableCallback.current) {
    stableCallback.current = ((...args: Parameters<T>) => {
      return callbackRef.current!(...args);
    }) as T;
  }

  return stableCallback.current;
};

// Throttled callback hook
export const useThrottledCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const lastRan = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();

      if (now - lastRan.current >= delay) {
        lastRan.current = now;
        return callback(...args);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          lastRan.current = Date.now();
          callback(...args);
        }, delay - (now - lastRan.current));
      }
    }) as T,
    [callback, delay]
  );
};