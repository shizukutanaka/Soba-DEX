import React, { memo } from 'react';
import { TradingChart } from './TradingChart';
import { OrderBook } from './OrderBook';
import { TradingForm } from './TradingForm';

interface TradingViewProps {
  symbol: string;
  price: number;
  isConnected: boolean;
  walletAddress: string;
  balance: string;
  onSymbolChange: (symbol: string) => void;
  onPriceUpdate: (price: number) => void;
  onError: (error: string) => void;
  onLoading: (loading: boolean) => void;
}

export const TradingView: React.FC<TradingViewProps> = memo(
  ({ symbol, price, isConnected, walletAddress, balance, onSymbolChange, onPriceUpdate, onError, onLoading }) => {
    return (
      <div className="trading-view">
        <div className="chart-section">
          <TradingChart
            symbol={symbol}
            price={price}
            onSymbolChange={onSymbolChange}
            onPriceUpdate={onPriceUpdate}
          />
        </div>

        <div className="trading-panel">
          <TradingForm
            symbol={symbol}
            price={price}
            isConnected={isConnected}
            walletAddress={walletAddress}
            balance={balance}
            onError={onError}
            onLoading={onLoading}
          />

          <OrderBook
            symbol={symbol}
            isConnected={isConnected}
            onError={onError}
          />
        </div>
      </div>
    );
  }
);

TradingView.displayName = 'TradingView';
