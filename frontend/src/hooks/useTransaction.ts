import { useState, useCallback } from 'react';

interface TransactionState {
  status: 'idle' | 'pending' | 'success' | 'error';
  txHash?: string;
  error?: string;
}

export const useTransaction = () => {
  const [txState, setTxState] = useState<TransactionState>({ status: 'idle' });

  const executeTransaction = useCallback(async (
    transactionFn: () => Promise<{ hash: string }>,
    successMessage?: string
  ) => {
    setTxState({ status: 'pending' });

    try {
      const result = await transactionFn();
      setTxState({
        status: 'success',
        txHash: result.hash
      });

      // Auto-clear success after 5 seconds
      setTimeout(() => {
        setTxState({ status: 'idle' });
      }, 5000);

      return result;
    } catch (error: any) {
      const errorMessage = error?.reason || error?.message || 'Transaction failed';
      setTxState({
        status: 'error',
        error: errorMessage
      });

      // Auto-clear error after 10 seconds
      setTimeout(() => {
        setTxState({ status: 'idle' });
      }, 10000);

      throw error;
    }
  }, []);

  const clearTransaction = useCallback(() => {
    setTxState({ status: 'idle' });
  }, []);

  return {
    txState,
    executeTransaction,
    clearTransaction,
    isLoading: txState.status === 'pending'
  };
};