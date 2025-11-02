/**
 * Optimized Price Updates Hook
 *
 * PERFORMANCE IMPROVEMENTS:
 * - Granular subscriptions (only update changed prices)
 * - Memoized price objects
 * - Reduced update frequency (2s -> 5s)
 * - Diff-based updates (only notify on actual changes)
 * - Automatic cleanup of stale subscriptions
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  timestamp: number;
}

interface UsePriceUpdatesReturn {
  prices: Record<string, PriceData>;
  isConnected: boolean;
  error: string | null;
  subscribe: (symbol: string) => void;
  unsubscribe: (symbol: string) => void;
}

const MOCK_PRICES: Record<string, number> = {
  'ETH/USDT': 2500,
  'BTC/USDT': 45000,
  'BNB/USDT': 300,
  'ADA/USDT': 0.8,
  'DOT/USDT': 12,
};

const UPDATE_INTERVAL = 5000; // 5 seconds (reduced from 2s)
const PRICE_CHANGE_THRESHOLD = 0.01; // 1% minimum change to trigger update

export const useOptimizedPriceUpdates = (): UsePriceUpdatesReturn => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref for subscriptions to avoid recreating effect
  const subscriptionsRef = useRef(new Set<string>());
  const [, forceUpdate] = useState(0);

  // Cache previous prices to detect changes
  const priceCache = useRef<Record<string, PriceData>>({});

  const generatePriceUpdate = useCallback((symbol: string): PriceData => {
    const basePrice = MOCK_PRICES[symbol] || 100;
    const variation = (Math.random() - 0.5) * 0.02;
    const newPrice = basePrice * (1 + variation);

    return {
      symbol,
      price: Number(newPrice.toFixed(2)),
      change24h: Number(((Math.random() - 0.5) * 10).toFixed(2)),
      volume24h: Number((Math.random() * 1000000).toFixed(0)),
      timestamp: Date.now(),
    };
  }, []);

  const subscribe = useCallback((symbol: string) => {
    if (!subscriptionsRef.current.has(symbol)) {
      subscriptionsRef.current.add(symbol);

      // Initialize price immediately
      const initialPrice = generatePriceUpdate(symbol);
      priceCache.current[symbol] = initialPrice;
      setPrices((prev) => ({
        ...prev,
        [symbol]: initialPrice,
      }));

      forceUpdate((n) => n + 1);
    }
  }, [generatePriceUpdate]);

  const unsubscribe = useCallback((symbol: string) => {
    if (subscriptionsRef.current.has(symbol)) {
      subscriptionsRef.current.delete(symbol);
      delete priceCache.current[symbol];

      setPrices((prev) => {
        const newPrices = { ...prev };
        delete newPrices[symbol];
        return newPrices;
      });

      forceUpdate((n) => n + 1);
    }
  }, []);

  // PERFORMANCE: Only update prices that actually changed
  const updatePrices = useCallback(() => {
    if (subscriptionsRef.current.size === 0) return;

    const updatedPrices: Record<string, PriceData> = {};
    let hasChanges = false;

    subscriptionsRef.current.forEach((symbol) => {
      const newPrice = generatePriceUpdate(symbol);
      const oldPrice = priceCache.current[symbol];

      // Only update if price changed significantly
      if (
        !oldPrice ||
        Math.abs((newPrice.price - oldPrice.price) / oldPrice.price) >
          PRICE_CHANGE_THRESHOLD
      ) {
        updatedPrices[symbol] = newPrice;
        priceCache.current[symbol] = newPrice;
        hasChanges = true;
      }
    });

    // Only trigger state update if there are actual changes
    if (hasChanges) {
      setPrices((prev) => ({
        ...prev,
        ...updatedPrices,
      }));
    }
  }, [generatePriceUpdate]);

  // WebSocket simulation with improved cleanup
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;
    let isActive = true;

    const connect = () => {
      if (!isActive) return;
      setIsConnected(true);
      setError(null);

      // Update prices periodically
      interval = setInterval(() => {
        if (isActive) {
          updatePrices();
        }
      }, UPDATE_INTERVAL);
    };

    const disconnect = () => {
      setIsConnected(false);
      if (interval) clearInterval(interval);
    };

    // Simulate connection delay
    timeout = setTimeout(connect, 1000);

    return () => {
      isActive = false;
      disconnect();
      if (timeout) clearTimeout(timeout);
    };
  }, [updatePrices]);

  // Memoize the return object to prevent unnecessary rerenders
  return useMemo(
    () => ({
      prices,
      isConnected,
      error,
      subscribe,
      unsubscribe,
    }),
    [prices, isConnected, error, subscribe, unsubscribe]
  );
};
