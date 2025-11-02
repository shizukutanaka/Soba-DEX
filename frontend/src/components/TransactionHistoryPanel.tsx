import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface Transaction {
  hash: string;
  type: 'swap' | 'add_liquidity' | 'remove_liquidity' | 'approve';
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
  amountOut?: number;
  gasUsed?: number;
  gasFee?: string;
  from: string;
  to?: string;
  blockNumber?: number;
}

interface TransactionHistoryPanelProps {
  walletAddress: string;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const TransactionHistoryPanel: React.FC<TransactionHistoryPanelProps> = ({
  walletAddress,
  limit = 10,
  autoRefresh = true,
  refreshInterval = 15000,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchTransactions = useCallback(async () => {
    if (!walletAddress) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await fetch(
        `/api/transactions/history?address=${walletAddress}&limit=${limit}&page=${currentPage}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch transaction history');
      }

      const data = await response.json();

      if (data.success && data.data) {
        setTransactions(data.data.transactions || []);
      } else {
        throw new Error(data.error || 'Invalid response format');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, limit, currentPage]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchTransactions, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchTransactions]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      pending: { label: 'Pending', className: 'status-badge--pending' },
      confirmed: { label: 'Confirmed', className: 'status-badge--confirmed' },
      failed: { label: 'Failed', className: 'status-badge--failed' },
    };

    const statusInfo = statusMap[status] || statusMap.pending;

    return (
      <span className={`status-badge ${statusInfo.className}`}>
        {statusInfo.label}
      </span>
    );
  };

  const getTransactionTypeIcon = (type: string) => {
    const typeMap: Record<string, string> = {
      swap: '🔄',
      add_liquidity: '➕',
      remove_liquidity: '➖',
      approve: '✅',
    };

    return typeMap[type] || '📝';
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleViewOnExplorer = (hash: string) => {
    const explorerUrl = `https://etherscan.io/tx/${hash}`;
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      toast.success('Transaction hash copied!');
    } catch (err) {
      toast.error('Failed to copy hash');
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true;
    return tx.type === filter;
  });

  if (isLoading) {
    return (
      <div className="transaction-history">
        <div className="transaction-history__loading">
          <div className="spinner"></div>
          <span>Loading transaction history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="transaction-history">
        <div className="transaction-history__error">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <button onClick={fetchTransactions} className="button--secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="transaction-history">
      <div className="transaction-history__header">
        <h3>Transaction History</h3>
        <button
          onClick={fetchTransactions}
          className="button--icon"
          title="Refresh"
          disabled={isLoading}
        >
          🔄
        </button>
      </div>

      <div className="transaction-history__filters">
        <button
          className={`filter-btn ${filter === 'all' ? 'filter-btn--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`filter-btn ${filter === 'swap' ? 'filter-btn--active' : ''}`}
          onClick={() => setFilter('swap')}
        >
          Swaps
        </button>
        <button
          className={`filter-btn ${filter === 'add_liquidity' ? 'filter-btn--active' : ''}`}
          onClick={() => setFilter('add_liquidity')}
        >
          Add Liquidity
        </button>
        <button
          className={`filter-btn ${filter === 'remove_liquidity' ? 'filter-btn--active' : ''}`}
          onClick={() => setFilter('remove_liquidity')}
        >
          Remove Liquidity
        </button>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="transaction-history__empty">
          <p>No transactions found</p>
          <small>Your transaction history will appear here</small>
        </div>
      ) : (
        <div className="transaction-history__list">
          {filteredTransactions.map((tx) => (
            <div key={tx.hash} className="transaction-item">
              <div className="transaction-item__header">
                <div className="transaction-item__type">
                  <span className="transaction-item__icon">
                    {getTransactionTypeIcon(tx.type)}
                  </span>
                  <div className="transaction-item__info">
                    <strong>
                      {tx.type === 'swap' && `${tx.tokenIn} → ${tx.tokenOut}`}
                      {tx.type === 'add_liquidity' && 'Add Liquidity'}
                      {tx.type === 'remove_liquidity' && 'Remove Liquidity'}
                      {tx.type === 'approve' && 'Token Approval'}
                    </strong>
                    <small>{formatTimestamp(tx.timestamp)}</small>
                  </div>
                </div>
                {getStatusBadge(tx.status)}
              </div>

              <div className="transaction-item__details">
                {tx.type === 'swap' && (
                  <div className="transaction-item__amounts">
                    <span>
                      {tx.amountIn?.toFixed(4)} {tx.tokenIn}
                    </span>
                    <span className="arrow">→</span>
                    <span>
                      {tx.amountOut?.toFixed(4)} {tx.tokenOut}
                    </span>
                  </div>
                )}

                <div className="transaction-item__meta">
                  <div className="transaction-item__meta-row">
                    <span className="label">Hash:</span>
                    <span className="value">
                      {formatAddress(tx.hash)}
                      <button
                        onClick={() => handleCopyHash(tx.hash)}
                        className="button--icon button--icon-small"
                        title="Copy hash"
                      >
                        📋
                      </button>
                    </span>
                  </div>

                  {tx.gasFee && (
                    <div className="transaction-item__meta-row">
                      <span className="label">Gas Fee:</span>
                      <span className="value">{tx.gasFee} ETH</span>
                    </div>
                  )}

                  {tx.blockNumber && (
                    <div className="transaction-item__meta-row">
                      <span className="label">Block:</span>
                      <span className="value">#{tx.blockNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="transaction-item__actions">
                <button
                  onClick={() => handleViewOnExplorer(tx.hash)}
                  className="button--link"
                >
                  View on Explorer →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredTransactions.length > 0 && (
        <div className="transaction-history__pagination">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="button--secondary"
          >
            Previous
          </button>
          <span>Page {currentPage}</span>
          <button
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={filteredTransactions.length < limit}
            className="button--secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistoryPanel;
