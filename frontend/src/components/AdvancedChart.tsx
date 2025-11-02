import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Advanced TradingView-style Chart Component
 * Supports candlestick, line, area charts with technical indicators
 */

interface ChartData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AdvancedChartProps {
  symbol: string;
  interval?: string;
  height?: number;
  showVolume?: boolean;
  showIndicators?: boolean;
  theme?: 'light' | 'dark';
}

const AdvancedChart: React.FC<AdvancedChartProps> = ({
  symbol,
  interval = '1h',
  height = 500,
  showVolume = true,
  showIndicators = true,
  theme = 'dark'
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area'>('candlestick');
  const [indicators, setIndicators] = useState<string[]>(['MA', 'RSI']);
  const [timeframe, setTimeframe] = useState(interval);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch chart data
  const fetchChartData = useCallback(async () => {
    setLoading(true);
    try {
      // Simulated data fetch - replace with actual API call
      const mockData: ChartData[] = generateMockData(100);
      setChartData(mockData);
    } catch (error) {
      console.error('Failed to fetch chart data:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    fetchChartData();

    // Set up real-time updates
    const interval = setInterval(() => {
      fetchChartData();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [fetchChartData]);

  // Render chart
  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    renderChart();
  }, [chartData, chartType, indicators, theme]);

  const renderChart = () => {
    const container = chartContainerRef.current;
    if (!container) return;

    // Clear previous content
    container.innerHTML = '';

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = container.clientWidth;
    canvas.height = height;
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate chart dimensions
    const padding = { top: 20, right: 80, bottom: 40, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;

    // Find min/max values
    const prices = chartData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    // Draw background
    ctx.fillStyle = theme === 'dark' ? '#1a1a2e' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(ctx, padding, chartWidth, chartHeight, theme);

    // Draw price axis
    drawPriceAxis(ctx, minPrice, maxPrice, padding, chartHeight, theme);

    // Draw time axis
    drawTimeAxis(ctx, chartData, padding, chartWidth, canvas.height, theme);

    // Draw chart based on type
    switch (chartType) {
      case 'candlestick':
        drawCandlesticks(ctx, chartData, padding, chartWidth, chartHeight, minPrice, priceRange, theme);
        break;
      case 'line':
        drawLineChart(ctx, chartData, padding, chartWidth, chartHeight, minPrice, priceRange, theme);
        break;
      case 'area':
        drawAreaChart(ctx, chartData, padding, chartWidth, chartHeight, minPrice, priceRange, theme);
        break;
    }

    // Draw indicators
    if (showIndicators) {
      if (indicators.includes('MA')) {
        drawMovingAverage(ctx, chartData, padding, chartWidth, chartHeight, minPrice, priceRange, 20, '#4CAF50');
        drawMovingAverage(ctx, chartData, padding, chartWidth, chartHeight, minPrice, priceRange, 50, '#2196F3');
      }

      if (indicators.includes('RSI')) {
        // RSI would be drawn in a separate panel below
      }
    }

    // Draw volume bars if enabled
    if (showVolume) {
      const volumeHeight = 100;
      const volumePadding = { ...padding, top: canvas.height - volumeHeight - 10 };
      drawVolume(ctx, chartData, volumePadding, chartWidth, volumeHeight, theme);
    }

    // Draw crosshair on mouse move
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Redraw chart
      renderChart();

      // Draw crosshair
      if (ctx) {
        ctx.strokeStyle = theme === 'dark' ? '#666' : '#ccc';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvas.height - padding.bottom);
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Show price at crosshair
        const price = maxPrice - ((y - padding.top) / chartHeight) * priceRange;
        ctx.fillStyle = theme === 'dark' ? '#fff' : '#000';
        ctx.font = '12px Arial';
        ctx.fillText(price.toFixed(2), canvas.width - padding.right + 5, y);
      }
    });
  };

  const toggleIndicator = (indicator: string) => {
    setIndicators(prev =>
      prev.includes(indicator)
        ? prev.filter(i => i !== indicator)
        : [...prev, indicator]
    );
  };

  return (
    <div className="advanced-chart" style={{ width: '100%', height: `${height + 50}px` }}>
      {/* Chart Controls */}
      <div className="chart-controls" style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '10px',
        backgroundColor: theme === 'dark' ? '#2a2a3e' : '#f5f5f5',
        borderRadius: '8px 8px 0 0'
      }}>
        <div className="chart-type-buttons">
          <button
            onClick={() => setChartType('candlestick')}
            style={{
              padding: '5px 15px',
              marginRight: '5px',
              backgroundColor: chartType === 'candlestick' ? '#4CAF50' : 'transparent',
              color: theme === 'dark' ? '#fff' : '#000',
              border: '1px solid #666',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Candles
          </button>
          <button
            onClick={() => setChartType('line')}
            style={{
              padding: '5px 15px',
              marginRight: '5px',
              backgroundColor: chartType === 'line' ? '#4CAF50' : 'transparent',
              color: theme === 'dark' ? '#fff' : '#000',
              border: '1px solid #666',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Line
          </button>
          <button
            onClick={() => setChartType('area')}
            style={{
              padding: '5px 15px',
              backgroundColor: chartType === 'area' ? '#4CAF50' : 'transparent',
              color: theme === 'dark' ? '#fff' : '#000',
              border: '1px solid #666',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Area
          </button>
        </div>

        <div className="timeframe-buttons">
          {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                padding: '5px 10px',
                marginLeft: '5px',
                backgroundColor: timeframe === tf ? '#2196F3' : 'transparent',
                color: theme === 'dark' ? '#fff' : '#000',
                border: '1px solid #666',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="indicator-buttons">
          {['MA', 'RSI', 'MACD', 'BB'].map(ind => (
            <button
              key={ind}
              onClick={() => toggleIndicator(ind)}
              style={{
                padding: '5px 10px',
                marginLeft: '5px',
                backgroundColor: indicators.includes(ind) ? '#FF9800' : 'transparent',
                color: theme === 'dark' ? '#fff' : '#000',
                border: '1px solid #666',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              {ind}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={chartContainerRef}
        style={{
          width: '100%',
          height: `${height}px`,
          backgroundColor: theme === 'dark' ? '#1a1a2e' : '#ffffff',
          borderRadius: '0 0 8px 8px',
          position: 'relative'
        }}
      >
        {loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: theme === 'dark' ? '#fff' : '#000'
          }}>
            Loading chart...
          </div>
        )}
      </div>
    </div>
  );
};

// Helper functions
function generateMockData(count: number): ChartData[] {
  const data: ChartData[] = [];
  let basePrice = 2500;
  let timestamp = Date.now() - count * 3600000; // 1 hour per candle

  for (let i = 0; i < count; i++) {
    const volatility = 50;
    const open = basePrice + (Math.random() - 0.5) * volatility;
    const close = open + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * 20;
    const low = Math.min(open, close) - Math.random() * 20;
    const volume = Math.random() * 1000000;

    data.push({
      timestamp: timestamp + i * 3600000,
      open,
      high,
      low,
      close,
      volume
    });

    basePrice = close;
  }

  return data;
}

function drawGrid(ctx: CanvasRenderingContext2D, padding: any, width: number, height: number, theme: string) {
  ctx.strokeStyle = theme === 'dark' ? '#2a2a3e' : '#e0e0e0';
  ctx.lineWidth = 1;

  // Horizontal lines
  for (let i = 0; i <= 10; i++) {
    const y = padding.top + (height / 10) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + width, y);
    ctx.stroke();
  }

  // Vertical lines
  for (let i = 0; i <= 10; i++) {
    const x = padding.left + (width / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + height);
    ctx.stroke();
  }
}

function drawPriceAxis(ctx: CanvasRenderingContext2D, minPrice: number, maxPrice: number, padding: any, height: number, theme: string) {
  ctx.fillStyle = theme === 'dark' ? '#aaa' : '#666';
  ctx.font = '12px Arial';
  ctx.textAlign = 'right';

  for (let i = 0; i <= 10; i++) {
    const price = maxPrice - ((maxPrice - minPrice) / 10) * i;
    const y = padding.top + (height / 10) * i;
    ctx.fillText(price.toFixed(2), padding.left - 10, y + 4);
  }
}

function drawTimeAxis(ctx: CanvasRenderingContext2D, data: ChartData[], padding: any, width: number, canvasHeight: number, theme: string) {
  ctx.fillStyle = theme === 'dark' ? '#aaa' : '#666';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';

  const step = Math.floor(data.length / 10);

  for (let i = 0; i < data.length; i += step) {
    if (i >= data.length) break;

    const x = padding.left + (width / data.length) * i;
    const date = new Date(data[i].timestamp);
    const timeStr = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    ctx.fillText(timeStr, x, canvasHeight - padding.bottom + 20);
  }
}

function drawCandlesticks(ctx: CanvasRenderingContext2D, data: ChartData[], padding: any, width: number, height: number, minPrice: number, priceRange: number, _theme: string) {
  const candleWidth = (width / data.length) * 0.8;

  data.forEach((candle, i) => {
    const x = padding.left + (width / data.length) * i;
    const openY = padding.top + height - ((candle.open - minPrice) / priceRange) * height;
    const closeY = padding.top + height - ((candle.close - minPrice) / priceRange) * height;
    const highY = padding.top + height - ((candle.high - minPrice) / priceRange) * height;
    const lowY = padding.top + height - ((candle.low - minPrice) / priceRange) * height;

    const isGreen = candle.close >= candle.open;
    ctx.strokeStyle = isGreen ? '#26a69a' : '#ef5350';
    ctx.fillStyle = isGreen ? '#26a69a' : '#ef5350';

    // Draw wick
    ctx.beginPath();
    ctx.moveTo(x + candleWidth / 2, highY);
    ctx.lineTo(x + candleWidth / 2, lowY);
    ctx.stroke();

    // Draw body
    const bodyHeight = Math.abs(closeY - openY);
    ctx.fillRect(x, Math.min(openY, closeY), candleWidth, Math.max(bodyHeight, 1));
  });
}

function drawLineChart(ctx: CanvasRenderingContext2D, data: ChartData[], padding: any, width: number, height: number, minPrice: number, priceRange: number, _theme: string) {
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 2;
  ctx.beginPath();

  data.forEach((point, i) => {
    const x = padding.left + (width / data.length) * i;
    const y = padding.top + height - ((point.close - minPrice) / priceRange) * height;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
}

function drawAreaChart(ctx: CanvasRenderingContext2D, data: ChartData[], padding: any, width: number, height: number, minPrice: number, priceRange: number, theme: string) {
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + height);
  gradient.addColorStop(0, 'rgba(33, 150, 243, 0.3)');
  gradient.addColorStop(1, 'rgba(33, 150, 243, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();

  data.forEach((point, i) => {
    const x = padding.left + (width / data.length) * i;
    const y = padding.top + height - ((point.close - minPrice) / priceRange) * height;

    if (i === 0) {
      ctx.moveTo(x, padding.top + height);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.lineTo(padding.left + width, padding.top + height);
  ctx.closePath();
  ctx.fill();

  // Draw line on top
  drawLineChart(ctx, data, padding, width, height, minPrice, priceRange, theme);
}

function drawMovingAverage(ctx: CanvasRenderingContext2D, data: ChartData[], padding: any, width: number, height: number, minPrice: number, priceRange: number, period: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
    const ma = sum / period;

    const x = padding.left + (width / data.length) * i;
    const y = padding.top + height - ((ma - minPrice) / priceRange) * height;

    if (i === period - 1) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function drawVolume(ctx: CanvasRenderingContext2D, data: ChartData[], padding: any, width: number, height: number, _theme: string) {
  const maxVolume = Math.max(...data.map(d => d.volume));
  const barWidth = (width / data.length) * 0.8;

  data.forEach((candle, i) => {
    const x = padding.left + (width / data.length) * i;
    const barHeight = (candle.volume / maxVolume) * height;
    const y = padding.top + height - barHeight;

    const isGreen = candle.close >= candle.open;
    ctx.fillStyle = isGreen ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)';
    ctx.fillRect(x, y, barWidth, barHeight);
  });
}

export default AdvancedChart;
