import { useState, useEffect, useCallback } from 'react';

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

export const usePriceUpdates = (): UsePriceUpdatesReturn => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());

  const generatePriceUpdate = useCallback((symbol: string): PriceData => {
    const basePrice = MOCK_PRICES[symbol] || 100;
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    const newPrice = basePrice * (1 + variation);

    return {
      symbol,
      price: newPrice,
      change24h: (Math.random() - 0.5) * 10, // Random 24h change
      volume24h: Math.random() * 1000000,
      timestamp: Date.now(),
    };
  }, []);

  const subscribe = useCallback((symbol: string) => {
    setSubscriptions(prev => {
      const newSubs = new Set(prev);
      newSubs.add(symbol);
      return newSubs;
    });
  }, []);

  const unsubscribe = useCallback((symbol: string) => {
    setSubscriptions(prev => {
      const newSubs = new Set(prev);
      newSubs.delete(symbol);
      return newSubs;
    });
  }, []);

  // Simulate WebSocket connection
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;

    const connect = () => {
      setIsConnected(true);
      setError(null);

      // Update prices every 2 seconds
      interval = setInterval(() => {
        if (subscriptions.size > 0) {
          setPrices(prevPrices => {
            const updatedPrices = { ...prevPrices };

            subscriptions.forEach(symbol => {
              updatedPrices[symbol] = generatePriceUpdate(symbol);
            });

            return updatedPrices;
          });
        }
      }, 2000);
    };

    const disconnect = () => {
      setIsConnected(false);
      if (interval) clearInterval(interval);
    };

    // Simulate connection delay
    timeout = setTimeout(connect, 1000);

    // Simulate occasional disconnections
    const disconnectInterval = setInterval(() => {
      if (Math.random() < 0.05) { // 5% chance of disconnect
        disconnect();
        setTimeout(connect, 2000); // Reconnect after 2 seconds
      }
    }, 10000);

    return () => {
      disconnect();
      if (timeout) clearTimeout(timeout);
      if (disconnectInterval) clearInterval(disconnectInterval);
    };
  }, [subscriptions, generatePriceUpdate]);

  // Initialize prices for subscribed symbols
  useEffect(() => {
    subscriptions.forEach(symbol => {
      setPrices(prev => {
        // Only update if the symbol doesn't exist in state
        if (!prev[symbol]) {
          return {
            ...prev,
            [symbol]: generatePriceUpdate(symbol)
          };
        }
        return prev;
      });
    });
  }, [subscriptions, generatePriceUpdate]); // Removed 'prices' to prevent infinite loop

  return {
    prices,
    isConnected,
    error,
    subscribe,
    unsubscribe,
  };
};