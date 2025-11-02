import React from 'react';

interface TransactionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  transaction: {
    type: string;
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: string;
    amountOut?: string;
    fee?: string;
    priceImpact?: number;
  };
}

export const TransactionConfirmModal: React.FC<TransactionConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  transaction
}) => {
  if (!isOpen) return null;

  return (
    <div className="tx-confirm-modal">
      <div className="tx-confirm-backdrop" onClick={onClose} />
      <div className="tx-confirm-content">
        <h2>Confirm Transaction</h2>
        <div className="tx-details">
          <div className="tx-row">
            <span>Type:</span>
            <strong>{transaction.type}</strong>
          </div>
          {transaction.amountIn && (
            <div className="tx-row">
              <span>Amount In:</span>
              <strong>{transaction.amountIn} {transaction.tokenIn}</strong>
            </div>
          )}
          {transaction.amountOut && (
            <div className="tx-row">
              <span>Amount Out:</span>
              <strong>{transaction.amountOut} {transaction.tokenOut}</strong>
            </div>
          )}
          {transaction.fee && (
            <div className="tx-row">
              <span>Fee:</span>
              <strong>{transaction.fee}</strong>
            </div>
          )}
          {transaction.priceImpact && (
            <div className="tx-row">
              <span>Price Impact:</span>
              <strong className={transaction.priceImpact > 5 ? 'warning' : ''}>
                {transaction.priceImpact.toFixed(2)}%
              </strong>
            </div>
          )}
        </div>
        <div className="tx-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn-primary">Confirm</button>
        </div>
      </div>
    </div>
  );
};
