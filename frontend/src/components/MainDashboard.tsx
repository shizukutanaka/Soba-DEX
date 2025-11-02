import React, { useState, useEffect } from 'react';
import LivePriceWidget from './LivePriceWidget';
import TransactionHistoryPanel from './TransactionHistoryPanel';
import GasOptimizationDashboard from './GasOptimizationDashboard';
import EnhancedPriceAlerts from './EnhancedPriceAlerts';
import PortfolioTracker from './PortfolioTracker';
import SwapPanel from './SwapPanel';

interface MainDashboardProps {
  walletAddress?: string;
  isConnected: boolean;
  balance: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

type DashboardView = 'overview' | 'trading' | 'portfolio' | 'history' | 'analytics';

const MainDashboard: React.FC<MainDashboardProps> = ({
  walletAddress = '',
  isConnected,
  balance,
  onConnect,
  onDisconnect,
}) => {
  const [activeView, setActiveView] = useState<DashboardView>('overview');
  const [selectedGasPrice, setSelectedGasPrice] = useState<number | null>(null);
  const [watchedPairs, setWatchedPairs] = useState<string[]>(['ETH/USDC', 'BTC/USDC', 'ETH/BTC']);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isConnected) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = process.env.REACT_APP_WS_PORT || '3001';
    const ws = new WebSocket(`${protocol}//${host}:${port}/ws`);

