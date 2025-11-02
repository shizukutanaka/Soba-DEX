import React, { useCallback, useEffect, useMemo, Suspense, lazy } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { WalletConnect } from './components/WalletConnect';
import { TopNavigation } from './components/TopNavigation';
import { useOptimizedState } from './hooks/useOptimizedState';
import { usePriceUpdates } from './hooks/usePriceUpdates';
import { usePriceAlerts } from './hooks/usePriceAlerts';
import { usePortfolio } from './hooks/usePortfolio';
import './styles/App.css';

// Lazy load components for better bundle splitting
const SwapPanel = lazy(() => import('./components/SwapPanel'));
const TradingView = lazy(() => import('./components/TradingView').then(m => ({ default: m.TradingView })));
const LiquidityPanel = lazy(() => import('./components/LiquidityPanel'));
const PriceAlerts = lazy(() => import('./components/PriceAlerts').then(m => ({ default: m.PriceAlerts })));
const Portfolio = lazy(() => import('./components/Portfolio').then(m => ({ default: m.Portfolio })));

interface AppState {
  activeTab: string;
  currentSymbol: string;
  walletAddress: string;
  currentPrice: number;
  isConnected: boolean;
  balance: string;
  loading: boolean;
  error: string | null;
  // Accessibility enhancements
  isReducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';
  highContrast: boolean;
  screenReaderMode: boolean;
}

const App: React.FC = () => {
  const { state, updateState } = useOptimizedState<AppState>({
    activeTab: 'trading',
    currentSymbol: 'ETH/USDT',
    walletAddress: '',
    currentPrice: 2500,
    isConnected: false,
    balance: '0.00',
    loading: false,
    error: null,
    // Accessibility defaults
    isReducedMotion: false,
    fontSize: 'medium',
    highContrast: false,
    screenReaderMode: false,
  });

  const { prices, isConnected: priceServiceConnected, subscribe, unsubscribe } = usePriceUpdates();
  const { updatePrice } = usePriceAlerts();
  const { updatePrices } = usePortfolio();

  const navigationTabs = useMemo(
    () => [
      { id: 'trading', label: 'Trading' },
      { id: 'swap', label: 'Swap' },
      { id: 'pools', label: 'Pools' },
      { id: 'portfolio', label: 'Portfolio' },
      { id: 'alerts', label: 'Price Alerts' }
    ],
    []
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      updateState({ activeTab: tab });
    },
    [updateState]
  );

  const handleLoading = useCallback(
    (loading: boolean) => {
      updateState({ loading });
    },
    [updateState]
  );

  const handleWalletConnect = useCallback(
    (address: string, balance: string) => {
      updateState({
        walletAddress: address,
        isConnected: true,
        balance,
        error: null
      });
    },
    [updateState]
  );

  const handleWalletDisconnect = useCallback(() => {
    updateState({
      walletAddress: '',
      isConnected: false,
      balance: '0.00',
      error: null
    });
  }, [updateState]);

  const handleSymbolChange = useCallback(
    (symbol: string) => {
      unsubscribe(state.currentSymbol);
      subscribe(symbol);
      updateState({ currentSymbol: symbol });
    },
    [updateState, subscribe, unsubscribe, state.currentSymbol]
  );

  const handlePriceUpdate = useCallback(
    (price: number) => {
      updateState({ currentPrice: price });
    },
    [updateState]
  );

  const handleAccessibilityChange = useCallback(
    (setting: keyof AppState, value: any) => {
      updateState({ [setting]: value });
    },
    [updateState]
  );

  // Accessibility helper functions
  const announceToScreenReader = useCallback((message: string) => {
    if (state.screenReaderMode) {
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.style.position = 'absolute';
      announcement.style.left = '-10000px';
      announcement.style.width = '1px';
      announcement.style.height = '1px';
      announcement.style.overflow = 'hidden';
      announcement.textContent = message;
      document.body.appendChild(announcement);

      setTimeout(() => {
        document.body.removeChild(announcement);
      }, 1000);
    }
  const handleError = useCallback(
    (error: string) => {
      updateState({ error, loading: false });
      announceToScreenReader(`Error: ${error}`);
    },
    [updateState, announceToScreenReader]
  );

  // Subscribe to current symbol on mount
  useEffect(() => {
    subscribe(state.currentSymbol);
    return () => {
      unsubscribe(state.currentSymbol);
    };
  }, []);

  // Memoize price map to avoid recalculation on every render
  const priceMap = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(prices).forEach(([symbol, data]) => {
      map[symbol.split('/')[0]] = data.price; // Extract base symbol
    });
    return map;
  }, [prices]);

  // Update current price when price data changes
  useEffect(() => {
    const currentPriceData = prices[state.currentSymbol];
    if (currentPriceData) {
      updateState({ currentPrice: currentPriceData.price });
      updatePrice(state.currentSymbol, currentPriceData.price);
    }
  }, [prices, state.currentSymbol, updateState, updatePrice]);

  // Update portfolio with memoized price map
  useEffect(() => {
    updatePrices(priceMap);
  }, [priceMap, updatePrices]);

  return (
    <ErrorBoundary>
    <div className="app">
      <TopNavigation
        productName="Soba DEX"
        productSubtitle="Enterprise-grade · Free Distribution"
        tabs={navigationTabs}
        activeTab={state.activeTab}
        onTabChange={handleTabChange}
        priceSummary={{
          symbol: state.currentSymbol,
          price: state.currentPrice
        }}
        liveStatus={priceServiceConnected ? 'connected' : 'disconnected'}
        loading={state.loading}
        actions={(
          <WalletConnect
            onWalletConnect={handleWalletConnect}
            onWalletDisconnect={handleWalletDisconnect}
          />
        )}
      />

      {state.error && (
        <div className="error-banner" role="alert">
          <span className="error-banner__icon" aria-hidden="true">⚠️</span>
          <span className="error-banner__message">{state.error}</span>
          <button
            className="error-banner__dismiss"
            onClick={() => updateState({ error: null })}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <main className="main-content">
        {state.loading && (
          <div className="loading-overlay">
            <div className="loading-spinner">Loading...</div>
          </div>
        )}

        <Suspense fallback={<div className="loading-spinner">Loading component...</div>}>
          {state.activeTab === 'trading' && (
            <TradingView
              symbol={state.currentSymbol}
              price={state.currentPrice}
              isConnected={state.isConnected}
              walletAddress={state.walletAddress}
              balance={state.balance}
              onSymbolChange={handleSymbolChange}
              onPriceUpdate={handlePriceUpdate}
              onError={handleError}
              onLoading={handleLoading}
            />
          )}

          {state.activeTab === 'swap' && (
            <SwapPanel
              isConnected={state.isConnected}
              walletAddress={state.walletAddress}
              balance={state.balance}
              onError={handleError}
              onLoading={handleLoading}
            />
          )}

          {state.activeTab === 'pools' && (
            <LiquidityPanel
              isConnected={state.isConnected}
              walletAddress={state.walletAddress}
              balance={state.balance}
              onError={handleError}
              onLoading={handleLoading}
            />
          )}

          {state.activeTab === 'portfolio' && (
            <Portfolio />
          )}

          {state.activeTab === 'alerts' && (
            <PriceAlerts />
          )}
        </Suspense>
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <p>© 2024 DEX Trading Platform - Lightweight & Fast</p>
          <div className="status-indicators">
            <span className={`status ${state.isConnected ? 'connected' : 'disconnected'}`}>
              {state.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </div>
        </div>
      </footer>
    </div>
    </ErrorBoundary>
  );
};

export default App;
