import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

export interface StateManager<T> {
  state: T;
  updateState: (updates: Partial<T>) => void;
  resetState: () => void;
  subscribe: (
    key: keyof T,
    callback: (value: T[keyof T]) => void
  ) => () => void;
}

interface StateSubscription<T> {
  [key: string]: ((value: T[keyof T]) => void)[];
}

export function useOptimizedState<T extends Record<string, any>>(
  initialState: T
): StateManager<T> {
  const [state, setState] = useState<T>(initialState);
  const subscriptions = useMemo<StateSubscription<T>>(() => ({}), []);

  const updateState = useCallback(
    (updates: Partial<T>) => {
      setState(prevState => {
        const newState = { ...prevState, ...updates };

        // Notify subscribers of changed values
        Object.keys(updates).forEach(key => {
          const typedKey = key as keyof T;
          if (subscriptions[key as string]) {
            subscriptions[key as string].forEach(callback => {
              callback(newState[typedKey]);
            });
          }
        });

        return newState;
      });
    },
    [subscriptions]
  );

  const resetState = useCallback(() => {
    setState(initialState);
  }, [initialState]);

  const subscribe = useCallback(
    (key: keyof T, callback: (value: T[keyof T]) => void) => {
      const keyStr = key as string;
      if (!subscriptions[keyStr]) {
        subscriptions[keyStr] = [];
      }
      subscriptions[keyStr].push(callback);

      // Return unsubscribe function
      return () => {
        const index = subscriptions[keyStr].indexOf(callback);
        if (index > -1) {
          subscriptions[keyStr].splice(index, 1);
        }
      };
    },
    [subscriptions]
  );

  return useMemo(
    () => ({
      state,
      updateState,
      resetState,
      subscribe,
    }),
    [state, updateState, resetState, subscribe]
  );
}

// Optimized hook for form state management
export function useFormState<T extends Record<string, any>>(
  initialValues: T,
  validationRules?: Partial<Record<keyof T, (value: any) => string | null>>
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const setValue = useCallback(
    (key: keyof T, value: T[keyof T]) => {
      setValues(prev => ({ ...prev, [key]: value }));

      // Validate if rule exists
      if (validationRules?.[key]) {
        const error = validationRules[key]!(value);
        setErrors(prev => ({ ...prev, [key]: error }));
      }
    },
    [validationRules]
  );

  const setFieldTouched = useCallback((key: keyof T, isTouched = true) => {
    setTouched(prev => ({ ...prev, [key]: isTouched }));
  }, []);

  const validateAll = useCallback(() => {
    if (!validationRules) return true;

    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    Object.keys(validationRules).forEach(key => {
      const typedKey = key as keyof T;
      const error = validationRules[typedKey]!(values[typedKey]);
      if (error) {
        newErrors[typedKey] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [validationRules, values]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  const getFieldProps = useCallback(
    (key: keyof T) => ({
      value: values[key],
      onChange: (value: T[keyof T]) => setValue(key, value),
      onBlur: () => setFieldTouched(key),
      error: touched[key] ? errors[key] : undefined,
    }),
    [values, errors, touched, setValue, setFieldTouched]
  );

  return {
    values,
    errors,
    touched,
    setValue,
    setFieldTouched,
    validateAll,
    reset,
    getFieldProps,
    isValid: Object.keys(errors).length === 0,
  };
}

// Performance monitoring hook for component optimization
export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);

  useEffect(() => {
    renderCount.current += 1;
  });

  const measureRender = useCallback(() => {
    const start = performance.now();
    return () => {
      const end = performance.now();
      const duration = end - start;
      renderTimes.current.push(duration);

      // Keep only last 10 render times
      if (renderTimes.current.length > 10) {
        renderTimes.current = renderTimes.current.slice(-10);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `${componentName} render #${renderCount.current}: ${duration.toFixed(2)}ms`
        );
      }
    };
  }, [componentName]);

  const getStats = useCallback(() => {
    const times = renderTimes.current;
    const avg =
      times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const max = times.length > 0 ? Math.max(...times) : 0;
    const min = times.length > 0 ? Math.min(...times) : 0;

    return {
      renderCount: renderCount.current,
      averageRenderTime: avg,
      maxRenderTime: max,
      minRenderTime: min,
      recentRenderTimes: times,
    };
  }, []);

  return {
    renderCount: renderCount.current,
    measureRender,
    getStats,
  };
}

// Lightweight debounce hook for performance optimization
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Optimized memoization hook
export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  return useCallback(callback, deps);
}
