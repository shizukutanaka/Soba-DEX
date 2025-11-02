import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface GasPrice {
  slow: number;
  standard: number;
  fast: number;
  instant: number;
}

interface GasEstimate {
  gasLimit: number;
  gasPriceGwei: number;
  estimatedCostEth: string;
  estimatedCostUsd: string;
  estimatedTime: string;
}

interface GasOptimizationDashboardProps {
  transactionType?: 'swap' | 'approval' | 'liquidity';
  onGasSelected?: (gasPrice: number, speed: string) => void;
}

const GasOptimizationDashboard: React.FC<GasOptimizationDashboardProps> = ({
  transactionType = 'swap',
  onGasSelected,
}) => {
  const [gasPrice, setGasPrice] = useState<GasPrice | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState<keyof GasPrice>('standard');
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ethPrice, setEthPrice] = useState<number>(1900); // Default ETH price
  const [networkCongestion, setNetworkCongestion] = useState<number>(50);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fetchGasPrice = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/gas/prices');

      if (!response.ok) {
        throw new Error('Failed to fetch gas prices');
      }

      const data = await response.json();

      if (data.success) {
        setGasPrice(data.data.prices);
        setNetworkCongestion(data.data.congestion || 50);
        setEthPrice(data.data.ethPrice || 1900);
      } else {
        throw new Error(data.error || 'Invalid response format');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGasPrice();
    const interval = setInterval(fetchGasPrice, 15000); // Update every 15 seconds
    return () => clearInterval(interval);
  }, [fetchGasPrice]);

  const calculateEstimate = useCallback(async () => {
    if (!gasPrice) return;

    try {
      const response = await fetch('/api/gas/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: transactionType,
          gasPrice: gasPrice[selectedSpeed],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to estimate gas');
      }

      const data = await response.json();

      if (data.success) {
        setGasEstimate(data.data);
      }
    } catch (err) {
      console.error('Gas estimate error:', err);
    }
  }, [gasPrice, selectedSpeed, transactionType]);

  useEffect(() => {
    calculateEstimate();
  }, [calculateEstimate]);

  const handleSpeedSelect = (speed: keyof GasPrice) => {
    if (!gasPrice) return;

    setSelectedSpeed(speed);
    if (onGasSelected) {
      onGasSelected(gasPrice[speed], speed);
    }
  };

  const getSpeedInfo = (speed: keyof GasPrice) => {
    const info = {
      slow: {
        label: 'Slow',
        time: '~5 min',
        icon: '🐌',
        description: 'Cheapest option, slower confirmation',
      },
      standard: {
        label: 'Standard',
        time: '~2 min',
        icon: '⚡',
        description: 'Balanced cost and speed',
      },
      fast: {
        label: 'Fast',
        time: '~1 min',
        icon: '🚀',
        description: 'Quick confirmation, higher cost',
      },
      instant: {
        label: 'Instant',
        time: '<30 sec',
        icon: '⚡⚡',
        description: 'Fastest confirmation, highest cost',
      },
    };

    return info[speed];
  };

  const getCongestionLevel = (level: number) => {
    if (level < 30) return { label: 'Low', color: '#00D395', icon: '🟢' };
    if (level < 70) return { label: 'Medium', color: '#FFA500', icon: '🟡' };
    return { label: 'High', color: '#FF4976', icon: '🔴' };
  };

  const formatGwei = (gwei: number) => {
    return gwei.toFixed(2);
  };

  const calculateSavings = () => {
    if (!gasPrice || !gasEstimate) return null;

    const fastCost = parseFloat(gasEstimate.estimatedCostUsd);
    const slowCost = (gasPrice.slow / gasPrice[selectedSpeed]) * fastCost;
    const savings = fastCost - slowCost;

    return {
      amount: Math.abs(savings).toFixed(2),
      percentage: ((savings / fastCost) * 100).toFixed(1),
    };
  };

  if (isLoading) {
    return (
      <div className="gas-dashboard">
        <div className="gas-dashboard__loading">
          <div className="spinner"></div>
          <span>Loading gas prices...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gas-dashboard">
        <div className="gas-dashboard__error">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <button onClick={fetchGasPrice} className="button--secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!gasPrice) {
    return null;
  }

  const congestion = getCongestionLevel(networkCongestion);
  const savings = calculateSavings();

  return (
    <div className="gas-dashboard">
      <div className="gas-dashboard__header">
        <h3>Gas Optimization</h3>
        <button
          onClick={fetchGasPrice}
          className="button--icon"
          title="Refresh gas prices"
        >
          🔄
        </button>
      </div>

      <div className="gas-dashboard__network">
        <div className="gas-dashboard__network-stat">
          <span className="label">Network</span>
          <span className="value">
            {congestion.icon} {congestion.label}
          </span>
        </div>
        <div className="gas-dashboard__network-stat">
          <span className="label">ETH Price</span>
          <span className="value">${ethPrice.toFixed(2)}</span>
        </div>
      </div>

      <div className="gas-dashboard__speeds">
        {(Object.keys(gasPrice) as Array<keyof GasPrice>).map((speed) => {
          const info = getSpeedInfo(speed);
          const isSelected = selectedSpeed === speed;
          const price = gasPrice[speed];

          return (
            <button
              key={speed}
              className={`gas-speed-option ${isSelected ? 'gas-speed-option--selected' : ''}`}
              onClick={() => handleSpeedSelect(speed)}
            >
              <div className="gas-speed-option__header">
                <span className="gas-speed-option__icon">{info.icon}</span>
                <div className="gas-speed-option__info">
                  <strong>{info.label}</strong>
                  <small>{info.time}</small>
                </div>
              </div>
              <div className="gas-speed-option__price">
                <span className="gas-speed-option__gwei">{formatGwei(price)} Gwei</span>
                {gasEstimate && (
                  <span className="gas-speed-option__usd">
                    ${((price / gasPrice[selectedSpeed]) * parseFloat(gasEstimate.estimatedCostUsd)).toFixed(2)}
                  </span>
                )}
              </div>
              {isSelected && (
                <div className="gas-speed-option__check">✓</div>
              )}
            </button>
          );
        })}
      </div>

      {gasEstimate && (
        <div className="gas-dashboard__estimate">
          <h4>Estimate for {transactionType}</h4>
          <div className="gas-estimate-grid">
            <div className="gas-estimate-item">
              <span className="label">Gas Limit</span>
              <span className="value">{gasEstimate.gasLimit.toLocaleString()}</span>
            </div>
            <div className="gas-estimate-item">
              <span className="label">Gas Price</span>
              <span className="value">{gasEstimate.gasPriceGwei} Gwei</span>
            </div>
            <div className="gas-estimate-item">
              <span className="label">Total Cost</span>
              <span className="value">
                {gasEstimate.estimatedCostEth} ETH
                <small>(${gasEstimate.estimatedCostUsd})</small>
              </span>
            </div>
            <div className="gas-estimate-item">
              <span className="label">Est. Time</span>
              <span className="value">{gasEstimate.estimatedTime}</span>
            </div>
          </div>

          {savings && selectedSpeed !== 'slow' && (
            <div className="gas-dashboard__savings">
              💡 You could save ${savings.amount} ({savings.percentage}%) by using slow speed
            </div>
          )}
        </div>
      )}

      <div className="gas-dashboard__advanced">
        <button
          className="button--link"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▼' : '▶'} Advanced Settings
        </button>

        {showAdvanced && (
          <div className="gas-dashboard__advanced-panel">
            <div className="form-group">
              <label htmlFor="customGasPrice">Custom Gas Price (Gwei)</label>
              <input
                id="customGasPrice"
                type="number"
                min="1"
                step="0.1"
                placeholder="Enter custom gas price"
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (value > 0 && onGasSelected) {
                    onGasSelected(value, 'custom');
                  }
                }}
              />
            </div>

            <div className="gas-dashboard__tips">
              <h5>⚡ Gas Optimization Tips</h5>
              <ul>
                <li>Trade during off-peak hours (late night UTC) for lower fees</li>
                <li>Batch multiple transactions when possible</li>
                <li>Use Layer 2 solutions for smaller transactions</li>
                <li>Monitor network congestion before large trades</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="gas-dashboard__chart">
        <div className="gas-chart">
          <div className="gas-chart__title">24h Gas Price Trend</div>
          <div className="gas-chart__placeholder">
            {/* This would be replaced with an actual chart component */}
            <div className="gas-chart__bars">
              {[45, 60, 55, 70, 65, 50, 55, 60, 58, 52, 48, 45].map((height, i) => (
                <div
                  key={i}
                  className="gas-chart__bar"
                  style={{ height: `${height}%` }}
                  title={`${i * 2}:00 - ${45 + height/2} Gwei`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GasOptimizationDashboard;
