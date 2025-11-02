import React, { useState, useEffect, useCallback } from 'react';
import { useDEX } from '../hooks/useDEX';
import { dexMath } from '../utils/dexMath';
import { validation } from '../utils/validation';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Skeleton } from './ui/Skeleton';
import { EmptyState, NoConnectionEmptyState } from './ui/EmptyState';
import { useToast } from './ui/Toast';
import '../styles/swap-panel-enhanced.css';

interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  balance: string;
  name?: string;
  logoURI?: string;
}

interface SwapPanelEnhancedProps {
  isConnected: boolean;
  walletAddress: string;
  balance: string;
  onError?: (error: string) => void;
  onLoading?: (loading: boolean) => void;
  onConnect?: () => void;
  contractAddress?: string;
}

/**
 * Enhanced SwapPanel with improved UI/UX following Atlassian Design System
 * - Better loading states with skeletons
 * - Clear error handling with toast notifications
 * - Accessible form inputs with validation
 * - Progressive disclosure of details
 * - Empty states for better guidance
 */
const SwapPanelEnhanced: React.FC<SwapPanelEnhancedProps> = ({
  isConnected,
  walletAddress,
  balance,
  onError,
  onLoading,
  onConnect,
  contractAddress = '',
}) => {
  const toast = useToast();
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
  const [showDetails, setShowDetails] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Sync with parent onLoading
  useEffect(() => {
    onLoading?.(isLoading || loadingTokens);
  }, [isLoading, loadingTokens, onLoading]);

  // Sync with parent onError
  useEffect(() => {
    if (error) {
      onError?.(error);
      toast.error(error);
    }
  }, [error, onError, toast]);

  const loadTokenInfo = useCallback(
    async (address: string, setter: Function) => {
      if (address) {
        setLoadingTokens(true);
        try {
          const info = await getTokenInfo(address);
          setter(info);
          setValidationErrors(prev => ({ ...prev, [`token-${address}`]: '' }));
        } catch (error) {
          toast.error('Failed to load token information');
          setter(null);
          setValidationErrors(prev => ({
            ...prev,
            [`token-${address}`]: 'Invalid token address'
          }));
        } finally {
          setLoadingTokens(false);
        }
      } else {
        setter(null);
      }
    },
    [getTokenInfo, toast]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tokenInAddress) loadTokenInfo(tokenInAddress, setTokenInInfo);
    }, 500);
    return () => clearTimeout(timer);
  }, [tokenInAddress, loadTokenInfo]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tokenOutAddress) loadTokenInfo(tokenOutAddress, setTokenOutInfo);
    }, 500);
    return () => clearTimeout(timer);
  }, [tokenOutAddress, loadTokenInfo]);

  const validateAmount = (value: string): string | null => {
    if (!value) return 'Amount is required';
    if (!validation.isValidAmount(value)) return 'Invalid amount';
    if (parseFloat(value) <= 0) return 'Amount must be greater than 0';
    return null;
  };

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

        const inputAmount = parseFloat(amountIn);
        const slippageNum = parseFloat(slippage);
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
        toast.success('Token approved successfully');
      }
    }
  };

  const handleSwap = async () => {
    // Validate inputs
    const errors: Record<string, string> = {};

    if (!tokenInAddress) errors.tokenIn = 'From token is required';
    if (!tokenOutAddress) errors.tokenOut = 'To token is required';

    const amountError = validateAmount(amountIn);
    if (amountError) errors.amount = amountError;

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error('Please fix the form errors');
      return;
    }

    if (!tokenInInfo || !tokenOutInfo) {
      toast.error('Please wait for token information to load');
      return;
    }

    const slippageDecimal = parseFloat(slippage) / 100;
    const minAmountOutCalc = (
      parseFloat(amountOut) *
      (1 - slippageDecimal)
    ).toString();

    const result = await swap(
      tokenInAddress,
      tokenOutAddress,
      amountIn,
      minAmountOutCalc,
      tokenInInfo.decimals,
      tokenOutInfo.decimals
    );

    if (result) {
      setAmountIn('');
      setAmountOut('');
      setValidationErrors({});
      toast.success(`Swap successful! Received ${result} ${tokenOutInfo.symbol}`);
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

  const getPriceImpactColor = () => {
    if (priceImpact < 1) return 'var(--success-500)';
    if (priceImpact < 3) return 'var(--warning-500)';
    return 'var(--danger-500)';
  };

  if (!isConnected) {
    return (
      <div className="swap-panel-enhanced">
        <NoConnectionEmptyState onConnect={onConnect} />
      </div>
    );
  }

  return (
    <div className="swap-panel-enhanced">
      <header className="swap-panel-enhanced__header">
        <div>
          <h2 className="swap-panel-enhanced__title">Token Swap</h2>
          <p className="swap-panel-enhanced__subtitle">
            Exchange tokens instantly with optimal rates
          </p>
        </div>
      </header>

      <div className="swap-panel-enhanced__body">
        {loadingTokens ? (
          <div className="swap-panel-enhanced__loading">
            <Skeleton variant="rect" height={120} />
            <Skeleton variant="rect" height={48} />
            <Skeleton variant="rect" height={120} />
          </div>
        ) : (
          <>
            {/* From Token */}
            <div className="swap-field-group">
              <label className="swap-field-group__label">From</label>
              <div className="swap-field-card">
                <Input
                  placeholder="Token address (0x...)"
                  value={tokenInAddress}
                  onChange={(e) => setTokenInAddress(e.target.value)}
                  error={validationErrors.tokenIn || validationErrors[`token-${tokenInAddress}`]}
                  fullWidth
                />

                {tokenInInfo && (
                  <div className="token-info">
                    <span className="token-info__symbol">{tokenInInfo.symbol}</span>
                    <span className="token-info__balance">
                      Balance: {tokenInInfo.balance || '0.00'}
                    </span>
                  </div>
                )}

                <Input
                  type="number"
                  placeholder="0.00"
                  value={amountIn}
                  onChange={(e) => {
                    setAmountIn(e.target.value);
                    const error = validateAmount(e.target.value);
                    setValidationErrors(prev => ({ ...prev, amount: error || '' }));
                  }}
                  error={validationErrors.amount}
                  fullWidth
                  inputSize="lg"
                />
              </div>
            </div>

            {/* Swap Direction Button */}
            <div className="swap-direction">
              <button
                type="button"
                className="swap-direction__button"
                onClick={swapTokens}
                aria-label="Swap token direction"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 10l5 5 5-5M7 14l5-5 5 5" />
                </svg>
              </button>
            </div>

            {/* To Token */}
            <div className="swap-field-group">
              <label className="swap-field-group__label">To</label>
              <div className="swap-field-card">
                <Input
                  placeholder="Token address (0x...)"
                  value={tokenOutAddress}
                  onChange={(e) => setTokenOutAddress(e.target.value)}
                  error={validationErrors.tokenOut || validationErrors[`token-${tokenOutAddress}`]}
                  fullWidth
                />

                {tokenOutInfo && (
                  <div className="token-info">
                    <span className="token-info__symbol">{tokenOutInfo.symbol}</span>
                    <span className="token-info__balance">
                      Balance: {tokenOutInfo.balance || '0.00'}
                    </span>
                  </div>
                )}

                <Input
                  type="number"
                  placeholder="0.00"
                  value={amountOut}
                  readOnly
                  fullWidth
                  inputSize="lg"
                  helperText="Estimated output"
                />
              </div>
            </div>

            {/* Slippage Settings */}
            <div className="slippage-section">
              <div className="slippage-section__header">
                <label htmlFor="slippage">Slippage tolerance</label>
                <span className="slippage-section__value">{slippage}%</span>
              </div>
              <div className="slippage-presets">
                {['0.1', '0.5', '1.0', '2.0'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`slippage-preset ${slippage === preset ? 'slippage-preset--active' : ''}`}
                    onClick={() => setSlippage(preset)}
                  >
                    {preset}%
                  </button>
                ))}
                <Input
                  id="slippage"
                  type="number"
                  min="0"
                  step="0.1"
                  max="50"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  inputSize="sm"
                  helperText="Custom"
                />
              </div>
            </div>

            {/* Progressive Disclosure - Details */}
            {amountIn && amountOut && (
              <div className="swap-details">
                <button
                  type="button"
                  className="swap-details__toggle"
                  onClick={() => setShowDetails(!showDetails)}
                  aria-expanded={showDetails}
                >
                  <span>Transaction Details</span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={showDetails ? 'swap-details__icon--rotated' : ''}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {showDetails && (
                  <div className="swap-details__content">
                    <div className="swap-details__row">
                      <span>Price Impact</span>
                      <strong style={{ color: getPriceImpactColor() }}>
                        {priceImpact.toFixed(2)}%
                      </strong>
                    </div>
                    <div className="swap-details__row">
                      <span>Minimum Received</span>
                      <strong>
                        {minAmountOut || '0'} {tokenOutInfo?.symbol || ''}
                      </strong>
                    </div>
                    <div className="swap-details__row">
                      <span>Swap Fee (0.3%)</span>
                      <strong>
                        {amountIn ? (parseFloat(amountIn) * 0.003).toFixed(4) : '0.0000'}
                      </strong>
                    </div>
                    <div className="swap-details__row">
                      <span>Route</span>
                      <strong>
                        {tokenInInfo?.symbol} → {tokenOutInfo?.symbol}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="swap-panel-enhanced__footer">
        {needsApproval && (
          <Button
            variant="secondary"
            fullWidth
            isLoading={isLoading}
            onClick={handleApprove}
          >
            Approve {tokenInInfo?.symbol}
          </Button>
        )}

        <Button
          variant={needsApproval ? 'secondary' : 'primary'}
          fullWidth
          isLoading={isLoading}
          disabled={!isConnected || !amountIn || !tokenInAddress || !tokenOutAddress || isLoading}
          onClick={handleSwap}
        >
          {isLoading ? 'Swapping...' : 'Swap Tokens'}
        </Button>
      </footer>
    </div>
  );
};

export default SwapPanelEnhanced;
