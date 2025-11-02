import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface TokenHolding {
  symbol: string;
  address: string;
  balance: number;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
  change24h: number;
  allocation: number;
}

interface PortfolioStats {
  totalValueUsd: number;
  change24h: number;
  change24hPercent: number;
  totalGainsUsd: number;
  totalGainsPercent: number;
  bestPerformer: string;
  worstPerformer: string;
}

interface HistoricalData {
  timestamp: number;
  value: number;
}

interface PortfolioTrackerProps {
  walletAddress: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const PortfolioTracker: React.FC<PortfolioTrackerProps> = ({
  walletAddress,
  autoRefresh = true,
  refreshInterval = 30000,
}) => {
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('24h');
  const [sortBy, setSortBy] = useState<'value' | 'change' | 'allocation'>('value');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchPortfolio = useCallback(async () => {
    if (!walletAddress) {
      setHoldings([]);
      setStats(null);
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/portfolio/${walletAddress}`);

      if (!response.ok) {
        throw new Error('Failed to fetch portfolio data');
      }

      const data = await response.json();

      if (data.success) {
        setHoldings(data.data.holdings || []);
        setStats(data.data.stats || null);
        setHistoricalData(data.data.history || []);
      } else {
        throw new Error(data.error || 'Invalid response format');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchPortfolio, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchPortfolio]);

  const sortHoldings = useCallback((holdings: TokenHolding[]) => {
    const sorted = [...holdings].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'value':
          comparison = a.valueUsd - b.valueUsd;
          break;
        case 'change':
          comparison = a.change24h - b.change24h;
          break;
        case 'allocation':
          comparison = a.allocation - b.allocation;
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }, [sortBy, sortOrder]);

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const formatCurrency = (value: number): string => {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    } else if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const renderMiniChart = () => {
    if (historicalData.length < 2) return null;

    const values = historicalData.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min;

    const points = historicalData.map((data, index) => {
      const x = (index / (historicalData.length - 1)) * 100;
      const y = range > 0 ? ((max - data.value) / range) * 40 : 20;
      return `${x},${y}`;
    }).join(' ');

    const isPositive = values[values.length - 1] >= values[0];
    const color = isPositive ? '#00D395' : '#FF4976';

    return (
      <svg className="portfolio-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
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
      <div className="portfolio-tracker">
        <div className="portfolio-tracker__loading">
          <div className="spinner"></div>
          <span>Loading portfolio...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-tracker">
        <div className="portfolio-tracker__error">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <button onClick={fetchPortfolio} className="button--secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <div className="portfolio-tracker">
        <div className="portfolio-tracker__empty">
          <p>Connect your wallet to view portfolio</p>
        </div>
      </div>
    );
  }

  const sortedHoldings = sortHoldings(holdings);

  return (
    <div className="portfolio-tracker">
      <div className="portfolio-tracker__header">
        <h2>Portfolio</h2>
        <button
          onClick={fetchPortfolio}
          className="button--icon"
          title="Refresh"
          disabled={isLoading}
        >
          🔄
        </button>
      </div>

      {stats && (
        <div className="portfolio-stats">
          <div className="portfolio-stats__main">
            <div className="portfolio-stats__value">
              <span className="label">Total Value</span>
              <h3>{formatCurrency(stats.totalValueUsd)}</h3>
            </div>

            <div className="portfolio-stats__change">
              <span className={`change ${stats.change24h >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(stats.change24hPercent)}
              </span>
              <span className="change-value">
                {stats.change24h >= 0 ? '+' : ''}
                {formatCurrency(stats.change24h)}
              </span>
              <small>24h</small>
            </div>
          </div>

          <div className="portfolio-stats__grid">
            <div className="stat-card">
              <span className="label">Total Gains</span>
              <span className={`value ${stats.totalGainsUsd >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(stats.totalGainsUsd)}
              </span>
              <small>{formatPercent(stats.totalGainsPercent)}</small>
            </div>

            <div className="stat-card">
              <span className="label">Best Performer</span>
              <span className="value positive">{stats.bestPerformer}</span>
            </div>

            <div className="stat-card">
              <span className="label">Worst Performer</span>
              <span className="value negative">{stats.worstPerformer}</span>
            </div>
          </div>

          {renderMiniChart()}
        </div>
      )}

      <div className="portfolio-controls">
        <div className="period-selector">
          {(['24h', '7d', '30d', 'all'] as const).map((period) => (
            <button
              key={period}
              className={`period-btn ${selectedPeriod === period ? 'active' : ''}`}
              onClick={() => setSelectedPeriod(period)}
            >
              {period === 'all' ? 'All' : period.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="sort-controls">
          <span>Sort by:</span>
          <button
            className={`sort-btn ${sortBy === 'value' ? 'active' : ''}`}
            onClick={() => handleSort('value')}
          >
            Value {sortBy === 'value' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'change' ? 'active' : ''}`}
            onClick={() => handleSort('change')}
          >
            Change {sortBy === 'change' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'allocation' ? 'active' : ''}`}
            onClick={() => handleSort('allocation')}
          >
            % {sortBy === 'allocation' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
        </div>
      </div>

      <div className="holdings-list">
        {sortedHoldings.length === 0 ? (
          <div className="holdings-empty">
            <p>No tokens found in this wallet</p>
            <small>Start trading to build your portfolio</small>
          </div>
        ) : (
          <table className="holdings-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
                <th>Price</th>
                <th>Value</th>
                <th>24h Change</th>
                <th>Allocation</th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((holding) => (
                <tr key={holding.address} className="holding-row">
                  <td className="holding-asset">
                    <strong>{holding.symbol}</strong>
                    <small>{holding.address.slice(0, 6)}...{holding.address.slice(-4)}</small>
                  </td>
                  <td>{holding.balance.toFixed(4)}</td>
                  <td>{formatCurrency(holding.priceUsd)}</td>
                  <td><strong>{formatCurrency(holding.valueUsd)}</strong></td>
                  <td>
                    <span className={`change ${holding.change24h >= 0 ? 'positive' : 'negative'}`}>
                      {formatPercent(holding.change24h)}
                    </span>
                  </td>
                  <td>
                    <div className="allocation">
                      <span>{holding.allocation.toFixed(1)}%</span>
                      <div className="allocation-bar">
                        <div
                          className="allocation-fill"
                          style={{ width: `${holding.allocation}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="portfolio-actions">
        <button className="button--secondary" onClick={() => {
          // Export to CSV
          const csv = [
            ['Asset', 'Balance', 'Price', 'Value', '24h Change', 'Allocation'],
            ...sortedHoldings.map(h => [
              h.symbol,
              h.balance,
              h.priceUsd,
              h.valueUsd,
              h.change24h,
              h.allocation
            ])
          ].map(row => row.join(',')).join('\n');

          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `portfolio-${walletAddress}-${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);

          toast.success('Portfolio exported to CSV');
        }}>
          📥 Export CSV
        </button>

        <button className="button--secondary" onClick={() => {
          // Share portfolio
          const text = `My portfolio value: ${formatCurrency(stats?.totalValueUsd || 0)} (${formatPercent(stats?.change24hPercent || 0)} 24h)`;
          if (navigator.share) {
            navigator.share({ text });
          } else {
            navigator.clipboard.writeText(text);
            toast.success('Portfolio summary copied to clipboard');
          }
        }}>
          📤 Share
        </button>
      </div>
    </div>
  );
};

export default PortfolioTracker;
