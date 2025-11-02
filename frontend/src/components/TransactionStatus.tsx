import React from 'react';

interface TransactionStatusProps {
  status: 'idle' | 'pending' | 'success' | 'error';
  txHash?: string;
  message?: string;
  onClose?: () => void;
}

export const TransactionStatus: React.FC<TransactionStatusProps> = ({
  status,
  txHash,
  message,
  onClose,
}) => {
  if (status === 'idle') return null;

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '';
    }
  };

  const getStatusClass = () => {
    switch (status) {
      case 'pending':
        return 'tx-status pending';
      case 'success':
        return 'tx-status success';
      case 'error':
        return 'tx-status error';
      default:
        return 'tx-status';
    }
  };

  const getDefaultMessage = () => {
    switch (status) {
      case 'pending':
        return 'Transaction pending...';
      case 'success':
        return 'Transaction successful!';
      case 'error':
        return 'Transaction failed';
      default:
        return '';
    }
  };

  return (
    <div className="tx-status-overlay">
      <div className={getStatusClass()}>
        <div className="tx-status-header">
          <span className="tx-status-icon">{getStatusIcon()}</span>
          <span className="tx-status-message">
            {message || getDefaultMessage()}
          </span>
          {onClose && (
            <button className="tx-status-close" onClick={onClose}>
              ×
            </button>
          )}
        </div>

        {txHash && (
          <div className="tx-hash">
            <small>
              Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </small>
          </div>
        )}

        {status === 'pending' && (
          <div className="tx-progress">
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};