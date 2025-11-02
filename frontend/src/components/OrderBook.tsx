import React, { useState, useEffect } from 'react';

interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
}

interface OrderBookProps {
  symbol: string;
  isConnected: boolean;
  onError: (error: string) => void;
  maxDepth?: number;
}

export const OrderBook: React.FC<OrderBookProps> = ({
  symbol,
  isConnected: _isConnected,
  onError: _onError,
  maxDepth = 10,
}) => {
  const [bids, setBids] = useState<OrderBookEntry[]>([]);
  const [asks, setAsks] = useState<OrderBookEntry[]>([]);
  const [spread, setSpread] = useState(0);
  const [spreadPercent, setSpreadPercent] = useState(0);

  useEffect(() => {
    generateMockOrderBook();
    const interval = setInterval(generateMockOrderBook, 1000);
    return () => clearInterval(interval);
  }, [symbol, maxDepth]);

  const generateMockOrderBook = () => {
    const basePrice = 2000 + Math.random() * 1000;
    const newBids: OrderBookEntry[] = [];
    const newAsks: OrderBookEntry[] = [];

    // Generate bids (descending price)
    for (let i = 0; i < maxDepth; i++) {
      const price = basePrice - (i + 1) * (0.1 + Math.random() * 0.5);
      const amount = Math.random() * 10 + 0.1;
      const total = i === 0 ? amount : amount + (newBids[i - 1]?.total || 0);

      newBids.push({
        price: parseFloat(price.toFixed(2)),
        amount: parseFloat(amount.toFixed(4)),
        total: parseFloat(total.toFixed(4)),
      });
    }

    // Generate asks (ascending price)
    for (let i = 0; i < maxDepth; i++) {
      const price = basePrice + (i + 1) * (0.1 + Math.random() * 0.5);
      const amount = Math.random() * 10 + 0.1;
      const total = i === 0 ? amount : amount + (newAsks[i - 1]?.total || 0);

      newAsks.push({
        price: parseFloat(price.toFixed(2)),
        amount: parseFloat(amount.toFixed(4)),
        total: parseFloat(total.toFixed(4)),
      });
    }

    setBids(newBids);
    setAsks(newAsks);

    // Calculate spread
    if (newBids.length > 0 && newAsks.length > 0) {
      const bestBid = newBids[0]?.price || 0;
      const bestAsk = newAsks[0]?.price || 0;
      const currentSpread = bestAsk - bestBid;
      const currentSpreadPercent = (currentSpread / bestBid) * 100;

      setSpread(currentSpread);
      setSpreadPercent(currentSpreadPercent);
    }
  };

  const getDepthBarWidth = (total: number, maxTotal: number): number => {
    return (total / maxTotal) * 100;
  };

  const maxBidTotal = bids.length > 0 ? Math.max(...bids.map(b => b.total)) : 0;
  const maxAskTotal = asks.length > 0 ? Math.max(...asks.map(a => a.total)) : 0;

  return (
    <div className="order-book">
      <h3>Order Book - {symbol}</h3>

      <div className="spread-info">
        Spread: <strong>${spread.toFixed(2)}</strong> ({spreadPercent.toFixed(4)}%)
      </div>

      <div className="order-book-tables">
        <div className="asks-section">
          <h4 className="asks-header">Asks (Sell)</h4>
          <div className="order-table">
            <div className="table-header">
              <span>Price</span>
              <span>Amount</span>
              <span>Total</span>
            </div>
            <div className="table-body">
              {asks
                .slice()
                .reverse()
                .map((ask, index) => (
                  <div
                    key={index}
                    className="order-row ask-row"
                    style={{
                      '--depth-width': `${getDepthBarWidth(ask.total, maxAskTotal)}%`
                    } as React.CSSProperties}
                  >
                    <span className="price ask-price">${ask.price}</span>
                    <span className="amount">{ask.amount}</span>
                    <span className="total">{ask.total}</span>
                    <div className="depth-bar ask-depth" />
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="bids-section">
          <h4 className="bids-header">Bids (Buy)</h4>
          <div className="order-table">
            <div className="table-header">
              <span>Price</span>
              <span>Amount</span>
              <span>Total</span>
            </div>
            <div className="table-body">
              {bids.map((bid, index) => (
                <div
                  key={index}
                  className="order-row bid-row"
                  style={{
                    '--depth-width': `${getDepthBarWidth(bid.total, maxBidTotal)}%`
                  } as React.CSSProperties}
                >
                  <span className="price bid-price">${bid.price}</span>
                  <span className="amount">{bid.amount}</span>
                  <span className="total">{bid.total}</span>
                  <div className="depth-bar bid-depth" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="market-depth">
        <h4>Market Depth</h4>
        <div className="depth-visualization">
          <span className="depth-label bid">Bid: {maxBidTotal.toFixed(2)}</span>
          <div className="depth-bar-container">
            <div className="depth-progress" style={{ width: '50%' }} />
          </div>
          <span className="depth-label ask">Ask: {maxAskTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};