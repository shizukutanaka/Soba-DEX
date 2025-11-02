import { useState, useEffect, useRef, useCallback } from 'react';

// Debounce hook for reducing API calls and improving performance
export const useDebounce = <T>(value: T, delay: number): T => {
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
};

// Enhanced debounce with immediate execution option and cancellation
export const useAdvancedDebounce = <T>(
  value: T,
  delay: number,
  options: { immediate?: boolean } = {}
): [T, () => void] => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const { immediate = false } = options;

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (immediate && debouncedValue !== value) {
      setDebouncedValue(value);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay, immediate]);

  return [debouncedValue, cancel];
};