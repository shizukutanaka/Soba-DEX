import { useState, useEffect, useCallback } from 'react';
import { storage, STORAGE_KEYS } from '../utils/storage';

export interface PortfolioPosition {
  id: string;
  symbol: string;
  amount: number;
  averagePrice: number;
  currentPrice: number;
  totalValue: number;
  pnl: number;
  pnlPercentage: number;
  lastUpdated: number;
}

export interface PortfolioStats {
  totalValue: number;
  totalPnl: number;
  totalPnlPercentage: number;
  dailyChange: number;
  dailyChangePercentage: number;
  positions: PortfolioPosition[];
}

export const usePortfolio = () => {
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [isLoading, _setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  // Load portfolio from storage
  useEffect(() => {
    const savedPortfolio = storage.get<PortfolioPosition[]>(STORAGE_KEYS.PORTFOLIO_DATA, []);
    setPortfolio(savedPortfolio);

    if (savedPortfolio.length > 0) {
      setLastUpdate(Math.max(...savedPortfolio.map(p => p.lastUpdated)));
    }
  }, []);

  // Save portfolio to storage
  useEffect(() => {
    if (portfolio.length > 0) {
      storage.set(STORAGE_KEYS.PORTFOLIO_DATA, portfolio);
    }
  }, [portfolio]);

  const addPosition = useCallback((
    symbol: string,
    amount: number,
    price: number
  ): string => {
    const newPosition: PortfolioPosition = {
      id: Date.now().toString(),
      symbol: symbol.toUpperCase(),
      amount,
      averagePrice: price,
      currentPrice: price,
      totalValue: amount * price,
      pnl: 0,
      pnlPercentage: 0,
      lastUpdated: Date.now(),
    };

    setPortfolio(prev => {
      // Check if position already exists
      const existingIndex = prev.findIndex(p => p.symbol === symbol.toUpperCase());

      if (existingIndex >= 0) {
        // Update existing position with average price calculation
        const existing = prev[existingIndex];
        const totalAmount = existing.amount + amount;
        const totalCost = (existing.amount * existing.averagePrice) + (amount * price);
        const newAveragePrice = totalCost / totalAmount;

        const updated = {
          ...existing,
          amount: totalAmount,
          averagePrice: newAveragePrice,
          totalValue: totalAmount * existing.currentPrice,
          pnl: (existing.currentPrice - newAveragePrice) * totalAmount,
          pnlPercentage: ((existing.currentPrice - newAveragePrice) / newAveragePrice) * 100,
          lastUpdated: Date.now(),
        };

        const newPortfolio = [...prev];
        newPortfolio[existingIndex] = updated;
        return newPortfolio;
      } else {
        // Add new position
        return [...prev, newPosition];
      }
    });

    return newPosition.id;
  }, []);

  const removePosition = useCallback((id: string) => {
    setPortfolio(prev => prev.filter(position => position.id !== id));
  }, []);

  const updatePrices = useCallback((prices: Record<string, number>) => {
    setPortfolio(prev =>
      prev.map(position => {
        const currentPrice = prices[position.symbol];
        if (!currentPrice) return position;

        const totalValue = position.amount * currentPrice;
        const pnl = (currentPrice - position.averagePrice) * position.amount;
        const pnlPercentage = ((currentPrice - position.averagePrice) / position.averagePrice) * 100;

        return {
          ...position,
          currentPrice,
          totalValue,
          pnl,
          pnlPercentage,
          lastUpdated: Date.now(),
        };
      })
    );
    setLastUpdate(Date.now());
  }, []);

  const getPortfolioStats = useCallback((): PortfolioStats => {
    const totalValue = portfolio.reduce((sum, position) => sum + position.totalValue, 0);
    const totalPnl = portfolio.reduce((sum, position) => sum + position.pnl, 0);
    const totalCost = portfolio.reduce((sum, position) => sum + (position.amount * position.averagePrice), 0);
    const totalPnlPercentage = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    // Calculate daily change (simplified - would need historical data for accuracy)
    const dailyChange = totalPnl * 0.1; // Mock: assume 10% of total PnL is from today
    const dailyChangePercentage = totalValue > 0 ? (dailyChange / (totalValue - dailyChange)) * 100 : 0;

    return {
      totalValue,
      totalPnl,
      totalPnlPercentage,
      dailyChange,
      dailyChangePercentage,
      positions: [...portfolio].sort((a, b) => b.totalValue - a.totalValue), // Sort by value desc
    };
  }, [portfolio]);

  const getPositionBySymbol = useCallback((symbol: string): PortfolioPosition | undefined => {
    return portfolio.find(position => position.symbol === symbol.toUpperCase());
  }, [portfolio]);

  const clearPortfolio = useCallback(() => {
    setPortfolio([]);
    storage.remove(STORAGE_KEYS.PORTFOLIO_DATA);
  }, []);

  return {
    portfolio,
    isLoading,
    lastUpdate,
    addPosition,
    removePosition,
    updatePrices,
    getPortfolioStats,
    getPositionBySymbol,
    clearPortfolio,
  };
};