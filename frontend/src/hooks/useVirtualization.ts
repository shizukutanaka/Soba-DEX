import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

interface VirtualizationOptions {
  itemHeight: number | ((index: number) => number);
  containerHeight: number;
  overscan?: number;
  scrollTop?: number;
  onVisibleRangeChange?: (start: number, end: number) => void;
}

interface VirtualItem {
  index: number;
  start: number;
  size: number;
  end: number;
}

interface VirtualizationResult {
  virtualItems: VirtualItem[];
  totalSize: number;
  startIndex: number;
  endIndex: number;
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
  scrollToOffset: (offset: number) => void;
}

export function useVirtualization<T>(
  items: T[],
  options: VirtualizationOptions
): VirtualizationResult {
  const {
    itemHeight,
    containerHeight,
    overscan = 3,
    scrollTop = 0,
    onVisibleRangeChange,
  } = options;

  const scrollElementRef = useRef<HTMLElement | null>(null);
  const lastVisibleRangeRef = useRef({ start: -1, end: -1 });

  // Calculate item heights and positions
  const itemData = useMemo(() => {
    const heights: number[] = [];
    const positions: number[] = [];
    let totalSize = 0;

    for (let i = 0; i < items.length; i++) {
      const height = typeof itemHeight === 'function' ? itemHeight(i) : itemHeight;
      heights.push(height);
      positions.push(totalSize);
      totalSize += height;
    }

    return { heights, positions, totalSize };
  }, [items.length, itemHeight]);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const { positions, heights } = itemData;

    // Binary search for start index
    let start = 0;
    let end = items.length - 1;

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (positions[mid] + heights[mid] < scrollTop) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    // Calculate end index
    const visibleStart = Math.max(0, start - overscan);
    let visibleEnd = start;
    let accumulatedHeight = 0;

    for (let i = start; i < items.length; i++) {
      if (accumulatedHeight > containerHeight + scrollTop) {
        visibleEnd = i;
        break;
      }
      accumulatedHeight = positions[i] + heights[i];
    }

    visibleEnd = Math.min(items.length - 1, visibleEnd + overscan);

    return { start: visibleStart, end: visibleEnd };
  }, [scrollTop, containerHeight, itemData, items.length, overscan]);

  // Create virtual items
  const virtualItems = useMemo(() => {
    const { start, end } = visibleRange;
    const { heights, positions } = itemData;
    const items: VirtualItem[] = [];

    for (let i = start; i <= end; i++) {
      items.push({
        index: i,
        start: positions[i],
        size: heights[i],
        end: positions[i] + heights[i],
      });
    }

    return items;
  }, [visibleRange, itemData]);

  // Notify visible range changes
  useEffect(() => {
    if (onVisibleRangeChange) {
      const { start, end } = visibleRange;
      if (
        start !== lastVisibleRangeRef.current.start ||
        end !== lastVisibleRangeRef.current.end
      ) {
        onVisibleRangeChange(start, end);
        lastVisibleRangeRef.current = { start, end };
      }
    }
  }, [visibleRange, onVisibleRangeChange]);

  // Scroll to index
  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' = 'start') => {
      if (!scrollElementRef.current) return;

      const { positions, heights } = itemData;
      if (index < 0 || index >= positions.length) return;

      let offset = positions[index];

      if (align === 'center') {
        offset = offset - containerHeight / 2 + heights[index] / 2;
      } else if (align === 'end') {
        offset = offset - containerHeight + heights[index];
      }

      scrollElementRef.current.scrollTop = Math.max(0, offset);
    },
    [itemData, containerHeight]
  );

  // Scroll to offset
  const scrollToOffset = useCallback((offset: number) => {
    if (!scrollElementRef.current) return;
    scrollElementRef.current.scrollTop = Math.max(0, offset);
  }, []);

  return {
    virtualItems,
    totalSize: itemData.totalSize,
    startIndex: visibleRange.start,
    endIndex: visibleRange.end,
    scrollToIndex,
    scrollToOffset,
  };
}

// Hook for dynamic height virtualization
export function useDynamicVirtualization<T>(
  items: T[],
  estimatedItemHeight: number,
  containerHeight: number,
  measureElement?: (element: HTMLElement, index: number) => void
): VirtualizationResult {
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());

  const itemHeight = useCallback(
    (index: number) => {
      return measuredHeights.get(index) || estimatedItemHeight;
    },
    [measuredHeights, estimatedItemHeight]
  );

  const measureItem = useCallback(
    (element: HTMLElement | null, index: number) => {
      if (!element) return;

      const height = element.getBoundingClientRect().height;
      setMeasuredHeights((prev) => {
        const next = new Map(prev);
        if (next.get(index) !== height) {
          next.set(index, height);
          return next;
        }
        return prev;
      });

      measureElement?.(element, index);
    },
    [measureElement]
  );

  const virtualization = useVirtualization(items, {
    itemHeight,
    containerHeight,
    overscan: 3,
  });

  return {
    ...virtualization,
    measureItem,
  } as VirtualizationResult & { measureItem: typeof measureItem };
}