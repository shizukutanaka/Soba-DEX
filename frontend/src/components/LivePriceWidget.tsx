import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface PriceData {
  tokenPair: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  lastUpdate: number;
}

interface LivePriceWidgetProps {
  tokenPair: string;
  updateInterval?: number;
  showChart?: boolean;
  compact?: boolean;
}

const LivePriceWidget: React.FC<LivePriceWidgetProps> = ({
  tokenPair,
  updateInterval = 5000,
  showChart = false,
  compact = false,
}) => {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const fetchPrice = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/prices/${tokenPair}`);

      if (!response.ok) {
        throw new Error('Failed to fetch price data');
      }

      const data = await response.json();

      if (data.success) {
        const newPriceData: PriceData = {
          tokenPair: data.data.pair,
          price: data.data.price,
          priceChange24h: data.data.priceChange24h || 0,
          volume24h: data.data.volume24h || 0,
          high24h: data.data.high24h || data.data.price,
          low24h: data.data.low24h || data.data.price,
          lastUpdate: Date.now(),
        };

        setPriceData(newPriceData);
        setPriceHistory(prev => [...prev.slice(-29), newPriceData.price]);
        setIsLoading(false);
        setIsConnected(true);
      } else {
        throw new Error(data.error || 'Invalid response format');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsLoading(false);
      setIsConnected(false);
    }
  }, [tokenPair]);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, updateInterval);
    return () => clearInterval(interval);
  }, [fetchPrice, updateInterval]);

  const formatPrice = (price: number): string => {
    if (price >= 1) {
      return price.toFixed(2);
    } else if (price >= 0.01) {
      return price.toFixed(4);
    } else {
      return price.toFixed(8);
    }
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1_000_000) {
      return `$${(volume / 1_000_000).toFixed(2)}M`;
    } else if (volume >= 1_000) {
      return `$${(volume / 1_000).toFixed(2)}K`;
    } else {
      return `$${volume.toFixed(2)}`;
    }
  };

  const renderMiniChart = () => {
    if (!showChart || priceHistory.length < 2) return null;

    const max = Math.max(...priceHistory);
    const min = Math.min(...priceHistory);
    const range = max - min;

    const points = priceHistory.map((price, index) => {
      const x = (index / (priceHistory.length - 1)) * 100;
      const y = range > 0 ? ((max - price) / range) * 30 : 15;
      return `${x},${y}`;
    }).join(' ');

    const isPositive = priceHistory[priceHistory.length - 1] >= priceHistory[0];
    const color = isPositive ? '#00D395' : '#FF4976';

    return (
      <svg className="price-widget__chart" viewBox="0 0 100 30" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  if (isLoading) {
    return (
      <div className={`price-widget ${compact ? 'price-widget--compact' : ''}`}>
        <div className="price-widget__loading">
          <div className="spinner"></div>
          <span>Loading price...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`price-widget ${compact ? 'price-widget--compact' : ''} price-widget--error`}>
        <div className="price-widget__error">
          <span className="price-widget__error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!priceData) {
    return null;
  }

  const isPositive = priceData.priceChange24h >= 0;
  const priceChangeClass = isPositive ? 'price-widget__change--positive' : 'price-widget__change--negative';

  return (
    <div className={`price-widget ${compact ? 'price-widget--compact' : ''}`}>
      <div className="price-widget__header">
        <div className="price-widget__pair">
          <h4>{priceData.tokenPair}</h4>
          {isConnected && (
            <span className="price-widget__status price-widget__status--live" title="Live">
              ●
            </span>
          )}
        </div>
        <div className="price-widget__price">
          <span className="price-widget__price-value">${formatPrice(priceData.price)}</span>
          <span className={`price-widget__change ${priceChangeClass}`}>
            {isPositive ? '+' : ''}
            {priceData.priceChange24h.toFixed(2)}%
          </span>
        </div>
      </div>

      {!compact && (
        <>
          {renderMiniChart()}
          <div className="price-widget__stats">
            <div className="price-widget__stat">
              <span className="price-widget__stat-label">24h High</span>
              <span className="price-widget__stat-value">${formatPrice(priceData.high24h)}</span>
            </div>
            <div className="price-widget__stat">
              <span className="price-widget__stat-label">24h Low</span>
              <span className="price-widget__stat-value">${formatPrice(priceData.low24h)}</span>
            </div>
            <div className="price-widget__stat">
              <span className="price-widget__stat-label">24h Volume</span>
              <span className="price-widget__stat-value">{formatVolume(priceData.volume24h)}</span>
            </div>
          </div>
        </>
      )}

      <div className="price-widget__footer">
        <span className="price-widget__timestamp">
          Updated {new Date(priceData.lastUpdate).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

export default LivePriceWidget;
