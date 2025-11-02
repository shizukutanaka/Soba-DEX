import { useState, useEffect, useCallback } from 'react';
import { storage, STORAGE_KEYS } from '../utils/storage';

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'above' | 'below';
  isActive: boolean;
  createdAt: number;
  triggeredAt?: number;
}

export const usePriceAlerts = () => {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

  // Load alerts from storage on mount
  useEffect(() => {
    const savedAlerts = storage.get<PriceAlert[]>(STORAGE_KEYS.PRICE_ALERTS, []);
    setAlerts(savedAlerts);
  }, []);

  // Save alerts to storage when changed
  useEffect(() => {
    storage.set(STORAGE_KEYS.PRICE_ALERTS, alerts);
  }, [alerts]);

  const addAlert = useCallback((
    symbol: string,
    targetPrice: number,
    condition: 'above' | 'below'
  ): string => {
    const newAlert: PriceAlert = {
      id: Date.now().toString(),
      symbol: symbol.toUpperCase(),
      targetPrice,
      condition,
      isActive: true,
      createdAt: Date.now(),
    };

    setAlerts(prev => [...prev, newAlert]);
    return newAlert.id;
  }, []);

  const removeAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  }, []);

  const toggleAlert = useCallback((id: string) => {
    setAlerts(prev =>
      prev.map(alert =>
        alert.id === id
          ? { ...alert, isActive: !alert.isActive }
          : alert
      )
    );
  }, []);

  const updatePrice = useCallback((symbol: string, price: number) => {
    setCurrentPrices(prev => ({ ...prev, [symbol.toUpperCase()]: price }));
  }, []);

  // Check alerts against current prices
  const checkAlerts = useCallback(() => {
    const triggeredAlerts: PriceAlert[] = [];

    setAlerts(prev =>
      prev.map(alert => {
        if (!alert.isActive || alert.triggeredAt) return alert;

        const currentPrice = currentPrices[alert.symbol];
        if (!currentPrice) return alert;

        const shouldTrigger =
          (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
          (alert.condition === 'below' && currentPrice <= alert.targetPrice);

        if (shouldTrigger) {
          const triggeredAlert = {
            ...alert,
            triggeredAt: Date.now(),
            isActive: false,
          };
          triggeredAlerts.push(triggeredAlert);
          return triggeredAlert;
        }

        return alert;
      })
    );

    // Show notifications for triggered alerts
    triggeredAlerts.forEach(alert => {
      showNotification(alert);
    });

  }, [currentPrices]);

  const showNotification = (alert: PriceAlert) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Price Alert: ${alert.symbol}`, {
        body: `${alert.symbol} is now ${alert.condition} $${alert.targetPrice}`,
        icon: '/favicon.ico',
      });
    }
  };

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  // Check alerts when prices update
  useEffect(() => {
    checkAlerts();
  }, [currentPrices, checkAlerts]);

  const getActiveAlerts = useCallback(() => {
    return alerts.filter(alert => alert.isActive && !alert.triggeredAt);
  }, [alerts]);

  const getTriggeredAlerts = useCallback(() => {
    return alerts.filter(alert => alert.triggeredAt);
  }, [alerts]);

  return {
    alerts,
    activeAlerts: getActiveAlerts(),
    triggeredAlerts: getTriggeredAlerts(),
    addAlert,
    removeAlert,
    toggleAlert,
    updatePrice,
    requestNotificationPermission,
  };
};