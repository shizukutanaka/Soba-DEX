import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface PriceAlert {
  id: string;
  tokenPair: string;
  targetPrice: number;
  condition: 'above' | 'below';
  enabled: boolean;
  createdAt: string;
  triggeredAt?: string;
  status: 'active' | 'triggered' | 'paused';
  notificationMethod: ('browser' | 'email' | 'webhook')[];
}

interface EnhancedPriceAlertsProps {
  onAlertTriggered?: (alert: PriceAlert) => void;
}

const EnhancedPriceAlerts: React.FC<EnhancedPriceAlertsProps> = ({
  onAlertTriggered,
}) => {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tokenPair, setTokenPair] = useState('ETH/USDC');
  const [targetPrice, setTargetPrice] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [notificationMethods, setNotificationMethods] = useState<('browser' | 'email' | 'webhook')[]>(['browser']);
  const [email, setEmail] = useState('');
  const [webhook, setWebhook] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'triggered' | 'paused'>('all');

  // Load alerts from localStorage on mount
  useEffect(() => {
    const savedAlerts = localStorage.getItem('priceAlerts');
    if (savedAlerts) {
      try {
        setAlerts(JSON.parse(savedAlerts));
      } catch (err) {
        console.error('Failed to load alerts:', err);
      }
    }
  }, []);

  // Save alerts to localStorage when they change
  useEffect(() => {
    localStorage.setItem('priceAlerts', JSON.stringify(alerts));
  }, [alerts]);

  // Monitor prices and check alerts
  useEffect(() => {
    const checkAlerts = async () => {
      for (const alert of alerts) {
        if (alert.status !== 'active') continue;

        try {
          const response = await fetch(`/api/prices/${alert.tokenPair}`);
          if (!response.ok) continue;

          const data = await response.json();
          if (!data.success) continue;

          const currentPrice = data.data.price;
          const shouldTrigger =
            (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
            (alert.condition === 'below' && currentPrice <= alert.targetPrice);

          if (shouldTrigger) {
            triggerAlert(alert.id, currentPrice);
          }
        } catch (err) {
          console.error('Failed to check alert:', err);
        }
      }
    };

    const interval = setInterval(checkAlerts, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [alerts]);

  const createAlert = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tokenPair || !targetPrice) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newAlert: PriceAlert = {
      id: `alert_${Date.now()}`,
      tokenPair,
      targetPrice: parseFloat(targetPrice),
      condition,
      enabled: true,
      createdAt: new Date().toISOString(),
      status: 'active',
      notificationMethod: notificationMethods,
    };

    // If email or webhook is selected, save the notification endpoint
    if (notificationMethods.includes('email') && email) {
      // In production, save email to backend
      console.log('Email notification will be sent to:', email);
    }

    if (notificationMethods.includes('webhook') && webhook) {
      // In production, save webhook to backend
      console.log('Webhook notification will be sent to:', webhook);
    }

    // Request browser notification permission if selected
    if (notificationMethods.includes('browser')) {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }

    setAlerts([...alerts, newAlert]);
    resetForm();
    toast.success('Price alert created successfully');
  };

  const triggerAlert = useCallback((alertId: string, currentPrice: number) => {
    setAlerts(prevAlerts =>
      prevAlerts.map(alert => {
        if (alert.id === alertId) {
          const triggeredAlert = {
            ...alert,
            status: 'triggered' as const,
            triggeredAt: new Date().toISOString(),
          };

          // Send notifications
          if (alert.notificationMethod.includes('browser')) {
            sendBrowserNotification(alert, currentPrice);
          }

          if (onAlertTriggered) {
            onAlertTriggered(triggeredAlert);
          }

          toast.success(
            `Alert triggered: ${alert.tokenPair} ${alert.condition} $${alert.targetPrice}`,
            { duration: 10000 }
          );

          return triggeredAlert;
        }
        return alert;
      })
    );
  }, [onAlertTriggered]);

  const sendBrowserNotification = (alert: PriceAlert, currentPrice: number) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Price Alert Triggered!', {
        body: `${alert.tokenPair} is now ${alert.condition} $${alert.targetPrice} (Current: $${currentPrice.toFixed(2)})`,
        icon: '/logo192.png',
        tag: alert.id,
      });
    }
  };

  const toggleAlert = (alertId: string) => {
    setAlerts(prevAlerts =>
      prevAlerts.map(alert => {
        if (alert.id === alertId) {
          const newStatus = alert.status === 'paused' ? 'active' : 'paused';
          return { ...alert, status: newStatus };
        }
        return alert;
      })
    );
    toast.success(
      alerts.find(a => a.id === alertId)?.status === 'paused'
        ? 'Alert activated'
        : 'Alert paused'
    );
  };

  const deleteAlert = (alertId: string) => {
    setAlerts(prevAlerts => prevAlerts.filter(alert => alert.id !== alertId));
    toast.success('Alert deleted');
  };

  const reactivateAlert = (alertId: string) => {
    setAlerts(prevAlerts =>
      prevAlerts.map(alert => {
        if (alert.id === alertId) {
          return {
            ...alert,
            status: 'active',
            triggeredAt: undefined,
          };
        }
        return alert;
      })
    );
    toast.success('Alert reactivated');
  };

  const resetForm = () => {
    setShowForm(false);
    setTokenPair('ETH/USDC');
    setTargetPrice('');
    setCondition('above');
    setNotificationMethods(['browser']);
    setEmail('');
    setWebhook('');
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'all') return true;
    return alert.status === filter;
  });

  const getAlertIcon = (status: string) => {
    const icons = {
      active: '🔔',
      triggered: '✅',
      paused: '⏸️',
    };
    return icons[status as keyof typeof icons] || '🔔';
  };

  const getAlertColor = (status: string) => {
    const colors = {
      active: '#00D395',
      triggered: '#FFA500',
      paused: '#888',
    };
    return colors[status as keyof typeof colors] || '#00D395';
  };

  return (
    <div className="enhanced-price-alerts">
      <div className="alerts-header">
        <h3>Price Alerts</h3>
        <div className="alerts-header__actions">
          <span className="alerts-count">
            {alerts.filter(a => a.status === 'active').length} active
          </span>
          <button
            className="button--primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? '✕ Cancel' : '+ New Alert'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="alert-form" onSubmit={createAlert}>
          <div className="form-group">
            <label htmlFor="tokenPair">Token Pair</label>
            <select
              id="tokenPair"
              value={tokenPair}
              onChange={(e) => setTokenPair(e.target.value)}
              className="form-select"
            >
              <option value="ETH/USDC">ETH/USDC</option>
              <option value="BTC/USDC">BTC/USDC</option>
              <option value="ETH/BTC">ETH/BTC</option>
              <option value="DAI/USDC">DAI/USDC</option>
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="condition">Condition</label>
              <select
                id="condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
                className="form-select"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="targetPrice">Target Price ($)</label>
              <input
                id="targetPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="form-input"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Notification Methods</label>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={notificationMethods.includes('browser')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNotificationMethods([...notificationMethods, 'browser']);
                    } else {
                      setNotificationMethods(notificationMethods.filter(m => m !== 'browser'));
                    }
                  }}
                />
                <span>Browser Notification</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={notificationMethods.includes('email')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNotificationMethods([...notificationMethods, 'email']);
                    } else {
                      setNotificationMethods(notificationMethods.filter(m => m !== 'email'));
                    }
                  }}
                />
                <span>Email</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={notificationMethods.includes('webhook')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNotificationMethods([...notificationMethods, 'webhook']);
                    } else {
                      setNotificationMethods(notificationMethods.filter(m => m !== 'webhook'));
                    }
                  }}
                />
                <span>Webhook</span>
              </label>
            </div>
          </div>

          {notificationMethods.includes('email') && (
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
              />
            </div>
          )}

          {notificationMethods.includes('webhook') && (
            <div className="form-group">
              <label htmlFor="webhook">Webhook URL</label>
              <input
                id="webhook"
                type="url"
                placeholder="https://..."
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                className="form-input"
              />
            </div>
          )}

          <button type="submit" className="button--primary button--full">
            Create Alert
          </button>
        </form>
      )}

      <div className="alerts-filters">
        {(['all', 'active', 'triggered', 'paused'] as const).map((filterOption) => (
          <button
            key={filterOption}
            className={`filter-btn ${filter === filterOption ? 'filter-btn--active' : ''}`}
            onClick={() => setFilter(filterOption)}
          >
            {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
          </button>
        ))}
      </div>

      <div className="alerts-list">
        {filteredAlerts.length === 0 ? (
          <div className="alerts-empty">
            <p>No {filter !== 'all' ? filter : ''} alerts</p>
            <small>Create an alert to get notified when prices move</small>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className="alert-item"
              style={{ borderLeftColor: getAlertColor(alert.status) }}
            >
              <div className="alert-item__header">
                <span className="alert-item__icon">{getAlertIcon(alert.status)}</span>
                <div className="alert-item__info">
                  <strong>{alert.tokenPair}</strong>
                  <small>
                    {alert.condition} ${alert.targetPrice.toFixed(2)}
                  </small>
                </div>
                <span className={`alert-item__status alert-item__status--${alert.status}`}>
                  {alert.status}
                </span>
              </div>

              <div className="alert-item__meta">
                <div className="alert-item__meta-row">
                  <span className="label">Created:</span>
                  <span className="value">
                    {new Date(alert.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {alert.triggeredAt && (
                  <div className="alert-item__meta-row">
                    <span className="label">Triggered:</span>
                    <span className="value">
                      {new Date(alert.triggeredAt).toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="alert-item__meta-row">
                  <span className="label">Notifications:</span>
                  <span className="value">
                    {alert.notificationMethod.join(', ')}
                  </span>
                </div>
              </div>

              <div className="alert-item__actions">
                {alert.status === 'active' && (
                  <button
                    onClick={() => toggleAlert(alert.id)}
                    className="button--icon"
                    title="Pause alert"
                  >
                    ⏸️
                  </button>
                )}

                {alert.status === 'paused' && (
                  <button
                    onClick={() => toggleAlert(alert.id)}
                    className="button--icon"
                    title="Resume alert"
                  >
                    ▶️
                  </button>
                )}

                {alert.status === 'triggered' && (
                  <button
                    onClick={() => reactivateAlert(alert.id)}
                    className="button--secondary button--small"
                  >
                    Reactivate
                  </button>
                )}

                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="button--icon button--danger"
                  title="Delete alert"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EnhancedPriceAlerts;
