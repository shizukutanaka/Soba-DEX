import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import './TransactionTracker.css';

export interface Transaction {
  hash: string;
  status: 'pending' | 'confirming' | 'success' | 'failed';
  confirmations: number;
  requiredConfirmations: number;
  timestamp: number;
  type: 'swap' | 'addLiquidity' | 'removeLiquidity' | 'approve' | 'other';
  from?: string;
  to?: string;
  value?: string;
  gasUsed?: string;
  gasPrice?: string;
  error?: string;
  chainId?: number;
}

interface TransactionTrackerProps {
  tx: Transaction;
  provider?: ethers.BrowserProvider;
  onComplete?: (tx: Transaction) => void;
  onError?: (tx: Transaction, error: string) => void;
}

interface ProgressStep {
  label: string;
  status: 'completed' | 'active' | 'pending' | 'failed';
  description?: string;
  timestamp?: number;
}

export const TransactionTracker: React.FC<TransactionTrackerProps> = ({
  tx: initialTx,
  provider,
  onComplete,
  onError
}) => {
  const [transaction, setTransaction] = useState<Transaction>(initialTx);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Update transaction status
  useEffect(() => {
    if (!provider) return;
    if (transaction.status === 'success' || transaction.status === 'failed') return;

    const checkTransaction = async () => {
      try {
        const receipt = await provider.getTransactionReceipt(transaction.hash);

        if (receipt) {
          const currentBlock = await provider.getBlockNumber();
          const confirmations = currentBlock - receipt.blockNumber + 1;

          setTransaction(prev => ({
            ...prev,
            confirmations,
            gasUsed: receipt.gasUsed.toString(),
            status: receipt.status === 1
              ? (confirmations >= transaction.requiredConfirmations ? 'success' : 'confirming')
              : 'failed'
          }));

          if (receipt.status === 0) {
            const errorMsg = 'Transaction reverted';
            setTransaction(prev => ({ ...prev, error: errorMsg }));
            if (onError) onError({ ...transaction, error: errorMsg }, errorMsg);
            toast.error(`Transaction failed: ${errorMsg}`);
          } else if (confirmations >= transaction.requiredConfirmations) {
            if (onComplete) onComplete({ ...transaction, status: 'success' });
            toast.success('Transaction confirmed!', {
              icon: '✅',
              duration: 4000
            });
          }
        }
      } catch (error: any) {
        console.error('Error checking transaction:', error);
        setTransaction(prev => ({
          ...prev,
          status: 'failed',
          error: error.message
        }));
        if (onError) onError(transaction, error.message);
      }
    };

    const interval = setInterval(checkTransaction, 3000);
    checkTransaction(); // Initial check

    return () => clearInterval(interval);
  }, [provider, transaction.hash, transaction.requiredConfirmations, transaction.status, onComplete, onError]);

  // Update progress steps
  useEffect(() => {
    const newSteps: ProgressStep[] = [
      {
        label: 'Transaction Submitted',
        status: transaction.status !== 'pending' ? 'completed' : 'active',
        description: `Hash: ${transaction.hash.slice(0, 10)}...${transaction.hash.slice(-8)}`,
        timestamp: transaction.timestamp
      },
      {
        label: 'Confirming',
        status:
          transaction.status === 'failed' ? 'failed' :
          transaction.status === 'success' ? 'completed' :
          transaction.status === 'confirming' ? 'active' :
          'pending',
        description: `${transaction.confirmations}/${transaction.requiredConfirmations} confirmations`
      },
      {
        label: 'Completed',
        status:
          transaction.status === 'failed' ? 'failed' :
          transaction.status === 'success' ? 'completed' :
          'pending',
        description: transaction.gasUsed ? `Gas Used: ${parseInt(transaction.gasUsed).toLocaleString()}` : ''
      }
    ];

    setSteps(newSteps);
  }, [transaction]);

  // Track elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - transaction.timestamp) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [transaction.timestamp]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const getEstimatedTime = (): string => {
    if (transaction.status === 'success' || transaction.status === 'failed') {
      return formatTime(elapsedTime);
    }

    const avgBlockTime = 12; // Ethereum average
    const blocksRemaining = transaction.requiredConfirmations - transaction.confirmations;
    const estimatedSeconds = blocksRemaining * avgBlockTime;

    return `~${formatTime(estimatedSeconds)} remaining`;
  };

  const getStatusColor = (): string => {
    switch (transaction.status) {
      case 'success': return '#10b981';
      case 'failed': return '#ef4444';
      case 'confirming': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (): string => {
    switch (transaction.status) {
      case 'success': return '✅';
      case 'failed': return '❌';
      case 'confirming': return '⏳';
      default: return '🔄';
    }
  };

  const getTransactionTypeLabel = (): string => {
    const types: Record<string, string> = {
      swap: '🔄 Swap',
      addLiquidity: '💧 Add Liquidity',
      removeLiquidity: '💧 Remove Liquidity',
      approve: '✅ Approve',
      other: '📝 Transaction'
    };
    return types[transaction.type] || types.other;
  };

  const getExplorerUrl = (): string => {
    const explorers: Record<number, string> = {
      1: 'https://etherscan.io',
      42161: 'https://arbiscan.io',
      10: 'https://optimistic.etherscan.io',
      137: 'https://polygonscan.com',
      5: 'https://goerli.etherscan.io',
      11155111: 'https://sepolia.etherscan.io'
    };

    const baseUrl = explorers[transaction.chainId || 1] || 'https://etherscan.io';
    return `${baseUrl}/tx/${transaction.hash}`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transaction.hash);
    toast.success('Transaction hash copied!', { duration: 2000 });
  };

  return (
    <div className="transaction-tracker">
      <div className="tracker-header">
        <div className="header-left">
          <h3 className="tracker-title">
            {getStatusIcon()} {getTransactionTypeLabel()}
          </h3>
          <span className="transaction-time">{formatTime(elapsedTime)}</span>
        </div>
        <div className="header-right">
          <span
            className="status-badge"
            style={{ backgroundColor: getStatusColor() }}
          >
            {transaction.status}
          </span>
        </div>
      </div>

      <div className="transaction-hash">
        <span className="hash-label">Transaction Hash:</span>
        <div className="hash-value-container">
          <span className="hash-value" title={transaction.hash}>
            {transaction.hash.slice(0, 10)}...{transaction.hash.slice(-8)}
          </span>
          <button
            className="copy-hash-button"
            onClick={copyToClipboard}
            aria-label="Copy transaction hash"
          >
            📋
          </button>
        </div>
      </div>

      <div className="progress-tracker">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`progress-step ${step.status}`}
          >
            <div className="step-indicator">
              <div className="step-circle">
                {step.status === 'completed' && '✓'}
                {step.status === 'active' && <span className="pulse"></span>}
                {step.status === 'failed' && '✕'}
              </div>
              {index < steps.length - 1 && (
                <div className={`step-line ${step.status === 'completed' ? 'completed' : ''}`}></div>
              )}
            </div>
            <div className="step-content">
              <div className="step-label">{step.label}</div>
              {step.description && (
                <div className="step-description">{step.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="transaction-details">
        <div className="detail-row">
          <span className="detail-label">Estimated Time:</span>
          <span className="detail-value">{getEstimatedTime()}</span>
        </div>
        {transaction.gasUsed && transaction.gasPrice && (
          <div className="detail-row">
            <span className="detail-label">Gas Fee:</span>
            <span className="detail-value">
              {ethers.formatEther(
                BigInt(transaction.gasUsed) * BigInt(transaction.gasPrice)
              )} ETH
            </span>
          </div>
        )}
      </div>

      {transaction.status === 'failed' && transaction.error && (
        <div className="error-alert">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <div className="error-title">Transaction Failed</div>
            <div className="error-message">{transaction.error}</div>
          </div>
        </div>
      )}

      {transaction.status === 'success' && (
        <div className="success-alert">
          <div className="success-icon">🎉</div>
          <div className="success-content">
            <div className="success-title">Transaction Successful!</div>
            <div className="success-message">
              Your {transaction.type} has been completed successfully.
            </div>
          </div>
        </div>
      )}

      <div className="tracker-actions">
        <a
          href={getExplorerUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="explorer-link"
        >
          <span className="link-icon">🔍</span>
          View on Explorer
          <span className="external-icon">↗</span>
        </a>
      </div>
    </div>
  );
};
