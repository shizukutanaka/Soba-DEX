import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DEX_CONSTANTS } from '../utils/constants';

interface TradingChartProps {
  symbol: string;
  price: number;
  onSymbolChange: (symbol: string) => void;
  onPriceUpdate: (price: number) => void;
  data?: any[];
}

const TIMEFRAMES = DEX_CONSTANTS.CHART_TIMEFRAMES.map(tf => ({
  value: tf,
  label: tf.toUpperCase()
}));

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  price: _price,
  onSymbolChange: _onSymbolChange,
  onPriceUpdate: _onPriceUpdate,
  data: _data = [],
}) => {
  const [timeframe, setTimeframe] = useState('1h');
  const [chartType, setChartType] = useState<'line' | 'candle'>('candle');
  const [chartData, setChartData] = useState<any[]>([]);

  const generateMockData = useCallback(() => {
    const data = [];
    let currentPrice = 2000 + Math.random() * 1000;
    const now = Date.now();

    for (let i = 100; i >= 0; i--) {
      const timestamp = now - i * getTimeframeMs(timeframe);
      const change = (Math.random() - 0.5) * 50;
      const open = currentPrice;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 20;
      const low = Math.min(open, close) - Math.random() * 20;
      const volume = Math.random() * 1000000;

      data.push({
        time: timestamp,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: parseFloat(volume.toFixed(0)),
      });

      currentPrice = close;
    }

    return data;
  }, []);

  const memoizedChartData = useMemo(() => {
    return generateMockData();
  }, [symbol, timeframe, generateMockData]);

  useEffect(() => {
    setChartData(memoizedChartData);
  }, [memoizedChartData]);

  const getTimeframeMs = (tf: string): number => {
    const timeframes: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return timeframes[tf] || 60 * 60 * 1000;
  };

  const getCurrentPrice = () => {
    if (chartData.length > 0) {
      return chartData[chartData.length - 1].close;
    }
    return 0;
  };

  const getPriceChange = () => {
    if (chartData.length >= 2) {
      const current = chartData[chartData.length - 1].close;
      const previous = chartData[chartData.length - 2].close;
      const change = current - previous;
      const changePercent = (change / previous) * 100;
      return { change, changePercent };
    }
    return { change: 0, changePercent: 0 };
  };

  const renderSimpleChart = () => {
    const { change, changePercent } = getPriceChange();
    const isPositive = change >= 0;

    return (
      <div className="chart-container">
        <div className="price-display">
          <div className="current-price">${getCurrentPrice().toFixed(2)}</div>
          <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}
            {change.toFixed(2)} ({isPositive ? '+' : ''}
            {changePercent.toFixed(2)}%)
          </div>
        </div>
        <div className="chart-area" role="img" aria-label={`Synthetic ${chartType} chart for ${symbol}`}>
          <svg width="100%" height="200">
            {chartData.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = chartData[index - 1];
              const x1 = ((index - 1) / (chartData.length - 1)) * 100;
              const x2 = (index / (chartData.length - 1)) * 100;
              const maxPrice = Math.max(...chartData.map(d => d.high));
              const minPrice = Math.min(...chartData.map(d => d.low));
              const y1 = ((maxPrice - prevPoint.close) / (maxPrice - minPrice)) * 100;
              const y2 = ((maxPrice - point.close) / (maxPrice - minPrice)) * 100;

              return (
                <line
                  key={index}
                  x1={`${x1}%`}
                  y1={`${y1}%`}
                  x2={`${x2}%`}
                  y2={`${y2}%`}
                  stroke={point.close >= prevPoint.close ? '#36B37E' : '#FF7452'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="trading-chart">
      <header className="chart-header">
        <div className="chart-header__title">
          <h3>{symbol}</h3>
          <span className="chart-header__subtitle">Synthetic data for demo use</span>
        </div>
        <div className="chart-controls">
          <div className="segmented-control" role="tablist" aria-label="Timeframe">
            {TIMEFRAMES.map(tf => {
              const isActive = tf.value === timeframe;
              return (
                <button
                  key={tf.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`segmented-control__button ${isActive ? 'is-active' : ''}`}
                  onClick={() => setTimeframe(tf.value)}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          <div className="chart-type-toggle" role="group" aria-label="Chart type">
            <button
              type="button"
              className={`chart-type-toggle__button ${chartType === 'line' ? 'is-active' : ''}`}
              onClick={() => setChartType('line')}
              aria-pressed={chartType === 'line'}
            >
              Line
            </button>
            <button
              type="button"
              className={`chart-type-toggle__button ${chartType === 'candle' ? 'is-active' : ''}`}
              onClick={() => setChartType('candle')}
              aria-pressed={chartType === 'candle'}
            >
              Candle
            </button>
          </div>
        </div>
      </header>

      {renderSimpleChart()}

      <div className="chart-metrics" aria-live="polite">
        <div className="chart-metric">
          <span className="chart-metric__label">24h Volume</span>
          <span className="chart-metric__value">
            {chartData.length > 0
              ? chartData.reduce((sum, d) => sum + d.volume, 0).toLocaleString()
              : '0'}
          </span>
        </div>
        <div className="chart-metric">
          <span className="chart-metric__label">Last update</span>
          <span className="chart-metric__value">{new Date().toLocaleTimeString()}</span>
        </div>
        <div className="chart-metric">
          <span className="chart-metric__label">Current timeframe</span>
          <span className="chart-metric__value">{timeframe.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
};
