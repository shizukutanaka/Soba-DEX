import React from 'react';
import { usePortfolio } from '../hooks/usePortfolio';

export const Portfolio: React.FC = () => {
  const {
    portfolio,
    lastUpdate,
    getPortfolioStats,
    removePosition,
    clearPortfolio,
  } = usePortfolio();

  const stats = getPortfolioStats();

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getPercentageColor = (value: number): string => {
    if (value > 0) return '#00c851';
    if (value < 0) return '#ff4444';
    return '#6c757d';
  };

  const formatTimestamp = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleClearPortfolio = () => {
    if (window.confirm('Are you sure you want to clear your entire portfolio? This action cannot be undone.')) {
      clearPortfolio();
    }
  };

  return (
    <div className="portfolio">
      <div className="portfolio-header">
        <h3>Portfolio Overview</h3>
        <div className="portfolio-actions">
          <button
            className="refresh-btn"
            onClick={() => window.location.reload()}
            title="Refresh portfolio data"
          >
            🔄
          </button>
          <button
            className="clear-btn"
            onClick={handleClearPortfolio}
            title="Clear portfolio"
            disabled={portfolio.length === 0}
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="portfolio-stats">
        <div className="stat-card">
          <div className="stat-label">Total Value</div>
          <div className="stat-value">{formatCurrency(stats.totalValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total P&L</div>
          <div
            className="stat-value"
            style={{ color: getPercentageColor(stats.totalPnl) }}
          >
            {formatCurrency(stats.totalPnl)}
          </div>
          <div
            className="stat-subvalue"
            style={{ color: getPercentageColor(stats.totalPnlPercentage) }}
          >
            {formatPercentage(stats.totalPnlPercentage)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">24h Change</div>
          <div
            className="stat-value"
            style={{ color: getPercentageColor(stats.dailyChange) }}
          >
            {formatCurrency(stats.dailyChange)}
          </div>
          <div
            className="stat-subvalue"
            style={{ color: getPercentageColor(stats.dailyChangePercentage) }}
          >
            {formatPercentage(stats.dailyChangePercentage)}
          </div>
        </div>
      </div>

      {lastUpdate > 0 && (
        <div className="last-update">
          Last updated: {formatTimestamp(lastUpdate)}
        </div>
      )}

      <div className="positions-section">
        <div className="positions-header">
          <h4>Positions ({portfolio.length})</h4>
        </div>

        {portfolio.length === 0 ? (
          <div className="no-positions">
            <div className="no-positions-content">
              <div className="no-positions-icon">💼</div>
              <div className="no-positions-text">No positions yet</div>
              <div className="no-positions-subtext">
                Start trading to build your portfolio
              </div>
            </div>
          </div>
        ) : (
          <div className="positions-table">
            <div className="table-header">
              <span>Asset</span>
              <span>Amount</span>
              <span>Avg Price</span>
              <span>Current Price</span>
              <span>Value</span>
              <span>P&L</span>
              <span>Actions</span>
            </div>
            <div className="table-body">
              {stats.positions.map((position) => (
                <div key={position.id} className="position-row">
                  <div className="position-asset">
                    <span className="asset-symbol">{position.symbol}</span>
                  </div>
                  <div className="position-amount">
                    {position.amount.toFixed(6)}
                  </div>
                  <div className="position-avg-price">
                    {formatCurrency(position.averagePrice)}
                  </div>
                  <div className="position-current-price">
                    {formatCurrency(position.currentPrice)}
                  </div>
                  <div className="position-value">
                    {formatCurrency(position.totalValue)}
                  </div>
                  <div className="position-pnl">
                    <div
                      className="pnl-amount"
                      style={{ color: getPercentageColor(position.pnl) }}
                    >
                      {formatCurrency(position.pnl)}
                    </div>
                    <div
                      className="pnl-percentage"
                      style={{ color: getPercentageColor(position.pnlPercentage) }}
                    >
                      {formatPercentage(position.pnlPercentage)}
                    </div>
                  </div>
                  <div className="position-actions">
                    <button
                      className="remove-position-btn"
                      onClick={() => removePosition(position.id)}
                      title="Remove position"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="portfolio-info">
        <div className="info-note">
          📊 Portfolio data is automatically updated when you make trades.
          P&L calculations are based on your average purchase price.
        </div>
      </div>
    </div>
  );
};