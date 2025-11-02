import React, { useState, useEffect, useCallback } from 'react';
import { useDEX } from '../hooks/useDEX';

interface LiquidityPanelProps {
  isConnected: boolean;
  walletAddress: string;
  balance: string;
  onError: (error: string) => void;
  onLoading: (loading: boolean) => void;
  contractAddress?: string;
}

const LiquidityPanel: React.FC<LiquidityPanelProps> = ({
  isConnected,
  walletAddress: _walletAddress,
  balance: _balance,
  onError: _onError,
  onLoading: _onLoading,
  contractAddress = '',
}) => {
  const {
    addLiquidity,
    removeLiquidity,
    getTokenInfo,
    approveToken,
    checkAllowance,
    getPool,
    getUserLiquidity,
    createPool,
    isLoading,
    error,
    setError,
  } = useDEX(contractAddress);

  const [activeTab, setActiveTab] = useState<'add' | 'remove'>('add');
  const [token0Address, setToken0Address] = useState('');
  const [token1Address, setToken1Address] = useState('');
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [liquidityToRemove, setLiquidityToRemove] = useState('');
  const [token0Info, setToken0Info] = useState<any>(null);
  const [token1Info, setToken1Info] = useState<any>(null);
  const [poolInfo, setPoolInfo] = useState<any>(null);
  const [userLiquidity, setUserLiquidity] = useState('0');
  const [needsApproval0, setNeedsApproval0] = useState(false);
  const [needsApproval1, setNeedsApproval1] = useState(false);

  useEffect(() => {
    if (token0Address) {
      getTokenInfo(token0Address).then(setToken0Info);
    } else {
      setToken0Info(null);
    }
  }, [token0Address, getTokenInfo]);

  useEffect(() => {
    if (token1Address) {
      getTokenInfo(token1Address).then(setToken1Info);
    } else {
      setToken1Info(null);
    }
  }, [token1Address, getTokenInfo]);

  const updatePoolInfo = useCallback(async () => {
    if (token0Address && token1Address) {
      const pool = await getPool(token0Address, token1Address);
      setPoolInfo(pool);

      const userLiq = await getUserLiquidity(token0Address, token1Address);
      setUserLiquidity(userLiq || '0');
    } else {
      setPoolInfo(null);
      setUserLiquidity('0');
    }
  }, [token0Address, token1Address, getPool, getUserLiquidity]);

  useEffect(() => {
    updatePoolInfo();
  }, [updatePoolInfo]);

  useEffect(() => {
    const checkApprovals = async () => {
      if (token0Address && amount0 && token0Info && isConnected) {
        const hasAllowance = await checkAllowance(
          token0Address,
          amount0,
          token0Info.decimals
        );
        setNeedsApproval0(!hasAllowance);
      } else {
        setNeedsApproval0(false);
      }

      if (token1Address && amount1 && token1Info && isConnected) {
        const hasAllowance = await checkAllowance(
          token1Address,
          amount1,
          token1Info.decimals
        );
        setNeedsApproval1(!hasAllowance);
      } else {
        setNeedsApproval1(false);
      }
    };

    checkApprovals();
  }, [
    token0Address,
    token1Address,
    amount0,
    amount1,
    token0Info,
    token1Info,
    isConnected,
    checkAllowance,
  ]);

  const handleApprove0 = async () => {
    if (token0Address && amount0 && token0Info) {
      const success = await approveToken(
        token0Address,
        amount0,
        token0Info.decimals
      );
      if (success) {
        setNeedsApproval0(false);
      }
    }
  };

  const handleApprove1 = async () => {
    if (token1Address && amount1 && token1Info) {
      const success = await approveToken(
        token1Address,
        amount1,
        token1Info.decimals
      );
      if (success) {
        setNeedsApproval1(false);
      }
    }
  };

  const handleCreatePool = async () => {
    if (!token0Address || !token1Address) {
      setError('Please enter both token addresses');
      return;
    }

    const result = await createPool(token0Address, token1Address);
    if (result) {
      alert('Pool created successfully!');
      updatePoolInfo();
    }
  };

  const handleAddLiquidity = async () => {
    if (
      !token0Address ||
      !token1Address ||
      !amount0 ||
      !amount1 ||
      !token0Info ||
      !token1Info
    ) {
      setError('Please fill in all fields');
      return;
    }

    const slippageDecimal = 0.005;
    const amount0Min = (parseFloat(amount0) * (1 - slippageDecimal)).toString();
    const amount1Min = (parseFloat(amount1) * (1 - slippageDecimal)).toString();

    const result = await addLiquidity(
      token0Address,
      token1Address,
      amount0,
      amount1,
      amount0Min,
      amount1Min,
      token0Info.decimals,
      token1Info.decimals
    );

    if (result) {
      setAmount0('');
      setAmount1('');
      alert('Liquidity added successfully!');
      updatePoolInfo();
    }
  };

  const handleRemoveLiquidity = async () => {
    if (
      !token0Address ||
      !token1Address ||
      !liquidityToRemove ||
      !token0Info ||
      !token1Info
    ) {
      setError('Please fill in all fields');
      return;
    }

    const amount0Min = '0';
    const amount1Min = '0';

    const result = await removeLiquidity(
      token0Address,
      token1Address,
      liquidityToRemove,
      amount0Min,
      amount1Min,
      token0Info.decimals,
      token1Info.decimals
    );

    if (result) {
      setLiquidityToRemove('');
      alert('Liquidity removed successfully!');
      updatePoolInfo();
    }
  };

  const truncatedWallet = _walletAddress
    ? `${_walletAddress.slice(0, 6)}…${_walletAddress.slice(-4)}`
    : null;

  const tokenPairReady = Boolean(token0Address && token1Address);
  const disableAdd =
    isLoading ||
    !isConnected ||
    !tokenPairReady ||
    !amount0 ||
    !amount1 ||
    needsApproval0 ||
    needsApproval1;
  const disableRemove =
    isLoading || !isConnected || !tokenPairReady || !liquidityToRemove;

  return (
    <section className="atlas-card liquidity-card" aria-busy={isLoading}>
      <header className="liquidity-card__header">
        <div className="liquidity-card__title">
          <h3>Liquidity Management</h3>
          <div className="liquidity-card__meta">
            <span>Wallet: {truncatedWallet || 'Not connected'}</span>
            <span>Balance: {_balance || '0.00'}</span>
          </div>
        </div>
        <div className="segmented-control" role="tablist" aria-label="Liquidity actions">
          {(['add', 'remove'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`segmented-control__button ${activeTab === tab ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'add' ? 'Add' : 'Remove'}
            </button>
          ))}
        </div>
      </header>

      {!isConnected && (
        <div className="swap-warning" role="status">
          Connect your wallet to manage liquidity.
        </div>
      )}

      {error && (
        <div className="form-errors" role="alert">
          <div className="form-errors__item">{error}</div>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      <div className="liquidity-grid">
        <div className="liquidity-field">
          <label htmlFor="token0Address">Token 0 address</label>
          <input
            id="token0Address"
            type="text"
            placeholder="0x..."
            value={token0Address}
            onChange={e => setToken0Address(e.target.value)}
          />
          {token0Info && (
            <div className="liquidity-field__meta">
              <span>{token0Info.symbol}</span>
              <small>Balance: {parseFloat(token0Info.balance).toFixed(4)}</small>
            </div>
          )}
        </div>
        <div className="liquidity-field">
          <label htmlFor="token1Address">Token 1 address</label>
          <input
            id="token1Address"
            type="text"
            placeholder="0x..."
            value={token1Address}
            onChange={e => setToken1Address(e.target.value)}
          />
          {token1Info && (
            <div className="liquidity-field__meta">
              <span>{token1Info.symbol}</span>
              <small>Balance: {parseFloat(token1Info.balance).toFixed(4)}</small>
            </div>
          )}
        </div>
      </div>

      {tokenPairReady && (
        <div className="detail-list" aria-live="polite">
          {poolInfo ? (
            <>
              <div className="detail-list__row">
                <span>Reserve {token0Info?.symbol || 'Token 0'}</span>
                <strong>{parseFloat(poolInfo.reserve0).toFixed(4)}</strong>
              </div>
              <div className="detail-list__row">
                <span>Reserve {token1Info?.symbol || 'Token 1'}</span>
                <strong>{parseFloat(poolInfo.reserve1).toFixed(4)}</strong>
              </div>
              <div className="detail-list__row">
                <span>Total liquidity</span>
                <strong>{parseFloat(poolInfo.totalLiquidity).toFixed(4)}</strong>
              </div>
              <div className="detail-list__row">
                <span>Your position</span>
                <strong>{parseFloat(userLiquidity).toFixed(4)}</strong>
              </div>
            </>
          ) : (
            <div className="detail-list__row">
              <span>Pool status</span>
              <strong>Not created</strong>
            </div>
          )}
        </div>
      )}

      {tokenPairReady && !poolInfo && (
        <button
          type="button"
          className={`primary-cta primary-cta--buy ${isLoading ? 'is-disabled' : ''}`}
          onClick={handleCreatePool}
          disabled={isLoading}
        >
          {isLoading ? 'Creating…' : 'Create pool'}
        </button>
      )}

      {activeTab === 'add' ? (
        <div className="liquidity-form">
          <div className="liquidity-form__grid">
            <div className="form-group">
              <label htmlFor="amount0Input">Amount {token0Info?.symbol || 'Token 0'}</label>
              <input
                id="amount0Input"
                type="number"
                placeholder="0.00"
                value={amount0}
                onChange={e => setAmount0(e.target.value)}
                min="0"
              />
            </div>
            <div className="form-group">
              <label htmlFor="amount1Input">Amount {token1Info?.symbol || 'Token 1'}</label>
              <input
                id="amount1Input"
                type="number"
                placeholder="0.00"
                value={amount1}
                onChange={e => setAmount1(e.target.value)}
                min="0"
              />
            </div>
          </div>

          <div className="swap-actions">
            {needsApproval0 && (
              <button
                type="button"
                className={`primary-cta primary-cta--buy ${isLoading ? 'is-disabled' : ''}`}
                onClick={handleApprove0}
                disabled={isLoading || !token0Address || !amount0}
              >
                {isLoading ? 'Approving…' : `Approve ${token0Info?.symbol || 'Token 0'}`}
              </button>
            )}

            {needsApproval1 && (
              <button
                type="button"
                className={`primary-cta primary-cta--buy ${isLoading ? 'is-disabled' : ''}`}
                onClick={handleApprove1}
                disabled={isLoading || !token1Address || !amount1}
              >
                {isLoading ? 'Approving…' : `Approve ${token1Info?.symbol || 'Token 1'}`}
              </button>
            )}

            <button
              type="button"
              className={`primary-cta primary-cta--sell ${disableAdd ? 'is-disabled' : ''}`}
              onClick={handleAddLiquidity}
              disabled={disableAdd}
            >
              {isLoading ? 'Adding…' : 'Add liquidity'}
            </button>
          </div>
        </div>
      ) : (
        <div className="liquidity-form">
          <div className="form-group">
            <label htmlFor="liquidityAmount">Liquidity to remove</label>
            <input
              id="liquidityAmount"
              type="number"
              placeholder="0.00"
              value={liquidityToRemove}
              onChange={e => setLiquidityToRemove(e.target.value)}
              min="0"
            />
          </div>
          <button
            type="button"
            className={`primary-cta primary-cta--sell ${disableRemove ? 'is-disabled' : ''}`}
            onClick={handleRemoveLiquidity}
            disabled={disableRemove}
          >
            {isLoading ? 'Removing…' : 'Remove liquidity'}
          </button>
        </div>
      )}
    </section>
  );
}
;

export default LiquidityPanel;