    ws.onopen = () => {
      console.log('WebSocket connected');

      // Subscribe to price updates
      watchedPairs.forEach(pair => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: 'prices',
          params: { pair }
        }));
      });

      // Subscribe to wallet transactions
      if (walletAddress) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: 'transactions',
          params: { address: walletAddress }
        }));
      }

      // Subscribe to gas prices
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'gas'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        // Handle different message types
        switch (data.type) {
          case 'connected':
            console.log('WebSocket connection confirmed:', data.clientId);
            break;

          case 'update':
            handleRealtimeUpdate(data);
            break;

          case 'initial':
            handleInitialData(data);
            break;

          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, [isConnected, walletAddress, watchedPairs]);

  const handleRealtimeUpdate = (data: any) => {
    // Handle real-time updates from WebSocket
    console.log('Real-time update:', data.channel, data.data);

    // In a real app, you would update state here to trigger component re-renders
    // For now, components are polling their own data
  };

  const handleInitialData = (data: any) => {
    // Handle initial data when subscribing to a channel
    console.log('Initial data:', data.channel, data.data);
  };

  const renderOverview = () => (
    <div className="dashboard-overview">
      <div className="dashboard-row">
        <div className="dashboard-col dashboard-col--main">
          {isConnected && walletAddress && (
            <PortfolioTracker
              walletAddress={walletAddress}
              autoRefresh={true}
            />
          )}

          {!isConnected && (
            <div className="connect-prompt">
              <h2>Welcome to Soba DEX</h2>
              <p>Connect your wallet to start trading and view your portfolio</p>
              <button onClick={onConnect} className="button--primary button--large">
                Connect Wallet
              </button>
            </div>
          )}
        </div>

        <div className="dashboard-col dashboard-col--sidebar">
          <div className="widget-stack">
            {watchedPairs.map(pair => (
              <LivePriceWidget
                key={pair}
                tokenPair={pair}
                updateInterval={5000}
                showChart={false}
                compact={true}
              />
            ))}
          </div>

          <GasOptimizationDashboard
            transactionType="swap"
            onGasSelected={(price, speed) => {
              setSelectedGasPrice(price);
              console.log(`Gas price selected: ${price} Gwei (${speed})`);
            }}
          />
        </div>
      </div>

      <div className="dashboard-row">
        <EnhancedPriceAlerts />
      </div>
    </div>
  );

  const renderTrading = () => (
    <div className="dashboard-trading">
      <div className="dashboard-row">
        <div className="dashboard-col dashboard-col--main">
          <LivePriceWidget
            tokenPair="ETH/USDC"
            updateInterval={5000}
            showChart={true}
            compact={false}
          />

          <SwapPanel
            isConnected={isConnected}
            walletAddress={walletAddress}
            balance={balance}
            onError={(error) => console.error(error)}
            onLoading={(loading) => console.log('Loading:', loading)}
          />
        </div>

        <div className="dashboard-col dashboard-col--sidebar">
          <GasOptimizationDashboard
            transactionType="swap"
            onGasSelected={setSelectedGasPrice}
          />

          {selectedGasPrice && (
            <div className="gas-selected-info">
              <strong>Selected Gas Price:</strong>
              <span>{selectedGasPrice} Gwei</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPortfolio = () => (
    <div className="dashboard-portfolio">
      {isConnected && walletAddress ? (
        <>
          <PortfolioTracker
            walletAddress={walletAddress}
            autoRefresh={true}
            refreshInterval={30000}
          />

          <div className="dashboard-row">
            <div className="widget-grid">
              {watchedPairs.map(pair => (
                <LivePriceWidget
                  key={pair}
                  tokenPair={pair}
                  updateInterval={5000}
                  showChart={true}
                  compact={false}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="connect-prompt">
          <h2>Portfolio Tracking</h2>
          <p>Connect your wallet to view and track your portfolio</p>
          <button onClick={onConnect} className="button--primary button--large">
            Connect Wallet
          </button>
        </div>
      )}
    </div>
  );

  const renderHistory = () => (
    <div className="dashboard-history">
      {isConnected && walletAddress ? (
        <TransactionHistoryPanel
          walletAddress={walletAddress}
          limit={20}
          autoRefresh={true}
          refreshInterval={15000}
        />
      ) : (
        <div className="connect-prompt">
          <h2>Transaction History</h2>
          <p>Connect your wallet to view your transaction history</p>
          <button onClick={onConnect} className="button--primary button--large">
            Connect Wallet
          </button>
        </div>
      )}
    </div>
  );

  const renderAnalytics = () => (
    <div className="dashboard-analytics">
      <div className="analytics-grid">
        <div className="analytics-card">
          <h3>Market Overview</h3>
          <div className="market-stats">
            <div className="stat">
              <span className="label">24h Volume</span>
              <span className="value">$2.4B</span>
              <span className="change positive">+12.5%</span>
            </div>
            <div className="stat">
              <span className="label">Active Traders</span>
              <span className="value">15,234</span>
              <span className="change positive">+8.2%</span>
            </div>
            <div className="stat">
              <span className="label">Total Liquidity</span>
              <span className="value">$850M</span>
              <span className="change positive">+5.1%</span>
            </div>
          </div>
        </div>

        <div className="analytics-card">
          <h3>Top Gainers (24h)</h3>
          <div className="token-list">
            {[
              { symbol: 'UNI', change: 15.2 },
              { symbol: 'AAVE', change: 12.8 },
              { symbol: 'LINK', change: 9.5 }
            ].map(token => (
              <div key={token.symbol} className="token-item">
                <span className="symbol">{token.symbol}</span>
                <span className="change positive">+{token.change}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="analytics-card">
          <h3>Top Losers (24h)</h3>
          <div className="token-list">
            {[
              { symbol: 'COMP', change: -8.3 },
              { symbol: 'MKR', change: -6.7 },
              { symbol: 'SNX', change: -5.2 }
            ].map(token => (
              <div key={token.symbol} className="token-item">
                <span className="symbol">{token.symbol}</span>
                <span className="change negative">{token.change}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="analytics-card">
          <h3>Gas Trends</h3>
          <div className="gas-trend-info">
            <p>Average gas price is <strong>25 Gwei</strong></p>
            <p>Network congestion: <span className="badge badge--low">Low</span></p>
            <p>Best time to trade: <strong>2-4 AM UTC</strong></p>
          </div>
        </div>
      </div>

      <div className="dashboard-row">
        <GasOptimizationDashboard transactionType="swap" />
      </div>
    </div>
  );

  return (
    <div className="main-dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header__brand">
          <h1>Soba DEX</h1>
          <span className="version">v2.3.0</span>
        </div>

        <nav className="dashboard-nav">
          {(['overview', 'trading', 'portfolio', 'history', 'analytics'] as DashboardView[]).map(view => (
            <button
              key={view}
              className={`nav-btn ${activeView === view ? 'active' : ''}`}
              onClick={() => setActiveView(view)}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </nav>

        <div className="dashboard-header__actions">
          {isConnected ? (
            <>
              <div className="wallet-info">
                <span className="balance">{balance} ETH</span>
                <span className="address">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
              <button onClick={onDisconnect} className="button--secondary">
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={onConnect} className="button--primary">
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <main className="dashboard-content">
        {activeView === 'overview' && renderOverview()}
        {activeView === 'trading' && renderTrading()}
        {activeView === 'portfolio' && renderPortfolio()}
        {activeView === 'history' && renderHistory()}
        {activeView === 'analytics' && renderAnalytics()}
      </main>

      <footer className="dashboard-footer">
        <div className="footer-content">
          <div className="footer-section">
            <span>© 2025 Soba DEX</span>
            <span>•</span>
            <a href="/docs">Documentation</a>
            <span>•</span>
            <a href="/api">API</a>
          </div>

          <div className="footer-section">
            <span className="status-indicator">
              <span className="status-dot status-dot--online"></span>
              All systems operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MainDashboard;
