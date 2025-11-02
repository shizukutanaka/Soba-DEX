import React, { useState, useEffect } from 'react';

interface Trade {
  id: string;
  price: number;
  amount: number;
  side: 'buy' | 'sell';
  timestamp: number;
  total: number;
}

interface TradeHistoryProps {
  symbol: string;
  maxTrades?: number;
}

export const TradeHistory: React.FC<TradeHistoryProps> = ({
  symbol,
  maxTrades = 50,
}) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [tradesPerPage] = useState(10);

  useEffect(() => {
    generateMockTrades();
    const interval = setInterval(generateMockTrades, 5000);
    return () => clearInterval(interval);
  }, [symbol, maxTrades]);

  const generateMockTrades = () => {
    const newTrades: Trade[] = [];
    const basePrice = 2000 + Math.random() * 1000;

    for (let i = 0; i < maxTrades; i++) {
      const price = basePrice + (Math.random() - 0.5) * 100;
      const amount = Math.random() * 10 + 0.1;
      const side = Math.random() > 0.5 ? 'buy' : 'sell';
      const timestamp = Date.now() - i * 60000 + Math.random() * 30000;

      newTrades.push({
        id: `trade-${i}-${timestamp}`,
        price: parseFloat(price.toFixed(2)),
        amount: parseFloat(amount.toFixed(4)),
        side,
        timestamp,
        total: parseFloat((price * amount).toFixed(2)),
      });
    }

    setTrades(newTrades.sort((a, b) => b.timestamp - a.timestamp));
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const indexOfLastTrade = currentPage * tradesPerPage;
  const indexOfFirstTrade = indexOfLastTrade - tradesPerPage;
  const currentTrades = trades.slice(indexOfFirstTrade, indexOfLastTrade);
  const totalPages = Math.ceil(trades.length / tradesPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="trade-history">
      <h3>Recent Trades - {symbol}</h3>

      <div className="trades-table">
        <div className="table-header">
          <span>Price</span>
          <span>Amount</span>
          <span>Total</span>
          <span>Time</span>
        </div>

        <div className="table-body">
          {currentTrades.map((trade) => (
            <div key={trade.id} className={`trade-row ${trade.side}`}>
              <span className={`price ${trade.side}-price`}>
                ${trade.price.toFixed(2)}
              </span>
              <span className="amount">{trade.amount.toFixed(4)}</span>
              <span className="total">${trade.total.toFixed(2)}</span>
              <span className="time">{formatTime(trade.timestamp)}</span>
            </div>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="page-btn"
          >
            Previous
          </button>

          <div className="page-numbers">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`page-btn ${currentPage === page ? 'active' : ''}`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="page-btn"
          >
            Next
          </button>
        </div>
      )}

      <div className="trade-summary">
        <div className="summary-item">
          <span className="label">Total Trades:</span>
          <span className="value">{trades.length}</span>
        </div>
        <div className="summary-item">
          <span className="label">24h Volume:</span>
          <span className="value">
            ${trades.reduce((sum, trade) => sum + trade.total, 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};