import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useDEX } from '../hooks/useDEX';
import { dexMath } from '../utils/dexMath';
import { validation } from '../utils/validation';

interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  balance: string;
  name?: string;
  logoURI?: string;
}

interface SwapPanelProps {
  isConnected: boolean;
  walletAddress: string;
  balance: string;
  onError: (error: string) => void;
  onLoading: (loading: boolean) => void;
  contractAddress?: string;
}

const SwapPanel: React.FC<SwapPanelProps> = ({
  isConnected,
  walletAddress: _walletAddress,
  balance: _balance,
  onError: _onError,
  onLoading: _onLoading,
  contractAddress = '',
}) => {
  const {
    swap,
    getAmountOut,
    getTokenInfo,
    approveToken,
    checkAllowance,
    isLoading,
    error,
    setError,
  } = useDEX(contractAddress);

  const [tokenInAddress, setTokenInAddress] = useState('');
  const [tokenOutAddress, setTokenOutAddress] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [tokenInInfo, setTokenInInfo] = useState<TokenInfo | null>(null);
  const [tokenOutInfo, setTokenOutInfo] = useState<TokenInfo | null>(null);
  const [slippage, setSlippage] = useState('0.5');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [priceImpact, setPriceImpact] = useState(0);
  const [minAmountOut, setMinAmountOut] = useState('');
  const [activeTab, setActiveTab] = useState<'swap' | 'details'>('swap');

  const loadTokenInfo = useCallback(
    async (address: string, setter: Function) => {
      if (address) {
        try {
          const info = await getTokenInfo(address);
          setter(info);
        } catch (error) {
          toast.error('Failed to load token information');
          setter(null);
        }
      } else {
        setter(null);
      }
    },
    [getTokenInfo]
  );

  useEffect(() => {
    loadTokenInfo(tokenInAddress, setTokenInInfo);
  }, [tokenInAddress, loadTokenInfo]);

  useEffect(() => {
    loadTokenInfo(tokenOutAddress, setTokenOutInfo);
  }, [tokenOutAddress, loadTokenInfo]);

  const updateAmountOut = useCallback(async () => {
    if (
      tokenInAddress &&
      tokenOutAddress &&
      amountIn &&
      tokenInInfo &&
      tokenOutInfo &&
      validation.isValidAmount(amountIn)
    ) {
      try {
        const output = await getAmountOut(
          amountIn,
          tokenInAddress,
          tokenOutAddress,
          tokenInInfo.decimals,
          tokenOutInfo.decimals
        );

        const outputAmount = parseFloat(output || '0');
        setAmountOut(outputAmount.toString());

        // Calculate price impact and minimum amount out
        const inputAmount = parseFloat(amountIn);
        const slippageNum = parseFloat(slippage);

        // Mock reserves for price impact calculation (in real app, get from contract)
        const reserveIn = 1000000;
        const reserveOut = 1000000;

        const impact = dexMath.getPriceImpact(inputAmount, reserveIn, reserveOut);
        const minOut = dexMath.getAmountOutMin(outputAmount, slippageNum);

        setPriceImpact(impact);
        setMinAmountOut(minOut.toString());

      } catch (error) {
        setAmountOut('0');
        setPriceImpact(0);
        setMinAmountOut('0');
      }
    } else {
      setAmountOut('');
      setPriceImpact(0);
      setMinAmountOut('');
    }
  }, [
    tokenInAddress,
    tokenOutAddress,
    amountIn,
    tokenInInfo,
    tokenOutInfo,
    slippage,
    getAmountOut,
  ]);

  useEffect(() => {
    updateAmountOut();
  }, [updateAmountOut]);

  useEffect(() => {
    const checkApprovalNeeded = async () => {
      if (tokenInAddress && amountIn && tokenInInfo && isConnected) {
        const hasAllowance = await checkAllowance(
          tokenInAddress,
          amountIn,
          tokenInInfo.decimals
        );
        setNeedsApproval(!hasAllowance);
      } else {
        setNeedsApproval(false);
      }
    };

    checkApprovalNeeded();
  }, [tokenInAddress, amountIn, tokenInInfo, isConnected, checkAllowance]);

  const handleApprove = async () => {
    if (tokenInAddress && amountIn && tokenInInfo) {
      const success = await approveToken(
        tokenInAddress,
        amountIn,
        tokenInInfo.decimals
      );
      if (success) {
        setNeedsApproval(false);
      }
    }
  };

  const handleSwap = async () => {
    if (
      !tokenInAddress ||
      !tokenOutAddress ||
      !amountIn ||
      !amountOut ||
      !tokenInInfo ||
      !tokenOutInfo
    ) {
      setError('Please fill in all fields');
      return;
    }

    const slippageDecimal = parseFloat(slippage) / 100;
    const minAmountOut = (
      parseFloat(amountOut) *
      (1 - slippageDecimal)
    ).toString();

    const result = await swap(
      tokenInAddress,
      tokenOutAddress,
      amountIn,
      minAmountOut,
      tokenInInfo.decimals,
      tokenOutInfo.decimals
    );

    if (result) {
      setAmountIn('');
      setAmountOut('');
      toast.success(`Swap successful! Received: ${result} ${tokenOutInfo.symbol}`, {
        duration: 5000,
        position: 'top-right'
      });
    }
  };

  const swapTokens = () => {
    const tempAddress = tokenInAddress;
    const tempInfo = tokenInInfo;
    const tempAmount = amountOut;

    setTokenInAddress(tokenOutAddress);
    setTokenInInfo(tokenOutInfo);
    setTokenOutAddress(tempAddress);
    setTokenOutInfo(tempInfo);
    setAmountIn(tempAmount);
    setAmountOut('');
  };

  const truncatedWallet = _walletAddress
    ? `${_walletAddress.slice(0, 6)}…${_walletAddress.slice(-4)}`
    : null;

  const isSwapDisabled =
    isLoading || !isConnected || !amountIn || !tokenInAddress || !tokenOutAddress;

  return (
    <section className="atlas-card swap-card" aria-busy={isLoading}>
      <header className="swap-card__header">
        <div className="swap-card__title">
          <h3>Token Swap</h3>
          <div className="swap-card__meta">
            <span>Wallet: {truncatedWallet || 'Not connected'}</span>
            <span>Balance: {_balance || '0.00'}</span>
          </div>
        </div>
        <div className="segmented-control" role="tablist" aria-label="Swap view">
          {(['swap', 'details'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`segmented-control__button ${activeTab === tab ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'swap' ? 'Swap' : 'Details'}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'swap' ? (
        <div className="swap-grid">
          <div className="swap-field">
            <label htmlFor="tokenInAddress">From token</label>
            <div className="swap-field__input">
              <input
                id="tokenInAddress"
                type="text"
                placeholder="Token address"
                value={tokenInAddress}
                onChange={e => setTokenInAddress(e.target.value)}
              />
              {tokenInInfo && (
                <div className="swap-field__meta">
                  <span>{tokenInInfo.symbol}</span>
                  <small>Balance: {tokenInInfo.balance || '0.00'}</small>
                </div>
              )}
            </div>
            <div className="swap-field__amount">
              <span>Amount ({tokenInInfo?.symbol || 'Token'})</span>
              <input
                type="number"
                placeholder="0.00"
                value={amountIn}
                onChange={e => setAmountIn(e.target.value)}
                min="0"
              />
            </div>
          </div>

          <div className="swap-field swap-field--arrow">
            <button type="button" onClick={swapTokens} aria-label="Swap tokens">
              ↓
            </button>
          </div>

          <div className="swap-field">
            <label htmlFor="tokenOutAddress">To token</label>
            <div className="swap-field__input">
              <input
                id="tokenOutAddress"
                type="text"
                placeholder="Token address"
                value={tokenOutAddress}
                onChange={e => setTokenOutAddress(e.target.value)}
              />
              {tokenOutInfo && (
                <div className="swap-field__meta">
                  <span>{tokenOutInfo.symbol}</span>
                  <small>Balance: {tokenOutInfo.balance || '0.00'}</small>
                </div>
              )}
            </div>
            <div className="swap-field__amount">
              <span>Estimated output ({tokenOutInfo?.symbol || 'Token'})</span>
              <input type="number" placeholder="0.00" value={amountOut} readOnly />
            </div>
          </div>

          <div className="swap-field swap-field--full">
            <label htmlFor="slippageInput">Slippage tolerance (%)</label>
            <div className="swap-slippage">
              <input
                id="slippageInput"
                type="number"
                min="0"
                step="0.1"
                value={slippage}
                onChange={e => setSlippage(e.target.value)}
                aria-describedby="slippageHelp"
              />
              <div className="swap-slippage__quick">
                {['0.1', '0.5', '1'].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className={`swap-slippage__btn ${slippage === preset ? 'is-active' : ''}`}
                    onClick={() => setSlippage(preset)}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>
            <small id="slippageHelp" className="swap-help-text">
              Adjust based on pool volatility. Higher slippage increases fill chance but may worsen rates.
            </small>
          </div>

          <div className="swap-field swap-field--full">
            <div className="detail-list" aria-live="polite">
              <div className="detail-list__row">
                <span>Price impact</span>
                <strong>{priceImpact.toFixed(2)}%</strong>
              </div>
              <div className="detail-list__row">
                <span>Minimum received</span>
                <strong>
                  {minAmountOut || '0'} {tokenOutInfo?.symbol || ''}
                </strong>
              </div>
              <div className="detail-list__row">
                <span>Swap fee (0.3%)</span>
                <strong>{amountIn ? (parseFloat(amountIn) * 0.003).toFixed(4) : '0.0000'}</strong>
              </div>
            </div>
          </div>

          <div className="swap-actions swap-field--full">
            {!isConnected && (
              <div className="swap-warning" role="status">
                Connect your wallet to swap tokens.
              </div>
            )}

            {needsApproval && (
              <button
                type="button"
                className={`primary-cta primary-cta--buy ${isLoading ? 'is-disabled' : ''}`}
                onClick={handleApprove}
                disabled={isLoading}
              >
                {isLoading ? 'Approving…' : 'Approve token'}
              </button>
            )}

            <button
              type="button"
              className={`primary-cta primary-cta--sell ${isSwapDisabled ? 'is-disabled' : ''}`}
              onClick={handleSwap}
              disabled={isSwapDisabled}
            >
              {isLoading ? 'Swapping…' : 'Swap tokens'}
            </button>
          </div>
        </div>
      ) : (
        <div className="swap-details" aria-live="polite">
          <div className="detail-list">
            <div className="detail-list__row">
              <span>Connected wallet</span>
              <strong>{truncatedWallet || 'Not connected'}</strong>
            </div>
            <div className="detail-list__row">
              <span>Approval required</span>
              <strong>{needsApproval ? 'Yes' : 'No'}</strong>
            </div>
            <div className="detail-list__row">
              <span>Input token</span>
              <strong>{tokenInInfo?.symbol || '—'}</strong>
            </div>
            <div className="detail-list__row">
              <span>Output token</span>
              <strong>{tokenOutInfo?.symbol || '—'}</strong>
            </div>
            <div className="detail-list__row">
              <span>Slippage tolerance</span>
              <strong>{slippage}%</strong>
            </div>
            <div className="detail-list__row">
              <span>Current price impact</span>
              <strong>{priceImpact.toFixed(2)}%</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default SwapPanel;
