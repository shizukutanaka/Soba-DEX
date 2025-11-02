import React, { useState } from 'react';
import { usePriceAlerts } from '../hooks/usePriceAlerts';
import { validation } from '../utils/validation';

export const PriceAlerts: React.FC = () => {
  const {
    activeAlerts,
    triggeredAlerts,
    addAlert,
    removeAlert,
    toggleAlert,
    requestNotificationPermission,
    updatePrice: _updatePrice,
  } = usePriceAlerts();

  const [showForm, setShowForm] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!symbol.trim() || !validation.isValidAmount(targetPrice)) {
      return;
    }

    addAlert(symbol.trim(), parseFloat(targetPrice), condition);

    // Reset form
    setSymbol('');
    setTargetPrice('');
    setShowForm(false);

    // Request notification permission if not granted
    requestNotificationPermission();
  };

  return (
    <div className="price-alerts">
      <div className="alerts-header">
        <h3>Price Alerts</h3>
        <button
          className="add-alert-btn"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '✕' : '+'}
        </button>
      </div>

      {showForm && (
        <form className="alert-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <input
              type="text"
              placeholder="Symbol (e.g., ETH)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="symbol-input"
              required
            />
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
              className="condition-select"
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>
          <div className="form-row">
            <input
              type="number"
              placeholder="Target Price"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="price-input"
              step="0.01"
              min="0"
              required
            />
            <button type="submit" className="create-alert-btn">
              Create Alert
            </button>
          </div>
        </form>
      )}

      <div className="alerts-list">
        {activeAlerts.length === 0 && triggeredAlerts.length === 0 ? (
          <div className="no-alerts">
            No price alerts set. Create one to get notified when prices move.
          </div>
        ) : (
          <>
            {activeAlerts.length > 0 && (
              <div className="active-alerts">
                <h4>Active Alerts</h4>
                {activeAlerts.map((alert) => (
                  <div key={alert.id} className="alert-item active">
                    <div className="alert-info">
                      <span className="alert-symbol">{alert.symbol}</span>
                      <span className="alert-condition">
                        {alert.condition} ${alert.targetPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="alert-actions">
                      <button
                        className="toggle-btn"
                        onClick={() => toggleAlert(alert.id)}
                        title="Pause alert"
                      >
                        ⏸️
                      </button>
                      <button
                        className="remove-btn"
                        onClick={() => removeAlert(alert.id)}
                        title="Delete alert"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {triggeredAlerts.length > 0 && (
              <div className="triggered-alerts">
                <h4>Recent Triggers</h4>
                {triggeredAlerts.slice(-5).map((alert) => (
                  <div key={alert.id} className="alert-item triggered">
                    <div className="alert-info">
                      <span className="alert-symbol">{alert.symbol}</span>
                      <span className="alert-condition">
                        {alert.condition} ${alert.targetPrice.toFixed(2)}
                      </span>
                      <span className="alert-time">
                        {alert.triggeredAt &&
                          new Date(alert.triggeredAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <button
                      className="remove-btn"
                      onClick={() => removeAlert(alert.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};