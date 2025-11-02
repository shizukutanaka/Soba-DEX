/**
 * Memoized Swap Panel Component
 *
 * PERFORMANCE: React.memo with custom comparison to prevent unnecessary rerenders
 */

import React, { memo, useState, useEffect, useCallback } from 'react';

interface SwapPanelProps {
  isConnected: boolean;
  walletAddress: string | null;
  balance: string;
  onError?: (error: string) => void;
  onLoading?: (loading: boolean) => void;
  contractAddress?: string;
}

const SwapPanelComponent: React.FC<SwapPanelProps> = ({
  isConnected,
  walletAddress,
  balance,
  onError,
  onLoading,
  contractAddress = '',
}) => {
  const [tokenInAddress, setTokenInAddress] = useState('');
  const [tokenOutAddress, setTokenOutAddress] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Memoized callbacks
  const handleSwap = useCallback(async () => {
    if (!isConnected) {
      onError?.('Please connect wallet first');
      return;
    }

    setIsLoading(true);
    onLoading?.(true);

    try {
      // Swap logic here
      console.log('Executing swap...', {
        tokenInAddress,
        tokenOutAddress,
        amountIn,
        amountOut,
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Swap failed');
    } finally {
      setIsLoading(false);
      onLoading?.(false);
    }
  }, [
    isConnected,
    tokenInAddress,
    tokenOutAddress,
    amountIn,
    amountOut,
    onError,
    onLoading,
  ]);

  return (
    <div className="swap-panel">
      <h2>Swap Tokens</h2>

      <div className="swap-form">
        <div className="input-group">
          <label>From</label>
          <input
            type="text"
            placeholder="Token address"
            value={tokenInAddress}
            onChange={(e) => setTokenInAddress(e.target.value)}
          />
          <input
            type="number"
            placeholder="Amount"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>To</label>
          <input
            type="text"
            placeholder="Token address"
            value={tokenOutAddress}
            onChange={(e) => setTokenOutAddress(e.target.value)}
          />
          <input
            type="number"
            placeholder="Amount"
            value={amountOut}
            readOnly
          />
        </div>

        <button onClick={handleSwap} disabled={isLoading || !isConnected}>
          {isLoading ? 'Swapping...' : 'Swap'}
        </button>
      </div>

      {!isConnected && (
        <div className="warning">Please connect your wallet to continue</div>
      )}
    </div>
  );
};

/**
 * Custom comparison function for React.memo
 * Only rerender if these specific props change
 */
const propsAreEqual = (
  prevProps: SwapPanelProps,
  nextProps: SwapPanelProps
): boolean => {
  return (
    prevProps.isConnected === nextProps.isConnected &&
    prevProps.walletAddress === nextProps.walletAddress &&
    prevProps.balance === nextProps.balance &&
    prevProps.contractAddress === nextProps.contractAddress
    // onError and onLoading are stable functions, so we don't compare them
  );
};

/**
 * PERFORMANCE: Memoized component
 * Will only rerender when isConnected, walletAddress, balance, or contractAddress change
 */
export const MemoizedSwapPanel = memo(SwapPanelComponent, propsAreEqual);

MemoizedSwapPanel.displayName = 'MemoizedSwapPanel';

export default MemoizedSwapPanel;
